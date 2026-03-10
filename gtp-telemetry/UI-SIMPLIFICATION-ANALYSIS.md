# GTP Telemetry — UI/UX Simplification Analysis

**Date:** March 10, 2026
**Scope:** Full app audit — App.tsx, CommandCenterHeader, LandingScreen, DriverBriefing, OptimizerWorkspace (737 lines), ComparePanel, DiagnosePanel, store, and navigation flow.

---

## Executive Summary

The app is well-built and feature-rich, but it suffers from **information overload** and **duplicated UI surface area**. A user who just uploaded an IBT file is confronted with a 3-column dashboard, 5+ cards in the right column, a collapsible evidence deck, and a sticky header already showing stats. The core workflow is sound — the UI just needs to get out of its own way.

**The single biggest win:** collapse the OptimizerWorkspace from a 3-column simultaneous view into a **focused single-task flow** where the user sees one thing at a time and drills deeper on demand.

---

## Problem 1: The Header Does Too Much

**Current state (CommandCenterHeader.tsx — 203 lines):**
The sticky header contains 3 vertical layers:

1. **Brand + session context + action buttons** (row 1)
2. **Nav tabs + 4 stat chips** (row 2)
3. **Severity badges + driver/duration metadata** (row 3, conditional)

This eats ~160–180px of vertical space and duplicates data that already appears in the OptimizerWorkspace body (Best Lap, Valid Laps, Confidence all appear in both the header chips AND the Optimizer Queue stats).

**Recommendation:**

- **Flatten to 2 rows max.** Row 1: brand/session + nav tabs + actions. Row 2 (conditional): severity + confidence as inline badges, not a full-width grid.
- **Remove the 4 stat chips** (Best Lap, Valid Laps, Confidence, Setup Changes) from the header entirely. They already live in the Optimizer Queue card. Showing them twice adds visual noise without adding clarity.
- **Merge the severity/metadata row into the session subtitle.** Instead of a separate row of badges, show "BMW M Hybrid V8 at Spa · 3 critical · 1 warning" as a single line.

**Impact:** Reclaims ~60px of vertical space, reduces visual parsing from 3 layers to 2, eliminates 4 duplicated data points.

---

## Problem 2: Landing Screen Is a Marketing Page, Not a Launcher

**Current state (LandingScreen.tsx — 160 lines):**
A full hero section with a 5XL headline, 3 workflow pillars, a supported cars bar, and a 3-step workflow explanation — plus a sidebar with DropZone and Quick Tools.

For a tool that a user opens repeatedly (every session), the landing page reads like a product homepage. After the first visit, the user already knows what GTP Telemetry does.

**Recommendation:**

- **Replace the hero with a compact launcher.** Center the DropZone prominently. Show the last session (car + track + date) if available. Keep the Quick Tools buttons (Diagnose, Compare) directly below.
- **Kill the workflow pillars and "Supported Cars" bar.** Move these to a help/about modal or first-run onboarding tooltip. Repeat users don't need to re-read "Promote deterministic setup changes first" every time they open the app.
- **Reduce from ~160 lines to ~60 lines.** The core landing is: DropZone + Quick Tools + optional last-session recall.

**Impact:** Faster time-to-action. The user sees the upload zone immediately instead of scrolling past marketing copy.

---

## Problem 3: OptimizerWorkspace Is a 737-Line Monolith

**Current state:**
A single component renders a 3-column grid containing:

- Left: Current Setup Browser (expandable parameter groups)
- Center: Optimizer Queue (recommendation list + detail panel + supporting recommendations + AI assistant)
- Right: Confidence card + Watchlist card + Quick Tools card + Context card
- Bottom: Evidence Deck (5 collapsible sections with 12 lazy-loaded chart components)

This is the heaviest screen in the app and it shows *everything at once*.

**Recommendation — Restructure into tabbed focus areas:**

### Option A: Tab-based simplification

Replace the 3-column grid with a **primary content area + contextual sidebar**:

| Tab | Shows | Currently lives in |
|-----|-------|--------------------|
| **Queue** (default) | Recommendation list + selected detail | Center column |
| **Setup** | Current Setup Browser | Left column |
| **Evidence** | Evidence deck (all 5 panels) | Bottom section |
| **Context** | Confidence, Watchlist, Track/Car notes | Right column cards |

