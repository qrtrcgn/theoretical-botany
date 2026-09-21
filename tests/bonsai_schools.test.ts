import { describe, it, expect } from "bun:test";
import {
  extractGeometricMetrics,
  evaluateBonsaiSchools,
  BONSAI_STYLES,
  type BonsaiStyleId,
} from "../src/sim/bonsaiSchools";
import {
  TOKONOMA_REWARD_CATALOG,
  DEFAULT_UNLOCKED_REWARDS,
  checkNewUnlocks,
  loadRewardsFromStorage,
  saveRewardsToStorage,
} from "../src/data/rewards";
import {
  renderTokonomaScroll,
  renderTokonomaAccent,
  renderTokonomaStand,
} from "../src/render/canvas";
import { freshState, growOnce } from "../src/sim/growth";
import { createPrng } from "../src/sim/prng";
import { getSpeciesById, japaneseBonsai } from "../src/data/species";
import type { PlantState, PlantNode } from "../src/sim/types";

function createMockPlant(nodes: Partial<PlantNode>[]): PlantState {
  const rootNode: PlantNode = {
    id: 0,
    parentId: null,
    type: "root",
    x: 0,
    y: 0,
    angle: -Math.PI / 2,
    length: 10,
    targetLength: 10,
    v: 1,
    age: 50,
    terminal: false,
    budState: "dormant",
    depth: 0,
    isCut: false,
    resourceProduction: 1,
    shade: 0,
    curve: 0,
    leafSizeJitter: 1,
    leafShapeJitter: 1,
    leafHueShift: 0,
    hasThorns: false,
    fruitAge: 0,
  };

  const fullNodes: PlantNode[] = nodes.map((n, idx) => ({
    id: n.id ?? idx + 1,
    parentId: n.parentId !== undefined ? n.parentId : (idx === 0 ? 0 : idx),
    type: n.type ?? "stem",
    x: n.x ?? 0,
    y: n.y ?? -((idx + 1) * 20),
    angle: n.angle ?? -Math.PI / 2,
    length: n.length ?? 20,
    targetLength: n.targetLength ?? 20,
    v: n.v ?? 1,
    age: n.age ?? 40,
    terminal: n.terminal ?? false,
    budState: n.budState ?? "active",
    depth: n.depth ?? idx + 1,
    isCut: n.isCut ?? false,
    resourceProduction: n.resourceProduction ?? 1,
    shade: n.shade ?? 0,
    curve: n.curve ?? 0,
    leafSizeJitter: 1,
    leafShapeJitter: 1,
    leafHueShift: 0,
    hasThorns: false,
    fruitAge: 0,
    isJin: n.isJin,
    isBroken: n.isBroken,
  }));

  const sp = japaneseBonsai;
  const base = freshState(
    {
      vigor: [1, 1],
      angle: [30, 30],
      decay: [0.9, 0.9],
      lenScale: [1, 1],
      flowerRGB: [[1, 0, 0], [1, 0, 0]],
      flowerRadius: [5, 5],
      flowerShape: [0, 0],
      flowerStretch: [[1, 1], [1, 1]],
      flowerMaterial: [0, 0],
      budActivationThreshold: [0.5, 0.5],
      shadeTolerance: [0.5, 0.5],
      apicalDominance: [0.8, 0.8],
      internodeElasticity: [1, 1],
      dormancyStrength: [1, 1],
      leafShape: [0, 0],
      leafSize: [1, 1],
      leafDensity: [1, 1],
      inflorescence: [0, 0],
      petalCount: [5, 5],
      sepalCount: [5, 5],
      stamenCount: [5, 5],
      symmetry: [1, 1],
      curl: [0, 0],
      windSensitivity: [0, 0],
      barkRoughness: [0, 0],
      thornDensity: [0, 0],
      vineMode: [0, 0],
      stiffness: [1, 1],
    },
    sp,
    { seed: 1 }
  );

  base.root = rootNode;
  base.nodes = fullNodes;
  return base;
}

