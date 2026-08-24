"""Matplotlib 3D viewer demonstrating complete decoupling from the simulation engine.

This viewer consumes ONLY public symbols from ``flora`` (engine, config, snapshot)
and renders plant SoA state matrices into a 3D matplotlib figure. Supports both
interactive window display and headless PNG snapshot rendering via the Agg backend.
"""

from __future__ import annotations

from pathlib import Path
import time

import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Line3DCollection
import numpy as np

from flora import EngineConfig, SimulationEngine, create_default_engine, snapshot


class PlantViewer3D:
    """Decoupled 3D matplotlib client for the Flora simulation engine."""

    def __init__(self, engine: SimulationEngine, title: str = "Flora Simulation Engine") -> None:
        self.engine = engine
        self.title = title
        self.fig = plt.figure(figsize=(10, 9))
        self.ax = self.fig.add_subplot(111, projection="3d")
        self._configure_axes()

    def _configure_axes(self) -> None:
        self.ax.set_facecolor("#1a1a2e")
        self.fig.patch.set_facecolor("#1a1a2e")
        self.ax.xaxis.set_pane_color((0.0, 0.0, 0.0, 0.0))
        self.ax.yaxis.set_pane_color((0.0, 0.0, 0.0, 0.0))
        self.ax.zaxis.set_pane_color((0.0, 0.0, 0.0, 0.0))
        self.ax.set_title(self.title, color="white", fontsize=14, fontweight="bold")
        self.ax.set_xlabel("X (m)", color="white")
        self.ax.set_ylabel("Y (m)", color="white")
        self.ax.set_zlabel("Z (m)", color="white")
        self.ax.tick_params(colors="white")

    def render_snapshot(self, snap: dict | None = None) -> None:
        """Draw current SoA snapshot into the 3D axes."""
        if snap is None:
            snap = self.engine.snapshot()

        self.ax.cla()
        self._configure_axes()

        n = int(snap["n"])
        if n == 0:
            plt.draw()
            return

        pos = snap["position"]
        parent = snap["parent"]
        radius = snap["radius"]
        node_type = snap["node_type"]
        woodiness = snap["woodiness"]

        segments: list[tuple[np.ndarray, np.ndarray]] = []
        colors: list[tuple[float, float, float, float]] = []

        # Color palette: herbaceous green, woody brown, flower red/pink
        herb_color = (0.15, 0.68, 0.38, 0.9)
        wood_color = (0.55, 0.27, 0.07, 0.95)
        flower_color = (0.91, 0.30, 0.23, 1.0)
        apex_color = (0.95, 0.61, 0.07, 1.0)

        flower_pts_x, flower_pts_y, flower_pts_z = [], [], []
        apex_pts_x, apex_pts_y, apex_pts_z = [], [], []

        for i in range(1, n):
            p = int(parent[i])
            if p < 0 or not np.isfinite(pos[i]).all() or not np.isfinite(pos[p]).all():
                continue
            
            start = pos[p]
            end = pos[i]
            segments.append((start, end))

            # Color by tissue type & woodiness
            w = float(woodiness[i])
            r, g, b, a = [
                wood_color[k] * w + herb_color[k] * (1.0 - w) for k in range(4)
            ]
            
            nt = int(node_type[i])
            if nt == 4:  # FLOWER
                r, g, b, a = flower_color
                flower_pts_x.append(end[0])
                flower_pts_y.append(end[1])
                flower_pts_z.append(end[2])
            elif nt == 1:  # APEX
                apex_pts_x.append(end[0])
                apex_pts_y.append(end[1])
                apex_pts_z.append(end[2])

            colors.append((r, g, b, a))

        if segments:
            # Line widths proportional to radius (scaled for visual clarity)
            widths = np.maximum(0.5, radius[1:n] * 150.0)
            lc = Line3DCollection(segments, colors=colors, linewidths=widths, capstyle="round")
            self.ax.add_collection3d(lc)

        if flower_pts_x:
            self.ax.scatter(flower_pts_x, flower_pts_y, flower_pts_z,
                            c="#e74c3c", s=60, marker="o", label="Flowers")
        if apex_pts_x:
            self.ax.scatter(apex_pts_x, apex_pts_y, apex_pts_z,
                            c="#f39c12", s=30, marker="^", label="Apices")

        # Auto-scale bounding box with equal aspect ratio perception
        all_pts = pos[:n]
        if all_pts.size > 0:
            max_range = np.ptp(all_pts, axis=0).max()
            if max_range < 0.1:
                max_range = 1.0
            mid = all_pts.mean(axis=0)
            self.ax.set_xlim(mid[0] - max_range/2, mid[0] + max_range/2)
            self.ax.set_ylim(mid[1] - max_range/2, mid[1] + max_range/2)
            self.ax.set_zlim(mid[2], mid[2] + max_range)

        self.ax.legend(loc="upper left", facecolor="#0f3460", edgecolor="none", labelcolor="white")

    def run_animation(self, cycles: int = 50, dt: float = 1.0, interval_sec: float = 0.05) -> None:
        """Run interactive simulation loop with live rendering."""
        plt.ion()
        self.fig.show()

        for c in range(cycles):
            self.engine.step(dt)
            snap = self.engine.snapshot()
            self.ax.set_title(
                f"{self.title} | Cycle {c+1}/{cycles} | Nodes: {snap['n']}",
                color="white", fontsize=12, fontweight="bold",
            )
            self.render_snapshot(snap)
            plt.pause(interval_sec)
            if not plt.fignum_exists(self.fig.number):
                break

        plt.ioff()
        plt.show()

    def save_snapshot_image(self, out_path: str | Path, cycles: int = 50, dt: float = 1.0) -> None:
        """Run simulation headlessly and save final frame to disk (Agg backend)."""
        for _ in range(cycles):
            self.engine.step(dt)
        self.render_snapshot()
        self.fig.savefig(out_path, dpi=200, bbox_inches="tight", facecolor=self.fig.get_facecolor())
        plt.close(self.fig)
        print(f"Saved plant visualization to {out_path}")
