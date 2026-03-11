"""Car physical model definitions.

Each car defines mass properties, suspension parameters, aero map axis
conventions, valid ride height ranges, and calibrated aero compression data.

IMPORTANT — Aero map axis swap:
    In the parsed aero maps, the "front_rh" axis (rows, 25-75mm) actually
    represents the REAR ride height, and the "rear_rh" axis (cols, 5-50mm)
    represents the FRONT ride height. This is because the xlsx spreadsheets
    label rows as "front" and columns as "rear", but the physical mapping
    is inverted. The CarModel stores this convention and the solver handles
    the coordinate transform.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class AeroCompression:
    """Calibrated aero compression model for static-to-dynamic RH conversion.

    At a reference speed, aero loads compress the suspension from the static
    garage ride height down to the dynamic ride height at speed.

    compression(V) = compression_ref * (V / V_ref)^2

    This V-squared scaling is physically correct since aero force ~ V^2.
    """
    ref_speed_kph: float             # Speed at which compression was calibrated
    front_compression_mm: float      # Front RH compression at ref speed
    rear_compression_mm: float       # Rear RH compression at ref speed

    def front_at_speed(self, speed_kph: float) -> float:
        """Front aero compression (mm) at a given speed."""
        return self.front_compression_mm * (speed_kph / self.ref_speed_kph) ** 2

    def rear_at_speed(self, speed_kph: float) -> float:
        """Rear aero compression (mm) at a given speed."""
        return self.rear_compression_mm * (speed_kph / self.ref_speed_kph) ** 2


@dataclass
class PushrodGeometry:
    """Pushrod offset to ride height relationship.

    static_rh = base_rh + pushrod_offset * pushrod_to_rh_ratio

    Where base_rh is the natural ride height with pushrod offset at 0mm,
    and pushrod_to_rh_ratio converts pushrod length change to RH change.
    A negative pushrod offset lowers the car (reduces ride height).
    """
    front_base_rh_mm: float          # Front RH with pushrod at 0 offset
    rear_base_rh_mm: float           # Rear RH with pushrod at 0 offset
    front_pushrod_to_rh: float       # mm RH change per mm pushrod offset
    rear_pushrod_to_rh: float        # mm RH change per mm pushrod offset

    def front_offset_for_rh(self, target_rh: float) -> float:
        """Pushrod offset needed to achieve target front static RH."""
        return (target_rh - self.front_base_rh_mm) / self.front_pushrod_to_rh

    def rear_offset_for_rh(self, target_rh: float) -> float:
        """Pushrod offset needed to achieve target rear static RH."""
        return (target_rh - self.rear_base_rh_mm) / self.rear_pushrod_to_rh

    def front_rh_for_offset(self, offset: float) -> float:
        """Front static RH resulting from a given pushrod offset."""
        return self.front_base_rh_mm + offset * self.front_pushrod_to_rh

    def rear_rh_for_offset(self, offset: float) -> float:
        """Rear static RH resulting from a given pushrod offset."""
        return self.rear_base_rh_mm + offset * self.rear_pushrod_to_rh


@dataclass
class HeaveSpringModel:
    """Calibrated heave/third spring physics model.

    Models ride height excursion as a function of spring rate:
        excursion(k) = v_p99 * sqrt(m_eff / k)

    Where m_eff is an effective heave mass calibrated from telemetry.
    This is NOT the physical sprung mass — it's a lumped parameter that
    captures the frequency-domain coupling between track surface excitation,
    suspension geometry, and ride height response.

    Two constraints per axle:
    - Bottoming: excursion_p99 < dynamic_RH (binding for front)
    - Variance: sigma = excursion / 2.33 < sigma_target (binding for rear)

    The 2.33 divisor converts p99 excursion to sigma (p99 = mean + 2.33*sigma
    for a Gaussian distribution).
    """
    front_m_eff_kg: float            # Calibrated front effective heave mass
    rear_m_eff_kg: float             # Calibrated rear effective heave mass
    front_spring_range_nmm: tuple[float, float] = (20.0, 200.0)  # Valid range
    rear_spring_range_nmm: tuple[float, float] = (100.0, 1000.0)
    sigma_target_mm: float = 10.0    # Platform stability threshold
    perch_offset_front_baseline_mm: float = -13.0  # Verified baseline
    perch_offset_rear_baseline_mm: float = 42.5


@dataclass
class RideHeightVariance:
    """Model for ride height oscillation at speed from track surface bumps.

    Converts shock velocity percentiles to estimated ride height excursion
    using: excursion = shock_vel / (2 * pi * dominant_freq)

    The dominant frequency is the characteristic bump frequency of the
    track surface, estimated from the shock velocity spectrum.
    """
    dominant_bump_freq_hz: float     # Characteristic bump frequency


@dataclass
class CarModel:
    """Physical model for a GTP/Hypercar car."""

    name: str
    canonical_name: str              # "bmw", "ferrari", etc.

    # Mass properties
    mass_car_kg: float               # Dry car mass
    mass_driver_kg: float = 75.0     # Driver mass
    fuel_density_kg_per_l: float = 0.742  # Fuel density (E10 gasoline)

    # Weight distribution
    weight_dist_front: float = 0.47  # Static front weight fraction

    # Aero map axis convention
    # True means aero map "front_rh" axis = actual REAR ride height
    aero_axes_swapped: bool = True

    # Valid ride height ranges (actual front/rear, in mm)
    min_front_rh_static: float = 30.0  # iRacing enforced floor for GTP
    max_front_rh_static: float = 80.0
    min_rear_rh_static: float = 30.0
    max_rear_rh_static: float = 80.0

    # Valid dynamic RH ranges (from aero map grid bounds, actual orientation)
    min_front_rh_dynamic: float = 5.0
    max_front_rh_dynamic: float = 50.0
    min_rear_rh_dynamic: float = 25.0
    max_rear_rh_dynamic: float = 75.0

    # Vortex burst threshold (mm) — front dynamic RH must stay above this
    vortex_burst_threshold_mm: float = 2.0

    # Suspension
    front_heave_spring_nmm: float = 50.0   # N/mm at spring
    rear_third_spring_nmm: float = 530.0   # N/mm at spring

    # Calibrated compression model
    aero_compression: AeroCompression = field(default_factory=lambda: AeroCompression(
        ref_speed_kph=230.0, front_compression_mm=15.0, rear_compression_mm=8.0
    ))

    # Pushrod geometry
    pushrod: PushrodGeometry = field(default_factory=lambda: PushrodGeometry(
        front_base_rh_mm=52.6, rear_base_rh_mm=76.8,
        front_pushrod_to_rh=1.0, rear_pushrod_to_rh=1.0
    ))

    # Ride height variance model
    rh_variance: RideHeightVariance = field(default_factory=lambda: RideHeightVariance(
        dominant_bump_freq_hz=5.0
    ))

    # Heave spring physics model
    heave_spring: HeaveSpringModel = field(default_factory=lambda: HeaveSpringModel(
        front_m_eff_kg=176.1, rear_m_eff_kg=2867.5
    ))

    # Available wing angles
    wing_angles: list[float] = field(default_factory=list)

    def total_mass(self, fuel_load_l: float) -> float:
        """Total car mass including driver and fuel (kg)."""
        return self.mass_car_kg + self.mass_driver_kg + fuel_load_l * self.fuel_density_kg_per_l

    def to_aero_coords(self, actual_front_rh: float, actual_rear_rh: float) -> tuple[float, float]:
        """Convert actual front/rear RH to aero map query coordinates.

        Returns (aero_front_rh, aero_rear_rh) for use with AeroSurface.query().
        """
        if self.aero_axes_swapped:
            return actual_rear_rh, actual_front_rh
        return actual_front_rh, actual_rear_rh

    def from_aero_coords(self, aero_front_rh: float, aero_rear_rh: float) -> tuple[float, float]:
        """Convert aero map coordinates back to actual front/rear RH.

        Returns (actual_front_rh, actual_rear_rh).
        """
        if self.aero_axes_swapped:
            return aero_rear_rh, aero_front_rh
        return aero_front_rh, aero_rear_rh

    def rh_excursion_p99(self, shock_vel_p99_mps: float) -> float:
        """Estimate p99 ride height excursion (mm) from shock velocity.

        Uses: excursion = shock_vel / (2 * pi * dominant_freq)
        Converts from m/s to mm.
        """
        import math
        freq = self.rh_variance.dominant_bump_freq_hz
        excursion_m = shock_vel_p99_mps / (2 * math.pi * freq)
        return excursion_m * 1000  # Convert to mm


# ─── Car definitions ─────────────────────────────────────────────────────────

BMW_M_HYBRID_V8 = CarModel(
    name="BMW M Hybrid V8",
    canonical_name="bmw",
    mass_car_kg=1030.0,       # GTP minimum ~1030 kg dry
    mass_driver_kg=75.0,
    weight_dist_front=0.47,
    aero_axes_swapped=True,
    min_front_rh_static=30.0,  # sim-enforced floor for all GTP
    max_front_rh_static=80.0,
    min_rear_rh_static=30.0,
    max_rear_rh_static=80.0,
    min_front_rh_dynamic=5.0,  # aero map "rear_rh" axis
    max_front_rh_dynamic=50.0,
    min_rear_rh_dynamic=25.0,  # aero map "front_rh" axis
    max_rear_rh_dynamic=75.0,
    vortex_burst_threshold_mm=2.0,
    front_heave_spring_nmm=50.0,  # minimum safe at Sebring
    rear_third_spring_nmm=530.0,
    aero_compression=AeroCompression(
        # Calibrated from verified BMW Sebring setup:
        # Static front 30.1mm → dynamic ~15mm = 15.1mm compression
        # Static rear 47.8mm → dynamic ~40mm = 7.8mm compression
        # Reference speed: characteristic aero speed ~230 kph
        ref_speed_kph=230.0,
        front_compression_mm=15.1,
        rear_compression_mm=7.8,
    ),
    pushrod=PushrodGeometry(
        # Calibrated from verified setup:
        # Front: offset -22.5mm → static RH 30.1mm → base = 30.1 - (-22.5)*1.0 = 52.6mm
        # Rear: offset -29.0mm → static RH 47.8mm → base = 47.8 - (-29.0)*1.0 = 76.8mm
        front_base_rh_mm=52.6,
        rear_base_rh_mm=76.8,
        front_pushrod_to_rh=1.0,  # Approximate 1:1 ratio
        rear_pushrod_to_rh=1.0,
    ),
    rh_variance=RideHeightVariance(
        # Sebring dominant bump frequency estimated at ~5 Hz
        # from shock velocity spectrum (p50 ~25 mm/s, significant energy in 3-10 Hz)
        dominant_bump_freq_hz=5.0,
    ),
    heave_spring=HeaveSpringModel(
        # Calibrated from verified BMW Sebring telemetry:
        # Front: k=50 is boundary (excursion=14.9mm = dynamic RH 14.9mm)
        #        k=30 bottoms by 4.3mm (observed: 4.6mm, 22 events)
        # Rear: sigma=9.9mm at k=530 (observed: 9.9mm in back straight zone)
        front_m_eff_kg=176.1,
        rear_m_eff_kg=2867.5,
        front_spring_range_nmm=(20.0, 200.0),
        rear_spring_range_nmm=(100.0, 1000.0),
        sigma_target_mm=10.0,   # SKILL.md: sigma > 5mm at >200 kph = unstable
        perch_offset_front_baseline_mm=-13.0,
        perch_offset_rear_baseline_mm=42.5,
    ),
    wing_angles=[12.0, 13.0, 14.0, 15.0, 16.0, 17.0],
)


# ─── Registry ────────────────────────────────────────────────────────────────

_CARS = {
    "bmw": BMW_M_HYBRID_V8,
}


def get_car(name: str) -> CarModel:
    """Get car model by canonical name."""
    key = name.lower().strip()
    if key not in _CARS:
        available = ", ".join(_CARS.keys())
        raise KeyError(f"Unknown car '{name}'. Available: {available}")
    return _CARS[key]
