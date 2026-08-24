"""Inflorescence morphogenesis and Vegetativeness (v) decay (Prusinkiewicz).

Models the floral transition through an architectural parameter v in [0, v_max]:

    L(v) = L_max * (v / v_max)^p

Internodes compress nonlinearly as the apex exhausts its vegetative potential,
generating classical botanical inflorescences:

- RACEME: indeterminate monopodial axis; lateral flowers pedicellate.
- PANICLE: branched raceme with secondary axes carrying reduced v.
- CYME: determinate sympodial program; terminal flower terminates main axis,
  growth resumes from bilateral lateral branches.
- SINGLE: solitary terminal flower.
"""

from __future__ import annotations

import numpy as np

from flora.core.config import (
    APEX,
    FLORAL_AXIS,
    FLOWER,
    InflorescenceConfig,
    MorphologyConfig,
)
from flora.core.context import SimulationContext
from flora.core.spatial import (
    UP_VECTOR,
    quat_from_axis_angle,
    quat_multiply,
    quat_rotate,
    random_unit_axes,
)

_ROT_Y = np.array([0.0, 1.0, 0.0])
_ROT_Z = np.array([0.0, 0.0, 1.0])


def vegetativeness_decay_step(ctx: SimulationContext, dt: float = 1.0) -> None:
    """Age the tree and decay vegetative potential across meristems."""
    state = ctx.state
    infl: InflorescenceConfig = ctx.config.inflorescence
    n = state.n
    if n == 0:
        return

    # Plant-wide aging
    state.age[:n] += dt

    # Active floral axes consume v rapidly
    floral_mask = (state.node_type[:n] == int(FLORAL_AXIS)) & state.alive[:n]
    state.vegetativeness[:n] = np.where(
        floral_mask,
        np.maximum(0.0, state.vegetativeness[:n] - dt * infl.v_decay),
        state.vegetativeness[:n],
    )

    # Vegetative apices age slowly toward competence
    apex_mask = (state.node_type[:n] == int(APEX)) & state.alive[:n]
    state.vegetativeness[:n] = np.where(
        apex_mask,
        np.maximum(0.0, state.vegetativeness[:n] - 0.02 * dt),
        state.vegetativeness[:n],
    )


