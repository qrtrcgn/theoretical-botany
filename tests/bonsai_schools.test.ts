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

  it("classifies straight vertical specimens as Chokkan (Formal Upright)", () => {
    // Perfectly straight upward trunk
    const plant = createMockPlant([
      { id: 1, parentId: 0, x: 0, y: -30, type: "stem" },
      { id: 2, parentId: 1, x: 0, y: -60, type: "stem" },
      { id: 3, parentId: 2, x: 0, y: -90, type: "stem" },
      { id: 4, parentId: 3, x: 0, y: -120, type: "stem", terminal: true },
      // Bilateral leaves
      { id: 5, parentId: 2, x: -20, y: -65, type: "leaf" },
      { id: 6, parentId: 2, x: 20, y: -65, type: "leaf" },
      { id: 7, parentId: 3, x: -15, y: -95, type: "leaf" },
      { id: 8, parentId: 3, x: 15, y: -95, type: "leaf" },
    ]);

    const report = evaluateBonsaiSchools(plant);
    expect(report.dominantStyle?.id).toBe("chokkan");
    expect(report.scores.chokkan.score).toBeGreaterThanOrEqual(80);
    expect(report.metrics.apexOffsetRatio).toBeLessThanOrEqual(0.05);
    expect(report.metrics.sinuosity).toBeLessThanOrEqual(1.03);
  });

  it("classifies sinuous S-curved trunks with centered apex as Moyogi (Informal Upright)", () => {
    // Sinuous trunk that meanders left and right but returns to center
    const plant = createMockPlant([
      { id: 1, parentId: 0, x: 14, y: -25, type: "stem" },
      { id: 2, parentId: 1, x: -12, y: -55, type: "stem" },
      { id: 3, parentId: 2, x: 10, y: -85, type: "stem" },
      { id: 4, parentId: 3, x: 2, y: -115, type: "stem", terminal: true },
      // Lateral branches on outer convex curves
      { id: 5, parentId: 1, x: 30, y: -28, type: "stem" },
      { id: 6, parentId: 2, x: -28, y: -58, type: "stem" },
      { id: 7, parentId: 4, x: -8, y: -120, type: "leaf" },
      { id: 8, parentId: 4, x: 10, y: -120, type: "leaf" },
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
      { id: 4, parentId: 3, x: 75, y: -100, type: "stem", terminal: true },
      // Counterbalancing branch pointing left
      { id: 5, parentId: 1, x: -25, y: -30, type: "stem" },
      { id: 6, parentId: 5, x: -40, y: -35, type: "leaf" },
      { id: 7, parentId: 4, x: 80, y: -105, type: "leaf" },
    ]);

    const report = evaluateBonsaiSchools(plant);
    expect(report.dominantStyle?.id).toBe("shakan");
    expect(report.scores.shakan.score).toBeGreaterThanOrEqual(70);
    expect(Math.abs(report.metrics.leanAngleDeg)).toBeGreaterThanOrEqual(20);
  });

  it("classifies cascades plunging below pot base as Kengai (Full Cascade)", () => {
    // Arching over rim and plunging down past pot base (y > 38px)
    const plant = createMockPlant([
      { id: 1, parentId: 0, x: 10, y: -15, type: "stem" }, // initial rise
      { id: 2, parentId: 1, x: 35, y: 5, type: "stem" },   // over rim
      { id: 3, parentId: 2, x: 45, y: 30, type: "stem" },  // downward cascade
      { id: 4, parentId: 3, x: 55, y: 65, type: "stem", terminal: true }, // deep plunge below 38px base!
      { id: 5, parentId: 4, x: 58, y: 70, type: "leaf" },
    ]);

    const report = evaluateBonsaiSchools(plant);
    expect(report.dominantStyle?.id).toBe("kengai");
    expect(report.scores.kengai.score).toBeGreaterThanOrEqual(80);
    expect(report.metrics.lowestStemY).toBeGreaterThan(38);
  });

  it("classifies cascades between rim and base as Han-Kengai (Semi-Cascade)", () => {
    // Cascades below rim (y > 0) but stays above or near pot base (y <= 38)
    const plant = createMockPlant([
      { id: 1, parentId: 0, x: 15, y: -12, type: "stem" },
      { id: 2, parentId: 1, x: 45, y: 8, type: "stem" },   // drops below rim
      { id: 3, parentId: 2, x: 85, y: 22, type: "stem", terminal: true }, // stays at y=22 <= 38px base
      { id: 4, parentId: 3, x: 92, y: 20, type: "leaf" },
    ]);

    const report = evaluateBonsaiSchools(plant);
    expect(report.dominantStyle?.id).toBe("han-kengai");
    expect(report.scores["han-kengai"].score).toBeGreaterThanOrEqual(75);
    expect(report.metrics.lowestStemY).toBeGreaterThan(0);
    expect(report.metrics.lowestStemY).toBeLessThanOrEqual(38);
  });

  it("classifies tall slender specimens with high foliage as Bunjingi (Literati)", () => {
    // Long bare trunk (low caliper) with foliage strictly in top 20%
    const plant = createMockPlant([
      { id: 1, parentId: 0, x: 4, y: -40, type: "stem", age: 5 },
      { id: 2, parentId: 1, x: 10, y: -80, type: "stem", age: 5 },
      { id: 3, parentId: 2, x: 18, y: -120, type: "stem", age: 5 },
      { id: 4, parentId: 3, x: 12, y: -160, type: "stem", age: 5 },
      { id: 5, parentId: 4, x: 15, y: -200, type: "stem", terminal: true, age: 5 },
      // Foliage strictly at apex
      { id: 6, parentId: 5, x: 8, y: -205, type: "leaf" },
      { id: 7, parentId: 5, x: 22, y: -205, type: "leaf" },
    ]);

    const report = evaluateBonsaiSchools(plant);
    expect(report.dominantStyle?.id).toBe("bunjingi");
    expect(report.scores.bunjingi.score).toBeGreaterThanOrEqual(80);
    expect(report.metrics.slendernessRatio).toBeGreaterThanOrEqual(16);
    expect(report.metrics.bareTrunkFraction).toBeGreaterThanOrEqual(0.65);
  });

  it("classifies unidirectional foliage streaming as Fukinagashi (Windswept)", () => {
    // All branches and leaves swept towards the right
    const plant = createMockPlant([
      { id: 1, parentId: 0, x: 15, y: -30, type: "stem" },
      { id: 2, parentId: 1, x: 40, y: -60, type: "stem" },
      { id: 3, parentId: 2, x: 75, y: -85, type: "stem", terminal: true },
      // Unidirectional rightward branches & leaves
      { id: 4, parentId: 1, x: 50, y: -32, type: "stem" },
      { id: 5, parentId: 2, x: 80, y: -62, type: "stem" },
      { id: 6, parentId: 3, x: 110, y: -86, type: "leaf" },
      { id: 7, parentId: 4, x: 70, y: -34, type: "leaf" },
      { id: 8, parentId: 5, x: 100, y: -64, type: "leaf" },
    ]);

    const report = evaluateBonsaiSchools(plant);
    expect(report.scores.fukinagashi.score).toBeGreaterThanOrEqual(75);
    expect(report.metrics.windwardRatio).toBeGreaterThanOrEqual(0.80);
    expect(report.metrics.windFlowDir).toBe("right");
  });

  it("evaluates deadwood ratio and intact cambium lifeline for Jin & Shari", () => {
    // Tree with bleached deadwood stubs but continuous living lifeline
    const plant = createMockPlant([
      { id: 1, parentId: 0, x: 0, y: -30, type: "stem" },
      { id: 2, parentId: 1, x: 0, y: -60, type: "stem" },
      { id: 3, parentId: 2, x: 0, y: -90, type: "stem", terminal: true },
      // Living foliage
      { id: 4, parentId: 3, x: 10, y: -95, type: "leaf" },
      // Deadwood Jin branches
      { id: 5, parentId: 1, x: -25, y: -30, type: "stem", isJin: true },
      { id: 6, parentId: 2, x: 25, y: -60, type: "stem", isJin: true },
    ]);

    const report = evaluateBonsaiSchools(plant);
    expect(report.scores["jin-shari"].score).toBeGreaterThanOrEqual(70);
    expect(report.metrics.deadwoodRatio).toBeGreaterThanOrEqual(0.20);
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
      { id: 1, parentId: 0, x: 15, y: -10, type: "stem" },
      { id: 2, parentId: 1, x: 50, y: 12, type: "stem" },
      { id: 3, parentId: 2, x: 90, y: 25, type: "stem", terminal: true },
      { id: 4, parentId: 3, x: 95, y: 22, type: "leaf" },
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
      { id: 3, parentId: 2, x: 45, y: 30, type: "stem" },
      { id: 4, parentId: 3, x: 55, y: 65, type: "stem", terminal: true },
    ]);
    plant.unlockedRewards = ["kakejiku_mountain_sansui", "shitakusa_kokedama_mossball"];

    const report = evaluateBonsaiSchools(plant);
    const unlocked = checkNewUnlocks(plant, report);
    const waterfallStone = unlocked.find((u) => u.id === "suiseki_furuya_waterfall");
    expect(waterfallStone).toBeDefined();
    expect(plant.unlockedRewards).toContain("suiseki_furuya_waterfall");
  });

  it("unlocks Enso scroll upon carving Jin deadwood", () => {
    const plant = createMockPlant([
      { id: 1, parentId: 0, x: 0, y: -30, type: "stem" },
      { id: 2, parentId: 1, x: -20, y: -40, type: "stem", isJin: true },
      { id: 3, parentId: 1, x: 20, y: -40, type: "stem", isJin: true },
    ]);
    plant.unlockedRewards = ["kakejiku_mountain_sansui", "shitakusa_kokedama_mossball"];

    const unlocked = checkNewUnlocks(plant);
    const enso = unlocked.find((u) => u.id === "kakejiku_zen_enso");
    expect(enso).toBeDefined();
    expect(plant.unlockedRewards).toContain("kakejiku_zen_enso");
  });

  it("unlocks Alpine Fern & Violet upon growing flowers in spring", () => {
    const plant = createMockPlant([
      { id: 1, parentId: 0, x: 0, y: -30, type: "stem" },
      { id: 2, parentId: 1, x: 10, y: -45, type: "flower" },
    ]);
    plant.unlockedRewards = ["kakejiku_mountain_sansui", "shitakusa_kokedama_mossball"];

    const unlocked = checkNewUnlocks(plant);
    const violet = unlocked.find((u) => u.id === "shitakusa_wild_violet_fern");
    expect(violet).toBeDefined();
    expect(plant.unlockedRewards).toContain("shitakusa_wild_violet_fern");
  });

  it("unlocks Yukimi Lantern during winter cold period", () => {
    const plant = createMockPlant([
      { id: 1, parentId: 0, x: 0, y: -30, type: "stem" },
    ]);
    plant.step = 200; // Winter season in 250-cycle
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
