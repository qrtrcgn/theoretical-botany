"""Batched quaternion algebra ([w, x, y, z] convention), pure NumPy.

Local frame convention across the engine: a node's heading is its local +Z axis
transformed by its orientation quaternion, i.e. ``quat_rotate(q, UP_VECTOR)``.
All functions accept broadcastable leading dimensions so whole populations
(thousands of nodes) rotate in single vectorized calls.
"""

from __future__ import annotations

import numpy as np

QUAT_IDENTITY = np.array([1.0, 0.0, 0.0, 0.0])
UP_VECTOR = np.array([0.0, 0.0, 1.0])
_EPS = 1e-12


def quat_normalize(q: np.ndarray) -> np.ndarray:
    """Return unit quaternions; zero-norm inputs map to identity."""
    q = np.asarray(q, dtype=np.float64)
    norm = np.linalg.norm(q, axis=-1, keepdims=True)
    safe = np.where(norm < _EPS, 1.0, norm)
    out = q / safe
    return np.where(norm < _EPS, QUAT_IDENTITY, out)


def quat_from_axis_angle(
    axis: np.ndarray, angle: np.ndarray
) -> np.ndarray:
    """Axis-angle (right-handed) to quaternion; broadcasts leading dims."""
    axis = np.asarray(axis, dtype=np.float64)
    angle = np.asarray(angle, dtype=np.float64)
    norm = np.linalg.norm(axis, axis=-1, keepdims=True)
    unit = axis / np.where(norm < _EPS, 1.0, norm)
    half = 0.5 * angle                       # leading dims only
    w = np.cos(half)
    xyz = unit * np.sin(half)[..., None]
    q = np.concatenate([w[..., None], xyz], axis=-1)
    degenerate = np.broadcast_to(norm[..., 0], angle.shape) < _EPS
    return np.where(degenerate[..., None], QUAT_IDENTITY, quat_normalize(q))


def quat_multiply(q1: np.ndarray, q2: np.ndarray) -> np.ndarray:
    """Hamilton product q1*q2; applying q2 first, then q1, in world frame."""
    q1 = np.asarray(q1, dtype=np.float64)
    q2 = np.asarray(q2, dtype=np.float64)
    w1, x1, y1, z1 = np.moveaxis(q1, -1, 0)
    w2, x2, y2, z2 = np.moveaxis(q2, -1, 0)
    return np.stack(
        [
            w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2,
            w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2,
            w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2,
            w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2,
        ],
        axis=-1,
    )


def quat_rotate(q: np.ndarray, v: np.ndarray) -> np.ndarray:
    """Rotate vectors ``v`` by quaternions ``q`` (optimized sandwich product)."""
    q = np.asarray(q, dtype=np.float64)
    v = np.asarray(v, dtype=np.float64)
    q_vec = q[..., 1:]
    q_w = q[..., :1]
    t = 2.0 * np.cross(q_vec, v)
    return v + q_w * t + np.cross(q_vec, t)


def rotate_toward(
    direction: np.ndarray, target: np.ndarray, max_angle: np.ndarray | float
) -> np.ndarray:
    """Delta quaternion rotating ``direction`` toward ``target``, angle-clamped.

    Returns the IDENTITY quaternion wherever either input is (near) zero or the
    angle budget is exhausted.
    """
    direction = np.asarray(direction, dtype=np.float64)
    target = np.asarray(target, dtype=np.float64)
    max_angle = np.asarray(max_angle, dtype=np.float64)

    dn = np.linalg.norm(direction, axis=-1, keepdims=True)
    tn = np.linalg.norm(target, axis=-1, keepdims=True)
    d_unit = direction / np.where(dn < _EPS, 1.0, dn)
    t_unit = target / np.where(tn < _EPS, 1.0, tn)

    dot = np.clip(np.sum(d_unit * t_unit, axis=-1), -1.0, 1.0)
    angle = np.arccos(dot)
    axis = np.cross(d_unit, t_unit)
    axis_norm = np.linalg.norm(axis, axis=-1, keepdims=True)

    applied = np.minimum(angle, max_angle)
    q = quat_from_axis_angle(np.where(axis_norm < _EPS, UP_VECTOR, axis), applied)
    degenerate = (dn[..., 0] < _EPS) | (tn[..., 0] < _EPS) | (angle < _EPS)
    return np.where(degenerate[..., None], QUAT_IDENTITY, q)


def random_unit_axes(n: int, rng: np.random.Generator) -> np.ndarray:
    """Draw ``n`` uniformly distributed unit vectors (Marsaglia method)."""
    while True:
        v = rng.uniform(-1.0, 1.0, size=(n, 3))
        norms = np.linalg.norm(v, axis=-1)
        good = norms > _EPS
        if good.all():
            return v / norms[:, None]
        v[good] /= norms[good][:, None]
        if good.any():
            # regenerate the rare degenerate draws
            bad = ~good
            fill = rng.uniform(-1.0, 1.0, size=(int(bad.sum()), 3))
            fill_norms = np.linalg.norm(fill, axis=-1, keepdims=True)
            fill = np.where(fill_norms < _EPS, UP_VECTOR, fill / np.where(fill_norms < _EPS, 1.0, fill_norms))
            v[bad] = fill
            return v
