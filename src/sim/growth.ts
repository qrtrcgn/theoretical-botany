/**
 * ZenPlant - Developmental Growth Simulation Engine
 * 
 * Pure functional growth model based on meristems/tips with rule-based branching.
 * Features:
 * - Meristem elongation with vigor-driven growth rates
 * - Phototropism: bending towards light direction
 * - Gravitropism: downward bias from gravity
 * - Seasonal effects (dormancy, leaf drop, resource cycles)
 * - Resource production/consumption by leaves
 * - Branching rules based on angle and vigor
 * - Dormant bud activation
 * - Subtree pruning with latent bud awakening
 */

import { createPrng, type Prng } from "./prng";
import type {
  Genome,
  PlantNode,
  PlantState,
  SpeciesDef,
} from "./types";

export function normalizeAngle(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

const DEFAULT_CYCLE_LENGTH = 250;
const MAX_TOTAL_NODES = 2000; // Reduced from 3500 for better performance
const BUDBREAK_WINDOW_END = 110;
const BUDBREAK_CHANCE_PER_STEP = 0.006;
const EPICORMIC_MIN_AGE = 45;
const EPICORMIC_CHANCE_PER_STEP = 0.0015;
const LEAF_FALL_WINDOW: [number, number] = [125, 190];
const FLOWER_FALL_WINDOW: [number, number] = [95, 155];
const MAX_FALL_STEPS = 150;

export function growOnce(
  state: PlantState,
  prng: ReturnType<typeof createPrng>
): PlantState {
  const newState: PlantState = {
    ...state,
    step: state.step + 1,
    nodes: state.nodes.map((n) => ({ ...n })),
  };

  const season = newState.step % DEFAULT_CYCLE_LENGTH;

  let lightAngle: number;
  if (season < 100) {
    lightAngle = 0.3 + 0.5 * (season / 100);
  } else if (season < 140) {
    lightAngle = 0.65;
  } else if (season < 180) {
    lightAngle = 0.8 - 0.5 * ((season - 140) / 40);
  } else {
    lightAngle = 0.15;
  }
  newState.environment = {
    ...newState.environment,
    lightDirection: [Math.cos(lightAngle), Math.sin(lightAngle)],
  };

  let seasonFactor = 1.0;
  if (season >= 180) {
    seasonFactor = 0.3;
  } else if (season < 100) {
    seasonFactor = 0.3 + 0.7 * (season / 100);
  } else if (season >= 140) {
    seasonFactor = 1.0 - 0.7 * ((season - 140) / 40);
  }
  const turnAmount = 0.05 * seasonFactor * (1 + newState.genome.vineMode * 2);

  const currentWater = newState.resources?.water ?? 0;
  const droughtFactor = currentWater < 30 ? 0.4 + 0.6 * (currentWater / 30) : 1.0;

  updateFallingDebris(newState);
  triggerAbscissionIfDue(newState, season, prng);

  if (season === 0) {
    budActivation(newState, prng);
  }

  if (season < BUDBREAK_WINDOW_END) {
    budbreakStep(newState, prng);
    epicormicStep(newState, prng);
  }

  if (season < 140 && newState.step % 5 === 0) {
    spawnLeavesOnBranches(newState, prng);
  }

  if (season === 140) {
    senesceLeaves(newState);
  }

  if (season === Math.floor(DEFAULT_CYCLE_LENGTH * 0.9)) {
    newState.resources = { energy: 0, water: 0, structural: 0 };
  }

  newState.nodes.forEach((n) => {
    if (n.age !== undefined) n.age++;
  });

  newState.nodes.forEach((n) => {
    if (n.type === "flower" && n.age > 60 && n.fruitAge === 0) {
      n.fruitAge = 1;
    } else if (n.fruitAge > 0) {
      n.fruitAge++;
    }
  });

  const tips = newState.nodes.filter((n) => n.terminal && n.type === "meristem");
  const nextNodes: PlantNode[] = [];

  tips.forEach((tip) => {
    const g = newState.genome;

    let angle = tip.angle;
    if (newState.environment.lightDirection) {
      const light = newState.environment.lightDirection;
      const lightAngle = Math.atan2(light[1], light[0]);
      const desiredAngle = Math.min(lightAngle, -Math.PI / 6);
      const currentAngle = tip.angle;
      let newAngle = currentAngle;
      if (currentAngle < desiredAngle - turnAmount) {
        newAngle = Math.min(currentAngle + turnAmount, desiredAngle);
      } else if (currentAngle > desiredAngle + turnAmount) {
        newAngle = Math.max(currentAngle - turnAmount, desiredAngle);
      }
      angle = normalizeAngle(newAngle);
    }

    if (newState.environment.gravity > 0) {
      const upward = -Math.PI / 2;
      const gravityStrength = newState.environment.gravity;
      const diff = upward - angle;
      angle = normalizeAngle(angle + diff * gravityStrength * 0.05);
    }

    if (angle > -Math.PI / 8) {
      angle = -Math.PI / 8;
    }

    const vigor = g.vigor;
    const currentV = tip.v;

    if (tip.length < tip.targetLength) {
      const growthRate = vigor * 2.0 * (1 + g.vineMode * 0.3);
      tip.length += growthRate * droughtFactor;
      if (tip.length > tip.targetLength) tip.length = tip.targetLength;
      return;
    }

    tip.terminal = false;

    const safeV = Math.max(0, currentV);
    const tipEndX = tip.x + Math.cos(tip.angle) * tip.targetLength;
    const tipEndY = tip.y + Math.sin(tip.angle) * tip.targetLength;

    if (safeV <= 0) {
      nextNodes.push({
        id: -newState.idCounter++,
        parentId: tip.id,
        x: tipEndX,
        y: tipEndY,
        angle: tip.angle,
        depth: tip.depth,
        type: "flower",
        terminal: true,
        age: 0,
        length: g.flowerRadius,
        targetLength: g.flowerRadius,
        v: 0,
        budState: "dormant",
        isCut: false,
        resourceProduction: 0,
        shade: tip.shade,
        curve: 0,
        leafSizeJitter: 0,
        leafShapeJitter: 0,
        leafHueShift: 0,
        hasThorns: false,
        fruitAge: 0,
        fallState: "attached",
        fallSeed: prng.random(),
      });
      return;
    }

    const energyFactor = Math.min(1.5, Math.max(0.5, (newState.resources?.energy ?? 0) / 60));
    const densityRatio = newState.nodes.length / MAX_TOTAL_NODES;
    const densityBrake = Math.max(0, (1 - densityRatio) * (1 - densityRatio));
    const apicalBrake = 1 / (1 + g.apicalDominance * tip.depth * 0.15);
    const competitionBrake = 30 / (30 + tips.length * 0.5);  // Stricter competition brake
    const branchChance = safeV * 0.4 * energyFactor * densityBrake * apicalBrake * competitionBrake;
    const nBranches = prng.random() < branchChance ? 2 : 1;

    for (let b = 0; b < nBranches; b++) {
      const spread = (g.angle * Math.PI) / 180 * Math.max(0.3, 1 - g.vineMode * 0.7);
      const direction = nBranches === 1 ? (prng.random() - 0.5) * 0.2 : (b === 0 ? -spread : spread);
      let nextAngle = normalizeAngle(angle + direction);
      if (nextAngle > 0) nextAngle = 0;
      if (nextAngle < -Math.PI) nextAngle = -Math.PI;

      const daughterV = safeV - (g.decay + prng.random() * g.decay * 0.5);
      const daughterTargetLen = g.lenScale * Math.pow(Math.max(0, daughterV), 1.2) * (1 + g.vineMode * 0.5);

      nextNodes.push({
        id: -((newState.idCounter++) * 100 + b),
        parentId: tip.id,
        x: tipEndX,
        y: tipEndY,
        angle: nextAngle,
        depth: tip.depth + 1,
        type: "meristem",
        terminal: true,
        v: daughterV,
        age: 0,
        length: 0,
        targetLength: daughterTargetLen,
        budState: "dormant",
        isCut: false,
        resourceProduction: 0,
        shade: tip.shade,
        curve: (prng.random() - 0.5) * g.curl * 0.6,
        leafSizeJitter: 0,
        leafShapeJitter: 0,
        leafHueShift: 0,
        hasThorns: g.thornDensity > 0 && prng.random() < g.thornDensity && tip.depth >= 1,
        fruitAge: 0,
        fallState: "attached",
        fallSeed: prng.random(),
      });
    }

    if (safeV > 0.2 && tip.depth >= 2 && prng.random() < 0.45) {
      const leafSide = prng.random() < 0.5 ? -1 : 1;

      nextNodes.push({
        id: -newState.idCounter++,
        parentId: tip.id,
        x: tipEndX,
        y: tipEndY,
        angle: normalizeAngle(angle + leafSide * 1.3),
        depth: tip.depth + 1,
        type: "leaf",
        terminal: false,
        age: 0,
        length: 12 + prng.random() * 8,
        targetLength: 15,
        v: 0,
        budState: "dormant",
        isCut: false,
        resourceProduction: 0.1 + prng.random() * 0.2,
        shade: tip.shade,
        curve: (prng.random() - 0.5) * 0.3,
        leafSizeJitter: 0.7 + prng.random() * 0.6,
        leafShapeJitter: prng.int(0, 1),
        leafHueShift: (prng.random() - 0.5) * 20,
        hasThorns: false,
        fruitAge: 0,
        fallState: "attached",
        fallSeed: prng.random(),
      });

      nextNodes.push({
        id: -newState.idCounter++,
        parentId: tip.id,
        x: tipEndX,
        y: tipEndY,
        angle: normalizeAngle(angle - leafSide * 0.5),
        depth: tip.depth + 1,
        type: "bud",
        terminal: false,
        age: 0,
        length: 0,
        targetLength: g.lenScale * 0.8,
        v: safeV,
        budState: "dormant",
        isCut: false,
        resourceProduction: 0,
        shade: tip.shade,
        curve: 0,
        leafSizeJitter: 0,
        leafShapeJitter: 0,
        leafHueShift: 0,
        hasThorns: false,
        fruitAge: 0,
        fallState: "attached",
        fallSeed: prng.random(),
      });
    }
  });

  if (newState.nodes.length + nextNodes.length <= MAX_TOTAL_NODES) {
    newState.nodes.push(...nextNodes);
  }

  const leafCountByParent = new Map<number, number>();
  for (const n of newState.nodes) {
    if (n.type === "leaf" && n.parentId !== null) {
      leafCountByParent.set(n.parentId, (leafCountByParent.get(n.parentId) ?? 0) + 1);
    }
  }
  for (const n of newState.nodes) {
    if (n.type === "root" || n.parentId === null) continue;
    const leavesOnParent = leafCountByParent.get(n.parentId) ?? 0;
    const leafSiblings = n.type === "leaf" ? Math.max(0, leavesOnParent - 1) : leavesOnParent;
    n.shade = Math.min(0.85, n.shade + leafSiblings * 0.06);
  }

  let totalResources = 0;
  newState.nodes.forEach((n) => {
    if (n.type === "leaf" && n.resourceProduction > 0) {
      const shadeFactor = Math.max(0.1, 1 - n.shade);
      totalResources += n.resourceProduction * shadeFactor;
    }
  });

  newState.resources = {
    energy: Math.min(100, (newState.resources?.energy ?? 0) + totalResources * 5),
    water: Math.min(100, (newState.resources?.water ?? 0) + totalResources * 2),
    structural: Math.min(100, (newState.resources?.structural ?? 0) + totalResources * 1),
  };

  if (season > 140 && season < 180) {
    const leafMaxAge = currentWater < 30 ? 15 : 30;
    newState.nodes = newState.nodes.filter((n) => {
      if (n.type !== "leaf") return true;
      if (n.fallState === "falling") return true;
      return (n.age ?? 0) < leafMaxAge;
    });
  }
  if (season >= 180) {
    newState.nodes = newState.nodes.filter((n) => !(n.fallState === "falling" && (n.fallAge ?? 0) > MAX_FALL_STEPS));
  }

  return newState;
}

/**
 * Activate dormant buds at season boundaries.
 * Some buds awaken based on vigor and species traits.
 */
function budActivation(state: PlantState, prng: Prng): void {
  const g = state.genome;
  const nodes = state.nodes;

  const parentById = new Map<number, PlantNode>();
  for (const m of nodes) parentById.set(m.id, m);
  const densityBrakeAwake = Math.max(0, 1 - nodes.length / MAX_TOTAL_NODES);
  nodes.forEach((n) => {
    if (n.type !== "bud" || n.budState !== "dormant") return;
    if (n.v < g.budActivationThreshold) return;
    const activationChance = (1 - g.dormancyStrength) * (0.35 + 0.65 * n.v) * (0.25 + 0.75 * densityBrakeAwake);
    if (prng.random() < activationChance) {
      const parent = n.parentId !== null ? parentById.get(n.parentId) : undefined;
      const parentV = parent ? Math.max(0, parent.v) : n.v;
      const inheritedV = Math.max(0.15, parentV - g.decay * (1 + prng.random() * 0.5));
      n.type = "meristem";
      n.terminal = true;
      n.budState = "active";
      n.v = inheritedV;
      n.targetLength = g.lenScale * Math.pow(inheritedV, 1.2);
      n.length = 0;
      n.age = 0;
    }
  });

  const densityBrakeBud = Math.max(0, 1 - nodes.length / MAX_TOTAL_NODES);
  const newBuds: PlantNode[] = [];
  nodes.forEach((n) => {
    if (n.type !== "meristem" && n.type !== "stem") return;
    if (n.isCut) return;
    if (n.depth < 1) return;
    const hasBudChild = nodes.some(
      (c) => c.parentId === n.id && (c.type === "bud" || c.type === "leaf")
    );
    if (hasBudChild) return;
    if (prng.random() > 0.35 * densityBrakeBud) return;

    const endX = n.x + Math.cos(n.angle) * n.targetLength;
    const endY = n.y + Math.sin(n.angle) * n.targetLength;
    const side = prng.random() < 0.5 ? -1 : 1;

    newBuds.push({
      id: -state.idCounter++,
      parentId: n.id,
      x: endX,
      y: endY,
      angle: n.angle + side * (0.8 + prng.random() * 0.5),
      depth: n.depth + 1,
      type: "bud",
      terminal: false,
      age: 0,
      length: 0,
      targetLength: g.lenScale * 0.6,
      v: 0.6 + prng.random() * 0.4,
      budState: "dormant",
      isCut: false,
      resourceProduction: 0,
      shade: n.shade,
      curve: 0,
      leafSizeJitter: 0,
      leafShapeJitter: 0,
      leafHueShift: 0,
      hasThorns: false,
      fruitAge: 0,
      fallState: "attached",
      fallSeed: prng.random(),
    });

    if (prng.random() < 0.5) {
      newBuds.push({
        id: -state.idCounter++,
        parentId: n.id,
        x: endX,
        y: endY,
        angle: n.angle - side * (0.8 + prng.random() * 0.5),
        depth: n.depth + 1,
        type: "leaf",
        terminal: false,
        age: 0,
        length: 10 + prng.random() * 8,
        targetLength: 15,
        v: 0,
        budState: "dormant",
        isCut: false,
        resourceProduction: 0.1 + prng.random() * 0.2,
        shade: n.shade,
        curve: (prng.random() - 0.5) * 0.3,
        leafSizeJitter: 0.7 + prng.random() * 0.6,
        leafShapeJitter: prng.int(0, 1),
        leafHueShift: (prng.random() - 0.5) * 20,
        hasThorns: false,
        fruitAge: 0,
        fallState: "attached",
        fallSeed: prng.random(),
      });
    }
  });

  if (nodes.length + newBuds.length <= MAX_TOTAL_NODES) {
    nodes.push(...newBuds);
  }
}

function spawnLeavesOnBranches(state: PlantState, prng: Prng): void {
  const g = state.genome;
  const nodes = state.nodes;
  const newLeaves: PlantNode[] = [];

  nodes.forEach((n) => {
    if (n.type !== "stem" && n.type !== "meristem") return;
    if (n.isCut) return;
    if (n.depth < 3) return;  // Was: n.depth < 2
    if (n.age < 10) return;
    const hasLeafChild = nodes.some(
      (c) => c.parentId === n.id && c.type === "leaf"
    );
    if (hasLeafChild) return;
    if (prng.random() > g.leafDensity * 0.3) return;

    const endX = n.x + Math.cos(n.angle) * n.length;
    const endY = n.y + Math.sin(n.angle) * n.length;
    const side = prng.random() < 0.5 ? -1 : 1;

    newLeaves.push({
      id: -state.idCounter++,
      parentId: n.id,
      x: endX,
      y: endY,
      angle: n.angle + side * 1.3,
      depth: n.depth + 1,
      type: "leaf",
      terminal: false,
      age: 0,
      length: 10 + prng.random() * 6,
      targetLength: 12,
      v: 0,
      budState: "dormant",
      isCut: false,
      resourceProduction: 0.1 + prng.random() * 0.2,
      shade: n.shade,
      curve: (prng.random() - 0.5) * 0.3,
      leafSizeJitter: 0.7 + prng.random() * 0.6,
      leafShapeJitter: prng.int(0, 1),
      leafHueShift: (prng.random() - 0.5) * 20,
      hasThorns: false,
      fruitAge: 0,
      fallState: "attached",
      fallSeed: prng.random(),
    });
  });

  if (nodes.length + newLeaves.length <= MAX_TOTAL_NODES) {
    nodes.push(...newLeaves);
  }
}

export function updateFallingDebris(state: PlantState): void {
  for (const n of state.nodes) {
    if (n.fallState !== "falling") continue;
    n.fallVY = Math.min(2.4, (n.fallVY ?? 0.2) + 0.018);
    n.fallSwayPhase = (n.fallSwayPhase ?? 0) + 0.09;
    n.x += Math.sin(n.fallSwayPhase) * 0.5;
    n.y += n.fallVY;
    n.angle += n.fallRotSpeed ?? 0;
    n.fallAge = (n.fallAge ?? 0) + 1;
  }
  state.nodes = state.nodes.filter((n) => !(n.fallState === "falling" && (n.fallAge ?? 0) > MAX_FALL_STEPS));
}

export function triggerAbscissionIfDue(state: PlantState, season: number, prng: Prng): void {
  for (const n of state.nodes) {
    if ((n.type !== "leaf" && n.type !== "flower") || (n.fallState ?? "attached") !== "attached") continue;
    const win = n.type === "leaf" ? LEAF_FALL_WINDOW : FLOWER_FALL_WINDOW;
    const triggerAt = win[0] + (n.fallSeed ?? prng.random()) * (win[1] - win[0]);
    if (season >= triggerAt) {
      n.fallState = "falling";
      n.fallVY = 0.12 + prng.random() * 0.22;
      n.fallRotSpeed = (prng.random() - 0.5) * 0.16;
      n.fallSwayPhase = prng.random() * Math.PI * 2;
      n.fallAge = 0;
    }
  }
}

export function budbreakStep(state: PlantState, prng: Prng): void {
  const densityBrake = Math.max(0, 1 - state.nodes.length / MAX_TOTAL_NODES);
  for (const n of state.nodes) {
    if (n.type !== "bud" || n.budState !== "dormant") continue;
    if (prng.random() >= BUDBREAK_CHANCE_PER_STEP * densityBrake) continue;
    n.type = "meristem";
    n.terminal = true;
    n.budState = "active";
    n.v = 0.75 + prng.random() * 0.35;
    n.length = 0;
    n.targetLength = state.genome.lenScale * 1.3;
    n.age = 0;
  }
}

export function epicormicStep(state: PlantState, prng: Prng): void {
  if (state.nodes.length >= MAX_TOTAL_NODES) return;
  const densityBrake = Math.max(0, 1 - state.nodes.length / MAX_TOTAL_NODES);
  const fresh: PlantNode[] = [];
  for (const n of state.nodes) {
    if (n.type !== "stem" || n.terminal || (n.age ?? 0) <= EPICORMIC_MIN_AGE) continue;
    if (prng.random() >= EPICORMIC_CHANCE_PER_STEP * densityBrake) continue;
    const t = 0.25 + prng.random() * 0.55;
    const side = prng.random() < 0.5 ? -1 : 1;
    fresh.push({
      id: -state.idCounter++,
      parentId: n.id,
      x: n.x + Math.cos(n.angle) * n.length * t,
      y: n.y + Math.sin(n.angle) * n.length * t,
      angle: normalizeAngle(n.angle + side * (0.9 + prng.random() * 0.5)),
      depth: n.depth + 1,
      type: "bud",
      terminal: false,
      age: 0,
      length: 0,
      targetLength: state.genome.lenScale * 0.6,
      v: 0.6 + prng.random() * 0.4,
      budState: "dormant",
      isCut: false,
      resourceProduction: 0,
      shade: n.shade,
      curve: 0,
      leafSizeJitter: 0,
      leafShapeJitter: 0,
      leafHueShift: 0,
      hasThorns: false,
      fruitAge: 0,
      fallState: "attached",
      fallSeed: prng.random(),
      attachT: t,
    });
  }
  if (fresh.length > 0 && state.nodes.length + fresh.length <= MAX_TOTAL_NODES) state.nodes.push(...fresh);
}

function senesceLeaves(state: PlantState): void {
  state.nodes = state.nodes.filter((n) => {
    if (n.type !== "leaf") return true;
    if (n.fallState === "falling") return true;
    return (n.age ?? 0) < 30;
  });
}

// --- Pruning ---

/**
 * Prune a stem node, removing its subtree and awakening latent buds.
 * 
 * @param state Plant state
 * @param targetNodeId ID of the stem node to prune
 * @returns New plant state with subtree removed and buds potentially awakened
 */
export function pruneNode(state: PlantState, targetNodeId: number): PlantState {
  // Deep copy to avoid mutation
  const newState: PlantState = {
    ...state,
    nodes: state.nodes.map((n) => ({ ...n })),
  };

  // Find the target node
  const targetIndex = newState.nodes.findIndex((n) => n.id === targetNodeId);
  if (targetIndex === -1) return state; // target not found, return unchanged

  const targetNode = newState.nodes[targetIndex];

  // Build set of descendant IDs to remove (children, grandchildren, etc.)
  // but NOT the target node itself
  const toRemove = new Set<number>();
  function findDescendants(id: number): void {
    newState.nodes.forEach((n) => {
      if (n.parentId === id) {
        toRemove.add(n.id);
        findDescendants(n.id);
      }
    });
  }

  // Mark all descendants of the target for removal
  findDescendants(targetNodeId);

  // Mark the target node as cut (keep it, don't remove it)
  targetNode.isCut = true;

  // Remove all marked descendant nodes only
  newState.nodes = newState.nodes.filter((n) => !toRemove.has(n.id));

  // Awaken latent buds near the cut area.
  // Buds that were siblings to the pruned branch, or at the parent level,
  // can awaken to replace the removed growth.
  newState.nodes.forEach((n) => {
    if (n.type === "bud" && n.budState === "dormant") {
      // A bud awakens if it's a sibling of a removed descendant
      // (shares the same parent as a removed node)
      const isSiblingOfRemoved =
        n.parentId !== null &&
        toRemove.has(n.parentId) &&
        n.parentId === targetNode.parentId;

      if (isSiblingOfRemoved) {
        // Activate this bud into a stem
        n.type = "meristem";
        n.terminal = true;
        n.budState = "active";
        n.v = 1.0;
        n.targetLength = state.genome.lenScale * 1.5;
        n.length = 0;
        n.age = 0;
      }
    }
  });

  // Update step counter to mark the pruning event
  newState.step++;

  return newState;
}

// --- Initial State Setup ---

/**
 * Create a fresh plant state from a genome.
 * 
 @param genome Genome driving the plant growth
 @param species Species definition for calibrated trait ranges
 @param options Seed for deterministic PRNG (optional)
 @returns Fresh plant state with root node ready to grow
 */
export function freshState(
  genome: Genome,
  species: SpeciesDef,
  options: { seed?: number; cycleLength?: number } = {}
): PlantState {
  // Create PRNG with deterministic seed
  const prng = createPrng(options.seed ?? Date.now());

  const root: PlantNode = {
    id: 0,
    parentId: null,
    type: "meristem",
    x: 0,
    y: 0,
    angle: -Math.PI / 2,
    length: 0,
    targetLength: genome.lenScale,
    v: 1.0,
    age: 0,
    terminal: true,
    budState: "dormant",
    depth: 0,
    isCut: false,
    resourceProduction: 0,
    shade: 0,
    curve: 0,
    leafSizeJitter: 0,
    leafShapeJitter: 0,
    leafHueShift: 0,
    hasThorns: false,
    fruitAge: 0,
  };

  const initialState: PlantState = {
    idCounter: 1,
    step: 0,
    cycleLength: options.cycleLength ?? DEFAULT_CYCLE_LENGTH,
    root,
    nodes: [root],
    genome,
    species,
    resources: { energy: 50, water: 80, structural: 30 },
    environment: {
      lightDirection: [1, 0],
      gravity: 0.3,
      seasonIndex: 0,
      temperature: 0.7,
    },
    greenhouse: [],
    selectedSlots: [],
    windTime: 0,
    darkMode: true,
    showRoots: false,
    woodTexture: false,
    particles: [],
    cutAnimTime: 0,
    cameraX: 0,
    cameraY: 0,
    cameraZoom: 1,
    growSpeed: 1,
    timelapseFrames: [],
    isRecording: false,
  };

  return initialState;
}