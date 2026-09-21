/**
 * ZenPlant - Classical Bonsai Schools Mathematical Recognition Engine
 * 
 * Implements deterministic geometric heuristics grounded in Nippon Bonsai Association (NBA)
 * and Kokufu-ten (国風盆栽展) standards.
 * 
 * Recognized Canonical Styles:
 * 1. Chokkan (直幹 — Formal Upright)
 * 2. Moyogi (模様木 — Informal Upright)
 * 3. Shakan (斜幹 — Slanting)
 * 4. Kengai (懸崖 — Full Cascade)
 * 5. Han-Kengai (半懸崖 — Semi-Cascade)
 * 6. Bunjingi (文人木 — Literati)
 * 7. Fukinagashi (吹流し — Windswept)
 * 8. Jin & Shari (死に木 / 舎利 — Ancient Weathered Deadwood)
 */

import type { PlantState, PlantNode } from "./types";

export type BonsaiStyleId =
  | "chokkan"
  | "moyogi"
  | "shakan"
  | "kengai"
  | "han-kengai"
  | "bunjingi"
  | "fukinagashi"
  | "jin-shari";

export interface BonsaiStyleDescriptor {
  id: BonsaiStyleId;
  nameJa: string;
  nameEn: string;
  nameDe: string;
  kanji: string;
  description: string;
  keyRequirements: string[];
}

export const BONSAI_STYLES: Record<BonsaiStyleId, BonsaiStyleDescriptor> = {
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
      "Keine hängenden Äste unterhalb des Topfrands",
    ],
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
      "Äste entspringen überwiegend an den Außenseiten der Kurven (Kyokusho)",
    ],
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
      "Gegengewicht-Ast auf der der Neigung abgewandten Seite",
    ],
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
      "Anfangsbogen steigt zunächst über den Topfrand auf",
    ],
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
      "Ausgeprägte horizontale Weite",
    ],
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
      "Geringe Gesamtzahl an Astetagen (Reduktion aufs Wesentliche)",
    ],
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
      "Flache, gestreckte Astwinkel in Strömungsrichtung",
    ],
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
      "Ununterbrochene Lebensader von der Wurzel zum lebenden Laub",
    ],
  },
};

export interface GeometricMetrics {
  totalNodes: number;
  stemCount: number;
  leafCount: number;
  flowerCount: number;
  height: number;
  width: number;
  rootX: number;
  rootY: number;
  apexX: number;
  apexY: number;
  apexOffsetRatio: number; // |Δx_apex| / height
  leanAngleDeg: number;
  sinuosity: number;
  lowestStemY: number; // in pot space: >0 is below rim, >38 is below base
  baseCaliper: number;
  slendernessRatio: number;
  crownFoliageRatio: number; // fraction of foliage in top 25% of height
  bareTrunkFraction: number; // fraction of trunk height with no lateral branches
  windwardRatio: number; // directional foliage asymmetry
  windFlowDir: "left" | "right" | "balanced";
  deadwoodRatio: number;
  hasContinuousLifeline: boolean;
  outerCurveAdherence: number; // 0..1
  faultCount: number;
  faults: string[];
}

export interface SchoolScore {
  styleId: BonsaiStyleId;
  style: BonsaiStyleDescriptor;
  score: number; // 0 to 100
  confidence: number; // 0.0 to 1.0
  strengths: string[];
  feedback: string[];
}

export interface BonsaiSchoolReport {
  dominantStyle: BonsaiStyleDescriptor | null;
  dominantScore: number;
  tier: "none" | "novice" | "adept" | "master" | "kokufu";
  overallAestheticScore: number;
  metrics: GeometricMetrics;
  scores: Record<BonsaiStyleId, SchoolScore>;
  detectedFaults: string[];
  recommendations: string[];
}

/**
 * Extract quantifiable geometric and botanical metrics from the plant state.
 */
