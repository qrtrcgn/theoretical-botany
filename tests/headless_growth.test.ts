import { describe, test, expect } from "bun:test";
import { freshState, growOnce, pruneNodeAt } from "../src/sim/growth";
import { SPECIES } from "../src/data/species";
import { generateGenomeForSpecies } from "../src/data/species";
import { createPrng } from "../src/sim/prng";
import { bendStemWithWire, carveBranchToJin, getNodeThickness } from "../src/sim/precisionPrune";
import { evaluateBonsaiSchools } from "../src/sim/bonsaiSchools";

describe("Headless Botanical Playtesting (50+ Iterations Per Species)", () => {
  for (const sp of SPECIES) {
    test(`Species '${sp.id}' continuously grows across 50 iterations without stalling`, () => {
      const seed = 12345;
      const prng = createPrng(seed);
      const genome = generateGenomeForSpecies(sp, seed);
      let state = freshState(genome, sp, { seed });

      // Sprout phase: 80 steps (as in app.ts newPlant)
      for (let i = 0; i < 80; i++) {
        state = growOnce(state, prng);
      }

      const sproutNodes = state.nodes.length;
      expect(sproutNodes).toBeGreaterThan(10);

      // Now run 50 active interactive gameplay steps
      const nodeHistory: number[] = [];
      const tipHistory: number[] = [];

      for (let step = 1; step <= 50; step++) {
        // At step 25, simulate user watering the plant
        if (step === 25) {
          state.soilMoisture = Math.min(1.0, (state.soilMoisture ?? 0.5) + 0.5);
        }

        state = growOnce(state, prng);

        const livingTips = state.nodes.filter(
          n => n.type === "meristem" && (n.budState === "active" || n.budState === "dormant")
        );
        nodeHistory.push(state.nodes.length);
        tipHistory.push(livingTips.length);

        // Assert all nodes have finite, valid coordinates and dimensions
        for (const node of state.nodes) {
          expect(Number.isFinite(node.length)).toBe(true);
          expect(Number.isFinite(node.angle)).toBe(true);
          expect(Number.isFinite(node.x)).toBe(true);
          expect(Number.isFinite(node.y)).toBe(true);
          expect(node.length).toBeGreaterThanOrEqual(0);

          const thick = getNodeThickness(state, node.id);
          expect(Number.isFinite(thick)).toBe(true);
          expect(thick).toBeGreaterThan(0);
        }

        if (state.soilMoisture !== undefined) {
          expect(Number.isFinite(state.soilMoisture)).toBe(true);
        }
        expect(Number.isFinite(state.resources.water)).toBe(true);
        expect(Number.isFinite(state.resources.energy)).toBe(true);
        expect(Number.isFinite(state.resources.structural)).toBe(true);
      }

      // Assert that growth did NOT freeze/stall!
      // In the 50 steps following step 80, the tree must have expanded its branch network
      const finalNodes = state.nodes.length;
      expect(finalNodes).toBeGreaterThan(sproutNodes);

      // Active meristems / living tips must remain viable (> 0)
      const finalLivingTips = state.nodes.filter(
        n => n.type === "meristem" && (n.budState === "active" || n.budState === "dormant")
      );
      expect(finalLivingTips.length).toBeGreaterThan(0);

      // Step counter must have advanced 130 steps total
      expect(state.step).toBe(130);
    });

    test(`Species '${sp.id}' responds to pruning, wiring, and watering during gameplay`, () => {
      const seed = 9999;
      const prng = createPrng(seed);
      const genome = generateGenomeForSpecies(sp, seed);
      let state = freshState(genome, sp, { seed });

      // Sprout 80 steps
      for (let i = 0; i < 80; i++) state = growOnce(state, prng);

      // Pick a branch node to prune
      const branches = state.nodes.filter(n => n.type === "stem" && n.parentId !== null);
      if (branches.length > 2) {
        const targetNode = branches[branches.length - 1];
        state = pruneNodeAt(state, targetNode.id, 0.5);
      }

      // Wire a lower branch
      const remainingStems = state.nodes.filter(n => n.type === "stem" && n.parentId !== null);
      if (remainingStems.length > 0) {
        const wireTarget = remainingStems[0];
        state = bendStemWithWire(state, wireTarget.id, 0.45);
      }

      // Grow 25 steps under natural time
      for (let i = 0; i < 25; i++) {
        state = growOnce(state, prng);
      }

      // Carve Jin deadwood on a lateral branch tip
      const tips = state.nodes.filter(n => n.type === "stem" && !state.nodes.some(c => c.parentId === n.id));
      if (tips.length > 0) {
        const jinTarget = tips[0];
        const jinResult = carveBranchToJin(state, jinTarget.id);
        state = jinResult.state;
      }

      // Give deep watering
      state.soilMoisture = 0.95;

      // Grow another 25 steps
      for (let i = 0; i < 25; i++) {
        state = growOnce(state, prng);
      }

      // Must have continued living with active buds and viable tips
      expect(state.nodes.length).toBeGreaterThan(10);
      const activeOrDormant = state.nodes.filter(
        n => n.budState === "active" || n.budState === "dormant"
      );
      expect(activeOrDormant.length).toBeGreaterThan(0);

      // Evaluate schools to ensure bonsai evaluator doesn't crash on this specimen
      const report = evaluateBonsaiSchools(state);
      expect(report).toBeDefined();
      expect(Object.keys(report.scores).length).toBe(8);
      expect(report.metrics).toBeDefined();
    });
  }
});
