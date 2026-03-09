# Plan: Setup Recommendation Engine

## Context

The GTP telemetry app currently parses IBT files and displays raw data across 15 dashboard panels with color-coded status badges (COLD/OK/HOT etc.), but provides **zero actionable setup recommendations**. The user sees numbers and charts but must interpret everything themselves. Meanwhile, car profiles (5 cars with `knownQuirks`, `hasBrakeMigration`, `diffArchitecture`, etc.) and track profiles (16 tracks with `setupFocus`, `type`) exist in the data layer but are **completely ignored** by the analysis engine (`_carProfile` is an unused parameter). The domain knowledge in `SKILL.md` defines a clear priority hierarchy and diagnosis workflow that should drive recommendations.

**Goal:** Add a recommendation engine that produces prioritized, car-specific, actionable engineering advice from the existing analysis data, surfaced in both the dashboard and PDF export.

---

## Files to Create

### 1. `gtp-telemetry/src/lib/recommendation-engine.ts` (~450 lines)

New file. Pure function `generateRecommendations(analysis, carProfile, trackProfile) → Recommendation[]`.

Internally organized as independent rule evaluator functions, each returning `Recommendation[]`. The orchestrator calls all rules, collects results, sorts by severity then priority, and caps at 15 recommendations.

**Rule functions (11 total, each maps to a domain area):**

#### `checkTyreTemperatures` (priority 7, car-specific escalation)
- Uses last valid lap from `analysis.tyreTempData`
- Corner avg < `TYRE_TEMP.COLD` (70°C) after 3+ laps → warning: "Check pressures, consider less negative camber"
- Corner avg > `TYRE_TEMP.HOT` (105°C) → warning: "Reduce camber 0.25-0.5°, check diff preload, soften ARB"
- I-O spread > 15°C (inner hot) → info: "Reduce negative camber by 0.25°"
- I-O spread < -10°C (outer hot) → info: "Add 0.25° negative camber"
- Mid vs edges > `ANALYSIS.PRESSURE_CROWN_THRESHOLD` (3°C) → info: "Tyre crowning — pressure high but at sim minimum, compensate with camber"
- Mid vs edges < `ANALYSIS.PRESSURE_CUP_THRESHOLD` (-3°C) → info: "Tyre cupping"
- **BMW quirk** (`cold-tyre-snap`): all temps < 75°C on early laps → info: "BMW snap risk — increase TC first 2 laps"

#### `checkTyrePressures` (priority 9)
- Uses last valid lap from `analysis.tyrePressureData`
- Any corner > `TYRE_PRESSURE.HIGH_THRESHOLD` (24 PSI) → info with sim-constraint acknowledgment: "Hot pressure exceeds target but cold already at minimum 22 PSI. Focus on camber/alignment/ARB instead."

#### `checkAeroPlatform` (priority 1-2, critical)
- `analysis.bottoming.clean > 5` → critical: "Stiffen front heave spring or increase HS compression damping. Do NOT raise front RH (30mm hard minimum)."
- `analysis.bottoming.clean` 1-5 → warning: same advice, lower severity
- `analysis.splitter?.bottomingCount > 0` → critical: "Splitter hitting ground — stiffen front heave spring"
- `analysis.splitter?.minHeight < 5` mm → warning: "Splitter dangerously low"
- **BMW quirk** (`rear-bottoming-fix-via-hs-comp-not-heave`): rear bottoming → warning: "BMW: increase HS comp damping rather than heave spring"
- Uses `carProfile.pushrodParamName` for parameter naming

#### `checkShockVelocity` (priority 4)
- Uses `analysis.shockVelStats`
- Any corner peak > `SHOCK_VELOCITY.EXTREME` (700 mm/s) → critical: "Lower HS comp slope (more digressive)"
- Any corner p95 > `SHOCK_VELOCITY.HIGH` (500 mm/s) → warning: "Damper working hard, consider more digressive HS comp slope"
- If `trackProfile.type` includes "bumpy" → append track-specific note
- Front-only extreme + rear OK → warning: "Front platform instability — check front heave spring"

#### `checkMechanicalBalance` (priority 3)
- Front avg temp > rear avg temp by >10°C → info: "Possible understeer — soften front ARB or stiffen rear ARB"
- Rear > front by >10°C → info: "Possible oversteer — stiffen front ARB or soften rear ARB"
- RARB not constant in `analysis.aids` → warning: "RARB adjustments detected — driver searching for balance. If blade maxed, step ARB diameter."
- FARB not constant → warning: same pattern
- **Porsche quirk** (`rear-limited-understeer`, `needs-aggressive-rear-arb`): understeer detected → info: "Porsche slow-corner understeer — stiffen rear ARB aggressively"
- **Acura quirk** (`best-low-speed-rotation`): any balance issue → info: "Acura handling dominated by diff preload — check diff before ARBs"

#### `checkDriverAids` (priority 5)
- Brake bias not constant → warning: "Base bias wrong for fuel window" + if `carProfile.hasBrakeMigration`, note migration interaction
- TC increasing through stint (max > avg + 1) → warning: "Rear tyres overheating — check diff preload, rear ARB, rear camber"
- ABS not constant → info: "Review brake bias and master cylinder setup"

#### `checkConditioning` (priority 7)
- Uses `analysis.conditioning`
- Any corner `lapsTo85 > 5` AND rate < 2°C/lap → info: "Slow conditioning"
- Any corner rate negative → warning: "Tyre cooling — tyre not generating heat, check contact patch"

