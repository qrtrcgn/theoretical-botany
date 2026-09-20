/**
 * ZenPlant - Genetics Engine
 * 
 * Handles genome generation, trait inheritance, crossover (breeding),
 * and mutation for the procedural plant studio.
 * 
 * All functions are pure - no side effects, no global state.
 * Essential for reproducibility and export/import.
 */

import type { Genome, SpeciesDef } from "./types";

/**
 * Expresses a phenotype from a genotype (alleles).
 * For most traits, the dominant allele is the one with the higher value.
 * For colors, we take the first allele.
 */
export function expressTrait<T extends keyof Genome>(genome: Genome, trait: T): any {
  if (!genome || !genome[trait]) return 0;
  const alleles = genome[trait];
  if (!Array.isArray(alleles)) return alleles;

  // Specialize expression logic by trait
  switch (trait) {
    case "flowerRGB":
      return alleles[0]; // Color is expressed from the first allele
    case "flowerStretch": {
      const stretch = alleles as unknown as [[number, number], [number, number]];
      return [
        Math.max(stretch[0][0], stretch[1][0]),
        Math.max(stretch[0][1], stretch[1][1]),
      ];
    }
    default:
      // Default: Higher value is dominant
      return Math.max((alleles as [number, number])[0], (alleles as [number, number])[1]);
  }
}

// --- Genome Generation ---

/**
 * Create a new random genome using a PRNG seeded with the given seed.
 * Every seed produces identical genomes - essential for reproducibility.
 * 
 * @param prng Seeded PRNG instance
 * @returns New genome with traits within species-calibrated ranges
 */
export function generateGenome(prng: { float: (min: number, max: number) => number; int: (min: number, max: number) => number; random: () => number }): Genome {
  const randAlleles = (min: number, max: number): [number, number] => [
    prng.float(min, max),
    prng.float(min, max),
  ];
  const randIntAlleles = (min: number, max: number): [number, number] => [
    prng.int(min, max),
    prng.int(min, max),
  ];

  return {
    vigor: randAlleles(0.6, 1.4),
    angle: randIntAlleles(15, 55),
    decay: randAlleles(0.05, 0.15),
    lenScale: randIntAlleles(20, 50),
    flowerRGB: [
      [Math.floor(prng.random() * 256), Math.floor(prng.random() * 256), Math.floor(prng.random() * 256)],
      [Math.floor(prng.random() * 256), Math.floor(prng.random() * 256), Math.floor(prng.random() * 256)],
    ],
    flowerRadius: randIntAlleles(3, 12),
    flowerShape: randIntAlleles(0, 5),
    flowerStretch: [
      [prng.float(0.5, 2.0), prng.float(0.5, 2.0)],
      [prng.float(0.5, 2.0), prng.float(0.5, 2.0)],
    ],
    flowerMaterial: randIntAlleles(0, 2),
    leafShape: randIntAlleles(0, 6),
    leafSize: randAlleles(0.8, 1.5),
    leafDensity: randAlleles(0.5, 0.9),
    inflorescence: randIntAlleles(0, 5),
    petalCount: randIntAlleles(3, 12),
    sepalCount: randIntAlleles(3, 7),
    stamenCount: randIntAlleles(4, 20),
    symmetry: randIntAlleles(0, 1),
    curl: randAlleles(0.0, 0.5),
    windSensitivity: randAlleles(0.2, 0.8),
    barkRoughness: randAlleles(0.1, 0.6),
    thornDensity: randAlleles(0.0, 0.3),
    vineMode: randAlleles(0.0, 0.3),
    stiffness: randAlleles(0.55, 1.7),
    budActivationThreshold: randAlleles(0.1, 0.9),
    shadeTolerance: randAlleles(0.2, 0.8),
    apicalDominance: randAlleles(0.5, 1.5),
    internodeElasticity: randAlleles(0.8, 1.2),
    dormancyStrength: randAlleles(0.1, 0.9),
  };
}

// --- Crossover (Breeding) ---

/**
 * Breed two parent genomes to produce an offspring genome.
 * 
 * Inheritance pattern:
 * - Every trait: Mendelian crossover (one random allele from each parent).
 * 
 * @param parent1 First parent genome
 * @param parent2 Second parent genome
 * @param prng PRNG for deterministic random choices
 * @returns Offspring genome combining traits from both parents
 */
export function breedGenomes(
  parent1: Genome,
  parent2: Genome,
  prng: { float: (min: number, max: number) => number; int: (min: number, max: number) => number; random: () => number }
): Genome {
  const breedTrait = <T>(p1: [T, T], p2: [T, T]): [T, T] => [
    prng.random() < 0.5 ? p1[0] : p2[0],
    prng.random() < 0.5 ? p1[1] : p2[1],
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
    dormancyStrength: breedTrait(parent1.dormancyStrength, parent2.dormancyStrength),
  };
}

/** Helper: clamp a number to a [min, max] range */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// --- Mutation ---

/**
 * Mutate a genome slightly, introducing small random changes to traits.
 * 
 * @param genome Original genome to mutate
 * @param prng PRNG for deterministic random choices
 * @param mutationRate Probability [0, 1] that each trait will mutate
 * @returns New mutated genome
 */