export function extractGeometricMetrics(state: PlantState): GeometricMetrics {
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
    if (n.isCut) continue;
    if (n.x < minX) minX = n.x;
    if (n.x > maxX) maxX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.y > maxY) maxY = n.y;
  }

  const height = Math.max(1, rootY - minY); // Upward in canvas is negative Y
  const width = Math.max(1, maxX - minX);

  // Find the highest living stem/meristem (apex)
  let apexNode: PlantNode = root;
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

  // Lean angle: angle between vertical line (pointing straight up) and vector (deltaX, apexY - rootY)
  const dy = rootY - apexY; // dy > 0 when apex is above root
  const leanAngleRad = Math.atan2(deltaX, Math.max(1, dy));
  const leanAngleDeg = (leanAngleRad * 180) / Math.PI;

  // Trace the primary trunk spine from apex back to root
  const nodeMap = new Map<number, PlantNode>();
  nodeMap.set(root.id, root);
  for (const n of nodes) nodeMap.set(n.id, n);

  const trunkPath: PlantNode[] = [];
  let curr: PlantNode | undefined = apexNode;
  while (curr) {
    trunkPath.unshift(curr);
    if (curr.parentId === null || curr === root || curr.id === root.id) break;
    curr = nodeMap.get(curr.parentId);
  }

  // Trunk Sinuosity S = pathLength / euclideanDistance
  let pathLength = 0;
  for (let i = 0; i < trunkPath.length - 1; i++) {
    const a = trunkPath[i];
    const b = trunkPath[i + 1];
    pathLength += Math.hypot(b.x - a.x, b.y - a.y);
  }
  const euclideanDist = Math.hypot(apexX - rootX, apexY - rootY);
  const sinuosity = euclideanDist > 0 ? Math.max(1.0, pathLength / euclideanDist) : 1.0;

  // Lowest stem tip in coordinate space (for cascades)
  let lowestStemY = rootY;
  for (const n of stems) {
    if (n.y > lowestStemY) {
      lowestStemY = n.y;
    }
  }

  // Base caliper (thickness of first stem emerging above root)
  const baseNode = trunkPath.find((n) => n.type === "stem") || (trunkPath.length > 0 ? trunkPath[0] : root);
  const baseThickness = Math.max(1.5, Math.min(25, (baseNode.age || 1) * 0.4 + 3.0));
  const slendernessRatio = height / baseThickness;

  // Crown Foliage Ratio: foliage points in top 25% of height (y <= minY + 0.25 * height)
  const topQuarterY = minY + 0.25 * height;
  let topLeaves = 0;
  let leftFoliageMass = 0;
  let rightFoliageMass = 0;

  for (const l of leaves) {
    if (l.y <= topQuarterY) topLeaves++;
    if (l.x < rootX) leftFoliageMass++;
    else rightFoliageMass++;
  }
  const crownFoliageRatio = leaves.length > 0 ? topLeaves / leaves.length : 0;

  // Bare trunk fraction: height up to the first lateral branch or foliage
  let firstBranchY = minY;
  const trunkNodeIds = new Set(trunkPath.map((n) => n.id));
  for (const n of nodes) {
    if (n.isCut || n.id === root.id) continue;
    if (!trunkNodeIds.has(n.id) && n.parentId !== null && trunkNodeIds.has(n.parentId)) {
      if (n.y > firstBranchY) {
        firstBranchY = n.y;
      }
    }
  }
  const bareTrunkHeight = Math.max(0, rootY - firstBranchY);
  const bareTrunkFraction = Math.min(1.0, bareTrunkHeight / height);

  // Directional Foliage Asymmetry (Windward / Leeward)
  const totalFoliage = leftFoliageMass + rightFoliageMass;
  let windwardRatio = 0.5;
  let windFlowDir: "left" | "right" | "balanced" = "balanced";
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

  // Deadwood Ratio: nodes marked isJin or isBroken vs total woody nodes
  let deadwoodCount = 0;
  for (const n of nodes) {
    if (n.isJin || n.isBroken) deadwoodCount++;
  }
  const totalWood = stems.length + deadwoodCount;
  const deadwoodRatio = totalWood > 0 ? deadwoodCount / totalWood : 0;

  // Topological Continuity of Living Lifeline (Mizusui)
  let hasContinuousLifeline = true;
  for (const l of leaves) {
    let check: PlantNode | undefined = l;
    let pathOk = true;
    while (check) {
      if (check.isCut || check.isBroken || check.isJin) {
        pathOk = false;
        break;
      }
      if (check.parentId === null || check.parentId === 0) break;
      check = nodeMap.get(check.parentId);
    }
    if (!pathOk) {
      hasContinuousLifeline = false;
      break;
    }
  }

  // Outer-Curve Branching Adherence
  let outerCurveAdherence = 0.85;
  if (trunkPath.length >= 3) {
    let evaluatedBranches = 0;
    let validBranches = 0;
    for (let i = 1; i < trunkPath.length - 1; i++) {
      const pPrev = trunkPath[i - 1];
      const pCurr = trunkPath[i];
      const pNext = trunkPath[i + 1];

      const bendX = (pPrev.x + pNext.x) / 2 - pCurr.x;
      const childBranches = stems.filter((s) => s.parentId === pCurr.id && !trunkNodeIds.has(s.id));

      for (const cb of childBranches) {
        evaluatedBranches++;
        const branchDirX = cb.x - pCurr.x;
        if ((bendX < 0 && branchDirX > 0) || (bendX > 0 && branchDirX < 0)) {
          validBranches++;
        }
      }
    }
    if (evaluatedBranches > 0) {
      outerCurveAdherence = validBranches / evaluatedBranches;
    }
  }

  // Fault branches detection (Imi-eda)
  const faults: string[] = [];
  const branchHeights = stems
    .filter((s) => s.parentId !== null && trunkNodeIds.has(s.parentId))
    .map((s) => s.y);
  
  branchHeights.sort((a, b) => a - b);
  for (let i = 0; i < branchHeights.length - 2; i++) {
    if (Math.abs(branchHeights[i + 2] - branchHeights[i]) < 0.04 * height) {
      faults.push("Kuruma-eda (Radäste: 3+ Äste auf gleicher Höhe)");
      break;
    }
  }

  for (let i = 0; i < branchHeights.length - 1; i++) {
    if (Math.abs(branchHeights[i + 1] - branchHeights[i]) < 0.02 * height) {
      faults.push("Kannon-eda (Gegenständige Balkenäste)");
      break;
    }
  }

  if (outerCurveAdherence < 0.40) {
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
    faults,
  };
}

