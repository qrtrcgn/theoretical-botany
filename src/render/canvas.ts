import type { PlantState, PlantNode } from "../sim/types";
import { expressTrait } from "../sim/genetics";
import { renderWoodBarkTexture } from "./textures";
import { drawModularLeaf, drawModularFlower } from "./morphology";

/**
 * ZenPlant - Masterpiece Bonsai Renderer with Accurate Dynamic Node Displacement Tracking
 */

let globalNodeDisp = new Map<number, { wx: number; wy: number; angle: number }>();

export function renderPlant(ctx: CanvasRenderingContext2D, state: PlantState, w: number, h: number): string {
  ctx.clearRect(0, 0, w, h);
  
  // 1. Atmosphere & Soft Gradient Background (Zen Garden Dusk/Dawn)
  const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
  if (state.darkMode) {
    bgGrad.addColorStop(0, "#090d16");
    bgGrad.addColorStop(0.5, "#111827");
    bgGrad.addColorStop(1, "#1f2937");
  } else {
    bgGrad.addColorStop(0, "#fafaf9");
    bgGrad.addColorStop(0.5, "#f5f5f4");
    bgGrad.addColorStop(1, "#e7e5e4");
  }
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  // 2. Soft Ambient Occlusion Floor Shadow & Ceramic Bonsai Pot
  ctx.save();
  const ox = w / 2 + (state.cameraX ?? 0);
  const oy = h * 0.82 + (state.cameraY ?? 0);
  const zoom = state.cameraZoom ?? 1.0;
  const baseScale = Math.min(w / 400, h / 500);
  const scale = baseScale * zoom;

  ctx.translate(ox, oy);

  // Ground shadow ellipse
  ctx.fillStyle = state.darkMode ? "rgba(0, 0, 0, 0.6)" : "rgba(0, 0, 0, 0.15)";
  ctx.beginPath();
  ctx.ellipse(0, 22, 110, 22, 0, 0, Math.PI * 2);
  ctx.fill();

  // Ceramic Pot / Planter
  ctx.fillStyle = state.darkMode ? "#1e293b" : "#44403c";
  ctx.beginPath();
  ctx.roundRect(-85, 2, 170, 36, [6, 6, 16, 16]);
  ctx.fill();

  ctx.strokeStyle = state.darkMode ? "#334155" : "#292524";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.strokeStyle = state.darkMode ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(-88, 0, 176, 8, [4]);
  ctx.stroke();

  ctx.scale(scale, scale);

  const g = state.genome;

  // 3. Gravitational Weight & Bending Calculation
  const childrenByParent = new Map<number | null, PlantNode[]>();
  for (const n of state.nodes) {
    const arr = childrenByParent.get(n.parentId);
    if (arr) arr.push(n);
    else childrenByParent.set(n.parentId, [n]);
  }

  const weightCache = new Map<number, number>();
  const sagCache = new Map<number, number>();

  for (let i = state.nodes.length - 1; i >= 0; i--) {
    const n = state.nodes[i];
    let w = (n.type === "leaf" ? 0.6 : n.type === "flower" ? 1.0 : 0.04 * n.length);
    const kids = childrenByParent.get(n.id) ?? [];
    for (const c of kids) {
      w += weightCache.get(c.id) ?? 0;
    }
    weightCache.set(n.id, w);

    if (n.type === "stem" || n.type === "meristem") {
      const stiffness = Math.max(0.1, expressTrait(g, "stiffness") * Math.pow(0.82, n.depth));
      const sag = Math.min(0.65, (w * 0.012) / stiffness);
      sagCache.set(n.id, sag);
    }
  }

  // 4. Render Woody Stems with Gravitational Sag & Taper and Track Precise Displacement
  globalNodeDisp.clear();
  globalNodeDisp.set(0, { wx: state.root.x, wy: state.root.y, angle: state.root.angle });

  for (const n of state.nodes) {
    if (n.type === "stem" || n.type === "meristem") {
      const parentDisp = n.parentId !== null ? globalNodeDisp.get(n.parentId) : undefined;
      const startX = parentDisp ? parentDisp.wx : n.x;
      const startY = parentDisp ? parentDisp.wy : n.y;
      
      const sag = sagCache.get(n.id) ?? 0;
      const effectiveAngle = n.angle + sag * 0.4;

      const endX = startX + Math.cos(effectiveAngle) * n.length;
      const endY = startY + Math.sin(effectiveAngle) * n.length + sag * n.length * 0.7;

      globalNodeDisp.set(n.id, { wx: endX, wy: endY, angle: effectiveAngle });

      const wood = Math.min(1, n.age / 30);
      const r = Math.round(70 * wood + 38 * (1 - wood));
      const gr = Math.round(38 * wood + 22 * (1 - wood));
      const b = Math.round(18 * wood + 10 * (1 - wood));

      const depthFactor = Math.max(0.3, 1.0 - (n.depth / 6) * 0.5);
      const thickness = Math.max(2.0, (12.0 * depthFactor) * Math.pow(0.85, n.depth));

      // Branch drop shadow
      ctx.strokeStyle = state.darkMode ? "rgba(0, 0, 0, 0.45)" : "rgba(40, 25, 15, 0.25)";
      ctx.lineWidth = thickness + 2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(startX + 2, startY + 2);
      ctx.lineTo(endX + 2, endY + 2);
      ctx.stroke();
      // Main branch stroke
      ctx.strokeStyle = `rgb(${r},${gr},${b})`;
      ctx.lineWidth = thickness;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      renderWoodBarkTexture(ctx, startX, startY, endX, endY, thickness, wood);
    }
  }

  // 5. Render Vibrant Multi-Hue Leaves & Flowers with Seasonal Variation
  const leafTypes = ["simple", "palmate", "pinnate", "lobed", "needle"] as const;
  const flowerTypes = ["solitary", "raceme", "umbel", "panicle", "compound"] as const;

  const leafTrait = expressTrait(g, "leafShape") || 0;
  const selectedLeafMorphology = leafTypes[Math.abs(leafTrait) % leafTypes.length];

  const inflorescenceTrait = expressTrait(g, "inflorescence");
  const selectedFlowerMorphology = flowerTypes[Math.abs(inflorescenceTrait) % flowerTypes.length];

  const flowerRGB = expressTrait(g, "flowerRGB") || [236, 72, 153];
  const basePetalColor = `rgb(${flowerRGB[0]}, ${flowerRGB[1]}, ${flowerRGB[2]})`;

  const seedHash = Math.abs(JSON.stringify(g).split("").reduce((acc, char) => acc + char.charCodeAt(0), 0));
  const rareExoticRoll = seedHash % 100;
  const baseHue = rareExoticRoll < 10 ? 35 : rareExoticRoll < 18 ? 340 : rareExoticRoll < 25 ? 270 : 90 + (seedHash % 120);

  for (const n of state.nodes) {
    if (n.type === "leaf" && n.fallState !== "falling") {
      const parentDisp = globalNodeDisp.get(n.parentId ?? 0) ?? { wx: n.x, wy: n.y, angle: n.angle };
      ctx.save();
      const maturity = Math.min(1.0, (n.age ?? 1) / 5.0);
      ctx.translate(parentDisp.wx, parentDisp.wy);
      ctx.rotate(parentDisp.angle + (n.id % 2 === 0 ? 0.7 : -0.7));
      ctx.scale(maturity, maturity);

      const leafHueOffset = ((Math.abs(n.id * 17) % 25) - 12);
      const currentHue = (baseHue + leafHueOffset + 360) % 360;
      const activeBase = state.darkMode ? `hsl(${currentHue}, 50%, ${28 + (n.id % 6)}%)` : `hsl(${currentHue}, 55%, ${38 + (n.id % 6)}%)`;
      const activeTip = state.darkMode ? `hsl(${currentHue}, 60%, ${45 + (n.id % 6)}%)` : `hsl(${currentHue}, 65%, ${52 + (n.id % 6)}%)`;

      drawModularLeaf(ctx, selectedLeafMorphology, 14, activeBase, activeTip);
      ctx.restore();
    } else if (n.type === "flower") {
      const parentDisp = globalNodeDisp.get(n.parentId ?? 0) ?? { wx: n.x, wy: n.y, angle: n.angle };
      ctx.save();
      ctx.translate(parentDisp.wx, parentDisp.wy);
      
      const isPolyploid = Math.abs(n.id * 13) % 11 === 0;
      const flowerScale = isPolyploid ? 1.4 : 1.0;
      ctx.scale(flowerScale, flowerScale);

      const petalCount = expressTrait(g, "petalCount") || 5;
      drawModularFlower(ctx, selectedFlowerMorphology, petalCount + (isPolyploid ? 2 : 0), 10, basePetalColor, "#facc15");
      ctx.restore();
    }
  }

  ctx.restore();
  return "Masterpiece Bonsai · " + (state.darkMode ? "Night" : "Day");
}

export function computeTransform(w: number, h: number, showRoots: boolean, cameraX = 0, cameraY = 0, cameraZoom = 1.0) {
  const baseScale = Math.min(w / 400, h / (showRoots ? 650 : 500));
  const scale = baseScale * cameraZoom;
  const ox = w / 2 + cameraX;
  const oy = (showRoots ? h * 0.6 : h * 0.82) + cameraY;
  return { scale, ox, oy };
}

export function seasonOf(step: number, cycleLength: number = 250): { name: string; color: string; season: number } {
  const season = step % cycleLength;
  if (season <= 100) return { name: "Frühling", color: "#f59e0b", season };
  if (season <= 140) return { name: "Sommer", color: "#10b981", season };
  if (season <= 180) return { name: "Herbst", color: "#ea580c", season };
  return { name: "Winter", color: "#94a3b8", season };
}

export function getWindDisp() {
  return globalNodeDisp;
}
