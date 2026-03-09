#!/usr/bin/env python3
"""
iRacing IBT Telemetry Parser — Standalone CLI Tool
Extracts setup, lap times, and telemetry data from IBT binary files.

Usage:
    python parse_ibt.py path/to/file.ibt [--laps] [--setup] [--channels] [--csv CHANNEL1,CHANNEL2]
"""

import struct
import sys
import os
import argparse
import json

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


def parse_ibt(path):
    """Parse iRacing IBT file. Returns (session_info_dict_or_str, var_lookup, raw_data, record_count, tick_rate, buf_len)."""
    with open(path, 'rb') as f:
        raw_header = f.read(144)

        tick_rate = struct.unpack_from('i', raw_header, 8)[0]
        sinfo_len = struct.unpack_from('i', raw_header, 16)[0]
        sinfo_off = struct.unpack_from('i', raw_header, 20)[0]
        num_vars = struct.unpack_from('i', raw_header, 24)[0]
        var_hdr_off = struct.unpack_from('i', raw_header, 28)[0]
        buf_len = struct.unpack_from('i', raw_header, 36)[0]
        buf_offset = struct.unpack_from('i', raw_header, 52)[0]
        record_count = struct.unpack_from('i', raw_header, 140)[0]

        # Parse session info
        f.seek(sinfo_off)
        sinfo_str = f.read(sinfo_len).decode('latin-1').rstrip('\x00')
        if HAS_YAML:
            session_info = yaml.safe_load(sinfo_str)
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
                'type': vtype, 'offset': voffset,
                'count': vcount, 'unit': vunit, 'desc': vdesc
            }

        # Read data buffer
        f.seek(buf_offset)
        raw_data = f.read(buf_len * record_count)

    return session_info, var_lookup, raw_data, record_count, tick_rate, buf_len


def read_channel(name, var_lookup, raw_data, record_count, buf_len):
    """Read a single channel as a list (or numpy array if available)."""
    if name not in var_lookup:
        return None
    v = var_lookup[name]
    fmt_char, fmt_size, _ = TYPE_MAP[v['type']]

    if HAS_NUMPY:
        arr = np.zeros(record_count)
        for i in range(record_count):
            arr[i] = struct.unpack_from(fmt_char, raw_data, i * buf_len + v['offset'])[0]
        return arr
    else:
        arr = []
        for i in range(record_count):
            val = struct.unpack_from(fmt_char, raw_data, i * buf_len + v['offset'])[0]
            arr.append(val)
        return arr


def extract_laps(var_lookup, raw_data, record_count, tick_rate, buf_len):
    """Extract lap-by-lap timing data."""
    lap_data = read_channel('Lap', var_lookup, raw_data, record_count, buf_len)
    lap_time = read_channel('LapCurrentLapTime', var_lookup, raw_data, record_count, buf_len)
    fuel = read_channel('FuelLevel', var_lookup, raw_data, record_count, buf_len)

    if lap_data is None or lap_time is None:
        return []

    laps = []
    current_lap = int(lap_data[0])
    lap_start_fuel = fuel[0] if fuel is not None else None

    for i in range(1, record_count):
        new_lap = int(lap_data[i])
        if new_lap != current_lap:
            lt = lap_time[i - 1]
            lap_info = {'lap': current_lap, 'time': round(float(lt), 3)}
            if fuel is not None:
                fuel_used = float(lap_start_fuel - fuel[i - 1])
                lap_info['fuel_used_L'] = round(fuel_used, 3)
                lap_start_fuel = fuel[i]
            laps.append(lap_info)
            current_lap = new_lap

    return laps


def print_setup(session_info):
    """Print the CarSetup section."""
    if isinstance(session_info, dict):
        setup = session_info.get('CarSetup', {})
        print(json.dumps(setup, indent=2, default=str))
    else:
        # Raw text — find CarSetup section
        lines = session_info.split('\n')
        in_setup = False
        for line in lines:
            if line.startswith('CarSetup:'):
                in_setup = True
            elif in_setup and line and not line.startswith(' ') and not line.startswith('\t'):
                break
            if in_setup:
                print(line)


