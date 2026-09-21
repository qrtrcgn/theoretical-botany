import type { PlantState, PlantNode, WateringCanState, WaterStreamJet } from "../sim/types";
import { expressTrait } from "../sim/genetics";
import { renderWoodBarkTexture } from "./textures";
import { drawModularLeaf, drawModularFlower } from "./morphology";

/**
 * ZenPlant Masterpiece Bonsai Renderer
 * 
 * Synthesizes:
 * - Leonardo da Vinci Area-Preserving Branch Thickness (r_parent^2 = r_tip^2 + sum r_child^2)
 * - Continuous Gravitational Sag & Smooth Quadratic Bézier Curvature (ctx.quadraticCurveTo)
 * - Fine sub-pixel attachment for leaves, flowers, and buds along curved branches
 * - Atmospheric 2.5D Pot, Ambient Occlusion Ground Contact Shadow & Day/Night Gradients
 * - Organic Longitudinal Bark Grooves & Fissures
 * - Pro/Dev Overlays (Cut Indicators, Joint Dots, Monospace Node IDs, and Touch Hitbox)
 */

export interface StemTransform {
  nodeId: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  controlX: number;
  controlY: number;
  startAngle: number;
  renderAngle: number;
  thickness: number;
}

export interface DevRenderOptions {
  showPoints?: boolean;
  showIds?: boolean;
  showHitbox?: boolean;
  hitRadius?: number;
}

export function safeRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radii: number | number[] = 0
): void {
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w, h, radii);
    return;
  }
  const r = Array.isArray(radii) ? (radii[0] || 0) : radii;
  if (r <= 0) {
    ctx.rect(x, y, w, h);
    return;
  }
  const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export function quadBezierPoint(x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, t: number): { x: number; y: number } {
  const mt = 1 - t;
  return {
    x: mt * mt * x0 + 2 * mt * t * cx + t * t * x1,
    y: mt * mt * y0 + 2 * mt * t * cy + t * t * y1,
  };
}

export function closestPointOnQuadratic(
  p: { x: number; y: number },
  x0: number, y0: number,
  cx: number, cy: number,
  x1: number, y1: number
): { t: number; point: { x: number; y: number }; distance: number } {
  let best = { t: 0, point: { x: x0, y: y0 }, distance: Infinity };
  const samples = 20;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const q = quadBezierPoint(x0, y0, cx, cy, x1, y1, t);
    const distance = Math.hypot(p.x - q.x, p.y - q.y);
    if (distance < best.distance) best = { t, point: q, distance };
  }
  const start = Math.max(0, best.t - 1 / samples);
  const end = Math.min(1, best.t + 1 / samples);
  for (let i = 0; i <= 10; i++) {
    const t = start + (end - start) * (i / 10);
    const q = quadBezierPoint(x0, y0, cx, cy, x1, y1, t);
    const distance = Math.hypot(p.x - q.x, p.y - q.y);
    if (distance < best.distance) best = { t, point: q, distance };
  }
  return best;
}

function normalizeAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

let globalNodeDisp = new Map<number, { wx: number; wy: number; angle: number }>();
let globalStemTransforms = new Map<number, StemTransform>();

export function getStemTransforms(): Map<number, StemTransform> {
  return globalStemTransforms;
}

export function getWindDisp(): Map<number, { wx: number; wy: number; angle: number }> {
  return globalNodeDisp;
}

export function renderTokonomaScroll(
  ctx: CanvasRenderingContext2D,
  scrollId: string,
  x: number,
  y: number,
  w: number,
  h: number,
  darkMode: boolean
): void {
  const silkColor = darkMode ? "#27272a" : "#d7cfc2";
  const washiColor = darkMode ? "#18181b" : "#faf8f5";
  const rollerColor = darkMode ? "#09090b" : "#44403c";

  // Upper suspension cords
  ctx.strokeStyle = darkMode ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.3)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y - 18);
  ctx.lineTo(x + 12, y);
  ctx.moveTo(x + w / 2, y - 18);
  ctx.lineTo(x + w - 12, y);
  ctx.stroke();

  // Scroll body (silk border)
  ctx.fillStyle = silkColor;
  ctx.fillRect(x, y, w, h);

  // Wooden bottom roller (Jiku) with knob ends
  ctx.fillStyle = rollerColor;
  ctx.fillRect(x - 6, y + h, w + 12, 8);
  ctx.beginPath();
  ctx.arc(x - 6, y + h + 4, 6, 0, Math.PI * 2);
  ctx.arc(x + w + 6, y + h + 4, 6, 0, Math.PI * 2);
  ctx.fill();

  // Inner Washi Paper Artwork Area
  const artX = x + 10;
  const artY = y + 22;
  const artW = w - 20;
  const artH = h - 44;
  ctx.fillStyle = washiColor;
  ctx.fillRect(artX, artY, artW, artH);

  // Red Hanko (Artist Seal Stamp) in bottom corner
  ctx.fillStyle = "rgba(220, 38, 38, 0.75)";
  ctx.fillRect(artX + artW - 14, artY + artH - 18, 9, 9);
  ctx.strokeStyle = "rgba(254, 242, 242, 0.6)";
  ctx.lineWidth = 0.8;
  if (typeof ctx.strokeRect === "function") {
    ctx.strokeRect(artX + artW - 14, artY + artH - 18, 9, 9);
  }

  if (scrollId === "kakejiku_zen_enso") {
    // Zen Void Circle (Enso)
    ctx.save();
    ctx.translate(artX + artW / 2, artY + artH * 0.45);
    const ensoR = Math.min(artW * 0.32, artH * 0.26);

    ctx.strokeStyle = darkMode ? "rgba(255, 255, 255, 0.82)" : "rgba(24, 24, 27, 0.85)";
    ctx.lineWidth = ensoR * 0.28;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(0, 0, ensoR, 0.3, Math.PI * 1.85);
    ctx.stroke();

    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.arc(ensoR * 0.85, -ensoR * 0.3, 2, 0, Math.PI * 2);
    ctx.arc(ensoR * 0.7, -ensoR * 0.6, 1.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else if (scrollId === "kakejiku_harvest_moon") {
    // Autumn Full Moon (Meigetsu)
    ctx.save();
    const nightGrad = ctx.createLinearGradient(artX, artY, artX, artY + artH);
    nightGrad.addColorStop(0, darkMode ? "#090d16" : "#1e1b4b");
    nightGrad.addColorStop(1, darkMode ? "#18181b" : "#312e81");
    ctx.fillStyle = nightGrad;
    ctx.fillRect(artX, artY, artW, artH);

    const moonX = artX + artW * 0.5;
    const moonY = artY + artH * 0.35;
    const moonR = Math.min(artW * 0.24, 28);

    const halo = ctx.createRadialGradient(moonX, moonY, moonR * 0.5, moonX, moonY, moonR * 2.2);
    halo.addColorStop(0, "rgba(254, 240, 138, 0.4)");
    halo.addColorStop(0.5, "rgba(254, 240, 138, 0.12)");
    halo.addColorStop(1, "rgba(254, 240, 138, 0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR * 2.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#fde047";
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
    ctx.fill();

    // Bamboo reeds silhouette in foreground
    ctx.strokeStyle = darkMode ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.45)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(artX + 12, artY + artH);
    ctx.quadraticCurveTo(artX + 18, artY + artH - 35, artX + 26, artY + artH - 70);
    ctx.moveTo(artX + 24, artY + artH);
    ctx.quadraticCurveTo(artX + 32, artY + artH - 45, artX + 38, artY + artH - 85);
    ctx.stroke();
    ctx.restore();
  } else {
    // Default Sansui: Distant Mountain Mist
    ctx.save();
    const sumiColor = darkMode ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.14)";
    const sumiFront = darkMode ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.28)";

    ctx.fillStyle = sumiColor;
    ctx.beginPath();
    ctx.moveTo(artX, artY + artH * 0.55);
    ctx.lineTo(artX + artW * 0.35, artY + artH * 0.28);
    ctx.lineTo(artX + artW * 0.7, artY + artH * 0.48);
    ctx.lineTo(artX + artW, artY + artH * 0.38);
    ctx.lineTo(artX + artW, artY + artH);
    ctx.lineTo(artX, artY + artH);
    ctx.fill();

    ctx.fillStyle = sumiFront;
    ctx.beginPath();
    ctx.moveTo(artX + artW * 0.2, artY + artH);
    ctx.lineTo(artX + artW * 0.58, artY + artH * 0.46);
    ctx.lineTo(artX + artW * 0.88, artY + artH * 0.62);
    ctx.lineTo(artX + artW, artY + artH * 0.55);
    ctx.lineTo(artX + artW, artY + artH);
    ctx.fill();

    ctx.strokeStyle = sumiFront;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(artX + artW * 0.58, artY + artH * 0.46);
    ctx.lineTo(artX + artW * 0.58, artY + artH * 0.42);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(artX + artW * 0.58, artY + artH * 0.41, 6, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

export function renderTokonomaStand(ctx: CanvasRenderingContext2D, darkMode: boolean): void {
  const tableColor = darkMode ? "#0c0a09" : "#1c1917";
  const trimColor = darkMode ? "#1c1917" : "#292524";

  // Table top surface
  ctx.fillStyle = tableColor;
  ctx.beginPath();
  safeRoundRect(ctx, -102, 36, 204, 8, [2]);
  ctx.fill();

  ctx.strokeStyle = darkMode ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.2)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Carved table apron & corner feet
  ctx.fillStyle = trimColor;
  ctx.beginPath();
  safeRoundRect(ctx, -98, 44, 14, 14, [0, 0, 4, 4]);
  ctx.fill();
  ctx.beginPath();
  safeRoundRect(ctx, 84, 44, 14, 14, [0, 0, 4, 4]);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-84, 44);
  ctx.quadraticCurveTo(0, 48, 84, 44);
  ctx.lineTo(84, 40);
  ctx.lineTo(-84, 40);
  ctx.fill();
}

