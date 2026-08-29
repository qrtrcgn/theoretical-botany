# FLORA ENGINE — FROZEN INTERFACE CONTRACT v1.0

All agents implement EXACTLY against this contract. No deviations in names, dtypes,
shapes, or signatures. If something is genuinely impossible, STOP and report — do not
silently rename. Package name: `flora`. Python ≥3.11, deps: numpy, scipy only
(viewers/tests may add matplotlib/pytest).

## 1. PACKAGE LAYOUT (final)

```
flora/
├── __init__.py        # public API: EngineConfig + sub-configs, SimulationEngine,
│                      # PlantState, create_default_engine, NodeType enums
├── factory.py         # composition root: create_default_engine(cfg) -> SimulationEngine
├── core/
│   ├── __init__.py    # re-exports
│   ├── config.py      # frozen dataclasses (below)
│   ├── spatial.py     # batched quaternion math (pure numpy einsum)
│   ├── graph.py       # sparse adjacency + traversal orders
│   ├── state.py       # PlantState SoA container
│   ├── context.py     # SimulationContext + Pass type alias
│   └── engine.py      # SimulationEngine
├── biology/
│   ├── __init__.py    # re-exports of all pass functions
│   ├── auxin.py       # auxin_transport_step  (Mitchison ODEs, scipy.integrate)
│   ├── vigor.py       # vigor_allocation_step (Borchert–Honda)
│   ├── growth.py      # elongation_step, budding_step
│   └── inflorescence.py  # vegetativeness_decay_step, floral_transition_step
├── physics/
│   ├── __init__.py    # re-exports
│   ├── materials.py   # young_modulus, second_moment_area, segment_mass, density
│   ├── pipe_model.py  # update_radii
│   └── biomechanics.py# bending_pass
└── io/
    ├── __init__.py
    └── snapshot.py    # snapshot(state) -> dict; save_npz; load_npz
```

HARD RULE: `flora/**` imports ONLY stdlib + numpy + scipy (+flora-internal).
NO tkinter, NO matplotlib anywhere under flora/. Viewers live outside flora/.

## 2. NODE TYPES & CONSTANTS (core/config.py)

```python
class NodeType(IntEnum):
    INTERNODE = 0      # structural stem segment
    APEX      = 1      # active shoot apical meristem
    BUD_DORMANT = 2    # lateral bud awaiting activation
    FLORAL_AXIS = 3    # inflorescence stalk internode
    FLOWER    = 4      # terminal flower (mass carrier, zero length)
    LEAF      = 5      # leaf (mass carrier, zero length)

STRUCTURAL_TYPES = frozenset({INTERNODE, APEX, FLORAL_AXIS})
```

Frozen dataclasses (all fields with defaults; validate ranges in `__post_init__`):