#### `checkEngineTemps` (priority 8)
- Uses last lap from `analysis.engineTemps`
- Water > `ENGINE_TEMP.WATER_WARNING` (110°C) → warning
- Oil > `ENGINE_TEMP.OIL_WARNING` (130°C) → warning

#### `checkFuelCompensation` (priority 6)
- Requires 3+ valid laps and fuel burn > 15L
- Compare first vs last lap front avg temps: increase > 5°C → info: "Fuel-load balance shift toward understeer late in stint"
- Rear temps increase significantly → info: "Late-stint oversteer risk"

#### `checkTrackSpecific` (priority varies)
- `trackProfile.mandatoryGearStack` set → info: "Track requires {stack} gear stack"
- `trackProfile.setupFocus` + shock peaks > 500 mm/s → warning: "Track demands compliant suspension"

#### `checkCrossPanelSynthesis` (priority 2, highest value)
- Bottoming > 0 AND shock peak > 700 AND splitter min < 5mm → critical: "Aero platform failure — heave spring is highest priority fix"
- High rear temps + TC not constant + RARB not constant → warning: "Rear balance cascade — root cause likely diff preload or rear ARB"
- All temps cold + all pressures high + wear minimal → info: "Underworked tyres — contact patch not being utilized"

**Edge cases:**
- If `carProfile` is null → skip car-specific rules, universal rules still run
- If `trackProfile` is null → skip track-specific rules
- If < 3 valid laps → add info: "Short stint — trends may not be reliable"
- If 0 recommendations → return single info: "No significant issues. Setup appears well-balanced."
- If `analysis.tyreTempData` is empty → skip all tyre rules, return info about missing data

---

### 2. `gtp-telemetry/src/components/dashboard/RecommendationsPanel.tsx` (~120 lines)

New component. Props: `{ analysis, carProfile, trackProfile }`.

- Calls `generateRecommendations()` via `useMemo`
- Groups by category, ordered: aero → tyres → mechanical → dampers → diff → brakes → driver-aids → fuel → engine → gearing
- Each recommendation renders as:
  - Severity dot (red/amber/blue using existing `COLORS.red`/`COLORS.accent`/`COLORS.blue`)
  - Bold title
  - Description in `textDim` color
  - Evidence in `textMuted` monospace
  - Parameter badge if present (the specific garage parameter name)
  - Car-specific note in italics if present
- Uses existing `Card` component wrapper
- Categories shown as section headers within the card
- Empty state: green "All Clear" message

---

## Files to Modify

### 3. `gtp-telemetry/src/lib/types.ts`

Add at end:

```typescript
export type RecommendationCategory =
  | 'aero' | 'tyres' | 'mechanical' | 'dampers' | 'brakes'
  | 'diff' | 'driver-aids' | 'fuel' | 'gearing' | 'engine';

export type RecommendationSeverity = 'critical' | 'warning' | 'info';

export interface Recommendation {
  id: string;
  category: RecommendationCategory;
  priority: number;
  severity: RecommendationSeverity;
  title: string;
  description: string;
  evidence: string;
  parameter?: string;
  carSpecific?: string;
}
```

### 4. `gtp-telemetry/src/App.tsx`

- Add lazy import for `RecommendationsPanel`
- In the `overview` tab section, add `RecommendationsPanel` as full-width component above the existing grid
- Pull `carProfile` and `trackProfile` from `useSessionStore()` (already available in store)

### 5. `gtp-telemetry/src/lib/pdf-export.ts`

- Update `exportPDF` signature to accept optional `carProfile` and `trackProfile`
- Add "Setup Recommendations" section at the end (before `doc.save`)
- Call `generateRecommendations()` and render each recommendation with severity-colored title, description, and evidence
- Update the call site in `SessionHeader.tsx` to pass carProfile and trackProfile

### 6. `gtp-telemetry/src/components/dashboard/SessionHeader.tsx`

- Update `exportPDF()` call to pass `carProfile` and `trackProfile` from the store

---

## Implementation Sequence

1. **Types** — Add interfaces to `types.ts`
2. **Engine** — Create `recommendation-engine.ts` with all 11 rule functions
3. **Panel** — Create `RecommendationsPanel.tsx`
4. **App** — Wire panel into `App.tsx` overview tab
5. **PDF** — Update `pdf-export.ts` + `SessionHeader.tsx` for recommendations in export
6. **Verify** — lint, build, smoke test

---

## Verification

```bash
cd gtp-telemetry
npm run lint
npm run build
```

Then manual smoke test:
1. App loads without file — no errors
2. Upload an IBT file — recommendations panel appears on Overview tab
3. Recommendations show car-specific advice if car is detected
4. Recommendations show track-specific notes if track is detected
5. Edge case: upload with unknown car — universal rules still fire, no car-specific rules
6. PDF export includes recommendations section at the end
7. All existing dashboard tabs still render correctly

---

## What This Does NOT Change

- **Analysis engine** (`analysis-engine.ts`) — untouched. `_carProfile` stays unused there. Recommendations consume profiles downstream.
- **Parser** (`ibt-parser.ts`) — untouched
- **Session store** — no new state. Recommendations are computed reactively in the component via `useMemo`
- **Existing panels** — untouched. Recommendations panel is additive.
