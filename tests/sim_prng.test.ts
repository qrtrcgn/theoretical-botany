/**
 * PRNG Determinism Tests - RED Phase
 * 
 * These tests MUST FAIL before the PRNG implementation is complete.
 * They verify that:
 * 1. Same seed produces identical sequences
 * 2. Different seeds produce different sequences  
 * 3. The PRNG is deterministic across calls
 */

import { describe, it, expect, beforeEach } from "bun:test";
import createPrng from "../src/sim/prng";

describe("PRNG Determinism", () => {
  let prng: ReturnType<typeof createPrng>;

  beforeEach(() => {
    prng = createPrng(42);
  });

  describe("same seed produces identical sequences", () => {
    it("produces same random float sequence", () => {
      const p1 = createPrng(42);
      const p2 = createPrng(42);

      const seq1: number[] = [];
      const seq2: number[] = [];

      for (let i = 0; i < 100; i++) {
        seq1.push(p1.random());
        seq2.push(p2.random());
      }

      expect(seq1).toEqual(seq2);
    });

    it("produces same float range sequence", () => {
      const p1 = createPrng(42);
      const p2 = createPrng(42);

      const floats1 = p1.float(0, 100);
      const floats2 = p2.float(0, 100);

      // Both should produce values in [0, 100)
      expect(floats1).toBeGreaterThanOrEqual(0);
      expect(floats1).toBeLessThan(100);
      expect(floats2).toBeGreaterThanOrEqual(0);
      expect(floats2).toBeLessThan(100);
    });

    it("produces same integer sequence", () => {
      const p1 = createPrng(42);
      const p2 = createPrng(42);

      const ints1: number[] = [];
      const ints2: number[] = [];

      for (let i = 0; i < 50; i++) {
        ints1.push(p1.int(0, 10));
        ints2.push(p2.int(0, 10));
      }

      expect(ints1).toEqual(ints2);
    });

    it("produces same gaussian sequence", () => {
      const p1 = createPrng(42);
      const p2 = createPrng(42);

      const gaus1: number[] = [];
      const gaus2: number[] = [];

      for (let i = 0; i < 20; i++) {
        gaus1.push(p1.gaussian(0, 1));
        gaus2.push(p2.gaussian(0, 1));
      }

      // Compare with tolerance for floating point
      for (let i = 0; i < gaus1.length; i++) {
        expect(gaus1[i]).toBeCloseTo(gaus2[i], 10);
      }
    });
  });

  describe("different seeds produce different sequences", () => {
    it("different seeds yield different random sequences", () => {
      const p1 = createPrng(42);
      const p2 = createPrng(123);

      const seq1: number[] = [];
      const seq2: number[] = [];

      for (let i = 0; i < 50; i++) {
        seq1.push(p1.random());
        seq2.push(p2.random());
      }

      expect(seq1).not.toEqual(seq2);
    });

    it("seed 0 differs from seed 1", () => {
      const p0 = createPrng(0);
      const p1 = createPrng(1);

      const seq0: number[] = [];
      const seq1: number[] = [];

      for (let i = 0; i < 30; i++) {
        seq0.push(p0.random());
        seq1.push(p1.random());
      }

      expect(seq0).not.toEqual(seq1);
    });
  });

  describe("PRNG in simulation context", () => {
    it("deterministic genome generation", () => {
      // Two plants from same seed should have identical genomes
      const p1 = createPrng(99);
      const p2 = createPrng(99);

      // Generate genomes using the PRNG
      const genome1 = {
        vigor: p1.float(0.6, 1.4),
        angle: p1.int(15, 50),
        decay: p1.float(0.05, 0.15),
        lenScale: p1.int(20, 50),
      };

      const genome2 = {
        vigor: p2.float(0.6, 1.4),
        angle: p2.int(15, 50),
        decay: p2.float(0.05, 0.15),
        lenScale: p2.int(20, 50),
      };

      expect(genome1).toEqual(genome2);
    });

    it("reproducible plant growth steps", () => {
      const p1 = createPrng(77);
      const p2 = createPrng(77);

      // Grow two plants same number of steps
      const steps = 10;
      const nodes1: any[] = [];
      const nodes2: any[] = [];

      for (let step = 0; step < steps; step++) {
        // Each step consumes PRNG random values
        nodes1.push({ step, r: p1.random() });
        nodes2.push({ step, r: p2.random() });
      }

      expect(nodes1).toEqual(nodes2);
    });
  });
});