"""
IBT Binary Parser — Verified against BMW M Hybrid V8 and Ferrari 499P IBT files.
Extracts telemetry data and full garage setup from iRacing .ibt files.
"""

import struct
import yaml
import numpy as np
from pathlib import Path

# IBT variable type → numpy dtype
NP_DTYPE = {
    0: 'S1',    # char
    1: '?',     # bool
    2: '<i4',   # int32
    3: '<u4',   # uint32 (bitfield)
    4: '<f4',   # float32
    5: '<f8',   # float64
}


class IBTFile:
    """Parse an iRacing IBT telemetry file."""

    def __init__(self, path_or_bytes, filename=None):
        if isinstance(path_or_bytes, (str, Path)):
            with open(path_or_bytes, 'rb') as f:
                self._data = f.read()
            self.filename = Path(path_or_bytes).name
        else:
            self._data = path_or_bytes
            self.filename = filename or 'unknown.ibt'
        self._parse_headers()

    def _parse_headers(self):
        d = self._data

        # Main header (48 bytes)
        self.tick_rate = struct.unpack_from('<i', d, 8)[0]
        self._sinfo_len = struct.unpack_from('<i', d, 16)[0]
        self._sinfo_off = struct.unpack_from('<i', d, 20)[0]
        self.num_vars = struct.unpack_from('<i', d, 24)[0]
        self._var_hdr_off = struct.unpack_from('<i', d, 28)[0]
        self.buf_len = struct.unpack_from('<i', d, 36)[0]

        # Buffer header (at offset 48)
        self.buf_offset = struct.unpack_from('<i', d, 52)[0]

        # Disk sub header (at offset 112)
        self.record_count = struct.unpack_from('<i', d, 140)[0]

        # Session info YAML
        raw_yaml = d[self._sinfo_off:self._sinfo_off + self._sinfo_len]
        sinfo_str = raw_yaml.decode('latin-1').rstrip('\x00')
        self.session_info = yaml.safe_load(sinfo_str)

        # Variable headers (each 144 bytes)
        self.variables = {}
        for i in range(self.num_vars):
            off = self._var_hdr_off + i * 144
            vtype = struct.unpack_from('<i', d, off)[0]
            voffset = struct.unpack_from('<i', d, off + 4)[0]
            vcount = struct.unpack_from('<i', d, off + 8)[0]
            vname = d[off + 16:off + 48].decode('latin-1').rstrip('\x00')
            vdesc = d[off + 48:off + 112].decode('latin-1').rstrip('\x00')
            vunit = d[off + 112:off + 144].decode('latin-1').rstrip('\x00')
            self.variables[vname] = {
                'type': vtype, 'offset': voffset, 'count': vcount,
                'unit': vunit, 'desc': vdesc,
            }

        # Raw data buffer
        buf_end = self.buf_offset + self.record_count * self.buf_len
        self._raw = self._data[self.buf_offset:buf_end]

    # ── Channel reading ──────────────────────────────────────────────

    def read_channel(self, name):
        """Read a telemetry channel as a numpy array (zero-copy stride trick)."""
        if name not in self.variables:
            return None
        v = self.variables[name]
        if v['count'] != 1:
            return None
        np_type = NP_DTYPE.get(v['type'])
        if np_type is None or np_type == 'S1':
            return None
        try:
            arr = np.ndarray(
                self.record_count, dtype=np_type,
                buffer=self._raw, offset=v['offset'],
                strides=(self.buf_len,),
            )
            return arr.copy()
        except Exception:
            return None

    def has_channel(self, name):
        return name in self.variables

    def channel_names(self):
        return sorted(self.variables.keys())

    # ── Convenience properties ───────────────────────────────────────

    @property
    def duration(self):
        return self.record_count / self.tick_rate

    @property
    def setup(self):
        return self.session_info.get('CarSetup', {})

    @property
    def weekend(self):
        return self.session_info.get('WeekendInfo', {})

    @property
    def car_name(self):
        drv = self.get_driver()
        return drv.get('CarScreenName', 'Unknown') if drv else 'Unknown'

    @property
    def track_name(self):
        wi = self.weekend
        name = wi.get('TrackDisplayName', 'Unknown')
        cfg = wi.get('TrackConfigName', '')
        if cfg and cfg.lower() != 'full course':
            name += f' ({cfg})'
        return name

    @property
    def driver_name(self):
        drv = self.get_driver()
        return drv.get('UserName', 'Unknown') if drv else 'Unknown'

    def get_driver(self):
        """Return the recording driver's info dict."""
        info = self.session_info.get('DriverInfo', {})
        car_idx = info.get('DriverCarIdx')
        for d in info.get('Drivers', []):
            if d.get('CarIdx') == car_idx:
                return d
        return None

    def get_air_temp(self):
        t = self.weekend.get('TrackAirTemp', '')
        return _parse_temp(t)

    def get_track_temp(self):
        t = self.weekend.get('TrackSurfaceTemp', '')
        return _parse_temp(t)


def _parse_temp(s):
    """Parse '33.78 C' → 33.78"""
    try:
        return float(s.replace('C', '').strip())
    except (ValueError, AttributeError):
        return None
