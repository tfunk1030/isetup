---
name: parser-parity
description: Run parser parity review between TypeScript and Python IBT parsers.
---

# Parser parity

When the user runs `/parser-parity`:

1. Invoke the `parser-parity-reviewer` agent.
2. Compare parser behavior between:
   - `gtp-telemetry/src/lib/ibt-parser.ts`
   - `iracing-gtp-engineer-plugin/scripts/parse_ibt.py`
3. Return:
   - mismatch table
   - severity classification
   - minimal fix plan
4. Include a reusable regression checklist for future parser changes.
