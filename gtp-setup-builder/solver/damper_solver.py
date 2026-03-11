"""Step 6: Damper Solver.

Determines all damper settings (LS/HS compression and rebound, HS slope)
for front and rear corners from the track surface spectrum and spring rates.

Physics:

    Dampers control the RATE of suspension movement, not the amount.
    Critical concept: "low speed" and "high speed" refer to SHAFT VELOCITY
    (mm/s), NOT car speed. A car at 300 kph on smooth tarmac has LS damper
    activity; a car at 50 kph hitting a kerb generates HS damper events.

    Low-Speed (LS) regime: shaft velocity ≤ 50 mm/s
    ─────────────────────────────────────────────────
    Controls body roll, pitch, and heave rate — i.e., how quickly the car
    changes attitude under cornering, braking, and acceleration loads.
    Primary effect: lap time, corner balance.

    Target LS force is derived from the target weight transfer rate:
        F_ls = m_corner * (v_target / dt_maneuver)

    Where:
        m_corner = sprung mass per corner (kg)
        v_target = target damper shaft velocity at peak weight transfer (mm/s)
        dt_maneuver = maneuver duration (s, from corner entry to apex)

    HS regime: shaft velocity > 50 mm/s
    ─────────────────────────────────────
    Controls the platform response to large, fast bumps and kerbs. These are
    transient events — the damper must absorb energy rapidly without causing
    ride height spikes that could bottom the car or throw it off line.

    Target HS compression force is derived from the track shock velocity:
        F_hs_comp = k_spring * δ_bump_p95 + F_hs_target

    In practice: HS comp should be soft enough to not "lock up" the suspension
    over bumps (too stiff → tyre leaves ground), but stiff enough to prevent
    bottoming during large combined-load events.

    Rebound/compression ratio:
    ───────────────────────────
    Target ratio ~2:1 (rebound ~2× compression at equivalent shaft velocities).
    This produces roughly equal PEAK forces because compression sees higher
    velocities from bump inputs (road surface hits the tyre) while rebound
    is gentler (suspension extending after a bump). If peak forces are equal,
    the suspension returns to neutral at the same rate it was compressed.

    HS slope:
    ──────────
    Digressive slope: at high shaft velocities, force curve flattens.
    Higher slope value = more digressive (force grows more slowly at extreme
    velocities). This prevents over-damping during the largest bump events.
    Typically: lower slope for smooth tracks (more linear needed for consistent
    response), higher slope for bumpy tracks (need digressive at extreme events).

    BMW Sebring calibration:
    - Front: LS comp 8, LS rbd 8, HS comp 6, HS rbd 5, slope 6
    - Rear:  LS comp 8, LS rbd 9, HS comp 4, HS rbd 3, slope 4
    - Rear HS values are LOWER than front (rear is more compliant = better
      traction over bumps; front needs more HS comp for platform control)
    - Rear LS rbd (9) is slightly higher than LS comp (8): asymmetric to
      control rear squat on acceleration without compromising cornering

    Per SKILL.md: "Dampers are step 6. Only after rake, heave springs,
    corner springs, ARBs, and wheel geometry are sorted."
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from car_model.cars import CarModel
from track_model.profile import TrackProfile


@dataclass
class DamperConstraintCheck:
    """Result of a single damper constraint check."""
    name: str
    passed: bool
    value: float
    target: float
    units: str
    note: str = ""


@dataclass
class CornerDamperSettings:
    """Damper settings for one corner."""
    ls_comp: int
    ls_rbd: int
    hs_comp: int
    hs_rbd: int
    hs_slope: int

    def rbd_comp_ratio_ls(self) -> float:
        return self.ls_rbd / max(self.ls_comp, 1)

    def rbd_comp_ratio_hs(self) -> float:
        return self.hs_rbd / max(self.hs_comp, 1)


@dataclass
class DamperSolution:
    """Output of the Step 6 damper solver."""

    # Per-corner settings
    lf: CornerDamperSettings
    rf: CornerDamperSettings
    lr: CornerDamperSettings
    rr: CornerDamperSettings

    # Physics inputs
    track_shock_vel_p95_front_mps: float
    track_shock_vel_p95_rear_mps: float
    track_shock_vel_p99_front_mps: float
    track_shock_vel_p99_rear_mps: float

    # Target forces computed during solve
    target_ls_comp_force_front_n: float
    target_ls_rbd_force_front_n: float
    target_hs_comp_force_front_n: float
    target_ls_comp_force_rear_n: float
    target_ls_rbd_force_rear_n: float
    target_hs_comp_force_rear_n: float

    # Rebound/compression ratios achieved
    ls_rbd_comp_ratio_front: float
    hs_rbd_comp_ratio_front: float
    ls_rbd_comp_ratio_rear: float
    hs_rbd_comp_ratio_rear: float

    # Slope reasoning
    hs_slope_reasoning: str

    # Delta from calibrated baselines (positive = stiffer than baseline)
    front_ls_comp_delta: int
    front_ls_rbd_delta: int
    front_hs_comp_delta: int
    front_hs_rbd_delta: int
    rear_ls_comp_delta: int
    rear_ls_rbd_delta: int
    rear_hs_comp_delta: int
    rear_hs_rbd_delta: int

    # Constraint checks
    constraints: list[DamperConstraintCheck]
    notes: list[str] = field(default_factory=list)

    def _fmt_delta(self, d: int) -> str:
        return f"{d:+d}" if d != 0 else "  0 (baseline)"

    def summary(self) -> str:
        lines = [
            "===========================================================",
            "  STEP 6: DAMPER SOLUTION",
            "===========================================================",
            "",
            "  DAMPER SETTINGS (in clicks — BMW scale, not transferable to Ferrari)",
            "",
            "              LF    RF    LR    RR",
            f"  LS Comp:  {self.lf.ls_comp:4d}  {self.rf.ls_comp:4d}  {self.lr.ls_comp:4d}  {self.rr.ls_comp:4d}",
            f"  LS Rbd:   {self.lf.ls_rbd:4d}  {self.rf.ls_rbd:4d}  {self.lr.ls_rbd:4d}  {self.rr.ls_rbd:4d}",
            f"  HS Comp:  {self.lf.hs_comp:4d}  {self.rf.hs_comp:4d}  {self.lr.hs_comp:4d}  {self.rr.hs_comp:4d}",
            f"  HS Rbd:   {self.lf.hs_rbd:4d}  {self.rf.hs_rbd:4d}  {self.lr.hs_rbd:4d}  {self.rr.hs_rbd:4d}",
            f"  HS Slope: {self.lf.hs_slope:4d}  {self.rf.hs_slope:4d}  {self.lr.hs_slope:4d}  {self.rr.hs_slope:4d}",
            "",
            "  DELTA FROM CALIBRATED BASELINE",
            f"    Front LS comp:  {self._fmt_delta(self.front_ls_comp_delta)}",
            f"    Front LS rbd:   {self._fmt_delta(self.front_ls_rbd_delta)}",
            f"    Front HS comp:  {self._fmt_delta(self.front_hs_comp_delta)}",
            f"    Front HS rbd:   {self._fmt_delta(self.front_hs_rbd_delta)}",
            f"    Rear LS comp:   {self._fmt_delta(self.rear_ls_comp_delta)}",
            f"    Rear LS rbd:    {self._fmt_delta(self.rear_ls_rbd_delta)}",
            f"    Rear HS comp:   {self._fmt_delta(self.rear_hs_comp_delta)}",
            f"    Rear HS rbd:    {self._fmt_delta(self.rear_hs_rbd_delta)}",
            "",
            "  REBOUND/COMPRESSION RATIOS (target ~2:1)",
            f"    Front LS:  {self.ls_rbd_comp_ratio_front:.2f}:1",
            f"    Front HS:  {self.hs_rbd_comp_ratio_front:.2f}:1",
            f"    Rear LS:   {self.ls_rbd_comp_ratio_rear:.2f}:1",
            f"    Rear HS:   {self.hs_rbd_comp_ratio_rear:.2f}:1",
            "",
            "  TRACK SURFACE",
            f"    Front p95 shock vel:  {self.track_shock_vel_p95_front_mps*1000:.1f} mm/s",
            f"    Rear p95 shock vel:   {self.track_shock_vel_p95_rear_mps*1000:.1f} mm/s",
            f"    Front p99 shock vel:  {self.track_shock_vel_p99_front_mps*1000:.1f} mm/s",
            f"    Rear p99 shock vel:   {self.track_shock_vel_p99_rear_mps*1000:.1f} mm/s",
            "",
            f"  HS SLOPE REASONING: {self.hs_slope_reasoning}",
        ]
        if self.constraints:
            lines += ["", "  CONSTRAINT CHECKS"]
            for c in self.constraints:
                status = "OK" if c.passed else "WARN"
                lines.append(f"    [{status}] {c.name}: {c.value:.2f} {c.units} "
                              f"(target: {c.target:.2f})")
                if c.note:
                    lines.append(f"         {c.note}")
        if self.notes:
            lines += ["", "  NOTES"]
            for note in self.notes:
                lines.append(f"    • {note}")
        lines.append("===========================================================")
        return "\n".join(lines)


class DamperSolver:
    """Step 6 solver: compute all damper settings from physics.

    Process:
    1. Compute LS targets from weight transfer rate (spring mass, corner speed)
    2. Compute HS targets from track shock velocity spectrum
    3. Apply rebound/compression ratio (~2:1) to get rebound from compression
    4. Determine HS slope from track bumpiness
    5. Convert forces to clicks using car's force-per-click calibration
    6. Clamp to valid click ranges and check constraints
    """

    # LS reference shaft velocity: peak weight transfer speed (mm/s)
    LS_REF_VEL_MMS = 20.0

    # HS reference shaft velocity: p95 shock velocity (scaled to damper shaft)
    # Shock vel from IBT is suspension velocity, damper shaft velocity
    # is scaled by motion ratio (~0.8 for GTP)
    MOTION_RATIO = 0.80

    # Weight transfer duration estimate: time from corner entry to apex
    # Sebring: typical corner 2-3s braking + 1s apex = ~3s
    WEIGHT_TRANSFER_DT_S = 3.0

    def __init__(self, car: CarModel, track: TrackProfile):
        self.car = car
        self.track = track

    def _mass_per_corner_kg(self, is_front: bool, fuel_load_l: float) -> float:
        """Sprung mass per corner (kg), accounting for fuel."""
        total = self.car.total_mass(fuel_load_l)
        if is_front:
            return total * self.car.weight_dist_front / 2.0
        return total * (1.0 - self.car.weight_dist_front) / 2.0

    def _target_ls_comp_force(
        self, mass_per_corner_kg: float, spring_rate_nmm: float
    ) -> float:
        """Target LS compression force (N).

        Derived from: F = m * v / t (impulse approximation for weight transfer)
        where v is the target LS shaft velocity at peak weight transfer.

        This represents the DAMPER force needed to control the rate of
        weight transfer without allowing the body to dive or roll too fast.
        """
        # Natural frequency approach: target critical damping fraction 0.3-0.5
        # (underdamped for mechanical grip, not too underdamped for stability)
        k_n_per_m = spring_rate_nmm * 1000  # N/mm → N/m
        omega_n = math.sqrt(k_n_per_m / max(mass_per_corner_kg, 1))  # rad/s
        # Critical damping force at LS reference velocity
        # F_crit = 2 * sqrt(k * m) * v_ref
        c_crit = 2.0 * math.sqrt(k_n_per_m * mass_per_corner_kg)  # N·s/m
        target_fraction = 0.35  # 35% of critical = typical racing setup
        c_target = target_fraction * c_crit
        # Force at LS reference velocity (N·s/m * m/s)
        v_ref_ms = self.LS_REF_VEL_MMS / 1000.0
        return c_target * v_ref_ms

    def _target_hs_comp_force(
        self, shock_vel_p95_mps: float, spring_rate_nmm: float, dynamic_rh_mm: float
    ) -> float:
        """Target HS compression force (N) from track shock velocity spectrum.

        The HS damper needs to absorb bump energy at p95 velocities without
        causing the tyre to leave the ground or the platform to bottom.

        F_hs = k_spring * δ_expected + F_margin

        where δ_expected is the ride height change from a p95 bump event.
        """
        # Convert suspension velocity to damper shaft velocity
        shaft_vel_mps = shock_vel_p95_mps * self.MOTION_RATIO
        # Estimate ride height excursion from this velocity
        # excursion = v_shaft / (2 * pi * freq) ≈ 10-20mm for GTP at Sebring
        freq_hz = self.car.rh_variance.dominant_bump_freq_hz
        excursion_m = shaft_vel_mps / (2 * math.pi * freq_hz)
        # Spring force to compress by this excursion
        k_n_per_m = spring_rate_nmm * 1000
        spring_force = k_n_per_m * excursion_m
        # Add margin to prevent bottoming (30% of spring force)
        return spring_force * 1.3

    def _force_to_clicks(
        self, force_n: float, force_per_click: float, lo: int, hi: int
    ) -> int:
        """Convert target force (N) to nearest valid click."""
        clicks = round(force_n / max(force_per_click, 1.0))
        return max(lo, min(hi, clicks))

    def _hs_slope(self, shock_vel_p99_mps: float) -> tuple[int, str]:
        """Determine HS slope from track bumpiness.

        Bumpier tracks need more digressive slope (higher value) so the damper
        doesn't over-damp during the largest events.
        Smooth tracks: more linear (lower slope).
        """
        shock_p99_mms = shock_vel_p99_mps * 1000
        d = self.car.damper
        if shock_p99_mms > 800:
            slope = min(d.hs_slope_range[1], d.front_hs_slope_baseline + 3)
            reason = (f"p99 shock {shock_p99_mms:.0f} mm/s (very bumpy) → "
                      f"more digressive slope needed to prevent over-damping at extreme events")
        elif shock_p99_mms > 600:
            slope = d.front_hs_slope_baseline + 1
            reason = (f"p99 shock {shock_p99_mms:.0f} mm/s (bumpy, typical Sebring) → "
                      f"slightly above baseline slope")
        elif shock_p99_mms < 400:
            slope = max(d.hs_slope_range[0], d.front_hs_slope_baseline - 2)
            reason = (f"p99 shock {shock_p99_mms:.0f} mm/s (smooth track) → "
                      f"more linear slope for consistent HS response")
        else:
            slope = d.front_hs_slope_baseline
            reason = f"p99 shock {shock_p99_mms:.0f} mm/s → baseline slope appropriate"
        return slope, reason

    def solve(
        self,
        front_wheel_rate_nmm: float,
        rear_wheel_rate_nmm: float,
        front_dynamic_rh_mm: float,
        rear_dynamic_rh_mm: float,
        fuel_load_l: float = 89.0,
    ) -> DamperSolution:
        """Compute all damper settings.

        Hybrid approach: use physics to compute RELATIVE adjustments from
        calibrated baselines. This is more reliable than pure force-to-click
        conversion because the click-to-force mapping in iRacing is not
        publicly documented with sufficient precision.

        Real BMW Sebring calibration data (two setups):
          S2 "locked": F LS 7/6, HS 5/8, slope 10 | R LS 6/7, HS 3/9, slope 10
          S1 "compliant": F LS 10/5, HS 9/5, slope 5 | R LS 5/5, HS 10/6, slope 11

        Key patterns from real data:
          - LS rbd ≈ LS comp (ratio 0.8-1.2:1, NOT 2:1)
          - HS rbd > HS comp (ratio 1.5-3.0:1)
          - Rear HS comp < front HS comp (rear more compliant)
          - Front LS comp > rear LS comp (front controls entry)
          - HS slope: both axles similar (10/10 in locked, 5/11 in compliant)

        Args:
            front_wheel_rate_nmm: Front wheel rate from Step 3 (N/mm)
            rear_wheel_rate_nmm: Rear wheel rate from Step 3 (N/mm)
            front_dynamic_rh_mm: Front dynamic ride height from Step 1 (mm)
            rear_dynamic_rh_mm: Rear dynamic ride height from Step 1 (mm)
            fuel_load_l: Fuel load (kg) for mass calculation

        Returns:
            DamperSolution with all 20 damper click values
        """
        d = self.car.damper

        # Corner masses (for physics-based relative scaling)
        m_front = self._mass_per_corner_kg(is_front=True, fuel_load_l=fuel_load_l)
        m_rear = self._mass_per_corner_kg(is_front=False, fuel_load_l=fuel_load_l)

        # ─── Physics-based relative forces ────────────────────────────────────
        # These are used to compute DELTAS from baseline, not absolute clicks
        f_ls_comp_front = self._target_ls_comp_force(m_front, front_wheel_rate_nmm)
        f_ls_comp_rear = self._target_ls_comp_force(m_rear, rear_wheel_rate_nmm)
        f_hs_comp_front = self._target_hs_comp_force(
            self.track.shock_vel_p95_front_mps, front_wheel_rate_nmm, front_dynamic_rh_mm
        )
        f_hs_comp_rear = self._target_hs_comp_force(
            self.track.shock_vel_p95_rear_mps, rear_wheel_rate_nmm, rear_dynamic_rh_mm
        )

        # ─── Baseline-anchored click calculation ──────────────────────────────
        # Start from calibrated baselines, adjust by physics delta
        # Delta = (computed_force - baseline_force) / force_per_click
        # Baseline force = baseline_clicks * force_per_click

        # LS: front controls roll/pitch rate, rear follows
        # BMW pattern: front LS comp slightly > rear LS comp
        front_ls_comp = d.front_ls_comp_baseline
        front_ls_rbd = d.front_ls_rbd_baseline
        rear_ls_comp = d.rear_ls_comp_baseline
        rear_ls_rbd = d.rear_ls_rbd_baseline

        # Adjust LS based on wheel rate ratio vs baseline
        # Stiffer springs → need stiffer LS to match (damping ratio preserved)
        # BMW S2 baseline: front torsion 13.9mm → ~30 N/mm effective wheel rate
        baseline_front_wr = 30.0  # approximate front wheel rate for S2 baseline
        baseline_rear_wr = 170.0  # rear wheel rate ≈ spring rate (passed as wheel rate)
        wr_ratio_front = front_wheel_rate_nmm / max(baseline_front_wr, 1)
        wr_ratio_rear = rear_wheel_rate_nmm / max(baseline_rear_wr, 1)

        # Scale LS clicks by sqrt of wheel rate ratio (damping ~ sqrt(k*m))
        import math as _math
        ls_scale_f = _math.sqrt(wr_ratio_front)
        ls_scale_r = _math.sqrt(wr_ratio_rear)
        front_ls_comp = max(d.ls_comp_range[0], min(d.ls_comp_range[1],
            round(d.front_ls_comp_baseline * ls_scale_f)))
        front_ls_rbd = max(d.ls_rbd_range[0], min(d.ls_rbd_range[1],
            round(d.front_ls_rbd_baseline * ls_scale_f)))
        rear_ls_comp = max(d.ls_comp_range[0], min(d.ls_comp_range[1],
            round(d.rear_ls_comp_baseline * ls_scale_r)))
        rear_ls_rbd = max(d.ls_rbd_range[0], min(d.ls_rbd_range[1],
            round(d.rear_ls_rbd_baseline * ls_scale_r)))

        # ─── HS: baseline-anchored with track bumpiness adjustment ────────────
        # BMW S2 pattern: front HS comp > rear HS comp (5 vs 3)
        # HS rbd > HS comp with ratio ~1.6:1 front, 3.0:1 rear
        front_hs_comp = d.front_hs_comp_baseline
        front_hs_rbd = d.front_hs_rbd_baseline
        rear_hs_comp = d.rear_hs_comp_baseline
        rear_hs_rbd = d.rear_hs_rbd_baseline

        # Adjust HS based on shock velocity vs calibration track
        # Use the track's own profile as reference when it's the calibration track
        # For non-calibration tracks, compare against Sebring baselines
        # Sebring profile shock vels from our IBT data: 0.13 / 0.16 m/s
        sebring_p95_front = 0.1288  # m/s reference (from Sebring track profile)
        sebring_p95_rear = 0.1627
        hs_ratio_f = self.track.shock_vel_p95_front_mps / sebring_p95_front
        hs_ratio_r = self.track.shock_vel_p95_rear_mps / sebring_p95_rear

        # Bumpier track → stiffer HS comp (more control needed)
        # Each 20% increase in shock vel → +1 click HS comp
        hs_delta_f = round((hs_ratio_f - 1.0) * 5)  # 5 clicks per 100% increase
        hs_delta_r = round((hs_ratio_r - 1.0) * 5)

        front_hs_comp = max(d.hs_comp_range[0], min(d.hs_comp_range[1],
            d.front_hs_comp_baseline + hs_delta_f))
        rear_hs_comp = max(d.hs_comp_range[0], min(d.hs_comp_range[1],
            d.rear_hs_comp_baseline + hs_delta_r))

        # HS rebound follows comp with calibrated ratios
        # Front: rbd/comp ≈ 1.6:1, Rear: rbd/comp ≈ 3.0:1
        front_hs_rbd = max(d.hs_rbd_range[0], min(d.hs_rbd_range[1],
            round(front_hs_comp * 1.6)))
        rear_hs_rbd = max(d.hs_rbd_range[0], min(d.hs_rbd_range[1],
            round(rear_hs_comp * 3.0)))

        # ─── HS slope ─────────────────────────────────────────────────────────
        slope_val, slope_reason = self._hs_slope(
            max(self.track.shock_vel_p99_front_mps, self.track.shock_vel_p99_rear_mps)
        )
        # Both axles get same slope (S2 pattern: 10/10)
        rear_slope = slope_val

        # ─── Capture target forces for reporting ──────────────────────────────
        target_ls_comp_front = f_ls_comp_front
        target_ls_rbd_front = f_ls_comp_front * (front_ls_rbd / max(front_ls_comp, 1))
        target_hs_comp_front = f_hs_comp_front
        target_ls_comp_rear = f_ls_comp_rear
        target_ls_rbd_rear = f_ls_comp_rear * (rear_ls_rbd / max(rear_ls_comp, 1))
        target_hs_comp_rear = f_hs_comp_rear

        # ─── Build corner settings ────────────────────────────────────────────
        lf = CornerDamperSettings(
            ls_comp=front_ls_comp, ls_rbd=front_ls_rbd,
            hs_comp=front_hs_comp, hs_rbd=front_hs_rbd, hs_slope=slope_val,
        )
        rf = CornerDamperSettings(
            ls_comp=front_ls_comp, ls_rbd=front_ls_rbd,
            hs_comp=front_hs_comp, hs_rbd=front_hs_rbd, hs_slope=slope_val,
        )
        lr = CornerDamperSettings(
            ls_comp=rear_ls_comp, ls_rbd=rear_ls_rbd,
            hs_comp=rear_hs_comp, hs_rbd=rear_hs_rbd, hs_slope=rear_slope,
        )
        rr = CornerDamperSettings(
            ls_comp=rear_ls_comp, ls_rbd=rear_ls_rbd,
            hs_comp=rear_hs_comp, hs_rbd=rear_hs_rbd, hs_slope=rear_slope,
        )

        # ─── Constraint checks ────────────────────────────────────────────────
        constraints = [
            DamperConstraintCheck(
                name="Front LS rbd/comp ratio",
                passed=0.5 <= lf.rbd_comp_ratio_ls() <= 1.5,
                value=lf.rbd_comp_ratio_ls(),
                target=d.front_ls_rbd_baseline / max(d.front_ls_comp_baseline, 1),
                units=":1",
                note="BMW pattern: LS rbd ≈ LS comp (0.8-1.2:1)",
            ),
            DamperConstraintCheck(
                name="Rear LS rbd/comp ratio",
                passed=0.5 <= lr.rbd_comp_ratio_ls() <= 1.5,
                value=lr.rbd_comp_ratio_ls(),
                target=d.rear_ls_rbd_baseline / max(d.rear_ls_comp_baseline, 1),
                units=":1",
            ),
            DamperConstraintCheck(
                name="Front HS rbd/comp ratio",
                passed=1.0 <= lf.rbd_comp_ratio_hs() <= 3.0,
                value=lf.rbd_comp_ratio_hs(),
                target=1.6,
                units=":1",
                note="BMW S2 calibrated: front HS rbd/comp ≈ 1.6:1",
            ),
            DamperConstraintCheck(
                name="Rear HS comp < Front HS comp",
                passed=rear_hs_comp <= front_hs_comp,
                value=float(rear_hs_comp),
                target=float(front_hs_comp),
                units="clicks",
                note="Rear more compliant for traction over bumps",
            ),
            DamperConstraintCheck(
                name="Front LS comp > Rear LS comp",
                passed=front_ls_comp >= rear_ls_comp,
                value=float(front_ls_comp),
                target=float(rear_ls_comp),
                units="clicks",
                note="Front controls entry weight transfer rate",
            ),
        ]

        notes = [
            "Click values are car-specific (BMW scale). Do NOT transfer to other GTP cars.",
            "Calibrated from real BMW Sebring setup data (S2 'locked platform').",
            "BMW LS pattern: rbd ≈ comp (0.86:1 front, 1.17:1 rear) — NOT textbook 2:1.",
            "BMW HS pattern: rbd > comp (1.6:1 front, 3.0:1 rear) — standard convention.",
            "Rear HS comp is LOWER than front (3 vs 5 at Sebring) — rear needs compliance.",
            "Both axles share HS slope (S2: 10/10). Adjust only for very different surfaces.",
            "Diagnosis: understeer entry → soften F LS comp -1. Snap oversteer → stiffen R LS comp +1.",
        ]

        return DamperSolution(
            lf=lf, rf=rf, lr=lr, rr=rr,
            track_shock_vel_p95_front_mps=self.track.shock_vel_p95_front_mps,
            track_shock_vel_p95_rear_mps=self.track.shock_vel_p95_rear_mps,
            track_shock_vel_p99_front_mps=self.track.shock_vel_p99_front_mps,
            track_shock_vel_p99_rear_mps=self.track.shock_vel_p99_rear_mps,
            target_ls_comp_force_front_n=round(target_ls_comp_front, 1),
            target_ls_rbd_force_front_n=round(target_ls_rbd_front, 1),
            target_hs_comp_force_front_n=round(target_hs_comp_front, 1),
            target_ls_comp_force_rear_n=round(target_ls_comp_rear, 1),
            target_ls_rbd_force_rear_n=round(target_ls_rbd_rear, 1),
            target_hs_comp_force_rear_n=round(target_hs_comp_rear, 1),
            ls_rbd_comp_ratio_front=round(lf.rbd_comp_ratio_ls(), 2),
            hs_rbd_comp_ratio_front=round(lf.rbd_comp_ratio_hs(), 2),
            ls_rbd_comp_ratio_rear=round(lr.rbd_comp_ratio_ls(), 2),
            hs_rbd_comp_ratio_rear=round(lr.rbd_comp_ratio_hs(), 2),
            hs_slope_reasoning=slope_reason,
            front_ls_comp_delta=front_ls_comp - d.front_ls_comp_baseline,
            front_ls_rbd_delta=front_ls_rbd - d.front_ls_rbd_baseline,
            front_hs_comp_delta=front_hs_comp - d.front_hs_comp_baseline,
            front_hs_rbd_delta=front_hs_rbd - d.front_hs_rbd_baseline,
            rear_ls_comp_delta=rear_ls_comp - d.rear_ls_comp_baseline,
            rear_ls_rbd_delta=rear_ls_rbd - d.rear_ls_rbd_baseline,
            rear_hs_comp_delta=rear_hs_comp - d.rear_hs_comp_baseline,
            rear_hs_rbd_delta=rear_hs_rbd - d.rear_hs_rbd_baseline,
            constraints=constraints,
            notes=notes,
        )
