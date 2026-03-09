---
name: dashboard-export-qa
description: Validate parity between telemetry dashboard calculations and PDF export output.
---

# Dashboard export QA

When the user runs `/dashboard-export-qa`:

1. Invoke the `dashboard-export-qa-agent`.
2. Audit dashboard components and export logic for field/unit parity.
3. Report mismatches with file paths and severity.
4. Suggest smallest-safe patch order.
