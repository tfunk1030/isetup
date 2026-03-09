# GTP Telemetry Analyzer — Project Specification & Handoff Document

## Executive Summary

A web-based telemetry analysis platform for iRacing's GTP Hypercar class (BMW M Hybrid V8, Porsche 963, Cadillac V-Series.R, Acura ARX-06, Ferrari 499P). The app parses iRacing's proprietary `.ibt` binary telemetry files directly in the browser, runs a 14-item automated engineering checklist, and presents results in an interactive dashboard. An optional AI layer uses the Anthropic API to provide natural-language setup diagnosis and recommendations.

Nothing like this exists in the market. Garage 61 does setup sharing but no telemetry analysis. Cosworth Pi Toolbox does telemetry but is paid desktop software. MoTeC i2 is powerful but desktop-only and requires IBT-to-LD conversion via a third-party tool (Mu). This would be the first web-based, GTP-specific, AI-augmented telemetry analysis tool.

The developer (Taylor Funk) is a professional golfer on PGA TOUR Americas who races iRacing GTP Hypercars competitively. He built the underlying physics knowledge, reference data, and analysis scripts over months of real IBT file analysis. This spec documents everything needed to turn a working prototype into a production application.

---

## What Exists Today (Prototype)

### Working Prototype: `gtp-telemetry-analyzer.jsx`

A single-file React component (~860 lines) that runs entirely in the browser. No backend required for core functionality.

#### IBT Binary Parser (JavaScript)
- **Ported from verified Python parser** (`parse_ibt.py` V3, validated against BMW M Hybrid V8 + Ferrari 499P IBT files from Sebring, 2026 Season 1)
- Reads the complete IBT binary format:
  - Main header (48 bytes): tick rate, session info offset/length, variable count, buffer offset/length
  - Disk sub header (offsets 112-143): record count, session timestamps
  - Variable headers (144 bytes each): channel name, type, data offset, unit, description
  - Session info: YAML block containing full garage setup (`CarSetup`), track/weather info (`WeekendInfo`), driver info (`DriverInfo`)
  - Data buffer: `recordCount × bufLen` bytes of telemetry samples at 60 Hz
