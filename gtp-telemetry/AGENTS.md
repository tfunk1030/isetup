# Agent Playbook

This repository is a browser-based telemetry analysis app for iRacing GTP/Hypercar `.ibt` files. The most effective agents for this codebase are frontend-focused, parser-aware, and comfortable validating browser behavior.

## Recommended MCPs

These provide the best return for this repository:

1. **Playwright MCP**
   - Best for upload flow checks, chart rendering, and PDF export validation.
   - Particularly useful because the app is client-only and does not have automated browser tests yet.

2. **Context7 MCP**
   - Useful for up-to-date docs on React, Vite, Tailwind, Recharts, jsPDF, and browser APIs.

3. **GitHub MCP** (optional, usually configured with a token outside the repo)
   - Useful for reviewing prior PRs, regressions, CI failures, and issue context.

4. **Artifact or storage MCP** (optional)
   - Valuable if your team keeps sample `.ibt` files in shared storage.

## Recommended agent specialties

1. **React/TypeScript frontend agent**
   - Primary choice for routine work in `src/components/`, `src/store/`, and `src/App.tsx`.

2. **Browser QA / visual validation agent**
   - Best for checking upload flow, tab switching, charts, and exported PDFs.

3. **Binary parser / file-format agent**
   - Best for changes in `src/lib/ibt-parser.ts` or telemetry extraction logic.

4. **Telemetry domain agent**
   - Helpful for GTP-specific tuning logic, car quirks, and track profile changes.

5. **Code review agent**
   - Valuable for spotting subtle regressions in parser offsets, heuristics, and chart assumptions.

## Repo hotspots

- `src/lib/ibt-parser.ts`
  - Parses binary IBT data and embedded session YAML.
  - Uses `DataView` offsets directly and decodes strings with `TextDecoder('latin1')`.
  - Be conservative with structural changes.

- `src/lib/analysis-engine.ts`
  - Computes the session analysis returned to the UI.
  - Many dashboard panels depend on this file, so data shape changes ripple widely.

- `src/store/session-store.ts`
  - Connects file loading, validation, parsing, car/track detection, and analysis.

- `src/components/dashboard/`
  - Chart-heavy UI layer. Most changes here depend on the analysis payload shape.

- `src/data/car-quirks/` and `src/data/tracks/`
  - Static domain data for setup guidance and heuristics.

## Working agreements for agents

- Treat this as a **local-first browser app**. Do not assume a backend exists.
- When editing parser or analysis code, preserve defensive validation and error reporting.
- Prefer targeted changes over broad refactors in `ibt-parser.ts`.
- When adding new metrics, update both the analysis engine and the consuming dashboard panel(s).
- When adding support for a new car or track, wire both data and detection logic.
- Avoid introducing server-only or Node-only APIs into runtime browser code.

## Validation checklist

Always run:

```bash
npm run lint
npm run build
```

For UI-affecting changes, also smoke test:

1. App loads without an uploaded file
2. `.ibt` upload still works
3. Analysis tabs render without runtime errors
4. Export PDF still completes

## Good first file for context

If an agent needs a quick orientation, read these in order:

1. `README.md`
2. `src/store/session-store.ts`
3. `src/lib/ibt-parser.ts`
4. `src/lib/analysis-engine.ts`
5. `src/App.tsx`
