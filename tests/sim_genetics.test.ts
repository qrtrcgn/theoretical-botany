/**
 * Genetics Tests
 * 
 * Verifies genome generation, trait inheritance, crossover (breeding),
 * and mutation behaviors according to Mendelian diploid genetics contracts.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { createPrng } from "../src/sim/prng";
import { generateGenome, expressTrait, breedGenomes, mutateGenome } from "../src/sim/genetics";
import type { Genome } from "../src/sim/types";

describe("Genetics", () => {
  let prng: ReturnType<typeof createPrng>;

  beforeEach(() => {
    prng = createPrng(42);
  });

  describe("genome has all required fields", () => {
    it("genome has public traits within valid ranges", () => {
      const genome: Genome = generateGenome(prng);

      // Validate public traits
      expect(genome.vigor[0]).toBeGreaterThanOrEqual(0.6);
      expect(genome.vigor[0]).toBeLessThanOrEqual(1.4);
      expect(genome.vigor[1]).toBeGreaterThanOrEqual(0.6);
      expect(genome.vigor[1]).toBeLessThanOrEqual(1.4);

      expect(genome.angle[0]).toBeGreaterThanOrEqual(15);
      expect(genome.angle[0]).toBeLessThanOrEqual(55);
      expect(genome.angle[1]).toBeGreaterThanOrEqual(15);
      expect(genome.angle[1]).toBeLessThanOrEqual(55);

      expect(genome.decay[0]).toBeGreaterThanOrEqual(0.05);
      expect(genome.decay[0]).toBeLessThanOrEqual(0.15);
      expect(genome.lenScale[0]).toBeGreaterThanOrEqual(20);
      expect(genome.lenScale[0]).toBeLessThanOrEqual(50);

      // Validate flower RGB
      expect(genome.flowerRGB[0][0]).toBeGreaterThanOrEqual(0);
      expect(genome.flowerRGB[0][0]).toBeLessThanOrEqual(255);
      expect(genome.flowerRGB[0][1]).toBeGreaterThanOrEqual(0);
      expect(genome.flowerRGB[0][1]).toBeLessThanOrEqual(255);
      expect(genome.flowerRGB[0][2]).toBeGreaterThanOrEqual(0);
      expect(genome.flowerRGB[0][2]).toBeLessThanOrEqual(255);

      // Validate flower radius
      expect(genome.flowerRadius[0]).toBeGreaterThanOrEqual(3);
      expect(genome.flowerRadius[0]).toBeLessThanOrEqual(12);

      // Validate flower shape index
      expect(genome.flowerShape[0]).toBeGreaterThanOrEqual(0);
      expect(genome.flowerShape[0]).toBeLessThanOrEqual(5);

      // Validate flower stretch
      expect(genome.flowerStretch[0][0]).toBeGreaterThanOrEqual(0.5);
      expect(genome.flowerStretch[0][0]).toBeLessThanOrEqual(2.0);

      // Validate hidden traits
      expect(genome.budActivationThreshold[0]).toBeGreaterThanOrEqual(0.1);
      expect(genome.budActivationThreshold[0]).toBeLessThanOrEqual(0.9);
      expect(genome.shadeTolerance[0]).toBeGreaterThanOrEqual(0.2);
      expect(genome.shadeTolerance[0]).toBeLessThanOrEqual(0.8);
      expect(genome.apicalDominance[0]).toBeGreaterThanOrEqual(0.5);
      expect(genome.apicalDominance[0]).toBeLessThanOrEqual(1.5);
      expect(genome.internodeElasticity[0]).toBeGreaterThanOrEqual(0.8);
      expect(genome.internodeElasticity[0]).toBeLessThanOrEqual(1.2);
      expect(genome.dormancyStrength[0]).toBeGreaterThanOrEqual(0.1);
      expect(genome.dormancyStrength[0]).toBeLessThanOrEqual(0.9);
    });

    it("expresses phenotypic traits correctly", () => {
      const genome = generateGenome(prng);
      const expressedVigor = expressTrait(genome, "vigor");
      expect(expressedVigor).toBe(Math.max(genome.vigor[0], genome.vigor[1]));

      const expressedColor = expressTrait(genome, "flowerRGB");
      expect(expressedColor).toEqual(genome.flowerRGB[0]);
    });
  });

  describe("genome serialization and hydration", () => {
    it("genome can be serialized to JSON and hydrated", () => {
      const genome: Genome = generateGenome(prng);

      // Serialize to JSON
      const jsonStr = JSON.stringify(genome);
      const hydrated = JSON.parse(jsonStr) as Genome;

      // Validate hydration
      expect(hydrated.vigor).toEqual(genome.vigor);
      expect(hydrated.angle).toEqual(genome.angle);
      expect(hydrated.decay).toEqual(genome.decay);
      expect(hydrated.lenScale).toEqual(genome.lenScale);
      expect(hydrated.flowerRGB).toEqual(genome.flowerRGB);
      expect(hydrated.flowerRadius).toEqual(genome.flowerRadius);
      expect(hydrated.flowerShape).toEqual(genome.flowerShape);
      expect(hydrated.flowerStretch).toEqual(genome.flowerStretch);
      expect(hydrated.flowerMaterial).toEqual(genome.flowerMaterial);
      expect(hydrated.budActivationThreshold).toEqual(genome.budActivationThreshold);
      expect(hydrated.shadeTolerance).toEqual(genome.shadeTolerance);
      expect(hydrated.apicalDominance).toEqual(genome.apicalDominance);
      expect(hydrated.internodeElasticity).toEqual(genome.internodeElasticity);
      expect(hydrated.dormancyStrength).toEqual(genome.dormancyStrength);
    });

    it("genome preserves type constraints after hydration", () => {
      const genome: Genome = generateGenome(prng);
      const jsonStr = JSON.stringify(genome);
      const hydrated = JSON.parse(jsonStr) as Genome;

      expect(hydrated.vigor[0]).toBeCloseTo(genome.vigor[0], 2);
      expect(hydrated.decay[0]).toBeCloseTo(genome.decay[0], 3);
      expect(hydrated.budActivationThreshold[0]).toBeCloseTo(genome.budActivationThreshold[0], 2);
      expect(hydrated.shadeTolerance[0]).toBeCloseTo(genome.shadeTolerance[0], 2);
    });
  });

  describe("genetic inheritance from parent genomes", () => {
    it("offspring inherits alleles from parents via Mendelian crossover", () => {
      const p1Prng = createPrng(100);
      const p2Prng = createPrng(200);
      const parent1Genome: Genome = generateGenome(p1Prng);
      const parent2Genome: Genome = generateGenome(p2Prng);

      const offspring = breedGenomes(parent1Genome, parent2Genome, prng);

      // For every trait, each offspring allele must come from either parent 1 or parent 2
      const possibleVigors = [
        parent1Genome.vigor[0], parent1Genome.vigor[1],
        parent2Genome.vigor[0], parent2Genome.vigor[1]
      ];
      expect(possibleVigors).toContain(offspring.vigor[0]);
      expect(possibleVigors).toContain(offspring.vigor[1]);

      const possibleAngles = [
        parent1Genome.angle[0], parent1Genome.angle[1],
        parent2Genome.angle[0], parent2Genome.angle[1]
      ];
      expect(possibleAngles).toContain(offspring.angle[0]);
      expect(possibleAngles).toContain(offspring.angle[1]);
    });

    it("mutates genome within valid bounds", () => {
      const base = generateGenome(prng);
      const mutPrng = createPrng(999);
      const mutated = mutateGenome(base, mutPrng, 1.0); // 100% mutation rate

      expect(mutated).toBeDefined();
      expect(mutated.vigor[0]).toBeGreaterThan(0);
      expect(mutated.angle[0]).toBeGreaterThan(0);
      expect(mutated.lenScale[0]).toBeGreaterThan(0);
    });
  });
});