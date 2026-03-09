"""
Telemetry Analysis Engine for iRacing GTP cars.
Implements the automated analysis checklist and recommendation engine.
"""

import numpy as np

# ── Constants ────────────────────────────────────────────────────────

CARS_WITH_BRAKE_MIGRATION = {'Cadillac', 'Porsche', 'Ferrari'}
CARS_WITHOUT_BRAKE_MIGRATION = {'BMW', 'Acura'}

TEMP_COLD = 70.0       # °C — below this after 3+ laps = cold
TEMP_LOW = 85.0         # °C — operating window lower bound
TEMP_HIGH = 105.0       # °C — above = thermal degradation
TEMP_PEAK = 97.5        # °C — approximate peak grip

PRESSURE_LOW_PSI = 20.0
PRESSURE_HIGH_PSI = 24.0
KPA_TO_PSI = 1 / 6.895

SPEED_AERO_THRESHOLD = 200 / 3.6   # 200 km/h in m/s
PLATFORM_SIGMA_THRESHOLD = 0.005   # 5 mm in meters
BOTTOMING_THRESHOLD = 0.0          # 0 mm ride height

DOWNSAMPLE = 6  # 60 Hz → 10 Hz for browser charts


def analyze(ibt):
    """Run full analysis on an IBTFile. Returns a dict ready for JSON."""
    result = {}
    result['session'] = _session_info(ibt)
    result['setup'] = _flatten_setup(ibt.setup)
    result['setup_raw'] = ibt.setup

    laps = _detect_laps(ibt)
    result['laps'] = laps

    result['tyres'] = _tyre_analysis(ibt, laps)
    result['platform'] = _platform_analysis(ibt)
    result['dynamics'] = _dynamics(ibt)
    result['inputs'] = _driver_inputs(ibt)
    result['fuel'] = _fuel_analysis(ibt)
    result['driver_aids'] = _driver_aids(ibt)
    result['recommendations'] = _recommendations(result, ibt)
    return result


# ── Session Info ─────────────────────────────────────────────────────

def _session_info(ibt):
    has_migration = any(k in ibt.car_name for k in CARS_WITH_BRAKE_MIGRATION)
    return {
        'car': ibt.car_name,
        'driver': ibt.driver_name,
        'track': ibt.track_name,
        'air_temp': ibt.get_air_temp(),
        'track_temp': ibt.get_track_temp(),
        'duration': round(ibt.duration, 1),
        'tick_rate': ibt.tick_rate,
        'num_channels': ibt.num_vars,
        'has_brake_migration': has_migration,
    }


# ── Lap Detection ───────────────────────────────────────────────────

def _detect_laps(ibt):
    lap_ch = ibt.read_channel('Lap')
    time_ch = ibt.read_channel('SessionTime')
    speed_ch = ibt.read_channel('Speed')

    if lap_ch is None or time_ch is None:
        return []

    laps = []
    current_lap = int(lap_ch[0])
    lap_start_idx = 0

    for i in range(1, len(lap_ch)):
        if int(lap_ch[i]) != current_lap:
            lap_time = time_ch[i] - time_ch[lap_start_idx]
            max_speed = 0
            if speed_ch is not None:
                max_speed = float(np.max(speed_ch[lap_start_idx:i])) * 3.6

            valid = 60 < lap_time < 300
            laps.append({
                'number': current_lap,
                'time': round(lap_time, 3),
                'time_str': _format_laptime(lap_time),
                'max_speed_kmh': round(max_speed, 1),
                'valid': valid,
                'start_idx': int(lap_start_idx),
                'end_idx': int(i),
            })
            current_lap = int(lap_ch[i])
            lap_start_idx = i

    # Last lap (may be incomplete)
    if lap_start_idx < len(lap_ch) - 1:
        lap_time = time_ch[-1] - time_ch[lap_start_idx]
        max_speed = 0
        if speed_ch is not None:
            max_speed = float(np.max(speed_ch[lap_start_idx:])) * 3.6
        laps.append({
            'number': current_lap,
            'time': round(lap_time, 3),
            'time_str': _format_laptime(lap_time),
            'max_speed_kmh': round(max_speed, 1),
            'valid': 60 < lap_time < 300,
            'start_idx': int(lap_start_idx),
            'end_idx': int(len(lap_ch)),
        })

    return laps


