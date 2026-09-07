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
    alive = state.alive[:n].astype(np.float64)
    is_apex = (state.node_type[:n] == int(APEX)).astype(np.float64) * alive

    km_a2 = phys.km_auxin**2
    km_pin = phys.km_pin
    pin_gain = phys.pin_feedback_gain
    pin_decay = phys.pin_decay
    auxin_decay = phys.auxin_decay
    root_sink = phys.root_sink_rate
    auxin_prod = phys.auxin_production * is_apex

    dydt = np.empty(2 * n, dtype=np.float64)

    def rhs(_t: float, y: np.ndarray) -> np.ndarray:
        conc = np.maximum(y[:n], 0.0) * alive
        pin = np.maximum(y[n:], 0.0) * alive
        c2 = conc**2
        efflux = pin * c2 / (km_a2 + c2)
        efflux[0] = root_sink * conc[0]
        
        influx = np.bincount(child_parents, weights=efflux[1:], minlength=n)
        
        dydt[:n] = auxin_prod + influx - efflux - auxin_decay * conc
        dydt[n:] = pin_gain * efflux / (km_pin + efflux) - pin_decay * pin
        dydt[n] = 0.0
        return dydt.copy()

    y0 = np.concatenate([state.auxin[:n], state.pin[:n]])
    try:
        sol = solve_ivp(
            rhs,
            (0.0, dt),
            y0,
            method="LSODA",
            rtol=phys.ode_rtol,
            atol=phys.ode_atol,
        )
        if not sol.success:
            raise RuntimeError(sol.message)
        y_final = sol.y[:, -1]
    except Exception:
        sol = solve_ivp(
            rhs,
            (0.0, dt),
            y0,
            method="RK45",
            rtol=max(phys.ode_rtol, 1e-3),
            atol=max(phys.ode_atol, 1e-3),
        )
        if sol.success:
            y_final = sol.y[:, -1]
        else:
            sub_dt = dt / 10.0
            y_curr = y0.copy()
            for _ in range(10):
                dy = rhs(0.0, y_curr)
                y_curr = np.maximum(y_curr + dy * sub_dt, 0.0)
            y_final = y_curr

    state.auxin[:n] = np.maximum(y_final[:n], 0.0) * alive
    state.pin[:n] = np.maximum(y_final[n:], 0.0) * alive
