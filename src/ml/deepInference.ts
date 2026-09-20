import type { PlantState, Genome } from "../sim/types";
import { growOnce } from "../sim/growth";
import { createPrng } from "../sim/prng";

export function runDeepLocalInference(initialState: PlantState, targetIterations = 1000) {
  let bestGenome = initialState.genome;
  let bestScore = 0;
  for (let i = 0; i < targetIterations; i++) {
    const candidate: Genome = {
      ...initialState.genome,
      vigor: [0.6 + Math.random() * 0.4, 0.6 + Math.random() * 0.4],
      angle: [20 + Math.random() * 30, 20 + Math.random() * 30],
    };
    let s = { ...initialState, genome: candidate, nodes: [initialState.root], step: 0 };
    const prng = createPrng(42 + i);
    for (let step = 0; step < 30; step++) {
      s = growOnce(s, prng);
    }
    const score = s.nodes.length;
    if (score > bestScore) {
      bestScore = score;
      bestGenome = candidate;
    }
  }
  return { bestGenome, bestScore };
}
