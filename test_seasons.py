import numpy as np
from flora import create_default_engine, EngineConfig

cfg = EngineConfig()
engine = create_default_engine(cfg)

for c in range(120):
    engine.step(1.0)
    
    # Let's track the environment and population
    if c % 10 == 0:
        env = engine.ctx.env
        n = engine.ctx.state.n
        live = np.sum(engine.ctx.state.alive[:n])
        dormant = np.sum((engine.ctx.state.node_type[:n] == 2) & engine.ctx.state.alive[:n])
        print(f"Cycle {c:3d} (Day {c*5:3d}): Temp={env.temperature:5.1f}°C, Nodes={live:4d} (Dormant Buds={dormant:3d})")
        
    # In winter, let's compact the state so dead nodes are wiped
    if c > 0 and c % 73 == 0: # 73 * 5 = 365 days
        print("--- WINTER COMPACTION ---")
        engine.ctx.state.compact()

print("Final snapshot:")
snap = engine.snapshot()
np.savez('plant_seasons.npz', **snap)
print(f"Nodes alive: {np.sum(snap['alive'][:int(snap['n'])])}")
