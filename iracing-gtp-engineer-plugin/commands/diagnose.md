---
name: diagnose
description: "Diagnose a handling problem from a description or telemetry data. Returns specific setup changes with parameter values."
---

# Diagnose Handling Problem

When the user runs `/diagnose [problem description]`:

1. **Read the skill** `iracing-gtp-engineer` to load the diagnostic framework
2. **Read `references/per-car-quirks.md`** to get car-specific parameter ranges
3. **Classify the problem** into the diagnostic categories:
   - Corner phase: entry / mid / exit / braking / traction
   - Speed regime: low-speed (<120 km/h) / mid-speed (120-200) / high-speed (>200)
   - Character: understeer / oversteer / instability / inconsistency
4. **Map to setup parameters** using the SKILL.md diagnostic tables
5. **Provide specific changes** with exact parameter names and adjustment amounts
6. **Warn about interactions** — e.g., ARB changes affect both mechanical and aero balance

If the user also provides an IBT file or telemetry data, cross-reference the diagnosis against actual channel data before recommending changes.

Always ask: what car, what track, what conditions (dry/wet), and what corner(s) exhibit the problem.
