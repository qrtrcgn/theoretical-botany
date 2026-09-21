import type { PlantState, WateringCanState, WaterStreamJet } from "../sim/types";
import { createPrng, type Prng } from "../sim/prng";
import { freshState, growOnce, pruneNodeAt } from "../sim/growth";
import { breedGenomes, expressTrait } from "../sim/genetics";
import {
  SPECIES,
  generateGenomeForSpecies,
  getSpeciesById,
} from "../data/species";
import {
  renderPlant,
  computeTransform,
  seasonOf,
  getStemTransforms,
  closestPointOnQuadratic,
  renderBladeSlashTrail,
  renderWaterDroplets,
  getCopperCanRosePosition,
  renderCopperWateringCan,
  renderWaterStreams,
  type SlashPoint,
  type WaterDroplet,
  type DevRenderOptions,
} from "../render/canvas";
import { exportPlantJSON, plantToSVG, importPlantJSON } from "../export/plugin";
import {
  playPruneSound,
  playDefoliateSound,
  playGrowSound,
  playWaterSound,
  playWireSound,
  playRakeSound,
  playJinSound,
  playShishiOdoshiClack,
  playFurinSound,
  toggleRainAmbiance,
  playSingingBowlSound,
  setBreatheIntensity,
  playSaveSound,
  toggleWindAmbiance,
  getAudioContext,
  playWoodCreakSound,
  playBarkCrackSound,
  playBranchSnapSound,
  playSapDripSound,
} from "../audio/soundscape";
import {
  swipeSliceCurvedStems,
  pluckLeavesAlongSwipe,
  bendStemWithWire,
  carveBranchToJin,
  swipeCarveCurvedStems,
} from "../sim/precisionPrune";
import {
  evaluateBonsaiSchools,
  BONSAI_STYLES,
  type BonsaiSchoolReport,
} from "../sim/bonsaiSchools";
import {
  TOKONOMA_REWARD_CATALOG,
  DEFAULT_UNLOCKED_REWARDS,
  checkNewUnlocks,
  loadRewardsFromStorage,
  saveRewardsToStorage,
  type TokonomaAccoutrement,
} from "../data/rewards";

declare global {
  interface Window {
    debugState?: () => string;
    state: PlantState | null;
  }
}

window.debugState = () => {
  if (!window.state) return "State not initialized";
  return JSON.stringify(
    {
      nodesCount: window.state.nodes.length,
      rootLen: window.state.nodes[0]?.length,
      step: window.state.step,
      species: window.state.speciesId,
    },
    null,
    2
  );
};

const $ = (id: string) => document.getElementById(id)!;
const canvas = $("plant") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

let prng: Prng = createPrng(42);
let seed = 42;
(window as any).state = null;
let greenhouse: PlantState[] = [];
let selected: number[] = [];
let playing = true;
let windEnabled = false;

// --- Zen Multi-Tool System & Visual FX ---
type ZenTool = "shear" | "water" | "wire" | "jin" | "rake" | "breathe";
let currentTool: ZenTool = "shear";

let slashPoints: SlashPoint[] = [];
let waterDroplets: WaterDroplet[] = [];
let waterStreams: WaterStreamJet[] = [];
let wateringCan: WateringCanState = {
  active: false,
  x: 0,
  y: 0,
  targetX: 0,
  targetY: 0,
  tiltAngle: 0,
  pourProgress: 0,
  liftProgress: 0,
  alpha: 0,
};
let isPouring = false;
let breatheInterval: number | null = null;
let breathePhase: "inhale" | "hold" | "exhale" = "inhale";

function setTool(tool: ZenTool) {
  currentTool = tool;
  if (tool !== "water" && isPouring) {
    stopWatering();
  }
  const tools: ZenTool[] = ["shear", "water", "wire", "jin", "rake", "breathe"];
  tools.forEach((t) => {
    const btn = $(`tool-${t}`);
    if (btn) {
      if (t === tool) btn.classList.add("active");
      else btn.classList.remove("active");
    }
  });

  const hint = $("zen-hint");
  if (hint) {
    if (tool === "shear") hint.textContent = "✂️ Schere: Über Äste wischen zum Schneiden oder Zupfen";
    else if (tool === "water") hint.textContent = "💧 Gießen: Kupferkanne heben, neigen & feine Wasserstrahlen spenden";
    else if (tool === "wire") hint.textContent = "🪢 Draht: Ast berühren & ziehen zum Formen mit Kupferdraht";
    else if (tool === "jin") hint.textContent = "🪵 Jin: Ast berühren oder wischen zum Formen gebleichten Totholzes";
    else if (tool === "rake") hint.textContent = "🪨 Harke: Im Sandbett ziehen für meditative Karesansui-Wellen";
    else if (tool === "breathe") hint.textContent = "🧘 Atmen: Achtsame geführte Meditation";
  }

  if (tool === "breathe") {
    startBreatheMode();
  } else {
    const overlay = $("breathe-overlay");
    if (overlay && overlay.classList.contains("active")) {
      stopBreatheMode();
    }
  }
}

function startBreatheMode() {
  const overlay = $("breathe-overlay");
  const circle = $("breathe-circle");
  const text = $("breathe-text");
  if (!overlay || !circle || !text) return;

  overlay.classList.add("active");
  breathePhase = "inhale";
  text.textContent = "Einatmen… (4s)";
  circle.classList.remove("contracting");
  circle.classList.add("expanding");
  playSingingBowlSound(216);
  setBreatheIntensity("inhale");

  if (breatheInterval) clearInterval(breatheInterval);

  let step = 0;
  breatheInterval = window.setInterval(() => {
    step = (step + 1) % 3;
    if (step === 0) {
      breathePhase = "inhale";
      text.textContent = "Einatmen… (4s)";
      circle.classList.remove("contracting");
      circle.classList.add("expanding");
      playSingingBowlSound(216);
      setBreatheIntensity("inhale");
    } else if (step === 1) {
      breathePhase = "hold";
      text.textContent = "Halten… (4s)";
      setBreatheIntensity("hold");
    } else {
      breathePhase = "exhale";
      text.textContent = "Ausatmen… (4s)";
      circle.classList.remove("expanding");
      circle.classList.add("contracting");
      playSingingBowlSound(144);
      setBreatheIntensity("exhale");
    }
  }, 4000);
}

function stopBreatheMode() {
  if (breatheInterval) {
    clearInterval(breatheInterval);
    breatheInterval = null;
  }
  const overlay = $("breathe-overlay");
  const circle = $("breathe-circle");
  if (overlay) overlay.classList.remove("active");
  if (circle) circle.classList.remove("expanding", "contracting");
  setTool("shear");
}

