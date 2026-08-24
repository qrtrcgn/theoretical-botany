"""CLI entry point for the Flora simulation engine (Matplotlib viewer).

Usage:
    python -m viewers.view_plant --cycles 50 --seed 42
    python -m viewers.view_plant --save plant_render.png --cycles 60 --inflorescence panicle
"""

from __future__ import annotations

import argparse
from dataclasses import replace
from pathlib import Path

from flora import EngineConfig, create_default_engine
from viewers.matplotlib_viewer import PlantViewer3D


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Visualize the Flora simulation engine.")
    parser.add_argument("--cycles", type=int, default=50, help="number of growth cycles")
    parser.add_argument("--dt", type=float, default=1.0, help="time step delta")
    parser.add_argument("--seed", type=int, default=42, help="RNG seed")
    parser.add_argument("--habit", choices=("monopodial", "sympodial"), default="monopodial")
    parser.add_argument("--inflorescence", choices=("single", "raceme", "panicle", "cyme"),
                        default="raceme")
    parser.add_argument("--save", type=Path, default=None,
                        help="save PNG image headlessly instead of opening interactive window")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    base = EngineConfig(seed=args.seed)
    infl = replace(
        base.inflorescence,
        growth_habit=args.habit,
        inflorescence_type=args.inflorescence,
    )
    config = replace(base, inflorescence=infl)

    engine = create_default_engine(config)
    viewer = PlantViewer3D(
        engine,
        title=f"Flora Engine | {args.inflorescence.capitalize()} ({args.habit})",
    )

    if args.save is not None:
        viewer.save_snapshot_image(args.save, cycles=args.cycles, dt=args.dt)
    else:
        viewer.run_animation(cycles=args.cycles, dt=args.dt)


if __name__ == "__main__":
    main()
