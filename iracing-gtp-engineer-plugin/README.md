# iRacing GTP Engineer Plugin

This directory contains the shipped plugin manifest, command docs, core setup-engineering skill, and a standalone Python IBT parser.

## Current contents

- 1 core skill: `skills/iracing-gtp-engineer/`
- 3 commands:
  - `/analyze-ibt`
  - `/diagnose`
  - `/setup-compare`
- 1 standalone parser:
  - `scripts/parse_ibt.py`

## Key files

- `plugin.json` — plugin manifest
- `install.ps1` — Windows installer that copies the skill, commands, and parser into the user plugin directory
- `commands/` — slash-command definitions
- `skills/iracing-gtp-engineer/` — main skill and its reference docs
- `scripts/parse_ibt.py` — direct IBT parsing tool

## Reference documentation

Plugin reference docs live here:

- `skills/iracing-gtp-engineer/references/ibt-parsing-guide.md`
- `skills/iracing-gtp-engineer/references/telemetry-channels.md`
- `skills/iracing-gtp-engineer/references/per-car-quirks.md`

Keep those paths in sync with command docs and installer behavior.

## Installation

The supported installer in this repo is:

```powershell
./install.ps1
```

If you change the plugin layout, update both `plugin.json` and `install.ps1` together.

## Development notes

- `parse_ibt.py` is the standalone parity reference for the browser parser in `gtp-telemetry/src/lib/ibt-parser.ts`
- Changes to channel names, units, or fallback behavior should be reflected in both implementations and in the reference docs
- Avoid documenting new commands or agents unless the manifest and installer actually ship them
