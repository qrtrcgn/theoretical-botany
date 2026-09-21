import type { PlantState, PlantNode } from "../sim/types";
import { pruneNodeAt } from "./growth";
import type { StemTransform } from "../render/canvas";
import { quadBezierPoint } from "../render/canvas";

/**
 * Precision Pruning, Swipe-to-Slice & Defoliation Engine
 * 
 * Enables:
 * - Multi-branch blade stroke slicing across quadratic Bézier curves
 * - Selective leaf plucking / defoliation without harming structural wood
 * - Bonsai wire bending to guide branch orientation and curves
 */

export function lineSegmentsIntersect(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
  d: { x: number; y: number }
): boolean {
  const det = (b.x - a.x) * (d.y - c.y) - (d.x - c.x) * (b.y - a.y);
  if (Math.abs(det) < 1e-9) return false;
  const lambda = ((d.y - c.y) * (d.x - a.x) + (c.x - d.x) * (d.y - a.y)) / det;
  const gamma = ((a.y - b.y) * (d.x - a.x) + (b.x - a.x) * (d.y - a.y)) / det;
  return 0 <= lambda && lambda <= 1 && 0 <= gamma && gamma <= 1;
}

export function distToSegment(
  p: { x: number; y: number },
  v: { x: number; y: number },
  w: { x: number; y: number }
): { dist: number; t: number } {
  const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2;
  if (l2 < 1e-8) return { dist: Math.hypot(p.x - v.x, p.y - v.y), t: 0 };
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  const projX = v.x + t * (w.x - v.x);
  const projY = v.y + t * (w.y - v.y);
  return { dist: Math.hypot(p.x - projX, p.y - projY), t };
}

/**
 * Swipe-to-slice across curved branches using a blade stroke segment (p1 -> p2).
 * Slices through one or multiple branches intersecting the stroke.
 */
export function swipeSliceCurvedStems(
  state: PlantState,
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  stemTransforms: Map<number, StemTransform>
): { state: PlantState; cutCount: number; maxCutThickness: number } {
  let currentState = state;
  let cutCount = 0;
  let maxCutThickness = 1.0;

  const hits: Array<{ nodeId: number; t: number; thickness: number }> = [];

  for (const tr of stemTransforms.values()) {
    // Check if stem is already cut
    const node = currentState.nodes.find((n) => n.id === tr.nodeId);
    if (!node || node.isCut) continue;

    // Discretize quadratic bezier into 10 line segments and check intersection
    const steps = 10;
    let prevPt = { x: tr.startX, y: tr.startY };
    for (let i = 1; i <= steps; i++) {
      const curT = i / steps;
      const curPt = quadBezierPoint(tr.startX, tr.startY, tr.controlX, tr.controlY, tr.endX, tr.endY, curT);
      if (lineSegmentsIntersect(p1, p2, prevPt, curPt)) {
        const estT = (i - 0.5) / steps;
        hits.push({ nodeId: tr.nodeId, t: estT, thickness: tr.thickness });
        break;
      }
      prevPt = curPt;
    }
  }

  // Sort cuts from distal (higher id/depth) to proximal to preserve tree hierarchy during multi-cut
  hits.sort((a, b) => b.nodeId - a.nodeId);

  for (const hit of hits) {
    currentState = pruneNodeAt(currentState, hit.nodeId, hit.t);
    cutCount++;
    if (hit.thickness > maxCutThickness) {
      maxCutThickness = hit.thickness;
    }
  }

  return { state: currentState, cutCount, maxCutThickness };
}

/**
 * Defoliate leaves intersecting the blade stroke.
 */
export function pluckLeavesAlongSwipe(
  state: PlantState,
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  stemTransforms: Map<number, StemTransform>,
  threshold = 18
): { state: PlantState; pluckedCount: number } {
  const pluckedIds = new Set<number>();

  for (const n of state.nodes) {
    if (n.type !== "leaf" || n.fallState === "falling") continue;
    const parentTr = n.parentId !== null ? stemTransforms.get(n.parentId) : undefined;
    let leafX = n.x;
    let leafY = n.y;

    if (parentTr) {
      const attachT = n.attachT !== undefined ? n.attachT : 1.0;
      const pt = quadBezierPoint(parentTr.startX, parentTr.startY, parentTr.controlX, parentTr.controlY, parentTr.endX, parentTr.endY, attachT);
      leafX = pt.x;
      leafY = pt.y;
    }

    const { dist } = distToSegment({ x: leafX, y: leafY }, p1, p2);
    if (dist <= threshold) {
      pluckedIds.add(n.id);
    }
  }

  if (pluckedIds.size === 0) return { state, pluckedCount: 0 };

  const remainingNodes = state.nodes.filter((n) => !pluckedIds.has(n.id));
  return {
    state: {
      ...state,
      nodes: remainingNodes,
    },
    pluckedCount: pluckedIds.size,
  };
}