```python
@dataclass(frozen=True)
class MorphologyConfig:
    branch_angle: float = 0.7            # rad (~40°), lateral off parent heading
    phyllotaxis_divergence: float = 2.399963229  # golden angle rad (alternate)
    phyllotaxis_mode: str = "alternate"  # "alternate" | "opposite" | "whorled"
    internode_length_max: float = 0.05   # m
    length_depth_decay: float = 0.9      # L *= decay**depth (monolith-proven)
    radial_jitter: float = 0.10          # ±rad heading jitter per extension
    tip_radius_min: float = 0.0015       # m
    leaf_mass: float = 0.010             # kg per LEAF node
    flower_mass: float = 0.005           # kg per FLOWER node
    max_nodes_soft: int = 20000          # soft budget; passes stop spawning beyond

@dataclass(frozen=True)
class PhysiologyConfig:
    auxin_production: float = 1.0        # P at each active APEX
    auxin_decay: float = 0.15            # μ_A 1/simulation-cycle units
    pin_baseline: float = 0.05
    pin_decay: float = 0.05              # μ_T
    pin_feedback_gain: float = 1.2       # ε (canalization positive feedback)
    km_auxin: float = 0.5                # K_a saturation of pump flux
    km_pin: float = 0.5                  # K_t saturation of PIN upregulation
    root_sink_rate: float = 2.0          # efflux removal at root node
    ode_rtol: float = 1e-6
    ode_atol: float = 1e-9
    vigor_total: float = 100.0           # R: total plant resource pool per cycle
    vigor_maintenance: float = 0.20      # fraction relaxed out per cycle
    vigor_tau: float = 1.0               # relaxation time constant (cycles)
    bud_activation_vigor: float = 4.0    # V needed to activate dormant bud
    auxin_suppression: float = 0.60      # local auxin above this suppresses laterals
    apex_vigor_threshold: float = 1.5    # V needed for apex extension

@dataclass(frozen=True)
class MechanicsConfig:
    e_herbaceous: float = 2.0e7          # Pa (monolith E=20 scaled to SI)
    e_wood: float = 1.0e10               # Pa (monolith E=150 → realistic woody)
    density_herbaceous: float = 700.0    # kg/m³
    density_wood: float = 600.0          # kg/m³
    gravity: float = 9.81                # m/s²
    pipe_exponent_wood: float = 2.5      # n (mechanical taper)
    pipe_exponent_herb: float = 2.0      # n (area-preserving)
    max_bend_per_step: float = 0.35      # rad clamp per segment per step
    bending_damping: float = 0.85        # relax applied increment (stability)
    wood_maturation_cycles: float = 8.0  # cycles for woodiness → 1 on structural nodes below apex depth gap

@dataclass(frozen=True)
class InflorescenceConfig:
    v_max: float = 1.0
    v_decay: float = 0.25                # δ per floral cycle (monolith delta_v)
    compression_p: float = 1.5           # p in L(v)=L_max·(v/v_max)^p (monolith)
    floral_length_frac: float = 0.8      # L_floral_max = frac · internode_length_max
    floral_trigger_v: float = 0.30       # apex with v ≤ trigger enters floral program
    sympodial_term_prob: float = 0.8     # monolith: sympodial apex termination chance
    monopodial_term_prob: float = 0.30
    panicle_branch_v_penalty: float = 0.40  # monolith B(v−0.4)
    inflorescence_type: str = "raceme"   # "single"|"raceme"|"panicle"|"cyme"

@dataclass(frozen=True)
class EngineConfig:
    capacity: int = 1024                 # initial SoA capacity (grows ×2)
    seed: int | None = None
    morphology: MorphologyConfig = field(default_factory=MorphologyConfig)
    physiology: PhysiologyConfig = field(default_factory=PhysiologyConfig)
    mechanics: MechanicsConfig = field(default_factory=MechanicsConfig)
    inflorescence: InflorescenceConfig = field(default_factory=InflorescenceConfig)
```

## 3. STATE — STRUCT OF ARRAYS (core/state.py)

`PlantState` owns preallocated arrays of shape `(capacity,)`; live nodes occupy `[0, n)`.

| field               | dtype    | shape    | meaning                                        |
|---------------------|----------|----------|------------------------------------------------|
| parent              | int32    | (cap,)   | index of parent; −1 for root                   |
| position            | float64  | (cap,3)  | world position of node BASE                    |
| orientation         | float64  | (cap,4)  | quaternion [w,x,y,z]; LOCAL frame +Z = heading |
| radius              | float64  | (cap,)   | computed by pipe model                         |
| auxin               | float64  | (cap,)   | concentration                                  |
| pin                 | float64  | (cap,)   | PIN conductance of edge i→parent(i); ignore[0] |
| vigor               | float64  | (cap,)   | allocated resource share                       |
| vegetativeness      | float64  | (cap,)   | v scalar                                       |
| structural_mass     | float64  | (cap,)   | tissue mass of segment i                       |
| internode_length    | float64  | (cap,)   | segment length                                 |
| age                 | float64  | (cap,)   | cycles since birth                             |
| woodiness           | float64  | (cap,)   | ∈[0,1]                                         |
| moment              | float64  | (cap,)   | |bending moment| at base (physics cache out)   |
| deflection          | float64  | (cap,)   | bend angle applied last pass (radians)         |
| depth               | int32    | (cap,)   | graph depth (root=0)                           |
| node_type           | int8     | (cap,)   | NodeType                                       |
| alive               | bool_    | (cap,)   | liveness mask                                  |

