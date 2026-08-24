"""Material laws: Young's modulus interpolation, section stiffness, mass.

All functions are array-in/array-out (SIMD-friendly, allocation-light) and
encode the two tissue extremes of the legacy monolith scaled to SI units:
herbaceous (soft, E=20 MPa class) versus woody (E=10 GPa class).
"""

from __future__ import annotations

import numpy as np

from flora.core.config import STRUCTURAL_TYPES, MechanicsConfig

_PI_4 = np.pi / 4.0


def young_modulus(woodiness: np.ndarray, cfg: MechanicsConfig) -> np.ndarray:
    """Linear wood-fraction interpolation of Young's modulus E [Pa]."""
    w = np.clip(np.asarray(woodiness, dtype=np.float64), 0.0, 1.0)
    return cfg.e_herbaceous + (cfg.e_wood - cfg.e_herbaceous) * w


def second_moment_area(radius: np.ndarray) -> np.ndarray:
    """Second moment of area of a solid circular section: ``I = pi r^4 / 4``.

    STRICT quartic scaling -- the biomechanical heart of the r^4 law.
    """
    r = np.maximum(np.asarray(radius, dtype=np.float64), 0.0)
    return _PI_4 * r**4


def density(woodiness: np.ndarray, cfg: MechanicsConfig) -> np.ndarray:
    """Linear wood-fraction interpolation of tissue density [kg/m^3]."""
    w = np.clip(np.asarray(woodiness, dtype=np.float64), 0.0, 1.0)
    return cfg.density_herbaceous + (cfg.density_wood - cfg.density_herbaceous) * w


def segment_mass(
    radius: np.ndarray,
    length: np.ndarray,
    woodiness: np.ndarray,
    cfg: MechanicsConfig,
) -> np.ndarray:
    """Cylindrical segment mass: ``rho(w) * pi r^2 L`` [kg]."""
    r = np.asarray(radius, dtype=np.float64)
    length_arr = np.broadcast_to(np.asarray(length, dtype=np.float64), r.shape)
    return density(woodiness, cfg) * np.pi * r**2 * length_arr


def mature_woodiness(
    woodiness: np.ndarray,
    has_children: np.ndarray,
    node_types: np.ndarray,
    dt: float,
    cfg: MechanicsConfig,
) -> np.ndarray:
    """Advance secondary-wood maturation one step.

    Load-bearing structural nodes (with descendants) lignify at full rate;
    terminal tips at half rate (they stay flexible longest, like real shoots).
    """
    w = np.clip(np.asarray(woodiness, dtype=np.float64), 0.0, 1.0)
    types_arr = np.asarray(node_types)
    structural = np.isin(types_arr, [int(t) for t in STRUCTURAL_TYPES])
    rate = dt / cfg.wood_maturation_cycles
    full_rate = structural & np.asarray(has_children, dtype=bool)
    half_rate = structural & ~np.asarray(has_children, dtype=bool)
    w = np.where(full_rate, w + rate, w)
    w = np.where(half_rate, w + 0.5 * rate, w)
    return np.clip(w, 0.0, 1.0)
