"""Decoupling, spatial math, pipe model and snapshot unit tests."""

from __future__ import annotations

import re
from pathlib import Path

import numpy as np
import pytest

from flora import EngineConfig, create_default_engine, load_npz, save_npz, snapshot
from flora.core.config import APEX, INTERNODE
from flora.core.spatial import (
    QUAT_IDENTITY,
    quat_from_axis_angle,
    quat_multiply,
    quat_normalize,
    quat_rotate,
    random_unit_axes,
)
from flora.core.state import PlantState
from flora.physics.materials import second_moment_area, young_modulus


def test_spatial_quaternions() -> None:
    # Axis-angle rotation round trip
    axis = np.array([0.0, 0.0, 1.0])
    q = quat_from_axis_angle(axis, np.array([np.pi / 2.0]))
    v = np.array([[1.0, 0.0, 0.0]])
    rotated = quat_rotate(q, v)
    assert np.allclose(rotated[0], [0.0, 1.0, 0.0], atol=1e-12)

    # Normalization & identity
    q_unnorm = np.array([[2.0, 0.0, 0.0, 0.0]])
    assert np.allclose(quat_normalize(q_unnorm), QUAT_IDENTITY)

    # Random unit axes distribution
    rng = np.random.default_rng(123)
    axes = random_unit_axes(500, rng)
    assert axes.shape == (500, 3)
    assert np.allclose(np.linalg.norm(axes, axis=-1), 1.0, atol=1e-12)


def test_materials_mechanics() -> None:
    cfg = EngineConfig().mechanics
    w = np.array([0.0, 0.5, 1.0])
    e = young_modulus(w, cfg)
    assert e[0] == cfg.e_herbaceous
    assert e[2] == cfg.e_wood
    assert e[1] == 0.5 * (cfg.e_herbaceous + cfg.e_wood)

    r = np.array([0.01, 0.02])
    i_sec = second_moment_area(r)
    assert np.allclose(i_sec, 0.25 * np.pi * r**4)


def test_snapshot_io(tmp_path: Path) -> None:
    engine = create_default_engine(EngineConfig(seed=7))
    engine.step(1.0)
    st = engine.state

    snap = snapshot(st)
    assert "n" in snap and snap["n"] == st.n
    assert "position" in snap and snap["position"].shape == (st.n, 3)

    npz_path = tmp_path / "test_plant.npz"
    save_npz(st, npz_path)
    loaded = load_npz(npz_path)
    assert loaded["n"] == snap["n"]
    assert np.allclose(loaded["position"], snap["position"])


def test_decoupling_import_contract() -> None:
    """Verify strictly that flora modules contain zero UI/rendering imports."""
    flora_dir = Path("flora")
    forbidden_imports = {
        r"^\s*(?:import|from)\s+tkinter\b",
        r"^\s*(?:import|from)\s+matplotlib\b",
        r"^\s*(?:import|from)\s+PyQt\b",
        r"^\s*(?:import|from)\s+wx\b",
    }
    offending: list[str] = []

    for py_file in flora_dir.rglob("*.py"):
        content = py_file.read_text(encoding="utf-8")
        for line in content.splitlines():
            for pattern in forbidden_imports:
                if re.match(pattern, line):
                    offending.append(f"{py_file}: forbidden import statement {line.strip()}")

    assert not offending, f"Decoupling import violation detected under flora/: {offending}"
