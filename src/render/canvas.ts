import type { Genome, PlantState, PlantNode } from "../sim/types";

export interface ViewTransform { scale: number; ox: number; oy: number; }

export interface WindPos { wx: number; wy: number; wAngle: number; }

let lastWindDisp = new Map<number, WindPos>();
export function getWindDisp(): Map<number, WindPos> { return lastWindDisp; }

function noise1D(x: number): number {
  const xi = Math.floor(x);
  const xf = x - xi;
  const t = xf * xf * (3 - 2 * xf);
  const a = Math.sin(xi * 127.1 + 311.7) * 43758.5453;
  const b = Math.sin((xi + 1) * 127.1 + 311.7) * 43758.5453;
  return (a - Math.floor(a)) + ((b - Math.floor(b)) - (a - Math.floor(a))) * t;
}

function fbm(x: number, octaves: number = 3): number {
  let val = 0, amp = 0.5, freq = 1;
  for (let i = 0; i < octaves; i++) {
    val += amp * noise1D(x * freq);
    amp *= 0.5;
    freq *= 2.1;
  }
  return val;
}

export function computeTransform(
  w: number,
  h: number,
  showRoots: boolean,
  cameraX: number = 0,
  cameraY: number = 0,
  cameraZoom: number = 1.0
): ViewTransform {
  const baseScale = Math.min(w / 400, h / (showRoots ? 650 : 500));
  const scale = baseScale * cameraZoom;
  const oy = (showRoots ? h * 0.6 : h - 50) + cameraY;
  const ox = w / 2 + cameraX;
  return { scale, ox, oy };
}

export function seasonOf(step: number, cycleLength = 250): { name: string; color: string; season: number } {
  const season = step % cycleLength;
  if (season <= 100) return { name: "Frühling", color: "#f39c12", season };
  if (season <= 140) return { name: "Sommer", color: "#26ad61", season };
  if (season <= 180) return { name: "Herbst", color: "#d35400", season };
  return { name: "Winter", color: "#94a3b8", season };
}

function hash01(seed: number, salt: number): number {
  const h = Math.sin(seed * 127.1 + salt * 311.7) * 43758.5453;
  return h - Math.floor(h);
}

function drawSepals(ctx: CanvasRenderingContext2D, count: number, radius: number, seed = 1): void {
  ctx.save();
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    ctx.save();
    ctx.rotate(a);
    ctx.fillStyle = `rgb(${60 + Math.floor(hash01(seed + i, 1) * 15)},${100 + Math.floor(hash01(seed + i, 2) * 20)},${45 + Math.floor(hash01(seed + i, 3) * 10)})`;
    ctx.beginPath();
    ctx.moveTo(-radius * 0.1, 0);
    ctx.quadraticCurveTo(radius * 0.15, -radius * 0.18, radius * 0.65, -radius * 0.05);
    ctx.quadraticCurveTo(radius * 0.45, 0, radius * 0.65, radius * 0.05);
    ctx.quadraticCurveTo(radius * 0.15, radius * 0.18, -radius * 0.1, 0);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,60,0,0.25)";
    ctx.lineWidth = 0.3;
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

function drawPetals(ctx: CanvasRenderingContext2D, count: number, radius: number, genome: Genome): void {
  const rgb = genome.flowerRGB;
  const r = rgb[0], g = rgb[1], b = rgb[2];
  ctx.save();
  for (let i = 0; i < count; i++) {
    const frac = i / count;
    const a = genome.symmetry === 1
      ? (i - (count - 1) / 2) * 0.4
      : frac * Math.PI * 2;
    const variation = 0.85 + Math.sin(i * 2.7) * 0.15;
    const pr = Math.min(255, Math.floor(r * variation + 30));
    const pg = Math.min(255, Math.floor(g * variation + 10));
    const pb = Math.min(255, Math.floor(b * variation + 10));

    ctx.save();
    ctx.rotate(a);

    const grad = ctx.createRadialGradient(radius * 0.2, 0, 0, radius * 0.2, 0, radius);
    grad.addColorStop(0, `rgb(${Math.min(255, pr + 50)},${Math.min(255, pg + 40)},${Math.min(255, pb + 40)})`);
    grad.addColorStop(0.5, `rgb(${pr},${pg},${pb})`);
    grad.addColorStop(1, `rgb(${Math.max(0, pr - 30)},${Math.max(0, pg - 30)},${Math.max(0, pb - 20)})`);

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(
      radius * 0.15, -radius * 0.35 * variation,
      radius * 0.75, -radius * 0.28 * variation,
      radius * 0.95, 0
    );
    ctx.bezierCurveTo(
      radius * 0.75, radius * 0.28 * variation,
      radius * 0.15, radius * 0.35 * variation,
      0, 0
    );
    ctx.fill();

    ctx.strokeStyle = `rgba(${Math.max(0, pr - 40)},${Math.max(0, pg - 40)},${Math.max(0, pb - 30)},0.3)`;
    ctx.lineWidth = 0.3;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(radius * 0.1, 0);
    ctx.lineTo(radius * 0.85, 0);
    ctx.strokeStyle = `rgba(${Math.max(0, pr - 20)},${Math.max(0, pg - 20)},${Math.max(0, pb - 15)},0.15)`;
    ctx.lineWidth = 0.4;
    ctx.stroke();

    ctx.restore();
  }
  ctx.restore();
}

