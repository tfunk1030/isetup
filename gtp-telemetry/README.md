# GTP Telemetry

Browser-based iRacing GTP/Hypercar telemetry analysis built with React, TypeScript, and Vite.

The app reads local `.ibt` files in the browser, parses the session header and telemetry channels client-side, runs a setup/performance analysis pass, and renders chart-heavy dashboards with optional PDF export.

## What it does

- Imports local iRacing `.ibt` telemetry files
- Parses binary telemetry and embedded session YAML in the browser
- Detects supported GTP/Hypercar cars and track profiles
- Runs a 14-item engineering checklist across laps, tyres, platform, dynamics, and setup
- Renders analysis dashboards with Recharts
- Exports a summary PDF from the browser

## Tech stack

- React 19
- TypeScript 5
- Vite 7
- Tailwind CSS 4
- Zustand for client state
- Recharts for dashboards
- `js-yaml` for session info decoding
- `jspdf` and `html2canvas` for export

## Getting started

```bash
npm install
npm run dev
```

For cloud environments or browser automation, use:

```bash
npm run dev -- --host 0.0.0.0
```

## Available scripts

- `npm run dev` - start the Vite dev server
- `npm run build` - type-check and create a production build
- `npm run lint` - run ESLint
- `npm run preview` - preview the built app

## Repo map

```text
src/
  components/
    dashboard/      Chart and analysis panels
    shared/         Reusable UI primitives
    upload/         File upload and entry flow
  data/
    car-quirks/     Per-car quirks and heuristics
    tracks/         Track metadata and setup notes
  lib/
    analysis-engine.ts  Session analysis pipeline
    ibt-parser.ts       Binary IBT parser
    car-profiles.ts     Car detection and profiles
    track-profiles.ts   Track detection and defaults
    pdf-export.ts       Browser PDF export
    types.ts            Shared analysis types
  store/
    session-store.ts    Zustand state and load pipeline
```

## Development notes

- This is a local-first frontend app; there is no backend API in the current codebase.
- Parser and analysis changes often require corresponding UI updates.
- The most sensitive logic lives in `src/lib/ibt-parser.ts` and `src/lib/analysis-engine.ts`.
- Car and track support is data-driven from `src/data/car-quirks/` and `src/data/tracks/`.
- There is currently no automated test suite, so build/lint plus manual smoke testing are important.

## Cursor and agent setup

This repository includes shared Cursor guidance:

- `.cursor/environment.json` for repo-local cloud setup
- `.cursor/mcp.json` for default MCP servers that do not require secrets
- `.cursor/rules/` for parser, dashboard, and QA guidance
- `AGENTS.md` for a repo-specific playbook

If you are working with an AI coding agent, start with `AGENTS.md`.
