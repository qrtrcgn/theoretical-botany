"""Frozen configuration layer for the Flora simulation engine.

All quantitative botany lives here: morphology, physiology (auxin/vigor),
mechanics (Euler-Bernoulli + Pipe Model) and inflorescence grammar parameters.
Instances are immutable; passes receive them read-only via SimulationContext.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import IntEnum


class NodeType(IntEnum):
    """Discrete organ types carried per node in the SoA ``node_type`` field."""

    INTERNODE = 0      # structural stem segment
    APEX = 1           # active shoot apical meristem
    BUD_DORMANT = 2    # lateral bud awaiting activation
    FLORAL_AXIS = 3    # inflorescence stalk internode
    FLOWER = 4         # terminal flower (mass carrier, zero length)
    LEAF = 5           # leaf (mass carrier, zero length)


INTERNODE = NodeType.INTERNODE
APEX = NodeType.APEX
BUD_DORMANT = NodeType.BUD_DORMANT
FLORAL_AXIS = NodeType.FLORAL_AXIS
FLOWER = NodeType.FLOWER
LEAF = NodeType.LEAF

STRUCTURAL_TYPES = frozenset({NodeType.INTERNODE, NodeType.APEX, NodeType.FLORAL_AXIS})

_VALID_PHYLLOTAXIS = frozenset({"alternate", "opposite", "whorled"})
_VALID_INFLORESCENCE = frozenset({"single", "raceme", "panicle", "cyme"})
_VALID_HABIT = frozenset({"monopodial", "sympodial", "climbing"})


@dataclass(frozen=True)
class MorphologyConfig:
    """Geometric growth rules (angles, lengths, budgets)."""

    branch_angle: float = 0.7                   # rad (~40 deg), lateral off parent heading
    phyllotaxis_divergence: float = 2.399963229  # golden angle, rad (alternate mode)
    phyllotaxis_mode: str = "alternate"          # alternate | opposite | whorled
    internode_length_max: float = 0.05           # m
    length_depth_decay: float = 0.9              # L *= decay**depth
    radial_jitter: float = 0.10                  # +/- rad heading jitter per extension
    tip_radius_min: float = 0.0015               # m
    leaf_mass: float = 0.010                     # kg per LEAF node
    flower_mass: float = 0.005                   # kg per FLOWER node
    max_nodes_soft: int = 20000                  # soft budget; passes stop spawning beyond

    def __post_init__(self) -> None:
        if self.phyllotaxis_mode not in _VALID_PHYLLOTAXIS:
            raise ValueError(f"phyllotaxis_mode must be one of {_VALID_PHYLLOTAXIS}")
        if not 0.0 < self.length_depth_decay <= 1.0:
            raise ValueError("length_depth_decay must lie in (0, 1]")
        if self.internode_length_max <= 0.0:
            raise ValueError("internode_length_max must be positive")
        if self.tip_radius_min <= 0.0:
            raise ValueError("tip_radius_min must be positive")
        if self.max_nodes_soft < 1:
            raise ValueError("max_nodes_soft must be >= 1")


@dataclass(frozen=True)
class PhysiologyConfig:
    """Auxin transport (Mitchison canalization) and vigor partitioning rates."""

    auxin_production: float = 1.0        # P at each active APEX
    auxin_decay: float = 0.15            # mu_A
    pin_baseline: float = 0.05
    pin_decay: float = 0.05              # mu_T
    pin_feedback_gain: float = 1.2       # epsilon (canalization positive feedback)
    km_auxin: float = 0.5                # K_a saturation of pump flux
    km_pin: float = 0.5                  # K_t saturation of PIN upregulation
    root_sink_rate: float = 2.0          # efflux removal at the root node
    ode_rtol: float = 1e-6
    ode_atol: float = 1e-9
    vigor_total: float = 100.0           # R: total plant resource pool per cycle
    vigor_maintenance: float = 0.20      # relaxed-out fraction per cycle
    vigor_tau: float = 1.0               # relaxation time constant (cycles)
    bud_activation_vigor: float = 4.0    # V required to activate a dormant bud
    auxin_suppression: float = 0.60      # local auxin above this suppresses laterals
    apex_vigor_threshold: float = 1.5    # V required for apex extension

    def __post_init__(self) -> None:
        if self.auxin_production < 0.0 or self.auxin_decay < 0.0:
            raise ValueError("auxin_production and auxin_decay must be non-negative")
        if self.km_auxin <= 0.0 or self.km_pin <= 0.0:
            raise ValueError("Michaelis constants must be positive")
        if self.vigor_tau <= 0.0:
            raise ValueError("vigor_tau must be positive")
        if self.ode_rtol <= 0.0 or self.ode_atol <= 0.0:
            raise ValueError("ODE tolerances must be positive")


@dataclass(frozen=True)
class MechanicsConfig:
    """Elastic and material constants for the Euler-Bernoulli / pipe-model passes."""

    e_herbaceous: float = 2.0e7          # Pa (herbaceous tissue flexure stiffness)
    e_wood: float = 1.0e10               # Pa (secondary wood)
    density_herbaceous: float = 700.0    # kg/m^3
    density_wood: float = 600.0          # kg/m^3
    gravity: float = 9.81                # m/s^2
    pipe_exponent_wood: float = 2.5      # n: mechanical taper (Da Vinci rule)
    pipe_exponent_herb: float = 2.0      # n: area-preserving (West et al. limit)
    max_bend_per_step: float = 0.35      # rad clamp per segment per step
    bending_damping: float = 1.0         # <1 softens multi-cycle settling; 1.0 keeps
                                         # the single-pass linearized solve exact
    wood_maturation_cycles: float = 8.0  # cycles for woodiness -> 1 on load-bearing nodes

    def __post_init__(self) -> None:
        if self.e_herbaceous <= 0.0 or self.e_wood < self.e_herbaceous:
            raise ValueError("require 0 < e_herbaceous <= e_wood")
        if self.pipe_exponent_wood < 1.0 or self.pipe_exponent_herb < 1.0:
            raise ValueError("pipe exponents must be >= 1")
        if not 0.0 < self.bending_damping <= 1.0:
            raise ValueError("bending_damping must lie in (0, 1]")
        if self.gravity < 0.0:
            raise ValueError("gravity must be non-negative")


@dataclass(frozen=True)
class InflorescenceConfig:
    """Vegetativeness-driven floral program (Prusinkiewicz-style grammars)."""

    v_max: float = 1.0
    v_decay: float = 0.25                # delta per floral cycle
    compression_p: float = 1.5           # p in L(v) = L_max * (v/v_max)^p
    floral_length_frac: float = 0.8      # L_floral_max = frac * internode_length_max
    floral_trigger_v: float = 0.30       # apex with v <= trigger enters floral program
    sympodial_term_prob: float = 0.8     # sympodial apex termination chance per cycle
    monopodial_term_prob: float = 0.30
    panicle_branch_v_penalty: float = 0.40
    inflorescence_type: str = "raceme"   # single | raceme | panicle | cyme
    growth_habit: str = "monopodial"     # monopodial | sympodial

    def __post_init__(self) -> None:
        if self.v_max <= 0.0:
            raise ValueError("v_max must be positive")
        if self.v_decay < 0.0 or self.compression_p < 0.0:
            raise ValueError("v_decay and compression_p must be non-negative")
        if self.inflorescence_type not in _VALID_INFLORESCENCE:
            raise ValueError(f"inflorescence_type must be one of {_VALID_INFLORESCENCE}")
        if self.growth_habit not in _VALID_HABIT:
            raise ValueError(f"growth_habit must be one of {_VALID_HABIT}")



@dataclass(frozen=True)
class EnvironmentConfig:
    latitude: float = 45.0
    base_temp: float = 10.0
    temp_amplitude: float = 20.0
    frost_threshold: float = 0.0
    bud_break_threshold: float = 12.0
    days_per_cycle: float = 5.0

@dataclass(frozen=True)
class EngineConfig:
    """Top-level engine configuration aggregating all sub-domains."""

    capacity: int = 1024                 # initial SoA capacity (grows x2)
    seed: int | None = None
    morphology: MorphologyConfig = field(default_factory=MorphologyConfig)
    physiology: PhysiologyConfig = field(default_factory=PhysiologyConfig)
    mechanics: MechanicsConfig = field(default_factory=MechanicsConfig)
    inflorescence: InflorescenceConfig = field(default_factory=InflorescenceConfig)
    environment: EnvironmentConfig = field(default_factory=EnvironmentConfig)

    def __post_init__(self) -> None:
        if self.capacity < 1:
            raise ValueError("capacity must be >= 1")
