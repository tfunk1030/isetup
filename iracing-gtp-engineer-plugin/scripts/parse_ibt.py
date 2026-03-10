#!/usr/bin/env python3
"""
iRacing IBT Telemetry Parser - Standalone CLI Tool.
Extract setup, lap times, and telemetry data from IBT binary files.

Usage:
    python parse_ibt.py path/to/file.ibt [--laps] [--setup] [--channels]
        [--csv CHANNEL1,CHANNEL2] [--csv-out output.csv] [--stride 10] [--json]

Notes:
- CSV channel specs support array indexing with CHANNEL[index], for example:
    WheelVertForce[0], WheelVertForce[1]
"""

import argparse
import csv
import json
import os
import re
import struct
import sys

try:
    import yaml
    HAS_YAML = True
except ImportError:
    HAS_YAML = False

try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False


TYPE_MAP = {
    0: ('c', 1, 'char'),
    1: ('?', 1, 'bool'),
    2: ('i', 4, 'int'),
    3: ('I', 4, 'bitfield'),
    4: ('f', 4, 'float'),
    5: ('d', 8, 'double'),
}

NUMPY_DTYPE_MAP = {
    0: 'S1',
    1: '?',
    2: '<i4',
    3: '<u4',
    4: '<f4',
    5: '<f8',
}

CHANNEL_SPEC_RE = re.compile(r'^([A-Za-z0-9_]+)(?:\[(\d+)\])?$')


def parse_ibt(path):
    """Parse iRacing IBT file.

    Returns:
        tuple: (session_info_dict_or_str, var_lookup, raw_data, record_count, tick_rate, buf_len)
    """
    with open(path, 'rb') as f:
        raw_header = f.read(144)
        if len(raw_header) < 144:
            raise ValueError('Invalid IBT file: header is too small (expected at least 144 bytes).')

        tick_rate = struct.unpack_from('i', raw_header, 8)[0]
        sinfo_len = struct.unpack_from('i', raw_header, 16)[0]
        sinfo_off = struct.unpack_from('i', raw_header, 20)[0]
        num_vars = struct.unpack_from('i', raw_header, 24)[0]
        var_hdr_off = struct.unpack_from('i', raw_header, 28)[0]
        buf_len = struct.unpack_from('i', raw_header, 36)[0]
        buf_offset = struct.unpack_from('i', raw_header, 52)[0]
        record_count = struct.unpack_from('i', raw_header, 140)[0]

        if tick_rate <= 0:
            raise ValueError(f'Invalid tick rate in IBT header: {tick_rate}')
        if num_vars <= 0:
            raise ValueError(f'Invalid variable count in IBT header: {num_vars}')
        if buf_len <= 0:
            raise ValueError(f'Invalid buffer length in IBT header: {buf_len}')
        if record_count < 0:
            raise ValueError(f'Invalid record count in IBT header: {record_count}')

        # Parse session info
        f.seek(sinfo_off)
        sinfo_raw = f.read(sinfo_len)
        sinfo_str = sinfo_raw.decode('latin-1', errors='replace').rstrip('\x00')
        if HAS_YAML:
            try:
                session_info = yaml.safe_load(sinfo_str)
            except Exception:
                # Keep raw text if YAML parsing fails.
                session_info = sinfo_str
        else:
            session_info = sinfo_str

        # Parse variable headers
        f.seek(var_hdr_off)
        var_lookup = {}
        for _ in range(num_vars):
            vtype = struct.unpack('i', f.read(4))[0]
            voffset = struct.unpack('i', f.read(4))[0]
            vcount = struct.unpack('i', f.read(4))[0]
            f.read(4)  # countAsTime + padding
            vname = f.read(32).decode('latin-1').rstrip('\x00')
            vdesc = f.read(64).decode('latin-1').rstrip('\x00')
            vunit = f.read(32).decode('latin-1').rstrip('\x00')
            var_lookup[vname] = {
                'type': vtype,
                'offset': voffset,
                'count': max(1, int(vcount)),
                'unit': vunit,
                'desc': vdesc,
            }

        # Read data buffer
        f.seek(buf_offset)
        expected_len = buf_len * record_count
        raw_data = f.read(expected_len)
        if len(raw_data) < expected_len:
            raise ValueError(
                f'IBT data buffer truncated: expected {expected_len} bytes, got {len(raw_data)} bytes.'
            )

    return session_info, var_lookup, raw_data, record_count, tick_rate, buf_len


