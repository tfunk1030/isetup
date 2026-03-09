# iRacing GTP Engineer Plugin

This plugin provides AI-assisted iRacing GTP Hypercar setup engineering capabilities.

## Skills

| Skill | Purpose |
|-------|---------|
| `iracing-gtp-engineer` | Core setup engineering skill |
| `ibt-parser-specialist` | IBT binary parsing and channel integrity |
| `telemetry-threshold-validator` | Threshold and unit validation |
| `setup-diagnosis-specialist` | Symptom-to-setup translation |
| `dashboard-export-qa` | Dashboard/export consistency checks |

## Commands

| Command | Description |
|---------|-------------|
| `/analyze-ibt` | Parse and analyze an IBT file |
| `/diagnose` | Diagnose handling issues from telemetry |
| `/setup-compare` | Compare two setups |
| `/parser-parity` | Check TS/Python parser alignment |
| `/dashboard-export-qa` | Validate dashboard/export consistency |
| `/release-hygiene` | Pre-merge quality checks |
| `/docs-sync` | Audit documentation drift |

## Agents

| Agent | Role |
|-------|------|
| `parser-parity-reviewer` | Cross-language parser comparison |
| `dashboard-export-qa-agent` | End-to-end dashboard audit |
| `release-hygiene-agent` | Merge-readiness assessment |
| `docs-sync-guardian` | Documentation alignment |

## MCP configuration

The plugin references `mcp.json` through `plugin.json`.

Configured servers:
- `playwright` — browser testing
- `github` — repository context (requires `GITHUB_TOKEN`)
- `fetch` — external documentation retrieval
