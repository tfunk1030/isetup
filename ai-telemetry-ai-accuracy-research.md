# Deep Research Blueprint: Advanced + Accurate AI Telemetry Analysis & Setup Recommendations

Date: 2026-03-10  
Priority profile: **(1) technical accuracy + (2) driver usability**

---

## 1) Executive recommendation

To make telemetry AI recommendations genuinely advanced and accurate, use a **hybrid engineering stack**:

1. **Deterministic telemetry + setup diagnostics** generate physically grounded candidate actions.
2. **Uncertainty-aware ranking layer** estimates expected gain/risk with calibrated confidence.
3. **LLM synthesis layer** explains and prioritizes only already-vetted actions in strict structured output.
4. **Feedback/evaluation loop** continuously measures recommendation quality against lap outcomes.

This avoids the common failure mode where an LLM invents plausible but ungrounded setup advice.

---

## 2) Current-state assessment (repo-specific)

The repository already has strong foundations:

- Deterministic rule pipeline in `gtp-telemetry/src/lib/analysis-engine.ts`
- Setup extraction + normalization in `src/lib/setup-normalization.ts`
- Domain constraints/knowledge in `src/lib/domain-knowledge.ts`
- AI synthesis with structured JSON prompt in `src/lib/ai-recommendations.ts`
- Existing exactness/confidence fields and recommendation verification text

Main remaining gaps for *advanced accuracy*:

1. **No quantitative gain model** (expected lap/consistency delta per recommendation).
2. **No formal confidence calibration** (confidence is rule/heuristic, not empirically calibrated).
3. **No robust recommendation evaluation harness** (precision/impact tracked over historical sessions).
4. **No counterfactual estimator** (what likely happens if this parameter changes).
5. **No trust-calibration UX layer** (clear “when to trust / when not to trust” thresholds).
6. **Client-side AI keys architecture risk** limits safe productionization of stronger AI workflows.

---

## 3) Target system architecture (accuracy-first, usability-second)

## 3.1 Layer A — Canonical feature engine (deterministic)

Build a stable feature contract from IBT + setup + context:

- Session context: car, track, weather, fuel window, stint stage
- Segment-level metrics: braking/entry/mid/exit + low/med/high speed bins
- Platform/aero stability metrics: bottoming frequency, ride-height variance at speed, heave variance
- Tire state metrics: thermal gradients, pressure drift, wear asymmetry
- Driver control stability metrics: throttle/brake/steer consistency proxies
- Setup vector (normalized): only physically controllable garage parameters

**Design rule:** recommendation logic should consume this feature contract, not raw channel arrays.

---

## 3.2 Layer B — Candidate generator (physics/rule grounded)

Generate recommendation candidates from:

1. Existing rule engine (already present)
2. Car/track-specific quirk rules
3. Constraint checks (sim limits, architecture compatibility, missing setup keys)

Each candidate should be represented as:

```ts
{
  parameterKey,
  currentValue,
  targetValue,
  delta,
  hypothesis: "why this should help",
  expectedEffectType: ["entry_oversteer_reduction", "high_speed_platform_stability", ...],
  sideEffects: [...],
  feasibility: "exact" | "inferred" | "blocked"
}
```

---

## 3.3 Layer C — Counterfactual impact model (core accuracy upgrade)

Add a model that estimates likely effect if candidate change is applied:

- Targets:
  - lap-time delta (median + interval)
  - stability change (variance reductions)
  - tire thermal behavior change
- Prefer **doubly robust/offline policy evaluation style estimators** where possible
- Start with **conservative local models** per car family (LMDh/LMH), then split per car as data grows

Practical modeling sequence:

1. Baseline: gradient boosted trees for effect prediction (fast + interpretable)
2. Add monotonic constraints where physics sign is known
3. Add uncertainty intervals with conformal calibration
4. Gate recommendations when uncertainty interval crosses zero too widely

---

## 3.4 Layer D — Confidence engine (calibrated uncertainty)

