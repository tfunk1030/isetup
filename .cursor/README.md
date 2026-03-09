# Repository Cursor Configuration

This repository keeps shared Cursor guidance at the repo root so it applies when the full workspace is opened.

## Included MCP servers

- `context7` for current library and framework documentation
- `playwright` for browser smoke tests and UI validation
- `fetch` for external docs and reference lookups that do not require secrets

These are intentionally useful and low-friction. Secret-dependent MCPs such as GitHub can still be configured locally when needed, but they are not committed here by default.

## Environment setup

`.cursor/environment.json` installs frontend dependencies from `gtp-telemetry/` and defines a ready-to-use Vite terminal for browser work.

## Rules and playbooks

- `.cursor/rules/` contains app, parser, plugin, and validation guidance
- `AGENTS.md` provides a repo-wide playbook for AI coding agents

## Portability

Committed config uses repo-relative commands and avoids machine-specific MCP paths so it stays usable on local clones and cloud workspaces alike.
