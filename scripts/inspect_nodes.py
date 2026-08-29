import numpy as np

data = {k: v for k, v in np.load('plant_snapshot.npz').items()}
pos = data['position']
parent = data['parent']
node_type = data['node_type']
woodiness = data['woodiness']

for i in [1, 2, 3, 4, 5, 6, 7, 8]:
    p = parent[i]
    print(f"Node {i:2d}: parent={p:2d}, type={node_type[i]}, pos={pos[i]}, w={woodiness[i]:.2f}")
