"""Environmental state and config for multi-year seasonal logic."""
from dataclasses import dataclass
import numpy as np

@dataclass
class EnvironmentState:
    temperature: float = 15.0       # °C
    light: float = 1.0              # [0, 1]
    water: float = 1.0              # [0, 1]
    nutrients: float = 1.0          # [0, 1]
    
    @property
    def growth_factor(self) -> float:
        # Liebig's Law of the Minimum
        return min(self.light, self.water, self.nutrients)

