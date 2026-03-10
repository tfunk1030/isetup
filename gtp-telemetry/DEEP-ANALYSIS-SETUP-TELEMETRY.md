# Deep Analysis: Setup & Telemetry Engine vs. iRacing GTP Engineering Knowledge

**Date:** March 10, 2026
**Scope:** Cross-reference of the GTP telemetry analysis codebase (~6,700 lines across 10 core lib files) against the iracing-gtp-engineer skill document (the "ground truth" for iRacing GTP setup engineering).

---

## Executive Summary

The analysis engine is a genuinely impressive piece of work — a 14-item engineering checklist ported from Python (`sebring_analysis_v4.py`) that parses raw IBT binary telemetry, runs per-lap tyre/platform/dynamics analysis, normalizes iRacing setup XML, generates prioritized recommendations with exact parameter deltas, and even auto-validates previous recommendations across sessions. The architecture follows a proper evidence chain: **Raw Data → Findings → Diagnoses → Recommendations**.

However, cross-referencing against the skill's deep domain knowledge reveals **12 significant gaps** and **8 physics/engineering inaccuracies** that would cause incorrect setup advice in real sessions. The most critical issues center on: missing the speed-dependent damper diagnostic rule, incomplete kerb-vs-clean-track bottoming separation, absent LS rebound ratio analysis, and the finding-generator not accounting for Vision tread conditioning timelines.

---

## 1. What the Engine Gets Right

### 1.1 IBT Parser — Solid Binary Implementation
The parser (`ibt-parser.ts`, 250 lines) correctly handles iRacing's IBT binary format: latin-1 encoding (not UTF-8), 144-byte variable headers, correct type dispatch (float32/float64/int32/uint32/uint8), and YAML session info extraction with a fallback hand-rolled parser for iRacing's non-standard YAML. The tick rate validation (expecting 60 Hz) and record count bounds checking are appropriate.

### 1.2 Tyre Temperature L/M/R → O/M/I Mapping
The engine correctly implements the side-dependent temperature mapping that trips up most iRacing tools:
- Left tyres (LF, LR): `tempL` = Outer, `tempM` = Middle, `tempR` = Inner
- Right tyres (RF, RR): `tempR` = Outer, `tempM` = Middle, `tempL` = Inner

This is verified in both `analyzeTyreTemps()` and the conditioning analysis — a detail many tools get wrong, causing inverted camber recommendations.

### 1.3 152 kPa Cold Pressure Floor Awareness
The recommendation builder correctly handles the sim's 22.0 PSI (152 kPa) minimum cold pressure constraint. When a crowning tyre would need lower pressure but is already at the floor, it correctly marks the recommendation as `'blocked'` and redirects to camber/ARB/load changes instead. This matches the skill's guidance exactly.

### 1.4 Domain Knowledge Encoding
`domain-knowledge.ts` (876 lines) encodes an impressive amount of real engineering knowledge:
- 15 diagnostic rules covering entry/mid/exit phases × low/mid/high speed × all symptom types
- 14 track-specific setup guidance profiles with surface types, wing levels, heave spring minimums
- Per-car deep knowledge (rotation rank, aero sensitivity, diff sensitivity, damper scale warnings)
- Wet protocol (9 ordered steps)
- In-car adjustment interpretation rules (brake bias drift, TC climbing, ARB blade maxing)
- Physics version history (S2 2025 tyre reconstruction through S1 2026 Vision tread)

### 1.5 Setup Normalization — Fuzzy Path Matching
The normalizer (`setup-normalization.ts`, 504 lines) solves a genuinely hard problem: iRacing's setup XML structure varies across car architectures (LMDh vs LMH, different damper/diff path hierarchies). The fuzzy scoring algorithm (exact → contiguous subsequence → ordered subsequence) with ambiguity detection and confidence downgrading is well-designed. The 49 parameter specs cover the full GTP setup surface.

### 1.6 Session Memory Auto-Validation
`session-memory.ts` (773 lines) implements automatic recommendation validation by comparing consecutive sessions — no user labeling needed. It extracts metric snapshots, detects parameter changes, and scores outcomes with weighted metrics (lap time 0.4, bottoming 0.5, tyre temp balance 0.3, etc.). This is a novel feature that closes the learning loop.

