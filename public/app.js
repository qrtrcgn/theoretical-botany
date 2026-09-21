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
  if (season === 0 || season === 80 || newState.soilMoisture && newState.soilMoisture > 0.65 && newState.step % 25 === 0) {
    budActivation(newState, prng);
  }
  if (season < 160 || newState.soilMoisture && newState.soilMoisture > 0.55) {
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
  const moistureBonus = Math.max(0, ((state.soilMoisture ?? 0.5) - 0.4) * 0.06);
  const breakChance = (BUDBREAK_CHANCE_PER_STEP + moistureBonus) * densityBrake;
  for (const n of state.nodes) {
    if (n.type !== "bud" || n.budState !== "dormant")
      continue;
    if (prng.random() >= breakChance)
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
  let descendantCount = 0;
  const dStack = [targetNodeId];
  while (dStack.length > 0) {
    const cur = dStack.pop();
    for (const n of state.nodes) {
      if (n.parentId === cur) {
        descendantCount++;
        dStack.push(n.id);
      }
    }
  }
  const wood = Math.min(1, (targetNode.age ?? 0) / 80);
  const thickness = Math.max(1.2, Math.sqrt(descendantCount + 1) * 1.35 + wood * 1.8);
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
  const isBroken = Boolean(targetNode.isBroken);
  const waterLoss = isBroken ? thickness * 6.5 : thickness > 3 ? thickness * 3.8 : 1.2;
  const energyLoss = isBroken ? thickness * 4.5 : thickness > 3 ? thickness * 2.2 : 0.8;
  if (newState.resources) {
    newState.resources = {
      energy: Math.max(0, newState.resources.energy - energyLoss),
      water: Math.max(0, newState.resources.water - waterLoss),
      structural: Math.max(0, newState.resources.structural - thickness * 1.5)
    };
  }
  if (thickness > 2.5 || isBroken) {
    const sapDrops = [...newState.sapDrops || []];
    const cutX = targetNode.x + Math.cos(targetNode.angle) * targetNode.length;
    const cutY = targetNode.y + Math.sin(targetNode.angle) * targetNode.length;
    const dropCount = isBroken ? 4 : 2;
    for (let i = 0;i < dropCount; i++) {
      sapDrops.push({
        x: cutX + (Math.random() - 0.5) * thickness * 0.8,
        y: cutY + (Math.random() - 0.5) * thickness * 0.8,
        size: 1.6 + Math.random() * (thickness * 0.3),
        alpha: 0.95,
        vy: 3 + Math.random() * 5
      });
    }
    newState.sapDrops = sapDrops;
  }
  let awakenedAny = false;
  for (const n of newState.nodes) {
    if (n.parentId === targetNodeId || n.parentId === targetNode.parentId) {
      if (n.type === "bud" && n.budState === "dormant") {
        n.type = "meristem";
        n.terminal = true;
        n.budState = "active";
        n.v = Math.max(0.45, expressTrait(state.genome, "vigor") * 0.75);
        n.targetLength = expressTrait(state.genome, "lenScale") * 0.95;
        n.length = 0;
        n.age = 0;
        awakenedAny = true;
      }
    }
  }
  if (!awakenedAny && targetNode.length > 0.8 && newState.nodes.length < MAX_TOTAL_NODES) {
    const stubT = 0.7;
    const budX = targetNode.x + Math.cos(targetNode.angle) * targetNode.length * stubT;
    const budY = targetNode.y + Math.sin(targetNode.angle) * targetNode.length * stubT;
    const side = Math.random() < 0.5 ? -1 : 1;
    newState.nodes.push({
      id: -newState.idCounter++,
      parentId: targetNode.id,
      x: budX,
      y: budY,
      angle: normalizeAngle(targetNode.angle + side * 1.1),
      depth: targetNode.depth + 1,
      type: "meristem",
      terminal: true,
      age: 0,
      length: 0,
      targetLength: expressTrait(state.genome, "lenScale") * 0.9,
      v: Math.max(0.4, expressTrait(state.genome, "vigor") * 0.7),
      budState: "active",
      isCut: false,
      resourceProduction: 0,
      shade: targetNode.shade,
      curve: (Math.random() - 0.5) * 0.3,
      leafSizeJitter: 0,
      leafShapeJitter: 0,
      leafHueShift: 0,
      hasThorns: false,
      fruitAge: 0,
      fallState: "attached",
      fallSeed: Math.random(),
      attachT: stubT
    });
  }
  newState.step++;
  newState.cutAnimTime = 1 + (thickness > 3.5 ? 0.5 : 0);
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
var acerPalmatum = {
  id: "acer-palmatum",
  name: "Momiji Ahorn (Acer)",
  genus: "Acer",
  version: "1.0.0",
  traitRanges: {
    vigor: [0.65, 0.85],
    angle: [28, 42],
    decay: [0.06, 0.1],
    lenScale: [22, 38]
  },
  hiddenTraits: {
    budActivationThreshold: 0.35,
    shadeTolerance: 0.65,
    apicalDominance: 0.95,
    internodeElasticity: 0.85,
    dormancyStrength: 0.55
  },
  leafResourceYield: 1.1,
  seasonalRange: [0, 240],
  palette: {
    typicalRGB: [194, 65, 12],
    typicalShape: 1,
    typicalMaterial: 0
  }
};
var kengaiCascade = {
  id: "kengai-cascade",
  name: "Kengai Kaskade (Juniperus)",
  genus: "Juniperus",
  version: "1.0.0",
  traitRanges: {
    vigor: [0.55, 0.75],
    angle: [38, 55],
    decay: [0.05, 0.09],
    lenScale: [18, 32]
  },
  hiddenTraits: {
    budActivationThreshold: 0.25,
    shadeTolerance: 0.8,
    apicalDominance: 0.7,
    internodeElasticity: 1.2,
    dormancyStrength: 0.7
  },
  leafResourceYield: 0.9,
  seasonalRange: [0, 260],
  palette: {
    typicalRGB: [20, 83, 45],
    typicalShape: 0,
    typicalMaterial: 0
  }
};
var bunjingiPine = {
  id: "bunjingi-pine",
  name: "Bunjingi Literat (Pinus)",
  genus: "Pinus",
  version: "1.0.0",
  traitRanges: {
    vigor: [0.7, 0.9],
    angle: [14, 24],
    decay: [0.07, 0.11],
    lenScale: [35, 55]
  },
  hiddenTraits: {
    budActivationThreshold: 0.45,
    shadeTolerance: 0.5,
    apicalDominance: 1.6,
    internodeElasticity: 0.7,
    dormancyStrength: 0.8
  },
  leafResourceYield: 0.75,
  seasonalRange: [0, 210],
  palette: {
    typicalRGB: [47, 79, 79],
    typicalShape: 0,
    typicalMaterial: 0
  }
};
var SPECIES = [
  japaneseBonsai,
  acerPalmatum,
  kengaiCascade,
  bunjingiPine,
  sakuraOrchid,
  zenBamboo
];
function getSpeciesById(id) {
  const speciesMap = {
    "japanese-bonsai": japaneseBonsai,
    "acer-palmatum": acerPalmatum,
    "kengai-cascade": kengaiCascade,
    "bunjingi-pine": bunjingiPine,
    "sakura-orchid": sakuraOrchid,
    "zen-bamboo": zenBamboo
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
function renderWoodBarkTexture(ctx, x1, y1, x2, y2, thick, woodiness, cx, cy) {
  if (thick < 2 || woodiness <= 0)
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
  const off = thick * 0.3;
  if (cx !== undefined && cy !== undefined) {
    ctx.beginPath();
    ctx.moveTo(x1 + nx * off, y1 + ny * off);
    ctx.quadraticCurveTo(cx + nx * off, cy + ny * off, x2 + nx * off, y2 + ny * off);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x1 - nx * off, y1 - ny * off);
    ctx.quadraticCurveTo(cx - nx * off, cy - ny * off, x2 - nx * off, y2 - ny * off);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(x1 + nx * off, y1 + ny * off);
    ctx.lineTo(x2 + nx * off, y2 + ny * off);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x1 - nx * off, y1 - ny * off);
    ctx.lineTo(x2 - nx * off, y2 - ny * off);
    ctx.stroke();
  }
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
function quadBezierPoint(x0, y0, cx, cy, x1, y1, t) {
  const mt = 1 - t;
  return {
    x: mt * mt * x0 + 2 * mt * t * cx + t * t * x1,
    y: mt * mt * y0 + 2 * mt * t * cy + t * t * y1
  };
}
function closestPointOnQuadratic(p, x0, y0, cx, cy, x1, y1) {
  let best = { t: 0, point: { x: x0, y: y0 }, distance: Infinity };
  const samples = 20;
  for (let i = 0;i <= samples; i++) {
    const t = i / samples;
    const q = quadBezierPoint(x0, y0, cx, cy, x1, y1, t);
    const distance = Math.hypot(p.x - q.x, p.y - q.y);
    if (distance < best.distance)
      best = { t, point: q, distance };
  }
  const start = Math.max(0, best.t - 1 / samples);
  const end = Math.min(1, best.t + 1 / samples);
  for (let i = 0;i <= 10; i++) {
    const t = start + (end - start) * (i / 10);
    const q = quadBezierPoint(x0, y0, cx, cy, x1, y1, t);
    const distance = Math.hypot(p.x - q.x, p.y - q.y);
    if (distance < best.distance)
      best = { t, point: q, distance };
  }
  return best;
}
function normalizeAngle2(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}
var globalNodeDisp = new Map;
var globalStemTransforms = new Map;
function getStemTransforms() {
  return globalStemTransforms;
}
function renderTokonomaScroll(ctx, scrollId, x, y, w, h, darkMode) {
  const silkColor = darkMode ? "#27272a" : "#d7cfc2";
  const washiColor = darkMode ? "#18181b" : "#faf8f5";
  const rollerColor = darkMode ? "#09090b" : "#44403c";
  ctx.strokeStyle = darkMode ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.3)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y - 18);
  ctx.lineTo(x + 12, y);
  ctx.moveTo(x + w / 2, y - 18);
  ctx.lineTo(x + w - 12, y);
  ctx.stroke();
  ctx.fillStyle = silkColor;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = rollerColor;
  ctx.fillRect(x - 6, y + h, w + 12, 8);
  ctx.beginPath();
  ctx.arc(x - 6, y + h + 4, 6, 0, Math.PI * 2);
  ctx.arc(x + w + 6, y + h + 4, 6, 0, Math.PI * 2);
  ctx.fill();
  const artX = x + 10;
  const artY = y + 22;
  const artW = w - 20;
  const artH = h - 44;
  ctx.fillStyle = washiColor;
  ctx.fillRect(artX, artY, artW, artH);
  ctx.fillStyle = "rgba(220, 38, 38, 0.75)";
  ctx.fillRect(artX + artW - 14, artY + artH - 18, 9, 9);
  ctx.strokeStyle = "rgba(254, 242, 242, 0.6)";
  ctx.lineWidth = 0.8;
  if (typeof ctx.strokeRect === "function") {
    ctx.strokeRect(artX + artW - 14, artY + artH - 18, 9, 9);
  }
  if (scrollId === "kakejiku_zen_enso") {
    ctx.save();
    ctx.translate(artX + artW / 2, artY + artH * 0.45);
    const ensoR = Math.min(artW * 0.32, artH * 0.26);
    ctx.strokeStyle = darkMode ? "rgba(255, 255, 255, 0.82)" : "rgba(24, 24, 27, 0.85)";
    ctx.lineWidth = ensoR * 0.28;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(0, 0, ensoR, 0.3, Math.PI * 1.85);
    ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.arc(ensoR * 0.85, -ensoR * 0.3, 2, 0, Math.PI * 2);
    ctx.arc(ensoR * 0.7, -ensoR * 0.6, 1.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else if (scrollId === "kakejiku_harvest_moon") {
    ctx.save();
    const nightGrad = ctx.createLinearGradient(artX, artY, artX, artY + artH);
    nightGrad.addColorStop(0, darkMode ? "#090d16" : "#1e1b4b");
    nightGrad.addColorStop(1, darkMode ? "#18181b" : "#312e81");
    ctx.fillStyle = nightGrad;
    ctx.fillRect(artX, artY, artW, artH);
    const moonX = artX + artW * 0.5;
    const moonY = artY + artH * 0.35;
    const moonR = Math.min(artW * 0.24, 28);
    const halo = ctx.createRadialGradient(moonX, moonY, moonR * 0.5, moonX, moonY, moonR * 2.2);
    halo.addColorStop(0, "rgba(254, 240, 138, 0.4)");
    halo.addColorStop(0.5, "rgba(254, 240, 138, 0.12)");
    halo.addColorStop(1, "rgba(254, 240, 138, 0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR * 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fde047";
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = darkMode ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.45)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(artX + 12, artY + artH);
    ctx.quadraticCurveTo(artX + 18, artY + artH - 35, artX + 26, artY + artH - 70);
    ctx.moveTo(artX + 24, artY + artH);
    ctx.quadraticCurveTo(artX + 32, artY + artH - 45, artX + 38, artY + artH - 85);
    ctx.stroke();
    ctx.restore();
  } else {
    ctx.save();
    const sumiColor = darkMode ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.14)";
    const sumiFront = darkMode ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.28)";
    ctx.fillStyle = sumiColor;
    ctx.beginPath();
    ctx.moveTo(artX, artY + artH * 0.55);
    ctx.lineTo(artX + artW * 0.35, artY + artH * 0.28);
    ctx.lineTo(artX + artW * 0.7, artY + artH * 0.48);
    ctx.lineTo(artX + artW, artY + artH * 0.38);
    ctx.lineTo(artX + artW, artY + artH);
    ctx.lineTo(artX, artY + artH);
    ctx.fill();
    ctx.fillStyle = sumiFront;
    ctx.beginPath();
    ctx.moveTo(artX + artW * 0.2, artY + artH);
    ctx.lineTo(artX + artW * 0.58, artY + artH * 0.46);
    ctx.lineTo(artX + artW * 0.88, artY + artH * 0.62);
    ctx.lineTo(artX + artW, artY + artH * 0.55);
    ctx.lineTo(artX + artW, artY + artH);
    ctx.fill();
    ctx.strokeStyle = sumiFront;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(artX + artW * 0.58, artY + artH * 0.46);
    ctx.lineTo(artX + artW * 0.58, artY + artH * 0.42);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(artX + artW * 0.58, artY + artH * 0.41, 6, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
function renderTokonomaStand(ctx, darkMode) {
  const tableColor = darkMode ? "#0c0a09" : "#1c1917";
  const trimColor = darkMode ? "#1c1917" : "#292524";
  ctx.fillStyle = tableColor;
  ctx.beginPath();
  ctx.roundRect(-102, 36, 204, 8, [2]);
  ctx.fill();
  ctx.strokeStyle = darkMode ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.2)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = trimColor;
  ctx.beginPath();
  ctx.roundRect(-98, 44, 14, 14, [0, 0, 4, 4]);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(84, 44, 14, 14, [0, 0, 4, 4]);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-84, 44);
  ctx.quadraticCurveTo(0, 48, 84, 44);
  ctx.lineTo(84, 40);
  ctx.lineTo(-84, 40);
  ctx.fill();
}
function renderTokonomaAccent(ctx, accentId, x, y, darkMode, windTime, particles) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = darkMode ? "#0c0a09" : "#292524";
  ctx.beginPath();
  ctx.roundRect(-28, -2, 56, 6, [2]);
  ctx.fill();
  ctx.strokeStyle = darkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.3)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = darkMode ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0.2)";
  ctx.beginPath();
  ctx.ellipse(0, 5, 26, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  if (accentId === "koro_celadon_tripod") {
    ctx.fillStyle = darkMode ? "#064e3b" : "#047857";
    ctx.beginPath();
    ctx.moveTo(-12, -2);
    ctx.lineTo(-15, 2);
    ctx.lineTo(-10, 0);
    ctx.moveTo(12, -2);
    ctx.lineTo(15, 2);
    ctx.lineTo(10, 0);
    ctx.fill();
    const celadonGrad = ctx.createRadialGradient(0, -12, 2, 0, -12, 16);
    celadonGrad.addColorStop(0, darkMode ? "#6ee7b7" : "#a7f3d0");
    celadonGrad.addColorStop(1, darkMode ? "#065f46" : "#047857");
    ctx.fillStyle = celadonGrad;
    ctx.beginPath();
    ctx.arc(0, -12, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = darkMode ? "#047857" : "#064e3b";
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = darkMode ? "#d97706" : "#b45309";
    ctx.beginPath();
    ctx.ellipse(0, -22, 11, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, -27, 3, 0, Math.PI * 2);
    ctx.fill();
    if (particles && Math.random() < 0.35) {
      particles.push({
        x,
        y: y - 28,
        vx: (Math.random() - 0.5) * 0.3,
        vy: -0.7 - Math.random() * 0.4,
        life: 1,
        maxLife: 1,
        size: 2.2 + Math.random() * 1.5,
        alpha: 0.55,
        type: "smoke"
      });
    }
  } else if (accentId === "tenpai_bronze_fisherman") {
    ctx.fillStyle = darkMode ? "#475569" : "#334155";
    ctx.beginPath();
    ctx.ellipse(0, -10, 6, 8, 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = darkMode ? "#b45309" : "#78350f";
    ctx.beginPath();
    ctx.moveTo(-10, -16);
    ctx.lineTo(0, -24);
    ctx.lineTo(10, -16);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = darkMode ? "#94a3b8" : "#475569";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(3, -12);
    ctx.quadraticCurveTo(14, -22, 24, -14);
    ctx.lineTo(24, 0);
    ctx.stroke();
  } else if (accentId === "tenpai_bronze_crane") {
    ctx.strokeStyle = darkMode ? "#64748b" : "#475569";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-2, -2);
    ctx.lineTo(-2, -14);
    ctx.moveTo(3, -2);
    ctx.lineTo(3, -14);
    ctx.stroke();
    ctx.fillStyle = darkMode ? "#f8fafc" : "#e2e8f0";
    ctx.beginPath();
    ctx.ellipse(0, -18, 7, 5, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = darkMode ? "#f8fafc" : "#e2e8f0";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-4, -20);
    ctx.quadraticCurveTo(-8, -28, -6, -34);
    ctx.stroke();
    ctx.fillStyle = "#dc2626";
    ctx.beginPath();
    ctx.arc(-6, -35, 2.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (accentId === "suiseki_kamogawa_toyama" || accentId === "suiseki_furuya_waterfall") {
    ctx.fillStyle = "#78350f";
    ctx.beginPath();
    ctx.roundRect(-22, -4, 44, 5, [2]);
    ctx.fill();
    ctx.fillStyle = accentId === "suiseki_furuya_waterfall" ? "#18181b" : "#27272a";
    ctx.beginPath();
    ctx.moveTo(-20, -4);
    ctx.lineTo(-14, -18);
    ctx.lineTo(-4, -12);
    ctx.lineTo(6, -24);
    ctx.lineTo(16, -14);
    ctx.lineTo(20, -4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = darkMode ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.25)";
    ctx.lineWidth = 1;
    ctx.stroke();
    if (accentId === "suiseki_furuya_waterfall") {
      ctx.strokeStyle = "#f8fafc";
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(6, -24);
      ctx.lineTo(5, -16);
      ctx.lineTo(7, -4);
      ctx.stroke();
    }
  } else if (accentId === "shitakusa_wild_violet_fern") {
    ctx.fillStyle = darkMode ? "#3f3f46" : "#52525b";
    ctx.beginPath();
    ctx.ellipse(0, -2, 20, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#16a34a";
    ctx.lineWidth = 1.4;
    for (let f = -12;f <= 12; f += 6) {
      ctx.beginPath();
      ctx.moveTo(f * 0.4, -4);
      ctx.quadraticCurveTo(f * 1.3, -16, f * 1.6, -20);
      ctx.stroke();
    }
    ctx.fillStyle = "#a855f7";
    ctx.beginPath();
    ctx.arc(-6, -15, 3.2, 0, Math.PI * 2);
    ctx.arc(7, -18, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#facc15";
    ctx.beginPath();
    ctx.arc(-6, -15, 1, 0, Math.PI * 2);
    ctx.arc(7, -18, 1, 0, Math.PI * 2);
    ctx.fill();
  } else if (accentId === "ishidoro_yukimi_lantern") {
    ctx.fillStyle = darkMode ? "#64748b" : "#71717a";
    ctx.fillRect(-12, -4, 4, 4);
    ctx.fillRect(8, -4, 4, 4);
    ctx.fillRect(-14, -8, 28, 4);
    ctx.fillStyle = darkMode ? "#1e293b" : "#334155";
    ctx.fillRect(-9, -20, 18, 12);
    const flicker = Math.sin(windTime * 5) * 0.15 + 0.85;
    const flameGrad = ctx.createRadialGradient(0, -14, 1, 0, -14, 14);
    flameGrad.addColorStop(0, `rgba(254, 240, 138, ${0.9 * flicker})`);
    flameGrad.addColorStop(0.5, `rgba(245, 158, 11, ${0.4 * flicker})`);
    flameGrad.addColorStop(1, "rgba(245, 158, 11, 0)");
    ctx.fillStyle = flameGrad;
    ctx.beginPath();
    ctx.arc(0, -14, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = darkMode ? "#64748b" : "#71717a";
    ctx.beginPath();
    ctx.moveTo(-22, -20);
    ctx.lineTo(0, -28);
    ctx.lineTo(22, -20);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, -30, 2.5, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = darkMode ? "#1c1917" : "#292524";
    ctx.beginPath();
    ctx.roundRect(-20, -3, 40, 5, [2]);
    ctx.fill();
    const mossGrad = ctx.createRadialGradient(-3, -13, 2, 0, -11, 14);
    mossGrad.addColorStop(0, darkMode ? "#22c55e" : "#16a34a");
    mossGrad.addColorStop(1, darkMode ? "#14532d" : "#166534");
    ctx.fillStyle = mossGrad;
    ctx.beginPath();
    ctx.arc(0, -11, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#86efac";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(2, -21);
    ctx.quadraticCurveTo(6, -27, 8, -31);
    ctx.stroke();
  }
  ctx.restore();
}
function renderPlant(ctx, state, w, h, devOptions) {
  ctx.clearRect(0, 0, w, h);
  const currentSeason = state.step % (state.cycleLength || 250);
  const isWinterSeason = currentSeason >= 180;
  const isAutumnSeason = currentSeason >= 140 && currentSeason < 180;
  const isSpringSeason = currentSeason < 100;
  const weather = state.weather || "clear";
  const isTokonoma = Boolean(state.isTokonoma);
  let avgBranchX = 0;
  let branchCount = 0;
  for (const n of state.nodes) {
    if (!n.isCut && (n.type === "stem" || n.type === "meristem")) {
      avgBranchX += n.x;
      branchCount++;
    }
  }
  const flowDir = branchCount > 0 && avgBranchX > 18 ? "right" : branchCount > 0 && avgBranchX < -18 ? "left" : "balanced";
  if (isTokonoma) {
    const wallGrad = ctx.createLinearGradient(0, 0, 0, h);
    if (state.darkMode) {
      wallGrad.addColorStop(0, "#18181b");
      wallGrad.addColorStop(1, "#09090b");
    } else {
      wallGrad.addColorStop(0, "#f4f1ea");
      wallGrad.addColorStop(1, "#e6e0d4");
    }
    ctx.fillStyle = wallGrad;
    ctx.fillRect(0, 0, w, h);
    const floorY = h * 0.78;
    ctx.fillStyle = state.darkMode ? "#1c1917" : "#3e2723";
    ctx.fillRect(0, floorY, w, h - floorY);
    ctx.fillStyle = state.darkMode ? "#064e3b" : "#15803d";
    ctx.fillRect(0, floorY, w, 5);
    const scrollW = Math.min(135, w * 0.3);
    const scrollH = h * 0.46;
    let scrollX = w * 0.68;
    if (flowDir === "left") {
      scrollX = w * 0.16;
    } else if (flowDir === "right") {
      scrollX = w * 0.64;
    }
    const scrollY = h * 0.09;
    const activeScrollId = state.activeAccoutrements?.scrollId || "kakejiku_mountain_sansui";
    renderTokonomaScroll(ctx, activeScrollId, scrollX, scrollY, scrollW, scrollH, state.darkMode);
    ctx.save();
    ctx.strokeStyle = state.darkMode ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(w * 0.15, 0);
    ctx.lineTo(w * 0.15, 45);
    ctx.stroke();
    ctx.fillStyle = state.darkMode ? "#f59e0b" : "#d97706";
    ctx.beginPath();
    ctx.arc(w * 0.15, 52, 8, Math.PI, 0);
    ctx.fill();
    const furinSway = Math.sin((state.windTime ?? 0) * 2.5) * 5;
    ctx.fillStyle = state.darkMode ? "rgba(254, 243, 199, 0.75)" : "rgba(255, 255, 255, 0.85)";
    ctx.fillRect(w * 0.15 - 2.5 + furinSway, 56, 5, 24);
    ctx.restore();
  } else {
    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    if (weather === "twilight") {
      bgGrad.addColorStop(0, "#0f172a");
      bgGrad.addColorStop(0.5, "#311042");
      bgGrad.addColorStop(1, "#1c1917");
    } else if (state.darkMode) {
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
    if (weather === "komorebi") {
      ctx.save();
      const beamGrad = ctx.createLinearGradient(0, 0, w * 0.8, h);
      beamGrad.addColorStop(0, "rgba(254, 240, 138, 0.14)");
      beamGrad.addColorStop(0.6, "rgba(254, 243, 199, 0.05)");
      beamGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = beamGrad;
      ctx.beginPath();
      ctx.moveTo(w * 0.08, 0);
      ctx.lineTo(w * 0.35, 0);
      ctx.lineTo(w * 0.95, h);
      ctx.lineTo(w * 0.55, h);
      ctx.fill();
      const dustTime = (state.windTime ?? 0) * 14;
      for (let i = 0;i < 18; i++) {
        const dx = (i * 67 + dustTime * 0.6) % w;
        const dy = (i * 89 + dustTime * 0.4) % (h * 0.85);
        ctx.fillStyle = "rgba(253, 224, 71, 0.65)";
        ctx.beginPath();
        ctx.arc(dx, dy, 1.2 + i % 2 * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    } else if (weather === "rain") {
      ctx.save();
      ctx.strokeStyle = "rgba(186, 230, 253, 0.45)";
      ctx.lineWidth = 1.2;
      const rainTime = (state.windTime ?? 0) * 450 + state.step * 15;
      for (let i = 0;i < 48; i++) {
        const rx = (i * 43 + rainTime * 0.25) % (w + 40) - 20;
        const ry = (i * 61 + rainTime) % (h + 40) - 20;
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx - 3, ry + 16);
        ctx.stroke();
      }
      ctx.restore();
    } else if (weather === "twilight") {
      ctx.save();
      const fireflyTime = (state.windTime ?? 0) * 2.5;
      for (let i = 0;i < 14; i++) {
        const fx = w * 0.5 + Math.sin(fireflyTime * 0.7 + i * 1.3) * (w * 0.35);
        const fy = h * 0.45 + Math.cos(fireflyTime * 0.9 + i * 0.9) * (h * 0.25);
        const pulse = Math.sin(fireflyTime * 3 + i * 2) * 0.5 + 0.5;
        const radGrad = ctx.createRadialGradient(fx, fy, 0, fx, fy, 8 * pulse + 3);
        radGrad.addColorStop(0, `rgba(163, 230, 53, ${0.9 * pulse})`);
        radGrad.addColorStop(0.4, `rgba(132, 204, 22, ${0.45 * pulse})`);
        radGrad.addColorStop(1, "rgba(132, 204, 22, 0)");
        ctx.fillStyle = radGrad;
        ctx.beginPath();
        ctx.arc(fx, fy, 8 * pulse + 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    if (isWinterSeason || isSpringSeason) {
      const count = isWinterSeason ? 26 : 16;
      const time = (state.windTime ?? 0) * 18 + state.step * 2.2;
      ctx.save();
      for (let i = 0;i < count; i++) {
        const px = (i * 79 + time * (0.35 + i % 5 * 0.12)) % (w + 40) - 20;
        const py = (i * 103 + time * (0.75 + i % 4 * 0.2)) % (h + 40) - 20;
        const sway = Math.sin(time * 0.04 + i * 1.5) * 14;
        if (isWinterSeason) {
          ctx.fillStyle = state.darkMode ? "rgba(255, 255, 255, 0.65)" : "rgba(255, 255, 255, 0.85)";
          ctx.beginPath();
          ctx.arc(px + sway, py, 1.2 + i % 3 * 0.6, 0, Math.PI * 2);
          ctx.fill();
        } else if (isSpringSeason) {
          ctx.save();
          ctx.translate(px + sway, py);
          ctx.rotate((time * 0.02 + i) * 0.4);
          ctx.fillStyle = state.darkMode ? "rgba(244, 114, 182, 0.6)" : "rgba(251, 113, 133, 0.72)";
          ctx.beginPath();
          ctx.ellipse(0, 0, 3.5, 2, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
      ctx.restore();
    }
  }
  ctx.save();
  let tokoTreeOffsetX = 0;
  if (isTokonoma) {
    if (flowDir === "right")
      tokoTreeOffsetX = -65;
    else if (flowDir === "left")
      tokoTreeOffsetX = 65;
  }
  const ox = w / 2 + (state.cameraX ?? 0) + tokoTreeOffsetX;
  const oy = h * 0.82 + (state.cameraY ?? 0);
  const zoom = state.cameraZoom ?? 1;
  const baseScale = Math.min(w / 400, h / 500);
  const scale = baseScale * zoom;
  ctx.translate(ox, oy);
  if (!isTokonoma) {
    const sandBg = state.darkMode ? "#141a24" : "#ede7dd";
    const grooveColor = state.darkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.08)";
    const grooveShadow = state.darkMode ? "rgba(0,0,0,0.45)" : "rgba(255,255,255,0.65)";
    ctx.fillStyle = state.darkMode ? "#0b0f17" : "#544537";
    ctx.beginPath();
    ctx.roundRect(-420, 14, 840, 96, [12]);
    ctx.fill();
    ctx.strokeStyle = state.darkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.25)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = sandBg;
    ctx.beginPath();
    ctx.roundRect(-414, 17, 828, 90, [10]);
    ctx.fill();
    for (let gy = 23;gy <= 101; gy += 6) {
      ctx.strokeStyle = grooveColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-406, gy);
      ctx.lineTo(406, gy);
      ctx.stroke();
      ctx.strokeStyle = grooveShadow;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-406, gy + 1);
      ctx.lineTo(406, gy + 1);
      ctx.stroke();
    }
    if (state.sandRipples && state.sandRipples.length > 0) {
      for (const rip of state.sandRipples) {
        ctx.save();
        const alpha = Math.max(0.2, Math.min(1, rip.intensity ?? 0.85));
        const rx = rip.radius;
        const ry = rip.radius * 0.38;
        ctx.strokeStyle = state.darkMode ? `rgba(0, 0, 0, ${alpha * 0.7})` : `rgba(45, 30, 18, ${alpha * 0.45})`;
        ctx.lineWidth = 4.2;
        ctx.beginPath();
        ctx.ellipse(rip.x, rip.y, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = state.darkMode ? `rgba(255, 255, 255, ${alpha * 0.35})` : `rgba(255, 255, 255, ${alpha * 0.9})`;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.ellipse(rip.x - 0.8, rip.y - 1.2, rx + 1.8, ry + 1.2, 0, Math.PI * 0.75, Math.PI * 2.15);
        ctx.stroke();
        ctx.strokeStyle = state.darkMode ? `rgba(0, 0, 0, ${alpha * 0.45})` : `rgba(80, 58, 40, ${alpha * 0.35})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(rip.x + 0.8, rip.y + 1.2, rx + 1.8, ry + 1.2, 0, 0, Math.PI * 1.15);
        ctx.stroke();
        ctx.restore();
      }
    }
    const shishiX = -155;
    const shishiY = 36;
    const waterFill = Math.max(0, Math.min(1, state.shishiWater ?? 0));
    const rockerAngle = -0.25 + waterFill * 0.58;
    ctx.save();
    ctx.strokeStyle = "rgba(186, 230, 253, 0.75)";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(shishiX - 8, shishiY - 32);
    ctx.lineTo(shishiX - 5, shishiY - 14);
    ctx.stroke();
    ctx.strokeStyle = state.darkMode ? "#3f6212" : "#65a30d";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(shishiX - 28, shishiY - 36);
    ctx.lineTo(shishiX - 8, shishiY - 32);
    ctx.stroke();
    ctx.strokeStyle = state.darkMode ? "#365314" : "#4d7c0f";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(shishiX, shishiY + 18);
    ctx.lineTo(shishiX, shishiY - 10);
    ctx.stroke();
    ctx.save();
    ctx.translate(shishiX, shishiY);
    ctx.rotate(rockerAngle);
    ctx.strokeStyle = state.darkMode ? "#4d7c0f" : "#84cc16";
    ctx.lineWidth = 5.5;
    ctx.lineCap = "butt";
    ctx.beginPath();
    ctx.moveTo(-18, 0);
    ctx.lineTo(24, 0);
    ctx.stroke();
    ctx.fillStyle = state.darkMode ? "#14532d" : "#365314";
    ctx.beginPath();
    ctx.ellipse(24, 0, 3, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1c1917";
    ctx.beginPath();
    ctx.arc(0, 0, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (waterFill > 0.92) {
      ctx.strokeStyle = "rgba(186, 230, 253, 0.85)";
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(shishiX + 18, shishiY + 8);
      ctx.quadraticCurveTo(shishiX + 26, shishiY + 20, shishiX + 22, shishiY + 30);
      ctx.stroke();
    }
    ctx.fillStyle = state.darkMode ? "#1e293b" : "#475569";
    ctx.beginPath();
    ctx.ellipse(shishiX - 16, shishiY + 22, 10, 4.5, -0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = state.darkMode ? "#334155" : "#64748b";
    ctx.beginPath();
    ctx.ellipse(shishiX + 20, shishiY + 28, 14, 5.5, 0.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else {
    renderTokonomaStand(ctx, state.darkMode);
  }
  ctx.fillStyle = state.darkMode ? "rgba(0, 0, 0, 0.6)" : "rgba(0, 0, 0, 0.15)";
  ctx.beginPath();
  ctx.ellipse(0, 22, 110, 22, 0, 0, Math.PI * 2);
  ctx.fill();
  const potStyle = state.potStyle || "classic";
  if (potStyle === "kurama") {
    ctx.fillStyle = state.darkMode ? "#181e28" : "#3f3f46";
    ctx.beginPath();
    ctx.moveTo(-100, 28);
    ctx.quadraticCurveTo(-95, 8, -60, 6);
    ctx.quadraticCurveTo(-20, 2, 0, 4);
    ctx.quadraticCurveTo(40, 3, 85, 8);
    ctx.quadraticCurveTo(105, 14, 98, 28);
    ctx.quadraticCurveTo(80, 34, 40, 35);
    ctx.quadraticCurveTo(0, 37, -50, 36);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = state.darkMode ? "#334155" : "#27272a";
    ctx.lineWidth = 2.5;
    ctx.stroke();
  } else {
    let potBodyColor;
    let potBorderColor;
    let potRimHighlight;
    if (potStyle === "yixing") {
      potBodyColor = state.darkMode ? "#581c0c" : "#7c2d12";
      potBorderColor = state.darkMode ? "#361107" : "#451a03";
      potRimHighlight = "rgba(254, 205, 185, 0.28)";
    } else if (potStyle === "oribe") {
      potBodyColor = state.darkMode ? "#052e16" : "#14532d";
      potBorderColor = state.darkMode ? "#021d0d" : "#0f3a1f";
      potRimHighlight = "rgba(187, 247, 208, 0.4)";
    } else if (potStyle === "tenmoku") {
      potBodyColor = state.darkMode ? "#020617" : "#09090b";
      potBorderColor = state.darkMode ? "#1e293b" : "#27272a";
      potRimHighlight = "rgba(245, 158, 11, 0.35)";
    } else {
      potBodyColor = state.darkMode ? "#1e293b" : "#44403c";
      potBorderColor = state.darkMode ? "#334155" : "#292524";
      potRimHighlight = state.darkMode ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.35)";
    }
    ctx.fillStyle = potBodyColor;
    ctx.beginPath();
    ctx.roundRect(-85, 2, 170, 36, [6, 6, 16, 16]);
    ctx.fill();
    ctx.strokeStyle = potBorderColor;
    ctx.lineWidth = 3;
    ctx.stroke();
    if (potStyle === "oribe") {
      ctx.strokeStyle = "rgba(254, 240, 138, 0.22)";
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(-60, 8);
      ctx.lineTo(-45, 24);
      ctx.lineTo(-30, 20);
      ctx.moveTo(35, 10);
      ctx.lineTo(50, 26);
      ctx.lineTo(65, 18);
      ctx.stroke();
    } else if (potStyle === "tenmoku") {
      ctx.fillStyle = "rgba(245, 158, 11, 0.42)";
      const spots = [[-55, 14], [-35, 22], [-15, 12], [10, 20], [38, 14], [60, 22]];
      for (const [sx, sy] of spots) {
        ctx.beginPath();
        ctx.arc(sx, sy, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.strokeStyle = potRimHighlight;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-88, 0, 176, 8, [4]);
    ctx.stroke();
  }
  const moisture = Math.max(0, Math.min(1, state.soilMoisture ?? 0.5));
  const soilR = Math.round(115 * (1 - moisture) + 36 * moisture);
  const soilG = Math.round(96 * (1 - moisture) + 26 * moisture);
  const soilB = Math.round(82 * (1 - moisture) + 18 * moisture);
  ctx.fillStyle = `rgb(${soilR}, ${soilG}, ${soilB})`;
  ctx.beginPath();
  ctx.ellipse(0, 4, 82, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  if (moisture > 0.35) {
    ctx.fillStyle = `rgba(255, 255, 255, ${(moisture - 0.35) * 0.28})`;
    ctx.beginPath();
    ctx.ellipse(-18, 3.5, 34, 2.5, -0.05, 0, Math.PI * 2);
    ctx.fill();
  }
  const mossPalette = state.darkMode ? ["#2d4a1d", "#365314", "#3f6212", "#4d7c0f"] : ["#3f6212", "#4d7c0f", "#65a30d", "#84cc16"];
  const mossCushions = [
    { x: -38, y: 3.5, rx: 14, ry: 4.5, c: 1 },
    { x: -20, y: 4.5, rx: 18, ry: 5, c: 2 },
    { x: 16, y: 4.2, rx: 17, ry: 4.8, c: 3 },
    { x: 38, y: 3.8, rx: 13, ry: 4.2, c: 0 },
    { x: -2, y: 5.2, rx: 16, ry: 4.5, c: 2 },
    { x: -10, y: 3.2, rx: 10, ry: 3.5, c: 1 },
    { x: 28, y: 4.8, rx: 12, ry: 3.8, c: 2 }
  ];
  for (const m of mossCushions) {
    ctx.fillStyle = mossPalette[m.c];
    ctx.beginPath();
    ctx.ellipse(m.x, m.y, m.rx, m.ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (isWinterSeason) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.beginPath();
    ctx.roundRect(-86, -1, 172, 3.5, [2]);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 255, 255, 0.72)";
    ctx.beginPath();
    ctx.ellipse(-20, 2.5, 14, 2.5, 0, 0, Math.PI * 2);
    ctx.ellipse(22, 2.8, 12, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const activeAccentId = state.activeAccoutrements?.accentId || "shitakusa_kokedama_mossball";
  const accentSideX = flowDir === "left" ? -142 : 142;
  const accentFloorY = isTokonoma ? 36 : 28;
  if (!state.tokonomaParticles)
    state.tokonomaParticles = [];
  renderTokonomaAccent(ctx, activeAccentId, accentSideX, accentFloorY, state.darkMode, state.windTime ?? 0, state.tokonomaParticles);
  if (state.tokonomaParticles && state.tokonomaParticles.length > 0) {
    ctx.save();
    for (let i = state.tokonomaParticles.length - 1;i >= 0; i--) {
      const p = state.tokonomaParticles[i];
      p.x += p.vx + Math.sin((state.windTime ?? 0) * 2 + p.y * 0.05) * 0.25;
      p.y += p.vy;
      p.life -= 0.012;
      p.size += 0.04;
      p.alpha = Math.max(0, p.life * 0.55);
      if (p.life <= 0) {
        state.tokonomaParticles.splice(i, 1);
        continue;
      }
      ctx.fillStyle = state.darkMode ? `rgba(226, 232, 240, ${p.alpha * 0.6})` : `rgba(100, 116, 139, ${p.alpha * 0.7})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  if (state.fallenDebris && state.fallenDebris.length > 0) {
    for (const d of state.fallenDebris) {
      ctx.save();
      ctx.translate(d.x, d.y + 4);
      ctx.rotate(d.rot);
      ctx.fillStyle = d.color;
      ctx.beginPath();
      if (d.type === "petal") {
        ctx.ellipse(0, 0, 4, 2.2, 0, 0, Math.PI * 2);
      } else {
        ctx.ellipse(0, 0, 5, 2.4, 0, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.scale(scale, scale);
  if (devOptions?.showHitbox) {
    ctx.save();
    ctx.strokeStyle = "rgba(245, 158, 11, 0.4)";
    ctx.lineWidth = 1.5 / scale;
    ctx.setLineDash([4 / scale, 4 / scale]);
    ctx.beginPath();
    ctx.arc(0, -50, devOptions.hitRadius ?? 20, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  const g = state.genome;
  const nodeById = new Map;
  const childrenByParent = new Map;
  for (const n of state.nodes) {
    nodeById.set(n.id, n);
    const arr = childrenByParent.get(n.parentId);
    if (arr)
      arr.push(n);
    else
      childrenByParent.set(n.parentId, [n]);
  }
  const weightCache = new Map;
  const thicknessCache = new Map;
  function getWeight(n) {
    if (weightCache.has(n.id))
      return weightCache.get(n.id);
    let w = n.type === "leaf" ? 0.7 : n.type === "flower" ? 1.2 : 0.04 * n.length;
    const kids = childrenByParent.get(n.id) ?? [];
    for (const c of kids) {
      w += getWeight(c);
    }
    weightCache.set(n.id, w);
    return w;
  }
  function getThickness(n) {
    if (thicknessCache.has(n.id))
      return thicknessCache.get(n.id);
    if (n.type !== "stem" && n.type !== "meristem") {
      thicknessCache.set(n.id, 0);
      return 0;
    }
    const kids = childrenByParent.get(n.id) ?? [];
    const childStems = kids.filter((c) => c.type === "stem" || c.type === "meristem");
    let areaSum = 0.9;
    for (const c of childStems) {
      const ct = getThickness(c);
      areaSum += ct * ct;
    }
    const daVinci = Math.sqrt(areaSum);
    const woodiness = Math.min(1, (n.age || 0) / 45);
    const depthFactor = Math.max(0.35, 1 - n.depth / 8 * 0.45);
    const thickness = Math.max(1.2, daVinci * 1.3 * depthFactor + woodiness * 1.8);
    thicknessCache.set(n.id, thickness);
    return thickness;
  }
  for (const n of state.nodes) {
    getWeight(n);
    if (n.type === "stem" || n.type === "meristem") {
      getThickness(n);
    }
  }
  globalStemTransforms.clear();
  globalNodeDisp.clear();
  globalNodeDisp.set(0, { wx: state.root.x, wy: state.root.y, angle: state.root.angle });
  const stiffnessTrait = expressTrait(g, "stiffness") || 1;
  for (const n of state.nodes) {
    if (n.type === "stem" || n.type === "meristem") {
      const parentTr = n.parentId !== null ? globalStemTransforms.get(n.parentId) : undefined;
      let startX;
      let startY;
      let startAngle;
      if (parentTr) {
        const attachT = n.attachT !== undefined ? n.attachT : 1;
        const pt = quadBezierPoint(parentTr.startX, parentTr.startY, parentTr.controlX, parentTr.controlY, parentTr.endX, parentTr.endY, attachT);
        startX = pt.x;
        startY = pt.y;
        const tangentAngle = parentTr.startAngle + normalizeAngle2(parentTr.renderAngle - parentTr.startAngle) * attachT;
        const parentNode = nodeById.get(n.parentId);
        const deltaAngle = normalizeAngle2(n.angle - (parentNode ? parentNode.angle : parentTr.startAngle));
        startAngle = tangentAngle + deltaAngle;
      } else {
        startX = state.root.x;
        startY = state.root.y;
        startAngle = n.angle;
      }
      const length = n.length;
      const weight = weightCache.get(n.id) ?? 0.1;
      const thickness = thicknessCache.get(n.id) ?? 2;
      const woodiness = Math.min(1, (n.age || 0) / 40);
      const mechanicalStiffness = Math.pow(thickness + 1, 3) * (1.5 + woodiness * 4) * stiffnessTrait;
      const flexFactor = Math.max(0, 1 - woodiness * 0.9);
      const droop = Math.min(0.05, 0.02 * weight * flexFactor / Math.max(0.6, mechanicalStiffness));
      const sagDistance = droop * length;
      const bendAngle = thickness < 2.5 ? droop * 0.4 : 0;
      const wireBend = n.wireCurvature ?? n.wireAngleOffset ?? 0;
      const renderAngle = startAngle + wireBend + bendAngle;
      const chordAngle = startAngle + wireBend * 0.5 + bendAngle;
      const endX = startX + Math.cos(chordAngle) * length;
      const endY = startY + Math.sin(chordAngle) * length;
      const midX = (startX + endX) / 2;
      const midY = (startY + endY) / 2;
      const normalX = -Math.sin(chordAngle);
      const normalY = Math.cos(chordAngle);
      const organicSweep = (n.id % 7 - 3) * 0.015;
      const curvatureOffset = wireBend * length * 0.28;
      const controlX = midX + normalX * (organicSweep * length + curvatureOffset);
      const controlY = midY + normalY * (organicSweep * length + curvatureOffset) + sagDistance * 0.35;
      const tr = {
        nodeId: n.id,
        startX,
        startY,
        endX,
        endY,
        controlX,
        controlY,
        startAngle,
        renderAngle,
        thickness
      };
      globalStemTransforms.set(n.id, tr);
      globalNodeDisp.set(n.id, { wx: endX, wy: endY, angle: renderAngle });
      const wood = Math.min(1, n.age / 35);
      const r = Math.round(75 * wood + 36 * (1 - wood));
      const gr = Math.round(42 * wood + 24 * (1 - wood));
      const b = Math.round(20 * wood + 12 * (1 - wood));
      ctx.strokeStyle = state.darkMode ? "rgba(0, 0, 0, 0.45)" : "rgba(40, 25, 15, 0.25)";
      ctx.lineWidth = thickness + 2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(startX + 2, startY + 2);
      ctx.quadraticCurveTo(controlX + 2, controlY + 2, endX + 2, endY + 2);
      ctx.stroke();
      if (n.isJin) {
        ctx.strokeStyle = state.darkMode ? "#cbd5e1" : "#f1f5f9";
        ctx.lineWidth = thickness;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.quadraticCurveTo(controlX, controlY, endX, endY);
        ctx.stroke();
        ctx.strokeStyle = state.darkMode ? "rgba(71, 85, 105, 0.45)" : "rgba(148, 163, 184, 0.55)";
        ctx.lineWidth = Math.max(0.8, thickness * 0.22);
        ctx.beginPath();
        ctx.moveTo(startX + 0.5, startY + 0.5);
        ctx.quadraticCurveTo(controlX + 0.5, controlY + 0.5, endX + 0.5, endY + 0.5);
        ctx.stroke();
        ctx.fillStyle = state.darkMode ? "#e2e8f0" : "#ffffff";
        ctx.beginPath();
        ctx.arc(endX, endY, Math.max(1.2, thickness * 0.42), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.strokeStyle = `rgb(${r},${gr},${b})`;
        ctx.lineWidth = thickness;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.quadraticCurveTo(controlX, controlY, endX, endY);
        ctx.stroke();
        if (state.woodTexture !== false) {
          renderWoodBarkTexture(ctx, startX, startY, endX, endY, thickness, wood, controlX, controlY);
        }
      }
      if (isWinterSeason && Math.abs(Math.sin(renderAngle)) < 0.72 && thickness >= 1.6) {
        ctx.save();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.92)";
        ctx.lineWidth = Math.max(1.1, Math.min(3.2, thickness * 0.42));
        ctx.lineCap = "round";
        ctx.beginPath();
        const snowOffset = thickness * 0.32;
        ctx.moveTo(startX, startY - snowOffset);
        ctx.quadraticCurveTo(controlX, controlY - snowOffset, endX, endY - snowOffset);
        ctx.stroke();
        ctx.restore();
      }
      if (n.hasWire && !n.isJin) {
        ctx.save();
        ctx.strokeStyle = "#d97706";
        ctx.lineWidth = Math.max(1.2, Math.min(2.4, thickness * 0.35));
        ctx.lineCap = "round";
        const coils = Math.max(4, Math.floor(length / 7));
        for (let i = 1;i <= coils; i++) {
          const t = i / (coils + 1);
          const pt = quadBezierPoint(startX, startY, controlX, controlY, endX, endY, t);
          const mt = 1 - t;
          const tx = 2 * mt * (controlX - startX) + 2 * t * (endX - controlX);
          const ty = 2 * mt * (controlY - startY) + 2 * t * (endY - controlY);
          const tLen = Math.hypot(tx, ty) || 1;
          const nx = -ty / tLen;
          const ny = tx / tLen;
          const halfW = thickness / 2 + 1.2;
          ctx.beginPath();
          ctx.moveTo(pt.x - nx * halfW - tx / tLen * 1.5, pt.y - ny * halfW - ty / tLen * 1.5);
          ctx.lineTo(pt.x + nx * halfW + tx / tLen * 1.5, pt.y + ny * halfW + ty / tLen * 1.5);
          ctx.stroke();
        }
        ctx.restore();
      }
      if (n.barkFracture && n.barkFracture > 0 && !n.isJin) {
        ctx.save();
        const tensionSide = wireBend > 0 ? -1 : 1;
        const normAngle = chordAngle + tensionSide * Math.PI / 2;
        ctx.strokeStyle = state.darkMode ? "rgba(248, 113, 113, 0.85)" : "rgba(185, 28, 28, 0.85)";
        ctx.lineWidth = 1.2;
        const fissureCount = Math.max(2, Math.floor(n.barkFracture * 5));
        for (let fi = 1;fi <= fissureCount; fi++) {
          const ft = 0.3 + fi / (fissureCount + 1) * 0.4;
          const fPt = quadBezierPoint(startX, startY, controlX, controlY, endX, endY, ft);
          const fx1 = fPt.x + Math.cos(normAngle) * (thickness * 0.45);
          const fy1 = fPt.y + Math.sin(normAngle) * (thickness * 0.45);
          const fx2 = fPt.x + Math.cos(normAngle) * (thickness * 0.82);
          const fy2 = fPt.y + Math.sin(normAngle) * (thickness * 0.82);
          ctx.beginPath();
          ctx.moveTo(fx1, fy1);
          ctx.lineTo(fx2, fy2);
          ctx.stroke();
        }
        ctx.restore();
      }
      if (n.isCut && !n.isJin) {
        ctx.save();
        if (n.isBroken) {
          const splinters = n.breakSplinters || [0.9, 0.45, 0.85, 0.4, 0.75, 0.5];
          const breakDir = n.breakAngle ?? renderAngle;
          const bNormX = -Math.sin(breakDir);
          const bNormY = Math.cos(breakDir);
          const bDirX = Math.cos(breakDir);
          const bDirY = Math.sin(breakDir);
          ctx.fillStyle = state.darkMode ? "#291307" : "#451a03";
          ctx.beginPath();
          ctx.moveTo(endX - bNormX * (thickness * 0.65), endY - bNormY * (thickness * 0.65));
          ctx.lineTo(endX - bNormX * (thickness * 0.85) - bDirX * 3.5, endY - bNormY * (thickness * 0.85) - bDirY * 3.5);
          ctx.lineTo(endX, endY);
          ctx.fill();
          ctx.strokeStyle = state.darkMode ? "#f1f5f9" : "#fef08a";
          ctx.lineWidth = Math.max(0.8, thickness * 0.18);
          ctx.lineCap = "round";
          for (let si = 0;si < splinters.length; si++) {
            const frac = si / (splinters.length - 1) - 0.5;
            const spLen = splinters[si] * Math.max(3.5, thickness * 0.95);
            const bx = endX + bNormX * (frac * thickness * 0.95);
            const by = endY + bNormY * (frac * thickness * 0.95);
            ctx.beginPath();
            ctx.moveTo(bx, by);
            ctx.lineTo(bx + bDirX * spLen + (si % 2 - 0.5) * 1.5, by + bDirY * spLen + (si % 3 - 1) * 1.5);
            ctx.stroke();
          }
          ctx.fillStyle = "rgba(245, 158, 11, 0.9)";
          ctx.beginPath();
          ctx.arc(endX + bDirX * 1.2, endY + bDirY * 1.2, Math.max(1.5, thickness * 0.35), 0, Math.PI * 2);
          ctx.fill();
        } else {
          const callus = n.callusStage ?? 0.3;
          ctx.fillStyle = "#65a30d";
          ctx.beginPath();
          ctx.arc(endX, endY, Math.max(2.4, thickness * 0.65 + callus * 1.5), 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#e2d9cc";
          ctx.beginPath();
          ctx.arc(endX, endY, Math.max(1.2, thickness * 0.4 * (1 - callus * 0.35)), 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#78350f";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        ctx.restore();
      }
      if (devOptions?.showPoints) {
        ctx.save();
        ctx.fillStyle = n.isCut ? "#ffbb00" : "rgba(255, 255, 255, 0.4)";
        ctx.beginPath();
        ctx.arc(startX, startY, 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#38bdf8";
        ctx.beginPath();
        ctx.arc(endX, endY, 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      if (devOptions?.showIds) {
        ctx.save();
        ctx.fillStyle = state.darkMode ? "#f8fafc" : "#1e293b";
        ctx.font = "9px monospace";
        ctx.fillText(String(n.id), (startX + endX) / 2 + 3, (startY + endY) / 2 - 3);
        ctx.restore();
      }
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
  const seedHash = g ? Math.abs(JSON.stringify(g).split("").reduce((acc, char) => acc + char.charCodeAt(0), 0)) : 42;
  const rareExoticRoll = seedHash % 100;
  const baseHue = rareExoticRoll < 10 ? 35 : rareExoticRoll < 18 ? 340 : rareExoticRoll < 25 ? 270 : 90 + seedHash % 120;
  for (const n of state.nodes) {
    if (n.type === "leaf" && n.fallState !== "falling") {
      const parentTr = n.parentId !== null ? globalStemTransforms.get(n.parentId) : undefined;
      let leafX;
      let leafY;
      let leafAngle;
      if (parentTr) {
        const attachT = n.attachT !== undefined ? n.attachT : 1;
        const pt = quadBezierPoint(parentTr.startX, parentTr.startY, parentTr.controlX, parentTr.controlY, parentTr.endX, parentTr.endY, attachT);
        leafX = pt.x;
        leafY = pt.y;
        const tangent = parentTr.startAngle + normalizeAngle2(parentTr.renderAngle - parentTr.startAngle) * attachT;
        leafAngle = tangent + (n.id % 2 === 0 ? 0.7 : -0.7);
      } else {
        leafX = n.x;
        leafY = n.y;
        leafAngle = n.angle;
      }
      ctx.save();
      const maturity = Math.min(1, (n.age ?? 1) / 5);
      ctx.translate(leafX, leafY);
      ctx.rotate(leafAngle);
      ctx.scale(maturity, maturity);
      const leafHueOffset = Math.abs(n.id * 17) % 25 - 12;
      const currentHue = (baseHue + leafHueOffset + 360) % 360;
      let effectiveHue = currentHue;
      let sat = state.darkMode ? 50 : 55;
      let lightBase = state.darkMode ? 28 + n.id % 6 : 38 + n.id % 6;
      let lightTip = state.darkMode ? 45 + n.id % 6 : 52 + n.id % 6;
      const isEvergreen = selectedLeafMorphology === "needle" || state.speciesId === "pinus-thunbergii" || state.speciesId === "bunjingi-pine" || state.speciesId === "kengai-cascade";
      if (state.speciesId === "acer-palmatum") {
        const variant = Math.abs(n.id) % 3;
        effectiveHue = variant === 0 ? 354 : variant === 1 ? 12 : 26;
        sat = 76;
        lightBase = state.darkMode ? 34 : 44;
        lightTip = state.darkMode ? 48 : 56;
      } else if (isAutumnSeason && !isEvergreen) {
        effectiveHue = 32 + n.id * 13 % 20;
        sat = 70;
        lightBase = state.darkMode ? 36 : 46;
        lightTip = state.darkMode ? 50 : 58;
      }
      const activeBase = `hsl(${effectiveHue}, ${sat}%, ${lightBase}%)`;
      const activeTip = `hsl(${effectiveHue}, ${sat + 8}%, ${lightTip}%)`;
      drawModularLeaf(ctx, selectedLeafMorphology, 14, activeBase, activeTip);
      ctx.restore();
    } else if (n.type === "flower") {
      const parentTr = n.parentId !== null ? globalStemTransforms.get(n.parentId) : undefined;
      let flowerX;
      let flowerY;
      if (parentTr) {
        const attachT = n.attachT !== undefined ? n.attachT : 1;
        const pt = quadBezierPoint(parentTr.startX, parentTr.startY, parentTr.controlX, parentTr.controlY, parentTr.endX, parentTr.endY, attachT);
        flowerX = pt.x;
        flowerY = pt.y;
      } else {
        flowerX = n.x;
        flowerY = n.y;
      }
      ctx.save();
      ctx.translate(flowerX, flowerY);
      const isPolyploid = Math.abs(n.id * 13) % 11 === 0;
      const flowerScale = isPolyploid ? 1.4 : 1;
      ctx.scale(flowerScale, flowerScale);
      const petalCount = expressTrait(g, "petalCount") || 5;
      drawModularFlower(ctx, selectedFlowerMorphology, petalCount + (isPolyploid ? 2 : 0), 10, basePetalColor, "#facc15");
      ctx.restore();
    } else if (n.type === "bud") {
      const parentTr = n.parentId !== null ? globalStemTransforms.get(n.parentId) : undefined;
      let budX = n.x;
      let budY = n.y;
      if (parentTr) {
        const attachT = n.attachT !== undefined ? n.attachT : 1;
        const pt = quadBezierPoint(parentTr.startX, parentTr.startY, parentTr.controlX, parentTr.controlY, parentTr.endX, parentTr.endY, attachT);
        budX = pt.x;
        budY = pt.y;
      }
      ctx.fillStyle = "#f39c12";
      ctx.beginPath();
      ctx.arc(budX, budY, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (state.barkFlakes && state.barkFlakes.length > 0) {
    for (const flake of state.barkFlakes) {
      ctx.save();
      ctx.translate(flake.x, flake.y);
      ctx.rotate(flake.rot);
      ctx.fillStyle = state.darkMode ? `rgba(74, 38, 14, ${flake.alpha})` : `rgba(69, 26, 3, ${flake.alpha})`;
      ctx.fillRect(-flake.size / 2, -flake.size / 3, flake.size, flake.size * 0.65);
      ctx.restore();
    }
  }
  if (state.woodShavings && state.woodShavings.length > 0) {
    for (const sh of state.woodShavings) {
      ctx.save();
      ctx.translate(sh.x, sh.y);
      ctx.rotate(sh.rot);
      ctx.fillStyle = state.darkMode ? `rgba(226, 232, 240, ${sh.alpha})` : `rgba(241, 245, 249, ${sh.alpha})`;
      ctx.beginPath();
      ctx.arc(0, 0, sh.size * 0.7, 0, Math.PI * 1.5);
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = ctx.fillStyle;
      ctx.stroke();
      ctx.restore();
    }
  }
  if (state.sapDrops && state.sapDrops.length > 0) {
    for (const drop of state.sapDrops) {
      ctx.save();
      ctx.fillStyle = `rgba(245, 158, 11, ${drop.alpha})`;
      ctx.beginPath();
      ctx.ellipse(drop.x, drop.y, drop.size * 0.75, drop.size, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(255, 255, 255, ${drop.alpha * 0.75})`;
      ctx.beginPath();
      ctx.arc(drop.x - drop.size * 0.25, drop.y - drop.size * 0.35, drop.size * 0.28, 0, Math.PI * 2);
      ctx.fill();
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
function seasonOf(step, cycleLength = 250) {
  const season = step % cycleLength;
  if (season <= 100)
    return { name: "Frühling", color: "#f59e0b", season };
  if (season <= 140)
    return { name: "Sommer", color: "#10b981", season };
  if (season <= 180)
    return { name: "Herbst", color: "#ea580c", season };
  return { name: "Winter", color: "#94a3b8", season };
}
function renderBladeSlashTrail(ctx, points, currentTime = Date.now(), maxAge = 350) {
  if (points.length < 2)
    return;
  ctx.save();
  for (let i = 1;i < points.length; i++) {
    const p0 = points[i - 1];
    const p1 = points[i];
    const age = currentTime - p1.time;
    if (age >= maxAge)
      continue;
    const progress = 1 - age / maxAge;
    const alpha = Math.max(0, Math.min(1, progress));
    ctx.strokeStyle = `rgba(244, 63, 94, ${alpha * 0.45})`;
    ctx.lineWidth = 6 * progress;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.95})`;
    ctx.lineWidth = 2 * progress;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
  }
  ctx.restore();
}
function renderWaterDroplets(ctx, droplets) {
  if (droplets.length === 0)
    return;
  ctx.save();
  for (const d of droplets) {
    if (d.alpha <= 0.01)
      continue;
    ctx.fillStyle = `rgba(186, 230, 253, ${d.alpha * 0.75})`;
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(255, 255, 255, ${d.alpha * 0.9})`;
    ctx.beginPath();
    ctx.arc(d.x - d.radius * 0.3, d.y - d.radius * 0.3, d.radius * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
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
var windNode = null;
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
function playPruneSound(thickness = 4) {
  const ctx = getAudioContext();
  if (!ctx || isMuted)
    return;
  const now = ctx.currentTime;
  const clampedThick = Math.max(1, Math.min(20, thickness));
  const baseFreq = Math.max(160, 950 - clampedThick * 45);
  const dropFreq = Math.max(80, baseFreq * 0.35);
  const duration = Math.min(0.12, 0.05 + clampedThick * 0.004);
  const bufferSize = Math.floor(ctx.sampleRate * Math.min(0.1, 0.06 + clampedThick * 0.002));
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0;i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.02));
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  const filterFreq = Math.max(1800, 3600 - clampedThick * 120);
  filter.frequency.setValueAtTime(filterFreq, now);
  filter.Q.setValueAtTime(3, now);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.6 * volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  noise.connect(filter);
  filter.connect(gain);
  if (masterGain)
    gain.connect(masterGain);
  noise.start(now);
  noise.stop(now + duration);
  const osc = ctx.createOscillator();
  osc.type = clampedThick > 6 ? "sawtooth" : "triangle";
  osc.frequency.setValueAtTime(baseFreq, now);
  osc.frequency.exponentialRampToValueAtTime(dropFreq, now + duration);
  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime((0.35 + clampedThick * 0.02) * volume, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  osc.connect(oscGain);
  if (masterGain)
    oscGain.connect(masterGain);
  osc.start(now);
  osc.stop(now + duration);
  if (clampedThick > 5) {
    const subOsc = ctx.createOscillator();
    subOsc.type = "sine";
    subOsc.frequency.setValueAtTime(120, now);
    subOsc.frequency.exponentialRampToValueAtTime(50, now + duration * 1.2);
    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.3 * volume, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + duration * 1.2);
    subOsc.connect(subGain);
    if (masterGain)
      subGain.connect(masterGain);
    subOsc.start(now);
    subOsc.stop(now + duration * 1.2);
  }
}
function playDefoliateSound() {
  const ctx = getAudioContext();
  if (!ctx || isMuted)
    return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(1400, now);
  osc.frequency.exponentialRampToValueAtTime(600, now + 0.04);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.2 * volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
  osc.connect(gain);
  if (masterGain)
    gain.connect(masterGain);
  osc.start(now);
  osc.stop(now + 0.04);
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
  const startFreq = 400 + Math.random() * 200;
  osc.frequency.setValueAtTime(startFreq, now);
  osc.frequency.exponentialRampToValueAtTime(startFreq * 2.2, now + 0.08);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.35 * volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
  osc.connect(gain);
  if (masterGain)
    gain.connect(masterGain);
  osc.start(now);
  osc.stop(now + 0.09);
}
function playWireSound() {
  const ctx = getAudioContext();
  if (!ctx || isMuted)
    return;
  const now = ctx.currentTime;
  const fundamental = 587.33;
  const osc1 = ctx.createOscillator();
  osc1.type = "sine";
  osc1.frequency.setValueAtTime(fundamental, now);
  const osc2 = ctx.createOscillator();
  osc2.type = "triangle";
  osc2.frequency.setValueAtTime(fundamental * 2.41, now);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.28 * volume, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
  osc1.connect(gain);
  osc2.connect(gain);
  if (masterGain)
    gain.connect(masterGain);
  osc1.start(now);
  osc2.start(now);
  osc1.stop(now + 0.45);
  osc2.stop(now + 0.45);
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
function toggleWindAmbiance(forceState) {
  const ctx = getAudioContext();
  if (!ctx)
    return false;
  const newState = forceState !== undefined ? forceState : !windNode;
  if (newState && !windNode) {
    const bufferSize = ctx.sampleRate * 3;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0;i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      data[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
      data[i] *= 0.11;
      b6 = white * 0.115926;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(350, ctx.currentTime);
    filter.Q.setValueAtTime(4, ctx.currentTime);
    const lfo = ctx.createOscillator();
    lfo.frequency.setValueAtTime(0.2, ctx.currentTime);
    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(250, ctx.currentTime);
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.35 * volume, ctx.currentTime + 1);
    source.connect(filter);
    filter.connect(gain);
    if (masterGain)
      gain.connect(masterGain);
    source.start();
    lfo.start();
    windNode = { source, gain, filter, lfo };
  } else if (!newState && windNode) {
    try {
      const activeWind = windNode;
      activeWind.gain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      setTimeout(() => {
        try {
          activeWind.source.stop();
          activeWind.lfo.stop();
        } catch {}
      }, 500);
      windNode = null;
    } catch {
      windNode = null;
    }
  }
  return windNode !== null;
}
function playSingingBowlSound(pitch = 216) {
  const ctx = getAudioContext();
  if (!ctx || isMuted)
    return;
  const now = ctx.currentTime;
  const partials = [1, 2.76, 5.4, 8.1];
  const amplitudes = [0.4, 0.18, 0.08, 0.03];
  partials.forEach((mult, idx) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(pitch * mult, now);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(amplitudes[idx] * volume, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0005, now + 3);
    osc.connect(gain);
    if (masterGain)
      gain.connect(masterGain);
    osc.start(now);
    osc.stop(now + 3);
  });
}
function setBreatheIntensity(phase) {
  const ctx = getAudioContext();
  if (!ctx || !windNode)
    return;
  const now = ctx.currentTime;
  if (phase === "inhale") {
    windNode.filter.frequency.cancelScheduledValues(now);
    windNode.filter.frequency.linearRampToValueAtTime(650, now + 3.8);
  } else if (phase === "hold") {
    windNode.filter.frequency.cancelScheduledValues(now);
    windNode.filter.frequency.setValueAtTime(650, now);
  } else if (phase === "exhale") {
    windNode.filter.frequency.cancelScheduledValues(now);
    windNode.filter.frequency.linearRampToValueAtTime(260, now + 3.8);
  }
}
function playRakeSound() {
  const ctx = getAudioContext();
  if (!ctx || isMuted)
    return;
  const now = ctx.currentTime;
  const duration = 0.14;
  const bufferSize = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0;i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.sin(i / bufferSize * Math.PI);
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(1800 + Math.random() * 400, now);
  filter.Q.setValueAtTime(2.2, now);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.28 * volume, now);
  gain.gain.linearRampToValueAtTime(0.35 * volume, now + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  noise.connect(filter);
  filter.connect(gain);
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(340 + Math.random() * 40, now);
  osc.frequency.exponentialRampToValueAtTime(280, now + duration);
  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0.08 * volume, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  osc.connect(oscGain);
  if (masterGain) {
    gain.connect(masterGain);
    oscGain.connect(masterGain);
  }
  noise.start(now);
  noise.stop(now + duration);
  osc.start(now);
  osc.stop(now + duration);
}
function playJinSound() {
  const ctx = getAudioContext();
  if (!ctx || isMuted)
    return;
  const now = ctx.currentTime;
  const duration = 0.16;
  const bufferSize = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0;i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.04));
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(1450, now);
  filter.Q.setValueAtTime(4, now);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.45 * volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  noise.connect(filter);
  filter.connect(gain);
  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(820, now);
  osc.frequency.exponentialRampToValueAtTime(460, now + duration);
  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0.2 * volume, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  osc.connect(oscGain);
  if (masterGain) {
    gain.connect(masterGain);
    oscGain.connect(masterGain);
  }
  noise.start(now);
  noise.stop(now + duration);
  osc.start(now);
  osc.stop(now + duration);
}
function playShishiOdoshiClack() {
  const ctx = getAudioContext();
  if (!ctx || isMuted)
    return;
  const now = ctx.currentTime;
  const oscLow = ctx.createOscillator();
  oscLow.type = "sine";
  oscLow.frequency.setValueAtTime(88, now);
  oscLow.frequency.exponentialRampToValueAtTime(62, now + 0.12);
  const gainLow = ctx.createGain();
  gainLow.gain.setValueAtTime(0.7 * volume, now);
  gainLow.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
  oscLow.connect(gainLow);
  const oscMid = ctx.createOscillator();
  oscMid.type = "triangle";
  oscMid.frequency.setValueAtTime(350, now);
  oscMid.frequency.exponentialRampToValueAtTime(260, now + 0.09);
  const gainMid = ctx.createGain();
  gainMid.gain.setValueAtTime(0.45 * volume, now);
  gainMid.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
  oscMid.connect(gainMid);
  const clickOsc = ctx.createOscillator();
  clickOsc.type = "square";
  clickOsc.frequency.setValueAtTime(940, now);
  clickOsc.frequency.exponentialRampToValueAtTime(400, now + 0.03);
  const clickGain = ctx.createGain();
  clickGain.gain.setValueAtTime(0.35 * volume, now);
  clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
  clickOsc.connect(clickGain);
  if (masterGain) {
    gainLow.connect(masterGain);
    gainMid.connect(masterGain);
    clickGain.connect(masterGain);
  }
  oscLow.start(now);
  oscLow.stop(now + 0.15);
  oscMid.start(now);
  oscMid.stop(now + 0.1);
  clickOsc.start(now);
  clickOsc.stop(now + 0.035);
}
function playFurinSound() {
  const ctx = getAudioContext();
  if (!ctx || isMuted)
    return;
  const now = ctx.currentTime;
  const frequencies = [1760, 2640, 3520];
  const ringDuration = 2.4;
  frequencies.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq + (Math.random() * 6 - 3), now);
    const gain = ctx.createGain();
    const amp = 0.28 / (idx + 1) * volume;
    gain.gain.setValueAtTime(amp, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + ringDuration);
    osc.connect(gain);
    if (masterGain)
      gain.connect(masterGain);
    osc.start(now);
    osc.stop(now + ringDuration);
  });
}
var rainGain = null;
var rainSource = null;
function toggleRainAmbiance(enabled) {
  const ctx = getAudioContext();
  if (!ctx)
    return;
  if (enabled) {
    if (rainSource)
      return;
    const bufferSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0;i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      data[i] = (b0 + b1 + b2) * 0.15;
    }
    rainSource = ctx.createBufferSource();
    rainSource.buffer = buffer;
    rainSource.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(2200, ctx.currentTime);
    rainGain = ctx.createGain();
    rainGain.gain.setValueAtTime(0.001, ctx.currentTime);
    rainGain.gain.linearRampToValueAtTime(0.22 * volume, ctx.currentTime + 1.2);
    rainSource.connect(filter);
    filter.connect(rainGain);
    if (masterGain)
      rainGain.connect(masterGain);
    rainSource.start(0);
  } else {
    if (rainSource && rainGain && ctx) {
      rainGain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.8);
      setTimeout(() => {
        rainSource?.stop();
        rainSource?.disconnect();
        rainSource = null;
        rainGain = null;
      }, 850);
    }
  }
}
function playWoodCreakSound(strain = 0.8) {
  const ctx = getAudioContext();
  if (!ctx || isMuted)
    return;
  const now = ctx.currentTime;
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const gain = ctx.createGain();
  osc1.type = "sawtooth";
  osc2.type = "triangle";
  const baseFreq = 95 + strain * 40;
  osc1.frequency.setValueAtTime(baseFreq, now);
  osc1.frequency.linearRampToValueAtTime(baseFreq * 0.92, now + 0.18);
  osc2.frequency.setValueAtTime(baseFreq * 1.48, now);
  osc2.frequency.linearRampToValueAtTime(baseFreq * 1.35, now + 0.18);
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(420, now);
  filter.Q.setValueAtTime(6, now);
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(0.24 * volume * Math.min(1, strain), now + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
  osc1.connect(filter);
  osc2.connect(filter);
  filter.connect(gain);
  if (masterGain)
    gain.connect(masterGain);
  osc1.start(now);
  osc2.start(now);
  osc1.stop(now + 0.22);
  osc2.stop(now + 0.22);
}
function playBarkCrackSound() {
  const ctx = getAudioContext();
  if (!ctx || isMuted)
    return;
  const now = ctx.currentTime;
  const bufferSize = Math.floor(ctx.sampleRate * 0.04);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0;i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.2));
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(2600 + Math.random() * 800, now);
  filter.Q.setValueAtTime(8, now);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.35 * volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
  noise.connect(filter);
  filter.connect(gain);
  if (masterGain)
    gain.connect(masterGain);
  noise.start(now);
}
function playBranchSnapSound() {
  const ctx = getAudioContext();
  if (!ctx || isMuted)
    return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(140, now);
  osc.frequency.exponentialRampToValueAtTime(52, now + 0.12);
  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0.6 * volume, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
  osc.connect(oscGain);
  if (masterGain)
    oscGain.connect(masterGain);
  osc.start(now);
  osc.stop(now + 0.14);
  const bufferSize = Math.floor(ctx.sampleRate * 0.18);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0;i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.15));
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(1650, now);
  filter.Q.setValueAtTime(3.5, now);
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.85 * volume, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
  noise.connect(filter);
  filter.connect(noiseGain);
  if (masterGain)
    noiseGain.connect(masterGain);
  noise.start(now);
}
function playSapDripSound() {
  const ctx = getAudioContext();
  if (!ctx || isMuted)
    return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(580, now);
  osc.frequency.exponentialRampToValueAtTime(860, now + 0.05);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.22 * volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
  osc.connect(gain);
  if (masterGain)
    gain.connect(masterGain);
  osc.start(now);
  osc.stop(now + 0.07);
}

// src/sim/precisionPrune.ts
function lineSegmentsIntersect(a, b, c, d) {
  const det = (b.x - a.x) * (d.y - c.y) - (d.x - c.x) * (b.y - a.y);
  if (Math.abs(det) < 0.000000001)
    return false;
  const lambda = ((d.y - c.y) * (d.x - a.x) + (c.x - d.x) * (d.y - a.y)) / det;
  const gamma = ((a.y - b.y) * (d.x - a.x) + (b.x - a.x) * (d.y - a.y)) / det;
  return 0 <= lambda && lambda <= 1 && 0 <= gamma && gamma <= 1;
}
function distToSegment(p, v, w) {
  const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2;
  if (l2 < 0.00000001)
    return { dist: Math.hypot(p.x - v.x, p.y - v.y), t: 0 };
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  const projX = v.x + t * (w.x - v.x);
  const projY = v.y + t * (w.y - v.y);
  return { dist: Math.hypot(p.x - projX, p.y - projY), t };
}
function swipeSliceCurvedStems(state, p1, p2, stemTransforms) {
  let currentState = state;
  let cutCount = 0;
  let maxCutThickness = 1;
  const hits = [];
  for (const tr of stemTransforms.values()) {
    const node = currentState.nodes.find((n) => n.id === tr.nodeId);
    if (!node || node.isCut)
      continue;
    const steps = 10;
    let prevPt = { x: tr.startX, y: tr.startY };
    for (let i = 1;i <= steps; i++) {
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
function pluckLeavesAlongSwipe(state, p1, p2, stemTransforms, threshold = 18) {
  const pluckedIds = new Set;
  for (const n of state.nodes) {
    if (n.type !== "leaf" || n.fallState === "falling")
      continue;
    const parentTr = n.parentId !== null ? stemTransforms.get(n.parentId) : undefined;
    let leafX = n.x;
    let leafY = n.y;
    if (parentTr) {
      const attachT = n.attachT !== undefined ? n.attachT : 1;
      const pt = quadBezierPoint(parentTr.startX, parentTr.startY, parentTr.controlX, parentTr.controlY, parentTr.endX, parentTr.endY, attachT);
      leafX = pt.x;
      leafY = pt.y;
    }
    const { dist } = distToSegment({ x: leafX, y: leafY }, p1, p2);
    if (dist <= threshold) {
      pluckedIds.add(n.id);
    }
  }
  if (pluckedIds.size === 0)
    return { state, pluckedCount: 0 };
  const remainingNodes = state.nodes.filter((n) => !pluckedIds.has(n.id));
  return {
    state: {
      ...state,
      nodes: remainingNodes
    },
    pluckedCount: pluckedIds.size
  };
}
function getNodeThickness(state, nodeId) {
  const node = state.nodes.find((n) => n.id === nodeId);
  if (!node)
    return 1.5;
  let descendantCount = 0;
  const stack = [nodeId];
  while (stack.length > 0) {
    const cur = stack.pop();
    for (const n of state.nodes) {
      if (n.parentId === cur) {
        descendantCount++;
        stack.push(n.id);
      }
    }
  }
  const wood = Math.min(1, (node.age ?? 0) / 80);
  return Math.max(1.2, Math.sqrt(descendantCount + 1) * 1.35 + wood * 1.8);
}
function bendStemWithWire(state, targetNodeId, deltaBend, stemTransforms) {
  const targetNode = state.nodes.find((n) => n.id === targetNodeId);
  if (!targetNode || targetNode.type !== "stem" && targetNode.type !== "meristem" || targetNode.isCut || targetNode.isJin) {
    return Object.assign({ ...state }, {
      bendInfo: {
        bent: false,
        strain: 0,
        flakingBark: false,
        snapped: false,
        nodeId: targetNodeId,
        thickness: 1.5
      }
    });
  }
  const tr = stemTransforms?.get(targetNodeId);
  const thickness = tr?.thickness ?? getNodeThickness(state, targetNodeId);
  const maxBend = 1.45 / Math.pow(thickness, 0.95);
  const prevBend = targetNode.wireCurvature ?? targetNode.wireAngleOffset ?? 0;
  const newBend = prevBend + deltaBend;
  const strain = Math.abs(newBend) / maxBend;
  if (strain >= 1) {
    let findDescendants = function(id) {
      for (const n of state.nodes) {
        if (n.parentId === id && !toRemove.has(n.id)) {
          toRemove.add(n.id);
          findDescendants(n.id);
        }
      }
    };
    const breakAngle = targetNode.angle + Math.sign(newBend) * maxBend * 0.75;
    const breakSplinters = [
      0.8 + Math.random() * 0.4,
      0.5 + Math.random() * 0.3,
      0.9 + Math.random() * 0.5,
      0.4 + Math.random() * 0.4,
      0.7 + Math.random() * 0.3
    ];
    const toRemove = new Set;
    for (const n of state.nodes) {
      if (n.parentId === targetNodeId) {
        toRemove.add(n.id);
        findDescendants(n.id);
      }
    }
    const sapDrops = [...state.sapDrops || []];
    const endX = tr?.endX ?? targetNode.x + Math.cos(targetNode.angle) * targetNode.length * 0.6;
    const endY = tr?.endY ?? targetNode.y + Math.sin(targetNode.angle) * targetNode.length * 0.6;
    for (let i = 0;i < 4; i++) {
      sapDrops.push({
        x: endX + (Math.random() - 0.5) * thickness,
        y: endY + (Math.random() - 0.5) * thickness,
        size: 1.5 + Math.random() * 2,
        alpha: 0.9,
        vy: 4 + Math.random() * 6
      });
    }
    const updatedResources = {
      energy: Math.max(0, (state.resources?.energy ?? 50) - thickness * 5),
      water: Math.max(0, (state.resources?.water ?? 60) - thickness * 6.5),
      structural: Math.max(0, (state.resources?.structural ?? 30) - thickness * 4)
    };
    const remainingNodes = state.nodes.filter((n) => !toRemove.has(n.id)).map((n) => {
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
          targetLength: Math.max(0.4, n.length * 0.55)
        };
      }
      return n;
    });
    const nextState = {
      ...state,
      nodes: remainingNodes,
      resources: updatedResources,
      sapDrops
    };
    return Object.assign(nextState, {
      bendInfo: {
        bent: true,
        strain,
        flakingBark: false,
        snapped: true,
        nodeId: targetNodeId,
        thickness
      }
    });
  }
  const flakingBark = strain >= 0.7;
  const barkFracture = flakingBark ? (strain - 0.7) / 0.3 : 0;
  const barkFlakes = [...state.barkFlakes || []];
  if (flakingBark && Math.random() < 0.45) {
    const tensionSide = newBend > 0 ? -1 : 1;
    const midX = tr?.controlX ?? targetNode.x + Math.cos(targetNode.angle) * targetNode.length * 0.5;
    const midY = tr?.controlY ?? targetNode.y + Math.sin(targetNode.angle) * targetNode.length * 0.5;
    const normalAngle = targetNode.angle + tensionSide * Math.PI / 2;
    barkFlakes.push({
      x: midX + Math.cos(normalAngle) * (thickness * 0.6),
      y: midY + Math.sin(normalAngle) * (thickness * 0.6),
      vx: Math.cos(normalAngle) * (18 + Math.random() * 24),
      vy: Math.sin(normalAngle) * (18 + Math.random() * 24) - 12,
      rot: Math.random() * Math.PI * 2,
      size: 1.8 + Math.random() * 2.2,
      alpha: 1
    });
  }
  const updatedNodes = state.nodes.map((n) => {
    if (n.id !== targetNodeId)
      return n;
    return {
      ...n,
      hasWire: true,
      wireCurvature: newBend,
      wireAngleOffset: newBend,
      barkFracture
    };
  });
  const nextState = {
    ...state,
    nodes: updatedNodes,
    barkFlakes
  };
  return Object.assign(nextState, {
    bendInfo: {
      bent: true,
      strain,
      flakingBark,
      snapped: false,
      nodeId: targetNodeId,
      thickness
    }
  });
}
function carveBranchToJin(state, targetNodeId) {
  const targetNode = state.nodes.find((n) => n.id === targetNodeId);
  if (!targetNode || targetNode.type !== "stem" && targetNode.type !== "meristem") {
    return { state, carved: false, thickness: 1 };
  }
  const subtreeIds = new Set([targetNodeId]);
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
  const updatedNodes = state.nodes.filter((n) => !(subtreeIds.has(n.id) && (n.type === "leaf" || n.type === "flower" || n.type === "bud"))).map((n) => {
    if (subtreeIds.has(n.id)) {
      return {
        ...n,
        isJin: true,
        terminal: false,
        hasWire: false,
        budState: "senescent"
      };
    }
    return n;
  });
  const woodShavings = [...state.woodShavings || []];
  for (let i = 0;i < 6; i++) {
    woodShavings.push({
      x: targetNode.x + (Math.random() - 0.5) * 12,
      y: targetNode.y + (Math.random() - 0.5) * 12,
      vx: (Math.random() - 0.5) * 45,
      vy: -15 - Math.random() * 30,
      rot: Math.random() * Math.PI * 2,
      size: 2.2 + Math.random() * 2.8,
      alpha: 1
    });
  }
  return {
    state: {
      ...state,
      nodes: updatedNodes,
      woodShavings
    },
    carved: true,
    thickness: 2.5
  };
}
function swipeCarveCurvedStems(state, p1, p2, stemTransforms) {
  let currentState = state;
  let carvedCount = 0;
  let maxThickness = 1;
  const hits = [];
  for (const tr of stemTransforms.values()) {
    const node = currentState.nodes.find((n) => n.id === tr.nodeId);
    if (!node || node.isCut || node.isJin || node.type !== "stem" && node.type !== "meristem")
      continue;
    const steps = 10;
    let prevPt = { x: tr.startX, y: tr.startY };
    for (let i = 1;i <= steps; i++) {
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

// src/sim/bonsaiSchools.ts
var BONSAI_STYLES = {
  chokkan: {
    id: "chokkan",
    nameJa: "Chokkan",
    nameEn: "Formal Upright",
    nameDe: "Streng Aufrecht (Chokkan)",
    kanji: "直幹",
    description: "Majestätische aufrechte Solitärform mit kerzengeradem Stamm, sichtbarer Verjüngung und ausgewogener Aststaffelung.",
    keyRequirements: [
      "Apex lotrecht über der Wurzelbasis (|Δx| ≤ 6% der Höhe)",
      "Nahezu gerader Stamm (Sinuosität S ≤ 1.05)",
      "Keine hängenden Äste unterhalb des Topfrands"
    ]
  },
  moyogi: {
    id: "moyogi",
    nameJa: "Moyogi",
    nameEn: "Informal Upright",
    nameDe: "Frei Aufrecht (Moyogi)",
    kanji: "模様木",
    description: "Die klassische Bonsai-Form: Ein harmonisch geschwungener Stamm, dessen Krone wieder über die Wurzelbasis zurückkehrt.",
    keyRequirements: [
      "Harmonischer S-Schwung (Sinuosität S ≥ 1.08)",
      "Apex kehrt über die Wurzelbasis zurück (|Δx| ≤ 14% der Höhe)",
      "Äste entspringen überwiegend an den Außenseiten der Kurven (Kyokusho)"
    ]
  },
  shakan: {
    id: "shakan",
    nameJa: "Shakan",
    nameEn: "Slanting",
    nameDe: "Geneigter Stil (Shakan)",
    kanji: "斜幹",
    description: "Ein vom Wind oder Hang gezeichneter, eleganter Schrägstamm mit starkem Ausgleichsast zur optischen Balance.",
    keyRequirements: [
      "Stammneigung zwischen 18° und 50° gegenüber der Vertikalen",
      "Apex deutlich seitlich versetzt (|Δx| ≥ 25% der Höhe)",
      "Gegengewicht-Ast auf der der Neigung abgewandten Seite"
    ]
  },
  kengai: {
    id: "kengai",
    nameJa: "Kengai",
    nameEn: "Full Cascade",
    nameDe: "Vollkaskade (Kengai)",
    kanji: "懸崖",
    description: "Dramatische Bergkiefern-Form an steilen Granitklippen. Der Hauptast taucht tief unter den Boden des Pflanzgefäßes hinab.",
    keyRequirements: [
      "Kaskadenspitze reicht deutlich unter den Topfboden (y > 38px)",
      "Anfangsbogen steigt zunächst über den Topfrand auf"
    ]
  },
  "han-kengai": {
    id: "han-kengai",
    nameJa: "Han-Kengai",
    nameEn: "Semi-Cascade",
    nameDe: "Halbkaskade (Han-Kengai)",
    kanji: "半懸崖",
    description: "Ein über Flussufer oder Felsvorsprünge ragender Ast, der unter den Topfrand reicht, aber über dem Topfboden bleibt.",
    keyRequirements: [
      "Kaskadenspitze unterhalb des Topfrands (y > 0px)",
      "Bleibt oberhalb oder auf Höhe des Topfbodens (y ≤ 38px)",
      "Ausgeprägte horizontale Weite"
    ]
  },
  bunjingi: {
    id: "bunjingi",
    nameJa: "Bunjingi",
    nameEn: "Literati",
    nameDe: "Literatenstil (Bunjingi)",
    kanji: "文人木",
    description: "Von Zen-Mönchen und Gelehrtenmalern inspirierter, asketisch-schlanker Stamm mit minimalem Blattwerk im oberen Viertel.",
    keyRequirements: [
      "Extremes Schlankheitsverhältnis (Höhe / Basisdurchmesser ≥ 14:1)",
      "Laubmasse fast ausschließlich im oberen Kronenviertel (untere 70% kahl)",
      "Geringe Gesamtzahl an Astetagen (Reduktion aufs Wesentliche)"
    ]
  },
  fukinagashi: {
    id: "fukinagashi",
    nameJa: "Fukinagashi",
    nameEn: "Windswept",
    nameDe: "Windgepeitscht (Fukinagashi)",
    kanji: "吹流し",
    description: "Ein dauerhaftem Küstensturm ausgesetzter Baum, dessen gesamtes Astwerk und Laub in eine einheitliche Windrichtung strömt.",
    keyRequirements: [
      "Über 75% der Ast- und Blattmasse strömen einseitig in Lee-Richtung",
      "Flache, gestreckte Astwinkel in Strömungsrichtung"
    ]
  },
  "jin-shari": {
    id: "jin-shari",
    nameJa: "Jin & Shari",
    nameEn: "Weathered Deadwood",
    nameDe: "Totholz & Lebensader (Jin & Shari)",
    kanji: "神・舎利",
    description: "Verwittertes, weißes Totholz im Kontrast zu einer intakten dunkelbraunen Saftbahn (Mizusui) und frischem Grün.",
    keyRequirements: [
      "Totholzanteil von mindestens 18% der verholzten Knoten",
      "Ununterbrochene Lebensader von der Wurzel zum lebenden Laub"
    ]
  }
};
function extractGeometricMetrics(state) {
  const nodes = state.nodes;
  const root = state.root;
  const stems = nodes.filter((n) => !n.isCut && (n.type === "stem" || n.type === "meristem"));
  const leaves = nodes.filter((n) => !n.isCut && n.type === "leaf" && n.fallState !== "falling");
  const flowers = nodes.filter((n) => !n.isCut && n.type === "flower" && n.fallState !== "falling");
  const rootX = root.x;
  const rootY = root.y;
  let minX = rootX, maxX = rootX;
  let minY = rootY, maxY = rootY;
  for (const n of nodes) {
    if (n.isCut)
      continue;
    if (n.x < minX)
      minX = n.x;
    if (n.x > maxX)
      maxX = n.x;
    if (n.y < minY)
      minY = n.y;
    if (n.y > maxY)
      maxY = n.y;
  }
  const height = Math.max(1, rootY - minY);
  const width = Math.max(1, maxX - minX);
  let apexNode = root;
  let highestY = rootY;
  for (const n of stems) {
    if (n.y < highestY) {
      highestY = n.y;
      apexNode = n;
    }
  }
  const apexX = apexNode.x;
  const apexY = apexNode.y;
  const deltaX = apexX - rootX;
  const apexOffsetRatio = Math.abs(deltaX) / height;
  const dy = rootY - apexY;
  const leanAngleRad = Math.atan2(deltaX, Math.max(1, dy));
  const leanAngleDeg = leanAngleRad * 180 / Math.PI;
  const nodeMap = new Map;
  nodeMap.set(root.id, root);
  for (const n of nodes)
    nodeMap.set(n.id, n);
  const trunkPath = [];
  let curr = apexNode;
  while (curr) {
    trunkPath.unshift(curr);
    if (curr.parentId === null || curr === root || curr.id === root.id)
      break;
    curr = nodeMap.get(curr.parentId);
  }
  let pathLength = 0;
  for (let i = 0;i < trunkPath.length - 1; i++) {
    const a = trunkPath[i];
    const b = trunkPath[i + 1];
    pathLength += Math.hypot(b.x - a.x, b.y - a.y);
  }
  const euclideanDist = Math.hypot(apexX - rootX, apexY - rootY);
  const sinuosity = euclideanDist > 0 ? Math.max(1, pathLength / euclideanDist) : 1;
  let lowestStemY = rootY;
  for (const n of stems) {
    if (n.y > lowestStemY) {
      lowestStemY = n.y;
    }
  }
  const baseNode = trunkPath.find((n) => n.type === "stem") || (trunkPath.length > 0 ? trunkPath[0] : root);
  const baseThickness = Math.max(1.5, Math.min(25, (baseNode.age || 1) * 0.4 + 3));
  const slendernessRatio = height / baseThickness;
  const topQuarterY = minY + 0.25 * height;
  let topLeaves = 0;
  let leftFoliageMass = 0;
  let rightFoliageMass = 0;
  for (const l of leaves) {
    if (l.y <= topQuarterY)
      topLeaves++;
    if (l.x < rootX)
      leftFoliageMass++;
    else
      rightFoliageMass++;
  }
  const crownFoliageRatio = leaves.length > 0 ? topLeaves / leaves.length : 0;
  let firstBranchY = minY;
  const trunkNodeIds = new Set(trunkPath.map((n) => n.id));
  for (const n of nodes) {
    if (n.isCut || n.id === root.id)
      continue;
    if (!trunkNodeIds.has(n.id) && n.parentId !== null && trunkNodeIds.has(n.parentId)) {
      if (n.y > firstBranchY) {
        firstBranchY = n.y;
      }
    }
  }
  const bareTrunkHeight = Math.max(0, rootY - firstBranchY);
  const bareTrunkFraction = Math.min(1, bareTrunkHeight / height);
  const totalFoliage = leftFoliageMass + rightFoliageMass;
  let windwardRatio = 0.5;
  let windFlowDir = "balanced";
  if (totalFoliage > 0) {
    const rRatio = rightFoliageMass / totalFoliage;
    const lRatio = leftFoliageMass / totalFoliage;
    if (rRatio > 0.65) {
      windwardRatio = rRatio;
      windFlowDir = "right";
    } else if (lRatio > 0.65) {
      windwardRatio = lRatio;
      windFlowDir = "left";
    } else {
      windwardRatio = Math.max(rRatio, lRatio);
    }
  }
  let deadwoodCount = 0;
  for (const n of nodes) {
    if (n.isJin || n.isBroken)
      deadwoodCount++;
  }
  const totalWood = stems.length + deadwoodCount;
  const deadwoodRatio = totalWood > 0 ? deadwoodCount / totalWood : 0;
  let hasContinuousLifeline = true;
  for (const l of leaves) {
    let check = l;
    let pathOk = true;
    while (check) {
      if (check.isCut || check.isBroken || check.isJin) {
        pathOk = false;
        break;
      }
      if (check.parentId === null || check.parentId === 0)
        break;
      check = nodeMap.get(check.parentId);
    }
    if (!pathOk) {
      hasContinuousLifeline = false;
      break;
    }
  }
  let outerCurveAdherence = 0.85;
  if (trunkPath.length >= 3) {
    let evaluatedBranches = 0;
    let validBranches = 0;
    for (let i = 1;i < trunkPath.length - 1; i++) {
      const pPrev = trunkPath[i - 1];
      const pCurr = trunkPath[i];
      const pNext = trunkPath[i + 1];
      const bendX = (pPrev.x + pNext.x) / 2 - pCurr.x;
      const childBranches = stems.filter((s) => s.parentId === pCurr.id && !trunkNodeIds.has(s.id));
      for (const cb of childBranches) {
        evaluatedBranches++;
        const branchDirX = cb.x - pCurr.x;
        if (bendX < 0 && branchDirX > 0 || bendX > 0 && branchDirX < 0) {
          validBranches++;
        }
      }
    }
    if (evaluatedBranches > 0) {
      outerCurveAdherence = validBranches / evaluatedBranches;
    }
  }
  const faults = [];
  const branchHeights = stems.filter((s) => s.parentId !== null && trunkNodeIds.has(s.parentId)).map((s) => s.y);
  branchHeights.sort((a, b) => a - b);
  for (let i = 0;i < branchHeights.length - 2; i++) {
    if (Math.abs(branchHeights[i + 2] - branchHeights[i]) < 0.04 * height) {
      faults.push("Kuruma-eda (Radäste: 3+ Äste auf gleicher Höhe)");
      break;
    }
  }
  for (let i = 0;i < branchHeights.length - 1; i++) {
    if (Math.abs(branchHeights[i + 1] - branchHeights[i]) < 0.02 * height) {
      faults.push("Kannon-eda (Gegenständige Balkenäste)");
      break;
    }
  }
  if (outerCurveAdherence < 0.4) {
    faults.push("Uchikomi (Äste in der Innenkurve)");
  }
  return {
    totalNodes: nodes.length,
    stemCount: stems.length,
    leafCount: leaves.length,
    flowerCount: flowers.length,
    height: Number(height.toFixed(1)),
    width: Number(width.toFixed(1)),
    rootX: Number(rootX.toFixed(1)),
    rootY: Number(rootY.toFixed(1)),
    apexX: Number(apexX.toFixed(1)),
    apexY: Number(apexY.toFixed(1)),
    apexOffsetRatio: Number(apexOffsetRatio.toFixed(3)),
    leanAngleDeg: Number(leanAngleDeg.toFixed(1)),
    sinuosity: Number(sinuosity.toFixed(3)),
    lowestStemY: Number((lowestStemY - rootY).toFixed(1)),
    baseCaliper: Number(baseThickness.toFixed(1)),
    slendernessRatio: Number(slendernessRatio.toFixed(1)),
    crownFoliageRatio: Number(crownFoliageRatio.toFixed(2)),
    bareTrunkFraction: Number(bareTrunkFraction.toFixed(2)),
    windwardRatio: Number(windwardRatio.toFixed(2)),
    windFlowDir,
    deadwoodRatio: Number(deadwoodRatio.toFixed(2)),
    hasContinuousLifeline,
    outerCurveAdherence: Number(outerCurveAdherence.toFixed(2)),
    faultCount: faults.length,
    faults
  };
}
function evaluateBonsaiSchools(state) {
  const m = extractGeometricMetrics(state);
  const scores = {
    chokkan: scoreChokkan(m),
    moyogi: scoreMoyogi(m),
    shakan: scoreShakan(m),
    kengai: scoreKengai(m),
    "han-kengai": scoreHanKengai(m),
    bunjingi: scoreBunjingi(m),
    fukinagashi: scoreFukinagashi(m),
    "jin-shari": scoreJinShari(m)
  };
  let highestScore = 0;
  let dominantStyleId = null;
  for (const [id, s] of Object.entries(scores)) {
    if (s.score > highestScore) {
      highestScore = s.score;
      dominantStyleId = id;
    }
  }
  let tier = "none";
  if (highestScore >= 92)
    tier = "kokufu";
  else if (highestScore >= 82)
    tier = "master";
  else if (highestScore >= 68)
    tier = "adept";
  else if (highestScore >= 50)
    tier = "novice";
  const faultPenalty = m.faultCount * 6;
  const overallAestheticScore = Math.max(10, Math.min(100, Math.round(highestScore - faultPenalty)));
  const recommendations = [];
  if (m.faults.length > 0) {
    recommendations.push(...m.faults.map((f) => `Fehlerast korrigieren: ${f}`));
  }
  if (dominantStyleId && scores[dominantStyleId].feedback.length > 0) {
    recommendations.push(...scores[dominantStyleId].feedback);
  }
  return {
    dominantStyle: dominantStyleId ? BONSAI_STYLES[dominantStyleId] : null,
    dominantScore: highestScore,
    tier,
    overallAestheticScore,
    metrics: m,
    scores,
    detectedFaults: m.faults,
    recommendations
  };
}
function scoreChokkan(m) {
  let score = 100;
  const strengths = [];
  const feedback = [];
  if (m.apexOffsetRatio <= 0.04) {
    strengths.push("Exzellente lotrechte Kronenausrichtung über der Wurzelbasis.");
  } else if (m.apexOffsetRatio <= 0.07) {
    score -= 10;
    strengths.push("Gute aufrechte Haltung.");
  } else {
    score -= Math.min(60, Math.round((m.apexOffsetRatio - 0.07) * 200));
    feedback.push("Krone neigt sich zu stark zur Seite für den Chokkan-Stil.");
  }
  if (m.sinuosity <= 1.04) {
    strengths.push("Gerader, würdevoller Stammverlauf.");
  } else {
    score -= Math.min(40, Math.round((m.sinuosity - 1.04) * 120));
    feedback.push("Stamm weist zu viele Biegungen für Chokkan auf; Drahtung begradigen.");
  }
  if (m.lowestStemY > 2) {
    score -= 35;
    feedback.push("Chokkan darf keine herabhängenden Äste unter Topfrand aufweisen.");
  }
  if (m.slendernessRatio >= 5 && m.slendernessRatio <= 12) {
    strengths.push("Natürliches Stammstärken-Verhältnis.");
  } else if (m.slendernessRatio > 14) {
    score -= Math.min(45, Math.round((m.slendernessRatio - 14) * 6));
    feedback.push("Stamm ist zu schlank für Chokkan (eher Bunjingi/Literatenstil).");
  }
  if (m.bareTrunkFraction >= 0.7) {
    score -= 35;
    feedback.push("Chokkan benötigt eine harmonische Astverteilung im unteren und mittleren Bereich.");
  }
  score = Math.max(0, Math.min(100, score));
  return {
    styleId: "chokkan",
    style: BONSAI_STYLES.chokkan,
    score,
    confidence: score / 100,
    strengths,
    feedback
  };
}
function scoreMoyogi(m) {
  let score = 100;
  const strengths = [];
  const feedback = [];
  if (m.apexOffsetRatio <= 0.08) {
    strengths.push("Krone kehrt meisterhaft über das Nebari zurück.");
  } else if (m.apexOffsetRatio <= 0.15) {
    score -= 12;
    strengths.push("Gute Kronenbalance über der Basis.");
  } else {
    score -= Math.min(45, Math.round((m.apexOffsetRatio - 0.15) * 150));
    feedback.push("Die Krone sollte sich wieder über die Wurzelbasis zurückbeugen.");
  }
  if (m.sinuosity >= 1.1) {
    strengths.push("Lebendige, rhythmische Stammlinie mit harmonischen Kurven.");
  } else if (m.sinuosity >= 1.06) {
    score -= 15;
    feedback.push("Etwas mehr Schwung im Stammverlauf nötig.");
  } else {
    score -= 40;
    feedback.push("Stamm ist zu gerade für Moyogi (Frei Aufrecht).");
  }
  if (m.outerCurveAdherence >= 0.7) {
    strengths.push("Äste entspringen vorbildlich an den Außenradien der Kurven.");
  } else {
    score -= Math.min(25, Math.round((0.7 - m.outerCurveAdherence) * 45));
    feedback.push("Äste sollten an den Außenseiten der Biegungen sitzen, nicht in den Falten.");
  }
  score = Math.max(0, Math.min(100, score));
  return {
    styleId: "moyogi",
    style: BONSAI_STYLES.moyogi,
    score,
    confidence: score / 100,
    strengths,
    feedback
  };
}
function scoreShakan(m) {
  let score = 100;
  const strengths = [];
  const feedback = [];
  const absAngle = Math.abs(m.leanAngleDeg);
  if (absAngle >= 20 && absAngle <= 45) {
    strengths.push(`Harmonischer Neigungswinkel (${absAngle.toFixed(0)}° zur Vertikalen).`);
  } else if (absAngle >= 14 && absAngle < 20) {
    score -= 20;
    feedback.push("Neigungswinkel noch etwas zu gering für Shakan.");
  } else if (absAngle > 45 && absAngle <= 60) {
    score -= 25;
    feedback.push("Starke Neigung nähert sich bereits einer Halbkaskade an.");
  } else {
    score -= 55;
    feedback.push("Zu geringe Stammneigung für den Schrägstamm-Stil.");
  }
  if (m.apexOffsetRatio >= 0.25) {
    strengths.push("Ausgeprägte optische Dynamik durch versetzten Scheitelpunkt.");
  } else {
    score -= 30;
  }
  if (m.lowestStemY > 20) {
    score -= 60;
    feedback.push("Kaskadierende Äste unter Topfboden widersprechen Shakan (Schrägstamm).");
  } else if (m.lowestStemY > 4) {
    score -= 30;
    feedback.push("Herabhängende Äste deuten eher auf Halbkaskade hin.");
  }
  score = Math.max(0, Math.min(100, score));
  return {
    styleId: "shakan",
    style: BONSAI_STYLES.shakan,
    score,
    confidence: score / 100,
    strengths,
    feedback
  };
}
function scoreKengai(m) {
  let score = 100;
  const strengths = [];
  const feedback = [];
  if (m.lowestStemY > 38) {
    strengths.push(`Tief herabstürzende Kaskade (fällt ${m.lowestStemY.toFixed(0)}px unter Topfrand).`);
    if (m.lowestStemY > 55) {
      strengths.push("Ausdrucksstarker, dramatischer Felsabsturz.");
    }
  } else if (m.lowestStemY > 20) {
    score -= 35;
    feedback.push("Astspitze taucht noch nicht tief genug unter den Topfboden (>38px) für Vollkaskade.");
  } else if (m.lowestStemY > 0) {
    score -= 55;
    feedback.push("Erfüllt aktuell nur die Kriterien für eine Halbkaskade (Han-Kengai).");
  } else {
    score = 0;
    feedback.push("Keine herabhängenden Kaskadenäste vorhanden.");
  }
  score = Math.max(0, Math.min(100, score));
  return {
    styleId: "kengai",
    style: BONSAI_STYLES.kengai,
    score,
    confidence: score / 100,
    strengths,
    feedback
  };
}
function scoreHanKengai(m) {
  let score = 100;
  const strengths = [];
  const feedback = [];
  if (m.lowestStemY > 4 && m.lowestStemY <= 38) {
    strengths.push(`Perfekte Halbkaskaden-Tiefe (${m.lowestStemY.toFixed(0)}px unter Topfrand, über Topfboden).`);
  } else if (m.lowestStemY > 38) {
    score -= 40;
    feedback.push("Ast fällt bereits zu tief unter den Topfboden; eher Vollkaskade (Kengai).");
  } else if (m.lowestStemY > 0) {
    score -= 20;
    strengths.push("Beginnende Halbkaskadenneigung.");
  } else {
    score = 0;
    feedback.push("Kein Ast ragt unter den Topfrand.");
  }
  if (m.width > m.height * 0.8) {
    strengths.push("Weit ausgreifender, horizontaler Uferast.");
  }
  score = Math.max(0, Math.min(100, score));
  return {
    styleId: "han-kengai",
    style: BONSAI_STYLES["han-kengai"],
    score,
    confidence: score / 100,
    strengths,
    feedback
  };
}
function scoreBunjingi(m) {
  let score = 100;
  const strengths = [];
  const feedback = [];
  if (m.slendernessRatio >= 16) {
    strengths.push(`Hervorragende literarische Eleganz (Schlankheit ${m.slendernessRatio.toFixed(0)}:1).`);
  } else if (m.slendernessRatio >= 12) {
    score -= 15;
    strengths.push("Schlanke Silhouette.");
  } else {
    score -= Math.min(50, Math.round((14 - m.slendernessRatio) * 6));
    feedback.push("Stamm ist zu dick bzw. zu gedrungen für den Bunjingi-Stil (Literatenstil).");
  }
  if (m.bareTrunkFraction >= 0.65) {
    strengths.push("Erhabener, kahler Unterstamm voller Freiraum (Ma).");
  } else {
    score -= Math.min(45, Math.round((0.65 - m.bareTrunkFraction) * 80));
    feedback.push("Untere Äste entfernen, um den kargen, freien Stammcharakter zu betonen.");
  }
  if (m.crownFoliageRatio >= 0.7) {
    strengths.push("Laubmasse sparsam und dicht im Kronenbereich konzentriert.");
  }
  score = Math.max(0, Math.min(100, score));
  return {
    styleId: "bunjingi",
    style: BONSAI_STYLES.bunjingi,
    score,
    confidence: score / 100,
    strengths,
    feedback
  };
}
function scoreFukinagashi(m) {
  let score = 100;
  const strengths = [];
  const feedback = [];
  if (m.windwardRatio >= 0.8) {
    strengths.push(`Starke Windflucht: ${(m.windwardRatio * 100).toFixed(0)}% der Masse strömen nach ${m.windFlowDir === "left" ? "Links" : "Rechts"}.`);
  } else if (m.windwardRatio >= 0.7) {
    score -= 20;
    strengths.push("Spürbare Windströmung.");
  } else {
    score -= Math.min(60, Math.round((0.75 - m.windwardRatio) * 150));
    feedback.push("Äste müssen einseitig in Lee-Richtung gestrafft und geformt werden.");
  }
  const absLean = Math.abs(m.leanAngleDeg);
  if (absLean < 12 && m.apexOffsetRatio < 0.18) {
    score -= 45;
    feedback.push("Fukinagashi erfordert eine spürbare Windneigung von Stamm und Krone.");
  } else if (absLean >= 18) {
    strengths.push(`Stamm neigt sich authentisch mit dem Wind (${absLean.toFixed(0)}°).`);
  }
  if (m.bareTrunkFraction >= 0.65 && m.slendernessRatio >= 14) {
    score -= 35;
    feedback.push("Hoher kahler Stamm ohne Windfahnen-Äste gehört zum Bunjingi-Stil.");
  }
  score = Math.max(0, Math.min(100, score));
  return {
    styleId: "fukinagashi",
    style: BONSAI_STYLES.fukinagashi,
    score,
    confidence: score / 100,
    strengths,
    feedback
  };
}
function scoreJinShari(m) {
  let score = 100;
  const strengths = [];
  const feedback = [];
  if (m.deadwoodRatio >= 0.2 && m.deadwoodRatio <= 0.6) {
    strengths.push(`Harmonischer Totholzanteil von ${(m.deadwoodRatio * 100).toFixed(0)}% (Wabi-Sabi Ästhetik).`);
  } else if (m.deadwoodRatio > 0.08) {
    score -= 25;
    feedback.push("Totholz-Skulpturen (Jin/Shari) noch etwas zurückhaltend.");
  } else {
    score = 0;
    feedback.push("Noch kein Totholz geschnitzt (Jin-Werkzeug nutzen).");
  }
  if (m.hasContinuousLifeline) {
    strengths.push("Lebensader (Mizusui) unversehrt: Alle Blätter sind vital versorgt.");
  } else {
    score -= 40;
    feedback.push("Warnung: Eine Totholzpartie hat die Lebensader zu lebenden Trieben gekappt!");
  }
  score = Math.max(0, Math.min(100, score));
  return {
    styleId: "jin-shari",
    style: BONSAI_STYLES["jin-shari"],
    score,
    confidence: score / 100,
    strengths,
    feedback
  };
}

// src/data/rewards.ts
var TOKONOMA_REWARD_CATALOG = [
  {
    id: "kakejiku_mountain_sansui",
    name: "Distant Mountain Mist (Sansui)",
    kanji: "山水幽玄掛軸",
    category: "kakejiku",
    rarity: "fine",
    formality: "gyo",
    season: "autumn",
    scaleRatio: 0.75,
    visualFlowBias: "right",
    aestheticScoreBonus: 10,
    renderProps: {
      primaryColor: "#e6e0d4",
      secondaryColor: "#52525b"
    },
    description: "Gestaffelte Bergkämme, die im Morgennebel verblassen. Bringt zeitlose Tiefe und Ruhe in den Tokonoma-Raum.",
    unlockCondition: "Kultiviere einen Baum im Shakan-Stil (Geneigter Stamm) oder beginne deine Bonsai-Reise.",
    checkUnlocked: (state, report) => {
      if (!report)
        return true;
      return report.scores.shakan.score >= 50 || (state.unlockedRewards?.includes("kakejiku_mountain_sansui") ?? true);
    }
  },
  {
    id: "kakejiku_zen_enso",
    name: "Zen Void Circle (Enso)",
    kanji: "円相掛軸",
    category: "kakejiku",
    rarity: "rare",
    formality: "so",
    season: "all-season",
    scaleRatio: 0.7,
    visualFlowBias: "neutral",
    aestheticScoreBonus: 15,
    renderProps: {
      primaryColor: "#faf8f5",
      secondaryColor: "#18181b"
    },
    description: "Ein in einem einzigen Pinselstrich vollendeter Kreis des Meisters. Symbolisiert Leerheit, Erleuchtung und den Kreislauf allen Seins.",
    unlockCondition: "Schnitze mindestens 2 Totholz-Partien (Jin & Shari) oder erreiche Jin-Shari Score ≥ 60.",
    checkUnlocked: (state, report) => {
      const jinNodes = state.nodes.filter((n) => n.isJin);
      if (jinNodes.length >= 2)
        return true;
      if (report && report.scores["jin-shari"].score >= 60)
        return true;
      return false;
    }
  },
  {
    id: "kakejiku_harvest_moon",
    name: "Autumn Full Moon (Meigetsu)",
    kanji: "秋月掛軸",
    category: "kakejiku",
    rarity: "masterpiece",
    formality: "gyo",
    season: "autumn",
    scaleRatio: 0.72,
    visualFlowBias: "left",
    aestheticScoreBonus: 20,
    renderProps: {
      primaryColor: "#0f172a",
      secondaryColor: "#fef08a"
    },
    description: "Ein leuchtender Vollmond aus Blattgold vor tiefblauem Nachthimmel. Weckt die heitere Stille des Tsukimi-Festes.",
    unlockCondition: "Erreiche die Schule Fukinagashi (Windgepeitscht) mit Score ≥ 65.",
    checkUnlocked: (_state, report) => {
      return Boolean(report && report.scores.fukinagashi.score >= 65);
    }
  },
  {
    id: "tenpai_bronze_fisherman",
    name: "Solitary River Fisherman",
    kanji: "釣人銅添配",
    category: "tenpai",
    rarity: "fine",
    formality: "so",
    season: "summer",
    scaleRatio: 0.12,
    visualFlowBias: "left",
    aestheticScoreBonus: 8,
    renderProps: {
      primaryColor: "#4d5b53",
      secondaryColor: "#b45309"
    },
    description: "Handgegossene patinierte Bronze eines Anglers mit zarter Bambusrute. Beschwört die Einsamkeit eines stillen Gebirgsflusses herauf.",
    unlockCondition: "Erreiche den Han-Kengai (Halbkaskade) Stil mit Score ≥ 65.",
    checkUnlocked: (_state, report) => {
      return Boolean(report && report.scores["han-kengai"].score >= 65);
    }
  },
  {
    id: "tenpai_bronze_crane",
    name: "Auspicious Tancho Crane",
    kanji: "丹頂鶴添配",
    category: "tenpai",
    rarity: "rare",
    formality: "shin",
    season: "winter",
    scaleRatio: 0.14,
    visualFlowBias: "neutral",
    aestheticScoreBonus: 14,
    renderProps: {
      primaryColor: "#f4f4f5",
      secondaryColor: "#dc2626"
    },
    description: "Patinierter Mandschurenkranich aus Bronze; Symbol für Langlebigkeit, Treue und anmutige Erhabenheit.",
    unlockCondition: "Meisterklasse: Erziele einen Chokkan- oder Moyogi-Score von ≥ 85 Punkten.",
    checkUnlocked: (_state, report) => {
      if (!report)
        return false;
      return report.scores.chokkan.score >= 85 || report.scores.moyogi.score >= 85;
    }
  },
  {
    id: "koro_celadon_tripod",
    name: "Celadon Tri-Footed Incense Burner",
    kanji: "青磁三足香炉",
    category: "koro",
    rarity: "rare",
    formality: "shin",
    season: "all-season",
    scaleRatio: 0.18,
    visualFlowBias: "neutral",
    aestheticScoreBonus: 15,
    renderProps: {
      primaryColor: "#a7f3d0",
      secondaryColor: "#065f46",
      accentColor: "#fef08a",
      hasParticleEffect: true,
      particleType: "smoke"
    },
    description: "Blassgrünes Seladon-Räuchergefäß auf drei Füßen. Sendet einen sanft aufsteigenden Faden aus Agarholz-Rauch aus.",
    unlockCondition: "Erziele in einer beliebigen klassischen Schule einen Reifegrad von Adept (Score ≥ 70).",
    checkUnlocked: (_state, report) => {
      return Boolean(report && report.dominantScore >= 70);
    }
  },
  {
    id: "suiseki_kamogawa_toyama",
    name: "Kamogawa Distant Mountain Stone",
    kanji: "鴨川遠山石",
    category: "suiseki",
    rarity: "masterpiece",
    formality: "gyo",
    season: "all-season",
    scaleRatio: 0.26,
    visualFlowBias: "right",
    aestheticScoreBonus: 18,
    renderProps: {
      primaryColor: "#27272a",
      secondaryColor: "#78350f"
    },
    description: "Vom Flusswasser polierter Basaltstein des Kamo-Flusses auf passgenauem Palisander-Daiza. Stellt eine ferne Gebirgskette dar.",
    unlockCondition: "Kultiviere einen literarischen Bunjingi-Baum mit Score ≥ 65.",
    checkUnlocked: (_state, report) => {
      return Boolean(report && report.scores.bunjingi.score >= 65);
    }
  },
  {
    id: "suiseki_furuya_waterfall",
    name: "Furuya Waterfall Stone",
    kanji: "古谷滝石",
    category: "suiseki",
    rarity: "national-treasure",
    formality: "shin",
    season: "summer",
    scaleRatio: 0.28,
    visualFlowBias: "left",
    aestheticScoreBonus: 25,
    renderProps: {
      primaryColor: "#18181b",
      secondaryColor: "#f8fafc",
      accentColor: "#78350f"
    },
    description: "Seltener Furuya-Stein mit senkrechter schneeweißer Quarzader, die wie ein tosender Wasserfall über schwarzen Fels stürzt.",
    unlockCondition: "Kultiviere eine vollendete Vollkaskade (Kengai) mit Score ≥ 65.",
    checkUnlocked: (_state, report) => {
      return Boolean(report && report.scores.kengai.score >= 65);
    }
  },
  {
    id: "shitakusa_kokedama_mossball",
    name: "Velvet Moss Sphere (Kokedama)",
    kanji: "深緑苔玉",
    category: "shitakusa",
    rarity: "common",
    formality: "so",
    season: "all-season",
    scaleRatio: 0.16,
    visualFlowBias: "neutral",
    aestheticScoreBonus: 6,
    renderProps: {
      primaryColor: "#15803d",
      secondaryColor: "#3f6212",
      accentColor: "#78350f"
    },
    description: "Mooskugel auf geschwärztem Zedernholzbrettchen. Verströmt feuchte, erdige Frische im Raum.",
    unlockCondition: "Starter-Begleitpflanze oder Pflege mit Moospolstern.",
    checkUnlocked: () => true
  },
  {
    id: "shitakusa_wild_violet_fern",
    name: "Alpine Fern & Wild Violet",
    kanji: "羊歯・野菫下草",
    category: "shitakusa",
    rarity: "fine",
    formality: "so",
    season: "spring",
    scaleRatio: 0.2,
    visualFlowBias: "right",
    aestheticScoreBonus: 10,
    renderProps: {
      primaryColor: "#166534",
      secondaryColor: "#8b5cf6",
      accentColor: "#52525b"
    },
    description: "Zarte Frauenhaarfarn-Wedel vereint mit violetten Alpenveilchen in einer schlichten Schale aus Nanban-Ton.",
    unlockCondition: "Bringe deinen Bonsai zur Blütezeit (mindestens 1 Blüte am Baum).",
    checkUnlocked: (state) => {
      const flowers = state.nodes.filter((n) => n.type === "flower" && !n.isCut);
      return flowers.length >= 1;
    }
  },
  {
    id: "ishidoro_yukimi_lantern",
    name: "Yukimi Snow-Viewing Lantern",
    kanji: "雪見石灯籠",
    category: "ishidoro",
    rarity: "rare",
    formality: "gyo",
    season: "winter",
    scaleRatio: 0.24,
    visualFlowBias: "neutral",
    aestheticScoreBonus: 16,
    renderProps: {
      primaryColor: "#71717a",
      secondaryColor: "#fef3c7",
      accentColor: "#52525b",
      hasParticleEffect: true,
      particleType: "glow"
    },
    description: "Aus Granit gemeißelte Schneebetrachtungs-Laterne mit breitem Schirmdach und Dreibeinfüßen, in der eine warme Flamme brennt.",
    unlockCondition: "Pflege deinen Baum durch die winterliche Kälteperiode (Schritt 180+ im Zyklus).",
    checkUnlocked: (state) => {
      const season = state.step % (state.cycleLength || 250);
      return season >= 180;
    }
  }
];
var DEFAULT_UNLOCKED_REWARDS = [
  "kakejiku_mountain_sansui",
  "shitakusa_kokedama_mossball"
];
var STORAGE_KEY_UNLOCKED = "zenplant_unlocked_rewards_v1";
var STORAGE_KEY_ACTIVE = "zenplant_active_accoutrements_v1";
function loadRewardsFromStorage() {
  try {
    const rawUnlocked = localStorage.getItem(STORAGE_KEY_UNLOCKED);
    const rawActive = localStorage.getItem(STORAGE_KEY_ACTIVE);
    const unlockedIds = rawUnlocked ? JSON.parse(rawUnlocked) : [...DEFAULT_UNLOCKED_REWARDS];
    for (const d of DEFAULT_UNLOCKED_REWARDS) {
      if (!unlockedIds.includes(d))
        unlockedIds.push(d);
    }
    const active = rawActive ? JSON.parse(rawActive) : { scrollId: "kakejiku_mountain_sansui", accentId: "shitakusa_kokedama_mossball" };
    return { unlockedIds, active };
  } catch {
    return {
      unlockedIds: [...DEFAULT_UNLOCKED_REWARDS],
      active: { scrollId: "kakejiku_mountain_sansui", accentId: "shitakusa_kokedama_mossball" }
    };
  }
}
function saveRewardsToStorage(unlockedIds, active) {
  try {
    localStorage.setItem(STORAGE_KEY_UNLOCKED, JSON.stringify(unlockedIds));
    localStorage.setItem(STORAGE_KEY_ACTIVE, JSON.stringify(active));
  } catch {}
}
function checkNewUnlocks(state, report) {
  const currentUnlocked = new Set(state.unlockedRewards || DEFAULT_UNLOCKED_REWARDS);
  const newlyUnlocked = [];
  for (const item of TOKONOMA_REWARD_CATALOG) {
    if (currentUnlocked.has(item.id))
      continue;
    if (item.checkUnlocked(state, report)) {
      currentUnlocked.add(item.id);
      newlyUnlocked.push(item);
    }
  }
  if (newlyUnlocked.length > 0) {
    state.unlockedRewards = Array.from(currentUnlocked);
    const active = state.activeAccoutrements || {
      scrollId: "kakejiku_mountain_sansui",
      accentId: "shitakusa_kokedama_mossball"
    };
    saveRewardsToStorage(state.unlockedRewards, active);
  }
  return newlyUnlocked;
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
var currentTool = "shear";
var slashPoints = [];
var waterDroplets = [];
var breatheInterval = null;
var breathePhase = "inhale";
function setTool(tool) {
  currentTool = tool;
  const tools = ["shear", "water", "wire", "jin", "rake", "breathe"];
  tools.forEach((t) => {
    const btn = $(`tool-${t}`);
    if (btn) {
      if (t === tool)
        btn.classList.add("active");
      else
        btn.classList.remove("active");
    }
  });
  const hint = $("zen-hint");
  if (hint) {
    if (tool === "shear")
      hint.textContent = "✂️ Schere: Über Äste wischen zum Schneiden oder Zupfen";
    else if (tool === "water")
      hint.textContent = "\uD83D\uDCA7 Gießen: Sanften Nebel sprühen & Boden befeuchten";
    else if (tool === "wire")
      hint.textContent = "\uD83E\uDEA2 Draht: Ast berühren & ziehen zum Formen mit Kupferdraht";
    else if (tool === "jin")
      hint.textContent = "\uD83E\uDEB5 Jin: Ast berühren oder wischen zum Formen gebleichten Totholzes";
    else if (tool === "rake")
      hint.textContent = "\uD83E\uDEA8 Harke: Im Sandbett ziehen für meditative Karesansui-Wellen";
    else if (tool === "breathe")
      hint.textContent = "\uD83E\uDDD8 Atmen: Achtsame geführte Meditation";
  }
  if (tool === "breathe") {
    startBreatheMode();
  } else {
    const overlay = $("breathe-overlay");
    if (overlay && overlay.classList.contains("active")) {
      stopBreatheMode();
    }
  }
}
function startBreatheMode() {
  const overlay = $("breathe-overlay");
  const circle = $("breathe-circle");
  const text = $("breathe-text");
  if (!overlay || !circle || !text)
    return;
  overlay.classList.add("active");
  breathePhase = "inhale";
  text.textContent = "Einatmen… (4s)";
  circle.classList.remove("contracting");
  circle.classList.add("expanding");
  playSingingBowlSound(216);
  setBreatheIntensity("inhale");
  if (breatheInterval)
    clearInterval(breatheInterval);
  let step = 0;
  breatheInterval = window.setInterval(() => {
    step = (step + 1) % 3;
    if (step === 0) {
      breathePhase = "inhale";
      text.textContent = "Einatmen… (4s)";
      circle.classList.remove("contracting");
      circle.classList.add("expanding");
      playSingingBowlSound(216);
      setBreatheIntensity("inhale");
    } else if (step === 1) {
      breathePhase = "hold";
      text.textContent = "Halten… (4s)";
      setBreatheIntensity("hold");
    } else {
      breathePhase = "exhale";
      text.textContent = "Ausatmen… (4s)";
      circle.classList.remove("expanding");
      circle.classList.add("contracting");
      playSingingBowlSound(144);
      setBreatheIntensity("exhale");
    }
  }, 4000);
}
function stopBreatheMode() {
  if (breatheInterval) {
    clearInterval(breatheInterval);
    breatheInterval = null;
  }
  const overlay = $("breathe-overlay");
  const circle = $("breathe-circle");
  if (overlay)
    overlay.classList.remove("active");
  if (circle)
    circle.classList.remove("expanding", "contracting");
  setTool("shear");
}
var history = [];
var MAX_HISTORY = 80;
function saveHistory() {
  const win = window;
  if (!win.state)
    return;
  history.push({
    state: JSON.parse(JSON.stringify(win.state)),
    seed,
    selected: [...selected]
  });
  if (history.length > MAX_HISTORY) {
    history.shift();
  }
}
function rewindOneStep() {
  const prev = history.pop();
  if (!prev)
    return;
  const win = window;
  win.state = prev.state;
  seed = prev.seed;
  selected = prev.selected;
  prng = createPrng(seed + (win.state?.step ?? 0));
  syncDesignControls();
  try {
    playWaterSound();
  } catch {}
  draw();
}
var dev = {
  showPoints: false,
  showIds: false,
  showHitbox: false,
  hitRadius: 20
};
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
function updateSpeciesUI(id) {
  const sp = getSpeciesById(id);
  const select = $("species-select");
  if (select && select.value !== id)
    select.value = id;
  const title = $("species-title");
  if (title && sp)
    title.textContent = sp.name;
}
var activeGalleryCategory = "all";
var toastTimeout = null;
function showAchievementToast(icon, title, desc) {
  const toast = $("achievement-toast");
  const iconEl = $("toast-icon");
  const titleEl = $("toast-title");
  const descEl = $("toast-desc");
  if (!toast || !iconEl || !titleEl || !descEl)
    return;
  iconEl.textContent = icon;
  titleEl.textContent = title;
  descEl.textContent = desc;
  toast.classList.add("visible");
  if (toastTimeout)
    clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => {
    toast.classList.remove("visible");
    toastTimeout = null;
  }, 4500);
}
function checkSchoolsAndUnlocks(source) {
  const win = window;
  if (!win.state)
    return;
  const report = evaluateBonsaiSchools(win.state);
  const newlyUnlocked = checkNewUnlocks(win.state, report);
  if (newlyUnlocked.length > 0) {
    try {
      playSingingBowlSound();
    } catch {}
    for (const item of newlyUnlocked) {
      showAchievementToast("\uD83C\uDFC6", "Neuer Tokonoma-Schatz!", `${item.name} (${item.kanji}) freigeschaltet.`);
    }
    renderGalleryGrid();
  }
  if (report.dominantStyle && report.dominantScore >= 60) {
    const prevStyle = win.state.lastRecognizedStyle;
    const prevScore = win.state.lastStyleScore || 0;
    if (prevStyle !== report.dominantStyle.id || report.dominantScore >= prevScore + 8) {
      win.state.lastRecognizedStyle = report.dominantStyle.id;
      win.state.lastStyleScore = report.dominantScore;
      if (report.dominantScore >= 75 && newlyUnlocked.length === 0) {
        showAchievementToast("\uD83C\uDF3F", `Stil erkannt: ${report.dominantStyle.nameDe}`, `Punkte: ${report.dominantScore}/100 (${report.tier.toUpperCase()})`);
      }
    }
  }
}
function openGalleryModal() {
  const modal = $("modal-gallery");
  if (!modal)
    return;
  renderGalleryGrid();
  modal.classList.add("open");
}
function closeGalleryModal() {
  const modal = $("modal-gallery");
  if (modal)
    modal.classList.remove("open");
}
function renderGalleryGrid() {
  const grid = $("gallery-grid");
  const win = window;
  if (!grid || !win.state)
    return;
  const unlockedSet = new Set(win.state.unlockedRewards || DEFAULT_UNLOCKED_REWARDS);
  const active = win.state.activeAccoutrements || {
    scrollId: "kakejiku_mountain_sansui",
    accentId: "shitakusa_kokedama_mossball"
  };
  const filtered = TOKONOMA_REWARD_CATALOG.filter((item) => {
    if (activeGalleryCategory === "all")
      return true;
    return item.category === activeGalleryCategory;
  });
  grid.innerHTML = "";
  for (const item of filtered) {
    const isUnlocked = unlockedSet.has(item.id);
    const isEquipped = active.scrollId === item.id || active.accentId === item.id;
    const card = document.createElement("div");
    card.className = `reward-card ${isEquipped ? "equipped" : ""} ${isUnlocked ? "" : "locked"}`;
    const formalityBadge = item.formality === "shin" ? `<span class="badge badge-shin">Shin (Formal)</span>` : item.formality === "gyo" ? `<span class="badge badge-gyo">Gyo (Halbformal)</span>` : `<span class="badge badge-so">So (Informell)</span>`;
    const rarityBadge = `<span class="badge badge-rarity">${item.rarity.toUpperCase()}</span>`;
    let buttonHtml = "";
    if (isEquipped) {
      buttonHtml = `<button class="card-btn btn-active" disabled>✓ Aktiv im Tokonoma</button>`;
    } else if (isUnlocked) {
      const equipLabel = item.category === "kakejiku" ? "Als Hängerolle wählen" : "Als Begleitobjekt wählen";
      buttonHtml = `<button class="card-btn btn-equip" data-item-id="${item.id}" data-item-cat="${item.category}">${equipLabel}</button>`;
    } else {
      buttonHtml = `<button class="card-btn btn-locked" disabled>\uD83D\uDD12 Noch gesperrt</button>`;
    }
    card.innerHTML = `
      <div>
        <div class="card-top">
          <span class="card-kanji">${item.kanji}</span>
          <div class="card-badges">${formalityBadge}${rarityBadge}</div>
        </div>
        <div class="card-title">${item.name}</div>
        <div class="card-desc">${item.description}</div>
        <div class="card-condition">
          <strong>${isUnlocked ? "✓ Freigeschaltet" : "Bedingung"}:</strong> ${item.unlockCondition}
        </div>
      </div>
      <div>${buttonHtml}</div>
    `;
    grid.appendChild(card);
  }
  grid.querySelectorAll(".btn-equip").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const target = e.currentTarget;
      const itemId = target.getAttribute("data-item-id");
      const itemCat = target.getAttribute("data-item-cat");
      if (!itemId || !itemCat)
        return;
      if (!win.state.activeAccoutrements)
        win.state.activeAccoutrements = {};
      if (itemCat === "kakejiku") {
        win.state.activeAccoutrements.scrollId = itemId;
      } else {
        win.state.activeAccoutrements.accentId = itemId;
      }
      saveRewardsToStorage(win.state.unlockedRewards || [], win.state.activeAccoutrements);
      try {
        playFurinSound();
      } catch {}
      renderGalleryGrid();
      draw();
    });
  });
}
function openFaqModal() {
  const modal = $("modal-faq");
  if (modal)
    modal.classList.add("open");
}
function closeFaqModal() {
  const modal = $("modal-faq");
  if (modal)
    modal.classList.remove("open");
}
function newPlant(newSeed = Math.random() * 1e9 | 0, targetSpeciesId) {
  const win = window;
  if (win.state && win.state.nodes.length > 0) {
    greenhouse.push(JSON.parse(JSON.stringify(win.state)));
    persist();
  }
  seed = newSeed;
  prng = createPrng(seed);
  const sp = (targetSpeciesId ? getSpeciesById(targetSpeciesId) : undefined) ?? SPECIES[Math.floor(Math.random() * SPECIES.length)];
  const genome = generateGenomeForSpecies(sp, seed);
  win.state = freshState(genome, sp, { seed });
  const savedRewards = loadRewardsFromStorage();
  win.state.unlockedRewards = savedRewards.unlockedIds;
  win.state.activeAccoutrements = savedRewards.active;
  for (let i = 0;i < 80; i++)
    win.state = growOnce(win.state, prng);
  syncDesignControls();
  updateSpeciesUI(sp.id);
  draw();
}
function syncDesignControls() {
  const win = window;
  if (!win.state)
    return;
  const g = win.state.genome;
  const angleVal = Math.round(expressTrait(g, "angle") || 35);
  const flowerVal = Number((expressTrait(g, "flowerRadius") || 8).toFixed(1));
  const stiffVal = Number((expressTrait(g, "stiffness") || 1).toFixed(2));
  const angleSlider = $("design-angle");
  const flowerSlider = $("design-flower-size");
  const stiffSlider = $("design-stiffness");
  if (angleSlider)
    angleSlider.value = String(angleVal);
  if (flowerSlider)
    flowerSlider.value = String(flowerVal);
  if (stiffSlider)
    stiffSlider.value = String(stiffVal);
  const angleOut = $("design-angle-value");
  const flowerOut = $("design-flower-size-value");
  const stiffOut = $("design-stiffness-value");
  if (angleOut)
    angleOut.textContent = `${angleVal}°`;
  if (flowerOut)
    flowerOut.textContent = String(flowerVal);
  if (stiffOut)
    stiffOut.textContent = String(stiffVal);
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
  const info = renderPlant(ctx, win.state, r.width, r.height, dev);
  if (slashPoints.length > 1) {
    renderBladeSlashTrail(ctx, slashPoints, Date.now());
  }
  if (waterDroplets.length > 0) {
    renderWaterDroplets(ctx, waterDroplets);
  }
  const [name] = info.split("·");
  const seasonInfo = seasonOf(win.state.step, win.state.cycleLength || 250);
  const badge = $("season-badge");
  if (badge) {
    badge.textContent = `${seasonInfo.name} · Step ${win.state.step} · Seed ${seed}`;
    badge.style.color = seasonInfo.color;
  }
  const sp = getSpeciesById(win.state.speciesId) || SPECIES[0];
  const speciesTitle = $("species-title");
  if (speciesTitle) {
    speciesTitle.textContent = `${sp.name} (${seasonInfo.name})`;
  }
  const g = win.state.genome;
  const isIdentified = win.state.nodes.length > 20;
  const speciesName = isIdentified ? sp.name : "Unknown Species";
  const genomeBox = $("genome-info");
  if (genomeBox) {
    genomeBox.innerHTML = `Vigor ${expressTrait(g, "vigor").toFixed(2)} · Angle ${expressTrait(g, "angle").toFixed(0)}° · Len ${expressTrait(g, "lenScale").toFixed(0)}<br>` + `${speciesName} · Nodes ${win.state.nodes.length} · History ${history.length}/${MAX_HISTORY}`;
  }
  renderSlots();
}
function renderSlots() {
  const box = $("slots-container");
  if (!box)
    return;
  if (greenhouse.length === 0) {
    box.innerHTML = '<div style="font-size:11px;color:#64748b;text-align:center">Save plants for breeding.</div>';
    const bb = $("btn-breed");
    if (bb)
      bb.style.display = "none";
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
  if (bb) {
    if (selected.length === 2) {
      bb.style.display = "block";
      bb.textContent = `Breed #${selected[0] + 1} + #${selected[1] + 1}`;
    } else {
      bb.style.display = "none";
    }
  }
}
canvas.style.touchAction = "none";
var dragging = false;
var dragStartX = 0;
var dragStartY = 0;
var dragStartCamX = 0;
var dragStartCamY = 0;
var activePointerId = null;
var pointerDownX = 0;
var pointerDownY = 0;
var pointerMovedDist = 0;
var activeWireNodeId = null;
function getPlantCoord(clientX, clientY) {
  const win = window;
  const r = canvas.getBoundingClientRect();
  const { scale, ox, oy } = computeTransform(r.width, r.height, win.state?.showRoots ?? false, win.state?.cameraX ?? 0, win.state?.cameraY ?? 0, win.state?.cameraZoom ?? 1);
  return {
    x: (clientX - r.left - ox) / scale,
    y: (clientY - r.top - oy) / scale
  };
}
function sprayWater(cx, cy) {
  const win = window;
  if (!win.state)
    return;
  for (let i = 0;i < 6; i++) {
    const angle = Math.PI / 4 + Math.random() * (Math.PI / 2);
    const speed = 40 + Math.random() * 100;
    waterDroplets.push({
      x: cx + (Math.random() - 0.5) * 16,
      y: cy + (Math.random() - 0.5) * 16,
      vx: Math.cos(angle) * speed * (Math.random() > 0.5 ? 1 : -1),
      vy: Math.sin(angle) * speed,
      radius: 2.2 + Math.random() * 3.2,
      alpha: 0.9
    });
  }
  win.state.soilMoisture = Math.min(1, (win.state.soilMoisture ?? 0.5) + 0.035);
  if (Math.random() < 0.1) {
    win.state = growOnce(win.state, prng);
  }
  try {
    playWaterSound();
  } catch {}
  draw();
}
function pruneAt(clientX, clientY) {
  const win = window;
  if (!win.state)
    return;
  const pt = getPlantCoord(clientX, clientY);
  const stemTransforms = getStemTransforms();
  let bestHit = null;
  const hitRadius = dev.hitRadius ?? 20;
  for (const tr of stemTransforms.values()) {
    const hit = closestPointOnQuadratic(pt, tr.startX, tr.startY, tr.controlX, tr.controlY, tr.endX, tr.endY);
    if (hit.distance <= hitRadius && (!bestHit || hit.distance < bestHit.distance)) {
      bestHit = { nodeId: tr.nodeId, t: hit.t, distance: hit.distance, thickness: tr.thickness };
    }
  }
  if (bestHit !== null) {
    saveHistory();
    win.state = pruneNodeAt(win.state, bestHit.nodeId, bestHit.t);
    try {
      playPruneSound(bestHit.thickness);
    } catch {}
    draw();
    checkSchoolsAndUnlocks("prune");
  }
}
function rakeSandAt(canvasX, canvasY) {
  const win = window;
  if (!win.state)
    return;
  const r = canvas.getBoundingClientRect();
  const ox = r.width / 2 + (win.state.cameraX ?? 0);
  const oy = r.height * 0.82 + (win.state.cameraY ?? 0);
  const xTray = canvasX - ox;
  const yTray = canvasY - oy;
  if (!win.state.sandRipples)
    win.state.sandRipples = [];
  const ripples = win.state.sandRipples;
  const lastRipple = ripples[ripples.length - 1];
  const dist = lastRipple ? Math.hypot(xTray - lastRipple.x, yTray - lastRipple.y) : 999;
  if (dist > 9) {
    ripples.push({
      x: xTray,
      y: yTray,
      radius: 12 + Math.random() * 8,
      intensity: 0.95
    });
    if (ripples.length > 55)
      ripples.shift();
    try {
      playRakeSound();
    } catch {}
    draw();
  }
}
canvas.addEventListener("pointerdown", (e) => {
  getAudioContext();
  const win = window;
  if (e.button === 1 || e.button === 2 || e.altKey || e.shiftKey) {
    dragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragStartCamX = win.state?.cameraX ?? 0;
    dragStartCamY = win.state?.cameraY ?? 0;
    return;
  }
  activePointerId = e.pointerId;
  canvas.setPointerCapture?.(e.pointerId);
  pointerDownX = e.clientX;
  pointerDownY = e.clientY;
  pointerMovedDist = 0;
  const r = canvas.getBoundingClientRect();
  const canvasX = e.clientX - r.left;
  const canvasY = e.clientY - r.top;
  const ox = r.width / 2 + (win.state?.cameraX ?? 0);
  const oy = r.height * 0.82 + (win.state?.cameraY ?? 0);
  const xTray = canvasX - ox;
  const yTray = canvasY - oy;
  if (xTray >= -185 && xTray <= -125 && yTray >= 10 && yTray <= 65) {
    if (win.state)
      win.state.shishiWater = 1;
    playShishiOdoshiClack();
    draw();
    return;
  }
  if (currentTool === "shear") {
    slashPoints = [{ x: canvasX, y: canvasY, time: Date.now() }];
  } else if (currentTool === "water") {
    sprayWater(canvasX, canvasY);
  } else if (currentTool === "rake") {
    rakeSandAt(canvasX, canvasY);
  } else if (currentTool === "jin") {
    slashPoints = [{ x: canvasX, y: canvasY, time: Date.now() }];
  } else if (currentTool === "wire") {
    const pt = getPlantCoord(e.clientX, e.clientY);
    const stemTransforms = getStemTransforms();
    let bestHit = null;
    const hitRadius = (dev.hitRadius ?? 20) * 1.5;
    for (const tr of stemTransforms.values()) {
      const hit = closestPointOnQuadratic(pt, tr.startX, tr.startY, tr.controlX, tr.controlY, tr.endX, tr.endY);
      if (hit.distance <= hitRadius && (!bestHit || hit.distance < bestHit.distance)) {
        bestHit = { nodeId: tr.nodeId, distance: hit.distance };
      }
    }
    if (bestHit) {
      activeWireNodeId = bestHit.nodeId;
    }
  }
});
canvas.addEventListener("pointermove", (e) => {
  const win = window;
  if (dragging) {
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    if (win.state) {
      win.state.cameraX = dragStartCamX + dx;
      win.state.cameraY = dragStartCamY + dy;
    }
    draw();
    return;
  }
  if (activePointerId !== e.pointerId)
    return;
  const dx = e.clientX - pointerDownX;
  const dy = e.clientY - pointerDownY;
  pointerMovedDist += Math.hypot(e.movementX || dx, e.movementY || dy);
  const r = canvas.getBoundingClientRect();
  const canvasX = e.clientX - r.left;
  const canvasY = e.clientY - r.top;
  if (currentTool === "shear" || currentTool === "jin") {
    slashPoints.push({ x: canvasX, y: canvasY, time: Date.now() });
    draw();
  } else if (currentTool === "water") {
    if (Math.random() < 0.45) {
      sprayWater(canvasX, canvasY);
    }
  } else if (currentTool === "rake") {
    rakeSandAt(canvasX, canvasY);
  } else if (currentTool === "wire" && activeWireNodeId !== null) {
    const win = window;
    if (win.state) {
      const angleDelta = (e.movementX || dx * 0.05) * 0.012;
      const stemTransforms = getStemTransforms();
      const nextState = bendStemWithWire(win.state, activeWireNodeId, angleDelta, stemTransforms);
      win.state = nextState;
      if (nextState.bendInfo.snapped) {
        playBranchSnapSound();
        playSapDripSound();
        activeWireNodeId = null;
        saveHistory();
      } else if (nextState.bendInfo.flakingBark) {
        if (Math.random() < 0.35)
          playBarkCrackSound();
        if (Math.random() < 0.25)
          playWoodCreakSound(nextState.bendInfo.strain);
      }
      draw();
    }
  }
});
canvas.addEventListener("pointerup", (e) => {
  if (dragging) {
    dragging = false;
    return;
  }
  if (activePointerId !== e.pointerId)
    return;
  activePointerId = null;
  const win = window;
  if (!win.state)
    return;
  if (currentTool === "rake") {
    saveHistory();
    return;
  }
  if (currentTool === "shear") {
    const dist = Math.hypot(e.clientX - pointerDownX, e.clientY - pointerDownY);
    if (dist > 14) {
      const p1 = getPlantCoord(pointerDownX, pointerDownY);
      const p2 = getPlantCoord(e.clientX, e.clientY);
      const stemTransforms = getStemTransforms();
      const sliceRes = swipeSliceCurvedStems(win.state, p1, p2, stemTransforms);
      let didChange = false;
      if (sliceRes.cutCount > 0) {
        saveHistory();
        win.state = sliceRes.state;
        playPruneSound(sliceRes.maxCutThickness);
        didChange = true;
      }
      const pluckRes = pluckLeavesAlongSwipe(win.state, p1, p2, stemTransforms, 18);
      if (pluckRes.pluckedCount > 0) {
        if (!didChange)
          saveHistory();
        win.state = pluckRes.state;
        playDefoliateSound();
        didChange = true;
      }
      if (didChange) {
        draw();
        checkSchoolsAndUnlocks("swipeSlice");
      }
    } else {
      pruneAt(e.clientX, e.clientY);
    }
  } else if (currentTool === "jin") {
    const dist = Math.hypot(e.clientX - pointerDownX, e.clientY - pointerDownY);
    if (dist > 14) {
      const p1 = getPlantCoord(pointerDownX, pointerDownY);
      const p2 = getPlantCoord(e.clientX, e.clientY);
      const stemTransforms = getStemTransforms();
      const carveRes = swipeCarveCurvedStems(win.state, p1, p2, stemTransforms);
      if (carveRes.carvedCount > 0) {
        saveHistory();
        win.state = carveRes.state;
        playJinSound();
        draw();
        checkSchoolsAndUnlocks("jin");
      }
    } else {
      const pt = getPlantCoord(e.clientX, e.clientY);
      const stemTransforms = getStemTransforms();
      let bestHit = null;
      const hitRadius = (dev.hitRadius ?? 20) * 1.6;
      for (const tr of stemTransforms.values()) {
        const hit = closestPointOnQuadratic(pt, tr.startX, tr.startY, tr.controlX, tr.controlY, tr.endX, tr.endY);
        if (hit.distance <= hitRadius && (!bestHit || hit.distance < bestHit.distance)) {
          bestHit = { nodeId: tr.nodeId, distance: hit.distance };
        }
      }
      if (bestHit) {
        saveHistory();
        const res = carveBranchToJin(win.state, bestHit.nodeId);
        if (res.carved) {
          win.state = res.state;
          playJinSound();
          draw();
          checkSchoolsAndUnlocks("jin");
        }
      }
    }
  } else if (currentTool === "wire" && activeWireNodeId !== null) {
    saveHistory();
    playWireSound();
    activeWireNodeId = null;
    draw();
    checkSchoolsAndUnlocks("wire");
  }
});
canvas.addEventListener("pointercancel", () => {
  activePointerId = null;
  dragging = false;
  activeWireNodeId = null;
});
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const delta = e.deltaY > 0 ? -0.1 : 0.1;
  const win = window;
  if (win.state) {
    win.state.cameraZoom = Math.max(0.3, Math.min(3, (win.state.cameraZoom ?? 1) + delta));
  }
  draw();
}, { passive: false });
$("btn-drawer-toggle")?.addEventListener("click", () => {
  $("studio-drawer")?.classList.add("open");
  $("drawer-backdrop")?.classList.add("open");
});
$("btn-drawer-close")?.addEventListener("click", () => {
  $("studio-drawer")?.classList.remove("open");
  $("drawer-backdrop")?.classList.remove("open");
});
$("drawer-backdrop")?.addEventListener("click", () => {
  $("studio-drawer")?.classList.remove("open");
  $("drawer-backdrop")?.classList.remove("open");
});
$("btn-quick-grow")?.addEventListener("click", () => {
  $("btn-grow")?.click();
});
$("btn-time-speed")?.addEventListener("click", (e) => {
  getAudioContext();
  const win = window;
  if (!win.state)
    return;
  const currentSpeed = win.state.timeSpeed ?? 1;
  let nextSpeed = 1;
  if (currentSpeed === 1)
    nextSpeed = 2;
  else if (currentSpeed === 2)
    nextSpeed = 5;
  else
    nextSpeed = 1;
  win.state.timeSpeed = nextSpeed;
  e.currentTarget.textContent = `⏳ ${nextSpeed}x`;
  draw();
});
$("tool-shear")?.addEventListener("click", () => setTool("shear"));
$("tool-water")?.addEventListener("click", () => setTool("water"));
$("tool-wire")?.addEventListener("click", () => setTool("wire"));
$("tool-jin")?.addEventListener("click", () => setTool("jin"));
$("tool-rake")?.addEventListener("click", () => setTool("rake"));
$("tool-breathe")?.addEventListener("click", () => setTool("breathe"));
$("tool-undo")?.addEventListener("click", () => rewindOneStep());
$("btn-breathe-exit")?.addEventListener("click", () => stopBreatheMode());
$("species-select")?.addEventListener("change", (e) => {
  const targetId = e.target.value;
  saveHistory();
  newPlant(seed, targetId);
});
var weathers = ["clear", "komorebi", "rain", "twilight"];
var weatherIdx = 0;
$("btn-weather")?.addEventListener("click", () => {
  getAudioContext();
  const win = window;
  if (!win.state)
    return;
  weatherIdx = (weatherIdx + 1) % weathers.length;
  win.state.weather = weathers[weatherIdx];
  if (win.state.weather === "rain") {
    toggleRainAmbiance(true);
  } else {
    toggleRainAmbiance(false);
  }
  draw();
});
$("pot-select")?.addEventListener("change", (e) => {
  const win = window;
  if (!win.state)
    return;
  saveHistory();
  win.state.potStyle = e.target.value;
  draw();
});
$("btn-gallery")?.addEventListener("click", () => {
  getAudioContext();
  openGalleryModal();
});
$("btn-gallery-close")?.addEventListener("click", closeGalleryModal);
$("modal-gallery")?.addEventListener("click", (e) => {
  if (e.target === $("modal-gallery"))
    closeGalleryModal();
});
$("gallery-filters")?.querySelectorAll(".filter-chip").forEach((chip) => {
  chip.addEventListener("click", (e) => {
    $("gallery-filters")?.querySelectorAll(".filter-chip").forEach((c) => c.classList.remove("active"));
    const target = e.currentTarget;
    target.classList.add("active");
    activeGalleryCategory = target.getAttribute("data-cat") || "all";
    renderGalleryGrid();
  });
});
$("btn-faq")?.addEventListener("click", () => {
  getAudioContext();
  openFaqModal();
});
$("btn-faq-close")?.addEventListener("click", closeFaqModal);
$("modal-faq")?.addEventListener("click", (e) => {
  if (e.target === $("modal-faq"))
    closeFaqModal();
});
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeGalleryModal();
    closeFaqModal();
  }
});
$("btn-tokonoma")?.addEventListener("click", () => {
  getAudioContext();
  const win = window;
  if (!win.state)
    return;
  win.state.isTokonoma = true;
  document.body.classList.add("tokonoma-mode");
  playFurinSound();
  draw();
});
$("btn-tokonoma-exit")?.addEventListener("click", () => {
  const win = window;
  if (!win.state)
    return;
  win.state.isTokonoma = false;
  document.body.classList.remove("tokonoma-mode");
  draw();
});
$("btn-grow")?.addEventListener("click", () => {
  getAudioContext();
  saveHistory();
  const win = window;
  for (let i = 0;i < 10; i++)
    if (win.state)
      win.state = growOnce(win.state, prng);
  playGrowSound(Math.floor(Math.random() * 5));
  draw();
  checkSchoolsAndUnlocks("grow");
});
$("btn-grow-season")?.addEventListener("click", () => {
  getAudioContext();
  saveHistory();
  const win = window;
  for (let i = 0;i < 50; i++)
    if (win.state)
      win.state = growOnce(win.state, prng);
  playGrowSound(2);
  draw();
  checkSchoolsAndUnlocks("grow");
});
$("btn-step")?.addEventListener("click", () => {
  getAudioContext();
  saveHistory();
  const win = window;
  if (win.state)
    win.state = growOnce(win.state, prng);
  playGrowSound(1);
  draw();
  checkSchoolsAndUnlocks("grow");
});
$("btn-rewind")?.addEventListener("click", () => {
  getAudioContext();
  rewindOneStep();
});
$("btn-reset")?.addEventListener("click", () => {
  getAudioContext();
  saveHistory();
  playWaterSound();
  newPlant();
});
$("btn-play")?.addEventListener("click", (e) => {
  playing = !playing;
  e.target.textContent = playing ? "Pause" : "Play";
});
$("btn-save")?.addEventListener("click", () => {
  getAudioContext();
  const win = window;
  if (win.state)
    greenhouse.push(JSON.parse(JSON.stringify(win.state)));
  playSaveSound();
  persist();
  draw();
});
$("btn-breed")?.addEventListener("click", () => {
  if (selected.length !== 2)
    return;
  saveHistory();
  const g0 = greenhouse[selected[0]].genome;
  const g1 = greenhouse[selected[1]].genome;
  const child = breedGenomes(g0, g1, prng);
  const win = window;
  win.state = freshState(child, SPECIES[0], { seed: Math.random() * 1e9 | 0 });
  for (let i = 0;i < 30; i++)
    win.state = growOnce(win.state, prng);
  selected = [];
  syncDesignControls();
  draw();
});
function setupDesignSlider(id, outputId, suffix = "") {
  const el = $(id);
  const out = $(outputId);
  if (!el || !out)
    return;
  el.addEventListener("input", () => {
    out.textContent = `${el.value}${suffix}`;
  });
}
setupDesignSlider("design-angle", "design-angle-value", "°");
setupDesignSlider("design-flower-size", "design-flower-size-value");
setupDesignSlider("design-stiffness", "design-stiffness-value");
$("btn-apply-design")?.addEventListener("click", () => {
  const win = window;
  if (!win.state)
    return;
  saveHistory();
  const angleVal = parseFloat($("design-angle").value);
  const flowerVal = parseFloat($("design-flower-size").value);
  const stiffVal = parseFloat($("design-stiffness").value);
  win.state.genome.angle = [angleVal, angleVal];
  win.state.genome.flowerRadius = [flowerVal, flowerVal];
  win.state.genome.stiffness = [stiffVal, stiffVal];
  try {
    playGrowSound(3);
  } catch {}
  draw();
});
$("btn-pro")?.addEventListener("click", () => {
  const p = $("pro-panel");
  if (p)
    p.style.display = p.style.display === "none" ? "block" : "none";
});
$("dev-show-points")?.addEventListener("change", (e) => {
  dev.showPoints = e.target.checked;
  draw();
});
$("dev-show-ids")?.addEventListener("change", (e) => {
  dev.showIds = e.target.checked;
  draw();
});
$("dev-show-hitbox")?.addEventListener("change", (e) => {
  dev.showHitbox = e.target.checked;
  draw();
});
$("dev-hit-radius")?.addEventListener("input", (e) => {
  dev.hitRadius = parseFloat(e.target.value);
  const label = $("dev-hit-radius-value");
  if (label)
    label.textContent = `${dev.hitRadius}px`;
  if (dev.showHitbox)
    draw();
});
$("btn-export")?.addEventListener("click", () => {
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
$("btn-svg")?.addEventListener("click", () => {
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
$("btn-import")?.addEventListener("click", () => $("import-file")?.click());
$("import-file")?.addEventListener("change", async (e) => {
  const f = e.target.files?.[0];
  if (!f)
    return;
  saveHistory();
  const win = window;
  win.state = importPlantJSON(await f.text());
  prng = createPrng(win.state.step + seed);
  syncDesignControls();
  draw();
});
$("btn-dark")?.addEventListener("click", () => {
  const win = window;
  if (win.state) {
    win.state.darkMode = !win.state.darkMode;
    document.body.classList.toggle("dark-mode", win.state.darkMode);
  }
  draw();
});
$("btn-wood")?.addEventListener("click", (e) => {
  const win = window;
  if (win.state) {
    win.state.woodTexture = !win.state.woodTexture;
    e.target.textContent = win.state.woodTexture ? "Wood: ON" : "Wood: OFF";
  }
  draw();
});
$("btn-wind")?.addEventListener("click", (e) => {
  windEnabled = !windEnabled;
  toggleWindAmbiance(windEnabled);
  e.target.textContent = windEnabled ? "Wind: ON" : "Wind: OFF";
});
var isDocumentVisible = true;
document.addEventListener("visibilitychange", () => {
  isDocumentVisible = !document.hidden;
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
var lastWindTime = performance.now();
var lastGrowTime = performance.now();
var autoHistoryCounter = 0;
function animLoop(now) {
  if (!isDocumentVisible) {
    requestAnimationFrame(animLoop);
    return;
  }
  const dt = Math.min(0.1, (now - lastWindTime) / 1000);
  lastWindTime = now;
  const win = window;
  let fxRedrawNeeded = false;
  if (slashPoints.length > 0) {
    const cutoff = Date.now() - 350;
    const initialLen = slashPoints.length;
    slashPoints = slashPoints.filter((p) => p.time > cutoff);
    if (slashPoints.length > 0 || initialLen > 0) {
      fxRedrawNeeded = true;
    }
  }
  if (waterDroplets.length > 0) {
    const gravity = 850;
    for (const d of waterDroplets) {
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.vy += gravity * dt;
      d.alpha -= dt * 1.6;
    }
    waterDroplets = waterDroplets.filter((d) => d.alpha > 0.02 && d.y < canvas.height + 20);
    fxRedrawNeeded = true;
  }
  if (win.state?.barkFlakes && win.state.barkFlakes.length > 0) {
    for (const f of win.state.barkFlakes) {
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.vy += 220 * dt;
      f.rot += 4 * dt;
      f.alpha -= dt * 1.5;
    }
    win.state.barkFlakes = win.state.barkFlakes.filter((f) => f.alpha > 0.05);
    fxRedrawNeeded = true;
  }
  if (win.state?.woodShavings && win.state.woodShavings.length > 0) {
    for (const s of win.state.woodShavings) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 170 * dt;
      s.rot += 3.2 * dt;
      s.alpha -= dt * 1.2;
    }
    win.state.woodShavings = win.state.woodShavings.filter((s) => s.alpha > 0.05);
    fxRedrawNeeded = true;
  }
  if (win.state?.sapDrops && win.state.sapDrops.length > 0) {
    for (const drop of win.state.sapDrops) {
      drop.y += drop.vy * dt;
      drop.vy += 90 * dt;
      drop.alpha -= dt * 0.35;
    }
    win.state.sapDrops = win.state.sapDrops.filter((d) => d.alpha > 0.05);
    fxRedrawNeeded = true;
  }
  const timeMultiplier = win.state?.timeSpeed ?? 1;
  const currentGrowSpeed = (win.state?.growSpeed ?? 1) * timeMultiplier;
  let growthRedrawNeeded = false;
  if (playing && win.state && currentGrowSpeed > 0) {
    const elongationRate = 7 * currentGrowSpeed * dt;
    const leafUnfurlRate = 1.8 * currentGrowSpeed * dt;
    for (const n of win.state.nodes) {
      if (!n.isCut && n.terminal && (n.type === "meristem" || n.type === "stem")) {
        if (n.length < n.targetLength) {
          n.length = Math.min(n.targetLength, n.length + elongationRate);
          growthRedrawNeeded = true;
        }
      }
      if (n.type === "leaf" && (n.age ?? 0) < 5) {
        n.age = Math.min(5, (n.age ?? 0) + leafUnfurlRate);
        growthRedrawNeeded = true;
      }
    }
    const stepInterval = Math.max(90, 480 / currentGrowSpeed);
    if (now - lastGrowTime > stepInterval) {
      lastGrowTime = now;
      if (autoHistoryCounter % 15 === 0) {
        saveHistory();
      }
      autoHistoryCounter++;
      win.state = growOnce(win.state, prng);
      growthRedrawNeeded = true;
    }
  }
  let shishiRedrawNeeded = false;
  if (win.state) {
    const prevWater = win.state.shishiWater ?? 0;
    const newWater = prevWater + dt * (1 / 14);
    if (newWater >= 1) {
      win.state.shishiWater = 0;
      playShishiOdoshiClack();
      shishiRedrawNeeded = true;
    } else {
      win.state.shishiWater = newWater;
      shishiRedrawNeeded = true;
    }
    if (win.state.weather === "rain" && (win.state.soilMoisture ?? 0) < 0.95) {
      win.state.soilMoisture = Math.min(0.95, (win.state.soilMoisture ?? 0.5) + dt * 0.05);
    }
  }
  const activeWeather = win.state?.weather;
  const weatherAnimated = activeWeather === "rain" || activeWeather === "twilight" || activeWeather === "komorebi" || win.state?.isTokonoma;
  if (windEnabled && win.state) {
    win.state.windTime += dt * 2;
    draw();
  } else if (fxRedrawNeeded || growthRedrawNeeded || shishiRedrawNeeded || weatherAnimated) {
    if (win.state)
      win.state.windTime = (win.state.windTime ?? 0) + dt * 1.5;
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