def _to_native_scalar(value):
    """Convert numpy/bytes scalars into plain Python values."""
    if HAS_NUMPY and isinstance(value, np.generic):
        value = value.item()
    if isinstance(value, (bytes, bytearray)):
        return value.decode('latin-1', errors='replace').rstrip('\x00')
    return value


def parse_channel_spec(spec):
    """Parse CHANNEL or CHANNEL[index] syntax."""
    clean = spec.strip()
    match = CHANNEL_SPEC_RE.match(clean)
    if not match:
        raise ValueError(f"Invalid channel spec '{spec}'. Expected CHANNEL or CHANNEL[index].")
    name = match.group(1)
    index = int(match.group(2)) if match.group(2) is not None else None
    return name, index


def read_channel(name, var_lookup, raw_data, record_count, buf_len, index=0):
    """Read one channel (and optional array index) as list or numpy array."""
    if name not in var_lookup:
        return None

    v = var_lookup[name]
    if v['type'] not in TYPE_MAP:
        return None

    count = v['count']
    if index < 0 or index >= count:
        return None

    fmt_char, fmt_size, _ = TYPE_MAP[v['type']]

    if HAS_NUMPY and v['type'] in NUMPY_DTYPE_MAP:
        try:
            np_dtype = np.dtype(NUMPY_DTYPE_MAP[v['type']])
            if count == 1:
                arr = np.ndarray(
                    shape=(record_count,),
                    dtype=np_dtype,
                    buffer=raw_data,
                    offset=v['offset'],
                    strides=(buf_len,),
                )
                return arr.copy()

            arr = np.ndarray(
                shape=(record_count, count),
                dtype=np_dtype,
                buffer=raw_data,
                offset=v['offset'],
                strides=(buf_len, np_dtype.itemsize),
            )
            return arr[:, index].copy()
        except Exception:
            # Fall back to struct loop below.
            pass

    # Struct fallback path.
    arr = []
    for i in range(record_count):
        base_offset = i * buf_len + v['offset'] + index * fmt_size
        val = struct.unpack_from(fmt_char, raw_data, base_offset)[0]
        arr.append(val)
    return arr


def extract_laps(var_lookup, raw_data, record_count, tick_rate, buf_len):
    """Extract lap-by-lap timing data."""
    lap_data = read_channel('Lap', var_lookup, raw_data, record_count, buf_len)
    lap_time = read_channel('LapCurrentLapTime', var_lookup, raw_data, record_count, buf_len)
    fuel = read_channel('FuelLevel', var_lookup, raw_data, record_count, buf_len)

    if lap_data is None or lap_time is None or record_count == 0:
        return []

    laps = []
    current_lap = int(lap_data[0])
    lap_start_fuel = float(fuel[0]) if fuel is not None else None

    for i in range(1, record_count):
        new_lap = int(lap_data[i])
        if new_lap != current_lap:
            lt = float(lap_time[i - 1])
            lap_info = {'lap': current_lap, 'time': round(lt, 3)}
            if fuel is not None and lap_start_fuel is not None:
                fuel_now = float(fuel[i - 1])
                fuel_used = lap_start_fuel - fuel_now
                lap_info['fuel_used_L'] = round(fuel_used, 3)
                lap_start_fuel = float(fuel[i])
            laps.append(lap_info)
            current_lap = new_lap

    return laps


def get_setup_payload(session_info):
    """Return setup as dict (if YAML loaded) or extracted text block."""
    if isinstance(session_info, dict):
        return session_info.get('CarSetup', {})

    lines = session_info.split('\n')
    in_setup = False
    setup_lines = []
    for line in lines:
        if line.startswith('CarSetup:'):
            in_setup = True
        elif in_setup and line and not line.startswith(' ') and not line.startswith('\t'):
            break
        if in_setup:
            setup_lines.append(line)
    return '\n'.join(setup_lines)


def print_setup(session_info):
    """Print the CarSetup section."""
    setup_payload = get_setup_payload(session_info)
    if isinstance(setup_payload, dict):
        print(json.dumps(setup_payload, indent=2, default=str))
    else:
        print(setup_payload)


def list_channel_metadata(var_lookup):
    """Return sorted channel metadata list for text/json output."""
    channels = []
    for name in sorted(var_lookup.keys()):
        v = var_lookup[name]
        tname = TYPE_MAP.get(v['type'], ('?', 0, 'unknown'))[2]
        channels.append({
            'name': name,
            'type': tname,
            'unit': v['unit'],
            'count': v['count'],
            'description': v['desc'],
        })
    return channels