export function renderTokonomaAccent(
  ctx: CanvasRenderingContext2D,
  accentId: string,
  x: number,
  y: number,
  darkMode: boolean,
  windTime: number,
  particles?: Array<{ x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number; alpha: number; type: "smoke" | "glow" }>
): void {
  ctx.save();
  ctx.translate(x, y);

  // Hand-carved Wooden Jiita board slab under accent
  ctx.fillStyle = darkMode ? "#0c0a09" : "#292524";
  ctx.beginPath();
  safeRoundRect(ctx, -28, -2, 56, 6, [2]);
  ctx.fill();
  ctx.strokeStyle = darkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.3)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Subtle contact shadow
  ctx.fillStyle = darkMode ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0.2)";
  ctx.beginPath();
  ctx.ellipse(0, 5, 26, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  if (accentId === "koro_celadon_tripod") {
    // Jade Celadon Incense Burner with procedural smoke
    ctx.fillStyle = darkMode ? "#064e3b" : "#047857";
    ctx.beginPath();
    ctx.moveTo(-12, -2); ctx.lineTo(-15, 2); ctx.lineTo(-10, 0);
    ctx.moveTo(12, -2); ctx.lineTo(15, 2); ctx.lineTo(10, 0);
    ctx.fill();

    const celadonGrad = ctx.createRadialGradient(0, -12, 2, 0, -12, 16);
    celadonGrad.addColorStop(0, darkMode ? "#6ee7b7" : "#a7f3d0");
    celadonGrad.addColorStop(1, darkMode ? "#065f46" : "#047857");
    ctx.fillStyle = celadonGrad;
    ctx.beginPath();
    ctx.arc(0, -12, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = darkMode ? "#047857" : "#064e3b";
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.fillStyle = darkMode ? "#d97706" : "#b45309";
    ctx.beginPath();
    ctx.ellipse(0, -22, 11, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, -27, 3, 0, Math.PI * 2);
    ctx.fill();

    if (particles && Math.random() < 0.35) {
      particles.push({
        x: x,
        y: y - 28,
        vx: (Math.random() - 0.5) * 0.3,
        vy: -0.7 - Math.random() * 0.4,
        life: 1.0,
        maxLife: 1.0,
        size: 2.2 + Math.random() * 1.5,
        alpha: 0.55,
        type: "smoke",
      });
    }
  } else if (accentId === "tenpai_bronze_fisherman") {
    ctx.fillStyle = darkMode ? "#475569" : "#334155";
    ctx.beginPath();
    ctx.ellipse(0, -10, 6, 8, 0.15, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = darkMode ? "#b45309" : "#78350f";
    ctx.beginPath();
    ctx.moveTo(-10, -16);
    ctx.lineTo(0, -24);
    ctx.lineTo(10, -16);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = darkMode ? "#94a3b8" : "#475569";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(3, -12);
    ctx.quadraticCurveTo(14, -22, 24, -14);
    ctx.lineTo(24, 0);
    ctx.stroke();
  } else if (accentId === "tenpai_bronze_crane") {
    ctx.strokeStyle = darkMode ? "#64748b" : "#475569";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-2, -2); ctx.lineTo(-2, -14);
    ctx.moveTo(3, -2); ctx.lineTo(3, -14);
    ctx.stroke();

    ctx.fillStyle = darkMode ? "#f8fafc" : "#e2e8f0";
    ctx.beginPath();
    ctx.ellipse(0, -18, 7, 5, -0.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = darkMode ? "#f8fafc" : "#e2e8f0";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-4, -20);
    ctx.quadraticCurveTo(-8, -28, -6, -34);
    ctx.stroke();

    ctx.fillStyle = "#dc2626";
    ctx.beginPath();
    ctx.arc(-6, -35, 2.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (accentId === "suiseki_kamogawa_toyama" || accentId === "suiseki_furuya_waterfall") {
    ctx.fillStyle = "#78350f";
    ctx.beginPath();
    safeRoundRect(ctx, -22, -4, 44, 5, [2]);
    ctx.fill();

    ctx.fillStyle = accentId === "suiseki_furuya_waterfall" ? "#18181b" : "#27272a";
    ctx.beginPath();
    ctx.moveTo(-20, -4);
    ctx.lineTo(-14, -18);
    ctx.lineTo(-4, -12);
    ctx.lineTo(6, -24);
    ctx.lineTo(16, -14);
    ctx.lineTo(20, -4);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = darkMode ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.25)";
    ctx.lineWidth = 1;
    ctx.stroke();

    if (accentId === "suiseki_furuya_waterfall") {
      ctx.strokeStyle = "#f8fafc";
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(6, -24);
      ctx.lineTo(5, -16);
      ctx.lineTo(7, -4);
      ctx.stroke();
    }
  } else if (accentId === "shitakusa_wild_violet_fern") {
    ctx.fillStyle = darkMode ? "#3f3f46" : "#52525b";
    ctx.beginPath();
    ctx.ellipse(0, -2, 20, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#16a34a";
    ctx.lineWidth = 1.4;
    for (let f = -12; f <= 12; f += 6) {
      ctx.beginPath();
      ctx.moveTo(f * 0.4, -4);
      ctx.quadraticCurveTo(f * 1.3, -16, f * 1.6, -20);
      ctx.stroke();
    }

    ctx.fillStyle = "#a855f7";
    ctx.beginPath();
    ctx.arc(-6, -15, 3.2, 0, Math.PI * 2);
    ctx.arc(7, -18, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#facc15";
    ctx.beginPath();
    ctx.arc(-6, -15, 1, 0, Math.PI * 2);
    ctx.arc(7, -18, 1, 0, Math.PI * 2);
    ctx.fill();
  } else if (accentId === "ishidoro_yukimi_lantern") {
    ctx.fillStyle = darkMode ? "#64748b" : "#71717a";
    ctx.fillRect(-12, -4, 4, 4);
    ctx.fillRect(8, -4, 4, 4);
    ctx.fillRect(-14, -8, 28, 4);
    ctx.fillStyle = darkMode ? "#1e293b" : "#334155";
    ctx.fillRect(-9, -20, 18, 12);

    const flicker = Math.sin(windTime * 5) * 0.15 + 0.85;
    const flameGrad = ctx.createRadialGradient(0, -14, 1, 0, -14, 14);
    flameGrad.addColorStop(0, `rgba(254, 240, 138, ${0.9 * flicker})`);
    flameGrad.addColorStop(0.5, `rgba(245, 158, 11, ${0.4 * flicker})`);
    flameGrad.addColorStop(1, "rgba(245, 158, 11, 0)");
    ctx.fillStyle = flameGrad;
    ctx.beginPath();
    ctx.arc(0, -14, 14, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = darkMode ? "#64748b" : "#71717a";
    ctx.beginPath();
    ctx.moveTo(-22, -20);
    ctx.lineTo(0, -28);
    ctx.lineTo(22, -20);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.arc(0, -30, 2.5, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Default Velvet Moss Sphere (Kokedama)
    ctx.fillStyle = darkMode ? "#1c1917" : "#292524";
    ctx.beginPath();
    safeRoundRect(ctx, -20, -3, 40, 5, [2]);
    ctx.fill();

    const mossGrad = ctx.createRadialGradient(-3, -13, 2, 0, -11, 14);
    mossGrad.addColorStop(0, darkMode ? "#22c55e" : "#16a34a");
    mossGrad.addColorStop(1, darkMode ? "#14532d" : "#166534");
    ctx.fillStyle = mossGrad;
    ctx.beginPath();
    ctx.arc(0, -11, 12, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#86efac";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(2, -21);
    ctx.quadraticCurveTo(6, -27, 8, -31);
    ctx.stroke();
  }

  ctx.restore();
}

export function renderPlant(
  ctx: CanvasRenderingContext2D,
  state: PlantState,
  w: number,
  h: number,
  devOptions?: DevRenderOptions
): string {
  ctx.clearRect(0, 0, w, h);

  // 1. Atmosphere & Background (Garden Weather / Tokonoma Alcove)
  const currentSeason = state.step % (state.cycleLength || 250);
  const isWinterSeason = currentSeason >= 180;
  const isAutumnSeason = currentSeason >= 140 && currentSeason < 180;
  const isSpringSeason = currentSeason < 100;

  const weather = state.weather || "clear";
  const isTokonoma = Boolean(state.isTokonoma);

  // Calculate tree visual flow direction for Inward Flow Rule (Nagare)
  let avgBranchX = 0;
  let branchCount = 0;
  for (const n of state.nodes) {
    if (!n.isCut && (n.type === "stem" || n.type === "meristem")) {
      avgBranchX += n.x;
      branchCount++;
    }
  }
  const flowDir: "left" | "right" | "balanced" =
    branchCount > 0 && avgBranchX > 18 ? "right" : branchCount > 0 && avgBranchX < -18 ? "left" : "balanced";

  if (isTokonoma) {
    // Tokonoma (床の間) Minimalist Traditional Japanese Indoor Alcove
    const wallGrad = ctx.createLinearGradient(0, 0, 0, h);
    if (state.darkMode) {
      wallGrad.addColorStop(0, "#18181b");
      wallGrad.addColorStop(1, "#09090b");
    } else {
      wallGrad.addColorStop(0, "#f4f1ea");
      wallGrad.addColorStop(1, "#e6e0d4");
    }
    ctx.fillStyle = wallGrad;
    ctx.fillRect(0, 0, w, h);

    // Tatami / Polished Hinoki Wood Base Floor
    const floorY = h * 0.78;
    ctx.fillStyle = state.darkMode ? "#1c1917" : "#3e2723";
    ctx.fillRect(0, floorY, w, h - floorY);

    // Tatami green brocade border ribbon
    ctx.fillStyle = state.darkMode ? "#064e3b" : "#15803d";
    ctx.fillRect(0, floorY, w, 5);

    // Traditional Hanging Scroll (Kakejiku) in background
    // Inward Flow Rule: Counterbalances tree offset
    const scrollW = Math.min(135, w * 0.3);
    const scrollH = h * 0.46;
    let scrollX = w * 0.68;
    if (flowDir === "left") {
      scrollX = w * 0.16;
    } else if (flowDir === "right") {
      scrollX = w * 0.64;
    }
    const scrollY = h * 0.09;
    const activeScrollId = state.activeAccoutrements?.scrollId || "kakejiku_mountain_sansui";
    renderTokonomaScroll(ctx, activeScrollId, scrollX, scrollY, scrollW, scrollH, state.darkMode);

    // Temple wind chime (Fūrin) in top left
    ctx.save();
    ctx.strokeStyle = state.darkMode ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(w * 0.15, 0);
    ctx.lineTo(w * 0.15, 45);
    ctx.stroke();
    ctx.fillStyle = state.darkMode ? "#f59e0b" : "#d97706";
    ctx.beginPath();
    ctx.arc(w * 0.15, 52, 8, Math.PI, 0);
    ctx.fill();
    const furinSway = Math.sin((state.windTime ?? 0) * 2.5) * 5;
    ctx.fillStyle = state.darkMode ? "rgba(254, 243, 199, 0.75)" : "rgba(255, 255, 255, 0.85)";
    ctx.fillRect(w * 0.15 - 2.5 + furinSway, 56, 5, 24);
    ctx.restore();
  } else {
    // Standard Zen Garden Outdoors
    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    if (weather === "twilight") {
      bgGrad.addColorStop(0, "#0f172a");
      bgGrad.addColorStop(0.5, "#311042");
      bgGrad.addColorStop(1, "#1c1917");
    } else if (state.darkMode) {
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

    // Weather Effects:
    if (weather === "komorebi") {
      // Soft angled volumetric sunbeams (Komorebi)
      ctx.save();
      const beamGrad = ctx.createLinearGradient(0, 0, w * 0.8, h);
      beamGrad.addColorStop(0, "rgba(254, 240, 138, 0.14)");
      beamGrad.addColorStop(0.6, "rgba(254, 243, 199, 0.05)");
      beamGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = beamGrad;
      ctx.beginPath();
      ctx.moveTo(w * 0.08, 0);
      ctx.lineTo(w * 0.35, 0);
      ctx.lineTo(w * 0.95, h);
      ctx.lineTo(w * 0.55, h);
      ctx.fill();

      // Floating golden dust motes
      const dustTime = (state.windTime ?? 0) * 14;
      for (let i = 0; i < 18; i++) {
        const dx = (i * 67 + dustTime * 0.6) % w;
        const dy = (i * 89 + dustTime * 0.4) % (h * 0.85);
        ctx.fillStyle = "rgba(253, 224, 71, 0.65)";
        ctx.beginPath();
        ctx.arc(dx, dy, 1.2 + (i % 2) * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    } else if (weather === "rain") {
      // Shigure (Gentle Garden Rain)
      ctx.save();
      ctx.strokeStyle = "rgba(186, 230, 253, 0.45)";
      ctx.lineWidth = 1.2;
      const rainTime = (state.windTime ?? 0) * 450 + state.step * 15;
      for (let i = 0; i < 48; i++) {
        const rx = ((i * 43 + rainTime * 0.25) % (w + 40)) - 20;
        const ry = ((i * 61 + rainTime) % (h + 40)) - 20;
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx - 3, ry + 16);
        ctx.stroke();
      }
      ctx.restore();
    } else if (weather === "twilight") {
      // Hotaru (Bioluminescent Fireflies)
      ctx.save();
      const fireflyTime = (state.windTime ?? 0) * 2.5;
      for (let i = 0; i < 14; i++) {
        const fx = w * 0.5 + Math.sin(fireflyTime * 0.7 + i * 1.3) * (w * 0.35);
        const fy = h * 0.45 + Math.cos(fireflyTime * 0.9 + i * 0.9) * (h * 0.25);
        const pulse = Math.sin(fireflyTime * 3 + i * 2) * 0.5 + 0.5;

        const radGrad = ctx.createRadialGradient(fx, fy, 0, fx, fy, 8 * pulse + 3);
        radGrad.addColorStop(0, `rgba(163, 230, 53, ${0.9 * pulse})`);
        radGrad.addColorStop(0.4, `rgba(132, 204, 22, ${0.45 * pulse})`);
        radGrad.addColorStop(1, "rgba(132, 204, 22, 0)");
        ctx.fillStyle = radGrad;
        ctx.beginPath();
        ctx.arc(fx, fy, 8 * pulse + 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Gentle ambient seasonal drift (winter snowflakes / spring sakura petals)
    if (isWinterSeason || isSpringSeason) {
      const count = isWinterSeason ? 26 : 16;
      const time = (state.windTime ?? 0) * 18 + state.step * 2.2;
      ctx.save();
      for (let i = 0; i < count; i++) {
        const px = ((i * 79 + time * (0.35 + (i % 5) * 0.12)) % (w + 40)) - 20;
        const py = ((i * 103 + time * (0.75 + (i % 4) * 0.2)) % (h + 40)) - 20;
        const sway = Math.sin(time * 0.04 + i * 1.5) * 14;

        if (isWinterSeason) {
          ctx.fillStyle = state.darkMode ? "rgba(255, 255, 255, 0.65)" : "rgba(255, 255, 255, 0.85)";
          ctx.beginPath();
          ctx.arc(px + sway, py, 1.2 + (i % 3) * 0.6, 0, Math.PI * 2);
          ctx.fill();
        } else if (isSpringSeason) {
          ctx.save();
          ctx.translate(px + sway, py);
          ctx.rotate((time * 0.02 + i) * 0.4);
          ctx.fillStyle = state.darkMode ? "rgba(244, 114, 182, 0.6)" : "rgba(251, 113, 133, 0.72)";
          ctx.beginPath();
          ctx.ellipse(0, 0, 3.5, 2.0, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
      ctx.restore();
    }
  }

  // 2. Soft Ambient Occlusion Floor Shadow & Ceramic Bonsai Pot
  ctx.save();
  let tokoTreeOffsetX = 0;
  if (isTokonoma) {
    if (flowDir === "right") tokoTreeOffsetX = -65;
    else if (flowDir === "left") tokoTreeOffsetX = 65;
  }
  const ox = w / 2 + (state.cameraX ?? 0) + tokoTreeOffsetX;
  const oy = h * 0.82 + (state.cameraY ?? 0);
  const zoom = state.cameraZoom ?? 1.0;
  const baseScale = Math.min(w / 400, h / 500);
  const scale = baseScale * zoom;

  ctx.translate(ox, oy);

  if (!isTokonoma) {
    // Karesansui Zen Sand Bed (expansive panoramic pebble courtyard beneath bonsai pot)
    const sandBg = state.darkMode ? "#141a24" : "#ede7dd";
    const grooveColor = state.darkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.08)";
    const grooveShadow = state.darkMode ? "rgba(0,0,0,0.45)" : "rgba(255,255,255,0.65)";

  // Outer wooden sand tray rim (wide panoramic terrace with mitered joinery)
  ctx.fillStyle = state.darkMode ? "#0b0f17" : "#544537";
  ctx.beginPath();
  safeRoundRect(ctx, -420, 14, 840, 96, [12]);
  ctx.fill();

  // Subtle dark bevel and cast shadow for depth
  ctx.strokeStyle = state.darkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.25)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Fine granite gravel sand bed
  ctx.fillStyle = sandBg;
  ctx.beginPath();
  safeRoundRect(ctx, -414, 17, 828, 90, [10]);
  ctx.fill();

  // Meditative combed horizontal sand grooves across wide courtyard
  for (let gy = 23; gy <= 101; gy += 6) {
    ctx.strokeStyle = grooveColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-406, gy);
    ctx.lineTo(406, gy);
    ctx.stroke();

    ctx.strokeStyle = grooveShadow;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-406, gy + 1);
    ctx.lineTo(406, gy + 1);
    ctx.stroke();
  }

  // Render user-raked sand ripples with tactile 3D relief (Berge & Täler)
  if (state.sandRipples && state.sandRipples.length > 0) {
    for (const rip of state.sandRipples) {
      ctx.save();
      const alpha = Math.max(0.2, Math.min(1.0, rip.intensity ?? 0.85));
      const rx = rip.radius;
      const ry = rip.radius * 0.38;

      // 1. Tal (Valley Trough): Dark central groove depression with ambient shadow
      ctx.strokeStyle = state.darkMode
        ? `rgba(0, 0, 0, ${alpha * 0.7})`
        : `rgba(45, 30, 18, ${alpha * 0.45})`;
      ctx.lineWidth = 4.2;
      ctx.beginPath();
      ctx.ellipse(rip.x, rip.y, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();

      // 2. Berge (Sunward Crests / Peaks): Bright sand berm catching the sunlight on the upper rim
      ctx.strokeStyle = state.darkMode
        ? `rgba(255, 255, 255, ${alpha * 0.35})`
        : `rgba(255, 255, 255, ${alpha * 0.9})`;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.ellipse(rip.x - 0.8, rip.y - 1.2, rx + 1.8, ry + 1.2, 0, Math.PI * 0.75, Math.PI * 2.15);
      ctx.stroke();

      // 3. Lee-Side Ridge (Cast Shadow Flank): Outer shadow ridge on the lower rim
      ctx.strokeStyle = state.darkMode
        ? `rgba(0, 0, 0, ${alpha * 0.45})`
        : `rgba(80, 58, 40, ${alpha * 0.35})`;
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.ellipse(rip.x + 0.8, rip.y + 1.2, rx + 1.8, ry + 1.2, 0, 0, Math.PI * 1.15);
      ctx.stroke();

      ctx.restore();
    }
  }

  // Shishi-Odoshi (鹿威し) Bamboo Rocker Fountain
  const shishiX = -155;
  const shishiY = 36;
  const waterFill = Math.max(0, Math.min(1.0, state.shishiWater ?? 0));
  const rockerAngle = -0.25 + waterFill * 0.58;

  ctx.save();
  // 1. Water stream from upper spout
  ctx.strokeStyle = "rgba(186, 230, 253, 0.75)";
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(shishiX - 8, shishiY - 32);
  ctx.lineTo(shishiX - 5, shishiY - 14);
  ctx.stroke();

  // 2. Upper supply bamboo pipe
  ctx.strokeStyle = state.darkMode ? "#3f6212" : "#65a30d";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(shishiX - 28, shishiY - 36);
  ctx.lineTo(shishiX - 8, shishiY - 32);
  ctx.stroke();

  // 3. Upright support bamboo post
  ctx.strokeStyle = state.darkMode ? "#365314" : "#4d7c0f";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(shishiX, shishiY + 18);
  ctx.lineTo(shishiX, shishiY - 10);
  ctx.stroke();

  // 4. Pivoting rocker bamboo tube
  ctx.save();
  ctx.translate(shishiX, shishiY);
  ctx.rotate(rockerAngle);
  ctx.strokeStyle = state.darkMode ? "#4d7c0f" : "#84cc16";
  ctx.lineWidth = 5.5;
  ctx.lineCap = "butt";
  ctx.beginPath();
  ctx.moveTo(-18, 0);
  ctx.lineTo(24, 0);
  ctx.stroke();

  ctx.fillStyle = state.darkMode ? "#14532d" : "#365314";
  ctx.beginPath();
  ctx.ellipse(24, 0, 3, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#1c1917";
  ctx.beginPath();
  ctx.arc(0, 0, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 5. Water dumping stream when tipped
  if (waterFill > 0.92) {
    ctx.strokeStyle = "rgba(186, 230, 253, 0.85)";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(shishiX + 18, shishiY + 8);
    ctx.quadraticCurveTo(shishiX + 26, shishiY + 20, shishiX + 22, shishiY + 30);
    ctx.stroke();
  }

  // 6. River strike stone & basin
  ctx.fillStyle = state.darkMode ? "#1e293b" : "#475569";
  ctx.beginPath();
  ctx.ellipse(shishiX - 16, shishiY + 22, 10, 4.5, -0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = state.darkMode ? "#334155" : "#64748b";
  ctx.beginPath();
  ctx.ellipse(shishiX + 20, shishiY + 28, 14, 5.5, 0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  } else {
    // Tokonoma Lacquered Carved Rosewood Shoku Display Table
    renderTokonomaStand(ctx, state.darkMode);
  }

  // Ground shadow ellipse under ceramic pot
  ctx.fillStyle = state.darkMode ? "rgba(0, 0, 0, 0.6)" : "rgba(0, 0, 0, 0.15)";
  ctx.beginPath();
  ctx.ellipse(0, 22, 110, 22, 0, 0, Math.PI * 2);
  ctx.fill();

  // Artisanal Pot Glazes / Suiseki Stone Slab
  const potStyle = state.potStyle || "classic";

  if (potStyle === "kurama") {
    // Rugged alpine mountain carved rock slab
    ctx.fillStyle = state.darkMode ? "#181e28" : "#3f3f46";
    ctx.beginPath();
    ctx.moveTo(-100, 28);
    ctx.quadraticCurveTo(-95, 8, -60, 6);
    ctx.quadraticCurveTo(-20, 2, 0, 4);
    ctx.quadraticCurveTo(40, 3, 85, 8);
    ctx.quadraticCurveTo(105, 14, 98, 28);
    ctx.quadraticCurveTo(80, 34, 40, 35);
    ctx.quadraticCurveTo(0, 37, -50, 36);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = state.darkMode ? "#334155" : "#27272a";
    ctx.lineWidth = 2.5;
    ctx.stroke();
  } else {
    let potBodyColor: string;
    let potBorderColor: string;
    let potRimHighlight: string;

    if (potStyle === "yixing") {
      // Yixing Zisha unglazed terracotta
      potBodyColor = state.darkMode ? "#581c0c" : "#7c2d12";
      potBorderColor = state.darkMode ? "#361107" : "#451a03";
      potRimHighlight = "rgba(254, 205, 185, 0.28)";
    } else if (potStyle === "oribe") {
      // Oribe green crackle ceramic
      potBodyColor = state.darkMode ? "#052e16" : "#14532d";
      potBorderColor = state.darkMode ? "#021d0d" : "#0f3a1f";
      potRimHighlight = "rgba(187, 247, 208, 0.4)";
    } else if (potStyle === "tenmoku") {
      // Tenmoku oil-spot iron black
      potBodyColor = state.darkMode ? "#020617" : "#09090b";
      potBorderColor = state.darkMode ? "#1e293b" : "#27272a";
      potRimHighlight = "rgba(245, 158, 11, 0.35)";
    } else {
      // Classic slate
      potBodyColor = state.darkMode ? "#1e293b" : "#44403c";
      potBorderColor = state.darkMode ? "#334155" : "#292524";
      potRimHighlight = state.darkMode ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.35)";
    }

    ctx.fillStyle = potBodyColor;
    ctx.beginPath();
    safeRoundRect(ctx, -85, 2, 170, 36, [6, 6, 16, 16]);
    ctx.fill();

    ctx.strokeStyle = potBorderColor;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Specific glaze textures:
    if (potStyle === "oribe") {
      // Crackle veins
      ctx.strokeStyle = "rgba(254, 240, 138, 0.22)";
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(-60, 8); ctx.lineTo(-45, 24); ctx.lineTo(-30, 20);
      ctx.moveTo(35, 10); ctx.lineTo(50, 26); ctx.lineTo(65, 18);
      ctx.stroke();
    } else if (potStyle === "tenmoku") {
      // Iridescent bronze spots
      ctx.fillStyle = "rgba(245, 158, 11, 0.42)";
      const spots = [[-55, 14], [-35, 22], [-15, 12], [10, 20], [38, 14], [60, 22]];
      for (const [sx, sy] of spots) {
        ctx.beginPath();
        ctx.arc(sx, sy, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Pot rim
    ctx.strokeStyle = potRimHighlight;
    ctx.lineWidth = 2;
    ctx.beginPath();
    safeRoundRect(ctx, -88, 0, 176, 8, [4]);
    ctx.stroke();
  }

  // Moist soil bed inside ceramic pot with moisture-dependent color
  const moisture = Math.max(0, Math.min(1, state.soilMoisture ?? 0.5));
  // Interpolate dry loam (#736052) to wet rich peat (#241a12)
  const soilR = Math.round(115 * (1 - moisture) + 36 * moisture);
  const soilG = Math.round(96 * (1 - moisture) + 26 * moisture);
  const soilB = Math.round(82 * (1 - moisture) + 18 * moisture);
  ctx.fillStyle = `rgb(${soilR}, ${soilG}, ${soilB})`;
  ctx.beginPath();
  ctx.ellipse(0, 4, 82, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Gentle glistening water sheen if soil is moist
  if (moisture > 0.35) {
    ctx.fillStyle = `rgba(255, 255, 255, ${(moisture - 0.35) * 0.28})`;
    ctx.beginPath();
    ctx.ellipse(-18, 3.5, 34, 2.5, -0.05, 0, Math.PI * 2);
    ctx.fill();
  }

  // Velvety green moss pillows around trunk nebari
  const mossPalette = state.darkMode
    ? ["#2d4a1d", "#365314", "#3f6212", "#4d7c0f"]
    : ["#3f6212", "#4d7c0f", "#65a30d", "#84cc16"];
  const mossCushions = [
    { x: -38, y: 3.5, rx: 14, ry: 4.5, c: 1 },
    { x: -20, y: 4.5, rx: 18, ry: 5.0, c: 2 },
    { x: 16, y: 4.2, rx: 17, ry: 4.8, c: 3 },
    { x: 38, y: 3.8, rx: 13, ry: 4.2, c: 0 },
    { x: -2, y: 5.2, rx: 16, ry: 4.5, c: 2 },
    { x: -10, y: 3.2, rx: 10, ry: 3.5, c: 1 },
    { x: 28, y: 4.8, rx: 12, ry: 3.8, c: 2 },
  ];
  for (const m of mossCushions) {
    ctx.fillStyle = mossPalette[m.c];
    ctx.beginPath();
    ctx.ellipse(m.x, m.y, m.rx, m.ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Soft winter snow dusted on pot rim & moss
  if (isWinterSeason) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.beginPath();
    safeRoundRect(ctx, -86, -1, 172, 3.5, [2]);
    ctx.fill();

    ctx.fillStyle = "rgba(255, 255, 255, 0.72)";
    ctx.beginPath();
    ctx.ellipse(-20, 2.5, 14, 2.5, 0, 0, Math.PI * 2);
    ctx.ellipse(22, 2.8, 12, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // 2.5 Companion Accoutrement (Tenpai / Koro / Suiseki / Shitakusa / Ishidoro)
  const activeAccentId = state.activeAccoutrements?.accentId || "shitakusa_kokedama_mossball";
  // Inward Flow Rule: Accent sits on the opposite side of tree's dominant flow
  const accentSideX = flowDir === "left" ? -142 : 142;
  const accentFloorY = isTokonoma ? 36 : 28;
  if (!state.tokonomaParticles) state.tokonomaParticles = [];
  renderTokonomaAccent(
    ctx,
    activeAccentId,
    accentSideX,
    accentFloorY,
    state.darkMode,
    state.windTime ?? 0,
    state.tokonomaParticles
  );

  // Update and draw Tokonoma / Accent particles (smoke from Koro, flame embers)
  if (state.tokonomaParticles && state.tokonomaParticles.length > 0) {
    ctx.save();
    for (let i = state.tokonomaParticles.length - 1; i >= 0; i--) {
      const p = state.tokonomaParticles[i];
      p.x += p.vx + Math.sin((state.windTime ?? 0) * 2 + p.y * 0.05) * 0.25;
      p.y += p.vy;
      p.life -= 0.012;
      p.size += 0.04;
      p.alpha = Math.max(0, p.life * 0.55);

      if (p.life <= 0) {
        state.tokonomaParticles.splice(i, 1);
        continue;
      }

      ctx.fillStyle = state.darkMode
        ? `rgba(226, 232, 240, ${p.alpha * 0.6})`
        : `rgba(100, 116, 139, ${p.alpha * 0.7})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Render fallen debris / sakura petals resting on soil
  if (state.fallenDebris && state.fallenDebris.length > 0) {
    for (const d of state.fallenDebris) {
      ctx.save();
      ctx.translate(d.x, d.y + 4);
      ctx.rotate(d.rot);
      ctx.fillStyle = d.color;
      ctx.beginPath();
      if (d.type === "petal") {
        ctx.ellipse(0, 0, 4, 2.2, 0, 0, Math.PI * 2);
      } else {
        ctx.ellipse(0, 0, 5, 2.4, 0, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.restore();
    }
  }

  ctx.scale(scale, scale);

  // Optional Touch Hitbox Visualizer at origin
  if (devOptions?.showHitbox) {
    ctx.save();
    ctx.strokeStyle = "rgba(245, 158, 11, 0.4)";
    ctx.lineWidth = 1.5 / scale;
    ctx.setLineDash([4 / scale, 4 / scale]);
    ctx.beginPath();
    ctx.arc(0, -50, devOptions.hitRadius ?? 20, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  const g = state.genome;

  // 3. Tree Graph Lookup & Da Vinci Area-Preserving Thickness
  const nodeById = new Map<number, PlantNode>();
  const childrenByParent = new Map<number | null, PlantNode[]>();
  for (const n of state.nodes) {
    nodeById.set(n.id, n);
    const arr = childrenByParent.get(n.parentId);
    if (arr) arr.push(n);
    else childrenByParent.set(n.parentId, [n]);
  }

  const weightCache = new Map<number, number>();
  const thicknessCache = new Map<number, number>();

  function getWeight(n: PlantNode): number {
    if (weightCache.has(n.id)) return weightCache.get(n.id)!;
    let w = n.type === "leaf" ? 0.7 : n.type === "flower" ? 1.2 : 0.04 * n.length;
    const kids = childrenByParent.get(n.id) ?? [];
    for (const c of kids) {
      w += getWeight(c);
    }
    weightCache.set(n.id, w);
    return w;
  }

  function getThickness(n: PlantNode): number {
    if (thicknessCache.has(n.id)) return thicknessCache.get(n.id)!;
    if (n.type !== "stem" && n.type !== "meristem") {
      thicknessCache.set(n.id, 0);
      return 0;
    }
    const kids = childrenByParent.get(n.id) ?? [];
    const childStems = kids.filter((c) => c.type === "stem" || c.type === "meristem");
    let areaSum = 0.9; // Base tip area
    for (const c of childStems) {
      const ct = getThickness(c);
      areaSum += ct * ct;
    }
    const daVinci = Math.sqrt(areaSum);
    const woodiness = Math.min(1.0, (n.age || 0) / 45);
    const depthFactor = Math.max(0.35, 1.0 - (n.depth / 8) * 0.45);
    const thickness = Math.max(1.2, daVinci * 1.3 * depthFactor + woodiness * 1.8);
    thicknessCache.set(n.id, thickness);
    return thickness;
  }

  // Precompute weights and thickness
  for (const n of state.nodes) {
    getWeight(n);
    if (n.type === "stem" || n.type === "meristem") {
      getThickness(n);
    }
  }

  // 4. Compute Curved Bézier Transforms with Sag & Leonardo Da Vinci Taper
  globalStemTransforms.clear();
  globalNodeDisp.clear();
  globalNodeDisp.set(0, { wx: state.root.x, wy: state.root.y, angle: state.root.angle });

  const stiffnessTrait = expressTrait(g, "stiffness") || 1.0;

  for (const n of state.nodes) {
    if (n.type === "stem" || n.type === "meristem") {
      const parentTr = n.parentId !== null ? globalStemTransforms.get(n.parentId) : undefined;
      let startX: number;
      let startY: number;
      let startAngle: number;

      if (parentTr) {
        const attachT = n.attachT !== undefined ? n.attachT : 1.0;
        const pt = quadBezierPoint(
          parentTr.startX, parentTr.startY,
          parentTr.controlX, parentTr.controlY,
          parentTr.endX, parentTr.endY,
          attachT
        );
        startX = pt.x;
        startY = pt.y;
        const tangentAngle = parentTr.startAngle + normalizeAngle(parentTr.renderAngle - parentTr.startAngle) * attachT;
        const parentNode = nodeById.get(n.parentId!);
        const deltaAngle = normalizeAngle(n.angle - (parentNode ? parentNode.angle : parentTr.startAngle));
        startAngle = tangentAngle + deltaAngle;
      } else {
        startX = state.root.x;
        startY = state.root.y;
        startAngle = n.angle;
      }

      const length = n.length;
      const weight = weightCache.get(n.id) ?? 0.1;
      const thickness = thicknessCache.get(n.id) ?? 2.0;
      const woodiness = Math.min(1.0, (n.age || 0) / 40);

      // Lignified wood mechanics: Bending resistance scales steeply with thickness (I ~ r^3)
      const mechanicalStiffness = Math.pow(thickness + 1.0, 3.0) * (1.5 + woodiness * 4.0) * stiffnessTrait;
      const flexFactor = Math.max(0, 1.0 - woodiness * 0.9);
      const droop = Math.min(0.05, (0.02 * weight * flexFactor) / Math.max(0.6, mechanicalStiffness));
      const sagDistance = droop * length;
      const bendAngle = thickness < 2.5 ? droop * 0.4 : 0;

      // Bonsai wire internode curvature bending:
      // Joint origin startAngle is rigidly preserved!
      // Wire curves the internode body towards the exit angle.
      const wireBend = n.wireCurvature ?? n.wireAngleOffset ?? 0;
      const renderAngle = startAngle + wireBend + bendAngle;

      // Tip position along the curved arc
      const chordAngle = startAngle + wireBend * 0.5 + bendAngle;
      const endX = startX + Math.cos(chordAngle) * length;
      const endY = startY + Math.sin(chordAngle) * length;

      // Smooth organic Bézier midpoint with normal curvature deflection
      const midX = (startX + endX) / 2;
      const midY = (startY + endY) / 2;
      const normalX = -Math.sin(chordAngle);
      const normalY = Math.cos(chordAngle);
      const organicSweep = ((n.id % 7) - 3) * 0.015;
      const curvatureOffset = wireBend * length * 0.28;
      const controlX = midX + normalX * (organicSweep * length + curvatureOffset);
      const controlY = midY + normalY * (organicSweep * length + curvatureOffset) + sagDistance * 0.35;

      const tr: StemTransform = {
        nodeId: n.id,
        startX,
        startY,
        endX,
        endY,
        controlX,
        controlY,
        startAngle,
        renderAngle,
        thickness,
      };
      globalStemTransforms.set(n.id, tr);
      globalNodeDisp.set(n.id, { wx: endX, wy: endY, angle: renderAngle });

      // Render woody stem
      const wood = Math.min(1, n.age / 35);
      const r = Math.round(75 * wood + 36 * (1 - wood));
      const gr = Math.round(42 * wood + 24 * (1 - wood));
      const b = Math.round(20 * wood + 12 * (1 - wood));

      // Branch drop shadow
      ctx.strokeStyle = state.darkMode ? "rgba(0, 0, 0, 0.45)" : "rgba(40, 25, 15, 0.25)";
      ctx.lineWidth = thickness + 2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(startX + 2, startY + 2);
      ctx.quadraticCurveTo(controlX + 2, controlY + 2, endX + 2, endY + 2);
      ctx.stroke();

      // Main curved branch stroke (Living Wood vs Sculpted Alpine Deadwood Jin)
      if (n.isJin) {
        // Alpine deadwood Jin / Shari: bleached sculpted heartwood
        ctx.strokeStyle = state.darkMode ? "#cbd5e1" : "#f1f5f9";
        ctx.lineWidth = thickness;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.quadraticCurveTo(controlX, controlY, endX, endY);
        ctx.stroke();

        // Weathered silver-grey grain fissure fibers
        ctx.strokeStyle = state.darkMode ? "rgba(71, 85, 105, 0.45)" : "rgba(148, 163, 184, 0.55)";
        ctx.lineWidth = Math.max(0.8, thickness * 0.22);
        ctx.beginPath();
        ctx.moveTo(startX + 0.5, startY + 0.5);
        ctx.quadraticCurveTo(controlX + 0.5, controlY + 0.5, endX + 0.5, endY + 0.5);
        ctx.stroke();

        // Sculpted tapered mountain point at tip
        ctx.fillStyle = state.darkMode ? "#e2e8f0" : "#ffffff";
        ctx.beginPath();
        ctx.arc(endX, endY, Math.max(1.2, thickness * 0.42), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.strokeStyle = `rgb(${r},${gr},${b})`;
        ctx.lineWidth = thickness;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.quadraticCurveTo(controlX, controlY, endX, endY);
        ctx.stroke();

        // Curved bark textures
        if (state.woodTexture !== false) {
          renderWoodBarkTexture(ctx, startX, startY, endX, endY, thickness, wood, controlX, controlY);
        }
      }

      // Pristine winter snow crust on top of gently sloping/horizontal branches
      if (isWinterSeason && Math.abs(Math.sin(renderAngle)) < 0.72 && thickness >= 1.6) {
        ctx.save();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.92)";
        ctx.lineWidth = Math.max(1.1, Math.min(3.2, thickness * 0.42));
        ctx.lineCap = "round";
        ctx.beginPath();
        const snowOffset = thickness * 0.32;
        ctx.moveTo(startX, startY - snowOffset);
        ctx.quadraticCurveTo(controlX, controlY - snowOffset, endX, endY - snowOffset);
        ctx.stroke();
        ctx.restore();
      }

      // Copper wire winding if branch is wired with bonsai wire (living wood only)
      if (n.hasWire && !n.isJin) {
        ctx.save();
        ctx.strokeStyle = "#d97706"; // burnished copper
        ctx.lineWidth = Math.max(1.2, Math.min(2.4, thickness * 0.35));
        ctx.lineCap = "round";
        const coils = Math.max(4, Math.floor(length / 7));
        for (let i = 1; i <= coils; i++) {
          const t = i / (coils + 1);
          const pt = quadBezierPoint(startX, startY, controlX, controlY, endX, endY, t);
          const mt = 1 - t;
          const tx = 2 * mt * (controlX - startX) + 2 * t * (endX - controlX);
          const ty = 2 * mt * (controlY - startY) + 2 * t * (endY - controlY);
          const tLen = Math.hypot(tx, ty) || 1;
          const nx = -ty / tLen;
          const ny = tx / tLen;
          const halfW = (thickness / 2) + 1.2;
          
          ctx.beginPath();
          ctx.moveTo(pt.x - nx * halfW - (tx / tLen) * 1.5, pt.y - ny * halfW - (ty / tLen) * 1.5);
          ctx.lineTo(pt.x + nx * halfW + (tx / tLen) * 1.5, pt.y + ny * halfW + (ty / tLen) * 1.5);
          ctx.stroke();
        }
        ctx.restore();
      }

      // 1. Tension micro-fissures on outer curve of bent wired branches (Rinde platzt ab)
      if (n.barkFracture && n.barkFracture > 0 && !n.isJin) {
        ctx.save();
        const tensionSide = wireBend > 0 ? -1 : 1;
        const normAngle = chordAngle + (tensionSide * Math.PI) / 2;
        ctx.strokeStyle = state.darkMode ? "rgba(248, 113, 113, 0.85)" : "rgba(185, 28, 28, 0.85)";
        ctx.lineWidth = 1.2;
        const fissureCount = Math.max(2, Math.floor(n.barkFracture * 5));
        for (let fi = 1; fi <= fissureCount; fi++) {
          const ft = 0.3 + (fi / (fissureCount + 1)) * 0.4;
          const fPt = quadBezierPoint(startX, startY, controlX, controlY, endX, endY, ft);
          const fx1 = fPt.x + Math.cos(normAngle) * (thickness * 0.45);
          const fy1 = fPt.y + Math.sin(normAngle) * (thickness * 0.45);
          const fx2 = fPt.x + Math.cos(normAngle) * (thickness * 0.82);
          const fy2 = fPt.y + Math.sin(normAngle) * (thickness * 0.82);
          ctx.beginPath();
          ctx.moveTo(fx1, fy1);
          ctx.lineTo(fx2, fy2);
          ctx.stroke();
        }
        ctx.restore();
      }

      // 2. Wound Site: Clean Shears Cut vs. Jagged Splintered Fracture
      if (n.isCut && !n.isJin) {
        ctx.save();
        if (n.isBroken) {
          // Traumatic Snapped Fracture: Jagged splintered wood fibers, torn bark lips, weeping sap
          const splinters = n.breakSplinters || [0.9, 0.45, 0.85, 0.4, 0.75, 0.5];
          const breakDir = n.breakAngle ?? renderAngle;
          const bNormX = -Math.sin(breakDir);
          const bNormY = Math.cos(breakDir);
          const bDirX = Math.cos(breakDir);
          const bDirY = Math.sin(breakDir);

          // Torn, peeled bark lips hanging backwards on the tension side
          ctx.fillStyle = state.darkMode ? "#291307" : "#451a03";
          ctx.beginPath();
          ctx.moveTo(endX - bNormX * (thickness * 0.65), endY - bNormY * (thickness * 0.65));
          ctx.lineTo(endX - bNormX * (thickness * 0.85) - bDirX * 3.5, endY - bNormY * (thickness * 0.85) - bDirY * 3.5);
          ctx.lineTo(endX, endY);
          ctx.fill();

          // Jagged protruding heartwood splinter needles
          ctx.strokeStyle = state.darkMode ? "#f1f5f9" : "#fef08a";
          ctx.lineWidth = Math.max(0.8, thickness * 0.18);
          ctx.lineCap = "round";
          for (let si = 0; si < splinters.length; si++) {
            const frac = (si / (splinters.length - 1)) - 0.5;
            const spLen = splinters[si] * Math.max(3.5, thickness * 0.95);
            const bx = endX + bNormX * (frac * thickness * 0.95);
            const by = endY + bNormY * (frac * thickness * 0.95);
            ctx.beginPath();
            ctx.moveTo(bx, by);
            ctx.lineTo(bx + bDirX * spLen + ((si % 2) - 0.5) * 1.5, by + bDirY * spLen + ((si % 3) - 1) * 1.5);
            ctx.stroke();
          }

          // Weeping amber sap bead clinging to the wound face
          ctx.fillStyle = "rgba(245, 158, 11, 0.9)";
          ctx.beginPath();
          ctx.arc(endX + bDirX * 1.2, endY + bDirY * 1.2, Math.max(1.5, thickness * 0.35), 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Clean Shears Cut: Smooth cambium ring & heartwood core
          const callus = n.callusStage ?? 0.3;
          ctx.fillStyle = "#65a30d"; // green cambium
          ctx.beginPath();
          ctx.arc(endX, endY, Math.max(2.4, thickness * 0.65 + callus * 1.5), 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = "#e2d9cc"; // smooth heartwood core
          ctx.beginPath();
          ctx.arc(endX, endY, Math.max(1.2, thickness * 0.4 * (1 - callus * 0.35)), 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = "#78350f";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        ctx.restore();
      }

      // Dev Overlays
      if (devOptions?.showPoints) {
        ctx.save();
        ctx.fillStyle = n.isCut ? "#ffbb00" : "rgba(255, 255, 255, 0.4)";
        ctx.beginPath();
        ctx.arc(startX, startY, 2.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#38bdf8";
        ctx.beginPath();
        ctx.arc(endX, endY, 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      if (devOptions?.showIds) {
        ctx.save();
        ctx.fillStyle = state.darkMode ? "#f8fafc" : "#1e293b";
        ctx.font = "9px monospace";
        ctx.fillText(String(n.id), (startX + endX) / 2 + 3, (startY + endY) / 2 - 3);
        ctx.restore();
      }
    }
  }

  // 5. Render Multi-Morphology Leaves & Flowers Attached Precisely to Curved Branches
  const leafTypes = ["simple", "palmate", "pinnate", "lobed", "needle"] as const;
  const flowerTypes = ["solitary", "raceme", "umbel", "panicle", "compound"] as const;

  const leafTrait = expressTrait(g, "leafShape") || 0;
  const selectedLeafMorphology = leafTypes[Math.abs(leafTrait) % leafTypes.length];

  const inflorescenceTrait = expressTrait(g, "inflorescence");
  const selectedFlowerMorphology = flowerTypes[Math.abs(inflorescenceTrait) % flowerTypes.length];

  const flowerRGB = expressTrait(g, "flowerRGB") || [236, 72, 153];
  const basePetalColor = `rgb(${flowerRGB[0]}, ${flowerRGB[1]}, ${flowerRGB[2]})`;

  const seedHash = g ? Math.abs(JSON.stringify(g).split("").reduce((acc, char) => acc + char.charCodeAt(0), 0)) : 42;
  const rareExoticRoll = seedHash % 100;
  const baseHue = rareExoticRoll < 10 ? 35 : rareExoticRoll < 18 ? 340 : rareExoticRoll < 25 ? 270 : 90 + (seedHash % 120);

  for (const n of state.nodes) {
    if (n.type === "leaf" && n.fallState !== "falling") {
      const parentTr = n.parentId !== null ? globalStemTransforms.get(n.parentId) : undefined;
      let leafX: number;
      let leafY: number;
      let leafAngle: number;

      if (parentTr) {
        const attachT = n.attachT !== undefined ? n.attachT : 1.0;
        const pt = quadBezierPoint(parentTr.startX, parentTr.startY, parentTr.controlX, parentTr.controlY, parentTr.endX, parentTr.endY, attachT);
        leafX = pt.x;
        leafY = pt.y;
        const tangent = parentTr.startAngle + normalizeAngle(parentTr.renderAngle - parentTr.startAngle) * attachT;
        leafAngle = tangent + (n.id % 2 === 0 ? 0.7 : -0.7);
      } else {
        leafX = n.x;
        leafY = n.y;
        leafAngle = n.angle;
      }

      ctx.save();
      const maturity = Math.min(1.0, (n.age ?? 1) / 5.0);
      ctx.translate(leafX, leafY);
      ctx.rotate(leafAngle);
      ctx.scale(maturity, maturity);

      const leafHueOffset = (Math.abs(n.id * 17) % 25) - 12;
      const currentHue = (baseHue + leafHueOffset + 360) % 360;

      // Authentic Japanese Bonsai seasonal coloring:
      let effectiveHue = currentHue;
      let sat = state.darkMode ? 50 : 55;
      let lightBase = state.darkMode ? 28 + (n.id % 6) : 38 + (n.id % 6);
      let lightTip = state.darkMode ? 45 + (n.id % 6) : 52 + (n.id % 6);

      const isEvergreen =
        selectedLeafMorphology === "needle" ||
        state.speciesId === "pinus-thunbergii" ||
        state.speciesId === "bunjingi-pine" ||
        state.speciesId === "kengai-cascade";

      if (state.speciesId === "acer-palmatum") {
        // Acer Palmatum (Momiji): Iconic fiery Japanese maple foliage
        // Scarlet crimson, deep vermilion, and glowing amber
        const variant = Math.abs(n.id) % 3;
        effectiveHue = variant === 0 ? 354 : variant === 1 ? 12 : 26;
        sat = 76;
        lightBase = state.darkMode ? 34 : 44;
        lightTip = state.darkMode ? 48 : 56;
      } else if (isAutumnSeason && !isEvergreen) {
        // Deciduous autumn golden amber & rust transition
        effectiveHue = 32 + ((n.id * 13) % 20);
        sat = 70;
        lightBase = state.darkMode ? 36 : 46;
        lightTip = state.darkMode ? 50 : 58;
      }

      const activeBase = `hsl(${effectiveHue}, ${sat}%, ${lightBase}%)`;
      const activeTip = `hsl(${effectiveHue}, ${sat + 8}%, ${lightTip}%)`;

      drawModularLeaf(ctx, selectedLeafMorphology, 14, activeBase, activeTip);
      ctx.restore();
    } else if (n.type === "flower") {
      const parentTr = n.parentId !== null ? globalStemTransforms.get(n.parentId) : undefined;
      let flowerX: number;
      let flowerY: number;

      if (parentTr) {
        const attachT = n.attachT !== undefined ? n.attachT : 1.0;
        const pt = quadBezierPoint(parentTr.startX, parentTr.startY, parentTr.controlX, parentTr.controlY, parentTr.endX, parentTr.endY, attachT);
        flowerX = pt.x;
        flowerY = pt.y;
      } else {
        flowerX = n.x;
        flowerY = n.y;
      }

      ctx.save();
      ctx.translate(flowerX, flowerY);

      const isPolyploid = Math.abs(n.id * 13) % 11 === 0;
      const flowerScale = isPolyploid ? 1.4 : 1.0;
      ctx.scale(flowerScale, flowerScale);

      const petalCount = expressTrait(g, "petalCount") || 5;
      drawModularFlower(ctx, selectedFlowerMorphology, petalCount + (isPolyploid ? 2 : 0), 10, basePetalColor, "#facc15");
      ctx.restore();
    } else if (n.type === "bud") {
      const parentTr = n.parentId !== null ? globalStemTransforms.get(n.parentId) : undefined;
      let budX = n.x;
      let budY = n.y;
      if (parentTr) {
        const attachT = n.attachT !== undefined ? n.attachT : 1.0;
        const pt = quadBezierPoint(parentTr.startX, parentTr.startY, parentTr.controlX, parentTr.controlY, parentTr.endX, parentTr.endY, attachT);
        budX = pt.x;
        budY = pt.y;
      }
      ctx.fillStyle = "#f39c12";
      ctx.beginPath();
      ctx.arc(budX, budY, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 4. Horticultural Micro-Particles: Bark Flakes, Wood Shavings, Weeping Sap
  if (state.barkFlakes && state.barkFlakes.length > 0) {
    for (const flake of state.barkFlakes) {
      ctx.save();
      ctx.translate(flake.x, flake.y);
      ctx.rotate(flake.rot);
      ctx.fillStyle = state.darkMode
        ? `rgba(74, 38, 14, ${flake.alpha})`
        : `rgba(69, 26, 3, ${flake.alpha})`;
      ctx.fillRect(-flake.size / 2, -flake.size / 3, flake.size, flake.size * 0.65);
      ctx.restore();
    }
  }

  if (state.woodShavings && state.woodShavings.length > 0) {
    for (const sh of state.woodShavings) {
      ctx.save();
      ctx.translate(sh.x, sh.y);
      ctx.rotate(sh.rot);
      ctx.fillStyle = state.darkMode
        ? `rgba(226, 232, 240, ${sh.alpha})`
        : `rgba(241, 245, 249, ${sh.alpha})`;
      ctx.beginPath();
      ctx.arc(0, 0, sh.size * 0.7, 0, Math.PI * 1.5);
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = ctx.fillStyle;
      ctx.stroke();
      ctx.restore();
    }
  }

  if (state.sapDrops && state.sapDrops.length > 0) {
    for (const drop of state.sapDrops) {
      ctx.save();
      ctx.fillStyle = `rgba(245, 158, 11, ${drop.alpha})`;
      ctx.beginPath();
      ctx.ellipse(drop.x, drop.y, drop.size * 0.75, drop.size, 0, 0, Math.PI * 2);
      ctx.fill();
      // Specular highlight on sap bead
      ctx.fillStyle = `rgba(255, 255, 255, ${drop.alpha * 0.75})`;
      ctx.beginPath();
      ctx.arc(drop.x - drop.size * 0.25, drop.y - drop.size * 0.35, drop.size * 0.28, 0, Math.PI * 2);
      ctx.fill();
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

export interface SlashPoint {
  x: number;
  y: number;
  time: number;
}

export function renderBladeSlashTrail(
  ctx: CanvasRenderingContext2D,
  points: SlashPoint[],
  currentTime = Date.now(),
  maxAge = 350
): void {
  if (points.length < 2) return;

  ctx.save();
  for (let i = 1; i < points.length; i++) {
    const p0 = points[i - 1];
    const p1 = points[i];
    const age = currentTime - p1.time;
    if (age >= maxAge) continue;
    const progress = 1 - age / maxAge;
    const alpha = Math.max(0, Math.min(1, progress));

    // Outer ethereal glow (ruby blade streak)
    ctx.strokeStyle = `rgba(244, 63, 94, ${alpha * 0.45})`;
    ctx.lineWidth = 6 * progress;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();

    // Inner bright blade core
    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.95})`;
    ctx.lineWidth = 2 * progress;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
  }
  ctx.restore();
}

export interface WaterDroplet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
}

export function renderWaterDroplets(
  ctx: CanvasRenderingContext2D,
  droplets: WaterDroplet[]
): void {
  if (droplets.length === 0) return;
  ctx.save();
  for (const d of droplets) {
    if (d.alpha <= 0.01) continue;
    ctx.fillStyle = `rgba(186, 230, 253, ${d.alpha * 0.75})`;
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.radius, 0, Math.PI * 2);
    ctx.fill();

    // Specular glint
    ctx.fillStyle = `rgba(255, 255, 255, ${d.alpha * 0.9})`;
    ctx.beginPath();
    ctx.arc(d.x - d.radius * 0.3, d.y - d.radius * 0.3, d.radius * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Calculates world coordinates of the brass rose head (Hasuguchi) of the copper watering can.
 */
export function getCopperCanRosePosition(can: WateringCanState): { x: number; y: number; angle: number } {
  const cosT = Math.cos(can.tiltAngle);
  const sinT = Math.sin(can.tiltAngle);
  // Spout tip relative to can center at rest: (-44, -22)
  const localX = -44;
  const localY = -22;
  const worldX = can.x + (localX * cosT - localY * sinT);
  const worldY = can.y + (localX * sinT + localY * cosT);
  return {
    x: worldX,
    y: worldY,
    angle: -Math.PI * 0.62 + can.tiltAngle,
  };
}

/**
 * Procedurally renders an authentic Japanese copper bonsai watering can (Dō-sei Jōro / 銅製じょうろ).
 * Features a slender gooseneck spout, perforated brass rose (Hasuguchi), overhead arch handle,
 * rear tipping grip, and dynamic lift/tilt animation.
 */
export function renderCopperWateringCan(
  ctx: CanvasRenderingContext2D,
  can: WateringCanState
): void {
  if (!can || !can.active || can.alpha <= 0.01) return;

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, can.alpha));

  // Soft ambient ground shadow beneath the can
  const shadowY = can.y + 68;
  const shadowScale = Math.max(0.4, 1.0 - can.liftProgress * 0.25);
  ctx.fillStyle = "rgba(0, 0, 0, 0.16)";
  ctx.beginPath();
  ctx.ellipse(can.x - 6, shadowY, 30 * shadowScale, 7 * shadowScale, 0, 0, Math.PI * 2);
  ctx.fill();

  // Position and tilt the can smoothly
  ctx.translate(can.x, can.y);
  ctx.rotate(can.tiltAngle);

  // 1. Rear tipping grip handle
  ctx.strokeStyle = "#a84824";
  ctx.lineWidth = 3.6;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(18, -12);
  ctx.bezierCurveTo(40, -16, 42, 18, 19, 21);
  ctx.stroke();

  // Handle specular copper highlight
  ctx.strokeStyle = "#f39c6b";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(19, -11);
  ctx.bezierCurveTo(38, -14, 40, 16, 20, 19);
  ctx.stroke();

  // 2. Main hand-beaten copper vessel body
  const bodyGrad = ctx.createLinearGradient(-20, -18, 22, 22);
  bodyGrad.addColorStop(0, "#f3a67d"); // Specular copper highlight
  bodyGrad.addColorStop(0.28, "#cf6f42"); // Polished copper
  bodyGrad.addColorStop(0.70, "#994420"); // Deep red-copper
  bodyGrad.addColorStop(1, "#54210d"); // Shadowed copper base

  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.moveTo(-16, -17);
  ctx.lineTo(16, -17);
  ctx.lineTo(21, 21);
  ctx.lineTo(-19, 21);
  ctx.closePath();
  ctx.fill();

  // Subtle verdigris green patina seam and beaten copper ring
  ctx.strokeStyle = "rgba(78, 127, 110, 0.4)";
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(-18, 19);
  ctx.lineTo(20, 19);
  ctx.stroke();

  // Polished rim highlight
  ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(-14, -15);
  ctx.lineTo(14, -15);
  ctx.stroke();

  ctx.strokeStyle = "#6b2a12";
  ctx.lineWidth = 1.0;
  ctx.stroke();

  // 3. Top arch carrying handle
  ctx.strokeStyle = "#cf6f42";
  ctx.lineWidth = 3.2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-9, -17);
  ctx.bezierCurveTo(-13, -44, 13, -44, 9, -17);
  ctx.stroke();

  ctx.strokeStyle = "#f3a67d";
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(-7, -17);
  ctx.bezierCurveTo(-11, -41, 11, -41, 7, -17);
  ctx.stroke();

  // 4. Long slender gooseneck spout (Schwanenhals)
  const spoutGrad = ctx.createLinearGradient(-18, 14, -44, -22);
  spoutGrad.addColorStop(0, "#8c3b1a");
  spoutGrad.addColorStop(0.55, "#d97746");
  spoutGrad.addColorStop(1, "#f59e0b");

  ctx.strokeStyle = spoutGrad;
  ctx.lineWidth = 4.2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-18, 14);
  ctx.bezierCurveTo(-26, 12, -33, -3, -44, -22);
  ctx.stroke();

  // Spout inner highlight
  ctx.strokeStyle = "rgba(255, 240, 210, 0.7)";
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(-18, 13);
  ctx.bezierCurveTo(-26, 11, -33, -3, -43, -21);
  ctx.stroke();

  // 5. Perforated brass rose head (Hasuguchi / 蓮口)
  ctx.save();
  ctx.translate(-44, -22);
  ctx.rotate(-0.45);

  // Brass collar
  ctx.fillStyle = "#b45309";
  ctx.fillRect(-2, -3, 4, 6);

  // Perforated shower plate
  const roseGrad = ctx.createRadialGradient(0, 0, 1, 0, 0, 9);
  roseGrad.addColorStop(0, "#fef08a");
  roseGrad.addColorStop(0.55, "#eab308");
  roseGrad.addColorStop(1, "#78350f");

  ctx.fillStyle = roseGrad;
  ctx.beginPath();
  ctx.ellipse(0, 0, 8.5, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#fef9c3";
  ctx.lineWidth = 0.8;
  ctx.stroke();

  // Perforated water jet holes
  ctx.fillStyle = "#451a03";
  const holeOffsets = [
    [0, 0], [-4, 0], [4, 0],
    [-2, -2], [2, -2], [-2, 2], [2, 2],
  ];
  for (const [hx, hy] of holeOffsets) {
    ctx.beginPath();
    ctx.arc(hx, hy, 0.7, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
  ctx.restore();
}

/**
 * Renders fine arched streaming water lines (dünne Wasserstriche)
 * spraying in a gentle parabolic fan from the watering can.
 */
export function renderWaterStreams(
  ctx: CanvasRenderingContext2D,
  streams: WaterStreamJet[]
): void {
  if (!streams || streams.length === 0) return;

  ctx.save();
  ctx.lineCap = "round";

  for (const s of streams) {
    if (s.alpha <= 0.01) continue;
    const speed = Math.hypot(s.vx, s.vy);
    if (speed < 0.1) continue;

    const tailLen = Math.min(s.len, speed * 0.12);
    const tailX = s.x - (s.vx / speed) * tailLen;
    const tailY = s.y - (s.vy / speed) * tailLen;

    // Outer translucent azure stream jet line
    ctx.strokeStyle = `rgba(186, 230, 253, ${s.alpha * 0.78})`;
    ctx.lineWidth = s.thickness || 1.2;
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(s.x, s.y);
    ctx.stroke();

    // Inner bright specular core
    ctx.strokeStyle = `rgba(255, 255, 255, ${s.alpha * 0.95})`;
    ctx.lineWidth = Math.max(0.6, (s.thickness || 1.2) * 0.45);
    ctx.beginPath();
    ctx.moveTo(tailX + (s.x - tailX) * 0.35, tailY + (s.y - tailY) * 0.35);
    ctx.lineTo(s.x, s.y);
    ctx.stroke();
  }

  ctx.restore();
}
