/**
 * ZenPlant - Species Definitions
 * 
 * Three calibrated species presets with versioned metadata and
 * trait ranges for reproducible generation.
 * 
 * These species are designed for the "ZenPlant" calm procedural plant studio,
 * providing distinct visual and growth profiles while maintaining
 * algorithmic botany credibility.
 */

import type { Genome, SpeciesDef } from "../sim/types";
import { createPrng } from "../sim/prng";

/**
 * Japanese Bonsai - Pine-style miniature tree
 * 
 * Characteristics:
 * - Slow, deliberate growth
 * - Compact form with tight branching
 * - Dark green foliage, sporadic flowers
 * - Long-lived, elegant structure
 * 
 * Cultural significance: Represents patience, mindfulness, and the
 * beauty of constrained growth - central to Zen philosophy.
 */
export const japaneseBonsai: SpeciesDef = {
  id: "japanese-bonsai",
  name: "Japanese Bonsai",
  genus: "Pinus",
  version: "1.0.0",
  traitRanges: {
    vigor: [0.6, 0.8],         // slow, controlled growth
    angle: [15, 25],           // tight branching angle
    decay: [0.08, 0.12],       // moderate resource decay
    lenScale: [20, 35],        // compact segment lengths
  },
  hiddenTraits: {
    budActivationThreshold: 0.3,
    shadeTolerance: 0.7,
    apicalDominance: 1.2,      // strong top-down control
    internodeElasticity: 0.9,  // firm segments
    dormancyStrength: 0.6,     // enters dormancy readily
  },
  leafResourceYield: 0.8,
  seasonalRange: [0, 200],     // short "growing season"
  palette: {
    typicalRGB: [34, 139, 34], // forest green
    typicalShape: 0,           // circle/simple flower
    typicalMaterial: 0,        // matte
  },
};

/**
 * Zen Bamboo - Fast-growing, flexible grass
 * 
 * Characteristics:
 * - Rapid, vigorous growth
 * - Tall, straight stalks with sparse branching
 * - Light, airy appearance
 * - Symbol of resilience and adaptability
 * 
 * Cultural significance: Represents flexibility, strength through
 * adaptability, and continuous growth - valued in many Eastern traditions.
 */
export const zenBamboo: SpeciesDef = {
  id: "zen-bamboo",
  name: "Zen Bamboo",
  genus: "Phyllostachys",
  version: "1.0.0",
  traitRanges: {
    vigor: [0.8, 1.1],         // vigorous growth
    angle: [20, 35],           // wider branching angle
    decay: [0.04, 0.08],       // slower resource decay
    lenScale: [40, 60],        // long segments
  },
  hiddenTraits: {
    budActivationThreshold: 0.6,
    shadeTolerance: 0.4,       // prefers sun
    apicalDominance: 0.8,      // moderate top-down control
    internodeElasticity: 1.1,  // flexible segments
    dormancyStrength: 0.2,     // reluctant to dormancy
  },
  leafResourceYield: 1.2,
  seasonalRange: [0, 300],     // long growing season
  palette: {
    typicalRGB: [0, 128, 0], // vibrant green
    typicalShape: 1,           // daisy-like flower
    typicalMaterial: 0,        // matte
  },
};

/**
 * Sakura Orchid - Flowering plant with ornamental value
 * 
 * Characteristics:
 * - Moderate growth with abundant flowers
 * - Diverse flower shapes and colors
 * - Seasonal blooming cycles
 * - Decorative, aesthetic focus
 * 
 * Cultural significance: Represents beauty, renewal, and the transient
 * nature of blossoming - the Japanese concept of mono no aware.
 */
export const sakuraOrchid: SpeciesDef = {
  id: "sakura-orchid",
  name: "Sakura Orchid",
  genus: "Prunus",
  version: "1.0.0",
  traitRanges: {
    vigor: [0.5, 0.9],         // moderate growth
    angle: [25, 40],           // varied branching
    decay: [0.08, 0.15],       // faster resource consumption
    lenScale: [25, 45],        // medium segment lengths
  },
  hiddenTraits: {
    budActivationThreshold: 0.5,
    shadeTolerance: 0.5,       // moderate shade tolerance
    apicalDominance: 1.0,      // balanced control
    internodeElasticity: 1.0,  // standard elasticity
    dormancyStrength: 0.4,     // moderate dormancy
  },
  leafResourceYield: 1.0,
  seasonalRange: [0, 250],     // medium growing season
  palette: {
    typicalRGB: [219, 112, 147], // pink/magenta
    typicalShape: 2,           // spiral/complex flower
    typicalMaterial: 1,        // neon (for visual variety)
  },
};

