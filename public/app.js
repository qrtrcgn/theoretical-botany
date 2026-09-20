// src/sim/prng.ts
function hashSeed(seed) {
  const str = String(seed);
  let h = 2166136261 >>> 0;
  for (let i = 0;i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0;
  }
  return h >>> 0;
}
function createPrng(seed) {
  let s = hashSeed(seed !== undefined ? seed : Date.now() ^ Math.random() * 4294967295);
  let spareAvailable = false;
  let spare = 0;
  function next() {
    s = s + 1831565813 >>> 0;
    let t = s;
    t = Math.imul(t ^ t >>> 15, t | 1) >>> 0;
    t ^= t + Math.imul(t ^ t >>> 7, t | 61) >>> 0;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
  function gaussian(mean = 0, stdev = 1) {
    if (spareAvailable) {
      spareAvailable = false;
      return mean + spare * stdev;
    }
    let u = 0, v = 0, sq = 0;
    do {
      u = next() * 2 - 1;
      v = next() * 2 - 1;
      sq = u * u + v * v;
    } while (sq >= 1 || sq === 0);
    const r = Math.sqrt(-2 * Math.log(sq) / sq);
    spare = v * r;
    spareAvailable = true;
    return mean + u * r * stdev;
  }
  const api = {
    random: () => next(),
    float: (min = 0, max = 1) => {
      if (min >= max)
        return min;
      return min + next() * (max - min);
    },
    int: (min, max) => {
      if (min > max)
        [min, max] = [max, min];
      return Math.floor(min + next() * (max - min + 1));
    },
    gaussian,
    clone: () => {
      const c = createPrng(0);
      c._restore(s, spareAvailable, spare);
      return c;
    },
    reseed: (ns) => {
      s = hashSeed(ns);
      spareAvailable = false;
      spare = 0;
    }
  };
  api._restore = (s2, sa, sp) => {
    s = s2 >>> 0;
    spareAvailable = sa;
    spare = sp;
  };
  return api;
}

// src/sim/genetics.ts
function expressTrait(genome, trait) {
  if (!genome || !genome[trait])
    return 0;
  const alleles = genome[trait];
  if (!Array.isArray(alleles))
    return alleles;
  switch (trait) {
    case "flowerRGB":
      return alleles[0];
    case "flowerStretch": {
      const stretch = alleles;
      return [
        Math.max(stretch[0][0], stretch[1][0]),
        Math.max(stretch[0][1], stretch[1][1])
      ];
    }
    default:
      return Math.max(alleles[0], alleles[1]);
  }
}
function breedGenomes(parent1, parent2, prng) {
  const breedTrait = (p1, p2) => [
    prng.random() < 0.5 ? p1[0] : p2[0],
    prng.random() < 0.5 ? p1[1] : p2[1]
  ];
  return {
    vigor: breedTrait(parent1.vigor, parent2.vigor),
    angle: breedTrait(parent1.angle, parent2.angle),
    decay: breedTrait(parent1.decay, parent2.decay),
    lenScale: breedTrait(parent1.lenScale, parent2.lenScale),
    flowerRGB: breedTrait(parent1.flowerRGB, parent2.flowerRGB),
    flowerRadius: breedTrait(parent1.flowerRadius, parent2.flowerRadius),
    flowerShape: breedTrait(parent1.flowerShape, parent2.flowerShape),
    flowerStretch: breedTrait(parent1.flowerStretch, parent2.flowerStretch),
    flowerMaterial: breedTrait(parent1.flowerMaterial, parent2.flowerMaterial),
    leafShape: breedTrait(parent1.leafShape, parent2.leafShape),
    leafSize: breedTrait(parent1.leafSize, parent2.leafSize),
    leafDensity: breedTrait(parent1.leafDensity, parent2.leafDensity),
    inflorescence: breedTrait(parent1.inflorescence, parent2.inflorescence),
    petalCount: breedTrait(parent1.petalCount, parent2.petalCount),
    sepalCount: breedTrait(parent1.sepalCount, parent2.sepalCount),
    stamenCount: breedTrait(parent1.stamenCount, parent2.stamenCount),
    symmetry: breedTrait(parent1.symmetry, parent2.symmetry),
    curl: breedTrait(parent1.curl, parent2.curl),
    windSensitivity: breedTrait(parent1.windSensitivity, parent2.windSensitivity),
    barkRoughness: breedTrait(parent1.barkRoughness, parent2.barkRoughness),
    thornDensity: breedTrait(parent1.thornDensity, parent2.thornDensity),
    vineMode: breedTrait(parent1.vineMode, parent2.vineMode),
    stiffness: breedTrait(parent1.stiffness, parent2.stiffness),
    budActivationThreshold: breedTrait(parent1.budActivationThreshold, parent2.budActivationThreshold),
    shadeTolerance: breedTrait(parent1.shadeTolerance, parent2.shadeTolerance),
    apicalDominance: breedTrait(parent1.apicalDominance, parent2.apicalDominance),
    internodeElasticity: breedTrait(parent1.internodeElasticity, parent2.internodeElasticity),
    dormancyStrength: breedTrait(parent1.dormancyStrength, parent2.dormancyStrength)
  };
}

// src/sim/growth.ts
function normalizeAngle(angle) {
  let a = angle;
  while (a > Math.PI)
    a -= 2 * Math.PI;
  while (a < -Math.PI)
    a += 2 * Math.PI;
  return a;
}
var DEFAULT_CYCLE_LENGTH = 250;
var MAX_TOTAL_NODES = 2000;
var BUDBREAK_WINDOW_END = 110;
var BUDBREAK_CHANCE_PER_STEP = 0.006;
var EPICORMIC_MIN_AGE = 45;
var EPICORMIC_CHANCE_PER_STEP = 0.0015;
var LEAF_FALL_WINDOW = [125, 190];
var FLOWER_FALL_WINDOW = [95, 155];
var MAX_FALL_STEPS = 150;
function growOnce(state, prng) {
  const newState = {
    ...state,
    step: state.step + 1,
    nodes: [...state.nodes]
  };
  const clonedNodes = new Map;
  const getClone = (n) => {
    if (clonedNodes.has(n.id))
      return clonedNodes.get(n.id);
    const clone = { ...n };
    clonedNodes.set(n.id, clone);
    return clone;
  };
  const season = newState.step % DEFAULT_CYCLE_LENGTH;
  let lightAngle;
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
    lightDirection: [Math.cos(lightAngle), Math.sin(lightAngle)]
  };
  let seasonFactor = 1;
  if (season >= 180) {
    seasonFactor = 0.3;
  } else if (season < 100) {
    seasonFactor = 0.3 + 0.7 * (season / 100);
  } else if (season >= 140) {
    seasonFactor = 1 - 0.7 * ((season - 140) / 40);
  }
  const turnAmount = 0.05 * seasonFactor * (1 + expressTrait(newState.genome, "vineMode") * 2);
  const currentWater = newState.resources?.water ?? 0;
  const droughtFactor = currentWater < 30 ? 0.4 + 0.6 * (currentWater / 30) : 1;
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
  newState.nodes.forEach((n, i) => {
    if (n.age !== undefined) {
      const clone = getClone(n);
      clone.age++;
      newState.nodes[i] = clone;
    }
  });
  newState.nodes.forEach((n, i) => {
    if (n.type === "flower" && n.age > 60 && n.fruitAge === 0) {
      const clone = getClone(n);
      clone.fruitAge = 1;
      newState.nodes[i] = clone;
    } else if (n.fruitAge > 0) {
      const clone = getClone(n);
      clone.fruitAge++;
      newState.nodes[i] = clone;
    }
  });
  const tips = newState.nodes.filter((n) => !n.isCut && n.terminal && (n.type === "meristem" || n.type === "stem"));
  const nextNodes = [];
  tips.forEach((tip) => {
    if (tip.isCut)
      return;
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
    const vigor = expressTrait(g, "vigor") || 0.5;
    const currentV = tip.v;
    if (tip.length < tip.targetLength) {
      const shadeFactor = Math.max(0.2, 1 - (tip.shade || 0));
      const growthRate = (typeof vigor === "number" ? vigor : 0.5) * 2 * (1 + (expressTrait(g, "vineMode") || 0) * 0.3) * shadeFactor;
      const clone = getClone(tip);
      clone.length += growthRate * droughtFactor;
      if (clone.length > clone.targetLength)
        clone.length = clone.targetLength;
      const idx = newState.nodes.indexOf(tip);
      if (idx !== -1)
        newState.nodes[idx] = clone;
      return;
    }
    const tipClone = getClone(tip);
    tipClone.terminal = false;
    const tIdx = newState.nodes.indexOf(tip);
    if (tIdx !== -1)
      newState.nodes[tIdx] = tipClone;
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
        length: expressTrait(g, "flowerRadius"),
        targetLength: expressTrait(g, "flowerRadius"),
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
        fallSeed: prng.random()
      });
      return;
    }
    const energyFactor = Math.min(1.5, Math.max(0.5, (newState.resources?.energy ?? 0) / 60));
    const densityRatio = newState.nodes.length / MAX_TOTAL_NODES;
    const densityBrake = Math.max(0, (1 - densityRatio) * (1 - densityRatio));
    const apicalBrake = 1 / (1 + expressTrait(g, "apicalDominance") * tip.depth * 0.15);
    const competitionBrake = 30 / (30 + tips.length * 0.5);
    const shadeFactor = Math.max(0.2, 1 - tip.shade);
    const branchChance = safeV * 0.4 * energyFactor * densityBrake * apicalBrake * competitionBrake * shadeFactor;
    const nBranches = prng.random() < branchChance ? 2 : 1;
    for (let b = 0;b < nBranches; b++) {
      const spread = expressTrait(g, "angle") * Math.PI / 180 * Math.max(0.3, 1 - expressTrait(g, "vineMode") * 0.7);
      const direction = nBranches === 1 ? (prng.random() - 0.5) * 0.2 : b === 0 ? -spread : spread;
      let nextAngle = normalizeAngle(angle + direction);
      if (nextAngle > 0)
        nextAngle = 0;
      if (nextAngle < -Math.PI)
        nextAngle = -Math.PI;
      const daughterV = safeV - (expressTrait(g, "decay") + prng.random() * expressTrait(g, "decay") * 0.5);
      const daughterTargetLen = expressTrait(g, "lenScale") * Math.pow(Math.max(0, daughterV), 1.2) * (1 + expressTrait(g, "vineMode") * 0.5);
      nextNodes.push({
        id: -(newState.idCounter++ * 100 + b),
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
        curve: (prng.random() - 0.5) * expressTrait(g, "curl") * 0.6,
        leafSizeJitter: 0,
        leafShapeJitter: 0,
        leafHueShift: 0,
        hasThorns: expressTrait(g, "thornDensity") > 0 && prng.random() < expressTrait(g, "thornDensity") && tip.depth >= 1,
        fruitAge: 0,
        fallState: "attached",
        fallSeed: prng.random()
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
        fallSeed: prng.random()
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
        targetLength: expressTrait(g, "lenScale") * 0.8,
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
        fallSeed: prng.random()
      });
    }
  });
  if (newState.nodes.length + nextNodes.length <= MAX_TOTAL_NODES) {
    newState.nodes.push(...nextNodes);
  }
  const leafCountByParent = new Map;
  for (const n of newState.nodes) {
    if (n.type === "leaf" && n.parentId !== null) {
      leafCountByParent.set(n.parentId, (leafCountByParent.get(n.parentId) ?? 0) + 1);
    }
  }
  newState.nodes.forEach((n, i) => {
    if (n.type === "root" || n.parentId === null)
      return;
    const leavesOnParent = leafCountByParent.get(n.parentId) ?? 0;
    const leafSiblings = n.type === "leaf" ? Math.max(0, leavesOnParent - 1) : leavesOnParent;
    const clone = getClone(n);
    clone.shade = Math.min(0.85, clone.shade + leafSiblings * 0.06);
    newState.nodes[i] = clone;
  });
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
    structural: Math.min(100, (newState.resources?.structural ?? 0) + totalResources * 1)
  };
  if (season > 140 && season < 180) {
    const leafMaxAge = currentWater < 30 ? 15 : 30;
    newState.nodes = newState.nodes.filter((n) => {
      if (n.type !== "leaf")
        return true;
      if (n.fallState === "falling")
        return true;
      return (n.age ?? 0) < leafMaxAge;
    });
  }
  if (season >= 180) {
    newState.nodes = newState.nodes.filter((n) => !(n.fallState === "falling" && (n.fallAge ?? 0) > MAX_FALL_STEPS));
  }
  return newState;
}
function budActivation(state, prng) {
  const g = state.genome;
  const nodes = state.nodes;
  const parentById = new Map;
  for (const m of nodes)
    parentById.set(m.id, m);
  const densityBrakeAwake = Math.max(0, 1 - nodes.length / MAX_TOTAL_NODES);
  nodes.forEach((n) => {
    if (n.type !== "bud" || n.budState !== "dormant")
      return;
    if (n.v < expressTrait(g, "budActivationThreshold"))
      return;
    const activationChance = (1 - expressTrait(g, "dormancyStrength")) * (0.35 + 0.65 * n.v) * (0.25 + 0.75 * densityBrakeAwake);
    if (prng.random() < activationChance) {
      const parent = n.parentId !== null ? parentById.get(n.parentId) : undefined;
      const parentV = parent ? Math.max(0, parent.v) : n.v;
      const inheritedV = Math.max(0.15, parentV - expressTrait(g, "decay") * (1 + prng.random() * 0.5));
      n.type = "meristem";
      n.terminal = true;
      n.budState = "active";
      n.v = inheritedV;
      n.targetLength = expressTrait(g, "lenScale") * Math.pow(inheritedV, 1.2);
      n.length = 0;
      n.age = 0;
    }
  });
  const densityBrakeBud = Math.max(0, 1 - nodes.length / MAX_TOTAL_NODES);
  const newBuds = [];
  nodes.forEach((n) => {
    if (n.type !== "meristem" && n.type !== "stem")
      return;
    if (n.isCut)
      return;
    if (n.depth < 1)
      return;
    const hasBudChild = nodes.some((c) => c.parentId === n.id && (c.type === "bud" || c.type === "leaf"));
    if (hasBudChild)
      return;
    if (prng.random() > 0.35 * densityBrakeBud)
      return;
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
      targetLength: expressTrait(g, "lenScale") * 0.6,
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
      fallSeed: prng.random()
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
        fallSeed: prng.random()
      });
    }
  });
  if (nodes.length + newBuds.length <= MAX_TOTAL_NODES) {
    nodes.push(...newBuds);
  }
}
function spawnLeavesOnBranches(state, prng) {
  const g = state.genome;
  const nodes = state.nodes;
  const newLeaves = [];
  nodes.forEach((n) => {
    if (n.type !== "stem" && n.type !== "meristem")
      return;
    if (n.isCut)
      return;
    if (n.depth < 1)
      return;
    if (n.age < 2)
      return;
    const hasLeafChild = nodes.some((c) => c.parentId === n.id && c.type === "leaf");
    if (hasLeafChild)
      return;
    if (prng.random() > expressTrait(g, "leafDensity") * 0.95)
      return;
    const endX = n.x + Math.cos(n.angle) * n.length;
    const endY = n.y + Math.sin(n.angle) * n.length;
    const side = prng.random() < 0.5 ? -1 : 1;
    newLeaves.push({
      id: -state.idCounter++,
      parentId: n.id,
      x: endX,
      y: endY,
      angle: n.angle + (prng.random() - 0.5) * 0.8,
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
      fallSeed: prng.random()
    });
  });
  if (nodes.length + newLeaves.length <= MAX_TOTAL_NODES) {
    nodes.push(...newLeaves);
  }
}
function updateFallingDebris(state) {
  for (const n of state.nodes) {
    if (n.fallState !== "falling")
      continue;
    n.fallVY = Math.min(2.4, (n.fallVY ?? 0.2) + 0.018);
    n.fallSwayPhase = (n.fallSwayPhase ?? 0) + 0.09;
    n.x += Math.sin(n.fallSwayPhase) * 0.5;
    n.y += n.fallVY;
    n.angle += n.fallRotSpeed ?? 0;
    n.fallAge = (n.fallAge ?? 0) + 1;
  }
  state.nodes = state.nodes.filter((n) => !(n.fallState === "falling" && (n.fallAge ?? 0) > MAX_FALL_STEPS));
}
function triggerAbscissionIfDue(state, season, prng) {
  for (const n of state.nodes) {
    if (n.type !== "leaf" && n.type !== "flower" || (n.fallState ?? "attached") !== "attached")
      continue;
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
function budbreakStep(state, prng) {
  const densityBrake = Math.max(0, 1 - state.nodes.length / MAX_TOTAL_NODES);
  for (const n of state.nodes) {
    if (n.type !== "bud" || n.budState !== "dormant")
      continue;
    if (prng.random() >= BUDBREAK_CHANCE_PER_STEP * densityBrake)
      continue;
    n.type = "meristem";
    n.terminal = true;
    n.budState = "active";
    n.v = 0.75 + prng.random() * 0.35;
    n.length = 0;
    n.targetLength = expressTrait(state.genome, "lenScale") * 1.3;
    n.age = 0;
  }
}
function epicormicStep(state, prng) {
  if (state.nodes.length >= MAX_TOTAL_NODES)
    return;
  const densityBrake = Math.max(0, 1 - state.nodes.length / MAX_TOTAL_NODES);
  const fresh = [];
  for (const n of state.nodes) {
    if (n.type !== "stem" || n.terminal || (n.age ?? 0) <= EPICORMIC_MIN_AGE)
      continue;
    if (prng.random() >= EPICORMIC_CHANCE_PER_STEP * densityBrake)
      continue;
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
      targetLength: expressTrait(state.genome, "lenScale") * 0.6,
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
      attachT: t
    });
  }
  if (fresh.length > 0 && state.nodes.length + fresh.length <= MAX_TOTAL_NODES)
    state.nodes.push(...fresh);
}
function senesceLeaves(state) {
  state.nodes = state.nodes.filter((n) => {
    if (n.type !== "leaf")
      return true;
    if (n.fallState === "falling")
      return true;
    return (n.age ?? 0) < 30;
  });
}
function pruneNodeAt(state, targetNodeId, t) {
  const newState = {
    ...state,
    nodes: state.nodes.map((n) => ({ ...n }))
  };
  const targetIndex = newState.nodes.findIndex((n) => n.id === targetNodeId);
  if (targetIndex === -1)
    return state;
  const targetNode = newState.nodes[targetIndex];
  if (targetNode.type !== "stem" && targetNode.type !== "meristem")
    return state;
  const cutT = Number.isFinite(t) ? Math.max(0, Math.min(1, t)) : 1;
  const originalLength = Math.max(0, targetNode.length);
  const minStub = Math.min(originalLength, 0.4);
  targetNode.length = Math.max(minStub, originalLength * cutT);
  targetNode.targetLength = targetNode.length;
  targetNode.isCut = true;
  targetNode.terminal = false;
  targetNode.v = 0;
  if (targetNode.type === "meristem")
    targetNode.type = "stem";
  const toRemove = new Set;
  function findDescendants(id) {
    for (const n of newState.nodes) {
      if (n.parentId === id && !toRemove.has(n.id)) {
        toRemove.add(n.id);
        findDescendants(n.id);
      }
    }
  }
  for (const n of newState.nodes) {
    if (n.parentId !== targetNodeId)
      continue;
    const attachT = n.attachT ?? 1;
    if (attachT >= cutT - 0.000001) {
      toRemove.add(n.id);
      findDescendants(n.id);
    } else if (originalLength > 0.000001) {
      n.attachT = attachT / Math.max(cutT, 0.000001);
    }
  }
  newState.nodes = newState.nodes.filter((n) => !toRemove.has(n.id));
  for (const n of newState.nodes) {
    if (n.parentId !== targetNodeId)
      continue;
    if (n.type !== "bud" || n.budState !== "dormant")
      continue;
    n.type = "meristem";
    n.terminal = true;
    n.budState = "active";
    n.v = Math.max(0.4, expressTrait(state.genome, "vigor") * 0.7);
    n.targetLength = expressTrait(state.genome, "lenScale") * 0.9;
    n.length = 0;
    n.age = 0;
  }
  newState.step++;
  newState.cutAnimTime = 1;
  return newState;
}
function freshState(genome, species, options = {}) {
  const prng = createPrng(options.seed ?? Date.now());
  const root = {
    id: 0,
    parentId: null,
    type: "meristem",
    x: 0,
    y: 0,
    angle: -Math.PI / 2,
    length: 0,
    targetLength: expressTrait(genome, "lenScale"),
    v: 1,
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
    fruitAge: 0
  };
  const initialState = {
    idCounter: 1,
    step: 0,
    cycleLength: options.cycleLength ?? DEFAULT_CYCLE_LENGTH,
    root,
    nodes: [root],
    genome,
    speciesId: species.id,
    resources: { energy: 50, water: 80, structural: 30 },
    environment: {
      lightDirection: [1, 0],
      gravity: 0.3,
      seasonIndex: 0,
      temperature: 0.7
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
    isRecording: false
  };
  return initialState;
}

// src/sim/precisionSplit.ts
function projectT(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 0.00000001)
    return 1;
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  return Math.max(0, Math.min(1, t));
}
function precisionSplitAndPrune(state, targetNodeId, clickPos, displayedSegment) {
  const node = state.nodes.find((n) => n.id === targetNodeId);
  if (!node || node.type !== "stem" && node.type !== "meristem") {
    return state;
  }
  const start = displayedSegment ? { x: displayedSegment.sx, y: displayedSegment.sy } : { x: node.x, y: node.y };
  const end = displayedSegment ? { x: displayedSegment.ex, y: displayedSegment.ey } : {
    x: node.x + Math.cos(node.angle) * node.length,
    y: node.y + Math.sin(node.angle) * node.length
  };
  const t = projectT(clickPos, start, end);
  return pruneNodeAt(state, targetNodeId, t);
}