export function getNodeThickness(state: PlantState, nodeId: number): number {
  const node = state.nodes.find((n) => n.id === nodeId);
  if (!node) return 1.2;
  let descendantStems = 0;
  const stack = [nodeId];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    for (const n of state.nodes) {
      if (n.parentId === cur) {
        if (n.type === "stem" || n.type === "meristem") {
          descendantStems++;
        }
        stack.push(n.id);
      }
    }
  }
  const wood = Math.min(1.0, (node.age ?? 0) / 90);
  const baseT = 1.15 + Math.pow(descendantStems, 0.42) * 0.75 + wood * 0.35;
  const flare = node.depth === 0 ? 3.8 : node.depth === 1 ? 2.0 : 0;
  return Math.max(1.1, baseT + flare);
}

export interface WireBendInfo {
  bent: boolean;
  strain: number;
  flakingBark: boolean;
  snapped: boolean;
  nodeId: number;
  thickness: number;
}

/**
 * Bonsai Training Wire: Bends internodal branch wood according to physical elasticity and thickness.
 * Joint origins remain rigidly anchored. Approaching stress limits causes bark to flake off
 * on the outer tension side; exceeding the threshold snaps the branch.
 */
export function bendStemWithWire(
  state: PlantState,
  targetNodeId: number,
  deltaBend: number,
  stemTransforms?: Map<number, StemTransform>
): PlantState & { bendInfo: WireBendInfo } {
  const targetNode = state.nodes.find((n) => n.id === targetNodeId);
  if (!targetNode || (targetNode.type !== "stem" && targetNode.type !== "meristem") || targetNode.isCut || targetNode.isJin) {
    return Object.assign({ ...state }, {
      bendInfo: {
        bent: false,
        strain: 0,
        flakingBark: false,
        snapped: false,
        nodeId: targetNodeId,
        thickness: 1.5,
      },
    });
  }

  const tr = stemTransforms?.get(targetNodeId);
  const thickness = tr?.thickness ?? getNodeThickness(state, targetNodeId);

  // Maximum bending threshold inversely related to branch thickness
  const maxBend = 1.45 / Math.pow(thickness, 0.95);

  const prevBend = targetNode.wireCurvature ?? targetNode.wireAngleOffset ?? 0;
  const newBend = prevBend + deltaBend;
  const strain = Math.abs(newBend) / maxBend;

  // Case 1: Catastrophic Fracture (strain >= 1.0)
  if (strain >= 1.0) {
    const breakAngle = targetNode.angle + Math.sign(newBend) * maxBend * 0.75;
    const breakSplinters = [
      0.8 + Math.random() * 0.4,
      0.5 + Math.random() * 0.3,
      0.9 + Math.random() * 0.5,
      0.4 + Math.random() * 0.4,
      0.7 + Math.random() * 0.3,
    ];

    const toRemove = new Set<number>();
    function findDescendants(id: number): void {
      for (const n of state.nodes) {
        if (n.parentId === id && !toRemove.has(n.id)) {
          toRemove.add(n.id);
          findDescendants(n.id);
        }
      }
    }
    for (const n of state.nodes) {
      if (n.parentId === targetNodeId) {
        toRemove.add(n.id);
        findDescendants(n.id);
      }
    }

    const sapDrops = [...(state.sapDrops || [])];
    const endX = tr?.endX ?? (targetNode.x + Math.cos(targetNode.angle) * targetNode.length * 0.6);
    const endY = tr?.endY ?? (targetNode.y + Math.sin(targetNode.angle) * targetNode.length * 0.6);
    for (let i = 0; i < 4; i++) {
      sapDrops.push({
        x: endX + (Math.random() - 0.5) * thickness,
        y: endY + (Math.random() - 0.5) * thickness,
        size: 1.5 + Math.random() * 2.0,
        alpha: 0.9,
        vy: 4 + Math.random() * 6,
      });
    }

    const updatedResources = {
      energy: Math.max(0, (state.resources?.energy ?? 50) - thickness * 5.0),
      water: Math.max(0, (state.resources?.water ?? 60) - thickness * 6.5),
      structural: Math.max(0, (state.resources?.structural ?? 30) - thickness * 4.0),
    };

    const remainingNodes = state.nodes
      .filter((n) => !toRemove.has(n.id))
      .map((n) => {
        if (n.id === targetNodeId) {
          return {
            ...n,
            isCut: true,
            isBroken: true,
            terminal: false,
            v: 0,
            hasWire: true,
            wireCurvature: Math.sign(newBend) * maxBend,
            wireAngleOffset: Math.sign(newBend) * maxBend,
            breakAngle,
            breakSplinters,
            length: Math.max(0.4, n.length * 0.55),
            targetLength: Math.max(0.4, n.length * 0.55),
          };
        }
        return n;
      });

    const nextState: PlantState = {
      ...state,
      nodes: remainingNodes,
      resources: updatedResources,
      sapDrops,
    };

    return Object.assign(nextState, {
      bendInfo: {
        bent: true,
        strain,
        flakingBark: false,
        snapped: true,
        nodeId: targetNodeId,
        thickness,
      },
    });
  }

  // Case 2: Warning Zone (0.70 <= strain < 1.0) — Bark peeling / flaking!
  const flakingBark = strain >= 0.70;
  const barkFracture = flakingBark ? (strain - 0.70) / 0.30 : 0;

  const barkFlakes = [...(state.barkFlakes || [])];
  if (flakingBark && Math.random() < 0.45) {
    const tensionSide = newBend > 0 ? -1 : 1;
    const midX = tr?.controlX ?? (targetNode.x + Math.cos(targetNode.angle) * targetNode.length * 0.5);
    const midY = tr?.controlY ?? (targetNode.y + Math.sin(targetNode.angle) * targetNode.length * 0.5);
    const normalAngle = targetNode.angle + (tensionSide * Math.PI) / 2;

    barkFlakes.push({
      x: midX + Math.cos(normalAngle) * (thickness * 0.6),
      y: midY + Math.sin(normalAngle) * (thickness * 0.6),
      vx: Math.cos(normalAngle) * (18 + Math.random() * 24),
      vy: Math.sin(normalAngle) * (18 + Math.random() * 24) - 12,
      rot: Math.random() * Math.PI * 2,
      size: 1.8 + Math.random() * 2.2,
      alpha: 1.0,
    });
  }

  const updatedNodes = state.nodes.map((n) => {
    if (n.id !== targetNodeId) return n;
    return {
      ...n,
      hasWire: true,
      wireAge: n.hasWire ? (n.wireAge ?? 0) : 0,
      wireCurvature: newBend,
      wireAngleOffset: newBend,
      barkFracture,
    };
  });

  const nextState: PlantState = {
    ...state,
    nodes: updatedNodes,
    barkFlakes,
  };

  return Object.assign(nextState, {
    bendInfo: {
      bent: true,
      strain,
      flakingBark,
      snapped: false,
      nodeId: targetNodeId,
      thickness,
    },
  });
}