/**
 * Evaluate plant against all 8 classical schools and return scores & report.
 */
export function evaluateBonsaiSchools(state: PlantState): BonsaiSchoolReport {
  const m = extractGeometricMetrics(state);

  const scores: Record<BonsaiStyleId, SchoolScore> = {
    chokkan: scoreChokkan(m),
    moyogi: scoreMoyogi(m),
    shakan: scoreShakan(m),
    kengai: scoreKengai(m),
    "han-kengai": scoreHanKengai(m),
    bunjingi: scoreBunjingi(m),
    fukinagashi: scoreFukinagashi(m),
    "jin-shari": scoreJinShari(m),
  };

  let highestScore = 0;
  let dominantStyleId: BonsaiStyleId | null = null;

  for (const [id, s] of Object.entries(scores) as [BonsaiStyleId, SchoolScore][]) {
    if (s.score > highestScore) {
      highestScore = s.score;
      dominantStyleId = id;
    }
  }

  let tier: "none" | "novice" | "adept" | "master" | "kokufu" = "none";
  if (highestScore >= 92) tier = "kokufu";
  else if (highestScore >= 82) tier = "master";
  else if (highestScore >= 68) tier = "adept";
  else if (highestScore >= 50) tier = "novice";

  const faultPenalty = m.faultCount * 6;
  const overallAestheticScore = Math.max(10, Math.min(100, Math.round(highestScore - faultPenalty)));

  const recommendations: string[] = [];
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
    recommendations,
  };
}

function scoreChokkan(m: GeometricMetrics): SchoolScore {
  let score = 100;
  const strengths: string[] = [];
  const feedback: string[] = [];

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

  if (m.bareTrunkFraction >= 0.70) {
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
    feedback,
  };
}

