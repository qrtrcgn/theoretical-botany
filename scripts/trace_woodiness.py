import numpy as np

data = {k: v for k, v in np.load('plant_snapshot.npz').items()}
parent = data['parent']
woodiness = data['woodiness']
pos = data['position']
node_type = data['node_type']
n = data['n']

# Trace from the tip of the main axis down to the root
# To find the tip, we can find the node with depth max, or just follow the first child always.
# Actually, the main axis is the one where we always take the first child that is an APEX or FLORAL_AXIS.
# Let's just find the longest path from root (0).
children = [[] for _ in range(n)]
for i in range(1, n):
    children[parent[i]].append(i)

def get_main_path(node):
    if not children[node]:
        return [node]
    # Pick the child that leads to the deepest path
    best_path = []
    for c in children[node]:
        path = get_main_path(c)
        if len(path) > len(best_path):
            best_path = path
    return [node] + best_path

main_path = get_main_path(0)

print("Main axis trace:")
for i in main_path:
    print(f"Node {i:3d}: type={node_type[i]}, pos_z={pos[i][2]:.4f}, woodiness={woodiness[i]:.4f}")
