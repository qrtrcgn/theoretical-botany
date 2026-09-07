"""cut_at: mid-internode pruning with stub, latent buds and wound cost."""

from __future__ import annotations

import numpy as np
import pytest

from flora import EngineConfig, create_default_engine
from flora.biology.pruning import cut_at
from flora.core.config import NodeType


def _grown_engine(seed: int = 7, steps: int = 15):
    engine = create_default_engine(EngineConfig(seed=seed))
    for _ in range(steps):
        engine.step(1.0)
    return engine


def _internode_with_descendants(engine, min_desc: int = 2):
    state = engine.state
    parent = state.parent[: state.n]
    for candidate in range(1, state.n):
        if not state.alive[candidate]:
            continue
        if int(state.node_type[candidate]) != int(NodeType.INTERNODE):
            continue
        if float(state.internode_length[candidate]) <= 1e-6:
            continue
        frontier = [candidate]
        desc = []
        while frontier:
            curr = frontier.pop(0)
            children = np.flatnonzero(parent == curr).tolist()
            for c in children:
                if c not in desc:
                    desc.append(c)
                    frontier.append(c)
        if len(desc) >= min_desc:
            return candidate, desc
    raise AssertionError("no prunable internode found")


def test_cut_at_mid_creates_stub_buds_and_wound() -> None:
    engine = _grown_engine()
    state = engine.state
    node, desc = _internode_with_descendants(engine)
    orig_len = float(state.internode_length[node])
    orig_vigor = float(state.vigor[node])
    n_before = state.n

    res = cut_at(state, node, 0.5)

    assert res["stub_id"] == node
    assert state.alive[node]
    assert int(state.node_type[node]) == int(NodeType.INTERNODE)
    assert float(state.internode_length[node]) == pytest.approx(orig_len * 0.5)
    assert res["killed_count"] == len(desc)
    assert not np.any(state.alive[np.asarray(desc, dtype=np.int64)])
    assert len(res["bud_ids"]) >= 1
    for b in res["bud_ids"]:
        assert int(state.node_type[int(b)]) == int(NodeType.BUD_DORMANT)
        assert state.alive[int(b)]
    assert float(state.vigor[node]) < orig_vigor
    assert state.n > n_before


def test_cut_at_tip_is_noop() -> None:
    engine = _grown_engine()
    state = engine.state
    node, _ = _internode_with_descendants(engine)
    n_before = state.n
    res = cut_at(state, node, 1.0)
    assert res["killed_count"] == 0
    assert state.n == n_before


def test_cut_at_base_removes_node() -> None:
    engine = _grown_engine()
    state = engine.state
    node, desc = _internode_with_descendants(engine)
    res = cut_at(state, node, 0.0)
    assert not state.alive[node]
    assert res["killed_count"] == len(desc)


def test_cut_at_invalid_node_raises() -> None:
    engine = _grown_engine()
    with pytest.raises(ValueError):
        cut_at(engine.state, 999999, 0.5)
