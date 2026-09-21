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
  removeWire,
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
  renderCopperWateringCan,
  getCopperCanRosePosition,
  renderWaterStreams,
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

describe("Bonsai Wiring Lifecycle, Callus Healing & Zen Courtyard Enhancements", () => {
  it("removes wire with immediate springback (Modori) when unwrapped early", () => {
    const prng = createPrng(88);
    const sp = SPECIES[0];
    const g = generateGenomeForSpecies(sp, 88);
    let state = freshState(g, sp, { seed: 88 });
    for (let i = 0; i < 20; i++) state = growOnce(state, prng);

    const branch = state.nodes.find((n) => n.type === "stem" || n.type === "meristem")!;
    expect(branch).toBeDefined();

    // Bend branch with wire
    const bent = bendStemWithWire(state, branch.id, 0.35);
    const bentNode = bent.nodes.find((n) => n.id === branch.id)!;
    expect(bentNode.hasWire).toBe(true);

    // Immediate unwrapping (wireAge = 0) -> 100% Modori springback
    const unwrapRes = removeWire(bent, branch.id);
    expect(unwrapRes.info.removed).toBe(true);
    expect(unwrapRes.info.springback).toBe(1.0);
    const unwrappedNode = unwrapRes.state.nodes.find((n) => n.id === branch.id)!;
    expect(unwrappedNode.hasWire).toBe(false);
    expect(unwrappedNode.wireCurvature).toBe(0);
  });

  it("permanently sets branch bend after secondary wood lignification (wireAge >= 25)", () => {
    const prng = createPrng(99);
    const sp = SPECIES[0];
    const g = generateGenomeForSpecies(sp, 99);
    let state = freshState(g, sp, { seed: 99 });
    for (let i = 0; i < 20; i++) state = growOnce(state, prng);

    const branch = state.nodes.find((n) => n.type === "stem" || n.type === "meristem")!;
    const bent = bendStemWithWire(state, branch.id, 0.3);
    const initialBend = bent.nodes.find((n) => n.id === branch.id)!.wireCurvature!;

    // Simulate 26 growth steps with wire on
    let agedTree: PlantState = bent;
    for (let i = 0; i < 26; i++) agedTree = growOnce(agedTree, prng);

    const agedNode = agedTree.nodes.find((n) => n.id === branch.id)!;
    expect(agedNode.wireAge).toBeGreaterThanOrEqual(25);

    // Unwrap wire -> 0% springback, bend permanently set!
    const unwrapRes = removeWire(agedTree, branch.id);
    expect(unwrapRes.info.removed).toBe(true);
    expect(unwrapRes.info.springback).toBe(0);
    const setNode = unwrapRes.state.nodes.find((n) => n.id === branch.id)!;
    expect(setNode.hasWire).toBe(false);
    expect(setNode.wireCurvature).toBeCloseTo(initialBend, 2);
  });

  it("develops wire bite (Kikomi) when wire is left on past threshold (>35 steps)", () => {
    const prng = createPrng(101);
    const sp = SPECIES[0];
    const g = generateGenomeForSpecies(sp, 101);
    let state = freshState(g, sp, { seed: 101 });
    for (let i = 0; i < 20; i++) state = growOnce(state, prng);

    const branch = state.nodes.find((n) => n.type === "stem" || n.type === "meristem")!;
    let wiredTree: PlantState = bendStemWithWire(state, branch.id, 0.3);

    // Grow 38 steps
    for (let i = 0; i < 38; i++) wiredTree = growOnce(wiredTree, prng);

    const bittenNode = wiredTree.nodes.find((n) => n.id === branch.id)!;
    expect(bittenNode.hasWireBite).toBe(true);
    expect(bittenNode.wireBiteSeverity).toBeGreaterThan(0);
  });

  it("progressively heals pruned wounds with callus roll (Maki-komi) and forms wooden knob (Kobu)", () => {
    const prng = createPrng(102);
    const sp = SPECIES[0];
    const g = generateGenomeForSpecies(sp, 102);
    let tree = freshState(g, sp, { seed: 102 });
    for (let i = 0; i < 30; i++) tree = growOnce(tree, prng);

    const target = tree.nodes.find((n) => (n.type === "stem" || n.type === "meristem") && n.length > 5)!;
    expect(target).toBeDefined();

    // Fresh cut
    const cutTree = pruneNodeAt(tree, target.id, 0.5);
    const cutNode = cutTree.nodes.find((n) => n.id === target.id)!;
    expect(cutNode.isCut).toBe(true);
    expect(cutNode.callusStage).toBe(0);

    // Run 30 growth steps with moist soil
    let healingTree = cutTree;
    healingTree.soilMoisture = 0.9;
    for (let i = 0; i < 30; i++) healingTree = growOnce(healingTree, prng);

    const healedNode = healingTree.nodes.find((n) => n.id === target.id)!;
    expect(healedNode.callusStage).toBeGreaterThan(0.4);
    expect(healedNode.callusSwelling).toBeGreaterThan(0.4);
  });

  it("calculates copper can rose head position for left and right orientations", () => {
    const canLeft = {
      active: true,
      x: 150,
      y: 120,
      targetX: 150,
      targetY: 120,
      tiltAngle: -0.55,
      pourProgress: 1,
      liftProgress: 1,
      alpha: 1,
      facingLeft: true,
    };
    const roseLeft = getCopperCanRosePosition(canLeft);
    expect(roseLeft.x).toBeLessThan(canLeft.x); // rose is to the left of can center
    expect(Number.isFinite(roseLeft.y)).toBe(true);

    const canRight = {
      ...canLeft,
      facingLeft: false,
    };
    const roseRight = getCopperCanRosePosition(canRight);
    expect(roseRight.x).toBeGreaterThan(canRight.x); // rose is to the right of can center
  });

  it("renders multi-pronged Karesansui sand strokes and copper can without throwing", () => {
    const mockCtx = createMockCanvasContext();
    const sp = SPECIES[0];
    const g = generateGenomeForSpecies(sp, 103);
    let state = freshState(g, sp, { seed: 103 });

    state.sandStrokes = [
      {
        points: [
          { x: -100, y: 40 },
          { x: -50, y: 45 },
          { x: 0, y: 50 },
          { x: 80, y: 55 },
        ],
        width: 18,
        intensity: 1.0,
      },
    ];

    expect(() => renderPlant(mockCtx, state, 600, 700)).not.toThrow();

    const can = {
      active: true,
      x: 200,
      y: 150,
      targetX: 200,
      targetY: 150,
      tiltAngle: -0.45,
      pourProgress: 0.8,
      liftProgress: 1,
      alpha: 0.9,
      facingLeft: true,
    };
    expect(() => renderCopperWateringCan(mockCtx, can)).not.toThrow();

    const streams = [
      { x: 180, y: 160, vx: -20, vy: 45, len: 12, alpha: 0.9, thickness: 1.0, seed: 0.5 },
    ];
    expect(() => renderWaterStreams(mockCtx, streams)).not.toThrow();
  });

  it("advances leaf and flower growthProgress gradually from bud stage to full bloom", () => {
    const prng = createPrng(303);
    const sp = SPECIES[0];
    const g = generateGenomeForSpecies(sp, 303);
    let state = freshState(g, sp, { seed: 303 });

    // Grow 40 steps to spawn foliage
    for (let i = 0; i < 40; i++) state = growOnce(state, prng);

    const leaves = state.nodes.filter((n) => n.type === "leaf");
    expect(leaves.length).toBeGreaterThan(0);

    // Verify all leaves have valid growthProgress >= 0.08 and <= 1.0
    for (const leaf of leaves) {
      expect(leaf.growthProgress).toBeDefined();
      expect(leaf.growthProgress!).toBeGreaterThanOrEqual(0.08);
      expect(leaf.growthProgress!).toBeLessThanOrEqual(1.0);
    }

    // Capture initial progress of oldest leaf
    const firstLeaf = leaves[0];
    const initialProgress = firstLeaf.growthProgress!;

    // Run additional steps with water
    state.soilMoisture = 0.9;
    for (let i = 0; i < 15; i++) state = growOnce(state, prng);

    const updatedLeaf = state.nodes.find((n) => n.id === firstLeaf.id)!;
    expect(updatedLeaf.growthProgress!).toBeGreaterThanOrEqual(initialProgress);
  });

  it("calculates distal foliage weight and applies subtle reaction wood deflection", () => {
    const prng = createPrng(404);
    const sp = SPECIES[1]; // Acer Palmatum
    const g = generateGenomeForSpecies(sp, 404);
    let state = freshState(g, sp, { seed: 404 });

    // Grow tree to establish branching
    for (let i = 0; i < 45; i++) state = growOnce(state, prng);

    const stems = state.nodes.filter((n) => n.type === "stem" || n.type === "meristem");
    expect(stems.length).toBeGreaterThan(1);

    // Verify distal weight and subtle reaction sag
    for (const stem of stems) {
      expect(stem.distalWeight).toBeDefined();
      expect(stem.distalWeight!).toBeGreaterThanOrEqual(0);
      expect(stem.reactionWoodSag).toBeDefined();
      // Reaction wood sag must be gentle ("nur seicht", clamped <= 0.12 rad approx 6.8 deg)
      expect(Math.abs(stem.reactionWoodSag!)).toBeLessThanOrEqual(0.12);
    }

    // Root node must bear accumulated distal weight of its descendants
    const root = state.nodes.find((n) => n.id === 0)!;
    expect(root.distalWeight!).toBeGreaterThan(0.05);
  });

  it("renders all botanical leaf and flower morphologies across all developmental stages without throwing", () => {
    const { drawModularLeaf, drawModularFlower } = require("../src/render/morphology");
    const mockCtx = createMockCanvasContext();

    const leafShapes = ["needle", "scale", "palmate", "lanceolate", "serrate", "pinnate", "lobed", "simple"];
    const flowerShapes = ["sakura", "ume", "azalea", "solitary", "umbel", "compound"];
    const stages = [0.1, 0.35, 0.65, 1.0]; // Bud, unfurling/swelling, bloom, mature

    for (const ls of leafShapes) {
      for (const p of stages) {
        expect(() => drawModularLeaf(mockCtx, ls, 14, "#15803d", "#86efac", p)).not.toThrow();
      }
    }

    for (const fs of flowerShapes) {
      for (const p of stages) {
        expect(() => drawModularFlower(mockCtx, fs, 5, 10, "#f43f5e", "#facc15", p)).not.toThrow();
      }
    }
  });

  it("renders foliage with toggleable translucency (X-Ray) and proximity hover fading without throwing", () => {
    const mockCtx = createMockCanvasContext();
    const sp = SPECIES[0];
    const g = generateGenomeForSpecies(sp, 204);
    let state = freshState(g, sp, { seed: 204 });
    const prng = createPrng(204);
    for (let i = 0; i < 25; i++) {
      state = growOnce(state, prng);
    }

    // 1. Standard rendering
    expect(() => renderPlant(mockCtx, state, 600, 700)).not.toThrow();

    // 2. Toggled X-Ray Skelettschau (foliageTransparent = true)
    state.foliageTransparent = true;
    expect(() => renderPlant(mockCtx, state, 600, 700)).not.toThrow();

    // 3. Proximity hover fading (cursorWorldX / cursorWorldY active)
    state.foliageTransparent = false;
    state.cursorWorldX = 10;
    state.cursorWorldY = -50;
    expect(() => renderPlant(mockCtx, state, 600, 700)).not.toThrow();

    // 4. Cursor distant from tree
    state.cursorWorldX = 999;
    state.cursorWorldY = 999;
    expect(() => renderPlant(mockCtx, state, 600, 700)).not.toThrow();
  });
});