// src/data/species.ts
var japaneseBonsai = {
  id: "japanese-bonsai",
  name: "Japanese Bonsai",
  genus: "Pinus",
  version: "1.0.0",
  traitRanges: {
    vigor: [0.6, 0.8],
    angle: [15, 25],
    decay: [0.08, 0.12],
    lenScale: [20, 35]
  },
  hiddenTraits: {
    budActivationThreshold: 0.3,
    shadeTolerance: 0.7,
    apicalDominance: 1.2,
    internodeElasticity: 0.9,
    dormancyStrength: 0.6
  },
  leafResourceYield: 0.8,
  seasonalRange: [0, 200],
  palette: {
    typicalRGB: [34, 139, 34],
    typicalShape: 0,
    typicalMaterial: 0
  }
};
var zenBamboo = {
  id: "zen-bamboo",
  name: "Zen Bamboo",
  genus: "Phyllostachys",
  version: "1.0.0",
  traitRanges: {
    vigor: [0.8, 1.1],
    angle: [20, 35],
    decay: [0.04, 0.08],
    lenScale: [40, 60]
  },
  hiddenTraits: {
    budActivationThreshold: 0.6,
    shadeTolerance: 0.4,
    apicalDominance: 0.8,
    internodeElasticity: 1.1,
    dormancyStrength: 0.2
  },
  leafResourceYield: 1.2,
  seasonalRange: [0, 300],
  palette: {
    typicalRGB: [0, 128, 0],
    typicalShape: 1,
    typicalMaterial: 0
  }
};
var sakuraOrchid = {
  id: "sakura-orchid",
  name: "Sakura Orchid",
  genus: "Prunus",
  version: "1.0.0",
  traitRanges: {
    vigor: [0.5, 0.9],
    angle: [25, 40],
    decay: [0.08, 0.15],
    lenScale: [25, 45]
  },
  hiddenTraits: {
    budActivationThreshold: 0.5,
    shadeTolerance: 0.5,
    apicalDominance: 1,
    internodeElasticity: 1,
    dormancyStrength: 0.4
  },
  leafResourceYield: 1,
  seasonalRange: [0, 250],
  palette: {
    typicalRGB: [219, 112, 147],
    typicalShape: 2,
    typicalMaterial: 1
  }
};
var SPECIES = [japaneseBonsai, zenBamboo, sakuraOrchid];
function getSpeciesById(id) {
  const speciesMap = {
    "japanese-bonsai": japaneseBonsai,
    "zen-bamboo": zenBamboo,
    "sakura-orchid": sakuraOrchid
  };
  return speciesMap[id];
}
function generateGenomeForSpecies(species, seed) {
  const prng = createPrng(seed ?? Date.now());
  const randAlleles = (min, max) => [
    prng.float(min, max),
    prng.float(min, max)
  ];
  const randIntAlleles = (min, max) => [
    prng.int(min, max),
    prng.int(min, max)
  ];
  const typicalRGB = species.palette.typicalRGB;
  const rgbJitter = () => prng.int(-15, 15);
  const genRGB = () => [
    Math.max(0, Math.min(255, typicalRGB[0] + rgbJitter())),
    Math.max(0, Math.min(255, typicalRGB[1] + rgbJitter())),
    Math.max(0, Math.min(255, typicalRGB[2] + rgbJitter()))
  ];
  let leafShape = prng.int(0, 6);
  let inflorescence = species.palette.typicalShape;
  let barkRoughness = 0.3;
  let thornDensity = 0;
  let vineMode = 0;
  let petalCount = 5;
  let sepalCount = 5;
  let stamenCount = 8;
  let symmetry = 0;
  let curl = 0.2;
  let stiffness = 1;
  if (species.id === "japanese-bonsai") {
    leafShape = prng.random() < 0.6 ? 4 : 2;
    inflorescence = 0;
    barkRoughness = prng.float(0.4, 0.7);
    thornDensity = prng.float(0, 0.1);
    vineMode = 0;
    petalCount = prng.int(4, 6);
    sepalCount = 5;
    stamenCount = prng.int(6, 10);
    symmetry = 0;
    curl = prng.float(0.2, 0.5);
    stiffness = prng.float(1.1, 1.7);
  } else if (species.id === "zen-bamboo") {
    leafShape = prng.random() < 0.7 ? 0 : 1;
    inflorescence = 3;
    barkRoughness = prng.float(0.1, 0.25);
    thornDensity = 0;
    vineMode = prng.float(0, 0.05);
    petalCount = 3;
    sepalCount = 3;
    stamenCount = 6;
    symmetry = 0;
    curl = prng.float(0, 0.15);
    stiffness = prng.float(0.9, 1.4);
  } else if (species.id === "sakura-orchid") {
    leafShape = prng.random() < 0.5 ? 5 : 6;
    inflorescence = prng.random() < 0.5 ? 1 : 2;
    barkRoughness = prng.float(0.15, 0.35);
    thornDensity = 0;
    vineMode = prng.float(0.05, 0.2);
    petalCount = prng.int(5, 8);
    sepalCount = prng.int(4, 6);
    stamenCount = prng.int(8, 14);
    symmetry = prng.random() < 0.4 ? 1 : 0;
    curl = prng.float(0.1, 0.3);
    stiffness = prng.float(0.55, 1);
  }
  return {
    vigor: randAlleles(species.traitRanges.vigor[0], species.traitRanges.vigor[1]),
    angle: randIntAlleles(species.traitRanges.angle[0], species.traitRanges.angle[1]),
    decay: randAlleles(species.traitRanges.decay[0], species.traitRanges.decay[1]),
    lenScale: randIntAlleles(species.traitRanges.lenScale[0], species.traitRanges.lenScale[1]),
    flowerRGB: [genRGB(), genRGB()],
    flowerRadius: randIntAlleles(3, 8),
    flowerShape: [species.palette.typicalShape, species.palette.typicalShape],
    flowerStretch: [
      [prng.float(0.8, 1.3), prng.float(0.8, 1.3)],
      [prng.float(0.8, 1.3), prng.float(0.8, 1.3)]
    ],
    flowerMaterial: [species.palette.typicalMaterial, species.palette.typicalMaterial],
    budActivationThreshold: [species.hiddenTraits.budActivationThreshold, species.hiddenTraits.budActivationThreshold],
    shadeTolerance: [species.hiddenTraits.shadeTolerance, species.hiddenTraits.shadeTolerance],
    apicalDominance: [species.hiddenTraits.apicalDominance, species.hiddenTraits.apicalDominance],
    internodeElasticity: [species.hiddenTraits.internodeElasticity, species.hiddenTraits.internodeElasticity],
    dormancyStrength: [species.hiddenTraits.dormancyStrength, species.hiddenTraits.dormancyStrength],
    leafShape: [leafShape, leafShape],
    leafSize: randAlleles(0.8, 1.4),
    leafDensity: randAlleles(0.6, 0.85),
    inflorescence: [inflorescence, inflorescence],
    petalCount: [petalCount, petalCount],
    sepalCount: [sepalCount, sepalCount],
    stamenCount: [stamenCount, stamenCount],
    symmetry: [symmetry, symmetry],
    curl: [curl, curl],
    windSensitivity: randAlleles(0.3, 0.7),
    barkRoughness: [barkRoughness, barkRoughness],
    thornDensity: [thornDensity, thornDensity],
    vineMode: [vineMode, vineMode],
    stiffness: [stiffness, stiffness]
  };
}

