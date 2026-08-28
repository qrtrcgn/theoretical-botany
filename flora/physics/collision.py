import numpy as np
from flora.core.context import SimulationContext
from flora.core.spatial import UP_VECTOR, quat_from_axis_angle, quat_multiply, quat_normalize, quat_rotate, rotate_toward

def floor_collision_pass(ctx: SimulationContext, dt: float = 1.0) -> None:
    """A pass that simulates ground collision and climbing vines."""
    state = ctx.state
    n = state.n
    if n == 0: return
    
    headings = state.headings()
    pos = state.position[:n]
    
    # --- Climbing physics (Gen 1) ---
    if ctx.config.inflorescence.growth_habit == "climbing":
        # Pull heading towards the central Z axis, but swirling
        r_xy = np.linalg.norm(pos[:, :2], axis=-1)
        # We only curl branches that are far from the pole, or we curl them around it
        # Target heading: swirling up and in
        target_h = np.zeros_like(headings)
        # Vector towards the center
        target_h[:, 0] = -pos[:, 0]
        target_h[:, 1] = -pos[:, 1]
        
        # Add a tangential component to make it swirl (cross product with Z)
        tangent = np.cross(target_h, np.array([0, 0, 1]))
        
        # Combine inward, tangential, and upward
        target_h = 0.5 * target_h + 1.5 * tangent
        target_h[:, 2] = 1.0 # Always pull upwards
        
        norms = np.linalg.norm(target_h, axis=-1, keepdims=True)
        target_h = np.where(norms > 1e-8, target_h / norms, UP_VECTOR)
        
        # Apply a mild rotation towards this climbing target
        q_delta_climb = rotate_toward(headings, target_h, 0.25)
        
        # Only apply climbing to active structural nodes (not heavy flowers dragging it down)
        state.orientation[:n] = quat_normalize(quat_multiply(q_delta_climb, state.orientation[:n]))
        headings = state.headings() # Update headings for floor check

    # --- Floor collision ---
    ground_z = 0.01
    below = pos[:, 2] < ground_z
    if not below.any(): return
    
    pos[below, 2] = ground_z
    
    bad_heading = (headings[:, 2] < -0.01) & below
    if bad_heading.any():
        idx = np.where(bad_heading)[0]
        H = headings[idx]
        
        H_new = H.copy()
        H_new[:, 2] = np.abs(H_new[:, 2]) * 0.5 
        
        norms = np.linalg.norm(H_new, axis=-1, keepdims=True)
        H_new = np.where(norms > 1e-8, H_new / norms, H)
        
        q_delta = rotate_toward(H, H_new, 3.14)
        state.orientation[idx] = quat_normalize(quat_multiply(q_delta, state.orientation[idx]))
        
    state.position[:n] = pos
