"""PlantState: the Struct-of-Arrays heart of the engine.

One preallocated NumPy array per state variable (SoA, contract §3); live nodes
occupy ``[0, n)``. Topology mutations are batch-append-only (births) plus
liveness masks (pruning), with optional compaction. Derived graph structures
(adjacency, traversal orders, levels) are cached and invalidated by a
monotonic ``topology_version`` counter -- vectorized passes read them freely
without triggering recomputation.
"""

from __future__ import annotations

import numpy as np
from scipy.sparse import csr_matrix

from flora.core.config import APEX, NodeType
from flora.core.graph import build_adjacency, depth_levels, topological_orders
from flora.core.spatial import UP_VECTOR, quat_normalize, quat_rotate

#: Initial PIN conductance assigned to newly born edges. Matches the
#: ``PhysiologyConfig.pin_baseline`` default; documented coupling (CONTRACT §7.1
#: requires nonzero edge conductance for any flux to exist at all).
DEFAULT_PIN_BASELINE = 0.05


class PlantState:
    """Capacity-managed SoA container for the whole plant organism."""

    def __init__(self, capacity: int) -> None:
        if capacity < 1:
            raise ValueError("capacity must be >= 1")
        self.capacity = int(capacity)
        self.n = 0
        self.topology_version = 0
        cap = self.capacity

        self.parent = np.full(cap, -1, dtype=np.int32)
        self.position = np.zeros((cap, 3), dtype=np.float64)
        self.orientation = np.tile(np.array([1.0, 0.0, 0.0, 0.0]), (cap, 1)).copy()
        self.radius = np.zeros(cap, dtype=np.float64)
        self.auxin = np.zeros(cap, dtype=np.float64)
        self.pin = np.full(cap, DEFAULT_PIN_BASELINE, dtype=np.float64)
        self.vigor = np.zeros(cap, dtype=np.float64)
        self.vegetativeness = np.zeros(cap, dtype=np.float64)
        self.structural_mass = np.zeros(cap, dtype=np.float64)
        self.internode_length = np.zeros(cap, dtype=np.float64)
        self.age = np.zeros(cap, dtype=np.float64)
        self.woodiness = np.zeros(cap, dtype=np.float64)
        self.moment = np.zeros(cap, dtype=np.float64)
        self.deflection = np.zeros(cap, dtype=np.float64)
        self.depth = np.zeros(cap, dtype=np.int32)
        self.node_type = np.full(cap, NodeType.INTERNODE, dtype=np.int8)
        self.alive = np.zeros(cap, dtype=bool)

        self._cache: dict[str, tuple] = {}

    # ------------------------------------------------------------------ #
    # capacity / mutation
    # ------------------------------------------------------------------ #
    _FLAT_FIELDS = (
        "parent", "radius", "auxin", "pin", "vigor", "vegetativeness",
        "structural_mass", "internode_length", "age", "woodiness",
        "moment", "deflection", "depth", "node_type", "alive",
    )

    def _ensure_capacity(self, required: int) -> None:
        if required <= self.capacity:
            return
        new_cap = self.capacity
        while new_cap < required:
            new_cap *= 2
        for name in self._FLAT_FIELDS:
            arr = getattr(self, name)
            grown = np.zeros((new_cap,) + arr.shape[1:], dtype=arr.dtype)
            grown[: self.n] = arr[: self.n]
            if name == "parent":
                grown[self.n:] = -1
            elif name == "node_type":
                grown[self.n:] = NodeType.INTERNODE
            elif name == "pin":
                grown[self.n:] = DEFAULT_PIN_BASELINE
            setattr(self, name, grown)
        for name in ("position", "orientation"):
            arr = getattr(self, name)
            grown = np.zeros((new_cap,) + arr.shape[1:], dtype=arr.dtype)
            if name == "orientation":
                grown[:, 0] = 1.0
            grown[: self.n] = arr[: self.n]
            setattr(self, name, grown)
        self.capacity = new_cap

    def add_nodes(
        self,
        parents: np.ndarray,
        node_types: np.ndarray,
        positions: np.ndarray | None = None,
        orientations: np.ndarray | None = None,
        internode_lengths: np.ndarray | float | None = None,
        radii: np.ndarray | float | None = None,
        vegetativeness: np.ndarray | float | None = None,
        vigor: np.ndarray | float | None = None,
        auxin: np.ndarray | float | None = None,
        woodiness: np.ndarray | float | None = None,
        structural_mass: np.ndarray | float | None = None,
    ) -> np.ndarray:
        """Vectorized batch append; returns the newly created node indices."""
        parents = np.asarray(parents, dtype=np.int64).ravel()
        types_arr = np.asarray(node_types).ravel()
        k = parents.size
        if types_arr.size == 1 and k > 1:
            types_arr = np.full(k, types_arr[0])
        if types_arr.size != k:
            raise ValueError("node_types must broadcast to len(parents)")

        start, end = self.n, self.n + k
        self._ensure_capacity(end)
        idx = slice(start, end)

        has_parent = parents >= 0
        p_safe = np.where(has_parent, parents, 0)

        self.parent[idx] = parents.astype(np.int32)
        self.depth[idx] = np.where(has_parent, self.depth[p_safe] + 1, 0).astype(np.int32)
        self.node_type[idx] = types_arr.astype(np.int8)

        if positions is None:
            self.position[idx] = self.position[p_safe]
        else:
            self.position[idx] = np.broadcast_to(
                np.asarray(positions, dtype=np.float64), (k, 3)
            )
        if orientations is None:
            self.orientation[idx] = self.orientation[p_safe]
        else:
            self.orientation[idx] = quat_normalize(
                np.broadcast_to(np.asarray(orientations, dtype=np.float64), (k, 4))
            )

        scalars = (
            ("internode_length", internode_lengths),
            ("radius", radii),
            ("vigor", vigor),
            ("auxin", auxin),
            ("woodiness", woodiness),
            ("structural_mass", structural_mass),
        )
        for attr, value in scalars:
            target = getattr(self, attr)[idx]
            target[:] = (
                0.0
                if value is None
                else np.broadcast_to(np.asarray(value, dtype=np.float64).ravel(), (k,))
            )

        if vegetativeness is None:
            inherited = self.vegetativeness[p_safe]
            self.vegetativeness[idx] = np.where(has_parent, inherited, 0.0)
        else:
            self.vegetativeness[idx] = np.broadcast_to(
                np.asarray(vegetativeness, dtype=np.float64).ravel(), (k,)
            )

        self.age[idx] = 0.0
        self.moment[idx] = 0.0
        self.deflection[idx] = 0.0
        self.alive[idx] = True

        self.n = end
        self.topology_version += 1
        self._cache.clear()
        return np.arange(start, end, dtype=np.int64)

    def kill(self, mask: np.ndarray) -> None:
        """Mark masked live nodes dead (no compaction; pruning support)."""
        mask = np.asarray(mask, dtype=bool)[: self.n]
        if mask.any():
            self.alive[: self.n][mask] = False
            self.topology_version += 1
            self._cache.clear()

    def compact(self) -> None:
        """Drop dead nodes, remap parent pointers, shrink logical length."""
        n = self.n
        keep = self.alive[:n].copy()
        new_n = int(keep.sum())
        remap = (np.cumsum(keep, dtype=np.int64) - 1).astype(np.int64)
        old_parent = self.parent[:n].astype(np.int64)
        for name in (
            "parent", "position", "orientation", "radius", "auxin", "pin",
            "vigor", "vegetativeness", "structural_mass", "internode_length",
            "age", "woodiness", "moment", "deflection", "depth", "node_type",
        ):
            arr = getattr(self, name)
            arr[:new_n] = arr[:n][keep]
        mapped = np.where(old_parent >= 0, remap[np.clip(old_parent, 0, None)], -1)
        self.parent[:new_n] = mapped[keep].astype(np.int32)
        self.alive[:new_n] = True
        self.alive[new_n:] = False
        self.n = new_n
        self.topology_version += 1
        self._cache.clear()

    # ------------------------------------------------------------------ #
    # derived topology (cached per topology_version)
    # ------------------------------------------------------------------ #
    def _topo(self) -> tuple:
        cached = self._cache.get("t")
        if cached is not None and self._cache.get("v") == self.topology_version:
            return cached
        n = self.n
        entry = (
            build_adjacency(self.parent, n),
            *topological_orders(self.parent, n),
            depth_levels(self.parent, n),
        )
        self._cache = {"v": self.topology_version, "t": entry}
        return entry

    def adjacency(self) -> csr_matrix:
        """CSR matrix A with A[i, j] == 1 iff j is a child of i."""
        return self._topo()[0]

    def forward_order(self) -> np.ndarray:
        """Indices sorted so every parent precedes its children."""
        return self._topo()[1]

    def reverse_order(self) -> np.ndarray:
        """Indices sorted so every child precedes its parent."""
        return self._topo()[2]

    def levels(self) -> list[np.ndarray]:
        """Node indices grouped by graph depth, ascending."""
        return self._topo()[3]

    def headings(self) -> np.ndarray:
        """World heading vectors (+Z rotated by orientation), shape (n, 3)."""
        return quat_rotate(self.orientation[: self.n], UP_VECTOR)

    def live_mask(self) -> np.ndarray:
        """Liveness over the live slice."""
        return self.alive[: self.n]


def seed_root(config) -> PlantState:
    """Create a state containing only the seedling apex (contract §3)."""
    state = PlantState(config.capacity)
    state.add_nodes([-1], [APEX])
    state.vegetativeness[0] = config.inflorescence.v_max
    state.internode_length[0] = config.morphology.internode_length_max
    state.auxin[0] = config.physiology.auxin_production
    return state
