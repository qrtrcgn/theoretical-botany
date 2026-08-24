"""Public API for the Flora Plant Simulation Engine."""

from __future__ import annotations

import importlib
from typing import Any

from flora.core.config import (
    APEX,
    BUD_DORMANT,
    FLOWER,
    FLORAL_AXIS,
    INTERNODE,
    LEAF,
    STRUCTURAL_TYPES,
    EngineConfig,
    InflorescenceConfig,
    MechanicsConfig,
    MorphologyConfig,
    NodeType,
    PhysiologyConfig,
)
from flora.core.context import Pass, SimulationContext
from flora.core.engine import SimulationEngine
from flora.core.state import PlantState
from flora.io.snapshot import load_npz, save_npz, snapshot

__all__ = [
    "APEX",
    "BUD_DORMANT",
    "EngineConfig",
    "FLOWER",
    "FLORAL_AXIS",
    "INTERNODE",
    "InflorescenceConfig",
    "LEAF",
    "MechanicsConfig",
    "MorphologyConfig",
    "NodeType",
    "Pass",
    "PhysiologyConfig",
    "PlantState",
    "STRUCTURAL_TYPES",
    "SimulationContext",
    "SimulationEngine",
    "create_default_engine",
    "load_npz",
    "save_npz",
    "snapshot",
]


def __getattr__(name: str) -> Any:
    """Lazy-load factory to avoid circular imports during bootstrapping."""
    if name == "create_default_engine":
        mod = importlib.import_module("flora.factory")
        return getattr(mod, "create_default_engine")
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
