# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This repository contains two projects for iRacing GTP/Hypercar telemetry analysis and setup engineering:

1. **`gtp-telemetry/`** — A local-first React 19 browser app that parses `.ibt` telemetry files client-side, runs engineering analysis, renders chart dashboards, and exports PDF reports. There is no backend.
2. **`iracing-gtp-engineer-plugin/`** — A Claude Code plugin with a setup-engineering skill, 3 slash commands (`/analyze-ibt`, `/diagnose`, `/setup-compare`), and a standalone Python IBT parser.
3. **Root docs** — `SKILL.md` (master skill definition), `per-car-quirks.md`, `telemetry-channels.md`, `ibt-parsing-guide.md` are domain reference material.
4. **`template app/`** — A Python Flask prototype (legacy reference, not the primary app).

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

There is no automated test suite. Validation is lint + build + manual smoke testing (file upload, dashboard rendering, PDF export).

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

### Plugin Structure

- **`plugin.json`** — Manifest defining 1 skill + 3 commands. Must stay in sync with `install.ps1`.
- **`install.ps1`** — Windows installer. Must match manifest paths and on-disk layout.
- **`scripts/parse_ibt.py`** — Standalone Python parser, parity reference for the browser parser.
- **`skills/iracing-gtp-engineer/references/`** — Canonical reference docs (nested path).

### Tech Stack

React 19, TypeScript 5, Vite 7, Tailwind CSS 4, Zustand (state), Recharts (charts), jspdf + html2canvas (PDF export), js-yaml (session info parsing). Path alias: `@` → `src/`.

## Key Conventions

- **Local-first browser app** — never assume a backend exists.
- **Parser conservatism** — `ibt-parser.ts` uses direct offset handling; be very careful with structural changes to offsets and encoding.
- **Analysis-driven UI** — dashboard panels consume `SessionAnalysis`. New metrics must be added to both the analysis engine AND consuming panels.
- **Dual parser parity** — changes to channel names, units, or parsing behavior should be reflected in both `ibt-parser.ts` and `parse_ibt.py`, plus reference docs.
- **Plugin sync** — if you add/rename commands, skills, or files in the plugin, update both `plugin.json` and `install.ps1`.
- **Domain reference** — consult `SKILL.md` and `iracing-gtp-engineer-plugin/skills/iracing-gtp-engineer/references/` for telemetry domain knowledge before inventing assumptions.

## Supported Cars

BMW M Hybrid V8, Cadillac V-Series.R, Porsche 963, Acura ARX-06, Ferrari 499P. Each has different parameter naming, value types, and setup architectures — values do not transfer between cars. See `per-car-quirks.md`.

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
