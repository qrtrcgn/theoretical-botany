"""SimulationContext: everything a pass may touch, nothing more.

Passes are pure functions of ``(ctx, dt) -> None`` mutating ``ctx.state``.
Determinism flows exclusively through ``ctx.rng``; ``ctx.cache`` carries
per-step scratch data (e.g. newly created internodes) that passes negotiate
among themselves without coupling their imports.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Callable
from flora.core.environment import EnvironmentState

import numpy as np

if TYPE_CHECKING:  # pragma: no cover - import cycle guard for type checkers only
    from flora.core.config import EngineConfig
    from flora.core.state import PlantState


@dataclass
class SimulationContext:
    """Mutable simulation carrier handed to every pass invocation."""

    state: "PlantState"
    config: "EngineConfig"
    rng: np.random.Generator
    time: float = 0.0
    step_index: int = 0
    cache: dict[str, Any] = field(default_factory=dict)
    env: EnvironmentState = field(default_factory=EnvironmentState)


#: A pass mutates ctx.state in place. dt is the simulation-cycle delta.
Pass = Callable[[SimulationContext, float], None]
