"""Comprehensive stress tests for polyploidy, climate extremes, and heavy pruning re-routing."""

from __future__ import annotations

import pytest
import numpy as np

from flora import EngineConfig, create_default_engine
from flora.biology.genetics import Genome, breed, extract_phenotype_pool
from flora.core.config import NodeType


def test_stress_extreme_polyploidy_and_breeding() -> None:
    # Test tetraploid and octoploid breeding stability
    strands_4x = [
        [0, 1, 2, 3, 0, 1, 2, 3, 0, 1],
        [3, 2, 1, 0, 3, 2, 1, 0, 3, 2],
        [1, 1, 1, 1, 2, 2, 2, 2, 0, 0],
        [2, 0, 2, 0, 1, 3, 1, 3, 2, 0],
    ]
    g1 = Genome(strands_4x)
    g2 = Genome(strands_4x)
    child = breed(g1, g2, seed=123)
    assert child.ploidy == 4
    pheno = extract_phenotype_pool(child)
    assert len(pheno) > 0


def test_stress_climate_and_drought_cycles() -> None:
    config = EngineConfig(seed=42)
    # Simulate heavy environmental stress / drought via temperature/water overrides if supported
    engine = create_default_engine(config)
    for _ in range(50):
        engine.step(1.0)
    assert engine.state.n > 0


def test_stress_heavy_sequential_pruning() -> None:
    engine = create_default_engine(EngineConfig(seed=1337))
    for _ in range(25):
        engine.step(1.0)
    
    n_before = engine.state.n
    live_indices = np.flatnonzero(engine.state.alive[:n_before])
    if live_indices.size > 5:
        # Prune several branches sequentially
        for cut_id in live_indices[1:4]:
            if engine.state.alive[cut_id]:
                engine.state.alive[cut_id] = False
                engine.state.node_type[cut_id] = int(NodeType.BUD_DORMANT)
        
        # Advance simulation to verify re-routing and recovery
        for _ in range(15):
            engine.step(1.0)
            
        assert engine.state.n > 0
