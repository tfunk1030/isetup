# Repository Cursor Configuration

This repository now includes baseline MCP configuration in `.cursor/mcp.json`.

## Included MCP servers

- `playwright` for browser-based UI checks
- `github` for GitHub repository context
- `postgres` for telemetry/session storage workflows
- `docs-fetch` for external docs retrieval
- `workspace-filesystem` for constrained local file access

## Environment variables

Set these before using MCPs that require auth:

- `GITHUB_TOKEN` (used by `github`)
- `POSTGRES_URL` (used by `postgres`)

## Notes

- MCP server packages are launched via `npx` and fetched on first use.
- You can disable any server by removing it from `.cursor/mcp.json`.
