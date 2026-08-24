"""Headless simulation engine: pass orchestration behind a minimal API.

The engine owns a :class:`SimulationContext` and executes an ordered sequence
of :data:`~flora.core.context.Pass` callables per :meth:`step`. It contains no
botany and no rendering -- clients (matplotlib viewer, OpenGL loop, Blender
addon) consume the returned :class:`PlantState` SoA or ``snapshot()`` dict.
"""

from __future__ import annotations

from typing import Any, Sequence

import numpy as np

from flora.core.config import EngineConfig
from flora.core.context import Pass, SimulationContext
from flora.core.state import PlantState, seed_root
from flora.io.snapshot import snapshot


class SimulationEngine:
    """Deterministic headless plant simulation."""

    def __init__(
        self,
        config: EngineConfig,
        passes: Sequence[Pass],
        seed: int | None = None,
    ) -> None:
        self.config = config
        self._passes = tuple(passes)
        effective_seed = seed if seed is not None else config.seed
        rng = np.random.default_rng(effective_seed)
        self.ctx = SimulationContext(state=seed_root(config), config=config, rng=rng)

    @property
    def state(self) -> PlantState:
        """Live SoA state view (treat as read-only between steps)."""
        return self.ctx.state

    @property
    def time(self) -> float:
        return self.ctx.time

    @property
    def step_index(self) -> int:
        return self.ctx.step_index

    def step(self, dt: float = 1.0) -> PlantState:
        """Advance the simulation by ``dt``, running every pass once, in order."""
        if dt <= 0.0:
            raise ValueError("dt must be positive")
        for sim_pass in self._passes:
            sim_pass(self.ctx, dt)
        self.ctx.time += dt
        self.ctx.step_index += 1
        return self.state

    def run(self, cycles: int, dt: float = 1.0) -> PlantState:
        """Convenience multi-step driver; returns final state."""
        for _ in range(cycles):
            self.step(dt)
        return self.state

    def snapshot(self) -> dict[str, Any]:
        """Plain-dict export of the live state for external clients."""
        return snapshot(self.state)
