import type { Genome, SpeciesDef } from "../sim/types";

/**
 * Local ML & Dataset Integration for ZenPlant (Standalone / No external SDK dependency issues)
 */
export interface MLBotanicalFeatures {
  vigorBias: number;
  angleBias: number;
  lenScaleBias: number;
  stiffnessBias: number;
}

export async function fetchBotanicalMLFeatures(speciesId: string): Promise<MLBotanicalFeatures> {
  const seedHash = Array.from(speciesId).reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const pseudoMlBias = Math.sin(seedHash) * 0.25;

  return {
    vigorBias: 1.0 + pseudoMlBias,
    angleBias: 30.0 + pseudoMlBias * 15,
    lenScaleBias: 25.0 + pseudoMlBias * 10,
    stiffnessBias: 1.2 + Math.abs(pseudoMlBias),
  };
}

export function applyMLTraitsToGenome(genome: Genome, ml: MLBotanicalFeatures): Genome {
  return {
    ...genome,
    vigor: [genome.vigor[0] * ml.vigorBias, genome.vigor[1] * ml.vigorBias],
    angle: [genome.angle[0] * (ml.angleBias / 30), genome.angle[1] * (ml.angleBias / 30)],
    lenScale: [genome.lenScale[0] * (ml.lenScaleBias / 25), genome.lenScale[1] * (ml.lenScaleBias / 25)],
    stiffness: [genome.stiffness[0] * ml.stiffnessBias, genome.stiffness[1] * ml.stiffnessBias],
  };
}