// --- 80-Frame History & Time-Travel Stack ---
interface HistoryEntry {
  state: PlantState;
  seed: number;
  selected: number[];
}

const history: HistoryEntry[] = [];
const MAX_HISTORY = 80;

function saveHistory() {
  const win = window as any;
  if (!win.state) return;
  history.push({
    state: JSON.parse(JSON.stringify(win.state)),
    seed,
    selected: [...selected],
  });
  if (history.length > MAX_HISTORY) {
    history.shift();
  }
}

function rewindOneStep() {
  const prev = history.pop();
  if (!prev) return;
  const win = window as any;
  win.state = prev.state;
  seed = prev.seed;
  selected = prev.selected;
  prng = createPrng(seed + (win.state?.step ?? 0));
  syncDesignControls();
  try {
    playWaterSound();
  } catch {
    /* ignore audio error */
  }
  draw();
}

// --- Pro/Dev Inspection State ---
const dev: DevRenderOptions = {
  showPoints: false,
  showIds: false,
  showHitbox: false,
  hitRadius: 20,
};

try {
  const saved = localStorage.getItem("zenplant.greenhouse");
  if (saved) greenhouse = JSON.parse(saved);
} catch {
  /* ignore */
}

function persist() {
  try {
    localStorage.setItem("zenplant.greenhouse", JSON.stringify(greenhouse));
  } catch {
    /* ignore */
  }
}

function updateSpeciesUI(id: string) {
  const sp = getSpeciesById(id);
  const select = $("species-select") as HTMLSelectElement | null;
  if (select && select.value !== id) select.value = id;
  const title = $("species-title");
  if (title && sp) title.textContent = sp.name;
}

// --- Tokonoma Accoutrements, Classical Schools & Achievements ---
let activeGalleryCategory = "all";
let toastTimeout: number | null = null;

function showAchievementToast(icon: string, title: string, desc: string) {
  const toast = $("achievement-toast");
  const iconEl = $("toast-icon");
  const titleEl = $("toast-title");
  const descEl = $("toast-desc");
  if (!toast || !iconEl || !titleEl || !descEl) return;

  iconEl.textContent = icon;
  titleEl.textContent = title;
  descEl.textContent = desc;

  toast.classList.add("visible");
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => {
    toast.classList.remove("visible");
    toastTimeout = null;
  }, 4500);
}

function checkSchoolsAndUnlocks(source?: string) {
  const win = window as any;
  if (!win.state) return;

  const report = evaluateBonsaiSchools(win.state);
  const newlyUnlocked = checkNewUnlocks(win.state, report);

  // If any newly unlocked items:
  if (newlyUnlocked.length > 0) {
    try {
      playSingingBowlSound();
    } catch {}
    for (const item of newlyUnlocked) {
      showAchievementToast("🏆", "Neuer Tokonoma-Schatz!", `${item.name} (${item.kanji}) freigeschaltet.`);
    }
    renderGalleryGrid();
  }

  // Check if a classical style was achieved with significant score
  if (report.dominantStyle && report.dominantScore >= 60) {
    const prevStyle = win.state.lastRecognizedStyle;
    const prevScore = win.state.lastStyleScore || 0;
    if (prevStyle !== report.dominantStyle.id || report.dominantScore >= prevScore + 8) {
      win.state.lastRecognizedStyle = report.dominantStyle.id;
      win.state.lastStyleScore = report.dominantScore;
      if (report.dominantScore >= 75 && newlyUnlocked.length === 0) {
        showAchievementToast(
          "🌿",
          `Stil erkannt: ${report.dominantStyle.nameDe}`,
          `Punkte: ${report.dominantScore}/100 (${report.tier.toUpperCase()})`
        );
      }
    }
  }
}

function openGalleryModal() {
  const modal = $("modal-gallery");
  if (!modal) return;
  renderGalleryGrid();
  modal.classList.add("open");
}

function closeGalleryModal() {
  const modal = $("modal-gallery");
  if (modal) modal.classList.remove("open");
}

function renderGalleryGrid() {
  const grid = $("gallery-grid");
  const win = window as any;
  if (!grid || !win.state) return;

  const unlockedSet = new Set(win.state.unlockedRewards || DEFAULT_UNLOCKED_REWARDS);
  const active = win.state.activeAccoutrements || {
    scrollId: "kakejiku_mountain_sansui",
    accentId: "shitakusa_kokedama_mossball",
  };

  const filtered = TOKONOMA_REWARD_CATALOG.filter((item) => {
    if (activeGalleryCategory === "all") return true;
    return item.category === activeGalleryCategory;
  });

  grid.innerHTML = "";

  for (const item of filtered) {
    const isUnlocked = unlockedSet.has(item.id);
    const isEquipped = active.scrollId === item.id || active.accentId === item.id;

    const card = document.createElement("div");
    card.className = `reward-card ${isEquipped ? "equipped" : ""} ${isUnlocked ? "" : "locked"}`;

    const formalityBadge =
      item.formality === "shin"
        ? `<span class="badge badge-shin">Shin (Formal)</span>`
        : item.formality === "gyo"
        ? `<span class="badge badge-gyo">Gyo (Halbformal)</span>`
        : `<span class="badge badge-so">So (Informell)</span>`;

    const rarityBadge = `<span class="badge badge-rarity">${item.rarity.toUpperCase()}</span>`;

    let buttonHtml = "";
    if (isEquipped) {
      buttonHtml = `<button class="card-btn btn-active" disabled>✓ Aktiv im Tokonoma</button>`;
    } else if (isUnlocked) {
      const equipLabel = item.category === "kakejiku" ? "Als Hängerolle wählen" : "Als Begleitobjekt wählen";
      buttonHtml = `<button class="card-btn btn-equip" data-item-id="${item.id}" data-item-cat="${item.category}">${equipLabel}</button>`;
    } else {
      buttonHtml = `<button class="card-btn btn-locked" disabled>🔒 Noch gesperrt</button>`;
    }

    card.innerHTML = `
      <div>
        <div class="card-top">
          <span class="card-kanji">${item.kanji}</span>
          <div class="card-badges">${formalityBadge}${rarityBadge}</div>
        </div>
        <div class="card-title">${item.name}</div>
        <div class="card-desc">${item.description}</div>
        <div class="card-condition">
          <strong>${isUnlocked ? "✓ Freigeschaltet" : "Bedingung"}:</strong> ${item.unlockCondition}
        </div>
      </div>
      <div>${buttonHtml}</div>
    `;

    grid.appendChild(card);
  }

  // Bind equip buttons
  grid.querySelectorAll(".btn-equip").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const target = e.currentTarget as HTMLButtonElement;
      const itemId = target.getAttribute("data-item-id");
      const itemCat = target.getAttribute("data-item-cat");
      if (!itemId || !itemCat) return;

      if (!win.state.activeAccoutrements) win.state.activeAccoutrements = {};
      if (itemCat === "kakejiku") {
        win.state.activeAccoutrements.scrollId = itemId;
      } else {
        win.state.activeAccoutrements.accentId = itemId;
      }

      saveRewardsToStorage(win.state.unlockedRewards || [], win.state.activeAccoutrements);
      try {
        playFurinSound();
      } catch {}
      renderGalleryGrid();
      draw();
    });
  });
}

