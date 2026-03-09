---
name: dashboard-export-qa-agent
description: Validate that dashboard analytics and exported reports stay in sync after code changes.
---

# Dashboard export QA agent

Audit the telemetry dashboard pipeline end to end.

## Tasks

1. Trace computed metrics from analysis engine to UI components.
2. Trace exported report output paths.
3. Detect missing fields, naming drift, or unit mismatches.
4. Confirm each major dashboard panel has export parity.
5. Report findings with file/line references and fix order.
