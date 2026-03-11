"""CLI entry point for the setup solver.

Usage:
    python -m solver.solve --car bmw --track sebring --wing 17
    python -m solver.solve --car bmw --track sebring --wing 17 --balance 50.14
    python -m solver.solve --car bmw --track sebring --wing 17 --fuel 12
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from aero_model import load_car_surfaces
from car_model import get_car
from track_model.profile import TrackProfile
from solver.rake_solver import RakeSolver
from solver.heave_solver import HeaveSolver

TRACKS_DIR = Path(__file__).parent.parent / "data" / "tracks"


def find_track_profile(track_name: str) -> TrackProfile:
    """Find and load a track profile by partial name match."""
    track_files = list(TRACKS_DIR.glob("*.json"))
    if not track_files:
        raise FileNotFoundError(f"No track profiles in {TRACKS_DIR}")

    # Exact match first
    for f in track_files:
        if track_name.lower() in f.stem.lower():
            return TrackProfile.load(f)

    available = [f.stem for f in track_files]
    raise FileNotFoundError(
        f"No track profile matching '{track_name}'. Available: {available}"
    )


def main():
    parser = argparse.ArgumentParser(
        description="GTP Setup Solver — Physics-based setup calculator"
    )
    parser.add_argument("--car", required=True, help="Car name (e.g., bmw)")
    parser.add_argument("--track", required=True, help="Track name (e.g., sebring)")
    parser.add_argument("--wing", required=True, type=float, help="Wing angle (degrees)")
    parser.add_argument("--balance", type=float, default=50.14,
                        help="Target DF balance %% (default: 50.14)")
    parser.add_argument("--tolerance", type=float, default=0.1,
                        help="Balance tolerance %% (default: 0.1)")
    parser.add_argument("--fuel", type=float, default=89.0,
                        help="Fuel load in liters (default: 89)")
    parser.add_argument("--free", action="store_true",
                        help="Free optimization (don't pin front RH at sim floor)")
    parser.add_argument("--json", action="store_true",
                        help="Output as JSON instead of human-readable")

    args = parser.parse_args()

    # Load car model
    car = get_car(args.car)
    print(f"Car: {car.name}")

    # Load aero surfaces
    surfaces = load_car_surfaces(car.canonical_name)
    if args.wing not in surfaces:
        available = sorted(surfaces.keys())
        print(f"ERROR: Wing angle {args.wing}° not available. Available: {available}")
        sys.exit(1)
    surface = surfaces[args.wing]
    print(f"Aero surface: {surface}")

    # Load track profile
    track = find_track_profile(args.track)
    print(f"Track: {track.track_name} — {track.track_config}")
    print(f"Best lap: {track.best_lap_time_s:.3f}s")
    print()

    # ─── Step 1: Rake / Ride Heights ─────────────────────────────────
    print("Running Step 1: Rake / Ride Heights...")
    print(f"  Target DF balance: {args.balance:.2f}% ± {args.tolerance:.2f}%")
    print(f"  Fuel load: {args.fuel:.0f} L")
    print()

    solver = RakeSolver(car, surface, track)
    solution = solver.solve(
        target_balance=args.balance,
        balance_tolerance=args.tolerance,
        fuel_load_l=args.fuel,
        pin_front_min=not args.free,
    )

    if not args.json:
        print(solution.summary())

    # ─── Step 2: Heave / Third Springs ─────────────────────────────────
    print()
    print("Running Step 2: Heave / Third Springs...")
    print()

    heave_solver = HeaveSolver(car, track)
    heave_solution = heave_solver.solve(
        dynamic_front_rh_mm=solution.dynamic_front_rh_mm,
        dynamic_rear_rh_mm=solution.dynamic_rear_rh_mm,
    )

    if args.json:
        import dataclasses
        output = {
            "step1_rake": dataclasses.asdict(solution),
            "step2_heave": dataclasses.asdict(heave_solution),
        }
        print(json.dumps(output, indent=2))
    else:
        print(heave_solution.summary())


if __name__ == "__main__":
    main()
