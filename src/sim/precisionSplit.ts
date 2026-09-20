import type { PlantState } from "./types";
import { pruneNodeAt } from "./growth";

function projectT(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 1e-8) return 1;
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  return Math.max(0, Math.min(1, t));
}

/**
 * Cut a branch at the click, using optional displayed segment ends
 * (wind/sag) so the stub matches what the user sees.
 */
export function precisionSplitAndPrune(
  state: PlantState,
  targetNodeId: number,
  clickPos: { x: number; y: number },
  displayedSegment?: { sx: number; sy: number; ex: number; ey: number }
): PlantState {
  const node = state.nodes.find((n) => n.id === targetNodeId);
  if (!node || (node.type !== "stem" && node.type !== "meristem")) {
    return state;
  }

  const start = displayedSegment
    ? { x: displayedSegment.sx, y: displayedSegment.sy }
    : { x: node.x, y: node.y };
  const end = displayedSegment
    ? { x: displayedSegment.ex, y: displayedSegment.ey }
    : {
        x: node.x + Math.cos(node.angle) * node.length,
        y: node.y + Math.sin(node.angle) * node.length,
      };

  const t = projectT(clickPos, start, end);
  return pruneNodeAt(state, targetNodeId, t);
}
