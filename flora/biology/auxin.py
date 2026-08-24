"""Auxin transport with canalization (Mitchison 1981).

Auxin is produced in active apices and pumped basipetally (shoot -> root)
through PIN-mediated saturating efflux pumps. The positive feedback

    flux up-regulates PIN  ->  more flux  ->  canalization

creates narrow high-flux strands that implement apical dominance: lateral
buds under a strong canal stay auxin-suppressed. The joint ODE system over
(auxin, PIN) is integrated per step with ``scipy.integrate.solve_ivp``
(method LSODA); its RHS uses only vectorized NumPy reductions.
"""

from __future__ import annotations

import numpy as np
from scipy.integrate import solve_ivp

from flora.core.config import APEX
from flora.core.context import SimulationContext


def auxin_transport_step(ctx: SimulationContext, dt: float = 1.0) -> None:
    """Advance auxin/PIN concentrations over ``dt`` via the Mitchison system."""
    state = ctx.state
    phys = ctx.config.physiology
    n = state.n
    if n < 2:
        return

    parent = state.parent[:n].astype(np.int64)
    child_parents = parent[1:]
    is_apex = (state.node_type[:n] == int(APEX)).astype(np.float64)

    km_a2 = phys.km_auxin**2

    def rhs(_t: float, y: np.ndarray) -> np.ndarray:
        conc = np.maximum(y[:n], 0.0)
        pin = np.maximum(y[n:], 0.0)
        efflux = pin * conc**2 / (km_a2 + conc**2)
        efflux[0] = phys.root_sink_rate * conc[0]
        influx = np.bincount(child_parents, weights=efflux[1:], minlength=n)
        d_conc = (
            phys.auxin_production * is_apex
            + influx
            - efflux
            - phys.auxin_decay * conc
        )
        d_pin = phys.pin_feedback_gain * efflux / (phys.km_pin + efflux) - phys.pin_decay * pin
        d_pin[0] = 0.0
        return np.concatenate([d_conc, d_pin])

    y0 = np.concatenate([state.auxin[:n], state.pin[:n]])
    sol = solve_ivp(
        rhs,
        (0.0, dt),
        y0,
        method="LSODA",
        rtol=phys.ode_rtol,
        atol=phys.ode_atol,
    )
    if not sol.success:
        raise RuntimeError(f"auxin ODE integration failed: {sol.message}")

    state.auxin[:n] = np.maximum(sol.y[:n, -1], 0.0)
    state.pin[:n] = np.maximum(sol.y[n:, -1], 0.0)
