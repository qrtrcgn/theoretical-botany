"""Vigor partitioning (Borchert & Honda 1984 proportional resource model).

Each cycle the plant distributes a fixed pool ``R`` down the architecture:

1. bottom-up demand accumulation (apices demand by auxin export, buds less),
2. top-down proportional sharing (child share = subtree demand fraction),
3. first-order relaxation of stored vigor toward the target profile.

Level-synchronous ``np.bincount`` reductions only -- no per-node loops.
"""

from __future__ import annotations

import numpy as np

from flora.core.config import APEX, BUD_DORMANT, FLOWER, LEAF
from flora.core.context import SimulationContext

_DEMAND_BUD = 0.25
_DEMAND_STRUCTURAL = 0.10
_DEMAND_ORGAN = 0.05
_EPS = 1e-12


def _demand(state, n: int) -> np.ndarray:
    types_arr = state.node_type[:n]
    demand = np.full(n, _DEMAND_STRUCTURAL, dtype=np.float64)
    demand[types_arr == int(BUD_DORMANT)] = _DEMAND_BUD
    demand[np.isin(types_arr, [int(FLOWER), int(LEAF)])] = _DEMAND_ORGAN
    apex_mask = types_arr == int(APEX)
    demand[apex_mask] = 1.0 + state.auxin[:n][apex_mask]
    return demand


def vigor_allocation_step(ctx: SimulationContext, dt: float = 1.0) -> None:
    """Repartition the resource pool and relax stored vigor toward it."""
    state = ctx.state
    phys = ctx.config.physiology
    n = state.n
    if n == 0:
        return

    parent = state.parent[:n].astype(np.int64)
    levels = state.levels()
    subtree = _demand(state, n)

    for depth in range(len(levels) - 2, -1, -1):
        child_idx = levels[depth + 1]
        merged = np.bincount(parent[child_idx], weights=subtree[child_idx], minlength=n)
        subtree = subtree + merged

    target = np.zeros(n, dtype=np.float64)
    target[0] = phys.vigor_total
    for depth in range(1, len(levels)):
        idx = levels[depth]
        p = parent[idx]
        share = subtree[idx] / np.maximum(subtree[p], _EPS)
        target[idx] = target[p] * share

    relaxation = (target - state.vigor[:n]) / phys.vigor_tau
    maintenance = phys.vigor_maintenance * state.vigor[:n]
    state.vigor[:n] = state.vigor[:n] + dt * (relaxation - maintenance)
    np.clip(state.vigor[:n], 0.0, None, out=state.vigor[:n])
