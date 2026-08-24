"""Physics passes: pipe-model thickness and Euler-Bernoulli bending."""

from flora.physics.biomechanics import bending_pass
from flora.physics.materials import (
    density,
    mature_woodiness,
    second_moment_area,
    segment_mass,
    young_modulus,
)
from flora.physics.pipe_model import update_radii

__all__ = [
    "bending_pass",
    "density",
    "mature_woodiness",
    "second_moment_area",
    "segment_mass",
    "update_radii",
    "young_modulus",
]
