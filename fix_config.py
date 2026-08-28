with open("flora/core/config.py", "r") as f:
    content = f.read()

import re

# Remove the bad EnvironmentConfig if it exists
if "@dataclass(frozen=True)\nclass EnvironmentConfig:" in content:
    # It was injected. Let's just restore from git and do it properly.
    pass

