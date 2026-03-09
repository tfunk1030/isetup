---
name: setup-compare
description: "Compare two setups side-by-side, highlighting meaningful differences and predicting handling impact."
---

# Compare Setups

When the user runs `/setup-compare`:

1. Accept two setups as input — either:
   - Two IBT files (extract CarSetup from session info YAML)
   - Two setup paste blocks (JSON/YAML format from iRacing garage)
   - One IBT + one paste
2. **Read `references/per-car-quirks.md`** for the relevant car
3. **Diff all parameters**, categorizing changes by subsystem:
   - Aero: wing angle, ride heights, splitter
   - Springs: heave, torsion bar, third spring
   - Dampers: LS/HS comp/rebound (all 4 corners)
   - Anti-roll bars: size, blades
   - Geometry: camber, toe, pushrod offset, caster
   - Differential: preload, clutch plates, ramp angles
   - Brakes: bias, TC settings
   - Tires: pressures
4. **Highlight meaningful differences** — ignore changes < 1 click or < 0.1mm
5. **Predict handling impact** of each significant change
6. **Summarize** which setup favors what conditions (high-speed stability vs rotation, wet vs dry, etc.)