function openFaqModal() {
  const modal = $("modal-faq");
  if (modal) modal.classList.add("open");
}

function closeFaqModal() {
  const modal = $("modal-faq");
  if (modal) modal.classList.remove("open");
}

function newPlant(newSeed = (Math.random() * 1e9) | 0, targetSpeciesId?: string) {
  const win = window as any;
  if (win.state && win.state.nodes.length > 0) {
    greenhouse.push(JSON.parse(JSON.stringify(win.state)));
    persist();
  }
  seed = newSeed;
  prng = createPrng(seed);
  const sp = (targetSpeciesId ? getSpeciesById(targetSpeciesId) : undefined) ??
    SPECIES[Math.floor(Math.random() * SPECIES.length)];
  const genome = generateGenomeForSpecies(sp, seed);
  win.state = freshState(genome, sp, { seed });

  const savedRewards = loadRewardsFromStorage();
  win.state.unlockedRewards = savedRewards.unlockedIds;
  win.state.activeAccoutrements = savedRewards.active;

  for (let i = 0; i < 80; i++) win.state = growOnce(win.state, prng);
  syncDesignControls();
  updateSpeciesUI(sp.id);
  draw();
}

function syncDesignControls() {
  const win = window as any;
  if (!win.state) return;
  const g = win.state.genome;

  const angleVal = Math.round(expressTrait(g, "angle") || 35);
  const flowerVal = Number((expressTrait(g, "flowerRadius") || 8).toFixed(1));
  const stiffVal = Number((expressTrait(g, "stiffness") || 1.0).toFixed(2));

  const angleSlider = $("design-angle") as HTMLInputElement | null;
  const flowerSlider = $("design-flower-size") as HTMLInputElement | null;
  const stiffSlider = $("design-stiffness") as HTMLInputElement | null;

  if (angleSlider) angleSlider.value = String(angleVal);
  if (flowerSlider) flowerSlider.value = String(flowerVal);
  if (stiffSlider) stiffSlider.value = String(stiffVal);

  const angleOut = $("design-angle-value");
  const flowerOut = $("design-flower-size-value");
  const stiffOut = $("design-stiffness-value");

  if (angleOut) angleOut.textContent = `${angleVal}°`;
  if (flowerOut) flowerOut.textContent = String(flowerVal);
  if (stiffOut) stiffOut.textContent = String(stiffVal);
}