describe("Bonsai Classical Schools Recognition Engine", () => {
  it("provides definitions for all 8 canonical NBA styles", () => {
    const expectedStyles: BonsaiStyleId[] = [
      "chokkan",
      "moyogi",
      "shakan",
      "kengai",
      "han-kengai",
      "bunjingi",
      "fukinagashi",
      "jin-shari",
    ];
    for (const s of expectedStyles) {
      expect(BONSAI_STYLES[s]).toBeDefined();
      expect(BONSAI_STYLES[s].nameJa).toBeString();
      expect(BONSAI_STYLES[s].kanji).toBeString();
      expect(BONSAI_STYLES[s].keyRequirements.length).toBeGreaterThan(0);
    }
  });

  it("rejects or caps underdeveloped seedlings and young stock from claiming master ranks", () => {
    // 2-stem raw seedling
    const seedling = createMockPlant([
      { id: 1, parentId: 0, x: 0, y: -30, type: "stem" },
      { id: 2, parentId: 1, x: 0, y: -60, type: "stem", terminal: true },
    ]);
    const seedlingReport = evaluateBonsaiSchools(seedling);
    expect(seedlingReport.metrics.maturityStage).toBe("seedling");
    expect(seedlingReport.dominantScore).toBeLessThanOrEqual(35);
    expect(seedlingReport.tier).toBe("none");

    // 4-stem young stock without secondary branch hierarchy
    const youngStock = createMockPlant([
      { id: 1, parentId: 0, x: 0, y: -25, type: "stem" },
      { id: 2, parentId: 1, x: 0, y: -50, type: "stem" },
      { id: 3, parentId: 2, x: 0, y: -75, type: "stem" },
      { id: 4, parentId: 3, x: 0, y: -100, type: "stem", terminal: true },
    ]);
    const youngReport = evaluateBonsaiSchools(youngStock);
    expect(youngReport.metrics.maturityStage).toBe("young_stock");
    expect(youngReport.dominantScore).toBeLessThanOrEqual(58);
    expect(youngReport.tier).not.toBe("master");
    expect(youngReport.tier).not.toBe("kokufu");
  });

  it("classifies straight vertical specimens as Chokkan (Formal Upright)", () => {
    // Mature Chokkan: straight trunk with 4 lateral branches in 3 distinct tiers (Sanbo-zashi)
    const plant = createMockPlant([
      { id: 1, parentId: 0, x: 0, y: -18, type: "stem", depth: 0, age: 60 },
      { id: 2, parentId: 1, x: 0, y: -38, type: "stem", depth: 1, age: 50 },
      { id: 3, parentId: 2, x: 0, y: -58, type: "stem", depth: 2, age: 40 },
      { id: 4, parentId: 3, x: 0, y: -78, type: "stem", depth: 3, age: 30 },
      { id: 5, parentId: 4, x: 0, y: -98, type: "stem", depth: 4, terminal: true, age: 20 },
      // Lateral branches in tiers (left, right, back)
      { id: 6, parentId: 1, x: -20, y: -22, type: "stem", depth: 1, age: 35 },
      { id: 7, parentId: 2, x: 20, y: -42, type: "stem", depth: 2, age: 30 },
      { id: 8, parentId: 3, x: -16, y: -62, type: "stem", depth: 3, age: 25 },
      { id: 9, parentId: 4, x: 14, y: -82, type: "stem", depth: 4, age: 20 },
      // Foliage
      { id: 10, parentId: 6, x: -28, y: -24, type: "leaf", growthProgress: 0.9 },
      { id: 11, parentId: 7, x: 28, y: -44, type: "leaf", growthProgress: 0.9 },
      { id: 12, parentId: 8, x: -22, y: -64, type: "leaf", growthProgress: 0.9 },
      { id: 13, parentId: 9, x: 20, y: -84, type: "leaf", growthProgress: 0.9 },
      { id: 14, parentId: 5, x: 0, y: -102, type: "leaf", growthProgress: 0.9 },
    ]);

    const report = evaluateBonsaiSchools(plant);
    expect(report.dominantStyle?.id).toBe("chokkan");
    expect(report.scores.chokkan.score).toBeGreaterThanOrEqual(80);
    expect(report.metrics.apexOffsetRatio).toBeLessThanOrEqual(0.05);
    expect(report.metrics.sinuosity).toBeLessThanOrEqual(1.03);
    expect(report.metrics.branchTiers).toBeGreaterThanOrEqual(3);
  });

  it("classifies sinuous S-curved trunks with centered apex as Moyogi (Informal Upright)", () => {
    // Sinuous trunk that meanders rhythmically but returns over base with outer curve branches
    const plant = createMockPlant([
      { id: 1, parentId: 0, x: 14, y: -25, type: "stem" },
      { id: 2, parentId: 1, x: -12, y: -55, type: "stem" },
      { id: 3, parentId: 2, x: 10, y: -85, type: "stem" },
      { id: 4, parentId: 3, x: -5, y: -115, type: "stem" },
      { id: 5, parentId: 4, x: 1, y: -140, type: "stem", terminal: true },
      // Outer curve branches (Kyokusho)
      { id: 6, parentId: 1, x: 35, y: -28, type: "stem" },
      { id: 7, parentId: 2, x: -32, y: -58, type: "stem" },
      { id: 8, parentId: 3, x: 28, y: -88, type: "stem" },
      { id: 9, parentId: 4, x: -22, y: -118, type: "stem" },
      // Foliage
      { id: 10, parentId: 6, x: 45, y: -30, type: "leaf" },
      { id: 11, parentId: 7, x: -42, y: -60, type: "leaf" },
      { id: 12, parentId: 8, x: 38, y: -90, type: "leaf" },
      { id: 13, parentId: 5, x: 2, y: -145, type: "leaf" },
    ]);

    const report = evaluateBonsaiSchools(plant);
    expect(report.scores.moyogi.score).toBeGreaterThanOrEqual(75);
    expect(report.metrics.sinuosity).toBeGreaterThan(1.08);
    expect(report.metrics.apexOffsetRatio).toBeLessThan(0.12);
  });

  it("classifies slanted trunks with counterbalance as Shakan (Slanting)", () => {
    // Leaning strongly to the right (~30 deg) with counter branch
    const plant = createMockPlant([
      { id: 1, parentId: 0, x: 15, y: -25, type: "stem" },
      { id: 2, parentId: 1, x: 35, y: -50, type: "stem" },
      { id: 3, parentId: 2, x: 55, y: -75, type: "stem" },
      { id: 4, parentId: 3, x: 75, y: -100, type: "stem" },
      { id: 5, parentId: 4, x: 95, y: -125, type: "stem", terminal: true },
      // Counterbalancing branches pointing left
      { id: 6, parentId: 1, x: -28, y: -30, type: "stem" },
      { id: 7, parentId: 2, x: -18, y: -55, type: "stem" },
      { id: 8, parentId: 3, x: 80, y: -80, type: "stem" },
      { id: 9, parentId: 6, x: -42, y: -35, type: "leaf" },
      { id: 10, parentId: 5, x: 105, y: -130, type: "leaf" },
    ]);

    const report = evaluateBonsaiSchools(plant);
    expect(report.dominantStyle?.id).toBe("shakan");
    expect(report.scores.shakan.score).toBeGreaterThanOrEqual(70);
    expect(Math.abs(report.metrics.leanAngleDeg)).toBeGreaterThanOrEqual(20);
  });

  it("classifies cascades plunging below pot base as Kengai (Full Cascade)", () => {
    // Arching over rim and plunging down past pot base (> 45px below rim) with living crown above rim
    const plant = createMockPlant([
      { id: 1, parentId: 0, x: 10, y: -15, type: "stem" }, // initial rise
      { id: 2, parentId: 1, x: 35, y: 5, type: "stem" },   // over rim
      { id: 3, parentId: 2, x: 45, y: 28, type: "stem" },  // downward cascade
      { id: 4, parentId: 3, x: 55, y: 55, type: "stem" },
      { id: 5, parentId: 4, x: 65, y: 75, type: "stem", terminal: true }, // deep plunge below 38px base (y=75)!
      // Retained living crown above rim
      { id: 6, parentId: 1, x: -10, y: -30, type: "stem" },
      { id: 7, parentId: 6, x: -5, y: -45, type: "stem" },
      { id: 8, parentId: 4, x: 75, y: 58, type: "stem" },
      { id: 9, parentId: 7, x: 0, y: -50, type: "leaf" },
      { id: 10, parentId: 5, x: 70, y: 80, type: "leaf" },
    ]);

    const report = evaluateBonsaiSchools(plant);
    expect(report.dominantStyle?.id).toBe("kengai");
    expect(report.scores.kengai.score).toBeGreaterThanOrEqual(80);
    expect(report.metrics.lowestStemY).toBeGreaterThan(38);
    expect(report.metrics.apexY).toBeLessThan(report.metrics.rootY);
  });

  it("classifies cascades between rim and base as Han-Kengai (Semi-Cascade)", () => {
    // Cascades below rim (y > 4) but stays above pot base (y <= 38) with wide horizontal spread
    const plant = createMockPlant([
      { id: 1, parentId: 0, x: 15, y: -15, type: "stem" },
      { id: 2, parentId: 1, x: 45, y: 6, type: "stem" },   // drops below rim
      { id: 3, parentId: 2, x: 75, y: 18, type: "stem" },
      { id: 4, parentId: 3, x: 105, y: 24, type: "stem", terminal: true }, // stays at y=24 <= 38px base
      // Living branches
      { id: 5, parentId: 1, x: -12, y: -28, type: "stem" },
      { id: 6, parentId: 2, x: 55, y: 3, type: "stem" },
      { id: 7, parentId: 3, x: 88, y: 14, type: "stem" },
      { id: 8, parentId: 4, x: 115, y: 22, type: "leaf" },
      { id: 9, parentId: 5, x: -18, y: -32, type: "leaf" },
    ]);

    const report = evaluateBonsaiSchools(plant);
    expect(report.dominantStyle?.id).toBe("han-kengai");
    expect(report.scores["han-kengai"].score).toBeGreaterThanOrEqual(74);
    expect(report.metrics.lowestStemY).toBeGreaterThan(0);
    expect(report.metrics.lowestStemY).toBeLessThanOrEqual(38);
  });

  it("classifies tall slender specimens with high foliage as Bunjingi (Literati)", () => {
    // Slender trunk (>= 15:1), bare trunk >= 65%, sparse crown foliage
    const plant = createMockPlant([
      { id: 1, parentId: 0, x: 4, y: -40, type: "stem", age: 5 },
      { id: 2, parentId: 1, x: 8, y: -80, type: "stem", age: 5 },
      { id: 3, parentId: 2, x: 14, y: -120, type: "stem", age: 5 },
      { id: 4, parentId: 3, x: 10, y: -160, type: "stem", age: 5 },
      { id: 5, parentId: 4, x: 16, y: -200, type: "stem", age: 5 },
      { id: 6, parentId: 5, x: 12, y: -235, type: "stem", terminal: true, age: 5 },
      { id: 7, parentId: 5, x: 26, y: -215, type: "stem", age: 5 },
      // Foliage strictly at apex
      { id: 8, parentId: 6, x: 10, y: -240, type: "leaf" },
      { id: 9, parentId: 7, x: 32, y: -220, type: "leaf" },
    ]);

    const report = evaluateBonsaiSchools(plant);
    expect(report.dominantStyle?.id).toBe("bunjingi");
    expect(report.scores.bunjingi.score).toBeGreaterThanOrEqual(76);
    expect(report.metrics.slendernessRatio).toBeGreaterThanOrEqual(15);
    expect(report.metrics.bareTrunkFraction).toBeGreaterThanOrEqual(0.65);
  });

  it("classifies unidirectional foliage streaming as Fukinagashi (Windswept)", () => {
    // All branches and leaves swept towards the right
    const plant = createMockPlant([
      { id: 1, parentId: 0, x: 15, y: -25, type: "stem" },
      { id: 2, parentId: 1, x: 40, y: -50, type: "stem" },
      { id: 3, parentId: 2, x: 75, y: -75, type: "stem" },
      { id: 4, parentId: 3, x: 110, y: -95, type: "stem", terminal: true },
      // Unidirectional rightward branches & leaves
      { id: 5, parentId: 1, x: 48, y: -26, type: "stem" },
      { id: 6, parentId: 2, x: 78, y: -52, type: "stem" },
      { id: 7, parentId: 3, x: 108, y: -77, type: "stem" },
      { id: 8, parentId: 4, x: 135, y: -96, type: "leaf" },
      { id: 9, parentId: 5, x: 68, y: -28, type: "leaf" },
      { id: 10, parentId: 6, x: 98, y: -54, type: "leaf" },
    ]);

    const report = evaluateBonsaiSchools(plant);
    expect(report.scores.fukinagashi.score).toBeGreaterThanOrEqual(78);
    expect(report.metrics.windwardRatio).toBeGreaterThanOrEqual(0.78);
    expect(report.metrics.windFlowDir).toBe("right");
  });

  it("evaluates deadwood ratio and intact cambium lifeline for Jin & Shari", () => {
    // Tree with bleached deadwood stubs but continuous living lifeline
    const plant = createMockPlant([
      { id: 1, parentId: 0, x: 0, y: -25, type: "stem" },
      { id: 2, parentId: 1, x: 0, y: -50, type: "stem" },
      { id: 3, parentId: 2, x: 0, y: -75, type: "stem" },
      { id: 4, parentId: 3, x: 0, y: -100, type: "stem", terminal: true },
      // Living foliage
      { id: 5, parentId: 4, x: 10, y: -105, type: "leaf" },
      { id: 6, parentId: 4, x: -10, y: -105, type: "leaf" },
      { id: 7, parentId: 4, x: 0, y: -110, type: "leaf" },
      // Deadwood Jin branches (3 nodes)
      { id: 8, parentId: 1, x: -25, y: -25, type: "stem", isJin: true },
      { id: 9, parentId: 2, x: 25, y: -50, type: "stem", isJin: true },
      { id: 10, parentId: 3, x: -20, y: -75, type: "stem", isJin: true },
    ]);

    const report = evaluateBonsaiSchools(plant);
    expect(report.scores["jin-shari"].score).toBeGreaterThanOrEqual(72);
    expect(report.metrics.deadwoodRatio).toBeGreaterThanOrEqual(0.18);
    expect(report.metrics.hasContinuousLifeline).toBe(true);
  });

  it("detects fault branches (Kuruma-eda wheel branches) and applies penalty", () => {
    // 3 branches emerging at virtually identical height (Kuruma-eda)
    const plant = createMockPlant([
      { id: 1, parentId: 0, x: 0, y: -30, type: "stem" },
      { id: 2, parentId: 1, x: 0, y: -60, type: "stem" },
      { id: 3, parentId: 2, x: 0, y: -90, type: "stem", terminal: true },
      // 3 wheel branches on node 2 at the same y:
      { id: 4, parentId: 2, x: -25, y: -60, type: "stem" },
      { id: 5, parentId: 2, x: 25, y: -60, type: "stem" },
      { id: 6, parentId: 2, x: 10, y: -61, type: "stem" },
    ]);

    const report = evaluateBonsaiSchools(plant);
    expect(report.detectedFaults.length).toBeGreaterThan(0);
    expect(report.detectedFaults.some((f) => f.includes("Kuruma-eda") || f.includes("Kannon-eda"))).toBe(true);
    expect(report.overallAestheticScore).toBeLessThan(report.dominantScore);
  });
});

