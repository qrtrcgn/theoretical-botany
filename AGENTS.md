# PROJECT KNOWLEDGE BASE

**Generated:** 2026-03-07
**Commit:** a28f8db
**Branch:** main

## OVERVIEW
High-performance mathematical simulation engine for procedural plant morphogenesis, structural biomechanics, and physiological transport (`theoretical-botany`). Built with NumPy, SciPy (SoA architecture), and Python.

## STRUCTURE
```
theoretical-botany/
├── flora/                # Core simulation engine
│   ├── core/             # State container, quaternion spatial math, sparse graphs
│   ├── biology/          # Mitchison Auxin ODEs, Borchert-Honda vigor, polyploid genetics
│   └── physics/          # Euler-Bernoulli bending, Da Vinci pipe model, seasons
├── viewers/              # Matplotlib 3D and interactive HTML viewers
├── interactive_server.py # JSON API server for interactive UI
└── interactive_ui.html   # Isometric 2.5D web canvas client
```

## WHERE TO LOOK
| Task | Location | Notes |
|---|---|---|
| Engine state & loops | `flora/core/engine.py` | Step calculations and SoA buffer updates |
| Genetics & Meiosis | `flora/biology/genetics.py` | Polyploid allele strands and breeding |
| Biomechanics & Bending | `flora/physics/biomechanics.py` | Cantilever beam deformation |

## COMMANDS
```bash
# Run tests
pytest
# Run interactive server
python interactive_server.py --port 8000
# Run headless simulation
python examples/run_headless.py --config config.json
```