// src/render/textures.ts
function renderWoodBarkTexture(ctx, x1, y1, x2, y2, thick, woodiness) {
  if (thick < 2)
    return;
  ctx.save();
  ctx.strokeStyle = `rgba(30, 15, 5, ${0.35 * woodiness})`;
  ctx.lineWidth = Math.max(0.5, thick * 0.15);
  ctx.lineCap = "round";
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 2) {
    ctx.restore();
    return;
  }
  const nx = -dy / len;
  const ny = dx / len;
  ctx.beginPath();
  ctx.moveTo(x1 + nx * thick * 0.3, y1 + ny * thick * 0.3);
  ctx.lineTo(x2 + nx * thick * 0.3, y2 + ny * thick * 0.3);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x1 - nx * thick * 0.3, y1 - ny * thick * 0.3);
  ctx.lineTo(x2 - nx * thick * 0.3, y2 - ny * thick * 0.3);
  ctx.stroke();
  ctx.restore();
}

// src/render/morphology.ts
function drawModularLeaf(ctx, morphology, size, color, highlightColor) {
  ctx.save();
  const grad = ctx.createRadialGradient(0, 0, 1, 0, 0, size);
  grad.addColorStop(0, highlightColor);
  grad.addColorStop(1, color);
  ctx.fillStyle = grad;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.25)";
  ctx.lineWidth = 0.75;
  if (morphology === "needle") {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -size * 1.8);
    ctx.stroke();
  } else if (morphology === "palmate") {
    for (let i = -2;i <= 2; i++) {
      ctx.save();
      ctx.rotate(i * Math.PI / 6);
      ctx.beginPath();
      ctx.ellipse(0, -size * 0.5, size * 0.2, size * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  } else if (morphology === "pinnate") {
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 0.6, size * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    for (let i = -2;i <= 2; i++) {
      if (i === 0)
        continue;
      ctx.beginPath();
      ctx.ellipse(i * size * 0.3, i * size * 0.1, size * 0.2, size * 0.12, 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  } else if (morphology === "lobed") {
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.8);
    ctx.bezierCurveTo(size * 0.6, -size * 0.4, size * 0.8, size * 0.4, 0, size * 0.8);
    ctx.bezierCurveTo(-size * 0.8, size * 0.4, -size * 0.6, -size * 0.4, 0, -size * 0.8);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 0.7, size * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}
function drawModularFlower(ctx, morphology, petalCount, radius, petalColor, stamenColor) {
  ctx.save();
  const count = Math.max(3, Math.min(12, petalCount));
  if (morphology === "umbel" || morphology === "compound") {
    for (let f = 0;f < 5; f++) {
      ctx.save();
      const angle = f / 5 * Math.PI * 2;
      ctx.translate(Math.cos(angle) * radius * 0.8, Math.sin(angle) * radius * 0.8);
      drawSingleFloret(ctx, count, radius * 0.5, petalColor, stamenColor);
      ctx.restore();
    }
  } else {
    drawSingleFloret(ctx, count, radius, petalColor, stamenColor);
  }
  ctx.restore();
}
function drawSingleFloret(ctx, count, radius, petalColor, stamenColor) {
  ctx.fillStyle = petalColor;
  ctx.strokeStyle = "rgba(0,0,0,0.15)";
  ctx.lineWidth = 1;
  for (let i = 0;i < count; i++) {
    const angle = i / count * Math.PI * 2;
    ctx.save();
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.ellipse(0, -radius * 0.7, radius * 0.4, radius * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  ctx.fillStyle = stamenColor;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.3, 0, Math.PI * 2);
  ctx.fill();
}

// src/render/canvas.ts
var globalNodeDisp = new Map;
function renderPlant(ctx, state, w, h) {
  ctx.clearRect(0, 0, w, h);
  const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
  if (state.darkMode) {
    bgGrad.addColorStop(0, "#090d16");
    bgGrad.addColorStop(0.5, "#111827");
    bgGrad.addColorStop(1, "#1f2937");
  } else {
    bgGrad.addColorStop(0, "#fafaf9");
    bgGrad.addColorStop(0.5, "#f5f5f4");
    bgGrad.addColorStop(1, "#e7e5e4");
  }
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  const ox = w / 2 + (state.cameraX ?? 0);
  const oy = h * 0.82 + (state.cameraY ?? 0);
  const zoom = state.cameraZoom ?? 1;
  const baseScale = Math.min(w / 400, h / 500);
  const scale = baseScale * zoom;
  ctx.translate(ox, oy);
  ctx.fillStyle = state.darkMode ? "rgba(0, 0, 0, 0.6)" : "rgba(0, 0, 0, 0.15)";
  ctx.beginPath();
  ctx.ellipse(0, 22, 110, 22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = state.darkMode ? "#1e293b" : "#44403c";
  ctx.beginPath();
  ctx.roundRect(-85, 2, 170, 36, [6, 6, 16, 16]);
  ctx.fill();
  ctx.strokeStyle = state.darkMode ? "#334155" : "#292524";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.strokeStyle = state.darkMode ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(-88, 0, 176, 8, [4]);
  ctx.stroke();
  ctx.scale(scale, scale);
  const g = state.genome;
  const childrenByParent = new Map;
  for (const n of state.nodes) {
    const arr = childrenByParent.get(n.parentId);
    if (arr)
      arr.push(n);
    else
      childrenByParent.set(n.parentId, [n]);
  }
  const weightCache = new Map;
  const sagCache = new Map;
  for (let i = state.nodes.length - 1;i >= 0; i--) {
    const n = state.nodes[i];
    let w = n.type === "leaf" ? 0.6 : n.type === "flower" ? 1 : 0.04 * n.length;
    const kids = childrenByParent.get(n.id) ?? [];
    for (const c of kids) {
      w += weightCache.get(c.id) ?? 0;
    }
    weightCache.set(n.id, w);
    if (n.type === "stem" || n.type === "meristem") {
      const stiffness = Math.max(0.1, expressTrait(g, "stiffness") * Math.pow(0.82, n.depth));
      const sag = Math.min(0.65, w * 0.012 / stiffness);
      sagCache.set(n.id, sag);
    }
  }
  globalNodeDisp.clear();
  globalNodeDisp.set(0, { wx: state.root.x, wy: state.root.y, angle: state.root.angle });
  for (const n of state.nodes) {
    if (n.type === "stem" || n.type === "meristem") {
      const parentDisp = n.parentId !== null ? globalNodeDisp.get(n.parentId) : undefined;
      const startX = parentDisp ? parentDisp.wx : n.x;
      const startY = parentDisp ? parentDisp.wy : n.y;
      const sag = sagCache.get(n.id) ?? 0;
      const effectiveAngle = n.angle + sag * 0.4;
      const endX = startX + Math.cos(effectiveAngle) * n.length;
      const endY = startY + Math.sin(effectiveAngle) * n.length + sag * n.length * 0.7;
      globalNodeDisp.set(n.id, { wx: endX, wy: endY, angle: effectiveAngle });
      const wood = Math.min(1, n.age / 30);
      const r = Math.round(70 * wood + 38 * (1 - wood));
      const gr = Math.round(38 * wood + 22 * (1 - wood));
      const b = Math.round(18 * wood + 10 * (1 - wood));
      const depthFactor = Math.max(0.3, 1 - n.depth / 6 * 0.5);
      const thickness = Math.max(2, 12 * depthFactor * Math.pow(0.85, n.depth));
      ctx.strokeStyle = state.darkMode ? "rgba(0, 0, 0, 0.45)" : "rgba(40, 25, 15, 0.25)";
      ctx.lineWidth = thickness + 2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(startX + 2, startY + 2);
      ctx.lineTo(endX + 2, endY + 2);
      ctx.stroke();
      ctx.strokeStyle = `rgb(${r},${gr},${b})`;
      ctx.lineWidth = thickness;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      renderWoodBarkTexture(ctx, startX, startY, endX, endY, thickness, wood);
    }
  }
  const leafTypes = ["simple", "palmate", "pinnate", "lobed", "needle"];
  const flowerTypes = ["solitary", "raceme", "umbel", "panicle", "compound"];
  const leafTrait = expressTrait(g, "leafShape") || 0;
  const selectedLeafMorphology = leafTypes[Math.abs(leafTrait) % leafTypes.length];
  const inflorescenceTrait = expressTrait(g, "inflorescence");
  const selectedFlowerMorphology = flowerTypes[Math.abs(inflorescenceTrait) % flowerTypes.length];
  const flowerRGB = expressTrait(g, "flowerRGB") || [236, 72, 153];
  const basePetalColor = `rgb(${flowerRGB[0]}, ${flowerRGB[1]}, ${flowerRGB[2]})`;
  const seedHash = Math.abs(JSON.stringify(g).split("").reduce((acc, char) => acc + char.charCodeAt(0), 0));
  const rareExoticRoll = seedHash % 100;
  const baseHue = rareExoticRoll < 10 ? 35 : rareExoticRoll < 18 ? 340 : rareExoticRoll < 25 ? 270 : 90 + seedHash % 120;
  for (const n of state.nodes) {
    if (n.type === "leaf" && n.fallState !== "falling") {
      const parentDisp = globalNodeDisp.get(n.parentId ?? 0) ?? { wx: n.x, wy: n.y, angle: n.angle };
      ctx.save();
      const maturity = Math.min(1, (n.age ?? 1) / 5);
      ctx.translate(parentDisp.wx, parentDisp.wy);
      ctx.rotate(parentDisp.angle + (n.id % 2 === 0 ? 0.7 : -0.7));
      ctx.scale(maturity, maturity);
      const leafHueOffset = Math.abs(n.id * 17) % 25 - 12;
      const currentHue = (baseHue + leafHueOffset + 360) % 360;
      const activeBase = state.darkMode ? `hsl(${currentHue}, 50%, ${28 + n.id % 6}%)` : `hsl(${currentHue}, 55%, ${38 + n.id % 6}%)`;
      const activeTip = state.darkMode ? `hsl(${currentHue}, 60%, ${45 + n.id % 6}%)` : `hsl(${currentHue}, 65%, ${52 + n.id % 6}%)`;
      drawModularLeaf(ctx, selectedLeafMorphology, 14, activeBase, activeTip);
      ctx.restore();
    } else if (n.type === "flower") {
      const parentDisp = globalNodeDisp.get(n.parentId ?? 0) ?? { wx: n.x, wy: n.y, angle: n.angle };
      ctx.save();
      ctx.translate(parentDisp.wx, parentDisp.wy);
      const isPolyploid = Math.abs(n.id * 13) % 11 === 0;
      const flowerScale = isPolyploid ? 1.4 : 1;
      ctx.scale(flowerScale, flowerScale);
      const petalCount = expressTrait(g, "petalCount") || 5;
      drawModularFlower(ctx, selectedFlowerMorphology, petalCount + (isPolyploid ? 2 : 0), 10, basePetalColor, "#facc15");
      ctx.restore();
    }
  }
  ctx.restore();
  return "Masterpiece Bonsai · " + (state.darkMode ? "Night" : "Day");
}
function computeTransform(w, h, showRoots, cameraX = 0, cameraY = 0, cameraZoom = 1) {
  const baseScale = Math.min(w / 400, h / (showRoots ? 650 : 500));
  const scale = baseScale * cameraZoom;
  const ox = w / 2 + cameraX;
  const oy = (showRoots ? h * 0.6 : h * 0.82) + cameraY;
  return { scale, ox, oy };
}
function getWindDisp() {
  return globalNodeDisp;
}

// src/export/plugin.ts
var PLUGIN_VERSION = "1.0.0";
function exportPlantJSON(state) {
  return JSON.stringify({
    version: PLUGIN_VERSION,
    step: state.step,
    cycleLength: state.cycleLength,
    idCounter: state.idCounter,
    genome: state.genome,
    speciesId: state.speciesId ?? "unknown",
    resources: state.resources,
    environment: state.environment,
    nodes: state.nodes
  });
}
function importPlantJSON(json) {
  const d = JSON.parse(json);
  if (!d || typeof d !== "object") {
    throw new Error("Invalid JSON: Root must be an object");
  }
  if (!Array.isArray(d.nodes) || d.nodes.length === 0) {
    throw new Error("Invalid Plant Data: No nodes found");
  }
  if (!d.genome || typeof d.genome !== "object") {
    throw new Error("Invalid Plant Data: Missing genome");
  }
  return {
    idCounter: typeof d.idCounter === "number" ? d.idCounter : 0,
    step: typeof d.step === "number" ? d.step : 0,
    cycleLength: typeof d.cycleLength === "number" ? d.cycleLength : 200,
    root: d.nodes[0],
    nodes: d.nodes,
    genome: d.genome,
    speciesId: d.speciesId || "unknown",
    resources: d.resources || { energy: 0, water: 0, structural: 0 },
    environment: d.environment || { lightDirection: [1, 0], gravity: 0.1, seasonIndex: 0, temperature: 20 },
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
    isRecording: false
  };
}
function plantToSVG(state, w = 400, h = 500) {
  const ox = w / 2, oy = h - 40;
  const g = state.genome;
  const bg = state.darkMode ? "#050508" : "#f8f4e8";
  const season = state.step % state.cycleLength;
  const parts = [];
  const fmt = (v) => Number.isFinite(v) ? v.toFixed(1) : "0.0";
  for (const n of state.nodes) {
    if (n.type === "root" && !state.showRoots)
      continue;
    const len = n.length || n.targetLength || 0;
    const ex = n.x + Math.cos(n.angle) * len;
    const ey = n.y + Math.sin(n.angle) * len;
    const falling = n.fallState === "falling";
    const op = falling ? ` opacity="0.45"` : "";
    if (n.type === "stem" || n.type === "meristem") {
      const wood = Math.min(1, n.age / 50);
      const r = Math.round(140 * wood + 38 * (1 - wood));
      const gg = Math.round(69 * wood + 173 * (1 - wood));
      const b = Math.round(18 * wood + 97 * (1 - wood));
      const thick = Math.max(0.6, 3.2 * Math.pow(0.72, n.depth)).toFixed(2);
      const mx = (n.x + ex) / 2;
      const my = (n.y + ey) / 2;
      const perpX = -(ey - n.y);
      const perpY = ex - n.x;
      const clen = Math.sqrt(perpX * perpX + perpY * perpY) || 1;
      const cx = mx + perpX / clen * n.curve * len * 0.4;
      const cy = my + perpY / clen * n.curve * len * 0.4;
      parts.push(`<path d="M${fmt(ox + n.x)} ${fmt(oy + n.y)} Q${fmt(ox + cx)} ${fmt(oy + cy)} ${fmt(ox + ex)} ${fmt(oy + ey)}" stroke="rgb(${r},${gg},${b})" stroke-width="${thick}" fill="none" stroke-linecap="round"${op}/>`);
      if (n.isCut) {
        parts.push(`<line x1="${fmt(ox + ex - 3)}" y1="${fmt(oy + ey)}" x2="${fmt(ox + ex + 3)}" y2="${fmt(oy + ey)}" stroke="#ffbb00" stroke-width="${(Number(thick) + 1).toFixed(2)}" stroke-linecap="round"/>`);
      }
      if (n.hasThorns) {
        for (let t = 0;t < 3; t++) {
          const frac = (t + 1) / 4;
          const tx = ox + n.x + (ex - n.x) * frac;
          const ty = oy + n.y + (ey - n.y) * frac;
          const side = t % 2 === 0 ? 1 : -1;
          parts.push(`<circle cx="${fmt(tx)}" cy="${fmt(ty)}" r="${(0.9 + side * 0.1).toFixed(1)}" fill="#5D4037"${op}/>`);
        }
      }
    } else if (n.type === "leaf") {
      let c = "#2ecc71";
      if (season > 140 && season <= 180)
        c = season - 140 > 20 ? "#e67e22" : "#f1c40f";
      else if (season > 180)
        c = "#8b6914";
      else if (n.leafHueShift > 5)
        c = "#3ddc84";
      else if (n.leafHueShift < -5)
        c = "#1fa855";
      const rx = Math.max(0.5, n.length * expressTrait(g, "leafSize") * (n.leafSizeJitter || 1) / 2);
      const ry = Math.max(0.3, rx / 2.4);
      parts.push(`<ellipse cx="${fmt(ox + n.x)}" cy="${fmt(oy + n.y)}" rx="${fmt(rx)}" ry="${fmt(ry)}" fill="${c}" transform="rotate(${(n.angle * 180 / Math.PI).toFixed(1)} ${fmt(ox + n.x)} ${fmt(oy + n.y)})"${op}/>`);
    } else if (n.type === "flower") {
      if (n.fruitAge > 0) {
        const prog = Math.min(1, n.fruitAge / 100);
        const fr = Math.round(80 + prog * 120);
        const fg = Math.round(120 - prog * 80);
        const fb = Math.round(40 - prog * 20);
        const frR = Math.min(5, 3 + n.fruitAge * 0.02).toFixed(1);
        parts.push(`<circle cx="${fmt(ox + n.x)}" cy="${fmt(oy + n.y)}" r="${frR}" fill="rgb(${fr},${fg},${fb})"${op}/>`);
      } else {
        const radius = expressTrait(g, "flowerRadius");
        const rgb = expressTrait(g, "flowerRGB");
        parts.push(`<circle cx="${fmt(ox + n.x)}" cy="${fmt(oy + n.y)}" r="${radius}" fill="rgb(${rgb[0]},${rgb[1]},${rgb[2]})"${op}/>`);
        for (let i = 0;i < Math.min(expressTrait(g, "petalCount"), 12); i++) {
          const a = i / Math.min(expressTrait(g, "petalCount"), 12) * Math.PI * 2;
          const px = ox + n.x + Math.cos(a) * radius * 0.9;
          const py = oy + n.y + Math.sin(a) * radius * 0.9;
          parts.push(`<circle cx="${fmt(px)}" cy="${fmt(py)}" r="${(radius * 0.45).toFixed(1)}" fill="rgb(${rgb[0]},${rgb[1]},${rgb[2]})" opacity="0.85"/>`);
        }
      }
    } else if (n.type === "bud") {
      parts.push(`<circle cx="${fmt(ox + n.x)}" cy="${fmt(oy + n.y)}" r="2" fill="#f39c12"${op}/>`);
    } else if (n.type === "root") {
      parts.push(`<line x1="${fmt(ox + n.x)}" y1="${fmt(oy + n.y)}" x2="${fmt(ox + ex)}" y2="${fmt(oy + ey)}" stroke="#8B7355" stroke-width="${Math.max(0.3, 2 * Math.pow(0.7, n.depth)).toFixed(2)}" stroke-linecap="round"/>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${bg}"/>${parts.join("")}</svg>`;
}

// src/audio/soundscape.ts
var audioCtx = null;
var masterGain = null;
var isMuted = false;
var volume = 0.7;
function getAudioContext() {
  if (typeof window === "undefined")
    return null;
  if (!audioCtx) {
    const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
    if (AudioCtxClass) {
      audioCtx = new AudioCtxClass;
      masterGain = audioCtx.createGain();
      masterGain.gain.setValueAtTime(isMuted ? 0 : volume, audioCtx.currentTime);
      masterGain.connect(audioCtx.destination);
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}
function playPruneSound() {
  const ctx = getAudioContext();
  if (!ctx || isMuted)
    return;
  const now = ctx.currentTime;
  const bufferSize = ctx.sampleRate * 0.08;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0;i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.02));
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(3200, now);
  filter.Q.setValueAtTime(3, now);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.6 * volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
  noise.connect(filter);
  filter.connect(gain);
  if (masterGain)
    gain.connect(masterGain);
  noise.start(now);
  noise.stop(now + 0.08);
  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(850, now);
  osc.frequency.exponentialRampToValueAtTime(180, now + 0.05);
  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0.4 * volume, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
  osc.connect(oscGain);
  if (masterGain)
    oscGain.connect(masterGain);
  osc.start(now);
  osc.stop(now + 0.05);
}
function playGrowSound(noteIndex = 0) {
  const ctx = getAudioContext();
  if (!ctx || isMuted)
    return;
  const now = ctx.currentTime;
  const pentatonic = [261.63, 293.66, 329.63, 392, 440, 523.25, 587.33];
  const freq = pentatonic[noteIndex % pentatonic.length];
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, now);
  const osc2 = ctx.createOscillator();
  osc2.type = "triangle";
  osc2.frequency.setValueAtTime(freq * 2, now);
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(1200, now);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.25 * volume, now + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
  osc.connect(filter);
  osc2.connect(filter);
  filter.connect(gain);
  if (masterGain)
    gain.connect(masterGain);
  osc.start(now);
  osc2.start(now);
  osc.stop(now + 0.6);
  osc2.stop(now + 0.6);
}
function playWaterSound() {
  const ctx = getAudioContext();
  if (!ctx || isMuted)
    return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  const startFreq = 800 + Math.random() * 400;
  osc.frequency.setValueAtTime(startFreq, now);
  osc.frequency.exponentialRampToValueAtTime(startFreq * 0.6, now + 0.12);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.3 * volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
  osc.connect(gain);
  if (masterGain)
    gain.connect(masterGain);
  osc.start(now);
  osc.stop(now + 0.12);
}
function playSaveSound() {
  const ctx = getAudioContext();
  if (!ctx || isMuted)
    return;
  const now = ctx.currentTime;
  const freqs = [261.63, 392, 659.25];
  freqs.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    osc.type = idx === 0 ? "triangle" : "sine";
    osc.frequency.setValueAtTime(freq, now);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.2 * volume, now + 0.05 + idx * 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.8 + idx * 0.2);
    osc.connect(gain);
    if (masterGain)
      gain.connect(masterGain);
    osc.start(now);
    osc.stop(now + 2);
  });
}

// src/ui/app.ts
window.debugState = () => {
  if (!window.state)
    return "State not initialized";
  return JSON.stringify({
    nodesCount: window.state.nodes.length,
    rootLen: window.state.nodes[0]?.length,
    step: window.state.step,
    species: window.state.speciesId
  }, null, 2);
};
var $ = (id) => document.getElementById(id);
var canvas = $("plant");
var ctx = canvas.getContext("2d");
var prng = createPrng(42);
var seed = 42;
window.state = null;
var greenhouse = [];
var selected = [];
var playing = true;
var windEnabled = false;
try {
  const saved = localStorage.getItem("zenplant.greenhouse");
  if (saved)
    greenhouse = JSON.parse(saved);
} catch {}
function persist() {
  try {
    localStorage.setItem("zenplant.greenhouse", JSON.stringify(greenhouse));
  } catch {}
}
function newPlant(newSeed = Math.random() * 1e9 | 0) {
  const win = window;
  if (win.state && win.state.nodes.length > 0) {
    greenhouse.push(JSON.parse(JSON.stringify(win.state)));
    persist();
  }
  seed = newSeed;
  prng = createPrng(seed);
  const sp = SPECIES[Math.floor(Math.random() * SPECIES.length)];
  const genome = generateGenomeForSpecies(sp, seed);
  win.state = freshState(genome, sp, { seed });
  console.log("Simulation: New plant initialized. Starting growth...");
  for (let i = 0;i < 80; i++)
    win.state = growOnce(win.state, prng);
  console.log(`Simulation: Initial growth complete. Nodes: ${win.state.nodes.length}`);
  draw();
}
function draw() {
  const r = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const needResize = canvas.width !== Math.floor(r.width * dpr) || canvas.height !== Math.floor(r.height * dpr);
  if (needResize) {
    canvas.width = Math.floor(r.width * dpr);
    canvas.height = Math.floor(r.height * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const win = window;
  if (!win.state)
    return;
  console.log(`Draw: Nodes=${win.state.nodes.length}, RootLen=${win.state.nodes[0]?.length}, Step=${win.state.step}`);
  const info = renderPlant(ctx, win.state, r.width, r.height);
  const [name, color] = info.split("|");
  const badge = $("season-badge");
  badge.textContent = `${name} · step ${win.state.step} · seed ${seed}`;
  badge.style.color = color;
  const g = win.state.genome;
  const sp = getSpeciesById(win.state.speciesId) || SPECIES[0];
  const isIdentified = win.state.nodes.length > 20;
  const speciesName = isIdentified ? sp.name : "Unknown Species";
  $("genome-info").innerHTML = `Vigor ${expressTrait(g, "vigor").toFixed(2)} · Angle ${expressTrait(g, "angle").toFixed(0)}° · Len ${expressTrait(g, "lenScale").toFixed(0)}<br>` + `${speciesName} · Nodes ${win.state.nodes.length}`;
  renderSlots();
}
function renderSlots() {
  const box = $("slots-container");
  if (greenhouse.length === 0) {
    box.innerHTML = '<div style="font-size:11px;color:#64748b;text-align:center">Save plants for breeding.</div>';
    $("btn-breed").style.display = "none";
    return;
  }
  box.innerHTML = greenhouse.map((s, i) => {
    const sel = selected.includes(i) ? "selected" : "";
    const rgb = expressTrait(s.genome, "flowerRGB");
    return `<div class="slot ${sel}" data-i="${i}"><span>#${i + 1} · step ${s.step} · ${s.nodes.length} nodes</span><span class="slot-color" style="background:rgb(${rgb[0]},${rgb[1]},${rgb[2]})"></span></div>`;
  }).join("");
  box.querySelectorAll(".slot").forEach((el) => {
    el.addEventListener("click", () => {
      const i = Number(el.dataset.i);
      const at = selected.indexOf(i);
      if (at > -1)
        selected.splice(at, 1);
      else {
        if (selected.length >= 2)
          selected.shift();
        selected.push(i);
      }
      draw();
    });
  });
  const bb = $("btn-breed");
  if (selected.length === 2) {
    bb.style.display = "block";
    bb.textContent = `Breed #${selected[0] + 1} + #${selected[1] + 1}`;
  } else
    bb.style.display = "none";
}
function projectOnSeg(p, v, w) {
  const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2;
  if (l2 === 0)
    return { dist: Math.hypot(p.x - v.x, p.y - v.y), t: 1, v, w };
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  const dist = Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
  return { dist, t, v, w };
}
canvas.style.touchAction = "none";
var dragging = false;
var dragStartX = 0;
var dragStartY = 0;
var dragStartCamX = 0;
var dragStartCamY = 0;
var dragMoved = false;
function pruneAt(clientX, clientY) {
  if (dragMoved)
    return;
  const r = canvas.getBoundingClientRect();
  const win = window;
  const { scale, ox, oy } = computeTransform(r.width, r.height, win.state?.showRoots ?? false, win.state?.cameraX ?? 0, win.state?.cameraY ?? 0, win.state?.cameraZoom ?? 1);
  const wx = (clientX - r.left - ox) / scale;
  const wy = (clientY - r.top - oy) / scale;
  const disp = getWindDisp();
  let best = null;
  let bestD = 8;
  let bestSeg = null;
  if (win.state) {
    for (const n of win.state.nodes) {
      if (n.type !== "stem" && n.type !== "meristem")
        continue;
      const parentD = n.parentId !== null ? disp.get(n.parentId) : undefined;
      const sx = parentD ? parentD.wx : n.x;
      const sy = parentD ? parentD.wy : n.y;
      const childD = disp.get(n.id);
      const ex = childD ? childD.wx : n.x + Math.cos(n.angle) * n.length;
      const ey = childD ? childD.wy : n.y + Math.sin(n.angle) * n.length;
      const hit = projectOnSeg({ x: wx, y: wy }, { x: sx, y: sy }, { x: ex, y: ey });
      if (hit.dist < bestD) {
        bestD = hit.dist;
        best = n.id;
        bestSeg = { sx, sy, ex, ey };
      }
    }
  }
  if (best !== null && win.state && bestSeg) {
    win.state = precisionSplitAndPrune(win.state, best, { x: wx, y: wy }, bestSeg);
    try {
      playPruneSound();
    } catch {}
    draw();
  }
}
canvas.addEventListener("pointerdown", () => {
  getAudioContext();
});
canvas.addEventListener("click", (e) => pruneAt(e.clientX, e.clientY));
canvas.addEventListener("mousedown", (e) => {
  dragging = true;
  dragMoved = false;
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  const win = window;
  dragStartCamX = win.state?.cameraX ?? 0;
  dragStartCamY = win.state?.cameraY ?? 0;
});
window.addEventListener("mousemove", (e) => {
  if (!dragging)
    return;
  const dx = e.clientX - dragStartX;
  const dy = e.clientY - dragStartY;
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3)
    dragMoved = true;
  const win = window;
  if (win.state) {
    win.state.cameraX = dragStartCamX + dx;
    win.state.cameraY = dragStartCamY + dy;
  }
  draw();
}, { passive: false });
window.addEventListener("mouseup", () => {
  dragging = false;
});
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const delta = e.deltaY > 0 ? -0.1 : 0.1;
  const win = window;
  if (win.state) {
    win.state.cameraZoom = Math.max(0.3, Math.min(3, win.state.cameraZoom + delta));
  }
  draw();
}, { passive: false });
$("btn-grow").addEventListener("click", () => {
  getAudioContext();
  const win = window;
  for (let i = 0;i < 10; i++)
    if (win.state)
      win.state = growOnce(win.state, prng);
  playGrowSound(Math.floor(Math.random() * 5));
  draw();
});
$("btn-grow-season").addEventListener("click", () => {
  getAudioContext();
  const win = window;
  for (let i = 0;i < 50; i++)
    if (win.state)
      win.state = growOnce(win.state, prng);
  playGrowSound(2);
  draw();
});
$("btn-reset").addEventListener("click", () => {
  getAudioContext();
  playWaterSound();
  newPlant();
});
$("btn-play").addEventListener("click", (e) => {
  playing = !playing;
  e.target.textContent = playing ? "Pause" : "Play";
});
$("btn-save").addEventListener("click", () => {
  getAudioContext();
  const win = window;
  if (win.state)
    greenhouse.push(JSON.parse(JSON.stringify(win.state)));
  playSaveSound();
  persist();
  draw();
});
$("btn-breed").addEventListener("click", () => {
  if (selected.length !== 2)
    return;
  const g0 = greenhouse[selected[0]].genome;
  const g1 = greenhouse[selected[1]].genome;
  const child = breedGenomes(g0, g1, prng);
  const win = window;
  win.state = freshState(child, SPECIES[0], { seed: Math.random() * 1e9 | 0 });
  for (let i = 0;i < 30; i++)
    win.state = growOnce(win.state, prng);
  selected = [];
  draw();
});
$("btn-pro").addEventListener("click", () => {
  const p = $("pro-panel");
  p.style.display = p.style.display === "none" ? "block" : "none";
});
$("btn-export").addEventListener("click", () => {
  const win = window;
  if (!win.state)
    return;
  const blob = new Blob([exportPlantJSON(win.state)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `zenplant-step${win.state.step}-seed${seed}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});
$("btn-svg").addEventListener("click", () => {
  const win = window;
  if (!win.state)
    return;
  const blob = new Blob([plantToSVG(win.state, 400, 500)], { type: "image/svg+xml" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `zenplant-step${win.state.step}.svg`;
  a.click();
  URL.revokeObjectURL(a.href);
});
$("btn-png")?.addEventListener("click", () => {
  const win = window;
  if (!win.state)
    return;
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = `zenplant-step${win.state.step}-seed${seed}.png`;
  a.click();
});
$("btn-timelapse")?.addEventListener("click", (e) => {
  const win = window;
  if (!win.state)
    return;
  win.state.isRecording = !win.state.isRecording;
  e.target.textContent = win.state.isRecording ? `Stop (${win.state.timelapseFrames.length})` : "Record Timelapse";
  if (!win.state.isRecording && win.state.timelapseFrames.length > 0) {
    const a = document.createElement("a");
    a.href = win.state.timelapseFrames[win.state.timelapseFrames.length - 1];
    a.download = `zenplant-frame${win.state.timelapseFrames.length}.webp`;
    a.click();
    win.state.timelapseFrames = [];
  }
});
var speedSlider = $("grow-speed");
var speedLabel = $("speed-label");
if (speedSlider) {
  speedSlider.addEventListener("input", () => {
    const win = window;
    if (win.state)
      win.state.growSpeed = parseFloat(speedSlider.value);
    if (speedLabel)
      speedLabel.textContent = (win.state?.growSpeed ?? 1) + "×";
  });
}
$("btn-import").addEventListener("click", () => $("import-file").click());
$("import-file").addEventListener("change", async (e) => {
  const f = e.target.files?.[0];
  if (!f)
    return;
  const win = window;
  win.state = importPlantJSON(await f.text());
  prng = createPrng(win.state.step + seed);
  draw();
});
$("btn-dark").addEventListener("click", () => {
  const win = window;
  if (win.state) {
    win.state.darkMode = !win.state.darkMode;
    document.body.classList.toggle("dark-mode", win.state.darkMode);
  }
  draw();
});
$("btn-wood").addEventListener("click", (e) => {
  const win = window;
  if (win.state) {
    win.state.woodTexture = !win.state.woodTexture;
    e.target.textContent = win.state.woodTexture ? "Wood: ON" : "Wood: OFF";
  }
  draw();
});
$("btn-wind").addEventListener("click", (e) => {
  windEnabled = !windEnabled;
  e.target.textContent = windEnabled ? "Wind: ON" : "Wind: OFF";
});
var resizeRaf = null;
function scheduleDraw() {
  if (resizeRaf !== null)
    return;
  resizeRaf = requestAnimationFrame(() => {
    resizeRaf = null;
    draw();
  });
}
window.addEventListener("resize", scheduleDraw);
window.addEventListener("orientationchange", () => setTimeout(draw, 150));
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", scheduleDraw);
}
var lastWindTime = performance.now();
var lastGrowTime = performance.now();
function animLoop(now) {
  const dt = (now - lastWindTime) / 1000;
  lastWindTime = now;
  const win = window;
  if (windEnabled && win.state) {
    win.state.windTime += dt * 2;
    draw();
  }
  const growInterval = win.state?.growSpeed > 0 ? 180 / win.state.growSpeed : 999999;
  if (playing && win.state && now - lastGrowTime > growInterval) {
    win.state = growOnce(win.state, prng);
    lastGrowTime = now;
    if (!windEnabled)
      draw();
  }
  if (win.state?.isRecording && win.state.timelapseFrames.length < 300) {
    win.state.timelapseFrames.push(canvas.toDataURL("image/webp", 0.8));
    const recBtn = $("btn-timelapse");
    if (recBtn)
      recBtn.textContent = `Stop (${win.state.timelapseFrames.length})`;
  }
  requestAnimationFrame(animLoop);
}
requestAnimationFrame(animLoop);
newPlant();