Use multi-factor confidence:

- **Data confidence** (channel quality, lap count, signal consistency)
- **Mapping confidence** (exact/ordered/ambiguous setup mapping)
- **Model confidence** (prediction interval width / calibration quality)
- **Constraint confidence** (sim legality, parameter availability)

Then calibrate to observed outcomes:

- Use conformal calibration / adaptive conformal methods for time-dependent data
- Track calibration error by car/track bucket
- Publish confidence as **probability of positive net outcome**, not generic LOW/MED/HIGH alone

---

## 3.5 Layer E — LLM synthesis (explanation + prioritization only)

Keep LLM in a bounded role:

- Input: vetted candidates + uncertainty + constraints + evidence
- Output: strict schema with rationale and test protocol
- Never allow LLM to introduce unsupported parameter changes

Recommended controls:

1. Constrained structured decoding / post-parse schema enforcement
2. Hard validation against normalized setup keys and constraints
3. Multi-model consensus optional, but deterministic merge policy required

---

## 3.6 Layer F — Human trust-calibration UI (usability)

For each recommendation card, show:

- **What to change** (exact parameter + delta)
- **Why** (telemetry evidence)
- **Expected gain** (e.g. +0.08 to +0.22 s/lap in relevant corner class)
- **Risk/side effects** (e.g. possible exit traction loss)
- **Confidence + uncertainty interval**
- **Validation protocol** (2–3 lap checklist, accept/reject criteria)

Add a dedicated section:

- “**Do not trust this recommendation if…**”  
  (insufficient valid laps, mixed driving style artifacts, ambiguous mapping, etc.)

This directly improves adoption while preventing overtrust.

---

## 4) Accuracy methods worth adopting now

## 4.1 Segment-aware diagnostics

Replace coarse whole-lap summaries with entry/mid/exit × speed-bin summaries.  
Most setup effects are phase-dependent, so segment-aware features materially improve causal relevance.

## 4.2 Hierarchical modeling

Use hierarchical priors/transfer:

- global → architecture (LMDh/LMH) → car → track family

This improves cold-start robustness and avoids overfitting sparse car-track combinations.

## 4.3 Counterfactual recommendation validation

Before showing a recommendation, test:

1. Is it feasible/legal in setup?
2. Does counterfactual estimate predict likely net positive?
3. Is uncertainty narrow enough?
4. Are known side effects tolerable for this track/session objective?

Only then publish as top recommendation.

## 4.4 Calibration over raw confidence labels

Raw confidence labels are weak.  
Track actual hit-rate by confidence bucket and recalibrate regularly.

## 4.5 Actionability-first explanations

Use counterfactual style explanation:

- “If front heave spring is increased by +X, model predicts Y reduction in high-speed bottoming events, with Z risk of low-speed understeer.”

This is more useful than generic prose and improves engineer trust calibration.

---

## 5) Metrics and evaluation framework

Create a formal recommendation quality scoreboard.

## 5.1 Offline metrics

- Recommendation precision@K (did suggested direction align with observed improvement)
- Net lap-time impact distribution (median, p25/p75)
- Stability metric change success rate
- False-positive rate (recommended but degraded outcome)
- Coverage of exact vs inferred vs blocked
- Calibration error (ECE/Brier-style) for success probability

## 5.2 Online/human-loop metrics

- Acceptance rate by recommendation type
- Follow-through completion rate (was validation protocol executed)
- Trust calibration metric: agreement quality, not just agreement quantity
- Time-to-decision reduction for engineers/drivers

## 5.3 Golden set and regression

Maintain a curated “golden telemetry + setup + expected diagnosis” suite:

- per car
- per representative track archetype
- with known canonical setup issues

Run it on every substantial recommendation logic change.

---

## 6) Concrete implementation roadmap (repo-tailored)

## Phase 0 (quick wins, 1–2 weeks)

