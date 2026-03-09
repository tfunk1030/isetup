# Repository Cursor Configuration

This repository keeps shared Cursor guidance at the repo root so it works when the full workspace is opened.

## Included MCP servers

- `context7` for current library and framework documentation
- `playwright` for browser smoke tests and UI validation
- `fetch` for pulling external docs and references

## Environment setup

`.cursor/environment.json` installs frontend dependencies from `gtp-telemetry/` and defines a ready-to-use Vite terminal.

## Rules and playbooks

- `.cursor/rules/` contains app, parser, plugin, and QA guidance
- `AGENTS.md` provides a repository-wide playbook for coding agents

## Portability

Committed config avoids machine-specific paths in commands and MCP definitions so it is usable in local clones and cloud workspaces.
