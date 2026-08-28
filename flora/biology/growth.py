"""Growth passes: apex extension (elongation) and lateral bud management.

Elongation converts an active apex into an internode segment and appends a new
apex at its tip (Prusinkiewicz & Lindenmayer 1990 turtle-graphics semantics in
quaternion form). Budding spawns lateral buds at phyllotactic azimuths around
fresh internodes, activates them under Borchert-Honda vigor with Mitchison
apical-dominance suppression, and runs the sympodial/monopodial floral
conversion lottery.

All randomness flows through ``ctx.rng``; all node loops are level/batch loops.
"""

from __future__ import annotations

import numpy as np

from flora.core.config import (
    APEX,
    BUD_DORMANT,
    FLORAL_AXIS,
    INTERNODE,
    InflorescenceConfig,
)
from flora.core.context import SimulationContext
from flora.core.spatial import (
    UP_VECTOR,
    quat_from_axis_angle,
    quat_multiply,
    quat_rotate,
    random_unit_axes,
)

_BUD_ACTIVATION_PROB = 0.6
_FLORAL_CONVERSION_MIN_DEPTH = 3


def elongation_step(ctx: SimulationContext, dt: float = 1.0) -> None:
    """Extend eligible apices: old apex -> INTERNODE segment, new APEX tip."""
    del dt
    state = ctx.state
    morph = ctx.config.morphology
    phys = ctx.config.physiology
    n = state.n

    live = np.flatnonzero(state.alive[:n])
    # Active apices extend if they have sufficient vigor.
    # Root apex (depth 0) and main lineage extend; lateral suppression applies when auxin is high.
    eligible = live[
        (state.node_type[live] == int(APEX))
        & (state.vigor[live] > phys.apex_vigor_threshold)
    ]
    if eligible.size == 0:
        ctx.cache["new_internodes"] = []
        return
    if n + eligible.size > morph.max_nodes_soft:
        budget = max(0, morph.max_nodes_soft - n)
        if budget == 0:
            ctx.cache["new_internodes"] = []
            return
        eligible = eligible[:budget]
        if eligible.size == 0:
            ctx.cache["new_internodes"] = []
            return

    k = eligible.size
    jitter = ctx.rng.normal(0, morph.radial_jitter * 0.5, size=k)
    axes = random_unit_axes(k, ctx.rng)
    dq = quat_from_axis_angle(axes, jitter)

    old_quat = state.orientation[eligible]
    seg_quat = quat_multiply(old_quat, dq)

    depths = state.depth[eligible].astype(np.float64)
    lengths = (
        morph.internode_length_max
        * morph.length_depth_decay**depths
        * ctx.rng.normal(1.0, 0.1, size=k)
    )

    new_pos = state.position[eligible] + quat_rotate(seg_quat, UP_VECTOR) * lengths[:, None]

    radius = np.maximum(state.radius[eligible], morph.tip_radius_min)
    woodiness = state.woodiness[eligible]
    rho = ctx.config.mechanics.density_herbaceous + (
        ctx.config.mechanics.density_wood - ctx.config.mechanics.density_herbaceous
    ) * woodiness
    mass = rho * np.pi * radius**2 * lengths

    state.node_type[eligible] = int(INTERNODE)
    state.orientation[eligible] = seg_quat
    state.internode_length[eligible] = lengths
    state.structural_mass[eligible] = mass

    new_ids = state.add_nodes(
        parents=eligible,
        node_types=int(APEX),
        positions=new_pos,
        orientations=seg_quat,
    )
    ctx.cache["new_internodes"] = eligible.tolist()


def budding_step(ctx: SimulationContext, dt: float = 1.0) -> None:
    """Spawn lateral buds on fresh internodes; run activation + floral lottery."""
    del dt
    state = ctx.state
    morph = ctx.config.morphology
    infl = ctx.config.inflorescence
    phys = ctx.config.physiology
    n = state.n

    new_internodes: list[int] = list(ctx.cache.get("new_internodes", []))
    counters: dict[int, int] = ctx.cache.setdefault("bud_counter", {})

    spawn_parents: list[int] = []
    spawn_azimuths: list[float] = []
    for p in new_internodes:
        k = counters.get(p, 0)
        mode = morph.phyllotaxis_mode
        div = morph.phyllotaxis_divergence
        if mode == "alternate":
            azimuths = [div * k]
        elif mode == "opposite":
            base = div * k
            azimuths = [base, base + np.pi]
        else:  # whorled
            base = div * k
            azimuths = [base, base + 2.0 * np.pi / 3.0, base + 4.0 * np.pi / 3.0]
        for az in azimuths:
            spawn_parents.append(p)
            # Add some natural jitter so it doesn't look like a perfect mathematical fibonacci spiral
            jitter = float(ctx.rng.normal(0, 0.2))
            spawn_azimuths.append(float((az + jitter) % (2.0 * np.pi)))
        counters[p] = k + 1

    projected = n + len(spawn_parents)
    if projected > morph.max_nodes_soft:
        keep = max(0, morph.max_nodes_soft - n)
        spawn_parents = spawn_parents[:keep]
        spawn_azimuths = spawn_azimuths[:keep]

    if spawn_parents:
        parents_arr = np.asarray(spawn_parents, dtype=np.int64)
        azimuths_arr = np.asarray(spawn_azimuths)
        q_parent = state.orientation[parents_arr]
        qz = quat_from_axis_angle(
            np.broadcast_to(np.array([0.0, 0.0, 1.0]), (azimuths_arr.size, 3)), azimuths_arr
        )
        # Add natural stochastic variance to the branch angle
        angle_variance = ctx.rng.normal(0, 0.1, size=azimuths_arr.size)
        q_branch = quat_from_axis_angle(
            np.broadcast_to(np.array([1.0, 0.0, 0.0]), (azimuths_arr.size, 3)),
            np.clip(morph.branch_angle + angle_variance, 0.1, 1.5),
        )
        q_bud = quat_multiply(quat_multiply(q_parent, qz), q_branch)
        state.add_nodes(
            parents=parents_arr,
            node_types=int(BUD_DORMANT),
            positions=state.position[parents_arr],
            orientations=q_bud,
        )

    # --- apical dominance: activate vigorous buds under weak canals ---- #
    live = np.flatnonzero(state.alive[:n])
    dormant = live[state.node_type[live] == int(BUD_DORMANT)]
    if dormant.size:
        parents_of_dormant = state.parent[dormant]
        can_activate = (
            (state.vigor[dormant] >= phys.bud_activation_vigor)
            & (state.auxin[parents_of_dormant] < phys.auxin_suppression)
            & (ctx.rng.random(dormant.size) < _BUD_ACTIVATION_PROB)
        )
        state.node_type[dormant[can_activate]] = int(APEX)

    # --- sympodial / monopodial floral conversion lottery --------------- #
    term_prob = (
        infl.sympodial_term_prob
        if infl.growth_habit == "sympodial"
        else infl.monopodial_term_prob
    )
    refreshed = np.flatnonzero(state.alive[: state.n])
    apexes = refreshed[
        (state.node_type[refreshed] == int(APEX))
        & (state.depth[refreshed] >= _FLORAL_CONVERSION_MIN_DEPTH)
    ]
    if apexes.size:
        converting = ctx.rng.random(apexes.size) < term_prob
        chosen = apexes[converting]
        state.node_type[chosen] = int(FLORAL_AXIS)
        state.vegetativeness[chosen] = infl.v_max
