with open("flora/core/context.py", "r") as f:
    context = f.read()

context = context.replace("from typing import TYPE_CHECKING, Any, Callable", "from typing import TYPE_CHECKING, Any, Callable\nfrom flora.core.environment import EnvironmentState")
context = context.replace("cache: dict[str, Any] = field(default_factory=dict)", "cache: dict[str, Any] = field(default_factory=dict)\n    env: EnvironmentState = field(default_factory=EnvironmentState)")
with open("flora/core/context.py", "w") as f:
    f.write(context)
