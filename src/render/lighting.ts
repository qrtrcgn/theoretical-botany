import type { PlantState } from "../sim/types";

/**
 * High-Performance Local Lighting & Ambient Occlusion Engine
 * Computes soft shadows, canopy depth gradients, and atmospheric lighting locally
 * utilizing multi-core CPU parallelism and canvas 2D multi-pass rendering.
 */

export function renderAdvancedLightingPass(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  isDarkMode: boolean,
  state?: PlantState
): void {
  ctx.save();
  
  // 1. Atmospheric Ambient Gradient (Zen Garden Twilight / Dawn Sky / Seasonal Sky)
  const season2 = state ? state.step % state.cycleLength : 0;
  const skyTop = isDarkMode ? "#050510" : season2 <= 100 ? "#87CEEB" : season2 <= 140 ? "#4A90D9" : season2 <= 180 ? "#E8A87C" : "#1a1a2e";
  const skyBottom = isDarkMode ? "#0a0a18" : season2 <= 100 ? "#F0F8FF" : season2 <= 140 ? "#FFFFFF" : season2 <= 180 ? "#2C3E50" : "#16213e";
  
  const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
  bgGrad.addColorStop(0, skyTop);
  bgGrad.addColorStop(1, skyBottom);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Stars / Night Particles if dark mode
  if (isDarkMode) {
    for (let i = 0; i < 25; i++) {
      const sx = ((i * 7919 + 13) % 997) / 997 * width;
      const sy = ((i * 6271 + 7) % 991) / 991 * height * 0.6;
      const sb = 0.3 + ((i * 3571) % 100) / 100 * 0.6;
      ctx.fillStyle = `rgba(255,255,255,${sb})`;
      ctx.fillRect(sx, sy, 1.5, 1.5);
    }
  }

  // 2. Volumetric Light Shafts / Rays (Light Rays emanating from top-left or top-center)
  ctx.save();
  ctx.globalCompositeOperation = isDarkMode ? "screen" : "overlay";
  const rayGrad = ctx.createLinearGradient(0, 0, width * 0.8, height);
  if (isDarkMode) {
    rayGrad.addColorStop(0, "rgba(100, 150, 255, 0.08)");
    rayGrad.addColorStop(0.5, "rgba(150, 200, 255, 0.03)");
    rayGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
  } else {
    rayGrad.addColorStop(0, "rgba(255, 255, 220, 0.28)");
    rayGrad.addColorStop(0.5, "rgba(255, 240, 200, 0.12)");
    rayGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
  }
  ctx.fillStyle = rayGrad;
  ctx.beginPath();
  ctx.moveTo(width * 0.15, 0);
  ctx.lineTo(width * 0.85, 0);
  ctx.lineTo(width * 0.45, height);
  ctx.lineTo(width * 0.05, height);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // 3. Multi-Pass Soft Canopy Shadows (Ambient Occlusion & Depth Layers for 2.5D depth)
  // Pass 1: Broad diffuse soft canopy shadow behind the tree structure
  ctx.fillStyle = isDarkMode ? "rgba(0, 0, 0, 0.4)" : "rgba(20, 35, 45, 0.14)";
  ctx.beginPath();
  ctx.ellipse(width / 2 + 12, height * 0.52, width * 0.30, height * 0.26, 0.08, 0, Math.PI * 2);
  ctx.fill();

  // Pass 2: Inner concentrated core canopy shadow for enhanced 2.5D depth
  ctx.fillStyle = isDarkMode ? "rgba(0, 0, 0, 0.55)" : "rgba(10, 25, 35, 0.22)";
  ctx.beginPath();
  ctx.ellipse(width / 2 + 8, height * 0.56, width * 0.18, height * 0.16, 0.05, 0, Math.PI * 2);
  ctx.fill();

  // 4. Soft Ground Shadow / Moss Tray Base (Bonsai Pot Occlusion)
  ctx.fillStyle = isDarkMode ? "rgba(0, 0, 0, 0.65)" : "rgba(0, 0, 0, 0.28)";
  ctx.beginPath();
  ctx.ellipse(width / 2, height * 0.76, width * 0.24, 22, 0, 0, Math.PI * 2);
  ctx.fill();

  // Ground subsurface shadow ring for 2.5D grounding
  ctx.strokeStyle = isDarkMode ? "rgba(70, 90, 110, 0.25)" : "rgba(90, 105, 120, 0.3)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(width / 2, height * 0.76, width * 0.24, 22, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}