The sidebar (right) shows a **compact summary strip** that's always visible: confidence badge, critical/warning count, and a "View Evidence" shortcut.

### Option B: Progressive disclosure within current layout

Keep the 3-column layout but:
- **Collapse the left column by default.** Show a thin "Setup" rail that expands on click. Most users go straight to recommendations.
- **Merge the 4 right-column cards into 2.** "Confidence & Watchlist" (one card) and "Context & Tools" (one card). Currently, Quick Tools and Context are separate cards that could be a single "Session Context" card with tool buttons at the top.
- **Move the Evidence Deck into a slide-over panel** instead of a full-width bottom section. Opens from the right when you click "Open Evidence" on a recommendation.

**Impact:** Either option reduces cognitive load from "parse 3 columns + a bottom deck" to "focus on one task, drill into context on demand."

---

## Problem 4: Duplicated Data Across Components

Several data points appear in 2–3 places simultaneously:

| Data | Appears in |
|------|-----------|
| Best Lap time | Header chip, Optimizer Queue stat |
| Valid Laps | Header chip, Optimizer Queue stat, Confidence card |
| Confidence level | Header chip, Optimizer Queue stat, Confidence card |
| Setup Changes count | Header chip (exact/total), Optimizer Queue subtitle |
| Critical/Warning counts | Header severity badges, recommendation badges |
| Track guidance | Context card (right column), Evidence > Context panel |
| Car knowledge | Context card (right column), Evidence > Context panel |
| Data quality notes | Watchlist card, Evidence > Context panel |
| Compare/Diagnose links | Header nav tabs, Quick Tools card (right column), Landing Screen Quick Tools |

**Recommendation:**

- **Each data point should have ONE canonical home.** Stats live in the body, not the header. Track/car context lives in the Evidence deck only, not also in a right-column card. Quick Tools buttons live in the header nav — remove the separate Quick Tools card from the right column.
- **Merge the Context card content into the Evidence > Context panel.** Currently the right-column Context card shows a subset of what the Evidence > Context panel shows. Eliminate the right-column version.

**Impact:** Users stop wondering "wait, did this number change?" when they see the same metric in two places. Reduces total rendered cards by 2–3.

---

## Problem 5: The DriverBriefing Step Feels Like a Speed Bump

**Current state (DriverBriefing.tsx — 249 lines):**
After uploading an IBT, the user lands on a full-page briefing screen showing:
- Session detection card (car, track, driver, samples, channels, Hz)
- 12 handling preset buttons
- Free-text textarea
- "Run Analysis" CTA

The handling feedback is labeled "Optional" and most users will likely click "Run Analysis" immediately.

**Recommendation:**

- **Make this an inline panel, not a full-page takeover.** After file upload, show a compact confirmation bar ("BMW M Hybrid V8 at Spa — 42,000 samples · 60Hz") with a prominent "Run Analysis" button and an expandable "Add handling notes" section.
- **Reduce the 12 presets to the top 6.** The current list includes some overlapping items (e.g., "Understeer on entry" vs "Push in fast corners" — both are entry understeer). Consolidate to: Entry understeer, Mid-corner understeer, Exit oversteer, High-speed instability, Poor traction, Bottoming.
- **Kill the session detection card as a separate element.** The header already shows car + track once analysis loads. Show the detection as a single confirmation line, not a 3-column grid with icons.

**Impact:** Reduces an optional step from a full-page experience to a 2-line inline panel. Users who want to skip feedback can run analysis in one click without visual overhead.

---

## Problem 6: Evidence Deck Toggle UX Is Fragile

**Current state:**
Only ONE evidence panel can be open at a time (controlled by `openEvidenceId` in the store). The toggle buttons at the top of the Evidence Deck section AND the "Open {Evidence}" buttons on each recommendation card both control the same state.

**Issues:**
- Clicking "Open Tyres" on recommendation #1, then "Open Platform" on recommendation #2 closes Tyres. No way to have both open.
- The Evidence Deck header has 5 tiny pill buttons that duplicate the Show/Hide buttons inside each EvidenceSection.
- Evidence sections only open one at a time, but users comparing tyre data with platform data need both visible.

