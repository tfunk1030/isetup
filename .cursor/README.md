# Repository Cursor Configuration

This repository keeps shared Cursor guidance at the repo root so it applies when the full workspace is opened.

## Included MCP servers

- `context7` for current library and framework documentation
- `playwright` for browser smoke tests and UI validation

These are intentionally high-value and low-friction. Secret-dependent MCPs such as GitHub or Postgres can still be configured locally by contributors when needed, but they are not committed here by default.

## Environment setup

`.cursor/environment.json` installs the frontend dependencies from `gtp-telemetry/` and defines a ready-to-use Vite terminal for browser work.

## Rules and playbooks

- `.cursor/rules/` contains app, parser, plugin, and validation guidance
- `AGENTS.md` provides a repo-wide playbook for AI coding agents

## Portability

Committed config avoids machine-specific paths in MCP definitions so it stays usable on local clones and cloud workspaces alike.
