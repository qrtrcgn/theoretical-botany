"""Snapshot IO: plain-dict / .npz exports decoupling the engine from clients.

Every array is a COPY of the live slice, so callers may hold snapshots across
simulation steps without aliasing surprises.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np

from flora.core.state import PlantState

FIELD_ORDER = (
    "parent",
    "position",
    "orientation",
    "radius",
    "auxin",
    "pin",
    "vigor",
    "vegetativeness",
    "structural_mass",
    "internode_length",
    "age",
    "woodiness",
    "moment",
    "deflection",
    "depth",
    "node_type",
    "alive",
)


def snapshot(state: PlantState) -> dict[str, Any]:
    """Return ``{'n': int}`` plus independent copies of all live-slice fields."""
    n = state.n
    out: dict[str, Any] = {"n": n}
    for name in FIELD_ORDER:
        out[name] = np.array(getattr(state, name)[:n], copy=True)
    return out


def save_npz(state: PlantState, path: str | Path) -> None:
    """Persist a snapshot to compressed ``.npz`` (portable to any client)."""
    snap = snapshot(state)
    np.savez_compressed(path, **snap)


def load_npz(path: str | Path) -> dict[str, Any]:
    """Load a snapshot written by :func:`save_npz` back into a plain dict."""
    with np.load(path) as archive:
        expected = set(FIELD_ORDER) | {"n"}
        missing = expected - set(archive.files)
        if missing:
            raise ValueError(f"snapshot file missing fields: {sorted(missing)}")
        out: dict[str, Any] = {"n": int(archive["n"])}
        for name in FIELD_ORDER:
            out[name] = np.array(archive[name], copy=True)
    return out
