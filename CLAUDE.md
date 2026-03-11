# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This repository contains three projects for iRacing GTP/Hypercar telemetry analysis, setup engineering, and physics-based setup generation:

1. **`gtp-telemetry/`** — A local-first React 19 browser app that parses `.ibt` telemetry files client-side, runs engineering analysis, renders chart dashboards, and exports PDF reports. There is no backend.
2. **`iracing-gtp-engineer-plugin/`** — A Claude Code plugin with a setup-engineering skill, 3 slash commands (`/analyze-ibt`, `/diagnose`, `/setup-compare`), and a standalone Python IBT parser.
3. **`gtp-setup-builder/`** — A physics-based setup calculator that uses aero response surfaces, track demand profiles, and constraint satisfaction to generate optimal setup parameters from first principles for any car/track combination. Not a database — a solver.
4. **Root docs** — `SKILL.md` (master skill definition), `per-car-quirks.md`, `telemetry-channels.md`, `ibt-parsing-guide.md` are domain reference material shared across all projects.
5. **`template app/`** — A Python Flask prototype (legacy reference, not the primary app).

## Build & Development Commands

All telemetry app commands run from `gtp-telemetry/`:

```bash
cd gtp-telemetry
npm install          # install dependencies
npm run dev          # start Vite dev server (port 5173)
npm run build        # type-check (tsc -b) + production build
npm run lint         # ESLint
npm run preview      # preview production build
```

For the Python IBT parser:
```bash
python -m py_compile iracing-gtp-engineer-plugin/scripts/parse_ibt.py
```

For the setup builder:
```bash
cd gtp-setup-builder
pip install -r requirements.txt   # numpy, scipy, openpyxl
python -m aero_model.parse_all    # parse all 33 aero map xlsx files
python -m solver.solve --car bmw --track sebring --wing 17  # generate setup
```

There is no automated test suite for the telemetry app. Validation is lint + build + manual smoke testing. The setup builder validates against real IBT telemetry sessions (see `gtp-setup-builder/data/telemetry/MANIFEST.md`).

## Architecture

### Telemetry App Data Flow

```
.ibt file upload → session-store.ts (orchestrator)
  → ibt-parser.ts (binary parse + YAML session info)
  → car-profiles.ts / track-profiles.ts (detection)
  → analysis-engine.ts (produces SessionAnalysis)
  → dashboard components (consume analysis)
  → pdf-export.ts (browser PDF generation)
```

- **`src/store/session-store.ts`** — Zustand store that orchestrates the entire file→parse→analyze pipeline. Central coordination point.
- **`src/lib/ibt-parser.ts`** — Browser-side binary parser using `DataView` offsets and `TextDecoder('latin1')`. Fragile to structural changes — be conservative.
- **`src/lib/analysis-engine.ts`** — Produces the `SessionAnalysis` object consumed by all dashboard panels and PDF export. Data shape changes here ripple widely.
- **`src/lib/types.ts`** — All shared TypeScript interfaces. The `SessionAnalysis` type defines the contract between analysis and UI.
- **`src/components/dashboard/`** — 15 chart/analysis panels, each consuming fields from `SessionAnalysis`. `SessionHeader` is the exception — it reads directly from the store.
- **`src/components/shared/`** — Reusable UI primitives (`Card`, `MetricRow`, `StatusBadge`, `TabBar`).
- **`src/data/car-quirks/`** and **`src/data/tracks/`** — Static JSON profiles for 5 GTP cars and 16 tracks. Car/track support is data-driven.

### Setup Builder Architecture

```
aero maps (xlsx) → aero_model/ (interpolated response surfaces)
IBT files        → track_model/ (surface spectrum, braking zones, corner speeds)
car definitions  → car_model/ (mass, motion ratios, tyre curves, parameter ranges)
                       ↓
                   solver/ (6-step constraint satisfaction)
                       ↓
                   output/ (.sto setup files, human-readable reports)
```