Public API of PlantState:
```python
class PlantState:
    def __init__(self, capacity: int): ...
    topology_version: int            # bumped by add_nodes / kill
    n: int                           # live count
    def add_nodes(self, parents: ArrayLike[int], node_types: ArrayLike[int|NodeType],
                  positions: ArrayLike|None = None, orientations: ArrayLike|None = None,
                  internode_lengths=None, radii=None, vegetativeness=None, vigor=None,
                  auxin=None, woodiness=None, structural_mass=None) -> np.ndarray: ...
        # vectorized batch append; broadcasts scalars; defaults: position=parent pos,
        # orientation=parent quat copied, length/radius/vig/etc from sensible zeros;
        # age=0, alive=True, depth=parent.depth+1; grows capacity ×2 when needed.
    def kill(self, mask: np.ndarray) -> None: ...   # mark alive=False (no compaction)
    def compact(self) -> None: ...                  # drop dead nodes, remap parents
    # cached derived topology (invalidate on topology_version change):
    def adjacency(self) -> scipy.sparse.csr_matrix   # N×N, A[i,j]=1 iff j child of i
    def forward_order(self) -> np.ndarray            # parents strictly before children
    def reverse_order(self) -> np.ndarray            # children before parents
    def levels(self) -> list[np.ndarray]             # indices grouped by depth ascending
    def headings(self) -> np.ndarray                 # (n,3) rotate(+Z by quat), live slice
```

Root seeding (factory does this):
```python
state.add_nodes([-1], [APEX]); set vegetativeness=v_max; internode_length=internode_length_max
```

## 4. SPATIAL HELPERS (core/spatial.py) — batched, pure numpy

```python
def quat_from_axis_angle(axis: np.ndarray, angle: np.ndarray) -> np.ndarray   # (…,3),(…)→(…,4)
def quat_multiply(q1: np.ndarray, q2: np.ndarray) -> np.ndarray               # (…,4)
def quat_normalize(q: np.ndarray) -> np.ndarray
def quat_rotate(q: np.ndarray, v: np.ndarray) -> np.ndarray                   # (…,4)x(…,3)->(…,3)
def rotate_toward(direction: np.ndarray, target: np.ndarray, max_angle: np.ndarray) -> np.ndarray
    # minimal rotation taking direction→target clamped to max_angle (per-instance), returns DELTA quat
QUAT_IDENTITY / UP_VECTOR constants
```

## 5. GRAPH UTILITIES (core/graph.py)

Implementations used by PlantState caches AND directly by physics/biology:
```python
def build_adjacency(parent: np.ndarray, n: int) -> csr_matrix
def topological_orders(parent: np.ndarray, n: int) -> tuple[np.ndarray, np.ndarray]
def depth_levels(parent: np.ndarray, n: int) -> list[np.ndarray]
def sum_by_parent(values: np.ndarray, parent: np.ndarray, n: int) -> np.ndarray
    # out[p] = Σ values[c] over children c of p  (np.bincount, minlength=n)
```
Kahn's algorithm via numpy indegree/frontier loops. Raise ValueError on cycles.

## 6. PASS PROTOCOL & ENGINE

core/context.py:
```python
@dataclass
class SimulationContext:
    state: PlantState
    config: EngineConfig
    rng: np.random.Generator
    time: float = 0.0
    step_index: int = 0
Pass = Callable[[SimulationContext, float], None]   # mutate ctx.state in place
```

core/engine.py:
```python
class SimulationEngine:
    def __init__(self, config: EngineConfig, passes: Sequence[Pass],
                 seed: int | None = None): ...
        # builds ctx; if state has no nodes, seeds root APEX per §3.
    @property
    def state(self) -> PlantState: ...
    def step(self, dt: float = 1.0) -> PlantState: ...
        # run passes in order; advance ctx.time/step_index; return self.state
    def snapshot(self) -> dict: ...   # delegates io.snapshot.snapshot(state)
```

## 7. BIOLOGY PASSES — EXACT MATH

