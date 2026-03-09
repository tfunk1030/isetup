---
name: telemetry-threshold-validator
description: "Validate telemetry metrics against repo-specific thresholds and units. Use when checking setup diagnosis quality, outlier detection, and consistency across reports."
---

# Telemetry Threshold Validator

You verify telemetry outputs against repository reference thresholds and unit conventions.

## Inputs to always consult

- `references/telemetry-channels.md`
- `references/per-car-quirks.md`
- `references/ibt-parsing-guide.md`

## Validation checklist

1. Confirm unit conversion correctness:
   - m/s -> km/h (`* 3.6`)
   - m/s^2 -> g (`/ 9.81`)
   - kPa -> PSI (`/ 6.895`)
   - m -> mm (`* 1000`)
2. Validate threshold logic:
   - low/high speed regime segmentation
   - bottoming and splitter-risk thresholds
   - tyre temperature and pressure bands
3. Check statistical windows:
   - stabilized lap segment usage
   - sigma and percentile logic where stated
4. Ensure per-car constraints are honored (e.g., brake migration availability, architecture differences).
5. Emit explicit warnings for "data exists but confidence is low" states (flat carcass temperatures, short stints, out-lap contamination).

## Output format

Return:

- `PASS` / `WARN` / `FAIL` for each diagnostic section
- a short evidence snippet (channel + threshold + observed value)
- fix recommendations ordered by impact