def print_channels(var_lookup):
    """List all available telemetry channels."""
    print(f"\n{'Channel':<30} {'Type':<8} {'Unit':<15} {'Count':<6} Description")
    print('-' * 100)
    for ch in list_channel_metadata(var_lookup):
        print(f"{ch['name']:<30} {ch['type']:<8} {ch['unit']:<15} {ch['count']:<6} {ch['description'][:40]}")


def get_session_context(session_info):
    """Extract key context fields for summary/json output."""
    if not isinstance(session_info, dict):
        return {}

    wi = session_info.get('WeekendInfo', {})
    di = session_info.get('DriverInfo', {})
    car_idx = di.get('DriverCarIdx', -1)

    driver_name = None
    car_name = None
    for d in di.get('Drivers', []):
        if d.get('CarIdx') == car_idx and not d.get('CarIsPaceCar'):
            driver_name = d.get('UserName')
            car_name = d.get('CarScreenName')
            break

    return {
        'track_display_name': wi.get('TrackDisplayName'),
        'track_config_name': wi.get('TrackConfigName'),
        'track_surface_temp': wi.get('TrackSurfaceTemp'),
        'driver_name': driver_name,
        'car_name': car_name,
    }


def _resolve_csv_channels(channel_specs, var_lookup):
    """Resolve CSV channel specs into channel/index tuples."""
    resolved = []
    missing = []
    warnings = []

    for spec in channel_specs:
        try:
            name, index = parse_channel_spec(spec)
        except ValueError as exc:
            missing.append(str(exc))
            continue

        meta = var_lookup.get(name)
        if meta is None:
            missing.append(name)
            continue

        if index is None:
            if meta['count'] > 1:
                index = 0
                warnings.append(
                    f"Channel '{name}' has count={meta['count']}; defaulting to {name}[0]."
                )
            else:
                index = 0

        if index < 0 or index >= meta['count']:
            missing.append(f"{name}[{index}]")
            continue

        label = f"{name}[{index}]" if meta['count'] > 1 else name
        resolved.append({'label': label, 'name': name, 'index': index})

    return resolved, missing, warnings


