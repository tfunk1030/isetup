# Repository Cursor Configuration

This repository includes Cursor IDE configuration for enhanced AI assistant context.

## MCP servers (`.cursor/mcp.json`)

- `context7` — up-to-date library documentation lookups (React, Vite, Tailwind, Recharts, jsPDF)
- `playwright` — browser-based UI testing and visual validation
- `fetch` — external documentation and web resource retrieval

## Cursor rules (`.cursor/rules/`)

- `project-architecture.mdc` — full tech stack, directory layout, conventions, and domain context (always applied)
- `react-components.mdc` — dashboard panel patterns and shared UI conventions (scoped to `components/**/*.tsx`)
- `telemetry-analysis.mdc` — IBT parser, analysis engine, units, thresholds, and profiles (scoped to `lib/**/*.ts`)

## Sub-project configs

- `gtp-telemetry/.cursor/` — frontend-specific MCP servers, environment setup, and detailed rules
- `gtp-telemetry/AGENTS.md` — agent playbook for the frontend app
- `iracing-gtp-engineer-plugin/mcp.json` — plugin-specific MCP wiring

## Notes

- MCP server packages are launched via `npx` and fetched on first use.
- You can disable any server by removing it from the relevant `mcp.json`.
- See `gtp-telemetry/AGENTS.md` for a comprehensive agent onboarding guide.
