import numpy as np

data = {k: v for k, v in np.load('plant_snapshot.npz').items()}
pos = data['position']
parent = data['parent']
n = data['n']

segments = []
for i in range(1, n):
    p = parent[i]
    if p >= 0:
        segments.append((i, p, pos[p], pos[i]))

overlaps = []
for idx1, (i1, p1, s1, e1) in enumerate(segments):
    for idx2, (i2, p2, s2, e2) in enumerate(segments):
        if idx1 >= idx2:
            continue
        # Check if segments are geometrically identical
        if np.allclose(s1, s2) and np.allclose(e1, e2):
            overlaps.append((i1, p1, i2, p2))

if overlaps:
    print(f"FOUND {len(overlaps)} OVERLAPPING SEGMENTS!")
    for i1, p1, i2, p2 in overlaps[:5]:
        print(f"Node {i1} (parent {p1}) overlaps Node {i2} (parent {p2})")
else:
    print("No overlapping segments found. Geometry is clean.")