export interface WireRemovalInfo {
  removed: boolean;
  springback: number;
  lignification: number;
  nodeId: number;
  hadWireBite: boolean;
}

/**
 * Removes bonsai wire from a branch (Harigane-hazushi / 針金外し).
 * If removed before secondary wood lignification completes (~25 steps),
 * the branch springs back (Modori / 戻り) proportionally towards its unbent shape.
 * If wire was left on past the bite threshold (>35 steps), permanent wire scars remain.
 */
export function removeWire(
  state: PlantState,
  targetNodeId: number
): { state: PlantState; info: WireRemovalInfo } {
  const targetNode = state.nodes.find((n) => n.id === targetNodeId);
  if (!targetNode || !targetNode.hasWire) {
    return {
      state,
      info: {
        removed: false,
        springback: 0,
        lignification: 1,
        nodeId: targetNodeId,
        hadWireBite: false,
      },
    };
  }

  const wireAge = targetNode.wireAge ?? 0;
  // Lignification sets over ~25 growth steps
  const lignification = Math.min(1.0, wireAge / 25);
  // Modori: springback fraction is inversely proportional to lignification
  const springback = 1.0 - lignification;
  const currentBend = targetNode.wireCurvature ?? targetNode.wireAngleOffset ?? 0;
  const remainingBend = currentBend * (1.0 - springback);
  const hadWireBite = Boolean(targetNode.hasWireBite);

  const updatedNodes = state.nodes.map((n) => {
    if (n.id !== targetNodeId) return n;
    return {
      ...n,
      hasWire: false,
      wireAge: 0,
      wireCurvature: remainingBend,
      wireAngleOffset: remainingBend,
      barkFracture: Math.max(0, (n.barkFracture ?? 0) * 0.5),
    };
  });

  return {
    state: {
      ...state,
      nodes: updatedNodes,
    },
    info: {
      removed: true,
      springback,
      lignification,
      nodeId: targetNodeId,
      hadWireBite,
    },
  };
}

