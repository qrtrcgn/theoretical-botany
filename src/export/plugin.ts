import type { Genome, PlantState } from "../sim/types";
import { expressTrait } from "../sim/genetics";

export const PLUGIN_VERSION = "1.0.0";

export function exportPlantJSON(state: PlantState): string {
  return JSON.stringify({
    version: PLUGIN_VERSION,
    step: state.step,
    cycleLength: state.cycleLength,
    idCounter: state.idCounter,
    genome: state.genome,
    speciesId: state.speciesId ?? "unknown",
    resources: state.resources,
    environment: state.environment,
    nodes: state.nodes,
  });
}

export function importPlantJSON(json: string): PlantState {
  const d = JSON.parse(json);

  if (!d || typeof d !== "object") {
    throw new Error("Invalid JSON: Root must be an object");
  }

  if (!Array.isArray(d.nodes) || d.nodes.length === 0) {
    throw new Error("Invalid Plant Data: No nodes found");
  }

  if (!d.genome || typeof d.genome !== "object") {
    throw new Error("Invalid Plant Data: Missing genome");
  }

  return {
    idCounter: typeof d.idCounter === "number" ? d.idCounter : 0,
    step: typeof d.step === "number" ? d.step : 0,
    cycleLength: typeof d.cycleLength === "number" ? d.cycleLength : 200,
    root: d.nodes[0],
    nodes: d.nodes,
    genome: d.genome,
    speciesId: d.speciesId || "unknown",
    resources: d.resources || { energy: 0, water: 0, structural: 0 },
    environment: d.environment || { lightDirection: [1, 0], gravity: 0.1, seasonIndex: 0, temperature: 20 },
    greenhouse: [],
    selectedSlots: [],
    windTime: 0,
    darkMode: true,
    showRoots: false,
    woodTexture: false,
    particles: [],
    cutAnimTime: 0,
    cameraX: 0,
    cameraY: 0,
    cameraZoom: 1,
    growSpeed: 1,
    timelapseFrames: [],
    isRecording: false,
  } as PlantState;
}

export function exportGenomeJSON(genome: Genome, speciesId: string): string {
  return JSON.stringify({ version: PLUGIN_VERSION, speciesId, genome });
}

