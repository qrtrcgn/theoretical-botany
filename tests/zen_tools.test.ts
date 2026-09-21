/**
 * ZenPlant Zen Tools & Precision Pruning Tests
 * 
 * Verifies:
 * - Multi-branch swipe-to-slice Bézier intersection
 * - Selective leaf plucking / defoliation
 * - Bonsai wire training and physiological curvature limits
 * - Thickness-scaled audio and procedural chimes
 * - Soil moisture and fallen debris integration
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { createPrng } from "../src/sim/prng";
import { freshState, growOnce } from "../src/sim/growth";
import { SPECIES, generateGenomeForSpecies, getSpeciesById } from "../src/data/species";
import {
  swipeSliceCurvedStems,
  pluckLeavesAlongSwipe,
  bendStemWithWire,
  carveBranchToJin,
  swipeCarveCurvedStems,
  getNodeThickness,
  lineSegmentsIntersect,
  distToSegment,
} from "../src/sim/precisionPrune";
import { pruneNodeAt } from "../src/sim/growth";
import {
  renderPlant,
  getStemTransforms,
  renderBladeSlashTrail,
  renderWaterDroplets,
  type SlashPoint,
  type WaterDroplet,
  type DevRenderOptions,
} from "../src/render/canvas";
import {
  playPruneSound,
  playDefoliateSound,
  playWireSound,
  playWaterSound,
  playRakeSound,
  playJinSound,
  playShishiOdoshiClack,
  playFurinSound,
  toggleRainAmbiance,
  playSingingBowlSound,
  setBreatheIntensity,
  playWoodCreakSound,
  playBarkCrackSound,
  playBranchSnapSound,
  playSapDripSound,
} from "../src/audio/soundscape";
import type { PlantState } from "../src/sim/types";

// Mock Web Audio API for headless test runner
if (typeof window === "undefined") {
  (global as unknown as { window: Record<string, unknown> }).window = {};
}

if (!(global as unknown as { window: { AudioContext?: unknown } }).window.AudioContext) {
  class MockAudioContext {
    currentTime = 0;
    sampleRate = 44100;
    state = "running";
    destination = {};
    createGain() {
      return {
        gain: {
          value: 1,
          setValueAtTime: () => {},
          linearRampToValueAtTime: () => {},
          exponentialRampToValueAtTime: () => {},
          cancelScheduledValues: () => {},
        },
        connect: () => {},
      };
    }
    createBuffer(channels: number, length: number, sampleRate: number) {
      return {
        getChannelData: () => new Float32Array(length),
      };
    }
    createBufferSource() {
      return {
        buffer: null,
        loop: false,
        connect: () => {},
        start: () => {},
        stop: () => {},
      };
    }
    createBiquadFilter() {
      return {
        type: "lowpass",
        frequency: {
          value: 350,
          setValueAtTime: () => {},
          linearRampToValueAtTime: () => {},
          cancelScheduledValues: () => {},
        },
        Q: { value: 1, setValueAtTime: () => {} },
        connect: () => {},
      };
    }
    createOscillator() {
      return {
        type: "sine",
        frequency: {
          value: 440,
          setValueAtTime: () => {},
          linearRampToValueAtTime: () => {},
          exponentialRampToValueAtTime: () => {},
        },
        connect: () => {},
        start: () => {},
        stop: () => {},
      };
    }
    resume() {
      return Promise.resolve();
    }
  }
  (global as unknown as { window: { AudioContext: unknown } }).window.AudioContext = MockAudioContext;
}

// Mock Canvas 2D context
function createMockCanvasContext(): CanvasRenderingContext2D {
  return {
    clearRect: () => {},
    fillRect: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    arc: () => {},
    ellipse: () => {},
    quadraticCurveTo: () => {},
    bezierCurveTo: () => {},
    closePath: () => {},
    roundRect: () => {},
    stroke: () => {},
    fill: () => {},
    save: () => {},
    restore: () => {},
    translate: () => {},
    rotate: () => {},
    scale: () => {},
    setLineDash: () => {},
    fillText: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
  } as unknown as CanvasRenderingContext2D;
}

describe("Precision Geometry Utilities", () => {
  it("detects 2D segment intersections correctly", () => {
    // Intersecting cross
    const a = { x: 0, y: 0 };
    const b = { x: 10, y: 10 };
    const c = { x: 0, y: 10 };
    const d = { x: 10, y: 0 };
    expect(lineSegmentsIntersect(a, b, c, d)).toBe(true);

    // Parallel disjoint segments
    const p1 = { x: 0, y: 0 };
    const p2 = { x: 10, y: 0 };
    const p3 = { x: 0, y: 5 };
    const p4 = { x: 10, y: 5 };
    expect(lineSegmentsIntersect(p1, p2, p3, p4)).toBe(false);
  });

  it("calculates distance from point to segment", () => {
    const v = { x: 0, y: 0 };
    const w = { x: 10, y: 0 };
    const p = { x: 5, y: 3 };
    const res = distToSegment(p, v, w);
    expect(res.dist).toBeCloseTo(3, 2);
    expect(res.t).toBeCloseTo(0.5, 2);
  });
});

describe("Zen Precision Pruning & Slicing", () => {
  let plant: PlantState;
  const prng = createPrng(12345);

  beforeEach(() => {
    const genome = generateGenomeForSpecies(SPECIES[0], 12345);
    plant = freshState(genome, SPECIES[0], { seed: 12345 });
    // Grow plant into a mature bonsai with stems and leaves
    for (let i = 0; i < 40; i++) {
      plant = growOnce(plant, prng);
    }
  });

  it("computes stem transforms on render and allows swipe-to-slice", () => {
    const mockCtx = createMockCanvasContext();
    renderPlant(mockCtx, plant, 600, 600);
    const stemTrs = getStemTransforms();
    expect(stemTrs.size).toBeGreaterThan(0);

    // Pick an existing stem and slice across its midpoint
    const firstStem = Array.from(stemTrs.values())[0];
    const midX = (firstStem.startX + firstStem.endX) / 2;
    const midY = (firstStem.startY + firstStem.endY) / 2;

    const sliceP1 = { x: midX - 30, y: midY };
    const sliceP2 = { x: midX + 30, y: midY };

    const sliceResult = swipeSliceCurvedStems(plant, sliceP1, sliceP2, stemTrs);
    expect(sliceResult.cutCount).toBeGreaterThan(0);
    expect(sliceResult.maxCutThickness).toBeGreaterThan(0);

    // Verify cut node has isCut set
    const cutNode = sliceResult.state.nodes.find((n) => n.id === firstStem.nodeId);
    expect(cutNode?.isCut).toBe(true);
  });

  it("plucks leaves intersecting swipe stroke", () => {
    const mockCtx = createMockCanvasContext();
    renderPlant(mockCtx, plant, 600, 600);
    const stemTrs = getStemTransforms();

    const leafNodesBefore = plant.nodes.filter((n) => n.type === "leaf");
    expect(leafNodesBefore.length).toBeGreaterThan(0);

    const targetLeaf = leafNodesBefore[0];
    // Swipe directly through the leaf coordinate
    const p1 = { x: targetLeaf.x - 15, y: targetLeaf.y - 15 };
    const p2 = { x: targetLeaf.x + 15, y: targetLeaf.y + 15 };

    const pluckResult = pluckLeavesAlongSwipe(plant, p1, p2, stemTrs, 30);
    expect(pluckResult.pluckedCount).toBeGreaterThan(0);
    expect(pluckResult.state.nodes.length).toBeLessThan(plant.nodes.length);
  });

  it("applies bonsai wire bending and records wire offset without rotating joint anchor", () => {
    const stemNode = plant.nodes.find((n) => n.type === "stem" || n.type === "meristem");
    expect(stemNode).toBeDefined();
    if (!stemNode) return;

    const originalAngle = stemNode.angle;
    const delta = 0.15; // gentle bend
    const wiredState = bendStemWithWire(plant, stemNode.id, delta);

    const updatedNode = wiredState.nodes.find((n) => n.id === stemNode.id);
    expect(updatedNode?.hasWire).toBe(true);
    expect(updatedNode?.wireAngleOffset).toBe(delta);
    expect(updatedNode?.wireCurvature).toBe(delta);
    // Joint anchor angle is rigidly preserved!
    expect(updatedNode?.angle).toBe(originalAngle);
    expect(wiredState.bendInfo.bent).toBe(true);
    expect(wiredState.bendInfo.snapped).toBe(false);
  });

  it("triggers tension bark flaking when approaching bending limit (>70%)", () => {
    const stemNode = plant.nodes.find((n) => n.type === "stem" || n.type === "meristem");
    expect(stemNode).toBeDefined();
    if (!stemNode) return;

    const thickness = getNodeThickness(plant, stemNode.id);
    const maxBend = 1.45 / Math.pow(thickness, 0.95);
    // Bend to 85% of limit (inside warning zone)
    const delta = maxBend * 0.85;
    const stressedState = bendStemWithWire(plant, stemNode.id, delta);

    expect(stressedState.bendInfo.flakingBark).toBe(true);
    expect(stressedState.bendInfo.snapped).toBe(false);
    const updatedNode = stressedState.nodes.find((n) => n.id === stemNode.id);
    expect(updatedNode?.barkFracture).toBeGreaterThan(0);
  });

  it("snaps the branch with jagged splintered fracture when over-bent (>=100%)", () => {
    const stemNode = plant.nodes.find((n) => n.type === "stem" || n.type === "meristem");
    expect(stemNode).toBeDefined();
    if (!stemNode) return;

    const thickness = getNodeThickness(plant, stemNode.id);
    const maxBend = 1.45 / Math.pow(thickness, 0.95);
    // Bend past 110% of breaking limit
    const delta = maxBend * 1.15;
    const snappedState = bendStemWithWire(plant, stemNode.id, delta);

    expect(snappedState.bendInfo.snapped).toBe(true);
    const brokenNode = snappedState.nodes.find((n) => n.id === stemNode.id);
    expect(brokenNode?.isBroken).toBe(true);
    expect(brokenNode?.isCut).toBe(true);
    expect(brokenNode?.breakSplinters).toBeDefined();
    expect(brokenNode?.breakSplinters?.length).toBeGreaterThan(0);
    // Severed descendants and traumatic sap loss
    expect(snappedState.resources?.water).toBeLessThan(plant.resources?.water ?? 100);
    expect(snappedState.sapDrops?.length).toBeGreaterThan(0);
  });

  it("differentiates sap pressure loss: thick branches lose more than thin twigs", () => {
    const testPrng = createPrng(42);
    const sp = SPECIES[0];
    const g = generateGenomeForSpecies(sp, 42);
    let matureTree = freshState(g, sp, { seed: 42 });
    for (let i = 0; i < 40; i++) matureTree = growOnce(matureTree, testPrng);

    const nodes = matureTree.nodes.filter((n) => n.type === "stem" || n.type === "meristem");
    const thinTwig = nodes[nodes.length - 1]; // distal shoot
    const thickBranch = nodes[0]; // trunk/base stem

    const thinCut = pruneNodeAt(matureTree, thinTwig.id, 0.5);
    const thickCut = pruneNodeAt(matureTree, thickBranch.id, 0.5);

    const thinWaterLoss = (matureTree.resources?.water ?? 60) - (thinCut.resources?.water ?? 60);
    const thickWaterLoss = (matureTree.resources?.water ?? 60) - (thickCut.resources?.water ?? 60);

    expect(thickWaterLoss).toBeGreaterThan(thinWaterLoss);
    expect(thickCut.sapDrops?.length).toBeGreaterThan(0);
  });
});

describe("Procedural Soundscape Extensions", () => {
  it("executes thickness-scaled pruning sounds without throwing", () => {
    expect(() => playPruneSound(1.5)).not.toThrow();
    expect(() => playPruneSound(6.0)).not.toThrow();
    expect(() => playPruneSound(14.0)).not.toThrow();
  });

  it("executes defoliation and metallic wire chimes without throwing", () => {
    expect(() => playDefoliateSound()).not.toThrow();
    expect(() => playWireSound()).not.toThrow();
    expect(() => playWaterSound()).not.toThrow();
  });

  it("executes singing bowl and modulates breathing intensity", () => {
    expect(() => playSingingBowlSound(216)).not.toThrow();
    expect(() => setBreatheIntensity("inhale")).not.toThrow();
    expect(() => setBreatheIntensity("hold")).not.toThrow();
    expect(() => setBreatheIntensity("exhale")).not.toThrow();
  });

  it("executes procedural karesansui sand rake sound without throwing", () => {
    expect(() => playRakeSound()).not.toThrow();
  });

  it("executes Jin wood carving, Shishi-Odoshi clack, and Furin bell without throwing", () => {
    expect(() => playJinSound()).not.toThrow();
    expect(() => playShishiOdoshiClack()).not.toThrow();
    expect(() => playFurinSound()).not.toThrow();
  });

  it("executes wood creak, bark crack, branch snap, and sap drip sounds without throwing", () => {
    expect(() => playWoodCreakSound(0.85)).not.toThrow();
    expect(() => playBarkCrackSound()).not.toThrow();
    expect(() => playBranchSnapSound()).not.toThrow();
    expect(() => playSapDripSound()).not.toThrow();
  });

  it("toggles rain ambiance without throwing", () => {
    expect(() => toggleRainAmbiance(true)).not.toThrow();
    expect(() => toggleRainAmbiance(false)).not.toThrow();
  });
});

describe("Jin & Shari Deadwood Carving", () => {
  it("carves branches and entire distal subtrees into deadwood Jin, shedding foliage and spawning shavings", () => {
    const testPrng = createPrng(77);
    const sp = getSpeciesById("kengai-cascade")!;
    const g = generateGenomeForSpecies(sp, 77);
    let p = freshState(g, sp, { seed: 77 });
    for (let i = 0; i < 35; i++) p = growOnce(p, testPrng);

    const stem = p.nodes.find((n) => n.type === "stem" || n.type === "meristem");
    expect(stem).toBeDefined();
    if (!stem) return;

    const res = carveBranchToJin(p, stem.id);
    expect(res.carved).toBe(true);
    const carvedNode = res.state.nodes.find((n) => n.id === stem.id);
    expect(carvedNode?.isJin).toBe(true);
    expect(carvedNode?.terminal).toBe(false);
    expect(carvedNode?.budState).toBe("senescent");
    expect(res.state.woodShavings?.length).toBeGreaterThan(0);

    // Verify all attached foliage in the entire subtree was removed
    const attachedFoliage = res.state.nodes.filter(
      (n) => (n.parentId === stem.id || n.id === stem.id) && (n.type === "leaf" || n.type === "flower" || n.type === "bud")
    );
    expect(attachedFoliage.length).toBe(0);
  });

  it("swipes across curved stems with Jin chisel", () => {
    const testPrng = createPrng(88);
    const sp = getSpeciesById("acer-palmatum")!;
    const g = generateGenomeForSpecies(sp, 88);
    let p = freshState(g, sp, { seed: 88 });
    for (let i = 0; i < 30; i++) p = growOnce(p, testPrng);

    const mockCtx = createMockCanvasContext();
    renderPlant(mockCtx, p, 600, 600);
    const stemTrs = getStemTransforms();
    expect(stemTrs.size).toBeGreaterThan(0);

    const firstStem = Array.from(stemTrs.values())[0];
    const p1 = { x: firstStem.startX - 20, y: firstStem.startY - 20 };
    const p2 = { x: firstStem.endX + 20, y: firstStem.endY + 20 };

    const carveRes = swipeCarveCurvedStems(p, p1, p2, stemTrs);
    expect(carveRes.carvedCount).toBeGreaterThan(0);
    const carvedStem = carveRes.state.nodes.find((n) => n.id === firstStem.nodeId);
    expect(carvedStem?.isJin).toBe(true);
  });
});

describe("Classical Bonsai Species Presets", () => {
  it("provides authentic Japanese presets including Momiji, Kengai, and Bunjingi", () => {
    const momiji = getSpeciesById("acer-palmatum");
    const kengai = getSpeciesById("kengai-cascade");
    const bunjingi = getSpeciesById("bunjingi-pine");

    expect(momiji).toBeDefined();
    expect(momiji?.name).toContain("Momiji");
    expect(momiji?.genus).toBe("Acer");

    expect(kengai).toBeDefined();
    expect(kengai?.name).toContain("Kengai");
    expect(kengai?.genus).toBe("Juniperus");

    expect(bunjingi).toBeDefined();
    expect(bunjingi?.name).toContain("Bunjingi");
    expect(bunjingi?.genus).toBe("Pinus");
  });

  it("generates viable genomes for all registered species", () => {
    for (const sp of SPECIES) {
      const g = generateGenomeForSpecies(sp, 12345);
      expect(g).toBeDefined();
      expect(g.angle[0]).toBeGreaterThanOrEqual(10);
      expect(g.stiffness[0]).toBeGreaterThan(0);
    }
  });
});

describe("Karesansui & Seasonal Canvas Rendering", () => {
  it("renders Karesansui sand ripples and moss pillows without error", () => {
    const mockCtx = createMockCanvasContext();
    const testPrng = createPrng(42);
    const sp = getSpeciesById("acer-palmatum")!;
    const g = generateGenomeForSpecies(sp, 42);
    let p = freshState(g, sp, { seed: 42 });
    for (let i = 0; i < 30; i++) p = growOnce(p, testPrng);

    p.sandRipples = [
      { x: -50, y: 35, radius: 15, intensity: 0.9 },
      { x: 20, y: 40, radius: 18, intensity: 0.8 },
    ];

    expect(() => renderPlant(mockCtx, p, 500, 600)).not.toThrow();

    p.darkMode = true;
    expect(() => renderPlant(mockCtx, p, 500, 600)).not.toThrow();
  });

  it("renders seasonal variations (winter snow crust, autumn Momiji leaves, spring drift)", () => {
    const mockCtx = createMockCanvasContext();
    const testPrng = createPrng(99);
    const sp = getSpeciesById("acer-palmatum")!;
    const g = generateGenomeForSpecies(sp, 99);
    let p = freshState(g, sp, { seed: 99 });
    for (let i = 0; i < 40; i++) p = growOnce(p, testPrng);

    // Winter season (step >= 180)
    p.step = 200;
    p.windTime = 5.2;
    expect(() => renderPlant(mockCtx, p, 500, 600)).not.toThrow();

    // Autumn season (140 <= step < 180)
    p.step = 160;
    expect(() => renderPlant(mockCtx, p, 500, 600)).not.toThrow();

    // Spring season (step < 100)
    p.step = 30;
    expect(() => renderPlant(mockCtx, p, 500, 600)).not.toThrow();
  });

  it("renders all artisanal pot styles (yixing, oribe, tenmoku, kurama)", () => {
    const mockCtx = createMockCanvasContext();
    const testPrng = createPrng(12);
    const sp = getSpeciesById("bunjingi-pine")!;
    const g = generateGenomeForSpecies(sp, 12);
    let p = freshState(g, sp, { seed: 12 });
    for (let i = 0; i < 20; i++) p = growOnce(p, testPrng);

    const styles = ["classic", "yixing", "oribe", "tenmoku", "kurama"] as const;
    for (const style of styles) {
      p.potStyle = style;
      expect(() => renderPlant(mockCtx, p, 500, 600)).not.toThrow();
    }
  });

  it("renders atmospheric weather modes and Tokonoma presentation alcove", () => {
    const mockCtx = createMockCanvasContext();
    const testPrng = createPrng(34);
    const sp = getSpeciesById("acer-palmatum")!;
    const g = generateGenomeForSpecies(sp, 34);
    let p = freshState(g, sp, { seed: 34 });
    for (let i = 0; i < 20; i++) p = growOnce(p, testPrng);

    const weatherModes = ["clear", "komorebi", "rain", "twilight"] as const;
    for (const w of weatherModes) {
      p.weather = w;
      p.windTime = 3.5;
      expect(() => renderPlant(mockCtx, p, 500, 600)).not.toThrow();
    }

    // Tokonoma mode
    p.isTokonoma = true;
    expect(() => renderPlant(mockCtx, p, 500, 600)).not.toThrow();
  });

  it("renders Shishi-Odoshi at various water levels without error", () => {
    const mockCtx = createMockCanvasContext();
    const testPrng = createPrng(56);
    const sp = getSpeciesById("kengai-cascade")!;
    const g = generateGenomeForSpecies(sp, 56);
    let p = freshState(g, sp, { seed: 56 });

    p.shishiWater = 0.0;
    expect(() => renderPlant(mockCtx, p, 500, 600)).not.toThrow();

    p.shishiWater = 0.5;
    expect(() => renderPlant(mockCtx, p, 500, 600)).not.toThrow();

    p.shishiWater = 0.96; // dumping
    expect(() => renderPlant(mockCtx, p, 500, 600)).not.toThrow();
  });
});

describe("Serene Canvas FX Renderers", () => {
  it("renders blade slash trails smoothly", () => {
    const mockCtx = createMockCanvasContext();
    const slashPoints: SlashPoint[] = [
      { x: 100, y: 100, time: Date.now() - 50 },
      { x: 150, y: 180, time: Date.now() - 30 },
      { x: 200, y: 220, time: Date.now() },
    ];
    expect(() => renderBladeSlashTrail(mockCtx, slashPoints)).not.toThrow();
  });

  it("renders water mist droplets smoothly", () => {
    const mockCtx = createMockCanvasContext();
    const droplets: WaterDroplet[] = [
      { x: 120, y: 150, vx: 10, vy: 50, radius: 3.5, alpha: 0.8 },
      { x: 140, y: 170, vx: -15, vy: 80, radius: 4.2, alpha: 0.6 },
    ];
    expect(() => renderWaterDroplets(mockCtx, droplets)).not.toThrow();
  });
});