### 7.1 auxin_transport_step(ctx, dt)  [biology/auxin.py]
Mitchison canalization. Edge variable = per-node `pin[i]`, `auxin[i]`.
Saturating basipetal pump flux on edge i→parent(i):
```
E_i(A,T) = T_i · A_i² / (km_auxin² + A_i²)
root sink (i==0): E_0 = root_sink_rate · A_0
dA_i/dt = P·is_apex_i + Σ_{c∈children(i)} E_c − E_i − auxin_decay·A_i
dT_i/dt = pin_feedback_gain · E_i/(km_pin + E_i) − pin_decay·T_i   (i>0)
```
Integrate the JOINT stacked system y=[auxin, pin] with
`scipy.integrate.solve_ivp(fun, (0, dt), y0, method="LSODA", rtol, atol)`;
RHS must use ONLY vectorized ops (`np.bincount`/CSR adjacency gather-scatter).
After solve: clip negatives to 0, write back. Deterministic given same inputs.

### 7.2 vigor_allocation_step(ctx, dt)  [biology/vigor.py]
Borchert–Honda proportional resource partitioning, two-phase per cycle:
1. Demand weights bottom-up (levels descending): demand_i = is_apex? (1+auxin_export proxy)
   : is_bud? small_const : base_demand; subtree_demand[p] = own + Σ_c subtree_demand[c]
   (use `sum_by_parent` repeatedly per level). Root gets vigor_total.
2. Shares top-down (levels ascending): share_child = subtree_demand[c]/subtree_demand[p];
   V_target[child] = V_target[parent] · share_child.
3. Relax: vigor += dt · (vigor_target − vigor)/vigor_tau − dt·vigor_maintenance·vigor.

### 7.3 elongation_step(ctx, dt)  [biology/growth.py]
For each alive APEX with vigor > apex_vigor_threshold and auxin < auxin_suppression
(apical dominance gate; apex exempt when it IS the trunk lineage i.e. depth==1 chain —
simply: apply gate to all, monopodial/sympodial handled in budding):
- old apex → INTERNODE; append new APEX at tip:
  heading_new = heading_old rotated by Δq where Δq = rotate_toward(heading_old,
  normalize(heading_old + gravitropic_bias·ĝ_up + jitter), tiny)
  PLUS phototropic straightening: bias toward previous heading (momentum) — keep simple:
  new_quat = quat_multiply(parent_quat, quat_from_axis_angle(random small axis, jitter))
  jitter ~ Gaussian N(0, radial_jitter·0.5) via ctx.rng   # bell-curve variance
- internode_length of NEW apex's parent segment = morphology.internode_length_max ·
  length_depth_decay**depth · N(1.0, 0.1)              # Gaussian around nominal length
- position[new] = position[old] + quat_rotate(new_quat_of_parent_segment, (0,0,L))
- structural_mass[segment] = physics.materials.segment_mass(...)  (import from physics OK?
  NO — biology must not import physics. Compute mass inline with π r² L ρ using current
  woodiness & cfg densities — duplicate the 3-line formula instead of importing.)
- vegetativeness: new apex inherits parent's v.

### 7.4 budding_step(ctx, dt)  [biology/growth.py]
For each INTERNODE created THIS STEP (track via a set returned on ctx.cache dict key
"new_internodes" filled by elongation_step):
- Spawn lateral buds per phyllotaxis_mode around parent heading at branch_angle:
  alternate: 1 bud at divergence·k (k=node birth counter mod); opposite: 2 at ±90°·…
  concretely: azimuths = divergence·index for alternate; {0,π}+divergence·idx opposite;
  whorled: 3 azimuths +divergence·idx. Bud quat = parent_seg_quat ∘ rotZ(azimuth) ∘ rotX(branch_angle)
- type=BUD_DORMANT, vigor=0, vegetativeness inherit.
- Activation check (apical dominance via auxin/vigor): BUD_DORMANT with
  vigor ≥ bud_activation_vigor AND auxin[parent] < auxin_suppression AND rng < activation_prob
  → becomes APEX (keeps position/orientation). activation_prob default 0.6 (config-free
  constant acceptable, document).
- Sympodial vs monopodial growth habit: InflorescenceConfig carries
  `growth_habit: str = "monopodial"`  # "monopodial" | "sympodial" (ADD THIS FIELD).
  Every cycle, each active APEX with ctx.rng.random() < term_prob(growth_habit) and depth ≥ 3
  converts to FLORAL_AXIS with v := v_max (enters floral program). term_prob is
  sympodial_term_prob for "sympodial", monopodial_term_prob for "monopodial".