def _format_laptime(seconds):
    mins = int(seconds // 60)
    secs = seconds % 60
    return f"{mins}:{secs:06.3f}"


# ── Tyre Analysis ───────────────────────────────────────────────────

def _tyre_analysis(ibt, laps):
    corners = ['LF', 'RF', 'LR', 'RR']
    result = {'surface_temps': {}, 'pressures': {}, 'wear': {}, 'per_lap': []}

    # Continuous traces (downsampled)
    time_ch = ibt.read_channel('SessionTime')
    time_ds = _downsample(time_ch) if time_ch is not None else []
    result['time'] = _to_list(time_ds)

    for c in corners:
        # Surface temps (continuous, downsampled)
        tl = ibt.read_channel(f'{c}tempL')
        tm = ibt.read_channel(f'{c}tempM')
        tr = ibt.read_channel(f'{c}tempR')

        # Map L/M/R to Outer/Middle/Inner
        if c.startswith('L'):
            outer, middle, inner = tl, tm, tr
        else:
            outer, middle, inner = tr, tm, tl

        result['surface_temps'][c] = {
            'outer': _to_list(_downsample(outer)),
            'middle': _to_list(_downsample(middle)),
            'inner': _to_list(_downsample(inner)),
        }

        # Pressures (continuous, downsampled)
        press = ibt.read_channel(f'{c}pressure')
        if press is not None:
            result['pressures'][c] = _to_list(_downsample(press * KPA_TO_PSI))
        else:
            result['pressures'][c] = []

        # Wear
        wl = ibt.read_channel(f'{c}wearL')
        wm = ibt.read_channel(f'{c}wearM')
        wr = ibt.read_channel(f'{c}wearR')
        if wl is not None:
            result['wear'][c] = {
                'outer': round(float(wl[-1]) * 100, 1) if c.startswith('L') else round(float(wr[-1]) * 100, 1),
                'middle': round(float(wm[-1]) * 100, 1),
                'inner': round(float(wr[-1]) * 100, 1) if c.startswith('L') else round(float(wl[-1]) * 100, 1),
            }

    # Per-lap tyre summaries (last 50% of each valid lap)
    for lap in laps:
        if not lap['valid']:
            continue
        s, e = lap['start_idx'], lap['end_idx']
        mid = s + (e - s) // 2  # Last 50%

        lap_data = {'lap': lap['number'], 'temps': {}, 'pressures': {}}
        for c in corners:
            tl = ibt.read_channel(f'{c}tempL')
            tm = ibt.read_channel(f'{c}tempM')
            tr = ibt.read_channel(f'{c}tempR')
            if tl is not None:
                if c.startswith('L'):
                    o, m, i = tl[mid:e], tm[mid:e], tr[mid:e]
                else:
                    o, m, i = tr[mid:e], tm[mid:e], tl[mid:e]
                lap_data['temps'][c] = {
                    'outer': round(float(np.mean(o)), 1),
                    'middle': round(float(np.mean(m)), 1),
                    'inner': round(float(np.mean(i)), 1),
                }

            press = ibt.read_channel(f'{c}pressure')
            if press is not None:
                lap_data['pressures'][c] = round(float(np.mean(press[mid:e])) * KPA_TO_PSI, 1)

        result['per_lap'].append(lap_data)

    return result


# ── Platform Analysis ────────────────────────────────────────────────

def _platform_analysis(ibt):
    result = {'ride_heights': {}, 'heave': {}}

    time_ch = ibt.read_channel('SessionTime')
    speed_ch = ibt.read_channel('Speed')
    result['time'] = _to_list(_downsample(time_ch)) if time_ch is not None else []

    # Ride heights (in mm)
    for c in ['LF', 'RF', 'LR', 'RR']:
        rh = ibt.read_channel(f'{c}rideHeight')
        if rh is not None:
            result['ride_heights'][c] = _to_list(_downsample(rh * 1000))

    # CFSR ride height
    cfsr = ibt.read_channel('CFSRrideHeight')
    if cfsr is not None:
        result['ride_heights']['CFSR'] = _to_list(_downsample(cfsr * 1000))

    # Heave deflections (in mm)
    hf = ibt.read_channel('HFshockDefl')
    hr = ibt.read_channel('HRshockDefl')
    if hf is not None:
        result['heave']['front'] = _to_list(_downsample(hf * 1000))
    if hr is not None:
        result['heave']['rear'] = _to_list(_downsample(hr * 1000))

    # High-speed platform stats
    if speed_ch is not None:
        hi_speed_mask = speed_ch > SPEED_AERO_THRESHOLD
        stats = {}
        for c in ['LF', 'RF', 'LR', 'RR']:
            rh = ibt.read_channel(f'{c}rideHeight')
            if rh is not None and np.any(hi_speed_mask):
                rh_hs = rh[hi_speed_mask] * 1000
                stats[c] = {
                    'mean_mm': round(float(np.mean(rh_hs)), 1),
                    'min_mm': round(float(np.min(rh_hs)), 1),
                    'sigma_mm': round(float(np.std(rh_hs)), 1),
                    'bottoming': bool(np.any(rh_hs <= 0)),
                }
        if hf is not None and np.any(hi_speed_mask):
            hf_hs = hf[hi_speed_mask] * 1000
            stats['heave_front'] = {
                'mean_mm': round(float(np.mean(hf_hs)), 1),
                'sigma_mm': round(float(np.std(hf_hs)), 1),
            }
        if hr is not None and np.any(hi_speed_mask):
            hr_hs = hr[hi_speed_mask] * 1000
            stats['heave_rear'] = {
                'mean_mm': round(float(np.mean(hr_hs)), 1),
                'sigma_mm': round(float(np.std(hr_hs)), 1),
            }
        result['hi_speed_stats'] = stats
    else:
        result['hi_speed_stats'] = {}

    return result


# ── Dynamics ─────────────────────────────────────────────────────────

def _dynamics(ibt):
    speed = ibt.read_channel('Speed')
    lat_g = ibt.read_channel('LatAccel')
    long_g = ibt.read_channel('LongAccel')
    time_ch = ibt.read_channel('SessionTime')

    result = {
        'time': _to_list(_downsample(time_ch)) if time_ch is not None else [],
        'speed_kmh': _to_list(_downsample(speed * 3.6)) if speed is not None else [],
    }

    # G-G diagram (subsample for performance)
    if lat_g is not None and long_g is not None:
        lat = lat_g / 9.81
        lon = long_g / 9.81
        # Take every 12th sample for G-G
        step = max(1, len(lat) // 5000)
        result['lat_g'] = _to_list(lat[::step])
        result['long_g'] = _to_list(lon[::step])
        result['peak_lat_g'] = round(float(np.max(np.abs(lat))), 2)
        result['peak_long_g_brake'] = round(float(np.min(lon)), 2)
        result['peak_long_g_accel'] = round(float(np.max(lon)), 2)
    else:
        result['lat_g'] = []
        result['long_g'] = []

    return result


# ── Driver Inputs ────────────────────────────────────────────────────

def _driver_inputs(ibt):
    throttle = ibt.read_channel('Throttle')
    brake = ibt.read_channel('Brake')
    steering = ibt.read_channel('SteeringWheelAngle')
    time_ch = ibt.read_channel('SessionTime')

    return {
        'time': _to_list(_downsample(time_ch)) if time_ch is not None else [],
        'throttle': _to_list(_downsample(throttle * 100)) if throttle is not None else [],
        'brake': _to_list(_downsample(brake * 100)) if brake is not None else [],
        'steering_deg': _to_list(_downsample(steering * 57.2958)) if steering is not None else [],
    }


# ── Fuel ─────────────────────────────────────────────────────────────

def _fuel_analysis(ibt):
    fuel = ibt.read_channel('FuelLevel')
    time_ch = ibt.read_channel('SessionTime')
    if fuel is None:
        return {'start': 0, 'end': 0, 'used': 0, 'per_lap': 0, 'trace': []}

    start = float(fuel[0])
    end = float(fuel[-1])
    used = start - end

    return {
        'start': round(start, 1),
        'end': round(end, 1),
        'used': round(used, 1),
        'trace': _to_list(_downsample(fuel)),
        'time': _to_list(_downsample(time_ch)) if time_ch is not None else [],
    }


# ── Driver Aids ──────────────────────────────────────────────────────

def _driver_aids(ibt):
    aids = {}
    channels = {
        'brake_bias': 'dcBrakeBias',
        'tc1': 'dcTractionControl',
        'tc2': 'dcTractionControl2',
        'abs': 'dcABS',
        'farb': 'dcAntiRollFront',
        'rarb': 'dcAntiRollRear',
    }
    for key, ch_name in channels.items():
        ch = ibt.read_channel(ch_name)
        if ch is not None:
            vals = ch[ch != 0]  # filter zeros (may be uninitialized)
            if len(vals) > 0:
                aids[key] = {
                    'start': round(float(vals[0]), 2),
                    'end': round(float(vals[-1]), 2),
                    'min': round(float(np.min(vals)), 2),
                    'max': round(float(np.max(vals)), 2),
                    'changed': bool(float(np.max(vals)) - float(np.min(vals)) > 0.01),
                }
    return aids


# ── Recommendations Engine ───────────────────────────────────────────

def _recommendations(result, ibt):
    recs = []
    priority = 0

    # ── Tyre temperature checks ──
    valid_laps = [lp for lp in result['tyres'].get('per_lap', []) if lp.get('temps')]
    if valid_laps:
        last_lap = valid_laps[-1]
        for corner, temps in last_lap.get('temps', {}).items():
            avg = (temps['outer'] + temps['middle'] + temps['inner']) / 3
            if avg < TEMP_COLD:
                priority += 1
                recs.append({
                    'priority': priority, 'category': 'tyres',
                    'icon': '🥶',
                    'text': f'{corner} surface temps very cold ({avg:.0f}°C avg). '
                            f'Vision tread tyres need 8-10 laps to reach window. '
                            f'For sprint: increase camber and toe-out to accelerate thermal buildup.',
                })
            elif avg > TEMP_HIGH:
                priority += 1
                recs.append({
                    'priority': priority, 'category': 'tyres',
                    'icon': '🔥',
                    'text': f'{corner} surface temps too hot ({avg:.0f}°C avg, target <105°C). '
                            f'Check ARB stiffness, diff preload, and spring rates.',
                })

            # Inner-outer gradient
            gradient = temps['inner'] - temps['outer']
            if gradient > 12:
                priority += 1
                recs.append({
                    'priority': priority, 'category': 'tyres',
                    'icon': '📐',
                    'text': f'{corner} excessive inner-outer gradient ({gradient:.0f}°C, target 5-8°C). '
                            f'Consider reducing negative camber.',
                })
            elif gradient < 0:
                priority += 1
                recs.append({
                    'priority': priority, 'category': 'tyres',
                    'icon': '📐',
                    'text': f'{corner} outer hotter than inner ({abs(gradient):.0f}°C inverted). '
                            f'Add negative camber or check for excessive sliding.',
                })

    # ── Pressure checks ──
    if valid_laps:
        last_lap = valid_laps[-1]
        for corner, psi in last_lap.get('pressures', {}).items():
            if psi > 27:
                priority += 1
                recs.append({
                    'priority': priority, 'category': 'tyres',
                    'icon': '💨',
                    'text': f'{corner} hot pressure very high ({psi:.1f} PSI). '
                            f'Starting at 152 kPa min, this is expected. '
                            f'Manage via camber/alignment/springs, not pressure.',
                })

    # ── Platform checks ──
    hs_stats = result['platform'].get('hi_speed_stats', {})
    for corner in ['LF', 'RF', 'LR', 'RR']:
        s = hs_stats.get(corner, {})
        if s.get('bottoming'):
            priority += 1
            is_front = corner.startswith('L') or corner.startswith('R')
            if corner[1] == 'F':
                fix = ('Stiffen front heave spring, increase front HS compression damping, '
                       'or reduce HS compression slope for more digressive response.')
            else:
                fix = ('Adjust rear pushrod offset (less negative) or reduce rear third perch offset '
                       'for more heave preload. Verify ride height in garage.')
            recs.append({
                'priority': priority, 'category': 'platform',
                'icon': '⚠️',
                'text': f'{corner} BOTTOMING at speed (min RH: {s.get("min_mm", 0):.1f} mm). {fix}',
            })
        if s.get('sigma_mm', 0) > 5:
            priority += 1
            recs.append({
                'priority': priority, 'category': 'platform',
                'icon': '📊',
                'text': f'{corner} ride height instability at speed (σ={s["sigma_mm"]:.1f} mm, threshold <5 mm). '
                        f'Stiffen heave spring or HS compression damping.',
            })

    # Heave stability
    hf_stats = hs_stats.get('heave_front', {})
    if hf_stats.get('sigma_mm', 0) > 5:
        priority += 1
        recs.append({
            'priority': priority, 'category': 'platform',
            'icon': '📊',
            'text': f'Front heave platform unstable at speed (σ={hf_stats["sigma_mm"]:.1f} mm). '
                    f'Stiffen front heave spring.',
        })

    # ── Driver aids drift ──
    aids = result.get('driver_aids', {})
    if aids.get('rarb', {}).get('changed'):
        rarb = aids['rarb']
        priority += 1
        recs.append({
            'priority': priority, 'category': 'balance',
            'icon': '🔄',
            'text': f'Rear ARB blades adjusted during stint ({rarb["start"]:.0f} → {rarb["end"]:.0f}). '
                    f'Driver searching for balance. If maxed out, step up ARB diameter instead.',
        })
    if aids.get('farb', {}).get('changed'):
        farb = aids['farb']
        priority += 1
        recs.append({
            'priority': priority, 'category': 'balance',
            'icon': '🔄',
            'text': f'Front ARB blades adjusted during stint ({farb["start"]:.0f} → {farb["end"]:.0f}). '
                    f'Driver actively tuning mid-corner balance.',
        })

    # ── Fuel ──
    fuel = result.get('fuel', {})
    if fuel.get('used', 0) == 0 and fuel.get('start', 0) > 0:
        priority += 1
        recs.append({
            'priority': priority, 'category': 'fuel',
            'icon': 'ℹ️',
            'text': 'Zero fuel consumption detected. Fuel usage may be disabled in this session type.',
        })

    # Sort by priority
    recs.sort(key=lambda r: r['priority'])
    return recs


# ── Setup flattening ─────────────────────────────────────────────────

def _flatten_setup(setup, prefix=''):
    """Flatten nested setup dict into a list of {section, key, value} dicts."""
    items = []
    if not isinstance(setup, dict):
        return items
    for k, v in setup.items():
        path = f'{prefix}.{k}' if prefix else k
        if isinstance(v, dict):
            items.extend(_flatten_setup(v, path))
        else:
            section = prefix.split('.')[0] if prefix else 'General'
            items.append({'section': section, 'key': path, 'value': str(v)})
    return items


# ── Helpers ──────────────────────────────────────────────────────────

def _downsample(arr, step=DOWNSAMPLE):
    if arr is None:
        return []
    return arr[::step]


def _to_list(arr):
    if arr is None or (hasattr(arr, '__len__') and len(arr) == 0):
        return []
    if isinstance(arr, np.ndarray):
        # Round to reduce JSON size
        return [round(float(x), 3) for x in arr]
    return list(arr)