function drawStamens(ctx: CanvasRenderingContext2D, count: number, radius: number, seed = 1): void {
  ctx.save();
  for (let i = 0; i < count; i++) {
    const spiralOffset = (i / count) * Math.PI * 2 + (i * 0.618 * Math.PI * 2);
    const len = radius * 0.35 + (i / count) * radius * 0.25;
    const curveFactor = 0.15 * Math.sin(spiralOffset);
    const ex = Math.cos(spiralOffset) * len;
    const ey = Math.sin(spiralOffset) * len + curveFactor * len;

    ctx.strokeStyle = `rgb(${180 + Math.floor(hash01(seed + i, 11) * 20)},${155 + Math.floor(hash01(seed + i, 12) * 15)},${60})`;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(ex * 0.4, ey * 0.6, ex, ey);
    ctx.stroke();

    ctx.fillStyle = `rgb(${230 + Math.floor(hash01(seed + i, 13) * 25)},${200 + Math.floor(hash01(seed + i, 14) * 20)},${60 + Math.floor(hash01(seed + i, 15) * 20)})`;
    ctx.beginPath();
    ctx.arc(ex, ey, 1.0 + hash01(seed + i, 16) * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawPistil(ctx: CanvasRenderingContext2D, radius: number): void {
  ctx.save();
  ctx.strokeStyle = "#6b8a3f";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(0.5, -radius * 0.2, 0, -radius * 0.4);
  ctx.stroke();

  const grad = ctx.createRadialGradient(0, -radius * 0.42, 0, 0, -radius * 0.42, 2.5);
  grad.addColorStop(0, "#c4e07a");
  grad.addColorStop(0.6, "#98b84f");
  grad.addColorStop(1, "#6b8a3f");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(0, -radius * 0.42, 2, 2.8, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(80,120,40,0.3)";
  ctx.lineWidth = 0.4;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, -radius * 0.38);
    ctx.quadraticCurveTo(Math.cos(a) * 1.5, -radius * 0.45, Math.cos(a) * 3, -radius * 0.5);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawFlower(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, depth: number, genome: Genome, seed = 1): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(genome.flowerStretch[0], genome.flowerStretch[1]);
  const radius = Math.max(2, genome.flowerRadius * Math.pow(0.9, depth));

  if (genome.flowerMaterial === 1) {
    const rgb = `rgb(${genome.flowerRGB[0]},${genome.flowerRGB[1]},${genome.flowerRGB[2]})`;
    ctx.shadowBlur = 8;
    ctx.shadowColor = rgb;
  }

  drawSepals(ctx, genome.sepalCount, radius * 0.75, seed);

  if (genome.flowerMaterial === 2) {
    const rgb = `rgb(${genome.flowerRGB[0]},${genome.flowerRGB[1]},${genome.flowerRGB[2]})`;
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.4, rgb);
    grad.addColorStop(1, rgb);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  drawPetals(ctx, genome.petalCount, radius, genome);
  drawStamens(ctx, genome.stamenCount, radius * 0.55, seed);
  drawPistil(ctx, radius);

  if (genome.flowerMaterial === 1) {
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

function drawLeafShape(ctx: CanvasRenderingContext2D, shape: number, size: number, season: number, node?: PlantNode): void {
  let c = "#2ecc71";
  const hueShift = node ? node.leafHueShift : 0;
  if (season > 140 && season <= 180) c = season - 140 > 20 ? "#e67e22" : "#f1c40f";
  else if (season > 180) c = "#8b6914";
  else if (hueShift > 5) c = "#3ddc84";
  else if (hueShift < -5) c = "#1fa855";

  const s = node ? Math.abs((shape + node.leafShapeJitter) % 7) : Math.abs(shape % 7);
  ctx.fillStyle = c;
  ctx.strokeStyle = "rgba(0,0,0,0.15)";
  ctx.lineWidth = 0.4;

  if (s === 0) {
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 0.5, size * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-size * 0.45, 0);
    ctx.lineTo(size * 0.45, 0);
    ctx.stroke();
  } else if (s === 1) {
    ctx.beginPath();
    ctx.ellipse(-size * 0.15, 0, size * 0.35, size * 0.11, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(size * 0.15, 0, size * 0.35, size * 0.11, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (s === 2) {
    ctx.beginPath();
    ctx.moveTo(-size * 0.4, 0);
    for (let i = 0; i < 8; i++) {
      const t = i / 7;
      const x = -size * 0.4 + t * size * 0.8;
      const y = (i % 2 === 0 ? -1 : 1) * size * 0.06;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(size * 0.4, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (s === 3) {
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.4);
    ctx.quadraticCurveTo(size * 0.5, -size * 0.1, size * 0.35, size * 0.2);
    ctx.quadraticCurveTo(size * 0.15, size * 0.35, 0, size * 0.4);
    ctx.quadraticCurveTo(-size * 0.15, size * 0.35, -size * 0.35, size * 0.2);
    ctx.quadraticCurveTo(-size * 0.5, -size * 0.1, 0, -size * 0.4);
    ctx.fill();
    ctx.stroke();
  } else if (s === 4) {
    ctx.strokeStyle = c;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.4);
    ctx.lineTo(0, size * 0.4);
    ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const y = -size * 0.3 + i * size * 0.12;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size * 0.15, y - size * 0.05);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(-size * 0.15, y - size * 0.05);
      ctx.stroke();
    }
  } else if (s === 5) {
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.35);
    ctx.bezierCurveTo(size * 0.5, -size * 0.2, size * 0.4, size * 0.3, 0, size * 0.4);
    ctx.bezierCurveTo(-size * 0.4, size * 0.3, -size * 0.5, -size * 0.2, 0, -size * 0.35);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 0.45, size * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

function drawInflorescence(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, depth: number, genome: Genome, infType: number, seed = 1): void {
  const t = Math.abs(infType % 6);
  if (t === 0) {
    drawFlower(ctx, x, y, angle, depth, genome, seed);
    return;
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const count = t === 5 ? 12 : 5;
  const spread = t === 2 ? 0.8 : t === 4 ? 0.4 : 0.3;
  for (let i = 0; i < count; i++) {
    const frac = (i - (count - 1) / 2) / count;
    let fx = 0, fy = 0, fa = 0;
    if (t === 1) {
      fy = frac * 30;
      fa = frac * 0.2;
    } else if (t === 2) {
      fx = Math.cos(frac * Math.PI) * 15;
      fy = Math.sin(frac * Math.PI) * 5 - 10;
      fa = frac * 0.3;
    } else if (t === 3) {
      fy = frac * 20;
    } else if (t === 4) {
      fx = frac * 20;
      fy = -5;
    } else {
      const a = (i / count) * Math.PI * 2;
      fx = Math.cos(a) * 8;
      fy = Math.sin(a) * 8 - 5;
    }
    drawFlower(ctx, fx, fy, fa, depth + 1, genome, seed + i * 17);
  }
  ctx.restore();
}

function drawWoodSegment(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, thick: number, wood: number, roughness: number, woodTexture = true): void {
  const r = Math.round(140 * wood + 38 * (1 - wood));
  const g = Math.round(69 * wood + 173 * (1 - wood));
  const b = Math.round(18 * wood + 97 * (1 - wood));
  ctx.strokeStyle = `rgb(${r},${g},${b})`;
  ctx.lineWidth = thick;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  if (woodTexture && roughness > 0.2) {
    ctx.strokeStyle = `rgba(${r + 20},${g + 10},${b},0.3)`;
    ctx.lineWidth = thick * 0.3;
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 0) {
      const nx = -dy / len, ny = dx / len;
      ctx.beginPath();
      ctx.moveTo(x1 + nx * thick * 0.2, y1 + ny * thick * 0.2);
      ctx.lineTo(x2 + nx * thick * 0.2, y2 + ny * thick * 0.2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x1 - nx * thick * 0.2, y1 - ny * thick * 0.2);
      ctx.lineTo(x2 - nx * thick * 0.2, y2 - ny * thick * 0.2);
      ctx.stroke();
    }
  }
}

function drawBezierStem(ctx: CanvasRenderingContext2D, sx: number, sy: number, ex: number, ey: number, angle: number, n: PlantNode, wood: number, roughness: number, localWind: number, woodTexture = true): void {
  const thick = Math.max(0.5, 3.5 * Math.pow(0.7, n.depth));
  const curve = n.curve + localWind * 0.5;
  if (Math.abs(curve) < 0.05) {
    drawWoodSegment(ctx, sx, sy, ex, ey, thick, wood, roughness, woodTexture);
    return;
  }
  const mx = (sx + ex) / 2;
  const my = (sy + ey) / 2;
  const perpX = -(ey - sy);
  const perpY = ex - sx;
  const clen = Math.sqrt(perpX * perpX + perpY * perpY) || 1;
  const cx = mx + (perpX / clen) * curve * n.length * 0.4;
  const cy = my + (perpY / clen) * curve * n.length * 0.4;
  const r = Math.round(140 * wood + 38 * (1 - wood));
  const g = Math.round(69 * wood + 173 * (1 - wood));
  const b = Math.round(18 * wood + 97 * (1 - wood));
  ctx.strokeStyle = `rgb(${r},${g},${b})`;
  ctx.lineWidth = thick;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.quadraticCurveTo(cx, cy, ex, ey);
  ctx.stroke();
}

export function renderPlant(ctx: CanvasRenderingContext2D, state: PlantState, w: number, h: number): string {
  const { name, color } = seasonOf(state.step, state.cycleLength);
  const isDark = state.darkMode;
  const season2 = state.step % state.cycleLength;

  const skyTop = isDark ? "#050510" : season2 <= 100 ? "#87CEEB" : season2 <= 140 ? "#4A90D9" : season2 <= 180 ? "#E8A87C" : "#1a1a2e";
  const skyBottom = isDark ? "#0a0a18" : season2 <= 100 ? "#F0F8FF" : season2 <= 140 ? "#FFFFFF" : season2 <= 180 ? "#2C3E50" : "#16213e";
  const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
  skyGrad.addColorStop(0, skyTop);
  skyGrad.addColorStop(1, skyBottom);
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, w, h);

  if (isDark) {
    for (let i = 0; i < 20; i++) {
      const sx = ((i * 7919 + 13) % 997) / 997 * w;
      const sy = ((i * 6271 + 7) % 991) / 991 * h * 0.6;
      const sb = 0.3 + ((i * 3571) % 100) / 100 * 0.5;
      ctx.fillStyle = `rgba(255,255,255,${sb})`;
      ctx.fillRect(sx, sy, 1.2, 1.2);
    }
  }

  const { scale, ox, oy } = computeTransform(
    w,
    h,
    state.showRoots,
    state.cameraX ?? 0,
    state.cameraY ?? 0,
    state.cameraZoom ?? 1.0
  );

  const groundY = 0;
  const soilGrad = ctx.createLinearGradient(0, groundY - 8, 0, groundY + 20);
  soilGrad.addColorStop(0, isDark ? "rgba(60,40,20,0)" : "rgba(120,90,50,0)");
  soilGrad.addColorStop(0.3, isDark ? "rgba(60,40,20,0.3)" : "rgba(120,90,50,0.25)");
  soilGrad.addColorStop(1, isDark ? "rgba(60,40,20,0.6)" : "rgba(120,90,50,0.5)");
  ctx.fillStyle = soilGrad;
  ctx.fillRect(-w, groundY, w * 2, 25);
  ctx.strokeStyle = isDark ? "rgba(120,80,40,0.25)" : "rgba(120,90,50,0.3)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-w, groundY);
  ctx.lineTo(w, groundY);
  ctx.stroke();

  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);

  const windPhase = state.windTime;

  for (let i = 0; i < 20; i++) {  // was 50 - reduced wind lines for performance
    const gx = ((i * 7919 + 31) % 997) / 997 * 400 - 200;
    const hue = 90 + ((i * 3571) % 40);
    const lightness = isDark ? 20 : 35;
    ctx.strokeStyle = `hsl(${hue}, 60%, ${lightness}%)`;
    ctx.lineWidth = 1;
    const sway = Math.sin(windPhase * 0.5 + i * 0.3) * 2;
    const bladeH = 5 + ((i * 1237) % 10);
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.quadraticCurveTo(gx + sway, -bladeH * 0.6, gx + sway * 1.5, -bladeH);
    ctx.stroke();
  }

if (season2 > 100 && season2 <= 140) {
    const flowers = state.nodes.filter((n) => n.type === "flower");
    if (flowers.length > 0 && state.particles.length < 60) {
      const f = flowers[Math.floor(Math.sin(state.step * 13) * 0.5 + 0.5 * flowers.length)];
      state.particles.push({
        x: f.x, y: f.y, vx: (Math.sin(f.id) * 0.3), vy: -0.3,
        life: 3, maxLife: 3, size: 1.5, color: "#FFE066",
        type: "pollen", rotation: 0, rotSpeed: 0,
      });
    }
  }
  if (season2 > 140 && season2 <= 180) {
    const leaves = state.nodes.filter((n) => n.type === "leaf");
    if (leaves.length > 0 && state.particles.length < 50) {
      const l = leaves[Math.floor(Math.abs(Math.sin(state.step * 7 + leaves.length)) * leaves.length)];
      state.particles.push({
        x: l.x, y: l.y, vx: Math.sin(l.id) * 0.5, vy: 0.5,
        life: 4, maxLife: 4, size: 3,
        color: l.id % 2 === 0 ? "#D4722A" : "#C0392B",
        type: "leaf", rotation: (l.id % 3) * 1.0, rotSpeed: 0.2,
      });
    }
  }

  // Throttle particle updates - only recompute every 2 frames
  const particleFrame = state.step % 2;
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    if (particleFrame === 0) {
      p.x += p.vx;
      p.y += p.vy;
    }
    p.rotation += p.rotSpeed * (particleFrame === 0 ? 1 : 0.5);
    p.life -= 0.008;
    if (p.type === "leaf") p.vy += 0.005;
    if (p.life <= 0) state.particles.splice(i, 1);
  }
  if (state.particles.length > 80) state.particles.splice(0, state.particles.length - 80);

  for (const p of state.particles) {
    const alpha = Math.max(0, p.life / p.maxLife);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);
    if (p.type === "pollen") {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(0, 0, p.size, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size, p.size * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  if (state.cutAnimTime > 0) {
    ctx.save();
    ctx.globalAlpha = state.cutAnimTime * 0.6;
    ctx.strokeStyle = isDark ? "#ffbb00" : "#cc8800";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, -30, (1.0 - state.cutAnimTime) * 30, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    state.cutAnimTime = Math.max(0, state.cutAnimTime - 0.02);
  }

  const g = state.genome;

  const childrenByParent = new Map<number | null, PlantNode[]>();
  const nodeById = new Map<number, PlantNode>();
  for (const n of state.nodes) {
    nodeById.set(n.id, n);
    const arr = childrenByParent.get(n.parentId);
    if (arr) arr.push(n);
    else childrenByParent.set(n.parentId, [n]);
  }
  const weightCache = new Map<number, number>();
  const thicknessCache = new Map<number, number>();
  const getThickness = (id: number): number => {
    const cached = thicknessCache.get(id);
    if (cached !== undefined) return cached;
    const node = nodeById.get(id);
    if (!node || (node.type !== "stem" && node.type !== "meristem")) {
      thicknessCache.set(id, 0);
      return 0;
    }
    const kids = childrenByParent.get(id) ?? [];
    let areaSum = 0.7;
    for (const c of kids) {
      if (c.type !== "stem" && c.type !== "meristem") continue;
      const t = getThickness(c.id);
      areaSum += t * t;
    }
    const thickness = Math.sqrt(areaSum);
    thicknessCache.set(id, thickness);
    return thickness;
  };
  const getWeight = (id: number): number => {
    const cached = weightCache.get(id);
    if (cached !== undefined) return cached;
    const node = nodeById.get(id);
    if (!node) {
      weightCache.set(id, 0);
      return 0;
    }
    let w = 0;
    if (node.type === "leaf" && node.fallState !== "falling") w = 0.8 * (node.sizeMul ?? 1);
    else if (node.type === "flower" && node.fallState !== "falling") w = 1.4;
    else if (node.type === "stem" || node.type === "meristem") w = node.length * 0.04;
    const kids = childrenByParent.get(id) ?? [];
    for (const c of kids) w += getWeight(c.id);
    weightCache.set(id, w);
    return w;
  };

  const windDisp = new Map<number, WindPos>();
  windDisp.set(0, { wx: state.root.x, wy: state.root.y, wAngle: state.root.angle });
  const MAX_DETAIL_DEPTH = 6;

  for (const n of state.nodes) {
    const detailFactor = n.depth > MAX_DETAIL_DEPTH
      ? Math.max(0.15, 1 - (n.depth - MAX_DETAIL_DEPTH) * 0.1)
      : 1;
      const parentDisp = n.parentId !== null ? windDisp.get(n.parentId) : undefined;
      const startX = parentDisp ? parentDisp.wx : n.x;
      const startY = parentDisp ? parentDisp.wy : n.y;

      const stiffness = Math.pow(0.55, n.depth * detailFactor);
      const lengthFactor = Math.min(1, n.targetLength / g.lenScale);
      const depthFactor = stiffness * lengthFactor;

      const gustOctaves = n.depth > MAX_DETAIL_DEPTH ? 2 : 3;
      const gust = fbm(windPhase * 0.4 + n.depth * 0.3, gustOctaves);
      const gustStrength = 0.5 + gust * 0.5;

      const baseWindOctaves = n.depth > MAX_DETAIL_DEPTH ? 2 : 3;
      const baseWind = fbm(windPhase * 0.7 + n.depth * 0.17 + n.id * 0.01, baseWindOctaves) * 2 - 1;
      const localWind = baseWind * 0.06 * g.windSensitivity * depthFactor * gustStrength;

      const swayFreq = windPhase * 0.3 + n.depth * 0.13 * detailFactor;
      const sway = Math.sin(swayFreq) * Math.sin(swayFreq * 1.7 + 0.5) * 0.015 * g.windSensitivity * depthFactor * detailFactor;

      const totalWind = localWind + sway;
      const cumulativeAngle = n.angle + totalWind;

      let endX = startX + Math.cos(cumulativeAngle) * n.length;
      let endY = startY + Math.sin(cumulativeAngle) * n.length;
      if (n.type === "stem" || n.type === "meristem") {
        const weight = getWeight(n.id);
        const thickness = getThickness(n.id);
        const woodiness = Math.min(1, n.age / 50);
        const genomeStiffness = g.stiffness ?? 1.0;
        const stiffnessVal = Math.pow(thickness + 0.5, 2.0) * (0.55 + woodiness * 1.3 * detailFactor) * genomeStiffness;
        const rawBend = (0.2 * weight) / Math.max(0.05, stiffnessVal);
        const sagDistance = Math.min(rawBend, 0.55 * detailFactor) * n.length;
        endY += sagDistance;
      }

      windDisp.set(n.id, { wx: endX, wy: endY, wAngle: cumulativeAngle });

      if (n.type === "stem" || n.type === "meristem") {
        const wood = Math.min(1, n.age / 50);
        ctx.globalAlpha = 1 - n.shade * 0.35 * detailFactor;
        drawBezierStem(ctx, startX, startY, endX, endY, cumulativeAngle, n, wood * detailFactor, g.barkRoughness * detailFactor, totalWind * detailFactor, state.woodTexture);
        ctx.globalAlpha = 1;
        if (n.hasThorns) {
          const thick = Math.max(0.5, 3.5 * Math.pow(0.7, n.depth));
          for (let t = 0; t < 3; t++) {
            const frac = (t + 1) / 4;
            const tx = startX + (endX - startX) * frac;
            const ty = startY + (endY - startY) * frac;
            const side = t % 2 === 0 ? 1 : -1;
            const perpX = -(endY - startY);
            const perpY = endX - startX;
            const pLen = Math.sqrt(perpX * perpX + perpY * perpY) || 1;
            const nx = (perpX / pLen) * side * thick * 0.6 * detailFactor;
            const ny = (perpY / pLen) * side * thick * 0.6 * detailFactor;
            ctx.fillStyle = isDark ? "#5D4037" : "#795548";
            ctx.beginPath();
            ctx.moveTo(tx, ty);
            ctx.lineTo(tx + nx - (endX - startX) * 0.08, ty + ny - (endY - startY) * 0.08);
            ctx.lineTo(tx + nx + (endX - startX) * 0.08, ty + ny + (endY - startY) * 0.08);
            ctx.closePath();
            ctx.fill();
          }
        }
        if (n.isCut) {
          ctx.strokeStyle = isDark ? "#ffbb00" : "#cc8800";
          ctx.lineWidth = Math.max(0.5, 3.5 * Math.pow(0.7, n.depth)) * detailFactor + 1;
          ctx.beginPath();
          ctx.moveTo(endX - 3, endY);
          ctx.lineTo(endX + 3, endY);
          ctx.stroke();
        }
      } else if (n.type === "leaf") {
      ctx.save();
      ctx.globalAlpha = 1 - n.shade * 0.3;
      const lx = startX + Math.cos(cumulativeAngle) * n.length * 0.4;
      const ly = startY + Math.sin(cumulativeAngle) * n.length * 0.4;
      ctx.translate(lx, ly);
      ctx.rotate(n.angle * 0.3 + totalWind * 0.5);
      drawLeafShape(ctx, g.leafShape, n.length * g.leafSize * n.leafSizeJitter * 1.8, season2, n);
      ctx.globalAlpha = 1;
      ctx.restore();
      if (season2 < 50 && cumulativeAngle < 0) {
        const dx = startX + Math.cos(cumulativeAngle) * n.length * 0.8;
        const dy = startY + Math.sin(cumulativeAngle) * n.length * 0.8;
        ctx.fillStyle = "rgba(200,220,255,0.4)";
        ctx.beginPath();
        ctx.arc(dx, dy, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (n.type === "bud") {
      ctx.fillStyle = isDark ? "#f39c12" : "#d4a017";
      ctx.beginPath();
      ctx.arc(startX, startY, 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (n.type === "flower") {
      if (n.fruitAge > 0) {
        const fruitProg = Math.min(1, n.fruitAge / 100);
        const fr = Math.round(80 + fruitProg * 120);
        const fg = Math.round(120 - fruitProg * 80);
        const fb = Math.round(40 - fruitProg * 20);
        const fruitR = Math.min(5, 3 + n.fruitAge * 0.02);
        ctx.fillStyle = `rgb(${fr},${fg},${fb})`;
        ctx.beginPath();
        ctx.arc(startX, startY, fruitR, 0, Math.PI * 2);
        ctx.fill();
        if (n.fruitAge > 50) {
          ctx.fillStyle = isDark ? "#2a1a0a" : "#3d2b1f";
          for (let s = 0; s < 3; s++) {
            const sa = (s / 3) * Math.PI * 2;
            ctx.beginPath();
            ctx.arc(startX + Math.cos(sa) * fruitR * 0.5, startY + Math.sin(sa) * fruitR * 0.5, 0.7, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      } else {
        drawInflorescence(ctx, startX, startY, cumulativeAngle, n.depth, g, g.inflorescence, n.id * 97 + 13);
      }
    } else if (n.type === "root") {
      const rootWood = Math.min(0.8, n.age / 40);
      const rr = Math.round(120 * rootWood + 90 * (1 - rootWood));
      const rg = Math.round(80 * rootWood + 65 * (1 - rootWood));
      const rb = Math.round(40 * rootWood + 35 * (1 - rootWood));
      ctx.strokeStyle = `rgb(${rr},${rg},${rb})`;
      ctx.lineWidth = Math.max(0.3, 2 * Math.pow(0.7, n.depth));
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
    }
  }
  ctx.restore();
  lastWindDisp = windDisp;
  return name + "|" + color;
}
