---
name: analyze-ibt
description: "Parse and analyze an iRacing IBT telemetry file. Extracts setup, lap times, channel data, and generates a diagnostic report."
---

# Analyze IBT File

When the user runs `/analyze-ibt [path]`:

1. **Read the IBT parsing guide** from `references/ibt-parsing-guide.md`
2. **Parse the IBT file** using the Python parser — extract:
   - Session info YAML (track, car, weather, full garage setup)
   - Key telemetry channels: Speed, Throttle, Brake, SteeringWheelAngle, LatAccel, LongAccel, LapCurrentLapTime, Lap
   - Tire data: all tempL/M/R, pressure channels
   - Ride heights: CFrideHeight, CRrideHeight
   - Shock deflections: LFshockDefl, RFshockDefl, LRshockDefl, RRshockDefl
3. **Generate lap summary**: lap times, best lap, fuel usage per lap
4. **Flag anomalies**: bottoming events (ride height < 5mm), tire temp spreads > 10°C, pressure outliers
5. **Read per-car-quirks.md** for the detected car and cross-reference against known baselines
6. **Output structured report** with findings and setup recommendations

If no path is provided, look for the most recent .ibt file in `~/Documents/iRacing/Telemetry/`.
