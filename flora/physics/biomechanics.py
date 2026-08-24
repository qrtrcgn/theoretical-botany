"""Euler-Bernoulli biomechanics pass: gravity bending as cantilever beams.

Each internode is a cantilever element with flexural rigidity ``E*I`` where
``I = pi r^4 / 4`` (strict quartic radius scaling). Two level-synchronous
sweeps per invocation:

1. Bottom-up accumulation of subtree weight, center of mass and the
   gravitational bending moment about every node base.
2. Top-down application of incremental elastic rotations:
   ``kappa = M / (E*I)``, ``dtheta = kappa * L`` (midpoint-integrated,
   clamped for stability), composed as world-frame quaternion deltas so the
   whole subtree rotates rigidly; positions are then re-derived forward.

The rigid-link incremental integration converges to the analytic cantilever
solutions (``delta = W L^3 / 3EI`` tip load, ``w L^4 / 8EI`` distributed load)
as segmentation refines -- asserted by the test suite at >=50 segments.
"""

from __future__ import annotations

import numpy as np

from flora.core.config import MechanicsConfig
from flora.core.context import SimulationContext
from flora.core.spatial import (
    UP_VECTOR,
    quat_from_axis_angle,
    quat_multiply,
    quat_normalize,
    quat_rotate,
)
from flora.physics.materials import second_moment_area, young_modulus

_GRAVITY_DIR = np.array([0.0, 0.0, -1.0])
_EPS = 1e-12


def _horizontal_distance(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Euclidean distance projected onto the xy-plane (perpendicular to g)."""
    diff = a - b
    return np.linalg.norm(diff[..., :2], axis=-1)


def _accumulate_moments(state, cfg: MechanicsConfig):
    """Bottom-up subtree weight and |moment| about each node's base.

    Parallel-axis transfer between levels shifts by BASE-to-BASE distance:
    ``M_p += M_c + W_c * g * horiz(base_c - base_p)``, since M_c already
    references every load inside subtree(c) against base_c.
    """
    n = state.n
    levels = state.levels()
    parent = state.parent[:n].astype(np.int64)

    heading = state.headings()
    pos = state.position[:n]
    length = state.internode_length[:n]
    mass = state.structural_mass[:n]
    g = cfg.gravity

    midpoint = pos + heading * (length[:, None] * 0.5)
    own_com = np.where(length[:, None] > _EPS, midpoint, pos)

    weight = mass.copy()                     # kg; forces applied via g
    moment = mass * g * _horizontal_distance(own_com, pos)   # N*m about own base

    for depth in range(len(levels) - 1, 0, -1):
        child_idx = levels[depth]
        p_idx = parent[child_idx]
        add_m = moment[child_idx] + (weight[child_idx] * g) * _horizontal_distance(
            pos[child_idx], pos[p_idx]
        )
        add_w = weight[child_idx]

        moment = moment + np.bincount(p_idx, weights=add_m, minlength=n)
        weight = weight + np.bincount(p_idx, weights=add_w, minlength=n)

    return moment, heading


def bending_pass(ctx: SimulationContext, dt: float = 1.0) -> None:
    """Apply one incremental Euler-Bernoulli gravity response to the tree."""
    del dt  # increment magnitude governed by mechanics config clamps
    state = ctx.state
    cfg: MechanicsConfig = ctx.config.mechanics
    n = state.n
    if n == 0:
        return

    moment, heading = _accumulate_moments(state, cfg)
    length = state.internode_length[:n]

    e_mod = young_modulus(state.woodiness[:n], cfg)
    tip_min = ctx.config.morphology.tip_radius_min
    inertia = second_moment_area(np.maximum(state.radius[:n], tip_min))

    curvature = moment / (e_mod * inertia)
    dtheta = np.clip(curvature * length, 0.0, cfg.max_bend_per_step) * cfg.bending_damping
    dtheta[length <= _EPS] = 0.0

    # bend axis perpendicular to both segment and gravity; rotating positively
    # about unit(heading x g_down) carries the tip toward the gravity side
    bend_axis = np.cross(heading, _GRAVITY_DIR)
    axis_norm = np.linalg.norm(bend_axis, axis=-1)
    unit_axis = np.where(axis_norm[:, None] > _EPS, bend_axis / np.maximum(axis_norm, _EPS)[:, None], UP_VECTOR)

    dq_local = quat_from_axis_angle(unit_axis, dtheta)
    # co-rotational element: draw each segment along the MIDPOINT rotation
    # (half local angle) -> second-order accurate in segment count
    qh_local = quat_from_axis_angle(unit_axis, 0.5 * dtheta)

    # cumulative world-frame delta per node, level-synchronous top-down
    levels = state.levels()
    parent = state.parent[:n].astype(np.int64)
    q_delta = np.zeros((n, 4), dtype=np.float64)
    q_delta[:, 0] = 1.0
    draw_rot = np.zeros((n, 4), dtype=np.float64)
    draw_rot[:, 0] = 1.0
    for level in levels:
        non_root_mask = parent[level] >= 0
        rooted = level[~non_root_mask]
        q_delta[rooted] = dq_local[rooted]
        draw_rot[rooted] = qh_local[rooted]
        branched = level[non_root_mask]
        if branched.size:
            p_branched = parent[branched]
            q_delta[branched] = quat_multiply(q_delta[p_branched], dq_local[branched])
            draw_rot[branched] = quat_multiply(q_delta[p_branched], qh_local[branched])

    old_orientation = state.orientation[:n]
    new_orientation = quat_normalize(quat_multiply(q_delta, old_orientation))
    state.orientation[:n] = new_orientation

    # segments drawn along midpoint frames applied to their ORIGINAL headings
    pos_new = state.position[:n].copy()
    for level in levels:
        moved = level[parent[level] >= 0]
        if moved.size == 0:
            continue
        p = parent[moved]
        step = quat_rotate(draw_rot[p], heading[p])
        pos_new[moved] = pos_new[p] + step * length[p][:, None]

    state.position[:n] = pos_new
    state.moment[:n] = np.abs(moment)
    state.deflection[:n] = dtheta