def floral_transition_step(ctx: SimulationContext, dt: float = 1.0) -> None:
    """Execute topological L-system grammar rules for competent floral axes."""
    del dt
    state = ctx.state
    infl: InflorescenceConfig = ctx.config.inflorescence
    morph: MorphologyConfig = ctx.config.morphology
    n = state.n
    if n == 0:
        return

    consumed: set[int] = ctx.cache.setdefault("floral_consumed", set())

    live = np.flatnonzero(state.alive[:n])
    axes = [
        int(i)
        for i in live
        if state.node_type[i] == int(FLORAL_AXIS) and int(i) not in consumed
    ]
    if not axes:
        return

    p_parents: list[int] = []
    p_types: list[int] = []
    p_pos: list[np.ndarray] = []
    p_orient: list[np.ndarray] = []
    p_len: list[float] = []
    p_veg: list[float] = []
    p_mass: list[float] = []

    for axis in axes:
        v = float(state.vegetativeness[axis])
        base_pos = state.position[axis]
        base_quat = state.orientation[axis]

        # ------------------------------------------------------------- #
        # Rule: Exhausted axis (v <= 0) -> Terminal Flower
        # ------------------------------------------------------------- #
        if v <= 0.0 or infl.inflorescence_type == "single":
            tip_pos = base_pos + quat_rotate(base_quat, UP_VECTOR) * float(state.internode_length[axis])
            p_parents.append(axis)
            p_types.append(int(FLOWER))
            p_pos.append(tip_pos)
            p_orient.append(base_quat)
            p_len.append(0.0)
            p_veg.append(0.0)
            p_mass.append(morph.flower_mass)
            consumed.add(axis)
            continue

        # ------------------------------------------------------------- #
        # Floral internode compression: L(v) = L_max * (v/v_max)^p
        # ------------------------------------------------------------- #
        l_max = morph.internode_length_max * infl.floral_length_frac
        l_floral = float(l_max * (v / infl.v_max) ** infl.compression_p)
        l_floral = max(1e-4, l_floral)

        state.internode_length[axis] = l_floral
        state.structural_mass[axis] = 0.001

        # Axis tip orientation with small random jitter
        jitter_axis = random_unit_axes(1, ctx.rng)[0]
        jitter_angle = float(ctx.rng.uniform(-0.08, 0.08))
        q_jitter = quat_from_axis_angle(jitter_axis, jitter_angle)
        axis_quat = quat_multiply(base_quat, q_jitter)
        tip_pos = base_pos + quat_rotate(axis_quat, UP_VECTOR) * l_floral

        next_v = max(0.0, v - infl.v_decay)

        itype = infl.inflorescence_type

        # ------------------------------------------------------------- #
        # Rule RACEME: A(v) -> I(L) [ + FLOWER ] A(v - delta)
        # ------------------------------------------------------------- #
        if itype == "raceme":
            # Continuing floral apex (main axis)
            p_parents.append(axis)
            p_types.append(int(FLORAL_AXIS))
            p_pos.append(tip_pos)
            p_orient.append(axis_quat)
            p_len.append(0.0)
            p_veg.append(next_v)
            p_mass.append(0.0)

            # --- Stochastic Vigor-Based Bud Abortion ---
            # Instead of a strict deterministic alternating pattern, we model bud
            # formation stochastically. As the apex ages (v drops), its capacity
            # to form stable lateral buds decreases. We introduce a local stress
            # factor (random noise) to simulate frost, wind, or nutrient drop.
            # If the noise exceeds the remaining vitality (v), the bud aborts.
            stress_factor = float(ctx.rng.uniform(0.0, infl.v_max * 0.4))
            
            if v > stress_factor:
                # Lateral pedicellate flower (alternating bilateral angle)
                side_sign = 1.0 if (axis % 2 == 0) else -1.0
                side_az = float(side_sign * np.pi / 2.5)
                
                # Introduce slight organic noise to the orientation
                az_noise = float(ctx.rng.uniform(-0.15, 0.15))
                pitch_noise = float(ctx.rng.uniform(-0.1, 0.1))
                
                q_side_z = quat_from_axis_angle(_ROT_Z, side_az + az_noise)
                q_side_x = quat_from_axis_angle(_ROT_Y, (np.pi / 3.0) + pitch_noise)
                fl_quat = quat_multiply(quat_multiply(axis_quat, q_side_z), q_side_x)

                p_parents.append(axis)
                p_types.append(int(FLOWER))
                p_pos.append(tip_pos)
                p_orient.append(fl_quat)
                p_len.append(0.0)
                p_veg.append(0.0)
                p_mass.append(morph.flower_mass)
            
            consumed.add(axis)

        # ------------------------------------------------------------- #
        # Rule PANICLE: A(v) -> I(L) [ + Branch(v - pen) ] A(v - delta)
        # ------------------------------------------------------------- #
        elif itype == "panicle":
            p_parents.append(axis)
            p_types.append(int(FLORAL_AXIS))
            p_pos.append(tip_pos)
            p_orient.append(axis_quat)
            p_len.append(0.0)
            p_veg.append(next_v)
            p_mass.append(0.0)

            # Lateral floral sub-branch
            branch_az = float(ctx.rng.uniform(-np.pi, np.pi))
            q_bz = quat_from_axis_angle(_ROT_Z, branch_az)
            q_bx = quat_from_axis_angle(_ROT_Y, float(ctx.rng.uniform(0.4, 0.8)))
            b_quat = quat_multiply(quat_multiply(axis_quat, q_bz), q_bx)
            b_veg = max(0.0, v - infl.panicle_branch_v_penalty)

            p_parents.append(axis)
            p_types.append(int(FLORAL_AXIS))
            p_pos.append(tip_pos)
            p_orient.append(b_quat)
            p_len.append(0.0)
            p_veg.append(b_veg)
            p_mass.append(0.0)
            consumed.add(axis)

        # ------------------------------------------------------------- #
        # Rule CYME: A(v) -> I(L) FLOWER [ + A(v-d) ] [ - A(v-d) ]
        # ------------------------------------------------------------- #
        elif itype == "cyme":
            # Terminal flower (determinate)
            p_parents.append(axis)
            p_types.append(int(FLOWER))
            p_pos.append(tip_pos)
            p_orient.append(axis_quat)
            p_len.append(0.0)
            p_veg.append(0.0)
            p_mass.append(morph.flower_mass)

            # Bilateral lateral branches continue the growth
            for sign in (-1.0, 1.0):
                q_az = quat_from_axis_angle(_ROT_Z, sign * float(np.pi / 3.0))
                q_tilt = quat_from_axis_angle(_ROT_Y, float(np.pi / 4.0))
                c_quat = quat_multiply(quat_multiply(axis_quat, q_az), q_tilt)
                p_parents.append(axis)
                p_types.append(int(FLORAL_AXIS))
                p_pos.append(tip_pos)
                p_orient.append(c_quat)
                p_len.append(0.0)
                p_veg.append(next_v)
                p_mass.append(0.0)

            consumed.add(axis)

    if p_parents:
        # Soft node budget safety guard
        total_to_add = len(p_parents)
        if state.n + total_to_add > morph.max_nodes_soft:
            limit = max(0, morph.max_nodes_soft - state.n)
            p_parents = p_parents[:limit]
            p_types = p_types[:limit]
            p_pos = p_pos[:limit]
            p_orient = p_orient[:limit]
            p_len = p_len[:limit]
            p_veg = p_veg[:limit]
            p_mass = p_mass[:limit]

        if p_parents:
            state.add_nodes(
                parents=np.asarray(p_parents, dtype=np.int64),
                node_types=np.asarray(p_types, dtype=np.int8),
                positions=np.asarray(p_pos, dtype=np.float64),
                orientations=np.asarray(p_orient, dtype=np.float64),
                internode_lengths=np.asarray(p_len, dtype=np.float64),
                vegetativeness=np.asarray(p_veg, dtype=np.float64),
                structural_mass=np.asarray(p_mass, dtype=np.float64),
            )