function draw() {
  const r = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const needResize =
    canvas.width !== Math.floor(r.width * dpr) ||
    canvas.height !== Math.floor(r.height * dpr);
  if (needResize) {
    canvas.width = Math.floor(r.width * dpr);
    canvas.height = Math.floor(r.height * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const win = window as any;
  if (!win.state) return;

  const info = renderPlant(ctx, win.state, r.width, r.height, dev);

  // Transient serene visual FX
  if (slashPoints.length > 1) {
    renderBladeSlashTrail(ctx, slashPoints, Date.now());
  }
  if (waterStreams.length > 0) {
    renderWaterStreams(ctx, waterStreams);
  }
  if (waterDroplets.length > 0) {
    renderWaterDroplets(ctx, waterDroplets);
  }
  if (wateringCan.active) {
    renderCopperWateringCan(ctx, wateringCan);
  }

  const [name] = info.split("·");
  const seasonInfo = seasonOf(win.state.step, win.state.cycleLength || 250);
  const badge = $("season-badge");
  if (badge) {
    badge.textContent = `${seasonInfo.name} · Step ${win.state.step} · Seed ${seed}`;
    badge.style.color = seasonInfo.color;
  }

  const sp = getSpeciesById(win.state.speciesId) || SPECIES[0];
  const speciesTitle = $("species-title");
  if (speciesTitle) {
    speciesTitle.textContent = `${sp.name} (${seasonInfo.name})`;
  }

  const g = win.state.genome;
  const isIdentified = win.state.nodes.length > 20;
  const speciesName = isIdentified ? sp.name : "Unknown Species";
  const genomeBox = $("genome-info");
  if (genomeBox) {
    genomeBox.innerHTML =
      `Vigor ${expressTrait(g, "vigor").toFixed(2)} · Angle ${expressTrait(g, "angle").toFixed(0)}° · Len ${expressTrait(g, "lenScale").toFixed(0)}<br>` +
      `${speciesName} · Nodes ${win.state.nodes.length} · History ${history.length}/${MAX_HISTORY}`;
  }
  renderSlots();
}

function renderSlots() {
  const box = $("slots-container");
  if (!box) return;
  if (greenhouse.length === 0) {
    box.innerHTML =
      '<div style="font-size:11px;color:#64748b;text-align:center">Save plants for breeding.</div>';
    const bb = $("btn-breed") as HTMLButtonElement | null;
    if (bb) bb.style.display = "none";
    return;
  }
  box.innerHTML = greenhouse
    .map((s, i) => {
      const sel = selected.includes(i) ? "selected" : "";
      const rgb = expressTrait(s.genome, "flowerRGB") as [number, number, number];
      return `<div class="slot ${sel}" data-i="${i}"><span>#${i + 1} · step ${s.step} · ${s.nodes.length} nodes</span><span class="slot-color" style="background:rgb(${rgb[0]},${rgb[1]},${rgb[2]})"></span></div>`;
    })
    .join("");

  box.querySelectorAll(".slot").forEach((el) => {
    el.addEventListener("click", () => {
      const i = Number((el as HTMLElement).dataset.i);
      const at = selected.indexOf(i);
      if (at > -1) selected.splice(at, 1);
      else {
        if (selected.length >= 2) selected.shift();
        selected.push(i);
      }
      draw();
    });
  });

  const bb = $("btn-breed") as HTMLButtonElement | null;
  if (bb) {
    if (selected.length === 2) {
      bb.style.display = "block";
      bb.textContent = `Breed #${selected[0] + 1} + #${selected[1] + 1}`;
    } else {
      bb.style.display = "none";
    }
  }
}

// --- Interaction & Zen Multi-Tool Pointer Engine ---
canvas.style.touchAction = "none";
let dragging = false;
let dragStartX = 0,
  dragStartY = 0;
let dragStartCamX = 0,
  dragStartCamY = 0;

let activePointerId: number | null = null;
let pointerDownX = 0;
let pointerDownY = 0;
let pointerMovedDist = 0;
let activeWireNodeId: number | null = null;

function getPlantCoord(clientX: number, clientY: number): { x: number; y: number } {
  const win = window as any;
  const r = canvas.getBoundingClientRect();
  const { scale, ox, oy } = computeTransform(
    r.width,
    r.height,
    win.state?.showRoots ?? false,
    win.state?.cameraX ?? 0,
    win.state?.cameraY ?? 0,
    win.state?.cameraZoom ?? 1.0
  );
  return {
    x: (clientX - r.left - ox) / scale,
    y: (clientY - r.top - oy) / scale,
  };
}

function startWatering(cx: number, cy: number) {
  isPouring = true;
  if (!wateringCan.active) {
    wateringCan.active = true;
    wateringCan.x = cx + 75;
    wateringCan.y = cy - 20;
    wateringCan.targetX = cx + 75;
    wateringCan.targetY = cy - 45;
    wateringCan.tiltAngle = 0;
    wateringCan.pourProgress = 0;
    wateringCan.liftProgress = 0;
    wateringCan.alpha = 0.2;
  } else {
    wateringCan.targetX = cx + 75;
    wateringCan.targetY = cy - 45;
  }
  try {
    playWaterSound();
  } catch {}
  draw();
}

function updateWateringTarget(cx: number, cy: number) {
  wateringCan.targetX = cx + 75;
  wateringCan.targetY = cy - 45;
}

function stopWatering() {
  isPouring = false;
}

function pruneAt(clientX: number, clientY: number) {
  const win = window as any;
  if (!win.state) return;

  const pt = getPlantCoord(clientX, clientY);

  // Project coordinate onto curved stems with sub-pixel Bézier projection
  const stemTransforms = getStemTransforms();
  let bestHit: { nodeId: number; t: number; distance: number; thickness: number } | null = null;
  const hitRadius = dev.hitRadius ?? 20;

  for (const tr of stemTransforms.values()) {
    const hit = closestPointOnQuadratic(
      pt,
      tr.startX,
      tr.startY,
      tr.controlX,
      tr.controlY,
      tr.endX,
      tr.endY
    );
    if (hit.distance <= hitRadius && (!bestHit || hit.distance < bestHit.distance)) {
      bestHit = { nodeId: tr.nodeId, t: hit.t, distance: hit.distance, thickness: tr.thickness };
    }
  }

  if (bestHit !== null) {
    saveHistory();
    win.state = pruneNodeAt(win.state, bestHit.nodeId, bestHit.t);
    try {
      playPruneSound(bestHit.thickness);
    } catch {}
    draw();
    checkSchoolsAndUnlocks("prune");
  }
}

function rakeSandAt(canvasX: number, canvasY: number) {
  const win = window as any;
  if (!win.state) return;
  const r = canvas.getBoundingClientRect();
  const ox = r.width / 2 + (win.state.cameraX ?? 0);
  const oy = r.height * 0.82 + (win.state.cameraY ?? 0);
  const xTray = canvasX - ox;
  const yTray = canvasY - oy;

  if (!win.state.sandRipples) win.state.sandRipples = [];
  const ripples = win.state.sandRipples;
  const lastRipple = ripples[ripples.length - 1];
  const dist = lastRipple ? Math.hypot(xTray - lastRipple.x, yTray - lastRipple.y) : 999;
  if (dist > 9) {
    ripples.push({
      x: xTray,
      y: yTray,
      radius: 12 + Math.random() * 8,
      intensity: 0.95,
    });
    if (ripples.length > 55) ripples.shift();
    try {
      playRakeSound();
    } catch {}
    draw();
  }
}

canvas.addEventListener("pointerdown", (e) => {
  getAudioContext();
  const win = window as any;

  if (e.button === 1 || e.button === 2 || e.altKey || e.shiftKey) {
    // Middle/right button or modifier drag pans the camera
    dragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragStartCamX = win.state?.cameraX ?? 0;
    dragStartCamY = win.state?.cameraY ?? 0;
    return;
  }

  activePointerId = e.pointerId;
  canvas.setPointerCapture?.(e.pointerId);
  pointerDownX = e.clientX;
  pointerDownY = e.clientY;
  pointerMovedDist = 0;

  const r = canvas.getBoundingClientRect();
  const canvasX = e.clientX - r.left;
  const canvasY = e.clientY - r.top;

  // Check if tap hit the Shishi-Odoshi bamboo fountain on the left
  const ox = r.width / 2 + (win.state?.cameraX ?? 0);
  const oy = r.height * 0.82 + (win.state?.cameraY ?? 0);
  const xTray = canvasX - ox;
  const yTray = canvasY - oy;
  if (xTray >= -185 && xTray <= -125 && yTray >= 10 && yTray <= 65) {
    if (win.state) win.state.shishiWater = 1.0;
    playShishiOdoshiClack();
    draw();
    return;
  }

  if (currentTool === "shear") {
    slashPoints = [{ x: canvasX, y: canvasY, time: Date.now() }];
  } else if (currentTool === "water") {
    startWatering(canvasX, canvasY);
  } else if (currentTool === "rake") {
    rakeSandAt(canvasX, canvasY);
  } else if (currentTool === "jin") {
    slashPoints = [{ x: canvasX, y: canvasY, time: Date.now() }];
  } else if (currentTool === "wire") {
    const pt = getPlantCoord(e.clientX, e.clientY);
    const stemTransforms = getStemTransforms();
    let bestHit: { nodeId: number; distance: number } | null = null;
    const hitRadius = (dev.hitRadius ?? 20) * 1.5;
    for (const tr of stemTransforms.values()) {
      const hit = closestPointOnQuadratic(pt, tr.startX, tr.startY, tr.controlX, tr.controlY, tr.endX, tr.endY);
      if (hit.distance <= hitRadius && (!bestHit || hit.distance < bestHit.distance)) {
        bestHit = { nodeId: tr.nodeId, distance: hit.distance };
      }
    }
    if (bestHit) {
      activeWireNodeId = bestHit.nodeId;
    }
  }
});

canvas.addEventListener("pointermove", (e) => {
  const win = window as any;

  if (dragging) {
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    if (win.state) {
      win.state.cameraX = dragStartCamX + dx;
      win.state.cameraY = dragStartCamY + dy;
    }
    draw();
    return;
  }

  if (activePointerId !== e.pointerId) return;

  const dx = e.clientX - pointerDownX;
  const dy = e.clientY - pointerDownY;
  pointerMovedDist += Math.hypot(e.movementX || dx, e.movementY || dy);

  const r = canvas.getBoundingClientRect();
  const canvasX = e.clientX - r.left;
  const canvasY = e.clientY - r.top;

  if (currentTool === "shear" || currentTool === "jin") {
    slashPoints.push({ x: canvasX, y: canvasY, time: Date.now() });
    draw();
  } else if (currentTool === "water") {
    updateWateringTarget(canvasX, canvasY);
  } else if (currentTool === "rake") {
    rakeSandAt(canvasX, canvasY);
  } else if (currentTool === "wire" && activeWireNodeId !== null) {
    const win = window as any;
    if (win.state) {
      const angleDelta = (e.movementX || (dx * 0.05)) * 0.012;
      const stemTransforms = getStemTransforms();
      const nextState = bendStemWithWire(win.state, activeWireNodeId, angleDelta, stemTransforms);
      win.state = nextState;

      if (nextState.bendInfo.snapped) {
        playBranchSnapSound();
        playSapDripSound();
        activeWireNodeId = null;
        saveHistory();
      } else if (nextState.bendInfo.flakingBark) {
        if (Math.random() < 0.35) playBarkCrackSound();
        if (Math.random() < 0.25) playWoodCreakSound(nextState.bendInfo.strain);
      }
      draw();
    }
  }
});

canvas.addEventListener("pointerup", (e) => {
  if (dragging) {
    dragging = false;
    return;
  }

  if (activePointerId !== e.pointerId) return;
  activePointerId = null;

  const win = window as any;
  if (!win.state) return;

  if (isPouring) {
    stopWatering();
  }

  if (currentTool === "rake") {
    saveHistory();
    return;
  }

  if (currentTool === "shear") {
    const dist = Math.hypot(e.clientX - pointerDownX, e.clientY - pointerDownY);
    if (dist > 14) {
      // Precision multi-branch swipe-to-slice stroke
      const p1 = getPlantCoord(pointerDownX, pointerDownY);
      const p2 = getPlantCoord(e.clientX, e.clientY);
      const stemTransforms = getStemTransforms();

      // 1. Slice curved stems
      const sliceRes = swipeSliceCurvedStems(win.state, p1, p2, stemTransforms);
      let didChange = false;

      if (sliceRes.cutCount > 0) {
        saveHistory();
        win.state = sliceRes.state;
        playPruneSound(sliceRes.maxCutThickness);
        didChange = true;
      }

      // 2. Pluck intersecting leaves
      const pluckRes = pluckLeavesAlongSwipe(win.state, p1, p2, stemTransforms, 18);
      if (pluckRes.pluckedCount > 0) {
        if (!didChange) saveHistory();
        win.state = pluckRes.state;
        playDefoliateSound();
        didChange = true;
      }

      if (didChange) {
        draw();
        checkSchoolsAndUnlocks("swipeSlice");
      }
    } else {
      // Single tap precision prune
      pruneAt(e.clientX, e.clientY);
    }
  } else if (currentTool === "jin") {
    const dist = Math.hypot(e.clientX - pointerDownX, e.clientY - pointerDownY);
    if (dist > 14) {
      // Precision multi-branch swipe-to-carve deadwood stroke
      const p1 = getPlantCoord(pointerDownX, pointerDownY);
      const p2 = getPlantCoord(e.clientX, e.clientY);
      const stemTransforms = getStemTransforms();
      const carveRes = swipeCarveCurvedStems(win.state, p1, p2, stemTransforms);
      if (carveRes.carvedCount > 0) {
        saveHistory();
        win.state = carveRes.state;
        playJinSound();
        draw();
        checkSchoolsAndUnlocks("jin");
      }
    } else {
      // Single tap precision carve
      const pt = getPlantCoord(e.clientX, e.clientY);
      const stemTransforms = getStemTransforms();
      let bestHit: { nodeId: number; distance: number } | null = null;
      const hitRadius = (dev.hitRadius ?? 20) * 1.6;
      for (const tr of stemTransforms.values()) {
        const hit = closestPointOnQuadratic(pt, tr.startX, tr.startY, tr.controlX, tr.controlY, tr.endX, tr.endY);
        if (hit.distance <= hitRadius && (!bestHit || hit.distance < bestHit.distance)) {
          bestHit = { nodeId: tr.nodeId, distance: hit.distance };
        }
      }
      if (bestHit) {
        saveHistory();
        const res = carveBranchToJin(win.state, bestHit.nodeId);
        if (res.carved) {
          win.state = res.state;
          playJinSound();
          draw();
          checkSchoolsAndUnlocks("jin");
        }
      }
    }
  } else if (currentTool === "wire" && activeWireNodeId !== null) {
    saveHistory();
    playWireSound();
    activeWireNodeId = null;
    draw();
    checkSchoolsAndUnlocks("wire");
  }
});

canvas.addEventListener("pointercancel", () => {
  activePointerId = null;
  dragging = false;
  activeWireNodeId = null;
  if (isPouring) {
    stopWatering();
  }
});

canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    const win = window as any;
    if (win.state) {
      win.state.cameraZoom = Math.max(
        0.3,
        Math.min(3.0, (win.state.cameraZoom ?? 1.0) + delta)
      );
    }
    draw();
  },
  { passive: false }
);

