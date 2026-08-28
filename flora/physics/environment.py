"""Environmental simulation passes: Weather and Seasonal Responses."""
import numpy as np
from flora.core.context import SimulationContext
from flora.core.config import APEX, BUD_DORMANT, FLOWER, FLORAL_AXIS

def weather_step(ctx: SimulationContext, dt: float = 1.0) -> None:
    """Simulate daily weather progression via sine waves and stochastic noise."""
    days = ctx.time * ctx.config.environment.days_per_cycle + 90.0
    env_cfg = ctx.config.environment
    
    # 365 day cycle, peaking in summer (day 180)
    year_phase = (days % 365) / 365.0
    season_sin = np.sin(year_phase * 2 * np.pi - np.pi/2) # -1 in winter, 1 in summer
    
    # Temperature = Base + Amplitude * Season + Daily Noise
    noise = float(ctx.rng.uniform(-3.0, 3.0))
    ctx.env.temperature = env_cfg.base_temp + env_cfg.temp_amplitude * season_sin + noise
    
    # Light peaks in summer, drops in winter
    ctx.env.light = np.clip(0.4 + 0.6 * season_sin, 0.1, 1.0)
    
    # Water/Nutrients fluctuate randomly for now
    ctx.env.water = np.clip(ctx.env.water + float(ctx.rng.uniform(-0.1, 0.1)), 0.2, 1.0)
    
def seasonal_dieback_step(ctx: SimulationContext, dt: float = 1.0) -> None:
    """Frost triggers dieback of non-woody parts and flowers."""
    env = ctx.env
    cfg = ctx.config.environment
    state = ctx.state
    n = state.n
    if n == 0:
        return
        
    if env.temperature < cfg.frost_threshold:
        # Frost damage! Kill all flowers and completely herbaceous tips
        live = np.flatnonzero(state.alive[:n])
        if live.size == 0:
            return
            
        types = state.node_type[live]
        woodiness = state.woodiness[live]
        
        # Kill flowers instantly
        kill_mask_flowers = (types == int(FLOWER))
        # Kill tips (APEX, FLORAL_AXIS) that haven't lignified yet (w < 0.2)
        kill_mask_herb = ((types == int(APEX)) | (types == int(FLORAL_AXIS))) & (woodiness < 0.2) & (state.depth[live] > 0)
        
        total_kill = np.zeros(n, dtype=bool)
        total_kill[live[kill_mask_flowers | kill_mask_herb]] = True
        
        state.kill(total_kill)
        # Note: We do NOT call state.compact() automatically to avoid thrashing.
        # The engine will just skip dead nodes in future passes.

def spring_awakening_step(ctx: SimulationContext, dt: float = 1.0) -> None:
    """Warmth triggers dormant buds to activate for a new multi-year flush."""
    env = ctx.env
    cfg = ctx.config.environment
    state = ctx.state
    n = state.n
    if n == 0:
        return
        
    if env.temperature > cfg.bud_break_threshold and env.growth_factor > 0.5:
        # Spring is here! Awaken a fraction of dormant buds on woody branches.
        live = np.flatnonzero(state.alive[:n])
        dormant = live[state.node_type[live] == int(BUD_DORMANT)]
        
        if dormant.size > 0:
            parents = state.parent[dormant]
            # Only buds on older wood are mature enough to form new main branches
            mature_parents = (parents >= 0) & (state.woodiness[parents] > 0.5)
            mature_dormant = dormant[mature_parents]
            
            if mature_dormant.size > 0:
                # Wake up ~5% of mature dormant buds per warm step
                wake = ctx.rng.random(mature_dormant.size) < 0.05
                waking_buds = mature_dormant[wake]
                
                if waking_buds.size > 0:
                    state.node_type[waking_buds] = int(APEX)
                    # Reset vegetativeness for the new growth flush!
                    state.vegetativeness[waking_buds] = ctx.config.inflorescence.v_max
                    # Reset vigor pool so the plant has energy to push them
                    state.vigor[waking_buds] = ctx.config.physiology.bud_activation_vigor