### 1.7 Recommendation Priority System
Uses the skill's impact hierarchy (heave → aero → ARB → dampers → diff → springs → brakes → alignment → pressures → gearing) to sort recommendations. This ensures the most impactful changes surface first, matching the skill's "fix order" exactly.

---

## 2. Critical Gaps — Missing from the Engine

### 2.1 ❌ Missing: Speed-Dependent Damper Diagnostic Rule
**Skill says:** "The same damper change can have opposite effects at different speeds. Below ~150 kph: weight transfer rate dominates. Above ~200 kph: aero/ride height effects dominate. NEVER recommend damper changes for 'understeer' without knowing the speed at which it occurs."

**Code does:** The `diagnose-engine.ts` classifies symptoms by phase and speed regime, but the analysis engine's `buildRecommendations()` only checks peak shaft velocity thresholds — it never cross-references the speed at which damper events occur with the handling symptom. A driver reporting understeer at 80 kph (mechanical) and at 250 kph (aero) could get the same damper recommendation, when they need opposite changes.

**Impact:** HIGH — incorrect damper advice is worse than no advice.

### 2.2 ❌ Missing: LS Rebound Ratio Check (Checklist Item 9b)
**Skill says:** "Compare front LS rebound to rear LS rebound click values. If ratio exceeds 1.5×, flag as potential transient understeer source. If below 0.7×, flag as potential entry oversteer. Also compute shock velocity comp/ext ratio during throttle-lift transitions."

**Code does:** The `analyzeShockVelocities()` function computes absolute shock velocity statistics but does not compute front-to-rear LS rebound ratios or compression/extension velocity ratios. The finding generator has no findings for rebound ratio imbalance.

**Impact:** HIGH — LS rebound ratio is explicitly item 9b in the skill's 14-item checklist but is completely absent from the code.

### 2.3 ❌ Missing: Kerb Zone Correlation for Bottoming
**Skill says:** "ALWAYS CORRELATE BOTTOMING WITH TRACK POSITION using LapDistPct before recommending heave spring changes. Kerb strikes at known kerb-riding corners are driving choices, not setup failures."

**Code partially does:** `analyzeBottoming()` uses `trackProfile.kerbZones` to separate kerb from clean bottoming — good. But the finding generator and recommendation builder only use the *count* of clean vs kerb events. They don't report the three views the skill requires: (a) all high-speed data, (b) excluding kerb zones, (c) excluding kerbs AND known bumpy straights. The LapDistPct-binned location data is collected (`byLocation[]`) but never used in recommendations.

**Impact:** MEDIUM — the basic kerb/clean split is there, but bottoming location data is wasted.

### 2.4 ❌ Missing: Fuel Load Ride Height Compensation
**Skill says:** "When fuel load changes significantly (e.g., 89L race → 12L qualifying), the car sits higher. Do NOT compare pushrod values across sessions with different fuel loads. Compare the RESULTING ride height."

**Code does:** The `FuelData` type tracks start/end fuel levels and consumption rate, but neither the recommendation builder nor session memory accounts for fuel load when comparing ride height data or pushrod recommendations across sessions. A qualifying run (12L) showing less bottoming than a race run (89L) could produce misleading cross-session comparisons.

**Impact:** MEDIUM — affects session memory validation accuracy.

### 2.5 ❌ Missing: Damper Velocity Histogram Analysis
**Skill says:** "A symmetrical bell-curve distribution of damper velocities indicates well-tuned dampers. Flat or asymmetrical distributions signal mis-valved dampers. If the histogram shows heavy concentration at extreme velocities, the springs are too soft."

**Code does:** Computes p95, p99, and peak shock velocities — useful but incomplete. No histogram shape analysis (symmetry, kurtosis, bimodality). No detection of "springs doing the dampers' job" pattern.

**Impact:** MEDIUM — misses a diagnostic that could redirect spring recommendations away from damper changes.

### 2.6 ❌ Missing: Steering Angle Trace Analysis
**Skill says:** The telemetry channels include `SteeringWheelAngle` and the skill references "SteeringWheelAngle — corrections should decrease" as a verification channel for multiple diagnostic rules.

**Code does:** `SteeringWheelAngle` is in the `ANALYSIS_CHANNELS` list but is never read or analyzed. No steering correction frequency analysis, no understeer angle computation from the corner detection module (despite `derived-channels.ts` defining an `understeerAngle` channel).

