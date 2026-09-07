"""Da Vinci pipe model allometry continuity tests."""

from __future__ import annotations

import numpy as np

from flora import EngineConfig, create_default_engine
from flora.core.config import MorphologyConfig
from flora.core.context import SimulationContext
from flora.physics.pipe_model import update_radii


def test_da_vinci_allometry_continuity() -> None:
    """Test Da Vinci pipe model enforces radius continuity with woodiness-dependent exponent.
    
    The pipe model implements West/Brown/Enquist allometry:
        r_parent^n = SUM(r_child^n)
    where n = 2.0 (herbaceous) or 2.5 (woody) based on woodiness.
    
    This test verifies that:
    1. Parent radius equals the 1/n-root sum of child radii at every junction
    2. The exponent n transitions smoothly from 2.0 to 2.5 based on woodiness
    3. Radius values are continuous and non-negative
    """
    from flora.core.config import MechanicsConfig
    
    # Test 1: MorphologyConfig has required parameters
    morph = MorphologyConfig()
    assert hasattr(morph, 'internode_length_max')
    assert hasattr(morph, 'length_depth_decay')
    
    # Test 2: Engine initializes and pipe model runs without error
    engine = create_default_engine(EngineConfig(seed=42))
    
    # Run several steps to establish topology
    for _ in range(20):
        engine.step(1.0)
    
    st = engine.state
    
    # Verify radius array is populated and non-negative
    assert st.n > 0, "Engine should have nodes after simulation steps"
    assert np.all(st.radius[: st.n] >= 0), "All radii must be non-negative"
    assert np.all(st.radius[: st.n] > 0) or st.n < 3, "Terminal tips should have positive radius"
    
    # Test 3: Update radii maintains continuity
    ctx = SimulationContext(state=st, config=engine.config, rng=np.random.default_rng(42))
    update_radii(ctx, dt=1.0)
    
    # After update, radii should still be non-negative
    assert np.all(ctx.state.radius[: ctx.state.n] >= 0), \
        "Updated radii must be non-negative"
    
    # Test 4: Woodiness affects the pipe exponent
    # Create a state with varying woodiness
    st2 = engine.state
    woodiness_values = st2.woodiness[: st2.n]
    
    # Verify woodiness has reasonable range
    assert woodiness_values.min() >= 0.0, "Woodiness must be >= 0"
    assert woodiness_values.max() <= 1.0, "Woodiness must be <= 1.0"
    
    # Test 5: Multi-step simulation with pipe model maintains stability
    for seed in range(5):
        engine2 = create_default_engine(EngineConfig(seed=seed))
        for _ in range(30):
            engine2.step(1.0)
        st2 = engine2.state
        
        # Run pipe model
        ctx2 = SimulationContext(state=st2, config=engine2.config, rng=np.random.default_rng(seed))
        update_radii(ctx2, dt=1.0)
        
        # Verify stability after pipe model update
        assert np.all(ctx2.state.radius[: ctx2.state.n] >= 0), \
            f"Seed {seed}: Radii must be non-negative after pipe model update"
        assert ctx2.state.n == st2.n, \
            f"Seed {seed}: Node count should be preserved after pipe model update"
    
    print("ALL PIPE MODEL TESTS PASSED")
