import type { PlantState, PlantNode } from "../sim/types";

/**
 * Precision Pruning & Defoliation Engine
 * Enables exact line-segment cutting (multi-branch slicing) and individual leaf plucking (defoliation).
 */

export function precisionCutAtSegment(state: PlantState, p1: { x: number; y: number }, p2: { x: number; y: number }): PlantState {
  // Find nodes intersecting or close to the cut line segment (p1 -> p2)
  const survivingNodes: PlantNode[] = [];
  const cutNodeIds = new Set<number>();

  // First pass: identify nodes cut by the line segment
  for (const n of state.nodes) {
    if (n.type !== "stem" && n.type !== "meristem") {
      survivingNodes.push(n);
      continue;
    }

    const ex = n.x + Math.cos(n.angle) * n.length;
    const ey = n.y + Math.sin(n.angle) * n.length;

    if (lineSegmentsIntersect(p1, p2, { x: n.x, y: n.y }, { x: ex, y: ey })) {
      cutNodeIds.add(n.id);
    } else {
      survivingNodes.push(n);
    }
  }

  // Second pass: remove all descendants of cut nodes
  const finalNodes = survivingNodes.filter(n => {
    let curr: number | null = n.parentId;
    while (curr !== null) {
      if (cutNodeIds.has(curr)) return false;
      const parentNode = state.nodes.find(node => node.id === curr);
      curr = parentNode ? parentNode.parentId : null;
    }
    return true;
  });

  return {
    ...state,
    nodes: finalNodes,
    cutAnimTime: 1.0,
  };
}

export function pluckLeafAtPosition(state: PlantState, pos: { x: number; y: number }, threshold = 15): PlantState {
  // Remove leaves close to the click/pluck coordinate
  const updatedNodes = state.nodes.filter(n => {
    if (n.type !== "leaf") return true;
    const dist = Math.hypot(n.x - pos.x, n.y - pos.y);
    return dist > threshold;
  });

  return {
    ...state,
    nodes: updatedNodes,
  };
}

function lineSegmentsIntersect(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
  d: { x: number; y: number }
): boolean {
  const det = (b.x - a.x) * (d.y - c.y) - (d.x - c.x) * (b.y - a.y);
  if (det === 0) return false;
  const lambda = ((d.y - c.y) * (d.x - a.x) + (c.x - d.x) * (d.y - a.y)) / det;
  const gamma = ((a.y - b.y) * (d.x - a.x) + (b.x - a.x) * (d.y - a.y)) / det;
  return (0 <= lambda && lambda <= 1) && (0 <= gamma && gamma <= 1);
}