/**
 * Momiji (Acer Palmatum) - Japanese Mountain Maple
 * Known for its delicate palmate leaves, architectural balance, and fiery autumn color changes.
 */
export const acerPalmatum: SpeciesDef = {
  id: "acer-palmatum",
  name: "Momiji Ahorn (Acer)",
  genus: "Acer",
  version: "1.0.0",
  traitRanges: {
    vigor: [0.65, 0.85],
    angle: [28, 42],
    decay: [0.06, 0.10],
    lenScale: [22, 38],
  },
  hiddenTraits: {
    budActivationThreshold: 0.35,
    shadeTolerance: 0.65,
    apicalDominance: 0.95,
    internodeElasticity: 0.85,
    dormancyStrength: 0.55,
  },
  leafResourceYield: 1.1,
  seasonalRange: [0, 240],
  palette: {
    typicalRGB: [194, 65, 12], // warm vermilion / autumn maple
    typicalShape: 1,
    typicalMaterial: 0,
  },
};

/**
 * Kengai (Cascade Juniper) - Classic weeping cliffside bonsai
 * Features dramatic descending branches that arch gracefully below the planter rim.
 */
export const kengaiCascade: SpeciesDef = {
  id: "kengai-cascade",
  name: "Kengai Kaskade (Juniperus)",
  genus: "Juniperus",
  version: "1.0.0",
  traitRanges: {
    vigor: [0.55, 0.75],
    angle: [38, 55],
    decay: [0.05, 0.09],
    lenScale: [18, 32],
  },
  hiddenTraits: {
    budActivationThreshold: 0.25,
    shadeTolerance: 0.8,
    apicalDominance: 0.7,
    internodeElasticity: 1.2,
    dormancyStrength: 0.7,
  },
  leafResourceYield: 0.9,
  seasonalRange: [0, 260],
  palette: {
    typicalRGB: [20, 83, 45], // deep jade juniper
    typicalShape: 0,
    typicalMaterial: 0,
  },
};

/**
 * Bunjingi (Literati Pine) - Poetic, slender, minimalist Japanese pine
 * Characterized by a sinuous, tall, bare trunk and a restrained, expressive crown.
 */
export const bunjingiPine: SpeciesDef = {
  id: "bunjingi-pine",
  name: "Bunjingi Literat (Pinus)",
  genus: "Pinus",
  version: "1.0.0",
  traitRanges: {
    vigor: [0.7, 0.9],
    angle: [14, 24],
    decay: [0.07, 0.11],
    lenScale: [35, 55],
  },
  hiddenTraits: {
    budActivationThreshold: 0.45,
    shadeTolerance: 0.5,
    apicalDominance: 1.6, // strong apical drive
    internodeElasticity: 0.7,
    dormancyStrength: 0.8,
  },
  leafResourceYield: 0.75,
  seasonalRange: [0, 210],
  palette: {
    typicalRGB: [47, 79, 79], // slate pine green
    typicalShape: 0,
    typicalMaterial: 0,
  },
};

export const SPECIES: SpeciesDef[] = [
  japaneseBonsai,
  acerPalmatum,
  kengaiCascade,
  bunjingiPine,
  sakuraOrchid,
  zenBamboo,
];

/**
 * Get a species definition by ID.
 * 
 * @param id Species ID
 * @returns Species definition or undefined if not found
 */
export function getSpeciesById(id: string): SpeciesDef | undefined {
  const speciesMap: Record<string, SpeciesDef> = {
    "japanese-bonsai": japaneseBonsai,
    "acer-palmatum": acerPalmatum,
    "kengai-cascade": kengaiCascade,
    "bunjingi-pine": bunjingiPine,
    "sakura-orchid": sakuraOrchid,
    "zen-bamboo": zenBamboo,
  };
  return speciesMap[id];
}

/**
 * Generate a genome for a given species using a deterministic PRNG.
 * The seed ensures reproducible results - same seed + same species = same plant.
 * 
 @param species Species definition to generate genome for
 @param seed Seed for deterministic PRNG (optional, defaults to Date.now())
 @returns New genome within species trait ranges
 */
