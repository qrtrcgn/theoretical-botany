import type { PlantNode, Genome } from "../sim/types";

/**
 * Modular Botanical Leaf & Flower Morphology Engine
 * Implements botanical leaf venation and modular flower structures (petals, sepals, stamens)
 * driven by hereditary genetic traits.
 */

export type LeafMorphology = "simple" | "palmate" | "pinnate" | "needle" | "scale" | "lobed";
export type FlowerMorphology = "solitary" | "raceme" | "umbel" | "panicle" | "compound";

export function drawModularLeaf(
  ctx: CanvasRenderingContext2D,
  morphology: LeafMorphology,
  size: number,
  color: string,
  highlightColor: string
): void {
  ctx.save();
  const grad = ctx.createRadialGradient(0, 0, 1, 0, 0, size);
  grad.addColorStop(0, highlightColor);
  grad.addColorStop(1, color);
  ctx.fillStyle = grad;

  ctx.strokeStyle = "rgba(0, 0, 0, 0.25)";
  ctx.lineWidth = 0.75;

  if (morphology === "needle") {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -size * 1.8);
    ctx.stroke();
  } else if (morphology === "palmate") {
    for (let i = -2; i <= 2; i++) {
      ctx.save();
      ctx.rotate((i * Math.PI) / 6);
      ctx.beginPath();
      ctx.ellipse(0, -size * 0.5, size * 0.2, size * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  } else if (morphology === "pinnate") {
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 0.6, size * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Lateral leaflets
    for (let i = -2; i <= 2; i++) {
      if (i === 0) continue;
      ctx.beginPath();
      ctx.ellipse(i * size * 0.3, i * size * 0.1, size * 0.2, size * 0.12, 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  } else if (morphology === "lobed") {
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.8);
    ctx.bezierCurveTo(size * 0.6, -size * 0.4, size * 0.8, size * 0.4, 0, size * 0.8);
    ctx.bezierCurveTo(-size * 0.8, size * 0.4, -size * 0.6, -size * 0.4, 0, -size * 0.8);
    ctx.fill();
    ctx.stroke();
  } else {
    // Simple elliptic default leaf
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 0.7, size * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

export function drawModularFlower(
  ctx: CanvasRenderingContext2D,
  morphology: FlowerMorphology,
  petalCount: number,
  radius: number,
  petalColor: string,
  stamenColor: string
): void {
  ctx.save();
  const count = Math.max(3, Math.min(12, petalCount));

  if (morphology === "umbel" || morphology === "compound") {
    // Multi-floret inflorescence cluster
    for (let f = 0; f < 5; f++) {
      ctx.save();
      const angle = (f / 5) * Math.PI * 2;
      ctx.translate(Math.cos(angle) * radius * 0.8, Math.sin(angle) * radius * 0.8);
      drawSingleFloret(ctx, count, radius * 0.5, petalColor, stamenColor);
      ctx.restore();
    }
  } else {
    drawSingleFloret(ctx, count, radius, petalColor, stamenColor);
  }

  ctx.restore();
}

function drawSingleFloret(
  ctx: CanvasRenderingContext2D,
  count: number,
  radius: number,
  petalColor: string,
  stamenColor: string
): void {
  // Draw petals
  ctx.fillStyle = petalColor;
  ctx.strokeStyle = "rgba(0,0,0,0.15)";
  ctx.lineWidth = 1;

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    ctx.save();
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.ellipse(0, -radius * 0.7, radius * 0.4, radius * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // Draw flower center / stamens
  ctx.fillStyle = stamenColor;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.3, 0, Math.PI * 2);
  ctx.fill();
}
