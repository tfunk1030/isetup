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

        # Corner masses
        m_front = self._mass_per_corner_kg(is_front=True, fuel_load_l=fuel_load_l)
        m_rear = self._mass_per_corner_kg(is_front=False, fuel_load_l=fuel_load_l)

        # ─── LS targets ──────────────────────────────────────────────────────
        target_ls_comp_front = self._target_ls_comp_force(m_front, front_wheel_rate_nmm)
        target_ls_comp_rear = self._target_ls_comp_force(m_rear, rear_wheel_rate_nmm)

        # Rebound ~2× compression at LS
        target_ls_rbd_front = target_ls_comp_front * d.rbd_comp_ratio_target
        target_ls_rbd_rear = target_ls_comp_rear * d.rbd_comp_ratio_target
        # Rear LS rbd slightly asymmetric: 10% more than 2x for anti-squat
        target_ls_rbd_rear *= 1.10

        # ─── HS targets ──────────────────────────────────────────────────────
        target_hs_comp_front = self._target_hs_comp_force(
            self.track.shock_vel_p95_front_mps, front_wheel_rate_nmm, front_dynamic_rh_mm
        )
        target_hs_comp_rear = self._target_hs_comp_force(
            self.track.shock_vel_p95_rear_mps, rear_wheel_rate_nmm, rear_dynamic_rh_mm
        )

        # HS rebound ~2× HS comp
        target_hs_rbd_front = target_hs_comp_front * d.rbd_comp_ratio_target
        target_hs_rbd_rear = target_hs_comp_rear * d.rbd_comp_ratio_target

        # Rear HS values are lower than front (rear needs more compliance)
        # Rear HS comp should be ~70% of front HS comp (BMW calibrated)
        rear_hs_comp_scale = 0.70
        target_hs_comp_rear *= rear_hs_comp_scale
        target_hs_rbd_rear *= rear_hs_comp_scale

        # ─── Convert to clicks ───────────────────────────────────────────────
        lo_ls, hi_ls = d.ls_comp_range
        lo_hs, hi_hs = d.hs_comp_range

        front_ls_comp = self._force_to_clicks(target_ls_comp_front, d.ls_force_per_click_n, lo_ls, hi_ls)
        front_ls_rbd = self._force_to_clicks(target_ls_rbd_front, d.ls_force_per_click_n, lo_ls, hi_ls)
        front_hs_comp = self._force_to_clicks(target_hs_comp_front, d.hs_force_per_click_n, lo_hs, hi_hs)
        front_hs_rbd = self._force_to_clicks(target_hs_rbd_front, d.hs_force_per_click_n, lo_hs, hi_hs)

        rear_ls_comp = self._force_to_clicks(target_ls_comp_rear, d.ls_force_per_click_n, lo_ls, hi_ls)
        rear_ls_rbd = self._force_to_clicks(target_ls_rbd_rear, d.ls_force_per_click_n, lo_ls, hi_ls)
        rear_hs_comp = self._force_to_clicks(target_hs_comp_rear, d.hs_force_per_click_n, lo_hs, hi_hs)
        rear_hs_rbd = self._force_to_clicks(target_hs_rbd_rear, d.hs_force_per_click_n, lo_hs, hi_hs)

        # HS slope
        # Use worst-case (front p99 — usually higher than rear on bumpy tracks)
        slope_val, slope_reason = self._hs_slope(
            max(self.track.shock_vel_p99_front_mps, self.track.shock_vel_p99_rear_mps)
        )
        rear_slope = max(d.hs_slope_range[0], slope_val - 2)  # Rear slightly less digressive

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
                name="Front LS rebound/compression ratio",
                passed=1.5 <= lf.rbd_comp_ratio_ls() <= 2.5,
                value=lf.rbd_comp_ratio_ls(),
                target=d.rbd_comp_ratio_target,
                units=":1",
                note=f"Target ~2:1 for controlled body motion recovery",
            ),
            DamperConstraintCheck(
                name="Rear LS rebound/compression ratio",
                passed=1.5 <= lr.rbd_comp_ratio_ls() <= 2.5,
                value=lr.rbd_comp_ratio_ls(),
                target=d.rbd_comp_ratio_target,
                units=":1",
            ),
            DamperConstraintCheck(
                name="Front HS comp within range",
                passed=d.hs_comp_range[0] <= front_hs_comp <= d.hs_comp_range[1],
                value=float(front_hs_comp),
                target=float(d.front_hs_comp_baseline),
                units="clicks",
            ),
            DamperConstraintCheck(
                name="Rear HS comp < Front HS comp (compliance hierarchy)",
                passed=rear_hs_comp < front_hs_comp,
                value=float(rear_hs_comp),
                target=float(front_hs_comp),
                units="clicks",
                note="Rear should be softer for traction over bumps",
            ),
            DamperConstraintCheck(
                name="LS comp within valid click range",
                passed=d.ls_comp_range[0] <= front_ls_comp <= d.ls_comp_range[1],
                value=float(front_ls_comp),
                target=float(d.front_ls_comp_baseline),
                units="clicks",
            ),
        ]

        notes = [
            "BMW scale: LS ~50N/click, HS ~80N/click. Do NOT use these values on Ferrari.",
            "LS damping primarily affects lap time — too stiff = understeer on entry, "
            "too soft = excessive roll/pitch. Adjust LS last in each tuning session.",
            "HS damping primarily affects stability — too stiff = tyre loses contact "
            "over bumps, too soft = platform bottoms. BMW rear HS is softer than front by design.",
            "Adjust dampers AFTER validating rake, springs, ARBs, and geometry with an IBT session.",
            "Diagnosis: if car understeers at entry → soften front LS comp. "
            "If car is stable but slow → soften front LS rbd. "
            "If car bottoms at high speed → stiffen front HS comp.",
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
