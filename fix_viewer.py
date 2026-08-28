import re

with open("viewers/matplotlib_viewer.py", "r") as f:
    content = f.read()

# We need to rewrite the render_snapshot loop.
old_loop = """
        for i in range(1, n):
            p = int(parent[i])
            if p < 0 or not np.isfinite(pos[i]).all() or not np.isfinite(pos[p]).all():
                continue
            
            start = pos[p]
            end = pos[i]
            segments.append((start, end))

            # Color by tissue type & woodiness
            w = float(woodiness[i])
            r, g, b, a = [
                wood_color[k] * w + herb_color[k] * (1.0 - w) for k in range(4)
            ]
            
            nt = int(node_type[i])
            if nt == 4:  # FLOWER
                r, g, b, a = flower_color
                flower_pts_x.append(end[0])
                flower_pts_y.append(end[1])
                flower_pts_z.append(end[2])
            elif nt == 1:  # APEX
                apex_pts_x.append(end[0])
                apex_pts_y.append(end[1])
                apex_pts_z.append(end[2])

            colors.append((r, g, b, a))

        if segments:
            # Line widths proportional to radius (scaled for visual clarity)
            widths = np.maximum(0.5, radius[1:n] * 150.0)
"""

new_loop = """
        # Fix: Draw exactly one segment per node, using the node's own length and properties.
        # This prevents drawing the parent segment N times (once for each child) and z-fighting.
        from flora.core.spatial import UP_VECTOR, quat_rotate
        
        orient = snap["orientation"]
        length = snap["internode_length"]
        alive = snap["alive"]
        
        widths = []
        for i in range(n):
            if not alive[i]:
                continue
                
            nt = int(node_type[i])
            L = float(length[i])
            start = pos[i]
            
            # The segment goes from pos[i] to pos[i] + L*dir
            dir_vec = quat_rotate(orient[i:i+1], UP_VECTOR)[0]
            end = start + dir_vec * L
            
            if L > 1e-6:
                segments.append((start, end))
                w = float(woodiness[i])
                r, g, b, a = [wood_color[k] * w + herb_color[k] * (1.0 - w) for k in range(4)]
                
                # Flowers and Apices have their colors overriding woodiness
                if nt == 4: # FLOWER
                    r, g, b, a = flower_color
                    
                colors.append((r, g, b, a))
                widths.append(max(0.5, float(radius[i]) * 150.0))
            
            if nt == 4:  # FLOWER
                flower_pts_x.append(end[0])
                flower_pts_y.append(end[1])
                flower_pts_z.append(end[2])
            elif nt == 1:  # APEX
                apex_pts_x.append(end[0])
                apex_pts_y.append(end[1])
                apex_pts_z.append(end[2])

        if segments:
            widths = np.array(widths)
"""

content = content.replace(old_loop, new_loop)

with open("viewers/matplotlib_viewer.py", "w") as f:
    f.write(content)
print("Viewer patched successfully.")