// Retain legacy helper for backwards compatibility
export function precisionCutAtSegment(state: PlantState, p1: { x: number; y: number }, p2: { x: number; y: number }): PlantState {
  const dummyMap = new Map<number, StemTransform>();
  for (const n of state.nodes) {
    if (n.type === "stem" || n.type === "meristem") {
      const ex = n.x + Math.cos(n.angle) * n.length;
      const ey = n.y + Math.sin(n.angle) * n.length;
      dummyMap.set(n.id, {
        nodeId: n.id,
        startX: n.x,
        startY: n.y,
        endX: ex,
        endY: ey,
        controlX: (n.x + ex) / 2,
        controlY: (n.y + ey) / 2,
        startAngle: n.angle,
        renderAngle: n.angle,
        thickness: 2.0,
      });
    }
  }
  const result = swipeSliceCurvedStems(state, p1, p2, dummyMap);
  return result.state;
}

/**
 * Carves a branch into authentic bonsai deadwood (Jin / Shari).
 * Recursively converts the target branch AND all its distal sub-branches
 * into weathered bleached alpine heartwood, shedding all attached foliage.
 */
export function carveBranchToJin(
  state: PlantState,
  targetNodeId: number
): { state: PlantState; carved: boolean; thickness: number } {
  const targetNode = state.nodes.find((n) => n.id === targetNodeId);
  if (!targetNode || (targetNode.type !== "stem" && targetNode.type !== "meristem")) {
    return { state, carved: false, thickness: 1.0 };
  }

  // Collect target node AND all distal descendants recursively
  const subtreeIds = new Set<number>([targetNodeId]);
  let added = true;
  while (added) {
    added = false;
    for (const n of state.nodes) {
      if (n.parentId !== null && subtreeIds.has(n.parentId) && !subtreeIds.has(n.id)) {
        subtreeIds.add(n.id);
        added = true;
      }
    }
  }

  // Remove all attached foliage (leaves, flowers, buds) anywhere in the subtree
  // and mark all stems/meristems in the subtree as sculpted deadwood Jin
  const updatedNodes = state.nodes
    .filter((n) => !(subtreeIds.has(n.id) && (n.type === "leaf" || n.type === "flower" || n.type === "bud")))
    .map((n) => {
      if (subtreeIds.has(n.id)) {
        return {
          ...n,
          isJin: true,
          terminal: false,
          hasWire: false,
          budState: "senescent" as const,
        };
      }
      return n;
    });

  // Spawn wood shavings flying off
  const woodShavings = [...(state.woodShavings || [])];
  for (let i = 0; i < 6; i++) {
    woodShavings.push({
      x: targetNode.x + (Math.random() - 0.5) * 12,
      y: targetNode.y + (Math.random() - 0.5) * 12,
      vx: (Math.random() - 0.5) * 45,
      vy: -15 - Math.random() * 30,
      rot: Math.random() * Math.PI * 2,
      size: 2.2 + Math.random() * 2.8,
      alpha: 1.0,
    });
  }

  return {
    state: {
      ...state,
      nodes: updatedNodes,
      woodShavings,
    },
    carved: true,
    thickness: 2.5,
  };
}

/**
 * Swipe-to-carve across branches with the Jin deadwood chisel.
 */
export function swipeCarveCurvedStems(
  state: PlantState,
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  stemTransforms: Map<number, StemTransform>
): { state: PlantState; carvedCount: number; maxThickness: number } {
  let currentState = state;
  let carvedCount = 0;
  let maxThickness = 1.0;

  const hits: Array<{ nodeId: number; thickness: number }> = [];

  for (const tr of stemTransforms.values()) {
    const node = currentState.nodes.find((n) => n.id === tr.nodeId);
    if (!node || node.isCut || node.isJin || (node.type !== "stem" && node.type !== "meristem")) continue;

    const steps = 10;
    let prevPt = { x: tr.startX, y: tr.startY };
    for (let i = 1; i <= steps; i++) {
      const curT = i / steps;
      const curPt = quadBezierPoint(tr.startX, tr.startY, tr.controlX, tr.controlY, tr.endX, tr.endY, curT);
      if (lineSegmentsIntersect(p1, p2, prevPt, curPt)) {
        hits.push({ nodeId: tr.nodeId, thickness: tr.thickness });
        break;
      }
      prevPt = curPt;
    }
  }

  hits.sort((a, b) => b.nodeId - a.nodeId);

  for (const hit of hits) {
    const res = carveBranchToJin(currentState, hit.nodeId);
    if (res.carved) {
      currentState = res.state;
      carvedCount++;
      if (res.thickness > maxThickness) {
        maxThickness = res.thickness;
      }
    }
  }

  return { state: currentState, carvedCount, maxThickness };
}