describe("Tokonoma Rewards & Gallery Progression", () => {
  it("contains all 10 canonical Japanese accoutrements across categories", () => {
    expect(TOKONOMA_REWARD_CATALOG.length).toBeGreaterThanOrEqual(10);
    const categories = new Set(TOKONOMA_REWARD_CATALOG.map((i) => i.category));
    expect(categories.has("kakejiku")).toBe(true);
    expect(categories.has("tenpai")).toBe(true);
    expect(categories.has("koro")).toBe(true);
    expect(categories.has("suiseki")).toBe(true);
    expect(categories.has("shitakusa")).toBe(true);
    expect(categories.has("ishidoro")).toBe(true);
  });

  it("unlocks Solitary Fisherman tenpai upon achieving Han-Kengai", () => {
    const plant = createMockPlant([
      { id: 1, parentId: 0, x: 15, y: -15, type: "stem" },
      { id: 2, parentId: 1, x: 45, y: 6, type: "stem" },
      { id: 3, parentId: 2, x: 75, y: 18, type: "stem" },
      { id: 4, parentId: 3, x: 105, y: 24, type: "stem", terminal: true },
      { id: 5, parentId: 1, x: -12, y: -28, type: "stem" },
      { id: 6, parentId: 2, x: 55, y: 3, type: "stem" },
      { id: 7, parentId: 3, x: 88, y: 14, type: "stem" },
      { id: 8, parentId: 4, x: 115, y: 22, type: "leaf" },
    ]);
    plant.unlockedRewards = ["kakejiku_mountain_sansui", "shitakusa_kokedama_mossball"];

    const report = evaluateBonsaiSchools(plant);
    const unlocked = checkNewUnlocks(plant, report);
    const fisherman = unlocked.find((u) => u.id === "tenpai_bronze_fisherman");
    expect(fisherman).toBeDefined();
    expect(plant.unlockedRewards).toContain("tenpai_bronze_fisherman");
  });

  it("unlocks Furuya Waterfall Stone upon achieving full Kengai cascade", () => {
    const plant = createMockPlant([
      { id: 1, parentId: 0, x: 10, y: -15, type: "stem" },
      { id: 2, parentId: 1, x: 35, y: 5, type: "stem" },
      { id: 3, parentId: 2, x: 45, y: 28, type: "stem" },
      { id: 4, parentId: 3, x: 55, y: 55, type: "stem" },
      { id: 5, parentId: 4, x: 65, y: 75, type: "stem", terminal: true },
      { id: 6, parentId: 1, x: -10, y: -30, type: "stem" },
      { id: 7, parentId: 6, x: -5, y: -45, type: "stem" },
      { id: 8, parentId: 4, x: 75, y: 58, type: "stem" },
      { id: 9, parentId: 7, x: 0, y: -50, type: "leaf" },
      { id: 10, parentId: 5, x: 70, y: 80, type: "leaf" },
    ]);
    plant.unlockedRewards = ["kakejiku_mountain_sansui", "shitakusa_kokedama_mossball"];

    const report = evaluateBonsaiSchools(plant);
    const unlocked = checkNewUnlocks(plant, report);
    const waterfallStone = unlocked.find((u) => u.id === "suiseki_furuya_waterfall");
    expect(waterfallStone).toBeDefined();
    expect(plant.unlockedRewards).toContain("suiseki_furuya_waterfall");
  });

  it("unlocks Enso scroll upon carving Jin deadwood with mature tree and lifeline", () => {
    const plant = createMockPlant([
      { id: 1, parentId: 0, x: 0, y: -25, type: "stem" },
      { id: 2, parentId: 1, x: 0, y: -50, type: "stem" },
      { id: 3, parentId: 2, x: 0, y: -75, type: "stem" },
      { id: 4, parentId: 3, x: 0, y: -100, type: "stem", terminal: true },
      { id: 5, parentId: 4, x: 10, y: -105, type: "leaf" },
      { id: 6, parentId: 4, x: -10, y: -105, type: "leaf" },
      { id: 7, parentId: 4, x: 0, y: -110, type: "leaf" },
      // 3 Jin branches
      { id: 8, parentId: 1, x: -25, y: -25, type: "stem", isJin: true },
      { id: 9, parentId: 2, x: 25, y: -50, type: "stem", isJin: true },
      { id: 10, parentId: 3, x: -20, y: -75, type: "stem", isJin: true },
    ]);
    plant.unlockedRewards = ["kakejiku_mountain_sansui", "shitakusa_kokedama_mossball"];

    const report = evaluateBonsaiSchools(plant);
    const unlocked = checkNewUnlocks(plant, report);
    const enso = unlocked.find((u) => u.id === "kakejiku_zen_enso");
    expect(enso).toBeDefined();
    expect(plant.unlockedRewards).toContain("kakejiku_zen_enso");
  });

  it("unlocks Alpine Fern & Violet upon growing flowers in spring", () => {
    const plant = createMockPlant([
      { id: 1, parentId: 0, x: 0, y: -30, type: "stem" },
      { id: 2, parentId: 1, x: 10, y: -45, type: "flower", growthProgress: 0.85 },
      { id: 3, parentId: 1, x: -10, y: -45, type: "flower", growthProgress: 0.85 },
      { id: 4, parentId: 1, x: 0, y: -55, type: "flower", growthProgress: 0.85 },
    ]);
    plant.step = 40; // Spring season (< 65) and step >= 35
    plant.unlockedRewards = ["kakejiku_mountain_sansui", "shitakusa_kokedama_mossball"];

    const unlocked = checkNewUnlocks(plant);
    const violet = unlocked.find((u) => u.id === "shitakusa_wild_violet_fern");
    expect(violet).toBeDefined();
    expect(plant.unlockedRewards).toContain("shitakusa_wild_violet_fern");
  });

  it("unlocks Yukimi Lantern during winter cold period", () => {
    const plant = createMockPlant([
      { id: 1, parentId: 0, x: 0, y: -20, type: "stem" },
      { id: 2, parentId: 1, x: 0, y: -40, type: "stem" },
      { id: 3, parentId: 2, x: 0, y: -60, type: "stem" },
      { id: 4, parentId: 3, x: 0, y: -80, type: "stem" },
      { id: 5, parentId: 4, x: 0, y: -100, type: "stem" },
      { id: 6, parentId: 5, x: 0, y: -120, type: "stem" },
    ]);
    plant.step = 200; // Winter season (180..245) and step >= 180
    plant.soilMoisture = 0.5;
    plant.unlockedRewards = ["kakejiku_mountain_sansui", "shitakusa_kokedama_mossball"];

    const unlocked = checkNewUnlocks(plant);
    const lantern = unlocked.find((u) => u.id === "ishidoro_yukimi_lantern");
    expect(lantern).toBeDefined();
    expect(plant.unlockedRewards).toContain("ishidoro_yukimi_lantern");
  });
});