**Impact:** MEDIUM — steering data is the most direct indicator of handling problems.

### 2.7 ❌ Missing: RPM/Gear/Speed Gearing Verification
**Skill says:** "Are they hitting the limiter before braking zones? Is the gear ratio spacing appropriate?"

**Code does:** The `Gear` and `RPM` channels are in `ANALYSIS_CHANNELS` but no gearing analysis exists. No rev-limiter detection, no gear-vs-speed correlation, no recommendations about gear stack selection. The track profiles have a `mandatoryGearStack` field but it's always null.

**Impact:** LOW-MEDIUM — gearing is usually set once, but missing Le Mans long stack detection is a missed safety check.

### 2.8 ❌ Missing: Carcass Temperature Channels
**Skill says:** "Use surface temps as primary. Only use carcass temps (`tempCL/CM/CR`) if they show meaningful variation from ambient."

**Code does:** Only reads surface temps. The carcass temperature channels are not in `ANALYSIS_CHANNELS` and are never parsed. While the skill says surface temps are primary, carcass temps could reveal thermal core issues invisible in surface data.

**Impact:** LOW — surface temps are primary per the skill, but completeness would benefit from carcass data.

### 2.9 ❌ Missing: Derived Engineering Channels Integration
`dsp/derived-channels.ts` defines: `rollAngle`, `pitchAngle`, `aeroBalance`, `understeerAngle`, `lateralLoadTransfer`, and smoothed ride height channels. These are computed but **never consumed** by the analysis engine, finding generator, or recommendation builder. The `understeerAngle` channel alone would dramatically improve handling diagnosis.

**Impact:** HIGH — this is implemented code that's completely disconnected from the pipeline.

### 2.10 ❌ Missing: Corner-by-Corner Analysis Integration
`corner-detection.ts` (466 lines) implements a proper speed-minima corner detection algorithm with Savitzky-Golay smoothing, braking point detection, apex classification, and per-corner metrics. But the main `analyzeSession()` function never calls it. All analysis is done on per-lap aggregates, not per-corner data.

**Impact:** HIGH — the skill's diagnostic rules are all corner-phase-specific (entry/mid/exit), but the engine can't distinguish which corners are problematic.

### 2.11 ❌ Missing: Throttle Channel Analysis
**Skill says:** Check throttle data for exit analysis, trail-braking patterns, and TC interaction.

**Code does:** The `Throttle` channel is in `ANALYSIS_CHANNELS` but is never analyzed. Corner detection uses it for exit point detection but that module isn't connected. No trail-braking analysis, no throttle modulation quality assessment.

### 2.12 ❌ Missing: Brake Migration Context
**Skill says:** "Note brake migration availability (BMW/Acura: NO, Cadillac/Porsche/Ferrari: YES)." Also: "S3 2025 BUGFIX: Migration was running at 50% of stated value."

**Code does:** `extractSessionHeader()` sets a `hasBrakeMig` flag based on car name but this flag is never used in any analysis or recommendation. No brake migration conversion advice for pre-S3 2025 setups.

---

## 3. Physics/Engineering Inaccuracies

### 3.1 ⚠ Tyre Temperature Thresholds Too Conservative
**Constants:** `TYRE_TEMP.COLD = 70`, `TYRE_TEMP.HOT = 105`, `OPERATING_TARGET = 85`

**Skill says:** "85-105°C operating window. Peak grip around 95-100°C."

**Issue:** The code flags anything above 105°C as overheating, but the skill defines 85-105°C as the full operating window with peak grip at 95-100°C. A tyre at 98°C should be flagged as optimal, not "approaching hot." The finding generator uses `TYRE_TEMP.HOT (105)` as the overheating threshold, which is correct — but the `OPERATING_TARGET` of 85°C is the *lower bound* of the window, not the target center. Recommendations that try to bring temps down to 85°C from 95°C would degrade performance.

**Fix:** Change `OPERATING_TARGET` to 92-95°C (midpoint of peak grip) and add a `PEAK_GRIP_CENTER = 97.5` for recommendation targeting.

### 3.2 ⚠ Bottoming Threshold at 0mm Is Too Aggressive
**Constant:** `BOTTOMING_THRESHOLD_MM = 0`

**Skill says:** "Any per-corner ride height ≤ 0 mm at speed = bottoming event."