// --- Studio Drawer & Floating Zen Dock Controls ---
$("btn-drawer-toggle")?.addEventListener("click", () => {
  $("studio-drawer")?.classList.add("open");
  $("drawer-backdrop")?.classList.add("open");
});

$("btn-drawer-close")?.addEventListener("click", () => {
  $("studio-drawer")?.classList.remove("open");
  $("drawer-backdrop")?.classList.remove("open");
});

$("drawer-backdrop")?.addEventListener("click", () => {
  $("studio-drawer")?.classList.remove("open");
  $("drawer-backdrop")?.classList.remove("open");
});

$("btn-quick-grow")?.addEventListener("click", () => {
  $("btn-grow")?.click();
});

$("btn-time-speed")?.addEventListener("click", (e) => {
  getAudioContext();
  const win = window as any;
  if (!win.state) return;
  const currentSpeed = win.state.timeSpeed ?? 1.0;
  let nextSpeed = 1.0;
  if (currentSpeed === 1.0) nextSpeed = 2.0;
  else if (currentSpeed === 2.0) nextSpeed = 5.0;
  else nextSpeed = 1.0;

  win.state.timeSpeed = nextSpeed;
  (e.currentTarget as HTMLElement).textContent = `⏳ ${nextSpeed}x`;
  draw();
});