### 7.5 vegetativeness_decay_step(ctx, dt)  [biology/inflorescence.py]
FLORAL_AXIS nodes: vegetativeness −= dt·v_decay·dt_scale(dt=1/cycle ⇒ exact monolith δ).
Clip ≥0. Structural APEX nodes: v decays slowly: v −= 0.02·dt (aging toward floral trigger).

### 7.6 floral_transition_step(ctx, dt)  [biology/inflorescence.py]
Implements L-system grammar via add_nodes. For each alive FLORAL_AXIS/APEX with v>0 in
floral program (type FLORAL_AXIS, or apex triggered by §7.4 conversion):
- produce one floral segment: length L_floral = floral_length_frac·internode_length_max·
  (v/v_max)**compression_p  (THE required law L(v)=L_max·(v/v_max)^p)
- then apply ONE of:
  - single: spawn FLOWER terminal; axis done (mark consumed flag via node_type→FLOWER? no:
    spawn FLOWER child; set axis type stays; guard with vegetativeness≤0 next cycle)
  - raceme: spawn FLOWER as lateral child (pedicel implicit); axis CONTINUES (it extends
    itself: old→INTERNODE-like FLORAL_AXIS, new FLORAL_AXIS tip with v−δ)
  - panicle: as raceme PLUS spawn lateral FLORAL_AXIS child with v − panicle_branch_v_penalty
    (sub-branch runs its own program)
  - cyme: spawn FLOWER terminal on current axis; spawn TWO lateral FLORAL_AXIS children
    with v−δ at ±60° azimuth offsets; current axis terminates (no continuation)
- v ≤ 0 → spawn terminal FLOWER, stop extending.
Flowers: type FLOWER, zero length, mass flower_mass (set structural_mass).

## 8. PHYSICS PASSES — EXACT MATH

### 8.1 materials.py
```python
def young_modulus(woodiness: np.ndarray, cfg: MechanicsConfig) -> np.ndarray
    # E = e_herb + (e_wood − e_herb)·w
def second_moment_area(radius: np.ndarray) -> np.ndarray
    # I = π·r⁴/4   STRICT r⁴ scaling
def density(woodiness, cfg) -> np.ndarray
def segment_mass(radius, length, woodiness, cfg) -> np.ndarray  # ρ·π·r²·L
```
woodiness update helper here too:
`def mature_woodiness(depth, cycles_at_depth, cfg)` — simple rule used by engine-side:
woodiness = clip(age_below / wood_maturation_cycles) for structural nodes (implement inside
pipe_model.update_radii which already runs after growth: w_i += dt/τ until 1 for
STRUCTURAL types with any child; tips stay herbaceous longer: multiply 0.5).

### 8.2 update_radii(ctx, dt)  [physics/pipe_model.py] — PIPE MODEL
Bottom-up level-synchronous (levels descending):
```
tips (no alive structural children): r = tip_radius_min
level d: acc[p] += Σ_children r_c**n_c ; then r_p = acc[p]**(1/n_p)
n per-node (continuous taper): n_exp = pipe_exponent_herb + (pipe_exponent_wood − pipe_exponent_herb)·w
FLOOR: r_p = max(r_p, tip_radius_min)
```
Also update woodiness per §8.1 rule. All vectorized via bincount per level.

### 8.3 bending_pass(ctx, dt)  [physics/biomechanics.py] — Euler–Bernoulli cantilever
Two level-synchronous sweeps:
1. Bottom-up accumulate subtree weight W_i and moment about each node's base M_i:
   own load q_i = structural_mass[i]·g (LEAF/FLOWER add their masses at node point);
   lever arm = horizontal component of (load application offset − node base):
   segment self-weight acts at midpoint m_i = pos_i + ĥ_i·L_i/2 (ĥ=heading);
   child contributions transfer: M_p += M_c + W_c·g·horiz_dist(com_c, base_p);
   W_p = Σ W_c + own; com tracked analogously.
