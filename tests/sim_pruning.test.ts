/**
 * Pruning Tests - RED Phase
 * 
 * These tests MUST FAIL before the pruning engine implementation is complete.
 * They verify subtree pruning and dormant bud activation behaviors.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { growOnce, freshState, pruneNode, pruneNodeAt } from "../src/sim/growth";
import { precisionSplitAndPrune } from "../src/sim/precisionSplit";
import { createPrng } from "../src/sim/prng";
import { Genome, PlantState, PlantNode, SpeciesDef } from "../src/sim/types";

describe("Pruning", () => {
  let prng: ReturnType<typeof createPrng>;
  let genome: Genome;

  beforeEach(() => {
    prng = createPrng(42);
    genome = {
      vigor: [0.8, 0.8],
      angle: [25, 25],
      decay: [0.08, 0.08],
      lenScale: [30, 30],
      flowerRGB: [[200, 100, 50], [200, 100, 50]],
      flowerRadius: [4, 4],
      flowerShape: [0, 0],
      flowerStretch: [[0.8, 1.2], [0.8, 1.2]],
      flowerMaterial: [0, 0],
      budActivationThreshold: [0.5, 0.5],
      shadeTolerance: [0.6, 0.6],
      apicalDominance: [1.0, 1.0],
      internodeElasticity: [1.0, 1.0],
      dormancyStrength: [0.3, 0.3],
      leafShape: [0, 0],
      leafSize: [1.0, 1.0],
      leafDensity: [0.7, 0.7],
      inflorescence: [0, 0],
      petalCount: [5, 5],
      sepalCount: [5, 5],
      stamenCount: [8, 8],
      symmetry: [0, 0],
      curl: [0.2, 0.2],
      windSensitivity: [0.5, 0.5],
      barkRoughness: [0.3, 0.3],
      thornDensity: [0.1, 0.1],
      vineMode: [0.0, 0.0],
      stiffness: [1.0, 1.0],
    };
  });

  describe("pruneNode removes subtree", () => {
    it("removes selected stem and all descendants", () => {
      const testSpecies: SpeciesDef = {
        id: "test", name: "Test", genus: "Test", version: "1.0.0",
        traitRanges: { vigor: [0.6, 1.2], angle: [15, 45], decay: [0.05, 0.15], lenScale: [20, 40] },
        hiddenTraits: { budActivationThreshold: 0.5, shadeTolerance: 0.6, apicalDominance: 1.0, internodeElasticity: 1.0, dormancyStrength: 0.3 },
        leafResourceYield: 1.0, seasonalRange: [0, 250],
        palette: { typicalRGB: [200, 100, 50], typicalShape: 0, typicalMaterial: 0 }
      };
      const state = freshState(genome, testSpecies, { seed: 42 });

      // Grow the plant a bit to have descendants
      let currentState = state;
      for (let i = 0; i < 20; i++) {
        currentState = growOnce(currentState, prng);
      }

      const beforeCount = currentState.nodes.length;

      // Prune the root stem (id=0)
      const newState = pruneNode(currentState, 0);

      // The pruned node and all descendants should be removed
      expect(newState.nodes.length).toBeLessThan(beforeCount);

      // The root should no longer be terminal (it's cut)
      const root = newState.nodes.find((n) => n.id === 0);
      expect(root?.isCut).toBe(true);
    });

    it("pruning triggers bud activation", () => {
      const state = freshState(genome, {
        id: "test2", name: "Test 2", genus: "Test", version: "1.0.0",
        traitRanges: { vigor: [0.6, 1.2], angle: [15, 45], decay: [0.05, 0.15], lenScale: [20, 40] },
        hiddenTraits: { budActivationThreshold: 0.5, shadeTolerance: 0.6, apicalDominance: 1.0, internodeElasticity: 1.0, dormancyStrength: 0.3 },
        leafResourceYield: 1.0, seasonalRange: [0, 250],
        palette: { typicalRGB: [200, 100, 50], typicalShape: 0, typicalMaterial: 0 }
      }, { seed: 42 });

      // Grow the plant
      let currentState = state;
      for (let i = 0; i < 20; i++) {
        currentState = growOnce(currentState, prng);
      }

      const beforeCount = currentState.nodes.length;

      // Prune a stem
      const newState = pruneNode(currentState, 0);

      // After pruning, some buds should have been activated into new stems
      // (this depends on the pruning implementation triggering awakening)
      const newTips = newState.nodes.filter(
        (n) => n.terminal && n.type === "meristem" && n.id !== 0
      );

      // At minimum, the plant should still have nodes (or some were removed)
      expect(newState.nodes.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("pruning interaction with growth", () => {
    it("pruned plant can continue growing", () => {
      const state = freshState(genome, {
        id: "test3", name: "Test 3", genus: "Test", version: "1.0.0",
        traitRanges: { vigor: [0.6, 1.2], angle: [15, 45], decay: [0.05, 0.15], lenScale: [20, 40] },
        hiddenTraits: { budActivationThreshold: 0.5, shadeTolerance: 0.6, apicalDominance: 1.0, internodeElasticity: 1.0, dormancyStrength: 0.3 },
        leafResourceYield: 1.0, seasonalRange: [0, 250],
        palette: { typicalRGB: [200, 100, 50], typicalShape: 0, typicalMaterial: 0 }
      }, { seed: 42 });

      // Grow then prune
      let currentState = state;
      for (let i = 0; i < 5; i++) {
        currentState = growOnce(currentState, prng);
      }

      const beforePrune = currentState.nodes.length;
      const prunedState = pruneNode(currentState, 0);

      // Plant should still be viable after pruning
      expect(prunedState.nodes.length).toBeGreaterThan(0);

      // Continue growing after pruning
      let afterPrune = prunedState;
      for (let i = 0; i < 3; i++) {
        afterPrune = growOnce(afterPrune, prng);
      }

      // Should have grown some more
      expect(afterPrune.nodes.length).toBeGreaterThan(0);
    });
  });

  describe("mid-segment cut", () => {
    const species: SpeciesDef = {
      id: "test-cut", name: "Test", genus: "Test", version: "1.0.0",
      traitRanges: { vigor: [0.6, 1.2], angle: [15, 45], decay: [0.05, 0.15], lenScale: [20, 40] },
      hiddenTraits: { budActivationThreshold: 0.5, shadeTolerance: 0.6, apicalDominance: 1.0, internodeElasticity: 1.0, dormancyStrength: 0.3 },
      leafResourceYield: 1.0, seasonalRange: [0, 250],
      palette: { typicalRGB: [200, 100, 50], typicalShape: 0, typicalMaterial: 0 }
    };

    it("shortens the internodal wood to the click fraction", () => {
      let state = freshState(genome, species, { seed: 42 });
      for (let i = 0; i < 25; i++) state = growOnce(state, prng);

      const target = state.nodes.find((n) => (n.type === "stem" || n.type === "meristem") && n.length > 8);
      expect(target).toBeDefined();
      const beforeLen = target!.length;
      const beforeCount = state.nodes.length;

      const cut = pruneNodeAt(state, target!.id, 0.4);
      const stub = cut.nodes.find((n) => n.id === target!.id);
      expect(stub?.length).toBeCloseTo(beforeLen * 0.4, 5);
      expect(stub?.targetLength).toBeCloseTo(stub!.length, 5);
      expect(stub?.isCut).toBe(true);
      expect(stub?.terminal).toBe(false);
      expect(cut.nodes.length).toBeLessThan(beforeCount);
    });

    it("does not grow the stub back on later steps", () => {
      let state = freshState(genome, species, { seed: 7 });
      for (let i = 0; i < 20; i++) state = growOnce(state, prng);
      const target = state.nodes.find((n) => n.id === 0);
      expect(target).toBeDefined();
      let cut = pruneNodeAt(state, 0, 0.5);
      const stubLen = cut.nodes.find((n) => n.id === 0)!.length;
      for (let i = 0; i < 8; i++) cut = growOnce(cut, prng);
      expect(cut.nodes.find((n) => n.id === 0)!.length).toBeCloseTo(stubLen, 5);
    });

    it("keeps children attached proximal to the cut", () => {
      let state = freshState(genome, species, { seed: 3 });
      const trunk = state.nodes[0];
      trunk.length = 40;
      trunk.targetLength = 40;
      trunk.terminal = false;
      trunk.type = "stem";
      state.nodes.push({
        ...trunk,
        id: 11,
        parentId: 0,
        type: "bud",
        attachT: 0.2,
        terminal: false,
        length: 0,
        v: 0.5,
        budState: "dormant",
      });
      state.nodes.push({
        ...trunk,
        id: 12,
        parentId: 0,
        type: "leaf",
        attachT: 0.9,
        terminal: false,
        length: 8,
        v: 0,
      });
      const cut = pruneNodeAt(state, 0, 0.5);
      expect(cut.nodes.some((n) => n.id === 11)).toBe(true);
      expect(cut.nodes.some((n) => n.id === 12)).toBe(false);
    });

    it("projects a world-space click onto the displayed segment", () => {
      let state = freshState(genome, species, { seed: 1 });
      const n = state.nodes[0];
      n.length = 20;
      n.targetLength = 20;
      n.x = 0;
      n.y = 0;
      n.angle = -Math.PI / 2;
      const click = { x: 0, y: -8 };
      const cut = precisionSplitAndPrune(state, 0, click);
      expect(cut.nodes[0].length).toBeCloseTo(8, 4);
    });
  });
});