describe("Tokonoma Canvas Procedural Visual FX", () => {
  // Mock Canvas 2D Context
  function createMockCtx(): any {
    return {
      save: () => {},
      restore: () => {},
      translate: () => {},
      rotate: () => {},
      beginPath: () => {},
      closePath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      fill: () => {},
      fillRect: () => {},
      strokeRect: () => {},
      arc: () => {},
      ellipse: () => {},
      roundRect: () => {},
      quadraticCurveTo: () => {},
      createLinearGradient: () => ({ addColorStop: () => {} }),
      createRadialGradient: () => ({ addColorStop: () => {} }),
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 1,
      lineCap: "butt",
    };
  }

  it("renders all Kakejiku hanging scrolls without throwing", () => {
    const ctx = createMockCtx();
    const scrolls = ["kakejiku_mountain_sansui", "kakejiku_zen_enso", "kakejiku_harvest_moon"];
    for (const s of scrolls) {
      expect(() => renderTokonomaScroll(ctx, s, 50, 20, 120, 200, false)).not.toThrow();
      expect(() => renderTokonomaScroll(ctx, s, 50, 20, 120, 200, true)).not.toThrow();
    }
  });

  it("renders all Tokonoma companion accents without throwing", () => {
    const ctx = createMockCtx();
    const accents = [
      "shitakusa_kokedama_mossball",
      "shitakusa_wild_violet_fern",
      "tenpai_bronze_fisherman",
      "tenpai_bronze_crane",
      "koro_celadon_tripod",
      "suiseki_kamogawa_toyama",
      "suiseki_furuya_waterfall",
      "ishidoro_yukimi_lantern",
    ];

    const particles: any[] = [];
    for (const a of accents) {
      expect(() => renderTokonomaAccent(ctx, a, 140, 36, false, 1.0, particles)).not.toThrow();
      expect(() => renderTokonomaAccent(ctx, a, 140, 36, true, 2.0, particles)).not.toThrow();
    }
  });

  it("renders Tokonoma lacquered rosewood Shoku display table without throwing", () => {
    const ctx = createMockCtx();
    expect(() => renderTokonomaStand(ctx, false)).not.toThrow();
    expect(() => renderTokonomaStand(ctx, true)).not.toThrow();
  });
});