- Handles all iRacing data types: char (0), bool (1), int32 (2), uint32/bitfield (3), float32 (4), float64 (5)
- Latin-1 decoding for session info YAML (iRacing uses latin-1, not UTF-8)
- Includes a simple YAML parser for the session info block (iRacing's YAML is mostly well-formed but not fully spec-compliant)

#### Analysis Engine
Implements the 14-item automated analysis checklist from the `sebring_analysis_v4.py` script:

1. **Session Header** — Car identification, driver (filters pace car via `CarIsPaceCar`), track, air/track temp, brake migration availability detection
2. **Setup Extraction** — Full `CarSetup` YAML tree flattened to key-value pairs
3. **Lap Times** — Lap detection from `Lap` channel, duration calculation, max speed per lap, best/spread/average, configurable valid lap time window based on track length
4. **Tyre Surface Temperatures** — Per-lap averages using last 50% of each lap for stability, Outer/Middle/Inner format per corner, flags <70°C (COLD) and >105°C (HOT)
5. **Tyre Conditioning Trend** — First-to-last lap temperature delta, °C/lap conditioning rate, estimated laps to reach 85°C operating window
6. **Tyre Pressures** — Per-lap hot pressure averages in kPa and PSI, flags >24 PSI
7. **Tyre Wear** — Not yet implemented in prototype (data extraction is there but UI display is minimal)
8. **Aero Platform** — Ride heights at >200 km/h, kerb-correlated bottoming analysis separating clean-track vs kerb events using `LapDistPct` zones
9. **Shock Velocity Analysis** — Per-corner shock velocity via finite differences (Δdefl/Δt), p95/p99/peak mm/s statistics, flags >500 (high) and >700 (extreme)
10. **G-Force Envelope** — Peak lateral, braking, and acceleration g from `LatAccel`/`LongAccel` channels (converted from m/s² to g)
11. **Engine Temps** — Not yet implemented in prototype dashboard (channel reading exists)
12. **Fuel** — Start/end levels, consumption rate per lap, range estimation
13. **Driver Aids** — Brake bias, TC1, TC2, ABS, FARB, RARB — detects constant vs changing, but lacks the full RARB speed-band correlation from the Python script
14. **Engineering Recommendations** — Not implemented (this is the AI layer)

#### Dashboard UI
- 5-tab layout: Overview, Tyres, Aero Platform, Dynamics, Setup
- Dark theme with amber accent (motorsport-appropriate palette)
- Recharts-based interactive charts: lap time bar chart, tyre temp line charts with 85/105°C reference lines, pressure line charts with 24 PSI threshold, ride height scatter plot by track position with bottoming reference line, g-force scatter plot, driver aid range bars
- Status badges (COLD/OK/HOT/SAFE/RISK/HIGH) with color coding
- Responsive grid layout
- JetBrains Mono for numeric data, DM Sans for UI text

#### Known Limitations of Prototype
- **YAML parser is naive** — handles most iRacing session info correctly but may fail on edge cases (nested arrays, multi-line values, special characters beyond basic escaping)
- **Kerb zones are hardcoded to Sebring** — `[[10,15], [40,47], [60,65]]` — needs per-track configuration
- **No RARB deep analysis** — the Python script correlates RARB blade changes with speed bands and lateral g; the prototype only detects if RARB changed
- **No engine temp display** — channels are read but not rendered
- **No tyre wear display** — data extracted but not shown
- **No multi-session support** — single IBT upload only
- **No data persistence** — everything is in memory, lost on page reload
- **No AI integration** — no Anthropic API calls
- **Large IBT files may be slow** — the per-sample loop in the channel reader is O(n) per channel; a 10-minute session at 60 Hz = 36,000 samples × ~60 channels = 2.16M reads
- **No error recovery** — if the IBT is malformed or from an unexpected car class, the parser may crash without helpful error messages
- **No PDF/report export**
- **No setup comparison between sessions**

---

## Reference Data (Verified, Ready to Integrate)

These files contain the domain knowledge that powers accurate analysis. They were built over months of real IBT file analysis and community research.

### `per-car-quirks.md` (V2, ~350 lines)
Car-specific setup knowledge with verified parameter values:
- **Critical Architecture Differences** — LMDh (BMW/Cadillac/Acura use Dallara/ORECA chassis, coil springs, `PushrodLengthOffset`, descriptive ARB labels) vs Ferrari 499P (bespoke LMH chassis, torsion bars, `PushrodLengthDelta`, indexed ARB values, front+rear diff preload, cornering mode hybrid param). Different damper click scales between cars (BMW LS comp 7 ≠ Ferrari LS comp 15).
- **BMW M Hybrid V8 [VERIFIED]** — Full Sebring setup with exact parameter values from IBT data. Validated findings: front heave 50 N/mm minimum for Sebring (30 N/mm caused 22 clean-track bottoming events with vortex burst instability), rear back-straight bottoming resolved via HS comp progression (5→6→7) and slope (11→10) not heave spring increase, RARB as primary live balance tool with 6-10 changes per lap, Vision tread conditioning rates (+2.2-2.6°C/lap fronts, +2.9-3.5°C/lap rears), fuel-load pushrod compensation rules, shock velocity validation of slope 10 vs 11.
- **Ferrari 499P [VERIFIED]** — Full Sebring setup with indexed parameter values, front+rear diff both at 0 Nm, 56.5% brake bias (vs BMW 46%), rear dampers massively stiffer than front (HS comp 40 vs 15), cornering mode (`HybridRearDriveCornerPct`), front-axle hybrid >190 km/h.
- **Cadillac, Porsche, Acura** — Community-sourced characteristics (not IBT-verified), handling DNA, key setup strategies per car.
- **Cross-Car Rankings** — Natural rotation, aero platform sensitivity, diff sensitivity, top speed, best use case by circuit type, setup effort required.
- **Track Classification Table** — 15 tracks with setup focus notes (Daytona, Sebring, COTA, Watkins Glen, Road Atlanta, Road America, Spa, Le Mans, Indianapolis GP, Laguna Seca, Monza, Nürburgring GP, Imola, Suzuka, Bathurst).
- **Wet/Rain Setup Guide** — Mandatory changes, recommended suspension changes, TC map management, Ferrari 499P wet advantage.

### `telemetry-channels.md` (V2, ~180 lines)
Complete channel reference verified from parsed Ferrari 499P IBT (302 channels, 60 Hz):
- All SDK variable names exactly as stored in the IBT binary
- Organized by category: Corner Shocks, Heave/Third Shocks, Ride Heights, Tyre Temps (24 channels with critical carcass vs surface temp warning), Tyre Pressures, Tyre Wear, Wheel Speeds, Brakes (including per-corner brake line pressure), Vehicle Dynamics, Driver Inputs, Hybrid/ERS, Weather, Fuel
- Unit conversion quick reference table (m/s→km/h, m/s²→g, kPa→PSI, m→mm, rad→deg)
- Diagnostic thresholds per channel
- Setup extraction paths for both IBT YAML and LDX XML methods
- Naming gotcha: L/M/R refers to tyre face viewed from behind (left tyres: L=outer; right tyres: R=outer)

### `ibt-parsing-guide.md` (V3, ~180 lines)
Complete IBT binary format specification:
- File structure overview (header → padding → disk sub header → buffer header → variable headers → session info YAML → data buffer)
- Byte-level offset tables for main header, padding, disk sub header
- Variable header structure (144 bytes: type, offset, count, name[32], description[64], unit[32])
- Type-to-format mapping for struct.unpack
- Session info YAML structure with real examples from BMW M Hybrid V8 at Sebring (CarSetup tree, DriverInfo with pace car filtering, WeekendInfo)
- Complete working Python parser (`parse_ibt()` function)
- 12 documented common pitfalls (pace car filtering, carcass temp unreliability, unit conversions, lap 0 is out-lap, latin-1 encoding, etc.)

### `sebring_analysis_v4.py` (~280 lines)
Production-grade Python analysis script implementing all 14 checklist items:
- Full IBT parsing with inline binary reader
- Kerb-correlated bottoming with three views: (a) all high-speed, (b) excluding kerb zones, (c) excluding kerbs AND back straight
- Back straight sub-sector analysis (35-50% in 3% bins)
- Shock velocity percentiles with clean-track vs kerb separation
- RARB deep analysis: speed-band correlation (0-80/80-150/150-220/220-300 kph), per-lap change counting, best-lap RARB change log with track position and speed, lateral g correlation
- Tyre surface temp with pressure diagnostic (crown/cup detection via mid vs edge comparison)
- Vision tread conditioning rate calculation with laps-to-85°C projection
- Structured engineering recommendations output with impact hierarchy reference

### `bmw_sebring_test_protocol.md` (~150 lines)
Structured 5-test protocol for validating setup changes:
- Baseline run → Test 1 (rear dampers only) → Test 2 (add rear pushrod) → Test 3 (front HS comp slope) → Test 4 (long stint validation) → Test 5 (sprint conditioning, optional)
- Decision gates per test (better/neutral/worse → proceed/adjust/rollback)
- Specific "what to check" at named corners
- Complete rollback procedure with baseline values table
- Summary table of all changes with physics rationale

---

## Architecture: What to Build

### Tech Stack (Recommended)

- **Framework:** Next.js 14+ with App Router (or standalone React + Vite for simpler deployment)
- **Language:** TypeScript throughout
- **Styling:** Tailwind CSS with custom design tokens matching the dark motorsport aesthetic
- **Charts:** Recharts (already used in prototype) + Plotly.js for more complex visualizations (3D g-force, track map overlays)
- **State Management:** Zustand or React Context (session data is the primary state)
- **Database:** Supabase (Postgres + Auth + Storage) for multi-session library
- **AI:** Anthropic API (Claude Sonnet for fast responses, Opus for complex diagnosis)
- **File Storage:** Supabase Storage or S3 for IBT files (20-80 MB each)
- **Deployment:** Vercel (Next.js native) or Cloudflare Pages

### Application Structure

```
gtp-telemetry/
├── app/
│   ├── layout.tsx                    # Root layout with dark theme
│   ├── page.tsx                      # Landing / upload page
│   ├── analyze/
│   │   └── page.tsx                  # Main analysis dashboard
│   ├── sessions/
│   │   └── page.tsx                  # Multi-session library (Tier 2)
│   ├── compare/
│   │   └── page.tsx                  # Cross-session comparison (Tier 2)
│   └── api/
│       ├── parse-ibt/route.ts        # Server-side IBT parsing (for large files)
│       └── diagnose/route.ts         # Claude API endpoint (Tier 3)
├── lib/
│   ├── ibt-parser.ts                 # IBT binary parser (port from prototype)
│   ├── analysis-engine.ts            # 14-item checklist analysis
│   ├── car-profiles.ts               # Per-car quirks as structured data
│   ├── track-profiles.ts             # Track classification + kerb zones
│   ├── unit-conversions.ts           # All SI → display conversions
│   └── types.ts                      # TypeScript interfaces for all data structures
├── components/
│   ├── upload/
│   │   ├── DropZone.tsx              # Drag-and-drop IBT upload
│   │   └── FileInfo.tsx              # File size, name, quick validation
│   ├── dashboard/
│   │   ├── SessionHeader.tsx         # Car, driver, track, temps, migration badge
│   │   ├── LapTimesChart.tsx         # Bar chart with best-lap highlight
│   │   ├── TyreTempsPanel.tsx        # Line chart + per-corner O/M/I detail cards
│   │   ├── TyrePressuresChart.tsx    # Line chart with 24 PSI threshold
│   │   ├── RideHeightScatter.tsx     # Track position vs ride height
│   │   ├── BottomingAnalysis.tsx     # Clean vs kerb breakdown
│   │   ├── ShockVelocityPanel.tsx    # Per-corner p95/p99/peak
│   │   ├── GForceScatter.tsx         # Lat vs Long g scatter
│   │   ├── FuelPanel.tsx             # Start/end/rate/range
│   │   ├── DriverAidsPanel.tsx       # Aid range bars with RARB correlation
│   │   ├── ConditioningTrend.tsx     # °C/lap rates + laps-to-85 projection
│   │   ├── EngineTemps.tsx           # Water/oil per lap
│   │   ├── SetupDump.tsx             # Full CarSetup display
│   │   └── RecommendationsPanel.tsx  # AI-powered (Tier 3)
│   ├── shared/
│   │   ├── Card.tsx
│   │   ├── MetricRow.tsx
│   │   ├── StatusBadge.tsx
│   │   └── TabBar.tsx
│   └── ai/
│       ├── DiagnosisChat.tsx         # Natural language diagnosis interface
│       └── TestProtocolGenerator.tsx # Generate test protocols from proposed changes
├── data/
│   ├── car-quirks/                   # Per-car JSON configs
│   │   ├── bmw-m-hybrid-v8.json
│   │   ├── ferrari-499p.json
│   │   ├── cadillac-v-series-r.json
│   │   ├── porsche-963.json
│   │   └── acura-arx-06.json
│   └── tracks/                       # Per-track JSON configs
│       ├── sebring.json              # Includes kerb zones, valid lap window, sector definitions
│       ├── daytona.json
│       ├── cota.json
│       └── ... (15 total)
└── prompts/
    └── setup-engineer.md             # System prompt for Claude API calls
```

---

## Feature Tiers

### Tier 1: Free — IBT Dashboard (No AI, No Backend)

Everything runs client-side. No authentication required.

**Must implement:**
- [ ] IBT drag-and-drop upload with file validation (check magic bytes, file size sanity)
- [ ] Full 14-item analysis with all items displaying correctly
- [ ] Fix: Engine temps display (data reading exists, needs UI)
- [ ] Fix: Tyre wear display (data reading exists, needs UI)
- [ ] Fix: YAML parser edge cases (test against multiple car types, multi-class sessions)
- [ ] Per-track kerb zone configurations (Sebring is done, need 14 more)
- [ ] Per-track valid lap time windows (auto-detect from track length in session info)
- [ ] Car-type detection from `CarScreenName` for brake migration badge and parameter naming
- [ ] RARB deep analysis: speed-band correlation, per-lap change log, lateral g buckets (port from Python)
- [ ] Splitter ride height (`CFSRrideHeight`) analysis and display
- [ ] Performance optimization: Web Worker for IBT parsing to prevent UI blocking
- [ ] Performance optimization: consider typed array batch reading instead of per-sample loop
- [ ] Error handling: graceful failure with helpful messages for malformed IBTs, non-GTP cars, short sessions
- [ ] PDF report export (html2pdf or server-side generation)
- [ ] Setup comparison: upload two IBTs, diff their CarSetup blocks, highlight changes with parameter descriptions

**Design requirements:**
- Dark theme mandatory (motorsport context, often used in dimly lit sim rigs)
- JetBrains Mono or similar monospace for all numeric data
- Status badges with clear color coding (blue=cold, green=ok, red=hot/risk, amber=warning)
- Mobile-responsive but desktop-primary (telemetry analysis is a desk activity)
- No generic AI aesthetic — this is a tool for engineers, not a consumer app

### Tier 2: Premium — Multi-Session Intelligence (Light Backend)

Requires Supabase backend for persistence and auth.

- [ ] User authentication (Supabase Auth)
- [ ] Session library: upload, tag (car/track/date/notes), browse, search, delete
- [ ] IBT file storage (Supabase Storage, 20-80 MB per file)
- [ ] Cross-session comparison: select 2+ sessions, overlay lap times, tyre temps, ride heights, shock velocities
- [ ] Fuel-load-normalized pushrod comparison (flag pushrod differences when fuel loads differ >20L, compare resulting ride heights instead)
- [ ] Setup evolution tracking: show how a setup changed across sessions (e.g., BMW Sebring S1→S2→S3→S4 progression)
- [ ] Automated improvement detection: "bottoming events decreased from 22 to 4 to 0", "shock velocity p99 dropped from 323 to 286 mm/s"
- [ ] Pre-built decision trees for common diagnoses (based on per-car-quirks knowledge):
  - Rear bottoming detected + heave spring already adequate → recommend HS comp/slope before heave spring
  - Tyre temps below window after N laps → calculate conditioning rate, flag only if rate is zero/negative
  - Asymmetric rear temps → check diff preload
  - FARB constantly changing → base ARB diameter may be wrong
  - Brake bias drifting during stint → base bias wrong for fuel window
- [ ] Per-track leaderboard: personal bests, setup notes per track

### Tier 3: AI Engineer — Claude-Powered Analysis

Requires Anthropic API key.

- [ ] Natural language diagnosis: "My car understeers mid-corner at the T7 hairpin" → structured diagnosis with parameter recommendations
- [ ] System prompt: use the 87-line `setup-engineer.md` agent prompt with `per-car-quirks.md` loaded as context for the specific car
- [ ] Context-aware: pre-load the current session's setup data and analysis results into the Claude prompt so the AI references YOUR actual telemetry
- [ ] Test protocol generation: describe proposed changes → generate structured 5-test protocol with decision gates (based on `bmw_sebring_test_protocol.md` template)
- [ ] Streaming responses for real-time diagnosis experience
- [ ] Conversation history within a session (multi-turn diagnosis refinement)
- [ ] Cost management: use Sonnet for quick questions, offer Opus for deep analysis

---

## Critical Domain Rules (Must Be Enforced in Code)

These are physics and sim-specific constraints that the app MUST enforce. Getting any of these wrong produces misleading analysis.

### Unit Conversions (apply everywhere)
```typescript
const CONVERSIONS = {
  speedToKph: (mps: number) => mps * 3.6,
  accelToG: (mps2: number) => mps2 / 9.81,
  pressureToPSI: (kpa: number) => kpa / 6.895,
  heightToMM: (m: number) => m * 1000,
  angleToDegs: (rad: number) => rad * (180 / Math.PI),
};
```

### Tyre Temperature Rules
- ALWAYS use surface temps (`tempL/M/R`) as primary diagnostic
- Carcass temps (`tempCL/CM/CR`) may remain at ambient for entire short stints — VERIFY before using (known issue: BMW carcass stayed flat at 34.8°C across 4 laps at Sebring while surface ranged 50-75°C)
- For left-side tyres: `tempL` = outer, `tempR` = inner
- For right-side tyres: `tempR` = outer, `tempL` = inner
- Pressure diagnostic from temp: `middle - avg(outer, inner)` > 3 = crowning (high pressure); < -3 = cupping (low pressure)
- Operating window: 85-105°C surface. Peak grip ~95-100°C.
- Below 70°C after 3+ laps → check if Vision tread conditioning (S1 2026+) before flagging as problem

### Bottoming Analysis Rules
- ALWAYS correlate bottoming with track position (`LapDistPct`) before recommending changes
- Kerb strikes are driving choices, NOT setup failures
- Report as "X events on clean track, Y events on kerbs"
- Only clean-track bottoming indicates a platform problem
- Front RH has a 30.0mm sim-enforced minimum across ALL GTP cars

### Fuel-Load Awareness
- Never compare pushrod offset values across sessions with different fuel loads
- Less fuel = less weight = springs uncompress = car sits higher
- Compare RESULTING ride height, not raw pushrod values
- If bottoming appears at low fuel but not full fuel, check speed/inertia difference first

### Car Architecture Differences
- NEVER transfer parameter values between cars
- BMW `PushrodLengthOffset` ≠ Ferrari `PushrodLengthDelta` (different naming)
- BMW ARBs: "Soft"/"Medium"/"Stiff" ≠ Ferrari ARBs: "A"/"B"/"C" (different value types)
- BMW damper LS comp 7 clicks ≠ Ferrari LS comp 15 clicks (different scales)
- BMW brake bias 46% ≠ Ferrari brake bias 56.5% (different architectures)
- Ferrari has BOTH front AND rear diff preload; LMDh cars have rear only
- Brake migration: BMW NO, Cadillac YES, Porsche YES, Acura NO, Ferrari YES (added S3 2025)

### Shock Velocity Thresholds (from Penske Racing Shocks)
- Low-speed: 0-75 mm/s shaft velocity (body roll, pitch, weight transfer)
- High-speed: 75+ mm/s (bumps, kerbs, surface impacts)
- Extreme: >700 mm/s (kerb strikes — verified: RF hit 991 mm/s at Sebring T4)
- If peaks >700 with linear slope → recommend digressive HS comp slope (lower click values)

### Vision Tread Tire Model (S1 2026+)
- Tires condition progressively over a stint
- A 5-lap stint may NOT reach 85°C operating window — this is NORMAL
- Calculate conditioning rate (°C/lap) and project laps to reach window
- For sprint: more camber + toe-out accelerates thermal buildup
- For endurance: conditioning handles itself over 8-15 laps

---

## Data Structures (TypeScript Interfaces)

```typescript
interface IBTParsed {
  sessionInfo: SessionInfo;
  vars: Record<string, ChannelVar>;
  readChannel: (name: string) => Float64Array | null;
  recordCount: number;
  tickRate: number;
}

interface ChannelVar {
  type: number;      // 0-5 mapping to char/bool/int32/uint32/float32/float64
  offset: number;    // byte offset within each data sample
  count: number;     // array size (usually 1)
  desc: string;
  unit: string;
}

interface SessionAnalysis {
  header: SessionHeader;
  setup: [string, any][];              // Flattened CarSetup key-value pairs
  lapTimes: LapTime[];
  bestTime: number;
  tyreTempData: TyreTempLap[];
  tyrePressureData: TyrePressureLap[];
  tyreWearData: TyreWearData;
  rideHeightData: RideHeightSample[];
  bottoming: { clean: number; kerb: number; byLocation: BottomingEvent[] };
  shockVelStats: Record<string, ShockVelCorner>;
  gForceData: GForceSample[];
  peakLatG: number;
  peakBrakeG: number;
  peakAccelG: number;
  fuel: FuelData;
  aids: Record<string, DriverAid>;
  conditioning: Record<string, ConditioningCorner> | null;
  engineTemps: EngineTempsLap[];
  rarb: RARBAnalysis | null;
  validLaps: number[];
}

interface CarProfile {
  name: string;
  chassis: 'dallara' | 'multimatic' | 'oreca' | 'ferrari_lmh';
  hasBrakeMigration: boolean;
  pushrodParamName: 'PushrodLengthOffset' | 'PushrodLengthDelta';
  arbValueType: 'descriptive' | 'indexed';
  diffArchitecture: 'rear_only' | 'front_and_rear';
  setupPathPrefix: {
    brakesDiff: 'BrakesDriveUnit' | 'Systems';
    dampers: 'Chassis' | 'Dampers';
  };
  knownQuirks: string[];
}

interface TrackProfile {
  name: string;
  length_km: number;
  type: string;
  kerbZones: [number, number][];       // LapDistPct ranges (0-100)
  validLapWindow: [number, number];    // [min_seconds, max_seconds]
  backStraightZone?: [number, number]; // For sub-sector analysis
  setupFocus: string;
  mandatoryGearStack?: 'Short' | 'Medium' | 'Long';
}
```

---

## Potential Enhancements (Future Roadmap)

### Track Map Visualization
- Render a 2D track map using GPS coordinates from iRacing (community SVGs exist for most tracks)
- Overlay telemetry data on the map: color-coded speed trace, bottoming event markers, RARB change locations, braking zones, throttle application points
- Click on any point on the map to see all channel values at that track position
- This would be a significant differentiator — no existing tool does this for iRacing GTP

### Real-Time Telemetry (Desktop App)
- Connect to iRacing's live telemetry API via shared memory (Windows only)
- Stream data to the web dashboard via WebSocket
- Live tyre temps, pressures, ride heights during practice sessions
- Requires an Electron or Tauri wrapper for shared memory access, or a lightweight Python/C++ bridge

### Setup Optimizer (Experimental)
- Given a handling problem + current setup + telemetry data, generate ranked setup change proposals
- Use Claude with the full per-car-quirks context + the parameter cascade rules
- Present as "Proposal A: Stiffen rear ARB (trade: less rotation in slow corners)" vs "Proposal B: Reduce diff preload (trade: less entry stability)"
- NOT automatic — present options for the engineer to decide

### Community Features
- Setup sharing with attached telemetry validation ("this setup was tested and produced these results")
- Track-specific setup leaderboards with verified lap times from IBT data
- Community kerb zone definitions that can be crowdsourced and refined

### Multi-Class Session Support
- IBT files from multi-class sessions contain all drivers in `DriverInfo.Drivers[]`
- The telemetry only logs YOUR car's channels, but session info lists all cars on track
- Display relative performance: your sector times vs class leaders, gap evolution
- Requires matching driver entries by `CarIdx` and `DriverCarIdx`

### Endurance-Specific Features
- Stint analysis: fuel window optimization, tyre degradation curves across double/triple stints
- Driver swap tracking: detect driver changes from `DriverInfo` updates
- Pit stop timing analysis
- Fuel save mode detection (correlate throttle traces with fuel consumption rate)

### Mobile Companion App
- Quick session summary view optimized for phone screens
- Push notifications when IBT analysis completes (if using server-side parsing)
- React Native with shared analysis engine (TypeScript core is portable)
- This is secondary — telemetry analysis is fundamentally a desktop activity

---

## Files to Include in Project

When setting up the project, include these source files for reference:

| File | Purpose | Location |
|------|---------|----------|
| `gtp-telemetry-analyzer.jsx` | Working prototype (single-file React) | Root or `/prototype` |
| `per-car-quirks.md` | Car-specific verified data | `/data/reference/` |
| `telemetry-channels.md` | Channel reference (302 channels) | `/data/reference/` |
| `ibt-parsing-guide.md` | IBT binary format spec | `/data/reference/` |
| `sebring_analysis_v4.py` | Python analysis script (reference implementation) | `/data/reference/` |
| `bmw_sebring_test_protocol.md` | Test protocol template | `/data/reference/` |
| `setup-engineer.md` | AI agent system prompt | `/prompts/` |
| `parse_ibt.py` | Standalone Python IBT parser | `/scripts/` |

---

## Priority Order for Development

1. **Extract prototype into proper component architecture** — split the 860-line single file into the component structure above
2. **Fix the YAML parser** — test against BMW, Ferrari, Cadillac, Porsche, Acura IBTs and multi-class session IBTs. Consider using a proper YAML parsing library (js-yaml) instead of the custom parser
3. **Add missing dashboard items** — engine temps, tyre wear, RARB deep analysis, splitter analysis
4. **Build per-track and per-car JSON configs** — extract structured data from per-car-quirks.md and track classification table into typed JSON files
5. **Performance: Web Worker for parsing** — move IBT binary parsing into a Web Worker so the UI doesn't freeze on large files
6. **Setup comparison view** — upload 2 IBTs, diff CarSetup blocks
7. **PDF report export** — generate a clean engineering report from the analysis
8. **Supabase integration** — auth, session storage, multi-session library
9. **Claude API integration** — diagnosis endpoint with streaming, system prompt from setup-engineer.md
10. **Cross-session comparison** — overlay charts, automated improvement detection
