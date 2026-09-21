import type { PlantNode, Genome } from "../sim/types";

/**
 * Modular Botanical Leaf & Flower Morphology Engine
 * Implements authentic Japanese bonsai leaf architectures, gradual developmental
 * bud unfurling, and multi-stage floral anthesis (bud -> swelling -> bloom).
 */

export type LeafMorphology =
  | "simple"
  | "palmate"
  | "pinnate"
  | "needle"
  | "scale"
  | "lobed"
  | "lanceolate"
  | "serrate";

export type FlowerMorphology =
  | "solitary"
  | "sakura"
  | "ume"
  | "azalea"
  | "raceme"
  | "umbel"
  | "panicle"
  | "compound";

/**
 * Draw a botanical leaf reflecting its developmental progress (bud -> unfurling -> mature).
 *
 * @param ctx 2D rendering context
 * @param morphology Botanical leaf shape category
 * @param size Mature leaf size in pixels
 * @param color Base leaf coloration
 * @param highlightColor Sunlit highlight coloration
 * @param progress Developmental growth progress (0.05 = tight bud, 1.0 = fully unfurled)
 */
export function drawModularLeaf(
  ctx: CanvasRenderingContext2D,
  morphology: LeafMorphology,
  size: number,
  color: string,
  highlightColor: string,
  progress: number = 1.0
): void {
  const p = Math.max(0.08, Math.min(1.0, progress));
  ctx.save();

  // 1. Bud Stage (< 0.28): Tiny closed bud scale / young folded stipule
  if (p < 0.28) {
    const budScale = p / 0.28;
    const bLen = Math.max(2.5, size * 0.35 * budScale);
    const bWid = Math.max(1.2, size * 0.18 * budScale);

    // Tender yellowish-green or bronze bud casing
    ctx.fillStyle = "rgba(163, 230, 53, 0.9)";
    ctx.strokeStyle = "rgba(77, 124, 15, 0.7)";
    ctx.lineWidth = 0.6;

    ctx.beginPath();
    ctx.ellipse(0, -bLen * 0.5, bWid, bLen * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Bud seam / folded overlap line
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -bLen);
    ctx.stroke();
    ctx.restore();
    return;
  }

  // 2. Unfurling / Expanding Leaf Lamina (0.28 -> 1.0)
  const unfurl = (p - 0.28) / 0.72; // 0.0 -> 1.0
  const effSize = size * (0.35 + 0.65 * unfurl);

  // Dynamic spring tenderness: young leaves are lighter and more golden/translucent
  const grad = ctx.createRadialGradient(0, 0, 1, 0, 0, effSize);
  grad.addColorStop(0, highlightColor);
  grad.addColorStop(1, color);
  ctx.fillStyle = grad;

  ctx.strokeStyle = "rgba(0, 0, 0, 0.22)";
  ctx.lineWidth = 0.7;

  if (morphology === "needle") {
    // Authentic Japanese Black Pine (Kuromatsu) dual-needle fascicle with basal sheath (Kaimo)
    ctx.save();
    // Sheath (brownish papery base)
    ctx.fillStyle = "rgba(120, 80, 40, 0.75)";
    ctx.beginPath();
    ctx.ellipse(0, -effSize * 0.1, effSize * 0.12, effSize * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();

    // Two slender needles fanning out at a graceful acute V-angle
    const needleLen = effSize * 1.85;
    const spread = 0.22 + 0.18 * unfurl;

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.15;
    ctx.lineCap = "round";

    // Left needle
    ctx.beginPath();
    ctx.moveTo(0, -effSize * 0.15);
    ctx.quadraticCurveTo(-needleLen * 0.15, -needleLen * 0.55, -needleLen * spread, -needleLen);
    ctx.stroke();

    // Right needle
    ctx.beginPath();
    ctx.moveTo(0, -effSize * 0.15);
    ctx.quadraticCurveTo(needleLen * 0.15, -needleLen * 0.55, needleLen * spread, -needleLen);
    ctx.stroke();

    // Central fine specular highlight along the resin canal
    ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, -effSize * 0.2);
    ctx.lineTo(-needleLen * spread * 0.85, -needleLen * 0.85);
    ctx.stroke();

    ctx.restore();
  } else if (morphology === "scale") {
    // Shimpaku Juniper (Ibuki) tiered fan scale foliage cushions
    ctx.save();
    const fanCount = 5;
    for (let f = 0; f < fanCount; f++) {
      ctx.save();
      const fAngle = ((f - 2) * Math.PI) / 8;
      ctx.rotate(fAngle);
      ctx.beginPath();
      // Overlapping scale lozenges
      ctx.ellipse(0, -effSize * 0.45, effSize * 0.18, effSize * 0.38, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  } else if (morphology === "palmate") {
    // Authentic Momiji (Acer palmatum) 5-lobed Japanese Mountain Maple leaf
    ctx.save();
    // Slender crimson petiole
    ctx.strokeStyle = "rgba(185, 28, 28, 0.7)";
    ctx.lineWidth = 0.85;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -effSize * 0.3);
    ctx.stroke();

    ctx.translate(0, -effSize * 0.3);

    // 5 pointed radiating lobes with deep sinuses
    const lobeAngles = [-0.62, -0.32, 0.0, 0.32, 0.62];
    const lobeScales = [0.65, 0.9, 1.0, 0.9, 0.65];

    for (let i = 0; i < lobeAngles.length; i++) {
      ctx.save();
      ctx.rotate(lobeAngles[i] * unfurl);
      const lScale = lobeScales[i] * effSize;

      // Pointed lanceolate lobe with serrated tip
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(lScale * 0.22, -lScale * 0.45, lScale * 0.08, -lScale * 0.9);
      ctx.lineTo(0, -lScale);
      ctx.lineTo(-lScale * 0.08, -lScale * 0.9);
      ctx.quadraticCurveTo(-lScale * 0.22, -lScale * 0.45, 0, 0);
      ctx.fill();
      ctx.stroke();

      // Delicate primary vein
      ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
      ctx.lineWidth = 0.55;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -lScale * 0.85);
      ctx.stroke();

      ctx.restore();
    }
    ctx.restore();
  } else if (morphology === "lanceolate") {
    // Zen Bamboo (Phyllostachys) graceful elongated blade with parallel venation
    ctx.save();
    const bLen = effSize * 1.6;
    const bWid = effSize * 0.32;

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(bWid * 1.1, -bLen * 0.35, bWid * 0.8, -bLen * 0.75, 0, -bLen);
    ctx.bezierCurveTo(-bWid * 0.8, -bLen * 0.75, -bWid * 1.1, -bLen * 0.35, 0, 0);
    ctx.fill();
    ctx.stroke();

    // Central prominent midrib
    ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
    ctx.lineWidth = 0.65;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -bLen * 0.92);
    ctx.stroke();

    // Parallel fine lateral veins
    ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
    ctx.lineWidth = 0.4;
    for (let v = -1; v <= 1; v += 2) {
      ctx.beginPath();
      ctx.moveTo(v * bWid * 0.25, -bLen * 0.15);
      ctx.quadraticCurveTo(v * bWid * 0.5, -bLen * 0.5, 0, -bLen * 0.85);
      ctx.stroke();
    }
    ctx.restore();
  } else if (morphology === "serrate") {
    // Sakura / Plum ovate leaf with finely serrated margins (Kyoshi)
    ctx.save();
    const lLen = effSize * 1.25;
    const lWid = effSize * 0.52;

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(lWid * 1.15, -lLen * 0.3, lWid * 0.85, -lLen * 0.75, 0, -lLen);
    ctx.bezierCurveTo(-lWid * 0.85, -lLen * 0.75, -lWid * 1.15, -lLen * 0.3, 0, 0);
    ctx.fill();
    ctx.stroke();

    // Lateral pinnate veins
    ctx.strokeStyle = "rgba(0, 0, 0, 0.14)";
    ctx.lineWidth = 0.55;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -lLen * 0.9);
    ctx.stroke();

    for (let vi = 1; vi <= 3; vi++) {
      const vy = -lLen * (vi / 4);
      ctx.beginPath();
      ctx.moveTo(0, vy);
      ctx.lineTo(lWid * 0.4, vy - lLen * 0.08);
      ctx.moveTo(0, vy);
      ctx.lineTo(-lWid * 0.4, vy - lLen * 0.08);
      ctx.stroke();
    }
    ctx.restore();
  } else if (morphology === "pinnate") {
    // Feather compound leaf
    ctx.save();
    const rLen = effSize * 1.3;
    ctx.beginPath();
    ctx.ellipse(0, -rLen * 0.85, effSize * 0.25, effSize * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const pairs = 3;
    for (let i = 1; i <= pairs; i++) {
      const py = -rLen * (i / (pairs + 1));
      const pSpan = effSize * 0.55;
      // Left leaflet
      ctx.beginPath();
      ctx.ellipse(-pSpan, py, effSize * 0.22, effSize * 0.14, 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Right leaflet
      ctx.beginPath();
      ctx.ellipse(pSpan, py, effSize * 0.22, effSize * 0.14, -0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  } else if (morphology === "lobed") {
    // Lobed wavy leaf
    ctx.beginPath();
    ctx.moveTo(0, -effSize * 0.85);
    ctx.bezierCurveTo(effSize * 0.7, -effSize * 0.45, effSize * 0.8, effSize * 0.4, 0, effSize * 0.85);
    ctx.bezierCurveTo(-effSize * 0.8, effSize * 0.4, -effSize * 0.7, -effSize * 0.45, 0, -effSize * 0.85);
    ctx.fill();
    ctx.stroke();
  } else {
    // Simple elliptical default leaf
    ctx.beginPath();
    ctx.ellipse(0, -effSize * 0.5, effSize * 0.38, effSize * 0.65, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = "rgba(0, 0, 0, 0.16)";
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -effSize * 0.95);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Draw a botanical flower reflecting developmental anthesis (calyx bud -> swelling -> bloom).
 *
 * @param ctx 2D rendering context
 * @param morphology Floral architecture
 * @param petalCount Number of petals
 * @param radius Mature petal radius
 * @param petalColor Base corolla color
 * @param stamenColor Golden stamen / center color
 * @param progress Growth progress (0.05 = tight green bud, 1.0 = fully open blossom)
 */
export function drawModularFlower(
  ctx: CanvasRenderingContext2D,
  morphology: FlowerMorphology,
  petalCount: number,
  radius: number,
  petalColor: string,
  stamenColor: string,
  progress: number = 1.0
): void {
  const p = Math.max(0.06, Math.min(1.0, progress));
  ctx.save();

  // Phase 1: Tight Calyx Bud (Tsubomi 蕾) [p < 0.32]
  if (p < 0.32) {
    const budFrac = p / 0.32;
    const bRad = Math.max(2.5, radius * (0.35 + 0.25 * budFrac));

    // Green protective sepals wrapping the petal tip
    ctx.fillStyle = "rgba(46, 117, 43, 0.95)";
    ctx.strokeStyle = "rgba(20, 83, 45, 0.8)";
    ctx.lineWidth = 0.7;

    for (let s = 0; s < 3; s++) {
      ctx.save();
      ctx.rotate((s * Math.PI * 2) / 3);
      ctx.beginPath();
      ctx.ellipse(0, -bRad * 0.5, bRad * 0.35, bRad * 0.65, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Glimpse of swollen colored petal peeking through the tip
    if (budFrac > 0.4) {
      ctx.fillStyle = petalColor;
      ctx.beginPath();
      ctx.arc(0, -bRad * 0.75, bRad * 0.28 * budFrac, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
    return;
  }

  // Phase 2 & 3: Anthesis Unfolding (0.32 -> 1.0)
  const bloomFrac = (p - 0.32) / 0.68; // 0.0 to 1.0
  const effRadius = radius * (0.45 + 0.55 * bloomFrac);
  const count = Math.max(3, Math.min(12, petalCount));

  if (morphology === "sakura") {
    // Classical 5-petal Sakura (Prunus) blossom with notched petals & golden stamens
    drawSakuraBlossom(ctx, effRadius, petalColor, stamenColor, bloomFrac);
  } else if (morphology === "azalea") {
    // Satsuki Azalea (Rhododendron) funnel corolla with wavy lobes & curved stamens
    drawAzaleaBlossom(ctx, effRadius, petalColor, stamenColor, bloomFrac);
  } else if (morphology === "ume") {
    // Japanese Plum (Ume) cupped rounded overlapping petals
    drawUmeBlossom(ctx, effRadius, petalColor, stamenColor, bloomFrac);
  } else if (morphology === "umbel" || morphology === "compound") {
    // Multi-floret umbel
    const floretCount = 5;
    for (let f = 0; f < floretCount; f++) {
      ctx.save();
      const angle = (f / floretCount) * Math.PI * 2;
      const dist = effRadius * 0.75 * bloomFrac;
      ctx.translate(Math.cos(angle) * dist, Math.sin(angle) * dist);
      drawSingleFloret(ctx, count, effRadius * 0.45, petalColor, stamenColor, bloomFrac);
      ctx.restore();
    }
  } else {
    // Default solitary blossom
    drawSingleFloret(ctx, count, effRadius, petalColor, stamenColor, bloomFrac);
  }

  ctx.restore();
}

/**
 * Authentic Sakura Blossom: 5 notched heart-shaped petals, delicate nectar ring,
 * and radiating golden-tipped stamens.
 */
function drawSakuraBlossom(
  ctx: CanvasRenderingContext2D,
  radius: number,
  petalColor: string,
  stamenColor: string,
  bloomFrac: number
): void {
  // 1. Subtle green sepals underneath
  ctx.fillStyle = "rgba(46, 117, 43, 0.75)";
  for (let s = 0; s < 5; s++) {
    ctx.save();
    ctx.rotate((s * Math.PI * 2) / 5 + Math.PI / 5);
    ctx.beginPath();
    ctx.ellipse(0, -radius * 0.55, radius * 0.18, radius * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 2. Five notched petals
  ctx.fillStyle = petalColor;
  ctx.strokeStyle = "rgba(225, 29, 72, 0.2)";
  ctx.lineWidth = 0.8;

  const petalSpread = 0.3 + 0.7 * bloomFrac;

  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2;
    ctx.save();
    ctx.rotate(angle);

    const pLen = radius * petalSpread;
    const pWid = radius * 0.46 * petalSpread;

    // Heart-shaped notched petal tip (Sakura signature)
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-pWid * 1.1, -pLen * 0.45, -pWid * 0.9, -pLen * 0.92, -pWid * 0.28, -pLen);
    // V-shaped apical notch (emargination)
    ctx.lineTo(0, -pLen * 0.86);
    ctx.lineTo(pWid * 0.28, -pLen);
    ctx.bezierCurveTo(pWid * 0.9, -pLen * 0.92, pWid * 1.1, -pLen * 0.45, 0, 0);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  // 3. Central crimson nectar guide ring
  ctx.fillStyle = "rgba(225, 29, 72, 0.55)";
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.24 * bloomFrac, 0, Math.PI * 2);
  ctx.fill();

  // 4. Radiating delicate golden stamens (emerge fully at bloomFrac > 0.45)
  if (bloomFrac > 0.45) {
    const stamenProg = (bloomFrac - 0.45) / 0.55;
    const stamenLen = radius * 0.55 * stamenProg;
    const stamenCount = 14;

    for (let st = 0; st < stamenCount; st++) {
      const stAngle = (st / stamenCount) * Math.PI * 2 + 0.12;
      ctx.save();
      ctx.rotate(stAngle);

      // Filament
      ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -stamenLen);
      ctx.stroke();

      // Golden anther dot
      ctx.fillStyle = stamenColor;
      ctx.beginPath();
      ctx.arc(0, -stamenLen, 1.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    // Central pale green pistil stigma
    ctx.fillStyle = "#86efac";
    ctx.beginPath();
    ctx.arc(0, 0, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Authentic Satsuki Azalea: Funnel/bell corolla with ruffled undulating lobes,
 * upper speckled nectar guides, and prominent upward curving stamens.
 */
function drawAzaleaBlossom(
  ctx: CanvasRenderingContext2D,
  radius: number,
  petalColor: string,
  stamenColor: string,
  bloomFrac: number
): void {
  ctx.save();
  const count = 5;
  ctx.fillStyle = petalColor;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.15)";
  ctx.lineWidth = 0.8;

  // Overlapping flared undulating lobes
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    ctx.save();
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.ellipse(0, -radius * 0.65 * bloomFrac, radius * 0.42 * bloomFrac, radius * 0.65 * bloomFrac, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // Upper throat nectar speckling
  if (bloomFrac > 0.5) {
    ctx.fillStyle = "rgba(159, 18, 57, 0.6)";
    for (let d = 0; d < 6; d++) {
      const dx = ((d % 3) - 1) * radius * 0.15;
      const dy = -radius * 0.25 - (d > 2 ? radius * 0.12 : 0);
      ctx.beginPath();
      ctx.arc(dx, dy, 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Elegant long curved stamens
  if (bloomFrac > 0.4) {
    const sLen = radius * 0.85 * bloomFrac;
    for (let s = -2; s <= 2; s++) {
      ctx.save();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(s * radius * 0.25, -sLen * 0.4, s * radius * 0.35, -sLen);
      ctx.stroke();

      ctx.fillStyle = stamenColor;
      ctx.beginPath();
      ctx.arc(s * radius * 0.35, -sLen, 1.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.restore();
}

/**
 * Japanese Ume (Plum) Blossom: 5 rounded, overlapping, cupped petals.
 */
function drawUmeBlossom(
  ctx: CanvasRenderingContext2D,
  radius: number,
  petalColor: string,
  stamenColor: string,
  bloomFrac: number
): void {
  ctx.save();
  ctx.fillStyle = petalColor;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.16)";
  ctx.lineWidth = 0.8;

  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2;
    ctx.save();
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.arc(0, -radius * 0.55 * bloomFrac, radius * 0.42 * bloomFrac, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // Dense golden center
  ctx.fillStyle = stamenColor;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.25 * bloomFrac, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * Single floret with blooming expansion.
 */
function drawSingleFloret(
  ctx: CanvasRenderingContext2D,
  count: number,
  radius: number,
  petalColor: string,
  stamenColor: string,
  bloomFrac: number
): void {
  ctx.fillStyle = petalColor;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.14)";
  ctx.lineWidth = 0.8;

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    ctx.save();
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.ellipse(0, -radius * 0.65 * bloomFrac, radius * 0.35 * bloomFrac, radius * 0.65 * bloomFrac, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // Flower center
  ctx.fillStyle = stamenColor;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.28 * bloomFrac, 0, Math.PI * 2);
  ctx.fill();
}