export function generateGenomeForSpecies(
  species: SpeciesDef,
  seed?: number
): Genome {
  const prng = createPrng(seed ?? Date.now());
  
  const randAlleles = (min: number, max: number): [number, number] => [
    prng.float(min, max),
    prng.float(min, max),
  ];
  const randIntAlleles = (min: number, max: number): [number, number] => [
    prng.int(min, max),
    prng.int(min, max),
  ];

  const typicalRGB = species.palette.typicalRGB;
  const rgbJitter = () => prng.int(-15, 15);
  const genRGB = (): [number, number, number] => [
    Math.max(0, Math.min(255, typicalRGB[0] + rgbJitter())),
    Math.max(0, Math.min(255, typicalRGB[1] + rgbJitter())),
    Math.max(0, Math.min(255, typicalRGB[2] + rgbJitter())),
  ];

  let leafShape = prng.int(0, 6);
  let inflorescence = species.palette.typicalShape;
  let barkRoughness = 0.3;
  let thornDensity = 0.0;
  let vineMode = 0.0;
  let petalCount = 5;
  let sepalCount = 5;
  let stamenCount = 8;
  let symmetry = 0;
  let curl = 0.2;
  let stiffness = 1.0;

  if (species.id === "japanese-bonsai") {
    leafShape = prng.random() < 0.6 ? 4 : 2;
    inflorescence = 0;
    barkRoughness = prng.float(0.4, 0.7);
    thornDensity = prng.float(0.0, 0.1);
    vineMode = 0.0;
    petalCount = prng.int(4, 6);
    sepalCount = 5;
    stamenCount = prng.int(6, 10);
    symmetry = 0;
    curl = prng.float(0.2, 0.5);
    stiffness = prng.float(1.1, 1.7);
  } else if (species.id === "zen-bamboo") {
    leafShape = prng.random() < 0.7 ? 0 : 1;
    inflorescence = 3;
    barkRoughness = prng.float(0.1, 0.25);
    thornDensity = 0.0;
    vineMode = prng.float(0.0, 0.05);
    petalCount = 3;
    sepalCount = 3;
    stamenCount = 6;
    symmetry = 0;
    curl = prng.float(0.0, 0.15);
    stiffness = prng.float(0.9, 1.4);
  } else if (species.id === "sakura-orchid") {
    leafShape = prng.random() < 0.5 ? 5 : 6;
    inflorescence = prng.random() < 0.5 ? 1 : 2;
    barkRoughness = prng.float(0.15, 0.35);
    thornDensity = 0.0;
    vineMode = prng.float(0.05, 0.2);
    petalCount = prng.int(5, 8);
    sepalCount = prng.int(4, 6);
    stamenCount = prng.int(8, 14);
    symmetry = prng.random() < 0.4 ? 1 : 0;
    curl = prng.float(0.1, 0.3);
    stiffness = prng.float(0.55, 1.0);
  }

  return {
    vigor: randAlleles(species.traitRanges.vigor[0], species.traitRanges.vigor[1]),
    angle: randIntAlleles(species.traitRanges.angle[0], species.traitRanges.angle[1]),
    decay: randAlleles(species.traitRanges.decay[0], species.traitRanges.decay[1]),
    lenScale: randIntAlleles(species.traitRanges.lenScale[0], species.traitRanges.lenScale[1]),
    flowerRGB: [genRGB(), genRGB()],
    flowerRadius: randIntAlleles(3, 8),
    flowerShape: [species.palette.typicalShape, species.palette.typicalShape],
    flowerStretch: [
      [prng.float(0.8, 1.3), prng.float(0.8, 1.3)],
      [prng.float(0.8, 1.3), prng.float(0.8, 1.3)],
    ],
    flowerMaterial: [species.palette.typicalMaterial, species.palette.typicalMaterial],
    budActivationThreshold: [species.hiddenTraits.budActivationThreshold, species.hiddenTraits.budActivationThreshold],
    shadeTolerance: [species.hiddenTraits.shadeTolerance, species.hiddenTraits.shadeTolerance],
    apicalDominance: [species.hiddenTraits.apicalDominance, species.hiddenTraits.apicalDominance],
    internodeElasticity: [species.hiddenTraits.internodeElasticity, species.hiddenTraits.internodeElasticity],
    dormancyStrength: [species.hiddenTraits.dormancyStrength, species.hiddenTraits.dormancyStrength],
    leafShape: [leafShape, leafShape],
    leafSize: randAlleles(0.8, 1.4),
    leafDensity: randAlleles(0.6, 0.85),
    inflorescence: [inflorescence, inflorescence],
    petalCount: [petalCount, petalCount],
    sepalCount: [sepalCount, sepalCount],
    stamenCount: [stamenCount, stamenCount],
    symmetry: [symmetry, symmetry],
    curl: [curl, curl],
    windSensitivity: randAlleles(0.3, 0.7),
    barkRoughness: [barkRoughness, barkRoughness],
    thornDensity: [thornDensity, thornDensity],
    vineMode: [vineMode, vineMode],
    stiffness: [stiffness, stiffness],
  };
}

