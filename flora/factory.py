"""Composition root wiring biology and physics passes into a default pipeline.

This module is the ONLY place in ``flora`` that knows the full pass ordering.
The engine itself (``flora.core.engine``) is dependency-inverted: it accepts any
sequence of :data:`flora.core.context.Pass` callables and never imports
biology/physics directly, keeping the headless core pluggable.

Pipeline order rationale (see docs/CONTRACT.md §10):

1. ``vegetativeness_decay_step`` -- age the plant; floral axes lose v first.
2. ``auxin_transport_step``       -- Mitchison canalization ODEs (solve_ivp).
3. ``vigor_allocation_step``      -- Borchert-Honda resource partitioning.
4. ``budding_step``               -- lateral buds + activation + floral conversion.
5. ``floral_transition_step``     -- L-system inflorescence growth via L(v).
6. ``elongation_step``            -- apex extension; topology settles here.
7. ``update_radii``               -- pipe model over the settled topology.
8. ``bending_pass``               -- Euler-Bernoulli gravity response on final geometry.

If an integration-ordering defect ever appears, fix it HERE, not inside passes.
"""

from __future__ import annotations

from flora.core.config import EngineConfig
from flora.core.engine import SimulationEngine
from flora.biology.auxin import auxin_transport_step
from flora.biology.growth import budding_step, elongation_step
from flora.biology.inflorescence import (
    floral_transition_step,
    vegetativeness_decay_step,
)
from flora.biology.vigor import vigor_allocation_step
from flora.physics.environment import weather_step, seasonal_dieback_step, spring_awakening_step, light_occlusion_pass
from flora.physics.biomechanics import bending_pass
from flora.physics.pipe_model import update_radii
from flora.physics.collision import floor_collision_pass

__all__ = ["DEFAULT_PASSES", "create_default_engine"]

DEFAULT_PASSES = (
    weather_step,
    seasonal_dieback_step,
    light_occlusion_pass,
    spring_awakening_step,
    vegetativeness_decay_step,
    auxin_transport_step,
    vigor_allocation_step,
    budding_step,
    floral_transition_step,
    elongation_step,
    update_radii,
    bending_pass,
    floor_collision_pass,
)


def create_default_engine(config: EngineConfig | None = None) -> SimulationEngine:
    """Build a :class:`SimulationEngine` running the canonical botanical pipeline.

    Parameters
    ----------
    config:
        Full engine configuration. ``None`` constructs the documented defaults
        (see :class:`~flora.core.config.EngineConfig`).

    Returns
    -------
    SimulationEngine
        Headless engine exposing ``step(dt) -> PlantState`` and
        ``snapshot() -> dict``; safe to embed in any client (matplotlib viewer,
        OpenGL loop, Blender addon) without importing UI code anywhere in
        ``flora``.
    """
    return SimulationEngine(config if config is not None else EngineConfig(), DEFAULT_PASSES)
