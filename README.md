# Flora Simulation Engine (`flora`)

**Architect and Creator:** Martin Osorio Pulido  
**License:** GPLv3 (See LICENSE file for open-source usage. Contact for commercial licensing.)

A high-performance, headless mathematical simulation engine for procedural plant morphogenesis, structural biomechanics, and physiological transport based on algorithmic-botany literature (*Prusinkiewicz & Lindenmayer*, *Borchert & Honda*, *Mitchison*, *West, Brown & Enquist*).

---

## Key Mathematical & Architectural Highlights

1. **Strict Data-Oriented Design (SoA)**:
   - Zero per-node heap objects for computation. State is represented via preallocated, SIMD-aligned 1D/2D NumPy buffers (`position`, `orientation` quaternions, `radius`, `auxin`, `pin`, `vigor`, `vegetativeness`, `structural_mass`).
   - Topologies traversed via Sparse Adjacency Matrices (CSR) and level-synchronous `np.bincount` reductions.

2. **Mitchison Polar Transport & Canalization**:
   - Continuous non-linear ODE solver (`scipy.integrate.solve_ivp`, LSODA) capturing basipetal Auxin efflux and PIN-protein canalization feedback loops for apical dominance.

3. **Euler-Bernoulli Elastic Biomechanics**:
   - Discretized cantilever beam deformation under gravity with strict quartic moment of area scaling ($I = \frac{\pi r^4}{4}$) and distinct Young's moduli ($E_{herb}$ vs $E_{wood}$).

4. **Pipe Model Theory (Da Vinci Allometry)**:
   - Exact bottom-up recursive/level-order radius calculation: $r_{parent}^n = \sum r_{children}^n$ ($n=2.0$ for area-preserving herbaceous, $n=2.5$ for woody mechanical taper).

5. **L-System Inflorescence Grammars**:
   - Vegetativeness decay ($v \to 0$) driving floral internode compression $L(v) = L_{max} \cdot (v/v_{max})^p$, yielding racemes, panicles, cymes, and solitary flowers.

6. **Multi-Year Seasonal Environment**:
   - 365-day weather model (temperature from base + amplitude · season + noise; light/water/nutrients with `growth_factor = min(...)` per Liebig's law), frost dieback of non-lignified tips and flowers, spring bud-break from mature dormant buds on woody wood, and a self-shadowing light-occlusion pass (inner-canopy starvation).

7. **Thigmotropism & Floor Collision**:
   - Climbing-vine heading control (inward + tangential swirl around a Z pole) plus a ground-plane clamp with downward-heading reflection.

8. **Polyploid Genetics**:
   - `flora/biology/genetics.py`: `Genome` (polyploid allele strands) with rigorous meiosis — homolog segregation, crossover, unequal crossover (deletions/duplications) and non-disjunction (aneuploidy) — plus `breed()` crossing and phenotype-pool extraction used to configure plant morphology/flower traits.

- **Interactive Web App**: `interactive_server.py` serves an isometric 2.5D canvas (`interactive_ui.html`) with live simulation, click-to-prune with Mitchison auxin re-routing, genetic breeding, and `/api/raw_snapshot` for full raw state export via JSON.

---

## Package Architecture

```
flora/
├── core/         # SoA state container, quaternion spatial math, sparse graph Kahn traversals, config, environment state
├── biology/      # Mitchison Auxin ODEs, Borchert-Honda Vigor, L-System floral grammars, elongation, polyploid genetics
├── physics/      # Euler-Bernoulli bending, Da Vinci pipe model, tissue maturation, weather/seasons, collision/climbing
├── io/           # Non-blocking snapshotting, .npz serializer / deserializer
└── factory.py    # Composition root wiring the default botanical pipeline
viewers/          # Decoupled visualization clients (Matplotlib 3D, HTML isometric)
examples/         # Headless batch run
scripts/          # Optional demos/utilities
interactive_server.py  # JSON API + serves the interactive 2.5D web app
interactive_ui.html   # Hand-authored isometric plant canvas (served by interactive_server.py)
```

## CLI Workflows

- **Headless (all parameters via CLI)**:
  - Full config JSON: `python examples/run_headless.py --config config.json`
  - Single override: `python examples/run_headless.py --set mechanics.gravity=1.62 --set morphology.max_nodes_soft=50000`
  - Raw full-state JSON export: `python examples/run_headless.py --raw-json plant_snapshot.json`

- **Interactive server + integrated viewer**:
  - `python interactive_server.py --port 8000`
  - UI: `http://localhost:8000`
  - Raw snapshot API: `POST /api/raw_snapshot` (optional body: `{"steps": 10}`)

---

## Quickstart

```python
from flora import create_default_engine, EngineConfig

# 1. Initialize headless engine (Zero UI / rendering dependencies)
config = EngineConfig(seed=42)
engine = create_default_engine(config)

# 2. Advance botanical simulation
for step in range(50):
    state = engine.step(dt=1.0)

# 3. Export clean matrix state for OpenGL / Blender / Unity
snap = engine.snapshot()
print(f"Total simulated organs: {snap['n']}")
print(f"Node positions shape:   {snap['position'].shape}")
```