**Recommendation:**

- **Allow multiple evidence panels to be open simultaneously.** Change `openEvidenceId: EvidencePanelId | null` to `openEvidenceIds: Set<EvidencePanelId>`.
- **Remove the pill buttons row at the top of the Evidence Deck.** Each section already has its own Show/Hide toggle. The pills are redundant.
- **Add a "Collapse All" / "Expand All" toggle** instead of individual pills.

**Impact:** Users can compare across evidence categories. Reduces duplicate toggle controls.

---

## Problem 7: Compare and Diagnose Panels Are Well-Designed but Disconnected

**Current state:**
Compare and Diagnose are standalone views accessed via nav tabs. They work independently of the telemetry analysis, with optional session data integration.

**This is mostly fine.** These panels are clean, focused, and well-structured. Minor suggestions:

- **ComparePanel:** The two textarea inputs side-by-side work well. Consider adding a "Swap A↔B" button.
- **DiagnosePanel:** The symptom + phase + speed grid is intuitive. Consider showing results inline below the form instead of in a separate Card, reducing the visual "jump" when results appear.
- **Both panels:** When a session IS loaded, pre-populate car/track selectors automatically (already done) and show a subtle banner: "Session data available — results will include telemetry evidence."

---

## Problem 8: Dead Code and Unused Components

From codebase exploration:

- **EngineeringWorkspace.tsx** — Contains MOCK_SESSION and MOCK_FINDINGS. Appears to be an earlier prototype. Not imported anywhere in the current routing. **Delete it.**
- **SetupDashboard.tsx** — Exists in the codebase but not referenced in App.tsx or any routing. **Delete it.**

**Impact:** Reduces codebase surface area and prevents confusion during maintenance.

---

## Simplified Architecture (Proposed)

```
App.tsx
├── Header (2 rows max)
│   ├── Row 1: Brand + Nav [Optimizer | Compare | Diagnose] + [Load IBT] + [Export]
│   └── Row 2 (if analysis): "BMW M Hybrid V8 at Spa · HIGH confidence · 3 critical · 1 warning"
│
└── Body
    ├── Launcher (no analysis)
    │   ├── DropZone (centered, prominent)
    │   ├── Quick Tools: [Diagnose] [Compare]
    │   └── Last session recall (optional)
    │
    ├── Pre-Analysis Bar (parsedData, no analysis)
    │   ├── "Porsche 963 at Monza detected — 42K samples · 60Hz"
    │   ├── [▶ Run Analysis] button
    │   └── [+ Add handling notes] expandable
    │
    ├── Optimizer (analysis loaded)
    │   ├── Tabs: [Queue] [Setup Browser] [Evidence] [Context]
    │   ├── Active tab content (full width)
    │   └── Compact sidebar strip: confidence + severity + evidence shortcuts
    │
    ├── Compare (standalone)
    │   └── (keep as-is, minor tweaks)
    │
    └── Diagnose (standalone)
        └── (keep as-is, minor tweaks)
```

---

## Priority Ranking

| # | Change | Effort | Impact | Priority |
|---|--------|--------|--------|----------|
| 1 | Flatten header to 2 rows, remove duplicate stats | Small | High | **Do first** |
| 2 | Replace landing hero with compact launcher | Small | High | **Do first** |
| 3 | Convert DriverBriefing to inline bar | Medium | High | **Do second** |
| 4 | Restructure OptimizerWorkspace (tabs or progressive disclosure) | Large | Very High | **Do second** |
| 5 | Deduplicate data across components | Medium | Medium | **Do third** |
| 6 | Fix evidence deck to allow multi-open | Small | Medium | **Do third** |
| 7 | Delete dead code (EngineeringWorkspace, SetupDashboard) | Trivial | Low | **Do anytime** |
| 8 | Minor Compare/Diagnose polish | Small | Low | **Do last** |

---

## Summary

The app's core logic and analysis engine are strong. The UI simplification is about **reducing surface area** — fewer cards, fewer duplicate stats, fewer full-page takeovers — so the user spends more time acting on recommendations and less time parsing the interface. The goal: every pixel on screen should be helping the user decide what setup change to make next.