$("tool-shear")?.addEventListener("click", () => setTool("shear"));
$("tool-water")?.addEventListener("click", () => setTool("water"));
$("tool-wire")?.addEventListener("click", () => setTool("wire"));
$("tool-jin")?.addEventListener("click", () => setTool("jin"));
$("tool-rake")?.addEventListener("click", () => setTool("rake"));
$("tool-breathe")?.addEventListener("click", () => setTool("breathe"));
$("tool-undo")?.addEventListener("click", () => rewindOneStep());
$("btn-breathe-exit")?.addEventListener("click", () => stopBreatheMode());

$("species-select")?.addEventListener("change", (e) => {
  const targetId = (e.target as HTMLSelectElement).value;
  saveHistory();
  newPlant(seed, targetId);
});

// Atmospheric Weather System
const weathers: Array<"clear" | "komorebi" | "rain" | "twilight"> = ["clear", "komorebi", "rain", "twilight"];
let weatherIdx = 0;
$("btn-weather")?.addEventListener("click", () => {
  getAudioContext();
  const win = window as any;
  if (!win.state) return;
  weatherIdx = (weatherIdx + 1) % weathers.length;
  win.state.weather = weathers[weatherIdx];
  if (win.state.weather === "rain") {
    toggleRainAmbiance(true);
  } else {
    toggleRainAmbiance(false);
  }
  draw();
});

// Artisanal Pot Glaze Selector
$("pot-select")?.addEventListener("change", (e) => {
  const win = window as any;
  if (!win.state) return;
  saveHistory();
  win.state.potStyle = (e.target as HTMLSelectElement).value;
  draw();
});

// Tokonoma Gallery & Accoutrements Modal
$("btn-gallery")?.addEventListener("click", () => {
  getAudioContext();
  openGalleryModal();
});
$("btn-gallery-close")?.addEventListener("click", closeGalleryModal);
$("modal-gallery")?.addEventListener("click", (e) => {
  if (e.target === $("modal-gallery")) closeGalleryModal();
});

// Category Filter Chips for Gallery
$("gallery-filters")?.querySelectorAll(".filter-chip").forEach((chip) => {
  chip.addEventListener("click", (e) => {
    $("gallery-filters")?.querySelectorAll(".filter-chip").forEach((c) => c.classList.remove("active"));
    const target = e.currentTarget as HTMLElement;
    target.classList.add("active");
    activeGalleryCategory = target.getAttribute("data-cat") || "all";
    renderGalleryGrid();
  });
});

// Bonsai Schools & Aesthetics FAQ Modal
$("btn-faq")?.addEventListener("click", () => {
  getAudioContext();
  openFaqModal();
});
$("btn-faq-close")?.addEventListener("click", closeFaqModal);
$("modal-faq")?.addEventListener("click", (e) => {
  if (e.target === $("modal-faq")) closeFaqModal();
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeGalleryModal();
    closeFaqModal();
  }
});

// Tokonoma Zen Minimalist Gallery Presentation Mode
$("btn-tokonoma")?.addEventListener("click", () => {
  getAudioContext();
  const win = window as any;
  if (!win.state) return;
  win.state.isTokonoma = true;
  document.body.classList.add("tokonoma-mode");
  playFurinSound();
  draw();
});

$("btn-tokonoma-exit")?.addEventListener("click", () => {
  const win = window as any;
  if (!win.state) return;
  win.state.isTokonoma = false;
  document.body.classList.remove("tokonoma-mode");
  draw();
});

// Growth & Step Controls
$("btn-grow")?.addEventListener("click", () => {
  getAudioContext();
  saveHistory();
  const win = window as any;
  for (let i = 0; i < 10; i++) if (win.state) win.state = growOnce(win.state, prng);
  playGrowSound(Math.floor(Math.random() * 5));
  draw();
  checkSchoolsAndUnlocks("grow");
});

$("btn-grow-season")?.addEventListener("click", () => {
  getAudioContext();
  saveHistory();
  const win = window as any;
  for (let i = 0; i < 50; i++) if (win.state) win.state = growOnce(win.state, prng);
  playGrowSound(2);
  draw();
  checkSchoolsAndUnlocks("grow");
});

$("btn-step")?.addEventListener("click", () => {
  getAudioContext();
  saveHistory();
  const win = window as any;
  if (win.state) win.state = growOnce(win.state, prng);
  playGrowSound(1);
  draw();
  checkSchoolsAndUnlocks("grow");
});

$("btn-rewind")?.addEventListener("click", () => {
  getAudioContext();
  rewindOneStep();
});

$("btn-reset")?.addEventListener("click", () => {
  getAudioContext();
  saveHistory();
  playWaterSound();
  newPlant();
});

$("btn-play")?.addEventListener("click", (e) => {
  playing = !playing;
  (e.target as HTMLButtonElement).textContent = playing ? "Pause" : "Play";
});

$("btn-save")?.addEventListener("click", () => {
  getAudioContext();
  const win = window as any;
  if (win.state) greenhouse.push(JSON.parse(JSON.stringify(win.state)));
  playSaveSound();
  persist();
  draw();
});

$("btn-breed")?.addEventListener("click", () => {
  if (selected.length !== 2) return;
  saveHistory();
  const g0 = greenhouse[selected[0]].genome;
  const g1 = greenhouse[selected[1]].genome;
  const child = breedGenomes(g0, g1, prng);
  const win = window as any;
  win.state = freshState(child, SPECIES[0], { seed: (Math.random() * 1e9) | 0 });
  for (let i = 0; i < 30; i++) win.state = growOnce(win.state, prng);
  selected = [];
  syncDesignControls();
  draw();
});

// Live Design Slider Listeners
function setupDesignSlider(id: string, outputId: string, suffix: string = "") {
  const el = $(id) as HTMLInputElement | null;
  const out = $(outputId);
  if (!el || !out) return;
  el.addEventListener("input", () => {
    out.textContent = `${el.value}${suffix}`;
  });
}
setupDesignSlider("design-angle", "design-angle-value", "°");
setupDesignSlider("design-flower-size", "design-flower-size-value");
setupDesignSlider("design-stiffness", "design-stiffness-value");

$("btn-apply-design")?.addEventListener("click", () => {
  const win = window as any;
  if (!win.state) return;
  saveHistory();

  const angleVal = parseFloat(($("design-angle") as HTMLInputElement).value);
  const flowerVal = parseFloat(($("design-flower-size") as HTMLInputElement).value);
  const stiffVal = parseFloat(($("design-stiffness") as HTMLInputElement).value);

  win.state.genome.angle = [angleVal, angleVal];
  win.state.genome.flowerRadius = [flowerVal, flowerVal];
  win.state.genome.stiffness = [stiffVal, stiffVal];

  try {
    playGrowSound(3);
  } catch {}
  draw();
});

