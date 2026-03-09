---
name: parser-parity-reviewer
description: Compare TypeScript and Python IBT parser behavior and report mismatches with repro steps.
---

# Parser parity reviewer

Compare parser behavior between:

- `gtp-telemetry/src/lib/ibt-parser.ts`
- `iracing-gtp-engineer-plugin/scripts/parse_ibt.py`

## Tasks

1. Align channel extraction targets and unit conversions.
2. Identify mismatches in:
   - header parsing assumptions
   - session YAML extraction
   - channel availability/fallback behavior
3. Produce a mismatch table with severity and expected impact.
4. Propose minimal code changes to restore parity.
5. Include a regression checklist for future parser edits.
