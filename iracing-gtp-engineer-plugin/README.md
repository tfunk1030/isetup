# iRacing GTP Engineer Plugin

This plugin now ships:

- 5 skills (core + parser + threshold + diagnosis + export QA)
- 7 slash commands (including parser parity, docs sync, and release hygiene)
- 4 agents for repeatable QA/review workflows
- MCP server wiring via `mcp.json`

## Key commands

- `/analyze-ibt`
- `/diagnose`
- `/setup-compare`
- `/parser-parity`
- `/dashboard-export-qa`
- `/release-hygiene`
- `/docs-sync`

## Agent files

- `agents/parser-parity-reviewer.md`
- `agents/dashboard-export-qa-agent.md`
- `agents/release-hygiene-agent.md`
- `agents/docs-sync-guardian.md`

## MCP configuration

The plugin references `mcp.json` through `plugin.json`.
If needed, adjust environment variables:

- `GITHUB_TOKEN`
- `POSTGRES_URL`
