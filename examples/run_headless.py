"""Headless batch run -- proof that the simulation engine needs no UI stack.

Runs N growth cycles purely in-process, writes a portable ``.npz`` snapshot,
and prints live statistics. This script exercises exactly the public API a
Blender/OpenGL/Unity client would consume:

    engine = create_default_engine(config)
    state = engine.step(dt)          # advance one cycle
    snapshot = engine.snapshot()     # plain dict of numpy arrays

Usage:
    .venv/bin/python examples/run_headless.py --cycles 60 --seed 7
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np

from flora.core.config import EngineConfig
from flora.factory import create_default_engine
from flora.io.snapshot import save_npz


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run the headless Flora simulation engine for N cycles."
    )
    parser.add_argument("--cycles", type=int, default=60, help="simulation cycles")
    parser.add_argument("--dt", type=float, default=1.0, help="dt per step")
    parser.add_argument("--seed", type=int, default=7, help="RNG seed (determinism)")
    parser.add_argument("--habit", choices=("monopodial", "sympodial", "climbing"), default="monopodial")
    parser.add_argument("--inflorescence", choices=("single", "raceme", "spike", "panicle", "cyme"),
                        default="raceme")
    parser.add_argument("--out", type=Path, default=Path("plant_snapshot.npz"))
    return parser.parse_args()


def build_config(args: argparse.Namespace) -> EngineConfig:
    base = EngineConfig(seed=args.seed)
    # frozen dataclasses: rebuild the inflorescence layer with CLI overrides
    from dataclasses import replace

    infl = replace(base.inflorescence,
                   growth_habit=args.habit,
                   inflorescence_type=args.inflorescence)
    return replace(base, inflorescence=infl)


def main() -> None:
    args = parse_args()
    engine = create_default_engine(build_config(args))

    for _ in range(args.cycles):
        state = engine.step(args.dt)

    snap = engine.snapshot()
    n = int(snap["n"])
    radius = np.asarray(snap["radius"])
    vigor = np.asarray(snap["vigor"])
    types = np.asarray(snap["node_type"])

    print(f"cycles={args.cycles}  nodes={n}")
    print(f"apices={int((types == 1).sum())}  floral_axes={int((types == 3).sum())}  "
          f"flowers={int((types == 4).sum())}")
    if n > 0:
        print(f"radius  min/max: {radius[:n].min():.5f} / {radius[:n].max():.5f}")
        print(f"vigor   min/max: {vigor[:n].min():.3f} / {vigor[:n].max():.3f}")

    save_npz(engine.state, args.out)
    print(f"snapshot -> {args.out}")


if __name__ == "__main__":
    main()