**Issue:** The constant is correct per the skill, but the code uses `minRH * 1000` (meters to mm) and checks `minRHmm <= 0`. This means only actual contact (≤0mm) counts. The skill also defines CFSR < 5mm as splitter risk, which IS implemented. But the recommendation builder should weight bottoming events by severity (how far below zero, how long the event lasted) rather than just counting them.

### 3.3 ⚠ Pressure Build Rate Threshold Missing Context
**Finding generator:** Flags pressure build rates > 0.3 PSI/lap as notable.

**Skill says:** Hot pressures from minimum cold (152 kPa) land at 25-27 PSI — this is expected and unavoidable.

**Issue:** A rising pressure of 0.3 PSI/lap in the first 3-4 laps is completely normal tyre conditioning behavior, especially under S1 2026 Vision tread physics. The finding should only flag sustained build rates AFTER the conditioning window (lap 8+ for rears, lap 13+ for fronts), not during the warm-up phase.

### 3.4 ⚠ Conditioning Threshold Doesn't Account for Vision Tread
**Analysis:** `conditioningCorner.lapsTo85` flags as slow if > 8 laps.

**Skill says:** "Vision tread: fronts condition at +2.2-2.6°C/lap, rears +2.9-3.5°C/lap. Rears reach 85°C by lap 8-9, fronts by lap 13-15."

**Issue:** The `lapsTo85 > 8` threshold in the finding generator is wrong for Vision tread physics. Fronts taking 13-15 laps is *normal*, not a finding. The recommendation builder correctly has a Vision tread conditioning awareness block (lines 1857-1881), but the finding generator still creates WARNING/INFO findings for slow conditioning that will appear in the findings list alongside the "this is normal" recommendation — confusing.

### 3.5 ⚠ Axle Temperature Delta Threshold May Be Low
**Code:** Uses 6°C front-rear axle delta as the imbalance threshold.

**Issue:** The skill doesn't specify a numeric threshold for axle imbalance, but 6°C seems low given that Vision tread physics create inherently different conditioning rates between front and rear axles. During the first 8-10 laps, a 6°C axle delta could be pure conditioning timing, not a balance issue. The finding should be suppressed or annotated during the conditioning window.

### 3.6 ⚠ Shock Velocity Computation Uses Simple Finite Differences
**Code:** `(now - prev) * 1000 / dt` where dt = 1/tickRate

**Issue:** At 60 Hz, finite differences are noisy. The skill references "Penske Racing Shocks" thresholds and the code has a Savitzky-Golay filter in the DSP module — but the shock velocity computation doesn't use it. The raw finite difference approach will overestimate peak velocities due to sensor noise, potentially triggering false damper recommendations. The DSP module has `SG_PRESETS` for shock data that should be applied before velocity computation.

### 3.7 ⚠ ARB Blade Maxed Detection Threshold Is Wrong
**Code:** `farbAid.min <= 1 || farbAid.max >= 5`

**Issue:** The ARB blade range varies by car. The skill says blades are on a ~1-5 scale but some cars use different indexing (the code acknowledges `arbValueType === 'indexed'` vs `'descriptive'` in car profiles). The hardcoded 1 and 5 thresholds won't work for all cars. Additionally, the skill explicitly warns: if the driver is deliberately using blades corner-by-corner (low for slow corners, high for fast), do NOT flag it as maxed. The code doesn't check for intentional variation patterns.

### 3.8 ⚠ Wear L/R Mapping Doesn't Match O/M/I
**Finding generator:** Uses `lastWear.L - lastWear.R` for asymmetric wear detection.

**Issue:** The wear data uses `wearL`, `wearM`, `wearR` directly without the side-dependent O/M/I remapping that tyre temps correctly implement. For left tyres, `wearL` = outer and `wearR` = inner; for right tyres, it's reversed. The asymmetric wear finding should compare outer-vs-inner (after remapping), not raw L-vs-R, or the camber/alignment recommendation direction could be inverted for one side of the car.

---

## 4. Architecture Improvements

### 4.1 Connect the Disconnected Modules
Three sophisticated modules are built but disconnected from the pipeline:

| Module | Lines | Status |
|--------|-------|--------|
| `corner-detection.ts` | 466 | Complete but never called from `analyzeSession()` |
| `dsp/derived-channels.ts` | ~100 | Complete but outputs never consumed |
| `finding-types.ts` (Diagnosis stage) | 277 | Types defined, coupling matrix built, but no diagnosis generator exists |

