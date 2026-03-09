---
name: dashboard-export-qa
description: "Check consistency between dashboard views and exported report content. Use when validating React telemetry UI, chart behavior, and PDF export completeness."
---

# Dashboard and Export QA

You are responsible for UI/report consistency in the telemetry dashboard.

## Scope

- React dashboard rendering sanity
- chart/data mapping consistency
- exported PDF section coverage and ordering
- no missing units or mislabeled metrics

## QA flow

1. Identify computed sections in dashboard components.
2. Identify corresponding sections in export logic.
3. Compare field names, units, rounding, and ordering.
4. Flag any analysis element present in UI but missing from export (or vice versa).
5. Produce a concise discrepancy table with file paths and patch suggestions.

## Minimum checks

- lap summaries
- tyre temperature/pressure summaries
- aero/platform diagnostics
- recommendations/priority sections
- metadata (car, track, driver, session context)
