---
name: release-hygiene
description: Run merge-readiness checks and summarize release risk.
---

# Release hygiene

When the user runs `/release-hygiene`:

1. Invoke the `release-hygiene-agent`.
2. Execute lint/build/type-check workflows where available.
3. Highlight regression and coverage gaps.
4. Return a risk status:
   - blocker
   - caution
   - ready
