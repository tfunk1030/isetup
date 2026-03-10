# Codebase Report: gtp-telemetry UI Structure
Generated: 2026-03-10

## Summary

A local-first React 19 SPA. App.tsx switches between StandaloneTools (landing) and Dashboard based on analysis in Zustand store. Seven dashboard tabs, 15 lazy-loaded panels, 2 standalone tool panels (Diagnose + Compare), jsPDF text export.

## Tab Definitions

id=overview   label=Overview      icon=layout-dashboard
id=tyres      label=Tyres         icon=circle-dot
id=platform   label=Aero Platform icon=ruler
id=dynamics   label=Dynamics      icon=zap
id=diagnose   label=Diagnose      icon=stethoscope
id=compare    label=Compare       icon=git-compare
id=setup      label=Setup         icon=wrench
Default active tab: overview

## App Component Tree

App
  analysis===null  ->  StandaloneTools
    DropZone full-screen
    Buttons: Diagnose Handling / Compare Setups
      tool=diagnose -> DiagnosePanel + Back
      tool=compare  -> ComparePanel + Back

  analysis!==null  ->  Dashboard
    SessionHeader (sticky)
    TabBar (sticky 7 tabs)
    tabpanel [all React.lazy()]
      overview -> AIRecommendationAssistant + LapTimesChart
               + Card(Session) + Card(Platform Safety)
               + Card(G-Force) + Card(Driver Aids) + ConditioningTrend
      tyres    -> TyreTempsPanel + TyrePressuresChart + TyreWearPanel
      platform -> RideHeightScatter + SplitterAnalysis + ShockVelocityPanel
      dynamics -> GForceScatter + DriverAidsPanel + RARBAnalysis + EngineTempsPanel + FuelPanel
      diagnose -> DiagnosePanel
      compare  -> ComparePanel
      setup    -> SetupDump

## Upload Workflow

1. DropZone full-screen at launch (animate-slide-up)
2. Drag-drop or click to select .ibt file
3. Client validate: extension + min 1KB
4. store.loadFile(): arrayBuffer -> validateIBT -> parseIBT -> detectCar+detectTrack -> analyzeSession
5. Progress in DropZone (indeterminate bar)
6. analysis set -> Dashboard renders
7. Errors: red alert in DropZone

## PDF Export (src/lib/pdf-export.ts)

Lazy import from SessionHeader. jsPDF programmatic only - no html2canvas.
A4 portrait dark bg orange headers. Text-only no charts.
Sections: Session Info Data Quality Lap Times Tyre Temps Pressures Platform G-Force Fuel Aids Conditioning Engine.
Filename: GTP_Report_{Car}_{date}.pdf

## Design System (index.css)

Fonts: Inter 400-900 for UI JetBrains Mono for data values.
CSS vars: --color-bg #121212 --color-card #1e1e1e --color-surface #242424
--color-accent #ff9800 (orange active tabs buttons) --color-green #4ade80 --color-red #f87171
--color-blue #60a5fa --color-cyan #22d3ee --color-purple #a78bfa
--color-text #ffffff --color-text-dim #a3a3a3 --color-text-muted #737373
Per-corner: LF #60a5fa RF #f87171 LR #22d3ee RR #fbbf24
Utility: .flat-card .btn-primary .btn-secondary .input-field
Animations: .animate-fade-slide-in .animate-slide-up .animate-progress
NOTE: constants.ts COLORS JS object is parallel to CSS vars; only pdf-export.ts uses JS object.

## Shared Components

Card: props title icon? children span?(grid-column) className?
  .flat-card + .animate-fade-slide-in. Icon in accent-dim rounded square.
MetricRow: props label value unit? status?
  Left muted label Right mono semibold value + StatusBadge. Border-bottom each row except last.
StatusBadge: status (COLD=blue OK=green HOT=red HIGH=orange SAFE=green RISK=red)
TabBar: sticky top-0 z-20 ARIA tablist. Keyboard ArrowLeft/Right/Home/End. Active: orange border+text.

## SessionHeader

Always visible at Dashboard top.
Left: Flag icon + GTP Telemetry + car/track.
Right: driver chip duration/Hz/ch Brake-Migration Physics-version Architecture-badge
Export-PDF-button(btn-secondary) New-IBT-button(btn-primary+hidden-input).

## AIRecommendationAssistant

Driver feedback collapsible: 12 preset pills + free textarea.
Providers via VITE_ env: Gemini Anthropic OpenRouter OpenAI.
Modes: dual-model consensus or single-model.
Output: Summary Priority-Actions Watch-Items Reasoning Model-Disagreements.
Each rec: param current->target delta reason evidence verify assumptions exactness garage-path.

## DiagnosePanel

Tab 5 AND standalone from landing.
Inputs: symptom(5) phase(3) speed(3) car track wet free-text.
Output: ParameterChange[] ranked track-notes car-notes wet-protocol.
With session: telemetryEvidence on each ParameterChange.

## ComparePanel

Tab 6 AND standalone from landing.
Setup A: session toggle or paste YAML/JSON. Setup B: paste. Car selector.
Output: diff table grouped by Aero/Platform/Suspension/Dampers/Alignment/Brakes/Diff/Tyres/Electronics.
Columns: param A-val B-val delta(color-coded) handling-impact magnitude-symbol.

## SetupDump (setup tab)

Toggle reveals raw CarSetup key-value pairs. Scrollable mono list max-h-500px.

## SetupRecommendationsPanel - ORPHANED

src/components/dashboard/SetupRecommendationsPanel.tsx
Fully implemented but NOT in App.tsx. Modified in git status = active dev.
Has: constraint violations banner dataset confidence severity bar
collapsible category groups AERO/PLATFORM/TYRES/DYNAMICS/AIDS/BRAKES/POWERTRAIN/TRACK
left-border severity color evidence/verify/blockedBy.

## SessionAnalysis (types.ts line 454)

header: SessionHeader (car track driver temps hz channels)
setup: [string unknown][] (raw CarSetup)
normalizedSetup: NormalizedSetup
lapTimes bestTime tyreTempData tyrePressureData tyreWearData
rideHeightData bottoming shockVelStats gForceData peakLatG peakBrakeG peakAccelG
fuel aids conditioning engineTemps rarb splitter validLaps
telemetryReasoning recommendations dataQuality
carProfileId trackProfileId constraintViolations physicsVersionNote
trackGuidance carDeepKnowledge

## Component Inventory (verified via Glob)

components/upload/DropZone.tsx
components/shared/Card.tsx MetricRow.tsx StatusBadge.tsx TabBar.tsx
components/dashboard/SessionHeader.tsx LapTimesChart.tsx TyreTempsPanel.tsx TyrePressuresChart.tsx
components/dashboard/TyreWearPanel.tsx RideHeightScatter.tsx ShockVelocityPanel.tsx SplitterAnalysis.tsx
components/dashboard/GForceScatter.tsx DriverAidsPanel.tsx ConditioningTrend.tsx EngineTempsPanel.tsx
components/dashboard/RARBAnalysis.tsx SetupDump.tsx AIRecommendationAssistant.tsx
components/dashboard/SetupRecommendationsPanel.tsx [NOT MOUNTED]
components/diagnose/DiagnosePanel.tsx
components/compare/ComparePanel.tsx

## Open Questions

1. SetupRecommendationsPanel.tsx implemented but not mounted - likely being wired in soon.
2. finding-generator.ts finding-types.ts corner-detection.ts are new untracked lib files.
3. constants.ts COLORS JS vs index.css CSS vars are parallel - only pdf-export.ts uses JS.