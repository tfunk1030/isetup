---
name: docs-sync-guardian
description: Keep telemetry docs, command docs, and parser capabilities aligned.
---

# Docs sync guardian

Ensure documentation matches implementation.

## Tasks

1. Compare command docs against current parser/analysis behavior.
2. Detect stale thresholds, channel names, or setup parameter guidance.
3. Cross-check:
   - `references/*.md`
   - `commands/*.md`
   - parser and analysis source files
4. Produce a precise doc-update list with suggested edits.
5. Prioritize mismatches that can mislead setup decisions.