2. Top-down apply incremental rotation:
   κ_i = M_i/(E_i·I_i);  Δθ_i = min(κ_i·L_i, max_bend_per_step)·bending_damping
   bend axis â = unit(cross(ĥ_i, ĝ)) (ĝ=(0,0,−1)); Δq = quat_from_axis_angle(â, Δθ_i)
   cumulative: q_delta_abs[i] = q_delta_abs[parent] ∘ Δq_local[i]
   orientation[i] = normalize(q_delta_abs_parent∘orientation[i]) for ALL descendants incl. self
   position recompute forward: pos[c] = pos[p] + quat_rotate(q_seg, (0,0,L_p))
Write |M_i| into state.moment, Δθ into state.deflection.

CONVERGENCE FACT (for tests): rigid-link incremental integration converges to analytic
cantilever δ=W L³/(3EI) as segmentation refines; test uses ≥50 segments, tol 3%.

### 8.4 environment.py [physics/environment.py] — WEATHER & SEASONS
```
weather_step(ctx, dt):            day = ctx.time·days_per_cycle + 90; phase→season sin;
                                  T = base + amplitude·season + noise(±3°C);
                                  env.light = clip(0.4+0.6·season); env.water walk ±0.1
seasonal_dieback_step(ctx, dt):   if T < frost_threshold: kill FLOWER and herbaceous
                                  (w<0.2) APEX/FLORAL_AXIS tips (depth>0) via state.kill
spring_awakening_step(ctx, dt):   if T > bud_break_threshold and growth_factor>0.5:
                                  wake ~5%/step of mature (parent w>0.5) BUD_DORMANT →
                                  APEX with v=v_max, vigor=bud_activation_vigor
light_occlusion_pass(ctx, dt):    self-shadowing: 2D XY canopy grid (5cm); vulnerable
                                  nodes (APEX/BUD/FLOWER) below canopy max−0.2m in a
                                  column of density>3 are starved → state.kill
```
EnvironmentState (core/environment.py) carries temperature/light/water/nutrients and a
`growth_factor` = min(light, water, nutrients) (Liebig's law of the minimum).

### 8.5 collision.py [physics/collision.py] — GROUND & CLIMBING
```
floor_collision_pass(ctx, dt):    ground_z=0.01; nodes below are clamped to ground, bad
                                  (downward) headings reflected; when growth_habit=="climbing"
                                  headings are pulled inward + tangential toward the Z-axis
                                  (thigmotropism) before the floor clamp.
```

## 9. IO (io/snapshot.py)
```python
FIELD_ORDER = ("parent","position","orientation","radius","auxin","pin","vigor",
               "vegetativeness","structural_mass","internode_length","age","woodiness",
               "moment","deflection","depth","node_type")
def snapshot(state) -> dict[str, Any]   # {'n': int, field: live-slice COPY}
def save_npz(state, path: str|Path) -> None
def load_npz(path) -> dict[str, Any]    # returns same dict shape (not a live PlantState)
```

## 10. FACTORY (flora/factory.py) — composition root
```python
DEFAULT_PASSES = (weather_step, seasonal_dieback_step, light_occlusion_pass,
                  spring_awakening_step, vegetativeness_decay_step, auxin_transport_step,
                  vigor_allocation_step, budding_step, floral_transition_step,
                  elongation_step, update_radii, bending_pass, floor_collision_pass)
def create_default_engine(config: EngineConfig | None = None) -> SimulationEngine
```
NOTE ordering: environment weather runs FIRST so bio/physiology passes see current-season
temperature/light, with dieback and light-occlusion (starvation) applied before spring
awakening re-activates buds; floral_transition BEFORE elongation so new buds activate
next cycle; elongation LAST among bio so positions reflect this cycle's births; then
the pipe model updates radii on the settled topology, bending last, and floor_collision
clamps the final geometry to the ground plane.
(If during integration an ordering bug appears, fix HERE, not in passes.)

## 11. DETERMINISM & STYLE
- All randomness via ctx.rng (np.random.default_rng(seed)). No `random`, no global np.random.
- Public functions carry docstrings citing the model (Mitchison 1981; Borchert & Honda 1984;
  Prusinkiewicz & Lindenmayer 1990; West/Brown/Enquist pipe analogy).
- Type hints everywhere; no bare except; no `Any` leaks; numpydoc short style.
- Every module < 250 LOC pure logic; split if larger.
