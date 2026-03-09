# Agent Playbook

This repository combines a browser telemetry analyzer with a setup-engineering plugin. The best results come from agents that are careful with parser assumptions, comfortable with React/Vite frontends, and willing to validate path/layout changes instead of only editing prose.

## Repository layout

- `gtp-telemetry/` - React 19 + TypeScript + Vite app for browser-side `.ibt` parsing, dashboard rendering, and PDF export
- `iracing-gtp-engineer-plugin/` - plugin manifest, command docs, core skill, and standalone Python parser
- Root docs - `SKILL.md`, `per-car-quirks.md`, `telemetry-channels.md`, `ibt-parsing-guide.md`

## Recommended MCPs

The repo ships these shared MCPs in `.cursor/mcp.json`:

1. **Context7**
   - Best for current React, Vite, Tailwind, Recharts, and browser API docs.
2. **Playwright**
   - Best for upload flow checks, dashboard rendering sanity, and export validation.

Optional local additions:

- **GitHub MCP** if you want issue / PR / CI context and have a token configured locally
- **Storage or artifact MCPs** if your team keeps sample `.ibt` files outside the repo

## Recommended agent specialties

1. **React/TypeScript frontend agent**
   - Best for `gtp-telemetry/src/components/`, `src/store/`, and `src/App.tsx`
2. **Browser QA agent**
   - Best for upload flow, tab switching, chart rendering, and export checks
3. **Binary parser / file-format agent**
   - Best for `gtp-telemetry/src/lib/ibt-parser.ts` and `iracing-gtp-engineer-plugin/scripts/parse_ibt.py`
4. **Telemetry domain / setup agent**
   - Best for car quirks, track profiles, and setup-diagnosis reasoning
5. **Code review agent**
   - Best for spotting path drift, unit mismatches, and parser regressions

## Repo hotspots

### Telemetry app

- `gtp-telemetry/src/store/session-store.ts`
  - Orchestrates file loading, parsing, car/track detection, and analysis
- `gtp-telemetry/src/lib/ibt-parser.ts`
  - Browser parser using direct offset handling and `TextDecoder('latin1')`
- `gtp-telemetry/src/lib/analysis-engine.ts`
  - Produces the analysis payload consumed by most UI and export code
- `gtp-telemetry/src/lib/pdf-export.ts`
  - User-visible output path that should stay in parity with major dashboard content
- `gtp-telemetry/src/components/dashboard/`
  - Mostly `analysis`-driven panels, with `SessionHeader` as a store-backed exception

### Plugin

- `iracing-gtp-engineer-plugin/plugin.json`
  - Manifest for shipped commands and skills
- `iracing-gtp-engineer-plugin/install.ps1`
  - Installer that must match the manifest and on-disk layout
- `iracing-gtp-engineer-plugin/scripts/parse_ibt.py`
  - Standalone parser and parity reference for browser-side parsing behavior
- `iracing-gtp-engineer-plugin/skills/iracing-gtp-engineer/references/`
  - Canonical plugin reference docs; note the nested location

## Working agreements for agents

- Treat the frontend as a local-first browser app; do not assume a backend exists
- Be conservative with parser offset and encoding changes
- Prefer targeted analysis/data changes over spreading duplicate calculations into UI components
- If you add or rename plugin commands, skills, or support files, update both `plugin.json` and `install.ps1`
- Avoid committed machine-specific paths in repo config unless a file is intentionally cloud-only
- When a change affects telemetry semantics, check both docs and both parsers for drift

## Validation checklist

### Telemetry app

Run from `gtp-telemetry/`:

```bash
npm run lint
npm run build
```

For UI-affecting work, also smoke test:

1. app loads without an uploaded file
2. `.ibt` upload still works
3. dashboard tabs render without runtime errors
4. PDF export still completes

### Plugin / parser

Run:

```bash
python -m py_compile iracing-gtp-engineer-plugin/scripts/parse_ibt.py
```

Also verify:

1. every manifest path exists
2. installer copy steps match the manifest
3. command docs point to real reference paths

## Good first files for context

Read these in order for a fast orientation:

1. `gtp-telemetry/README.md`
2. `gtp-telemetry/src/store/session-store.ts`
3. `gtp-telemetry/src/lib/ibt-parser.ts`
4. `gtp-telemetry/src/lib/analysis-engine.ts`
5. `iracing-gtp-engineer-plugin/plugin.json`
6. `iracing-gtp-engineer-plugin/install.ps1`