export function mutateGenome(
  genome: Genome,
  prng: { float: (min: number, max: number) => number; int: (min: number, max: number) => number; random: () => number },
  mutationRate = 0.1
): Genome {
  const mutateTrait = <T>(val: [T, T], mutFn: (v: T) => T): [T, T] => {
    if (prng.random() < mutationRate) {
      return [mutFn(val[0]), val[1]]; // Mutate first allele
    }
    if (prng.random() < mutationRate) {
      return [val[0], mutFn(val[1])]; // Mutate second allele
    }
    return val;
  };

  const mutateNum = (v: number, range: number) => v + prng.float(-range, range);
  const mutateInt = (v: number, range: number) => v + prng.int(-range, range);

  return {
    vigor: mutateTrait(genome.vigor, (v) => mutateNum(v, 0.1)),
    angle: mutateTrait(genome.angle, (v) => mutateInt(v, 5)),
    decay: mutateTrait(genome.decay, (v) => mutateNum(v, 0.02)),
    lenScale: mutateTrait(genome.lenScale, (v) => mutateInt(v, 5)),
    flowerRGB: mutateTrait(genome.flowerRGB, (v) => [
      Math.max(0, Math.min(255, v[0] + Math.round(prng.float(-20, 20)))),
      Math.max(0, Math.min(255, v[1] + Math.round(prng.float(-20, 20)))),
      Math.max(0, Math.min(255, v[2] + Math.round(prng.float(-20, 20)))),
    ]),
    flowerRadius: mutateTrait(genome.flowerRadius, (v) => Math.max(3, Math.min(12, mutateInt(v, 2)))),
    flowerShape: mutateTrait(genome.flowerShape, () => Math.floor(prng.random() * 6)),
    flowerStretch: mutateTrait(genome.flowerStretch, (v) => [
      Math.max(0.5, Math.min(2.0, v[0] + prng.float(-0.2, 0.2))),
      Math.max(0.5, Math.min(2.0, v[1] + prng.float(-0.2, 0.2))),
    ]),
    flowerMaterial: mutateTrait(genome.flowerMaterial, () => Math.floor(prng.random() * 3)),
    leafShape: mutateTrait(genome.leafShape, () => Math.floor(prng.random() * 7)),
    leafSize: mutateTrait(genome.leafSize, (v) => clamp(mutateNum(v, 0.2), 0.3, 2.5)),
    leafDensity: mutateTrait(genome.leafDensity, (v) => clamp(mutateNum(v, 0.1), 0.2, 1.0)),
    inflorescence: mutateTrait(genome.inflorescence, () => Math.floor(prng.random() * 6)),
    petalCount: mutateTrait(genome.petalCount, (v) => Math.max(2, mutateInt(v, 3))),
    sepalCount: mutateTrait(genome.sepalCount, (v) => Math.max(2, mutateInt(v, 2))),
    stamenCount: mutateTrait(genome.stamenCount, (v) => Math.max(2, mutateInt(v, 4))),
    symmetry: mutateTrait(genome.symmetry, () => Math.floor(prng.random() * 2)),
    curl: mutateTrait(genome.curl, (v) => clamp(mutateNum(v, 0.15), 0, 1)),
    windSensitivity: mutateTrait(genome.windSensitivity, (v) => clamp(mutateNum(v, 0.1), 0, 1)),
    barkRoughness: mutateTrait(genome.barkRoughness, (v) => clamp(mutateNum(v, 0.1), 0, 1)),
    thornDensity: mutateTrait(genome.thornDensity, (v) => clamp(mutateNum(v, 0.1), 0, 1)),
    vineMode: mutateTrait(genome.vineMode, (v) => clamp(mutateNum(v, 0.1), 0, 1)),
    stiffness: mutateTrait(genome.stiffness, (v) => clamp(mutateNum(v, 0.15), 0.3, 2.0)),
    budActivationThreshold: mutateTrait(genome.budActivationThreshold, (v) => clamp(mutateNum(v, 0.05), 0.1, 0.9)),
    shadeTolerance: mutateTrait(genome.shadeTolerance, (v) => clamp(mutateNum(v, 0.05), 0.2, 0.8)),
    apicalDominance: mutateTrait(genome.apicalDominance, (v) => clamp(mutateNum(v, 0.05), 0.5, 1.5)),
    internodeElasticity: mutateTrait(genome.internodeElasticity, (v) => clamp(mutateNum(v, 0.05), 0.8, 1.2)),
    dormancyStrength: mutateTrait(genome.dormancyStrength, (v) => clamp(mutateNum(v, 0.05), 0.1, 0.9)),
  };
}

// --- Exported API ---

export interface GeneticsAPI {
  generateGenome: (prng: { float: (min: number, max: number) => number; int: (min: number, max: number) => number; random: () => number }) => Genome;
  breedGenomes: (parent1: Genome, parent2: Genome, prng: { float: (min: number, max: number) => number; int: (min: number, max: number) => number; random: () => number }) => Genome;
  mutateGenome: (genome: Genome, prng: { float: (min: number, max: number) => number; int: (min: number, max: number) => number; random: () => number }, mutationRate?: number) => Genome;
  expressTrait: <T extends keyof Genome>(genome: Genome, trait: T) => any;
}

export const geneticsApi: GeneticsAPI = {
  generateGenome,
  breedGenomes,
  mutateGenome,
  expressTrait,
};

export default geneticsApi;
