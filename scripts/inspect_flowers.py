import numpy as np
data = {k: v for k, v in np.load('plant_snapshot.npz').items()}
node_type = data['node_type']
length = data['internode_length']
alive = data['alive']
n = data['n']

for i in range(n):
    if node_type[i] == 4:
        print(f"Flower Node {i}: L={length[i]:.4f}, alive={alive[i]}")
