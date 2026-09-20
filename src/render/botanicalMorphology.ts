/**
 * ZenPlant - Botanical Morphology & Anatomy Renderer
 * Renders scientifically accurate leaf venation and modular flower anatomies.
 */

export function drawBotanicalLeaf(
  ctx: CanvasRenderingContext2D,
  leafShapeTrait: number,
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

  const shapeType = Math.abs(leafShapeTrait) % 4;

  if (shapeType === 0) {
    // Palmate (Maple / Fan style)
    for (let i = -2; i <= 2; i++) {
      ctx.save();
      ctx.rotate((i * Math.PI) / 6);
      ctx.beginPath();
      ctx.ellipse(0, -size * 0.5, size * 0.2, size * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  } else if (shapeType === 1) {
    // Pinnate (Feather / Compound style)
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 0.7, size * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    for (let i = -2; i <= 2; i++) {
      if (i === 0) continue;
      ctx.beginPath();
      ctx.ellipse(i * size * 0.35, i * size * 0.1, size * 0.22, size * 0.12, 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  } else if (shapeType === 2) {
    // Lobed (Oak style)
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.8);
    ctx.bezierCurveTo(size * 0.7, -size * 0.4, size * 0.8, size * 0.4, 0, size * 0.8);
    ctx.bezierCurveTo(-size * 0.8, size * 0.4, -size * 0.7, -size * 0.4, 0, -size * 0.8);
    ctx.fill();
    ctx.stroke();
  } else {
    // Simple Elliptic with Venation
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 0.75, size * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Midrib & Veins
    ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    ctx.moveTo(-size * 0.6, 0);
    ctx.lineTo(size * 0.6, 0);
    ctx.stroke();
  }

  ctx.restore();
}

export function drawBotanicalFlower(
  ctx: CanvasRenderingContext2D,
  petalCount: number,
  radius: number,
  petalColor: string,
  stamenColor: string
): void {
  ctx.save();
  const count = Math.max(3, Math.min(10, petalCount));

  // Draw sepals underneath
  ctx.fillStyle = "#15803d";
  for (let s = 0; s < 3; s++) {
    const angle = (s / 3) * Math.PI * 2 + Math.PI / 4;
    ctx.save();
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.ellipse(0, -radius * 0.9, radius * 0.3, radius * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Draw petals
  ctx.fillStyle = petalColor;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.15)";
  ctx.lineWidth = 1;

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    ctx.save();
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.ellipse(0, -radius * 0.75, radius * 0.45, radius * 0.75, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // Draw flower center / stamens
  ctx.fillStyle = stamenColor;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.32, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}