The solver follows a strict 6-step workflow — **dampers are always last, never first**:
1. **Rake/ride heights** — target DF balance from aero map, maximize L/D
2. **Heave/third springs** — minimum rate to keep bottoming below threshold
3. **Corner springs** — balance mechanical grip vs platform control
4. **ARBs** — target LLTD for neutral steady-state balance
5. **Wheel geometry** — optimize contact patch across roll range
6. **Dampers** — fine-tune transient response (speed-dependent reasoning required)

See `gtp-setup-builder/CLAUDE.md` for detailed module specs, constraint definitions, and validation strategy.

### Plugin Structure

- **`plugin.json`** — Manifest defining 1 skill + 3 commands. Must stay in sync with `install.ps1`.
- **`install.ps1`** — Windows installer. Must match manifest paths and on-disk layout.
- **`scripts/parse_ibt.py`** — Standalone Python parser, parity reference for the browser parser.
- **`skills/iracing-gtp-engineer/references/`** — Canonical reference docs (nested path).

### Tech Stack

**Telemetry App:** React 19, TypeScript 5, Vite 7, Tailwind CSS 4, Zustand (state), Recharts (charts), jspdf + html2canvas (PDF export), js-yaml (session info parsing). Path alias: `@` → `src/`.

**Setup Builder:** Python 3.11+, numpy/scipy (interpolation & optimization), openpyxl (xlsx parsing).

## Key Conventions

- **Local-first browser app** — never assume a backend exists for the telemetry app.
- **Parser conservatism** — `ibt-parser.ts` uses direct offset handling; be very careful with structural changes to offsets and encoding.
- **Analysis-driven UI** — dashboard panels consume `SessionAnalysis`. New metrics must be added to both the analysis engine AND consuming panels.
- **Dual parser parity** — changes to channel names, units, or parsing behavior should be reflected in both `ibt-parser.ts` and `parse_ibt.py`, plus reference docs.
- **Plugin sync** — if you add/rename commands, skills, or files in the plugin, update both `plugin.json` and `install.ps1`.
- **Setup builder: physics first** — every parameter value must be justified by a physical constraint, not pattern matching or "what worked before." The solver reasons from aero maps, track demands, and vehicle dynamics, not from a database of previous setups.
- **Setup builder: 6-step workflow is mandatory** — the solver must follow the step order (rake → heaves → corner springs → ARBs → geometry → dampers). Never recommend damper changes before the foundation is right.
- **Setup builder: speed-dependent damper reasoning** — the same damper change can have opposite effects at different speeds. Below ~150 kph weight transfer rate dominates. Above ~200 kph aero/ride height effects dominate. Always identify the speed of the problem before recommending damper changes.
- **Domain reference** — consult `SKILL.md` and `per-car-quirks.md` for telemetry domain knowledge before inventing assumptions. These files contain verified findings from 12+ telemetry sessions across BMW, Ferrari, and Porsche at Sebring.

## Supported Cars

BMW M Hybrid V8, Cadillac V-Series.R, Porsche 963, Acura ARX-06, Ferrari 499P. Each has different parameter naming, value types, and setup architectures — values do not transfer between cars. See `per-car-quirks.md`.

**Aero maps available** for all 5 cars (33 xlsx files in `gtp-setup-builder/data/aeromaps/`): DF balance and L/D as a function of front RH × rear RH at every wing angle (12-17° for most cars, 6-10° for Acura).

## Validation Checklist

After changes to the telemetry app:
1. `npm run lint` passes
2. `npm run build` succeeds
3. App loads without a file uploaded
4. `.ibt` upload still works
5. Dashboard tabs render without errors
6. PDF export completes

After plugin changes:
1. `python -m py_compile` passes on `parse_ibt.py`
2. Every path in `plugin.json` exists on disk
3. `install.ps1` copy steps match the manifest

After setup builder changes:
1. Aero map parsing produces correct values (BMW 17-wing at front RH 15mm / rear RH 40mm should give DF balance ~50.14% and L/D ~3.795)
2. Solver output follows the 6-step workflow order
3. Solver predictions validated against at least one real IBT session
4. No parameter values recommended outside the car's valid range