def export_csv(
    ibt_file,
    csv_specs,
    csv_out,
    stride,
    var_lookup,
    raw_data,
    record_count,
    buf_len,
):
    """Export selected channels to CSV and return export metadata."""
    resolved, missing, warnings = _resolve_csv_channels(csv_specs, var_lookup)

    channels = []
    for item in resolved:
        data = read_channel(
            item['name'],
            var_lookup,
            raw_data,
            record_count,
            buf_len,
            index=item['index'],
        )
        channels.append({'label': item['label'], 'data': data})

    if csv_out:
        out_file = csv_out
    else:
        base, _ = os.path.splitext(ibt_file)
        out_file = f'{base}_export.csv'

    rows_written = 0
    with open(out_file, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow([c['label'] for c in channels])

        for i in range(0, record_count, stride):
            row = []
            for ch in channels:
                data = ch['data']
                if data is None:
                    row.append('')
                else:
                    row.append(_to_native_scalar(data[i]))
            writer.writerow(row)
            rows_written += 1

    return {
        'path': out_file,
        'channels_requested': len(csv_specs),
        'channels_exported': len(channels),
        'rows_written': rows_written,
        'stride': stride,
        'missing': missing,
        'warnings': warnings,
    }


def _best_lap(laps):
    valid = [l for l in laps if l['lap'] > 0 and l['time'] > 30]
    return min(valid, key=lambda x: x['time']) if valid else None


def main():
    parser = argparse.ArgumentParser(description='iRacing IBT Telemetry Parser')
    parser.add_argument('ibt_file', help='Path to .ibt file')
    parser.add_argument('--laps', action='store_true', help='Show lap times')
    parser.add_argument('--setup', action='store_true', help='Show car setup')
    parser.add_argument('--channels', action='store_true', help='List all telemetry channels')
    parser.add_argument(
        '--csv',
        type=str,
        help='Export channels to CSV (comma-separated channel names; supports CHANNEL[index])',
    )
    parser.add_argument('--csv-out', type=str, help='CSV output file path')
    parser.add_argument('--stride', type=int, default=1, help='Sample every N rows during CSV export')
    parser.add_argument('--summary', action='store_true', help='Show session summary')
    parser.add_argument('--json', action='store_true', help='Emit machine-readable JSON output')
    args = parser.parse_args()

    if not os.path.exists(args.ibt_file):
        print(f'Error: File not found: {args.ibt_file}', file=sys.stderr)
        sys.exit(1)

    if args.stride < 1:
        print('Error: --stride must be >= 1', file=sys.stderr)
        sys.exit(1)

    try:
        session_info, var_lookup, raw_data, record_count, tick_rate, buf_len = parse_ibt(args.ibt_file)
    except Exception as exc:
        print(f'Error parsing IBT: {exc}', file=sys.stderr)
        sys.exit(1)

    # Default behavior: show summary when no explicit output sections are requested.
    if not any([args.laps, args.setup, args.channels, args.csv]):
        args.summary = True

    file_size_bytes = os.path.getsize(args.ibt_file)
    session_context = get_session_context(session_info)

    laps = None
    if args.summary or args.laps:
        laps = extract_laps(var_lookup, raw_data, record_count, tick_rate, buf_len)

    export_info = None
    if args.csv:
        csv_specs = [c.strip() for c in args.csv.split(',') if c.strip()]
        export_info = export_csv(
            args.ibt_file,
            csv_specs,
            args.csv_out,
            args.stride,
            var_lookup,
            raw_data,
            record_count,
            buf_len,
        )

    if args.json:
        payload = {
            'file': {
                'path': args.ibt_file,
                'size_bytes': file_size_bytes,
                'size_mb': round(file_size_bytes / 1024 / 1024, 3),
                'channels': len(var_lookup),
                'samples': record_count,
                'tick_rate_hz': tick_rate,
                'duration_seconds': round(record_count / tick_rate, 3),
            },
            'session': session_context,
        }

        if laps is not None:
            payload['laps'] = laps
            best = _best_lap(laps)
            payload['best_lap'] = best

        if args.setup:
            payload['setup'] = get_setup_payload(session_info)

        if args.channels:
            payload['channels'] = list_channel_metadata(var_lookup)

        if export_info is not None:
            payload['csv_export'] = export_info

        print(json.dumps(payload, indent=2, default=str))
        return

    # Text output mode
    print(f'Parsing: {args.ibt_file}')
    print(f'File size: {file_size_bytes / 1024 / 1024:.1f} MB')
    print(f'Channels: {len(var_lookup)}')
    print(f'Samples: {record_count:,} @ {tick_rate} Hz = {record_count / tick_rate:.1f}s')

    if args.summary or args.laps:
        if session_context:
            print(
                f"\nTrack: {session_context.get('track_display_name', '?')} - "
                f"{session_context.get('track_config_name', '?')}"
            )
            print(f"Surface temp: {session_context.get('track_surface_temp', '?')}")
            if session_context.get('driver_name') or session_context.get('car_name'):
                print(
                    f"Driver: {session_context.get('driver_name', '?')} - "
                    f"{session_context.get('car_name', '?')}"
                )

        print('\n--- Lap Times ---')
        if laps:
            for lap in laps:
                fuel_str = f"  fuel: {lap['fuel_used_L']:.2f}L" if 'fuel_used_L' in lap else ''
                mins = int(lap['time']) // 60
                secs = lap['time'] - mins * 60
                print(f"  Lap {lap['lap']:>3}: {mins}:{secs:06.3f}{fuel_str}")

            best = _best_lap(laps)
            if best:
                mins = int(best['time']) // 60
                secs = best['time'] - mins * 60
                print(f"\n  Best: Lap {best['lap']} - {mins}:{secs:06.3f}")
        else:
            print('  No complete laps found.')

    if args.setup:
        print('\n--- Car Setup ---')
        print_setup(session_info)

    if args.channels:
        print_channels(var_lookup)

    if export_info is not None:
        print(
            f"\nExported {export_info['channels_exported']}/{export_info['channels_requested']} "
            f"channels to {export_info['path']}"
        )
        if export_info['missing']:
            print(f"  Missing: {export_info['missing']}")
        if export_info['warnings']:
            for warning in export_info['warnings']:
                print(f'  Warning: {warning}')
        print(f"  Wrote {export_info['rows_written']:,} rows (stride={export_info['stride']}).")


if __name__ == '__main__':
    main()
