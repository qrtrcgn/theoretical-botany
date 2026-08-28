import re

with open("flora/biology/inflorescence.py", "r") as f:
    content = f.read()

# We need to completely rewrite floral_transition_step to use a 2-batch architecture
# so that lateral branches originate from the TIP of the newly created segment, not the BASE.

new_func = """
def floral_transition_step(ctx: SimulationContext, dt: float = 1.0) -> None:
    del dt
    state = ctx.state
    infl: InflorescenceConfig = ctx.config.inflorescence
    morph: MorphologyConfig = ctx.config.morphology
    n = state.n
    if n == 0:
        return

    consumed: set[int] = ctx.cache.setdefault("floral_consumed", set())
    live = np.flatnonzero(state.alive[:n])
    axes = [int(i) for i in live if state.node_type[i] == int(FLORAL_AXIS) and int(i) not in consumed]
    if not axes:
        return

    # Batch 1: Main continuing structural axes (creates the segments from base to tip)
    b1_parents, b1_types, b1_pos, b1_orient, b1_len, b1_veg, b1_mass = [], [], [], [], [], [], []
    
    # Batch 2: Lateral flowers and sub-branches (children of the newly created Batch 1 nodes)
    b2_parents, b2_types, b2_pos, b2_orient, b2_len, b2_veg, b2_mass = [], [], [], [], [], [], []

    for axis in axes:
        v = float(state.vegetativeness[axis])
        base_pos = state.position[axis]
        base_quat = state.orientation[axis]

        if v <= 0.0 or infl.inflorescence_type == "single":
            tip_pos = base_pos + quat_rotate(base_quat, UP_VECTOR) * float(state.internode_length[axis])
            b1_parents.append(axis)
            b1_types.append(int(FLOWER))
            b1_pos.append(tip_pos)
            b1_orient.append(base_quat)
            b1_len.append(0.0)
            b1_veg.append(0.0)
            b1_mass.append(morph.flower_mass)
            consumed.add(axis)
            continue

        l_max = morph.internode_length_max * infl.floral_length_frac
        l_floral = max(1e-4, float(l_max * (v / infl.v_max) ** infl.compression_p))
        state.internode_length[axis] = l_floral
        state.structural_mass[axis] = 0.001

        q_jitter = quat_from_axis_angle(random_unit_axes(1, ctx.rng)[0], float(ctx.rng.uniform(-0.08, 0.08)))
        axis_quat = quat_multiply(base_quat, q_jitter)
        tip_pos = base_pos + quat_rotate(axis_quat, UP_VECTOR) * l_floral
        next_v = max(0.0, v - infl.v_decay)

        itype = infl.inflorescence_type
        
        # Calculate the future index of the main continuing node (Batch 1)
        future_idx = state.n + len(b1_parents)

        if itype == "raceme":
            b1_parents.append(axis)
            b1_types.append(int(FLORAL_AXIS))
            b1_pos.append(tip_pos)
            b1_orient.append(axis_quat)
            b1_len.append(0.0)
            b1_veg.append(next_v)
            b1_mass.append(0.0)

            if v > float(ctx.rng.uniform(0.0, infl.v_max * 0.4)):
                side_az = float((1.0 if (axis % 2 == 0) else -1.0) * np.pi / 2.5)
                q_side_z = quat_from_axis_angle(_ROT_Z, side_az + float(ctx.rng.uniform(-0.15, 0.15)))
                q_side_x = quat_from_axis_angle(_ROT_Y, (np.pi / 3.0) + float(ctx.rng.uniform(-0.1, 0.1)))
                fl_quat = quat_multiply(quat_multiply(axis_quat, q_side_z), q_side_x)
                
                # Lateral flower originates from the NEW tip (future_idx)
                b2_parents.append(future_idx)
                b2_types.append(int(FLOWER))
                # Add a visible 1.5cm pedicel length
                b2_pos.append(tip_pos + quat_rotate(fl_quat, UP_VECTOR) * 0.015)
                b2_orient.append(fl_quat)
                b2_len.append(0.015)
                b2_veg.append(0.0)
                b2_mass.append(morph.flower_mass)
            consumed.add(axis)

        elif itype == "panicle":
            b1_parents.append(axis)
            b1_types.append(int(FLORAL_AXIS))
            b1_pos.append(tip_pos)
            b1_orient.append(axis_quat)
            b1_len.append(0.0)
            b1_veg.append(next_v)
            b1_mass.append(0.0)

            q_bz = quat_from_axis_angle(_ROT_Z, float(ctx.rng.uniform(-np.pi, np.pi)))
            q_bx = quat_from_axis_angle(_ROT_Y, float(ctx.rng.uniform(0.4, 0.8)))
            b_quat = quat_multiply(quat_multiply(axis_quat, q_bz), q_bx)
            
            b2_parents.append(future_idx)
            b2_types.append(int(FLORAL_AXIS))
            # Start branch exactly at tip
            b2_pos.append(tip_pos)
            b2_orient.append(b_quat)
            b2_len.append(0.0)
            b2_veg.append(max(0.0, v - infl.panicle_branch_v_penalty))
            b2_mass.append(0.0)
            consumed.add(axis)

        elif itype == "cyme":
            # Terminal flower is the main structural continuation
            b1_parents.append(axis)
            b1_types.append(int(FLOWER))
            b1_pos.append(tip_pos + quat_rotate(axis_quat, UP_VECTOR) * 0.01)
            b1_orient.append(axis_quat)
            b1_len.append(0.01)
            b1_veg.append(0.0)
            b1_mass.append(morph.flower_mass)

            for sign in (-1.0, 1.0):
                c_quat = quat_multiply(quat_multiply(axis_quat, quat_from_axis_angle(_ROT_Z, sign * float(np.pi / 3.0))), quat_from_axis_angle(_ROT_Y, float(np.pi / 4.0)))
                # Branches sprout from the base of the terminal flower (future_idx)
                b2_parents.append(future_idx)
                b2_types.append(int(FLORAL_AXIS))
                b2_pos.append(tip_pos)
                b2_orient.append(c_quat)
                b2_len.append(0.0)
                b2_veg.append(next_v)
                b2_mass.append(0.0)
            consumed.add(axis)

    # Execute Batch 1 (Main axes)
    if b1_parents:
        state.add_nodes(
            parents=np.asarray(b1_parents, dtype=np.int64),
            node_types=np.asarray(b1_types, dtype=np.int8),
            positions=np.asarray(b1_pos, dtype=np.float64),
            orientations=np.asarray(b1_orient, dtype=np.float64),
            internode_lengths=np.asarray(b1_len, dtype=np.float64),
            vegetativeness=np.asarray(b1_veg, dtype=np.float64),
            structural_mass=np.asarray(b1_mass, dtype=np.float64),
        )
    # Execute Batch 2 (Lateral branches/flowers referencing Batch 1 parents)
    if b2_parents:
        state.add_nodes(
            parents=np.asarray(b2_parents, dtype=np.int64),
            node_types=np.asarray(b2_types, dtype=np.int8),
            positions=np.asarray(b2_pos, dtype=np.float64),
            orientations=np.asarray(b2_orient, dtype=np.float64),
            internode_lengths=np.asarray(b2_len, dtype=np.float64),
            vegetativeness=np.asarray(b2_veg, dtype=np.float64),
            structural_mass=np.asarray(b2_mass, dtype=np.float64),
        )
"""

start_idx = content.find("def floral_transition_step")
if start_idx != -1:
    content = content[:start_idx] + new_func
    with open("flora/biology/inflorescence.py", "w") as f:
        f.write(content)
    print("Patched successfully.")
else:
    print("Could not find function.")

