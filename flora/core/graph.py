"""Sparse graph utilities: adjacency, traversal orders, level grouping.

The plant is a rooted tree stored as an int32 parent-pointer array (root has
parent -1). These helpers derive, in pure NumPy/SciPy:

* CSR adjacency matrix (rows = parent, cols = child),
* topological orders (Kahn's algorithm, vectorized per frontier),
* depth levels for level-synchronous SIMD-friendly sweeps,
* parent-grouped reductions via ``np.bincount``.
"""

from __future__ import annotations

import numpy as np
from scipy.sparse import coo_matrix, csr_matrix


def _validate(parent: np.ndarray, n: int) -> np.ndarray:
    p = np.asarray(parent[:n], dtype=np.int32)
    if p.ndim != 1:
        raise ValueError("parent must be a 1-D array")
    if n > 0:
        if p[0] != -1:
            raise ValueError("node 0 must be the root (parent == -1)")
        if (p[1:] < 0).any():
            raise ValueError("only node 0 may have parent == -1")
        if (p[1:] >= n).any() or (p[1:] == np.arange(1, n)).any():
            raise ValueError("parent indices out of range or self-referential")
    return p


def build_adjacency(parent: np.ndarray, n: int) -> csr_matrix:
    """CSR matrix A with ``A[i, j] = 1`` iff node ``j`` is a child of node ``i``."""
    p = _validate(parent, n)
    rows = p[p >= 0]
    cols = np.flatnonzero(p >= 0).astype(np.int64)
    data = np.ones(cols.size, dtype=np.float64)
    return coo_matrix((data, (rows.astype(np.int64), cols)), shape=(n, n)).tocsr()


def depth_levels(parent: np.ndarray, n: int) -> list[np.ndarray]:
    """Group node indices by graph depth (root = depth 0), ascending."""
    p = _validate(parent, n)
    if n == 0:
        return []
    depth = np.full(n, -1, dtype=np.int32)
    depth[0] = 0
    frontier = np.zeros(1, dtype=np.int64)
    levels: list[np.ndarray] = []
    child_rows = p.astype(np.int64)
    while frontier.size:
        levels.append(frontier.astype(np.int64))
        mask = np.isin(child_rows, frontier)
        frontier = np.flatnonzero(mask)
        depth[frontier] = len(levels)
    if (depth < 0).any():
        raise ValueError("graph is disconnected or cyclic; not a rooted tree")
    return levels


def topological_orders(parent: np.ndarray, n: int) -> tuple[np.ndarray, np.ndarray]:
    """Return ``(forward_order, reverse_order)``; parents strictly precede children."""
    levels = depth_levels(parent, n)
    forward = np.concatenate(levels) if levels else np.zeros(0, dtype=np.int64)
    return forward, forward[::-1].copy()


def sum_by_parent(values: np.ndarray, parent: np.ndarray, n: int) -> np.ndarray:
    """Scatter-add: ``out[p] += values[c]`` for every edge child->parent."""
    p = np.asarray(parent, dtype=np.int64)
    v = np.asarray(values, dtype=np.float64)
    if p.shape != v.shape:
        raise ValueError("values and parent must have identical shape")
    valid = p >= 0
    out = np.zeros(n, dtype=np.float64)
    np.add.at(out, p[valid], v[valid])
    return out
