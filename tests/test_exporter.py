from __future__ import annotations

from pathlib import Path
import numpy as np
import pytest

from flora import EngineConfig, create_default_engine
from flora.io.exporter import export_obj, export_gltf


def test_export_obj_basic(tmp_path: Path) -> None:
    engine = create_default_engine(EngineConfig(seed=42))
    for _ in range(10):
        engine.step(1.0)

    obj_str = export_obj(engine.state)
    assert isinstance(obj_str, str)
    assert len(obj_str) > 0
    assert "v " in obj_str
    assert "f " in obj_str

    out_file = tmp_path / "plant.obj"
    export_obj(engine.state, out_path=out_file)
    assert out_file.exists()
    assert out_file.stat().st_size > 0


def test_export_gltf_basic(tmp_path: Path) -> None:
    engine = create_default_engine(EngineConfig(seed=42))
    for _ in range(10):
        engine.step(1.0)

    gltf_dict = export_gltf(engine.state)
    assert isinstance(gltf_dict, dict)
    assert "asset" in gltf_dict
    assert gltf_dict["asset"]["version"] == "2.0"
    assert "nodes" in gltf_dict
    assert len(gltf_dict["nodes"]) > 0

    out_file = tmp_path / "plant.gltf"
    export_gltf(engine.state, out_path=out_file)
    assert out_file.exists()
    assert out_file.stat().st_size > 0
