---
name: docs-sync
description: Audit documentation drift against current parser and analysis behavior.
---

# Docs sync

When the user runs `/docs-sync`:

1. Invoke the `docs-sync-guardian` agent.
2. Compare implementation against:
   - `references/*.md`
   - `commands/*.md`
3. Report stale or conflicting guidance with exact file references.
4. Propose a prioritized docs update checklist.