1. Add recommendation outcome logging schema (local exportable JSON is enough initially).
2. Add segment-level telemetry features in analysis output (`entry/mid/exit`, speed bins).
3. Add “expected effect” + “risk” fields in recommendation types.
4. Add UI “trust guardrails” panel (“don’t trust if…”).

## Phase 1 (2–4 weeks)

1. Implement baseline counterfactual impact model (tree-based).
2. Add conformal interval calibration per car family.
3. Introduce recommendation rank score:
   - expected gain
   - risk penalty
   - confidence calibration
   - setup feasibility score

## Phase 2 (4–8 weeks)

1. Build offline evaluation harness + golden set runner.
2. Add model drift and calibration dashboards.
3. Add contextual feedback capture (accepted/rejected + observed outcome).

## Phase 3 (8+ weeks)

1. Introduce safe policy-learning/bandit-style improvement from feedback.
2. Build architecture for server-side AI orchestration + key protection.
3. Add advanced retrieval over structured domain knowledge (rules + constraints + quirks).

---

## 7) Type/system changes recommended in codebase

Likely additions in `src/lib/types.ts`:

- `expectedGain` (with interval)
- `sideEffectRisks`
- `successProbability`
- `confidenceBreakdown`:
  - data
  - mapping
  - model
  - constraints
- `validationProtocol` with explicit pass/fail criteria

Likely updates:

- `analysis-engine.ts`: emit segment-aware features + candidate hypotheses
- `ai-recommendations.ts`: consume bounded candidate objects; enforce stricter validation
- `SetupRecommendationsPanel.tsx`: render gain/risk/confidence interval + trust guardrails

---

## 8) Risk controls (must-have)

1. **No free-form parameter invention** — all parameter keys must resolve against normalized setup.
2. **Constraint-hard stop** — blocked recommendations cannot be upgraded by LLM wording.
3. **Out-of-distribution detection** — warn when telemetry context is unlike training corpus.
4. **Calibration monitoring** — degrade confidence automatically if miscalibration rises.
5. **Evaluation gate** — no promotion of model changes without golden-set + calibration pass.

---

## 9) Practical “advanced + accurate” recommendation format (example)

```json
{
  "parameterKey": "platform.frontHeaveSpring",
  "change": "+10 N/mm",
  "expectedGain": { "medianLapDeltaSec": -0.12, "interval90": [-0.20, -0.03] },
  "confidence": {
    "successProbability": 0.72,
    "breakdown": { "data": 0.84, "mapping": 0.95, "model": 0.66, "constraints": 1.0 }
  },
  "risk": [
    "May increase low-speed entry understeer"
  ],
  "evidence": [
    "High-speed front ride-height variance above threshold",
    "Repeated clean-bottoming events at >220 km/h"
  ],
  "validationProtocol": [
    "Run 3 push laps with same fuel map",
    "Confirm front bottoming events reduce by >=30%",
    "Reject if low-speed understeer score worsens by >=1 severity step"
  ],
  "doNotTrustIf": [
    "Valid laps < 3",
    "Setup mapping for parameter not exact",
    "Surface temp channels unstable or missing"
  ]
}
```

---

## 10) Research references used for this blueprint

1. Bayesian optimization/autonomous racing foundations (racing-line and dynamics-learning literature).
2. Surrogate-based suspension/setup optimization and DOE methods for vehicle tuning.
3. Conformal/adaptive conformal prediction literature for time-series uncertainty calibration.
4. Hybrid rule + LLM/neurosymbolic system design papers for reliable structured decisions.
5. Counterfactual explanation/recourse literature for actionable recommendation rationale.
6. Offline contextual bandit / safe policy improvement research for feedback learning.
7. Trust-calibration and explainable decision-support human-factors studies.

---

## 11) Bottom line

If you want **advanced + accurate** setup AI, the winning formula is:

- deterministic physics-informed candidate generation,
- calibrated counterfactual impact estimation,
- strict constraint/mapping validation,
- and human-centered trust-calibrated presentation.

This repository already has strong primitives; the next leap is adding **impact modeling + calibration + evaluation discipline** around them.