function scoreMoyogi(m: GeometricMetrics): SchoolScore {
  let score = 100;
  const strengths: string[] = [];
  const feedback: string[] = [];

  if (m.apexOffsetRatio <= 0.08) {
    strengths.push("Krone kehrt meisterhaft über das Nebari zurück.");
  } else if (m.apexOffsetRatio <= 0.15) {
    score -= 12;
    strengths.push("Gute Kronenbalance über der Basis.");
  } else {
    score -= Math.min(45, Math.round((m.apexOffsetRatio - 0.15) * 150));
    feedback.push("Die Krone sollte sich wieder über die Wurzelbasis zurückbeugen.");
  }

  if (m.sinuosity >= 1.10) {
    strengths.push("Lebendige, rhythmische Stammlinie mit harmonischen Kurven.");
  } else if (m.sinuosity >= 1.06) {
    score -= 15;
    feedback.push("Etwas mehr Schwung im Stammverlauf nötig.");
  } else {
    score -= 40;
    feedback.push("Stamm ist zu gerade für Moyogi (Frei Aufrecht).");
  }

  if (m.outerCurveAdherence >= 0.70) {
    strengths.push("Äste entspringen vorbildlich an den Außenradien der Kurven.");
  } else {
    score -= Math.min(25, Math.round((0.70 - m.outerCurveAdherence) * 45));
    feedback.push("Äste sollten an den Außenseiten der Biegungen sitzen, nicht in den Falten.");
  }

  score = Math.max(0, Math.min(100, score));
  return {
    styleId: "moyogi",
    style: BONSAI_STYLES.moyogi,
    score,
    confidence: score / 100,
    strengths,
    feedback,
  };
}

function scoreShakan(m: GeometricMetrics): SchoolScore {
  let score = 100;
  const strengths: string[] = [];
  const feedback: string[] = [];

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
    feedback,
  };
}

function scoreKengai(m: GeometricMetrics): SchoolScore {
  let score = 100;
  const strengths: string[] = [];
  const feedback: string[] = [];

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
    feedback,
  };
}

function scoreHanKengai(m: GeometricMetrics): SchoolScore {
  let score = 100;
  const strengths: string[] = [];
  const feedback: string[] = [];

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
    feedback,
  };
}

function scoreBunjingi(m: GeometricMetrics): SchoolScore {
  let score = 100;
  const strengths: string[] = [];
  const feedback: string[] = [];

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

  if (m.crownFoliageRatio >= 0.70) {
    strengths.push("Laubmasse sparsam und dicht im Kronenbereich konzentriert.");
  }

  score = Math.max(0, Math.min(100, score));
  return {
    styleId: "bunjingi",
    style: BONSAI_STYLES.bunjingi,
    score,
    confidence: score / 100,
    strengths,
    feedback,
  };
}

function scoreFukinagashi(m: GeometricMetrics): SchoolScore {
  let score = 100;
  const strengths: string[] = [];
  const feedback: string[] = [];

  if (m.windwardRatio >= 0.80) {
    strengths.push(`Starke Windflucht: ${(m.windwardRatio * 100).toFixed(0)}% der Masse strömen nach ${m.windFlowDir === "left" ? "Links" : "Rechts"}.`);
  } else if (m.windwardRatio >= 0.70) {
    score -= 20;
    strengths.push("Spürbare Windströmung.");
  } else {
    score -= Math.min(60, Math.round((0.75 - m.windwardRatio) * 150));
    feedback.push("Äste müssen einseitig in Lee-Richtung gestrafft und geformt werden.");
  }

  // Fukinagashi requires noticeable windward lean of trunk or apex
  const absLean = Math.abs(m.leanAngleDeg);
  if (absLean < 12 && m.apexOffsetRatio < 0.18) {
    score -= 45;
    feedback.push("Fukinagashi erfordert eine spürbare Windneigung von Stamm und Krone.");
  } else if (absLean >= 18) {
    strengths.push(`Stamm neigt sich authentisch mit dem Wind (${absLean.toFixed(0)}°).`);
  }

  // Bare tall trunks with apical foliage belong to Bunjingi (Literati), not Fukinagashi
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
    feedback,
  };
}

function scoreJinShari(m: GeometricMetrics): SchoolScore {
  let score = 100;
  const strengths: string[] = [];
  const feedback: string[] = [];

  if (m.deadwoodRatio >= 0.20 && m.deadwoodRatio <= 0.60) {
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
    feedback,
  };
}
