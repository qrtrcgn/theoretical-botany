"""Core simulation primitives: config, state, graph, spatial math, engine."""

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
from flora.core.graph import (
    build_adjacency,
    depth_levels,
    sum_by_parent,
    topological_orders,
)
from flora.core.state import PlantState

__all__ = [
    "APEX", "BUD_DORMANT", "FLOWER", "FLORAL_AXIS", "INTERNODE", "LEAF",
    "STRUCTURAL_TYPES", "EngineConfig", "InflorescenceConfig",
    "MechanicsConfig", "MorphologyConfig", "NodeType", "PhysiologyConfig",
    "Pass", "SimulationContext", "SimulationEngine", "PlantState",
    "build_adjacency", "depth_levels", "sum_by_parent", "topological_orders",
]