// Pro/Dev Inspection Checkboxes
$("btn-pro")?.addEventListener("click", () => {
  const p = $("pro-panel");
  if (p) p.style.display = p.style.display === "none" ? "block" : "none";
});

$("dev-show-points")?.addEventListener("change", (e) => {
  dev.showPoints = (e.target as HTMLInputElement).checked;
  draw();
});

$("dev-show-ids")?.addEventListener("change", (e) => {
  dev.showIds = (e.target as HTMLInputElement).checked;
  draw();
});

$("dev-show-hitbox")?.addEventListener("change", (e) => {
  dev.showHitbox = (e.target as HTMLInputElement).checked;
  draw();
});

$("dev-hit-radius")?.addEventListener("input", (e) => {
  dev.hitRadius = parseFloat((e.target as HTMLInputElement).value);
  const label = $("dev-hit-radius-value");
  if (label) label.textContent = `${dev.hitRadius}px`;
  if (dev.showHitbox) draw();
});

// Export Controls
$("btn-export")?.addEventListener("click", () => {
  const win = window as any;
  if (!win.state) return;
  const blob = new Blob([exportPlantJSON(win.state)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `zenplant-step${win.state.step}-seed${seed}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

$("btn-svg")?.addEventListener("click", () => {
  const win = window as any;
  if (!win.state) return;
  const blob = new Blob([plantToSVG(win.state, 400, 500)], { type: "image/svg+xml" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `zenplant-step${win.state.step}.svg`;
  a.click();
  URL.revokeObjectURL(a.href);
});

$("btn-png")?.addEventListener("click", () => {
  const win = window as any;
  if (!win.state) return;
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = `zenplant-step${win.state.step}-seed${seed}.png`;
  a.click();
});

$("btn-timelapse")?.addEventListener("click", (e) => {
  const win = window as any;
  if (!win.state) return;
  win.state.isRecording = !win.state.isRecording;
  (e.target as HTMLButtonElement).textContent = win.state.isRecording
    ? `Stop (${win.state.timelapseFrames.length})`
    : "Record Timelapse";
  if (!win.state.isRecording && win.state.timelapseFrames.length > 0) {
    const a = document.createElement("a");
    a.href = win.state.timelapseFrames[win.state.timelapseFrames.length - 1];
    a.download = `zenplant-frame${win.state.timelapseFrames.length}.webp`;
    a.click();
    win.state.timelapseFrames = [];
  }
});

const speedSlider = $("grow-speed") as HTMLInputElement | null;
const speedLabel = $("speed-label");
if (speedSlider) {
  speedSlider.addEventListener("input", () => {
    const win = window as any;
    if (win.state) win.state.growSpeed = parseFloat(speedSlider.value);
    if (speedLabel) speedLabel.textContent = (win.state?.growSpeed ?? 1) + "×";
  });
}

$("btn-import")?.addEventListener("click", () => $("import-file")?.click());
$("import-file")?.addEventListener("change", async (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  saveHistory();
  const win = window as any;
  win.state = importPlantJSON(await f.text());
  prng = createPrng(win.state.step + seed);
  syncDesignControls();
  draw();
});

$("btn-dark")?.addEventListener("click", () => {
  const win = window as any;
  if (win.state) {
    win.state.darkMode = !win.state.darkMode;
    document.body.classList.toggle("dark-mode", win.state.darkMode);
  }
  draw();
});

$("btn-wood")?.addEventListener("click", (e) => {
  const win = window as any;
  if (win.state) {
    win.state.woodTexture = !win.state.woodTexture;
    (e.target as HTMLButtonElement).textContent = win.state.woodTexture
      ? "Wood: ON"
      : "Wood: OFF";
  }
  draw();
});

$("btn-wind")?.addEventListener("click", (e) => {
  windEnabled = !windEnabled;
  toggleWindAmbiance(windEnabled);
  (e.target as HTMLButtonElement).textContent = windEnabled
    ? "Wind: ON"
    : "Wind: OFF";
});

// Battery & Background Optimization via Page Visibility API
let isDocumentVisible = true;
document.addEventListener("visibilitychange", () => {
  isDocumentVisible = !document.hidden;
});

let resizeRaf: number | null = null;
function scheduleDraw() {
  if (resizeRaf !== null) return;
  resizeRaf = requestAnimationFrame(() => {
    resizeRaf = null;
    draw();
  });
}
window.addEventListener("resize", scheduleDraw);
window.addEventListener("orientationchange", () => setTimeout(draw, 150));

let lastWindTime = performance.now();
let lastGrowTime = performance.now();
let autoHistoryCounter = 0;

function animLoop(now: number) {
  if (!isDocumentVisible) {
    requestAnimationFrame(animLoop);
    return;
  }

  const dt = Math.min(0.1, (now - lastWindTime) / 1000);
  lastWindTime = now;
  const win = window as any;

  // Transient serene visual FX updates (blade fade & falling water droplets)
  let fxRedrawNeeded = false;
  let growthRedrawNeeded = false;
  if (slashPoints.length > 0) {
    const cutoff = Date.now() - 350;
    const initialLen = slashPoints.length;
    slashPoints = slashPoints.filter((p) => p.time > cutoff);
    if (slashPoints.length > 0 || initialLen > 0) {
      fxRedrawNeeded = true;
    }
  }

  if (waterDroplets.length > 0) {
    const gravity = 850;
    for (const d of waterDroplets) {
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.vy += gravity * dt;
      d.alpha -= dt * 1.6;
    }
    waterDroplets = waterDroplets.filter((d) => d.alpha > 0.02 && d.y < canvas.height + 20);
    fxRedrawNeeded = true;
  }

  // --- Copper Watering Can Physics & Fine Stream Jet Emission ---
  if (wateringCan.active) {
    wateringCan.x += (wateringCan.targetX - wateringCan.x) * Math.min(1.0, dt * 10);
    wateringCan.y += (wateringCan.targetY - wateringCan.y) * Math.min(1.0, dt * 10);

    if (isPouring) {
      wateringCan.liftProgress = Math.min(1.0, wateringCan.liftProgress + dt * 3.5);
      wateringCan.pourProgress = Math.min(1.0, wateringCan.pourProgress + dt * 4.0);
      wateringCan.alpha = Math.min(1.0, wateringCan.alpha + dt * 5.0);

      // Tilt forward towards ~0.65 rad (~37 degrees)
      const targetTilt = 0.65;
      wateringCan.tiltAngle += (targetTilt - wateringCan.tiltAngle) * Math.min(1.0, dt * 7);

      // Emit fine streaming water lines once tilted past threshold (>0.25 rad)
      if (wateringCan.tiltAngle > 0.25) {
        const rose = getCopperCanRosePosition(wateringCan);
        const jetsToEmit = 4;
        for (let j = 0; j < jetsToEmit; j++) {
          const spread = (Math.random() - 0.5) * 0.35;
          const jetAngle = rose.angle + spread;
          const jetSpeed = 160 + Math.random() * 110;
          waterStreams.push({
            x: rose.x + (Math.random() - 0.5) * 6,
            y: rose.y + (Math.random() - 0.5) * 4,
            vx: Math.cos(jetAngle) * jetSpeed,
            vy: Math.sin(jetAngle) * jetSpeed,
            len: 18 + Math.random() * 14,
            alpha: 0.95,
            thickness: 1.1 + Math.random() * 0.35,
            seed: Math.random(),
          });
        }

        // Nourish soil moisture in pot
        if (win.state) {
          win.state.soilMoisture = Math.min(1.0, (win.state.soilMoisture ?? 0.5) + dt * 0.08);
          // Subtle chance to stimulate growth burst
          if (Math.random() < 0.08) {
            win.state = growOnce(win.state, prng);
            growthRedrawNeeded = true;
          }
        }
      }
    } else {
      // Un-tilt and lower
      wateringCan.tiltAngle += (0 - wateringCan.tiltAngle) * Math.min(1.0, dt * 6);
      wateringCan.pourProgress = Math.max(0, wateringCan.pourProgress - dt * 3.5);
      wateringCan.liftProgress = Math.max(0, wateringCan.liftProgress - dt * 3.0);
      wateringCan.alpha = Math.max(0, wateringCan.alpha - dt * 2.8);
      if (wateringCan.alpha <= 0.02 && wateringCan.tiltAngle < 0.05) {
        wateringCan.active = false;
      }
    }
    fxRedrawNeeded = true;
  }

  // Update fine water stream lines
  if (waterStreams.length > 0) {
    const gravity = 620;
    for (const s of waterStreams) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += gravity * dt;
      s.alpha -= dt * 1.5;
    }
    waterStreams = waterStreams.filter((s) => s.alpha > 0.02 && s.y < canvas.height + 30);
    fxRedrawNeeded = true;
  }

  // Micro-particles: Bark flakes under wire tension, deadwood shavings, weeping sap
  if (win.state?.barkFlakes && win.state.barkFlakes.length > 0) {
    for (const f of win.state.barkFlakes) {
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.vy += 220 * dt;
      f.rot += 4.0 * dt;
      f.alpha -= dt * 1.5;
    }
    win.state.barkFlakes = win.state.barkFlakes.filter((f: any) => f.alpha > 0.05);
    fxRedrawNeeded = true;
  }

  if (win.state?.woodShavings && win.state.woodShavings.length > 0) {
    for (const s of win.state.woodShavings) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 170 * dt;
      s.rot += 3.2 * dt;
      s.alpha -= dt * 1.2;
    }
    win.state.woodShavings = win.state.woodShavings.filter((s: any) => s.alpha > 0.05);
    fxRedrawNeeded = true;
  }

  if (win.state?.sapDrops && win.state.sapDrops.length > 0) {
    for (const drop of win.state.sapDrops) {
      drop.y += drop.vy * dt;
      drop.vy += 90 * dt;
      drop.alpha -= dt * 0.35;
    }
    win.state.sapDrops = win.state.sapDrops.filter((d: any) => d.alpha > 0.05);
    fxRedrawNeeded = true;
  }

  // --- Smooth 60 FPS Fluid Botanical Growth & Calibrated Zen Cadence ---
  const timeMultiplier = win.state?.timeSpeed ?? 1.0;
  const currentGrowSpeed = (win.state?.growSpeed ?? 1.0) * timeMultiplier;

  if (playing && win.state && currentGrowSpeed > 0) {
    // 1. Continuous smooth sub-pixel elongation of meristems and shoots
    const elongationRate = 7.0 * currentGrowSpeed * dt;
    const leafUnfurlRate = 1.8 * currentGrowSpeed * dt;

    for (const n of win.state.nodes) {
      if (!n.isCut && n.terminal && (n.type === "meristem" || n.type === "stem")) {
        if (n.length < n.targetLength) {
          n.length = Math.min(n.targetLength, n.length + elongationRate);
          growthRedrawNeeded = true;
        }
      }
      // Smoothly unfurl leaves from bud scale to full leaf
      if (n.type === "leaf" && (n.age ?? 0) < 5) {
        n.age = Math.min(5, (n.age ?? 0) + leafUnfurlRate);
        growthRedrawNeeded = true;
      }
    }

    // 2. Developmental branching step cadence (calibrated by speed multiplier)
    const stepInterval = Math.max(90, 480 / currentGrowSpeed);
    if (now - lastGrowTime > stepInterval) {
      lastGrowTime = now;
      if (autoHistoryCounter % 15 === 0) {
        saveHistory();
      }
      autoHistoryCounter++;
      win.state = growOnce(win.state, prng);
      growthRedrawNeeded = true;
    }
  }

  // 3. Shishi-Odoshi bamboo water rocker progression & rain soil moistening
  let shishiRedrawNeeded = false;
  if (win.state) {
    const prevWater = win.state.shishiWater ?? 0;
    // Rocker fills over ~14 seconds
    const newWater = prevWater + dt * (1 / 14);
    if (newWater >= 1.0) {
      win.state.shishiWater = 0;
      playShishiOdoshiClack();
      shishiRedrawNeeded = true;
    } else {
      win.state.shishiWater = newWater;
      shishiRedrawNeeded = true;
    }

    if (win.state.weather === "rain" && (win.state.soilMoisture ?? 0) < 0.95) {
      win.state.soilMoisture = Math.min(0.95, (win.state.soilMoisture ?? 0.5) + dt * 0.05);
    }
  }

  const activeWeather = win.state?.weather;
  const weatherAnimated = activeWeather === "rain" || activeWeather === "twilight" || activeWeather === "komorebi" || win.state?.isTokonoma;

  if (windEnabled && win.state) {
    win.state.windTime += dt * 2.0;
    draw();
  } else if (fxRedrawNeeded || growthRedrawNeeded || shishiRedrawNeeded || weatherAnimated) {
    if (win.state) win.state.windTime = (win.state.windTime ?? 0) + dt * 1.5;
    draw();
  }

  if (win.state?.isRecording && win.state.timelapseFrames.length < 300) {
    win.state.timelapseFrames.push(canvas.toDataURL("image/webp", 0.8));
    const recBtn = $("btn-timelapse");
    if (recBtn) recBtn.textContent = `Stop (${win.state.timelapseFrames.length})`;
  }

  requestAnimationFrame(animLoop);
}

requestAnimationFrame(animLoop);
newPlant();
