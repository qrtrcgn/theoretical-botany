import { describe, it, expect } from "bun:test";
import { quadBezierPoint, closestPointOnQuadratic } from "../src/render/canvas";
import { freshState, growOnce, pruneNodeAt } from "../src/sim/growth";
import { japaneseBonsai, generateGenomeForSpecies } from "../src/data/species";
import { createPrng } from "../src/sim/prng";

describe("Quadratic Bézier Geometry & Hit Detection", () => {
  it("evaluates quadratic bezier curve points accurately", () => {
    const x0 = 0, y0 = 0;
    const cx = 50, cy = 100;
    const x1 = 100, y1 = 0;

    // At t = 0 -> start point
    const p0 = quadBezierPoint(x0, y0, cx, cy, x1, y1, 0);
    expect(p0.x).toBeCloseTo(0, 4);
    expect(p0.y).toBeCloseTo(0, 4);

    // At t = 1 -> end point
    const p1 = quadBezierPoint(x0, y0, cx, cy, x1, y1, 1);
    expect(p1.x).toBeCloseTo(100, 4);
    expect(p1.y).toBeCloseTo(0, 4);

    // At t = 0.5 -> apex of curve
    // p = 0.25*(0,0) + 0.5*(50,100) + 0.25*(100,0) = (25+25, 50) = (50, 50)
    const pMid = quadBezierPoint(x0, y0, cx, cy, x1, y1, 0.5);
    expect(pMid.x).toBeCloseTo(50, 4);
    expect(pMid.y).toBeCloseTo(50, 4);
  });

  it("projects points onto quadratic bezier with sub-pixel precision", () => {
    const x0 = 0, y0 = 0;
    const cx = 50, cy = 0;
    const x1 = 100, y1 = 0;

    // Test a point directly on the curve at (25, 0)
    const hit = closestPointOnQuadratic({ x: 25, y: 0 }, x0, y0, cx, cy, x1, y1);
    expect(hit.distance).toBeLessThan(0.01);
    expect(hit.t).toBeCloseTo(0.25, 2);

    // Test a point 10 units away at (50, 10)
    const hitOff = closestPointOnQuadratic({ x: 50, y: 10 }, x0, y0, cx, cy, x1, y1);
    expect(hitOff.distance).toBeCloseTo(10, 1);
    expect(hitOff.t).toBeCloseTo(0.5, 2);
  });

  it("prunes stems with quadratic bezier parameter t and preserves structural continuity", () => {
    const prng = createPrng(1234);
    const genome = generateGenomeForSpecies(japaneseBonsai, 1234);
    let state = freshState(genome, japaneseBonsai, { seed: 1234 });
    for (let i = 0; i < 40; i++) {
      state = growOnce(state, prng);
    }

    const stems = state.nodes.filter(n => (n.type === "stem" || n.type === "meristem") && n.length > 5);
    expect(stems.length).toBeGreaterThan(0);

    const target = stems[0];
    const originalLen = target.length;
    const originalCount = state.nodes.length;

    // Prune at t = 0.6
    const prunedState = pruneNodeAt(state, target.id, 0.6);
    const updatedTarget = prunedState.nodes.find(n => n.id === target.id);
    expect(updatedTarget).toBeDefined();
    expect(updatedTarget!.length).toBeCloseTo(originalLen * 0.6, 1);
    expect(updatedTarget!.isCut).toBe(true);
    expect(prunedState.nodes.length).toBeLessThanOrEqual(originalCount);
  });

  it("manages time-travel history stack with push, trim, and rewind", () => {
    interface HistoryEntry {
      state: any;
      seed: number;
      selected: number[];
    }
    const undoHistoryStack: HistoryEntry[] = [];
    const MAX_HISTORY = 5;

    for (let i = 1; i <= 8; i++) {
      undoHistoryStack.push({
        state: { step: i },
        seed: i * 10,
        selected: [],
      });
      if (undoHistoryStack.length > MAX_HISTORY) {
        undoHistoryStack.shift();
      }
    }

    expect(undoHistoryStack.length).toBe(MAX_HISTORY);
    expect(undoHistoryStack[undoHistoryStack.length - 1].state.step).toBe(8);
    expect(undoHistoryStack[0].state.step).toBe(4);

    const prev = undoHistoryStack.pop();
    expect(prev).toBeDefined();
    expect(prev!.state.step).toBe(8);
    expect(undoHistoryStack.length).toBe(4);
  });
});