def print_channels(var_lookup):
    """List all available telemetry channels."""
    print(f"\n{'Channel':<30} {'Type':<8} {'Unit':<15} Description")
    print("-" * 90)
    for name in sorted(var_lookup.keys()):
        v = var_lookup[name]
        tname = TYPE_MAP.get(v['type'], ('?', 0, 'unknown'))[2]
        print(f"{name:<30} {tname:<8} {v['unit']:<15} {v['desc'][:40]}")


def main():
    parser = argparse.ArgumentParser(description='iRacing IBT Telemetry Parser')
    parser.add_argument('ibt_file', help='Path to .ibt file')
    parser.add_argument('--laps', action='store_true', help='Show lap times')
    parser.add_argument('--setup', action='store_true', help='Show car setup')
    parser.add_argument('--channels', action='store_true', help='List all telemetry channels')
    parser.add_argument('--csv', type=str, help='Export channels to CSV (comma-separated channel names)')
    parser.add_argument('--summary', action='store_true', help='Show session summary')
    args = parser.parse_args()

    if not os.path.exists(args.ibt_file):
        print(f"Error: File not found: {args.ibt_file}", file=sys.stderr)
        sys.exit(1)

    print(f"Parsing: {args.ibt_file}")
    print(f"File size: {os.path.getsize(args.ibt_file) / 1024 / 1024:.1f} MB")

    session_info, var_lookup, raw_data, record_count, tick_rate, buf_len = parse_ibt(args.ibt_file)

    print(f"Channels: {len(var_lookup)}")
    print(f"Samples: {record_count:,} @ {tick_rate} Hz = {record_count / tick_rate:.1f}s")

    # Default: show summary if no flags
    if not any([args.laps, args.setup, args.channels, args.csv]):
        args.summary = True

    if args.summary or args.laps:
        if isinstance(session_info, dict):
            wi = session_info.get('WeekendInfo', {})
            print(f"\nTrack: {wi.get('TrackDisplayName', '?')} — {wi.get('TrackConfigName', '?')}")
            print(f"Surface temp: {wi.get('TrackSurfaceTemp', '?')}")
            di = session_info.get('DriverInfo', {})
            car_idx = di.get('DriverCarIdx', -1)
            for d in di.get('Drivers', []):
                if d.get('CarIdx') == car_idx and not d.get('CarIsPaceCar'):
                    print(f"Driver: {d.get('UserName', '?')} — {d.get('CarScreenName', '?')}")
                    break

    if args.laps or args.summary:
        print("\n--- Lap Times ---")
        laps = extract_laps(var_lookup, raw_data, record_count, tick_rate, buf_len)
        if laps:
            for lap in laps:
                fuel_str = f"  fuel: {lap['fuel_used_L']:.2f}L" if 'fuel_used_L' in lap else ""
                mins = int(lap['time']) // 60
                secs = lap['time'] - mins * 60
                print(f"  Lap {lap['lap']:>3}: {mins}:{secs:06.3f}{fuel_str}")
            valid = [l for l in laps if l['lap'] > 0 and l['time'] > 30]
            if valid:
                best = min(valid, key=lambda x: x['time'])
                mins = int(best['time']) // 60
                secs = best['time'] - mins * 60
                print(f"\n  Best: Lap {best['lap']} — {mins}:{secs:06.3f}")
        else:
            print("  No complete laps found.")

    if args.setup:
        print("\n--- Car Setup ---")
        print_setup(session_info)

    if args.channels:
        print_channels(var_lookup)

    if args.csv:
        ch_names = [c.strip() for c in args.csv.split(',')]
        outfile = args.ibt_file.replace('.ibt', '_export.csv')
        print(f"\nExporting {len(ch_names)} channels to {outfile}...")
        with open(outfile, 'w') as f:
            f.write(','.join(ch_names) + '\n')
            channels = {name: read_channel(name, var_lookup, raw_data, record_count, buf_len) for name in ch_names}
            missing = [n for n in ch_names if channels[n] is None]
            if missing:
                print(f"  Warning: channels not found: {missing}")
            for i in range(record_count):
                vals = []
                for name in ch_names:
                    ch = channels[name]
                    vals.append(str(ch[i]) if ch is not None else '')
                f.write(','.join(vals) + '\n')
        print(f"  Wrote {record_count:,} rows.")


if __name__ == '__main__':
    main()
