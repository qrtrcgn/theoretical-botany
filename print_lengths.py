import numpy as np

data = {k: v for k, v in np.load('plant_snapshot.npz').items()}
length = data['internode_length']
node_type = data['node_type']
woodiness = data['woodiness']
n = data['n']

green_count = 0
brown_count = 0
for i in range(n):
    if length[i] > 1e-4:
        w = woodiness[i]
        if w < 0.5:
            green_count += 1
        else:
            brown_count += 1
        print(f"Node {i:2d}: L={length[i]:.4f}, w={w:.4f}, type={node_type[i]}")
print(f"Total visible nodes: {green_count} green, {brown_count} brown")