export function plantToSVG(state: PlantState, w = 400, h = 500): string {
  const ox = w / 2, oy = h - 40;
  const g = state.genome;
  const bg = state.darkMode ? "#050508" : "#f8f4e8";
  const season = state.step % state.cycleLength;
  const parts: string[] = [];
  const fmt = (v: number): string => (Number.isFinite(v) ? v.toFixed(1) : "0.0");
  for (const n of state.nodes) {
    if (n.type === "root" && !state.showRoots) continue;
    const len = n.length || n.targetLength || 0;
    const ex = n.x + Math.cos(n.angle) * len;
    const ey = n.y + Math.sin(n.angle) * len;
    const falling = n.fallState === "falling";
    const op = falling ? ` opacity="0.45"` : "";
    if (n.type === "stem" || (n as { type: string }).type === "meristem") {
      const wood = Math.min(1, n.age / 50);
      const r = Math.round(140 * wood + 38 * (1 - wood));
      const gg = Math.round(69 * wood + 173 * (1 - wood));
      const b = Math.round(18 * wood + 97 * (1 - wood));
      const thick = Math.max(0.6, 3.2 * Math.pow(0.72, n.depth)).toFixed(2);
      const mx = (n.x + ex) / 2;
      const my = (n.y + ey) / 2;
      const perpX = -(ey - n.y);
      const perpY = ex - n.x;
      const clen = Math.sqrt(perpX * perpX + perpY * perpY) || 1;
      const cx = mx + (perpX / clen) * n.curve * len * 0.4;
      const cy = my + (perpY / clen) * n.curve * len * 0.4;
      parts.push(`<path d="M${fmt(ox + n.x)} ${fmt(oy + n.y)} Q${fmt(ox + cx)} ${fmt(oy + cy)} ${fmt(ox + ex)} ${fmt(oy + ey)}" stroke="rgb(${r},${gg},${b})" stroke-width="${thick}" fill="none" stroke-linecap="round"${op}/>`);
      if (n.isCut) {
        parts.push(`<line x1="${fmt(ox + ex - 3)}" y1="${fmt(oy + ey)}" x2="${fmt(ox + ex + 3)}" y2="${fmt(oy + ey)}" stroke="#ffbb00" stroke-width="${(Number(thick) + 1).toFixed(2)}" stroke-linecap="round"/>`);
      }
      if (n.hasThorns) {
        for (let t = 0; t < 3; t++) {
          const frac = (t + 1) / 4;
          const tx = ox + n.x + (ex - n.x) * frac;
          const ty = oy + n.y + (ey - n.y) * frac;
          const side = t % 2 === 0 ? 1 : -1;
          parts.push(`<circle cx="${fmt(tx)}" cy="${fmt(ty)}" r="${(0.9 + side * 0.1).toFixed(1)}" fill="#5D4037"${op}/>`);
        }
      }
    } else if (n.type === "leaf") {
      let c = "#2ecc71";
      if (season > 140 && season <= 180) c = season - 140 > 20 ? "#e67e22" : "#f1c40f";
      else if (season > 180) c = "#8b6914";
      else if (n.leafHueShift > 5) c = "#3ddc84";
      else if (n.leafHueShift < -5) c = "#1fa855";
      const rx = Math.max(0.5, (n.length * expressTrait(g, "leafSize") * (n.leafSizeJitter || 1)) / 2);
      const ry = Math.max(0.3, rx / 2.4);
      parts.push(`<ellipse cx="${fmt(ox + n.x)}" cy="${fmt(oy + n.y)}" rx="${fmt(rx)}" ry="${fmt(ry)}" fill="${c}" transform="rotate(${(n.angle * 180 / Math.PI).toFixed(1)} ${fmt(ox + n.x)} ${fmt(oy + n.y)})"${op}/>`);
    } else if (n.type === "flower") {
      if (n.fruitAge > 0) {
        const prog = Math.min(1, n.fruitAge / 100);
        const fr = Math.round(80 + prog * 120);
        const fg = Math.round(120 - prog * 80);
        const fb = Math.round(40 - prog * 20);
        const frR = Math.min(5, 3 + n.fruitAge * 0.02).toFixed(1);
        parts.push(`<circle cx="${fmt(ox + n.x)}" cy="${fmt(oy + n.y)}" r="${frR}" fill="rgb(${fr},${fg},${fb})"${op}/>`);
      } else {
        const radius = expressTrait(g, "flowerRadius");
        const rgb = expressTrait(g, "flowerRGB") as [number, number, number];
        parts.push(`<circle cx="${fmt(ox + n.x)}" cy="${fmt(oy + n.y)}" r="${radius}" fill="rgb(${rgb[0]},${rgb[1]},${rgb[2]})"${op}/>`);
        for (let i = 0; i < Math.min(expressTrait(g, "petalCount"), 12); i++) {
          const a = (i / Math.min(expressTrait(g, "petalCount"), 12)) * Math.PI * 2;
          const px = ox + n.x + Math.cos(a) * radius * 0.9;
          const py = oy + n.y + Math.sin(a) * radius * 0.9;
          parts.push(`<circle cx="${fmt(px)}" cy="${fmt(py)}" r="${(radius * 0.45).toFixed(1)}" fill="rgb(${rgb[0]},${rgb[1]},${rgb[2]})" opacity="0.85"/>`);
        }
      }
    } else if (n.type === "bud") {
      parts.push(`<circle cx="${fmt(ox + n.x)}" cy="${fmt(oy + n.y)}" r="2" fill="#f39c12"${op}/>`);
    } else if (n.type === "root") {
      parts.push(`<line x1="${fmt(ox + n.x)}" y1="${fmt(oy + n.y)}" x2="${fmt(ox + ex)}" y2="${fmt(oy + ey)}" stroke="#8B7355" stroke-width="${Math.max(0.3, 2 * Math.pow(0.7, n.depth)).toFixed(2)}" stroke-linecap="round"/>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${bg}"/>${parts.join("")}</svg>`;
}
