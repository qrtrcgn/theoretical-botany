"""Headless batch run with full EngineConfig CLI access.

Usage examples:
    python examples/run_headless.py --cycles 60 --seed 7
    python examples/run_headless.py --config config.json --set mechanics.gravity=1.62
"""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict
from pathlib import Path
from typing import Any

import numpy as np

from flora.core.config import (
    EngineConfig,
    EnvironmentConfig,
    InflorescenceConfig,
    MechanicsConfig,
    MorphologyConfig,
    PhysiologyConfig,
)
from flora.factory import create_default_engine
from flora.io.snapshot import save_npz


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run the headless Flora simulation engine for N cycles."
    )
    parser.add_argument("--cycles", type=int, default=60, help="simulation cycles")
    parser.add_argument("--dt", type=float, default=1.0, help="dt per step")
    parser.add_argument("--seed", type=int, default=7, help="RNG seed (determinism)")
    parser.add_argument("--config", type=Path, default=None, help="JSON file with EngineConfig fields")
    parser.add_argument(
        "--set",
        action="append",
        default=[],
        metavar="PATH=VALUE",
        help="override config value, e.g. mechanics.gravity=1.62",
    )
    parser.add_argument("--habit", choices=("monopodial", "sympodial", "climbing"), default=None)
    parser.add_argument(
        "--inflorescence",
        choices=("single", "raceme", "spike", "panicle", "cyme"),
        default=None,
    )
    parser.add_argument("--out", type=Path, default=Path("plant_snapshot.npz"))
    parser.add_argument("--raw-json", type=Path, default=None, help="optional full JSON snapshot output")
    return parser.parse_args()


def _deep_merge(dst: dict[str, Any], src: dict[str, Any]) -> dict[str, Any]:
    for key, value in src.items():
        if key in dst and isinstance(dst[key], dict) and isinstance(value, dict):
            _deep_merge(dst[key], value)
        else:
            dst[key] = value
    return dst


def _parse_override(override: str) -> tuple[list[str], Any]:
    if "=" not in override:
        raise ValueError(f"invalid --set value '{override}': expected PATH=VALUE")
    path, raw_value = override.split("=", 1)
    keys = [k for k in path.split(".") if k]
    if not keys:
        raise ValueError(f"invalid --set path in '{override}'")
    try:
        value = json.loads(raw_value)
    except json.JSONDecodeError:
        value = raw_value
    return keys, value


def _set_nested(cfg: dict[str, Any], keys: list[str], value: Any) -> None:
    cur = cfg
    for key in keys[:-1]:
        if key not in cur or not isinstance(cur[key], dict):
            raise KeyError(f"unknown config path: {'.'.join(keys)}")
        cur = cur[key]
    leaf = keys[-1]
    if leaf not in cur:
        raise KeyError(f"unknown config path: {'.'.join(keys)}")
    cur[leaf] = value


def build_config(args: argparse.Namespace) -> EngineConfig:
    cfg_map = asdict(EngineConfig(seed=args.seed))

    if args.config is not None:
        file_data = json.loads(args.config.read_text(encoding="utf-8"))
        if not isinstance(file_data, dict):
            raise ValueError("--config must contain a JSON object")
        _deep_merge(cfg_map, file_data)

    if args.habit is not None:
        cfg_map["inflorescence"]["growth_habit"] = args.habit
    if args.inflorescence is not None:
        cfg_map["inflorescence"]["inflorescence_type"] = args.inflorescence

    for override in args.set:
        keys, value = _parse_override(override)
        _set_nested(cfg_map, keys, value)

    return EngineConfig(
        capacity=cfg_map["capacity"],
        seed=cfg_map["seed"],
        morphology=MorphologyConfig(**cfg_map["morphology"]),
        physiology=PhysiologyConfig(**cfg_map["physiology"]),
        mechanics=MechanicsConfig(**cfg_map["mechanics"]),
        inflorescence=InflorescenceConfig(**cfg_map["inflorescence"]),
        environment=EnvironmentConfig(**cfg_map["environment"]),
    )


def _jsonable_snapshot(snap: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for key, value in snap.items():
        if isinstance(value, np.ndarray):
            out[key] = value.tolist()
        elif isinstance(value, np.generic):
            out[key] = value.item()
        else:
            out[key] = value
    return out


def main() -> None:
    args = parse_args()
    engine = create_default_engine(build_config(args))

    for _ in range(args.cycles):
        engine.step(args.dt)

    snap = engine.snapshot()
    n = int(snap["n"])
    radius = np.asarray(snap["radius"])
    vigor = np.asarray(snap["vigor"])
    types = np.asarray(snap["node_type"])

    print(f"cycles={args.cycles}  nodes={n}")
    print(
        f"apices={int((types == 1).sum())}  floral_axes={int((types == 3).sum())}  "
        f"flowers={int((types == 4).sum())}"
    )
    if n > 0:
        print(f"radius  min/max: {radius[:n].min():.5f} / {radius[:n].max():.5f}")
        print(f"vigor   min/max: {vigor[:n].min():.3f} / {vigor[:n].max():.3f}")

    save_npz(engine.state, args.out)
    print(f"snapshot -> {args.out}")

    if args.raw_json is not None:
        args.raw_json.write_text(
            json.dumps(_jsonable_snapshot(snap), ensure_ascii=False),
            encoding="utf-8",
        )
        print(f"raw json -> {args.raw_json}")


if __name__ == "__main__":
    main()
