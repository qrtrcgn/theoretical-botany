"""Mid-internode pruning with latent bud bank and wound cost.

cut_at splits a structural segment at a fractional position ``t`` along its
length: the proximal part survives as a shortened stub while the distal part
(and the whole child subtree) dies. The stub pays a wound cost from its vigor
pool, loses its auxin column, and wakes ``latent_buds`` dormant buds at the
cut face. Sap-pressure recovery is implicit: the Da Vinci pipe-model pass
re-derives radii bottom-up on the next step from the new topology, and the
Mitchison auxin pass re-canalizes flow around the wound over following steps.
"""

from __future__ import annotations

import numpy as np

from flora.core.config import BUD_DORMANT, INTERNODE
from flora.core.state import PlantState

_EPS = 1e-9


def _descendants(state: PlantState, node_id: int) -> list[int]:
    parent = state.parent[: state.n]
    desc: list[int] = []
    frontier = [node_id]
    while frontier:
        curr = frontier.pop(0)
        children = np.flatnonzero(parent == curr).tolist()
        for c in children:
            if c not in desc:
                desc.append(c)
                frontier.append(c)
    return desc


def cut_at(
    state: PlantState,
    node_id: int,
    t: float,
    wound_cost: float = 2.0,
    latent_buds: int = 2,
) -> dict:
    """Cut segment ``node_id`` at fraction ``t`` of its length.

    ``t`` near 1 is a tip no-op, ``t`` near 0 removes the whole node.
    Returns ``{"stub_id", "killed_count", "bud_ids", "cut_position"}``.
    """
    n = state.n
    if not 0 <= node_id < n or not state.alive[node_id]:
        raise ValueError(f"invalid or dead node_id: {node_id}")

    desc = _descendants(state, node_id)
    length = float(state.internode_length[node_id])

    if t >= 0.99 or length <= _EPS:
        if length <= _EPS and t < 0.99:
            mask = np.zeros(n, dtype=bool)
            mask[node_id] = True
            mask[np.asarray(desc, dtype=np.int64)] = True
            state.kill(mask)
            state.auxin[node_id] = 0.0
            state.vigor[node_id] = 0.0
            return {
                "stub_id": None,
                "killed_count": len(desc),
                "bud_ids": [],
                "cut_position": None,
            }
        return {
            "stub_id": node_id,
            "killed_count": 0,
            "bud_ids": [],
            "cut_position": None,
        }

    if t <= 0.01:
        mask = np.zeros(n, dtype=bool)
        mask[node_id] = True
        mask[np.asarray(desc, dtype=np.int64)] = True
        state.kill(mask)
        state.auxin[node_id] = 0.0
        state.vigor[node_id] = 0.0
        return {
            "stub_id": None,
            "killed_count": len(desc),
            "bud_ids": [],
            "cut_position": None,
        }

    heading = state.headings()[node_id]
    cut_pos = state.position[node_id] + heading * length * t

    state.internode_length[node_id] = length * t
    state.node_type[node_id] = int(INTERNODE)
    state.auxin[node_id] = 0.0
    state.vigor[node_id] = max(0.0, float(state.vigor[node_id]) - wound_cost)

    if desc:
        mask = np.zeros(state.n, dtype=bool)
        mask[np.asarray(desc, dtype=np.int64)] = True
        state.kill(mask)

    bud_ids: list[int] = []
    if latent_buds > 0:
        new_ids = state.add_nodes(
            parents=np.full(latent_buds, node_id, dtype=np.int64),
            node_types=int(BUD_DORMANT),
            positions=np.broadcast_to(cut_pos, (latent_buds, 3)),
            orientations=np.broadcast_to(
                state.orientation[node_id], (latent_buds, 4)
            ),
            vigor=1.0,
            auxin=0.0,
        )
        bud_ids = [int(i) for i in new_ids]

    return {
        "stub_id": node_id,
        "killed_count": len(desc),
        "bud_ids": bud_ids,
        "cut_position": [float(cut_pos[0]), float(cut_pos[1]), float(cut_pos[2])],
    }