def light_occlusion_pass(ctx: SimulationContext, dt: float = 1.0) -> None:
    """Self-Shadowing (Light Check).
    Simulates light coming from straight above (Z-axis). 
    Creates a 2D canopy density map. Nodes that are lower down (Z) and 
    fall into dense XY canopy regions get shadowed and die.
    """
    state = ctx.state
    n = state.n
    if n == 0:
        return
        
    live = np.flatnonzero(state.alive[:n])
    if live.size == 0:
        return
        
    types = state.node_type[live]
    # Only Leaves, Apexes, and Dormant Buds can starve from lack of light.
    # Woody stems don't die instantly from shadow, they just don't produce new growth.
    vulnerable_mask = (types == int(APEX)) | (types == int(BUD_DORMANT)) | (types == int(FLOWER))
    vulnerable_nodes = live[vulnerable_mask]
    
    if vulnerable_nodes.size == 0:
        return

    # Create a 2D Grid (Shadow Map)
    grid_size = 0.05 # 5 cm per cell
    
    pos = state.position[live]
    x_idx = np.floor(pos[:, 0] / grid_size).astype(int)
    y_idx = np.floor(pos[:, 1] / grid_size).astype(int)
    z = pos[:, 2]
    
    # Shift indices to be positive for bincount/histogram
    min_x = x_idx.min()
    min_y = y_idx.min()
    x_idx -= min_x
    y_idx -= min_y
    
    max_x = x_idx.max() + 1
    max_y = y_idx.max() + 1
    
    # Flat indices for the 2D grid
    flat_idx = y_idx * max_x + x_idx
    
    # Sort ALL live nodes by Z (highest first)
    z_desc_order = np.argsort(-z)
    
    # We will accumulate canopy density in this 1D array (representing the 2D grid)
    canopy_density = np.zeros(max_x * max_y, dtype=int)
    
    # Array to track which nodes die
    kill_mask = np.zeros(n, dtype=bool)
    
    shadow_threshold = 3 # If there are 3 nodes directly above you, you die of starvation
    
    # Process from top to bottom
    # (Since this is a Python loop over potentially 10k nodes, we keep it simple.
    # For a true numpy vectorized approach, we'd use np.ufunc.at or similar, 
    # but since density accumulates sequentially top-to-bottom, a loop is precise.
    # However, Numba would be better. We'll do a fast approximation using 
    # numpy advanced indexing to avoid a slow python loop.)
    
    # Actually, let's just do a simple NumPy threshold check without strict Z-ordering accumulation
    # just counting TOTAL nodes in that column, and if a node's Z is significantly 
    # lower than the column's max Z, and column is dense, it dies.
    
    # 1. Total density per column
    col_density = np.bincount(flat_idx, minlength=max_x * max_y)
    
    # 2. Max Z per column
    # Using a fast groupby max approach
    max_z_per_col = np.full(max_x * max_y, -np.inf)
    np.maximum.at(max_z_per_col, flat_idx, z)
    
    # 3. For vulnerable nodes, check if they are deeply shadowed
    vuln_x = x_idx[vulnerable_mask]
    vuln_y = y_idx[vulnerable_mask]
    vuln_z = z[vulnerable_mask]
    vuln_flat = vuln_y * max_x + vuln_x
    
    # A node is shadowed if its column has high density AND it is at least 20cm below the top canopy
    is_shadowed = (col_density[vuln_flat] > shadow_threshold) & (vuln_z < max_z_per_col[vuln_flat] - 0.2)
    
    # Kill the shadowed nodes
    dead_nodes = vulnerable_nodes[is_shadowed]
    if dead_nodes.size > 0:
        kill_mask[dead_nodes] = True
        state.kill(kill_mask)

