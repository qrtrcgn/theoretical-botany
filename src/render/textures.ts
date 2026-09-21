import type { Genome } from "../sim/types";

/**
 * Advanced Botanical Textures & Venation Renderer
 * Adds multi-layered wood bark grain, realistic leaf venation patterns, and hereditary petal morphology.
 */

export function renderLeafVenation(ctx: CanvasRenderingContext2D, size: number, leafShape: number): void {
  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
  ctx.lineWidth = Math.max(0.75, size * 0.04);
  
  // Midrib
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.4);
  ctx.lineTo(0, size * 0.4);
  ctx.stroke();

  // Lateral veins (pinnate or palmate depending on leafShape)
  const veinCount = 7;
  for (let i = 0; i < veinCount; i++) {
    const yPos = -size * 0.3 + (i / (veinCount - 1)) * size * 0.6;
    const veinLen = size * 0.35 * (1 - Math.abs(i - veinCount / 2) / (veinCount / 2));
    
    ctx.beginPath();
    ctx.moveTo(0, yPos);
    ctx.quadraticCurveTo(veinLen * 0.5, yPos - size * 0.05, veinLen, yPos - size * 0.1);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, yPos);
    ctx.quadraticCurveTo(-veinLen * 0.5, yPos - size * 0.05, -veinLen, yPos - size * 0.1);
    ctx.stroke();
  }
  ctx.restore();
}

export function renderWoodBarkTexture(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  thick: number,
  woodiness: number,
  cx?: number,
  cy?: number
): void {
  if (thick < 2.0 || woodiness <= 0) return;
  ctx.save();
  ctx.strokeStyle = `rgba(30, 15, 5, ${0.35 * woodiness})`;
  ctx.lineWidth = Math.max(0.5, thick * 0.15);
  ctx.lineCap = "round";

  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 2) {
    ctx.restore();
    return;
  }

  const nx = -dy / len;
  const ny = dx / len;
  const off = thick * 0.3;

  if (cx !== undefined && cy !== undefined) {
    // Longitudinal fissured bark grooves along quadratic bezier curvature
    ctx.beginPath();
    ctx.moveTo(x1 + nx * off, y1 + ny * off);
    ctx.quadraticCurveTo(cx + nx * off, cy + ny * off, x2 + nx * off, y2 + ny * off);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x1 - nx * off, y1 - ny * off);
    ctx.quadraticCurveTo(cx - nx * off, cy - ny * off, x2 - nx * off, y2 - ny * off);
    ctx.stroke();
  } else {
    // Linear fissured bark grooves
    ctx.beginPath();
    ctx.moveTo(x1 + nx * off, y1 + ny * off);
    ctx.lineTo(x2 + nx * off, y2 + ny * off);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x1 - nx * off, y1 - ny * off);
    ctx.lineTo(x2 - nx * off, y2 - ny * off);
    ctx.stroke();
  }

  ctx.restore();
}
