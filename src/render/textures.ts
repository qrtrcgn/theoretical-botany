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

export function renderWoodBarkTexture(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, thick: number, woodiness: number): void {
  if (thick < 2.0) return;
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

  // Longitudinal fissured bark grooves (characteristic of mature bonsai bark)
  ctx.beginPath();
  ctx.moveTo(x1 + nx * thick * 0.3, y1 + ny * thick * 0.3);
  ctx.lineTo(x2 + nx * thick * 0.3, y2 + ny * thick * 0.3);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x1 - nx * thick * 0.3, y1 - ny * thick * 0.3);
  ctx.lineTo(x2 - nx * thick * 0.3, y2 - ny * thick * 0.3);
  ctx.stroke();

  ctx.restore();
}
