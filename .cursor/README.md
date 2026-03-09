# Repository Cursor Configuration

Shared Cursor guidance lives at the repo root so it applies regardless of which directory is opened.

## MCP servers (`.cursor/mcp.json`)

- `context7` — current library and framework documentation (React, Vite, Tailwind, Recharts, jsPDF)
- `playwright` — browser smoke tests and UI validation

These are high-value and secret-free. Contributors can add secret-dependent MCPs (GitHub, etc.) locally without committing them.

Versions are pinned for reproducibility. To upgrade, bump the version in `mcp.json` and open a PR.

## Environment (`.cursor/environment.json`)

Installs frontend dependencies from `gtp-telemetry/` and defines a ready-to-use Vite terminal bound to `0.0.0.0` for cloud workspace compatibility.

## Rules (`.cursor/rules/`)

- `repo-overview.mdc` — always-on repository architecture context
- `dashboard-workflow.mdc` — upload flow, dashboard, and PDF export guidance
- `plugin-workflows.mdc` — plugin manifest, commands, and Python parser guidance
- `telemetry-analysis.mdc` — IBT parsing, analysis engine, units, and thresholds
- `react-components.mdc` — dashboard panel and shared UI conventions
- `qa-validation.mdc` — validation checklist for app and plugin changes

## Agent playbook

`AGENTS.md` at the repo root provides a comprehensive onboarding guide for AI coding agents covering both the telemetry app and the plugin.

## Portability

Committed config avoids machine-specific paths and secret-dependent services so it stays usable on local clones and cloud workspaces alike.