Connecting these would enable per-corner findings ("understeer in T3 entry but oversteer in T7 exit") rather than per-lap averages, which is what the skill's diagnostic workflow demands.

### 4.2 Three-Stage Evidence Chain Is Incomplete
The architecture defines: **Raw Data → Findings → Diagnoses → Recommendations**

Currently implemented: Raw Data → Findings → ~~Diagnoses~~ → Recommendations

The `TelemetryDiagnosis` type in `finding-types.ts` is defined but no diagnosis generator exists. Findings feed directly into the recommendation builder via `buildTelemetryReasoning()` signals, skipping the causal interpretation layer. This means the system can't say "understeer is caused by front axle overloading from stiff front ARB + high brake bias compound effect" — it can only report individual findings.

### 4.3 Parameter Coupling Matrix Is Unused
`finding-types.ts` defines a `PARAMETER_COUPLINGS` array (135 lines) encoding vehicle dynamics interactions (front/rear heave spring ratio, ARB balance, toe effects, etc.) with direction, strength, and explanatory notes. This is never consumed by the recommendation builder. Using it would prevent conflicting recommendations (e.g., "stiffen front ARB" alongside "reduce front mechanical grip").

### 4.4 Finding Deduplication Needed
The finding generator can produce overlapping findings for the same root cause. Example: a tyre with crowning (over-pressure) will generate both a "crowning" thermal finding AND a "high pressure" finding AND potentially an "axle imbalance" finding — all stemming from one root cause. The diagnosis stage (if implemented) would deduplicate these, but without it, the recommendation list can contain 3-4 items that all say "fix this one tyre."

---

## 5. Recommended Implementation Priority

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| **P0** | Fix wear L/R → O/I remapping (§3.8) | 1 hour | Prevents inverted camber advice |
| **P0** | Fix Vision tread conditioning thresholds (§3.4) | 2 hours | Prevents false "slow conditioning" warnings |
| **P1** | Connect corner-detection to analysis pipeline (§4.1) | 1 day | Enables per-corner diagnostics |
| **P1** | Add speed-dependent damper diagnostic (§2.1) | 4 hours | Prevents opposite-direction damper advice |
| **P1** | Connect derived channels (§2.9) | 4 hours | Enables understeerAngle, aeroBalance |
| **P1** | Apply SG filter to shock velocity (§3.6) | 2 hours | Reduces false damper recommendations |
| **P2** | Implement LS rebound ratio check (§2.2) | 4 hours | Adds checklist item 9b |
| **P2** | Enhance bottoming with location data (§2.3) | 4 hours | Better bottoming diagnosis |
| **P2** | Build diagnosis generator (§4.2) | 2 days | Completes evidence chain |
| **P2** | Add steering angle analysis (§2.6) | 1 day | Most direct handling indicator |
| **P3** | Add gearing analysis (§2.7) | 4 hours | Safety check for Le Mans |
| **P3** | Add fuel load ride height compensation (§2.4) | 1 day | Session memory accuracy |
| **P3** | Implement damper histogram analysis (§2.5) | 1 day | Advanced diagnostic |
| **P3** | Wire parameter coupling matrix (§4.3) | 1 day | Conflict prevention |

---

## 6. Overall Assessment

**Grade: B+**

The engine is well-architected, type-safe, and encodes genuinely deep domain knowledge. The IBT parser, setup normalizer, and session memory system are production-quality. The 14-item checklist covers most of what the skill prescribes.

The main weakness is that the system operates on **per-lap aggregates** when the skill demands **per-corner, per-phase** analysis. Three modules that would enable this (corner detection, derived channels, diagnosis generator) are built but disconnected. Connecting them would elevate the engine from "good telemetry summary tool" to "proper setup engineer."

The physics inaccuracies (§3) are mostly threshold tuning issues rather than fundamental logic errors — fixable in a day. The missing features (§2) represent the difference between the current "observe and recommend" approach and the skill's full "diagnose root cause, then prescribe" workflow.

The codebase is clean, well-structured, and ready for these improvements. The evidence chain architecture (findings → diagnoses → recommendations) was designed for exactly this level of sophistication — the types and data structures are already in place, they just need to be connected.
