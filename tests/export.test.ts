import { describe, it, expect } from "bun:test";
import { createPrng } from "../src/sim/prng";
import { freshState, growOnce } from "../src/sim/growth";
import { japaneseBonsai, generateGenomeForSpecies } from "../src/data/species";
import { exportPlantJSON, importPlantJSON, exportGenomeJSON, plantToSVG } from "../src/export/plugin";

describe("Export", () => {
  it("roundtrips plant state through JSON", () => {
    const genome = generateGenomeForSpecies(japaneseBonsai, 42);
    const prng = createPrng(42);
    let s = freshState(genome, japaneseBonsai, { seed: 42 });
    for (let i = 0; i < 5; i++) s = growOnce(s, prng);
    const json = exportPlantJSON(s);
    const back = importPlantJSON(json);
    expect(back.step).toBe(s.step);
    expect(back.nodes.length).toBe(s.nodes.length);
    expect(back.genome.vigor).toEqual(s.genome.vigor);
  });
  it("roundtrips genome JSON", () => {
    const genome = generateGenomeForSpecies(japaneseBonsai, 7);
    const json = exportGenomeJSON(genome, japaneseBonsai.id);
    const parsed = JSON.parse(json);
    expect(parsed.genome.vigor).toEqual(genome.vigor);
    expect(parsed.speciesId).toBe(japaneseBonsai.id);
    expect(parsed.version).toBe("1.0.0");
  });
  it("produces valid SVG snapshot", () => {
    const genome = generateGenomeForSpecies(japaneseBonsai, 42);
    const prng = createPrng(42);
    let s = freshState(genome, japaneseBonsai, { seed: 42 });
    for (let i = 0; i < 8; i++) s = growOnce(s, prng);
    const svg = plantToSVG(s, 400, 500);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.includes("</svg>")).toBe(true);
    expect(svg.includes("<line") || svg.includes("<circle") || svg.includes("<ellipse") || svg.includes("<path")).toBe(true);
  });
});
