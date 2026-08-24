"""Pipe Model pass: Da Vinci thickness rule as a level-synchronous reduction.

Implements the generalized allometric law (West/Brown/Enquist pipe analogy;
Leonardo's observation of constant total cross-section across branching):

    r_parent^n = SUM(r_child^n)

with a tunable exponent ``n`` selected per node from its woodiness:
2.5 (mechanical taper, woody) or 2.0 (area-preserving, herbaceous).
The bottom-up accumulation runs one vectorized ``np.bincount`` per depth
level -- no per-node Python loops anywhere.
"""

from __future__ import annotations

import numpy as np

from flora.core.config import STRUCTURAL_TYPES, MechanicsConfig, NodeType
from flora.core.context import SimulationContext
from flora.physics.materials import mature_woodiness


def _structural_has_children(state) -> np.ndarray:
    """Boolean mask: node has at least one child in the live slice."""
    n = state.n
    if n <= 1:
        return np.zeros(n, dtype=bool)
    counts = np.bincount(state.parent[1:n].astype(np.int64), minlength=n)
    return counts > 0


def update_radii(ctx: SimulationContext, dt: float = 1.0) -> None:
    """Recompute all radii from the current topology via the Pipe Model."""
    state = ctx.state
    mech: MechanicsConfig = ctx.config.mechanics
    tip_min = ctx.config.morphology.tip_radius_min
    n = state.n
    if n == 0:
        return

    parent = state.parent[:n].astype(np.int64)
    node_types = state.node_type[:n]

    # --- secondary growth (wood maturation) --------------------------- #
    has_children = _structural_has_children(state)
    state.woodiness[:n] = mature_woodiness(
        state.woodiness[:n], has_children, node_types, dt, mech
    )

    # --- per-node pipe exponent --------------------------------------- #
    woody = state.woodiness[:n] >= 0.5
    n_exp = np.where(woody, mech.pipe_exponent_wood, mech.pipe_exponent_herb)

    # --- bottom-up accumulation, deepest level first ------------------- #
    levels = state.levels()
    radius = np.full(n, tip_min, dtype=np.float64)
    structural = np.isin(node_types, [int(t) for t in STRUCTURAL_TYPES])

    for depth in range(len(levels) - 1, -1, -1):
        level_idx = levels[depth]
        internal = level_idx[
            np.flatnonzero(structural[level_idx] & has_children[level_idx])
        ]
        if internal.size == 0:
            continue
        child_level = levels[depth + 1] if depth + 1 < len(levels) else np.empty(0, dtype=np.int64)
        child_of_internal = child_level[np.isin(parent[child_level], internal)]
        if child_of_internal.size == 0:
            continue
        p = parent[child_of_internal]
        contrib = radius[child_of_internal] ** n_exp[child_of_internal]
        sums = np.bincount(p, weights=contrib, minlength=n)
        r_parent = sums[internal] ** (1.0 / n_exp[internal])
        radius[internal] = np.maximum(r_parent, tip_min)

    state.radius[:n] = radius
