import numpy as np

data = {k: v for k, v in np.load('plant_snapshot.npz').items()}
parent = data['parent']
woodiness = data['woodiness']
n = data['n']

for i in range(1, n):
    p = parent[i]
    if p >= 0:
        if woodiness[i] > woodiness[p] + 0.001:
            print(f"ANOMALY: Child {i} (w={woodiness[i]:.4f}) is MORE woody than Parent {p} (w={woodiness[p]:.4f})")
print("Check complete.")
