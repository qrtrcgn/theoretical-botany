import type { Genome, PlantState } from "../sim/types";
import { createPrng, type Prng } from "../sim/prng";
import { freshState, growOnce } from "../sim/growth";
import { precisionSplitAndPrune } from "../sim/precisionSplit";
import { breedGenomes, expressTrait } from "../sim/genetics";
import { japaneseBonsai, zenBamboo, sakuraOrchid, generateGenomeForSpecies, getSpeciesById, SPECIES } from "../data/species";
import { renderPlant, computeTransform, seasonOf, getWindDisp } from "../render/canvas";
import { exportPlantJSON, plantToSVG, importPlantJSON } from "../export/plugin";
import { playPruneSound, playGrowSound, playWaterSound, playSaveSound, toggleWindAmbiance, getAudioContext } from "../audio/soundscape";

declare global {
  interface Window {
    debugState?: () => string;
    state: PlantState | null;
  }
}

window.debugState = () => {
  if (!window.state) return "State not initialized";
  return JSON.stringify({
    nodesCount: window.state.nodes.length,
    rootLen: window.state.nodes[0]?.length,
    step: window.state.step,
    species: window.state.speciesId
  }, null, 2);
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

try {
  const saved = localStorage.getItem("zenplant.greenhouse");
  if (saved) greenhouse = JSON.parse(saved);
} catch { /* ignore */ }

function persist() {
  try { localStorage.setItem("zenplant.greenhouse", JSON.stringify(greenhouse)); } catch { /* ignore */ }
}

function newPlant(newSeed = (Math.random() * 1e9) | 0) {
  const win = window as any;
  if (win.state && win.state.nodes.length > 0) {
    greenhouse.push(JSON.parse(JSON.stringify(win.state)));
    persist();
  }
  seed = newSeed;
  prng = createPrng(seed);
  const sp = SPECIES[Math.floor(Math.random() * SPECIES.length)];
  const genome = generateGenomeForSpecies(sp, seed);
  win.state = freshState(genome, sp, { seed });
  console.log("Simulation: New plant initialized. Starting growth...");
  for (let i = 0; i < 80; i++) win.state = growOnce(win.state, prng);
  console.log(`Simulation: Initial growth complete. Nodes: ${win.state.nodes.length}`);
  draw();
}

function draw() {
  const r = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const needResize = canvas.width !== Math.floor(r.width * dpr) || canvas.height !== Math.floor(r.height * dpr);
  if (needResize) {
    canvas.width = Math.floor(r.width * dpr);
    canvas.height = Math.floor(r.height * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const win = window as any;
  if (!win.state) return;
  console.log(`Draw: Nodes=${win.state.nodes.length}, RootLen=${win.state.nodes[0]?.length}, Step=${win.state.step}`);
  const info = renderPlant(ctx, win.state, r.width, r.height);
  const [name, color] = info.split("|");
  const badge = $("season-badge");
  badge.textContent = `${name} · step ${win.state.step} · seed ${seed}`;
  (badge as HTMLElement).style.color = color;
  const g = win.state.genome;
  const sp = getSpeciesById(win.state.speciesId) || SPECIES[0];
  const isIdentified = win.state.nodes.length > 20;
  const speciesName = isIdentified ? sp.name : "Unknown Species";
  $("genome-info").innerHTML =
    `Vigor ${expressTrait(g, "vigor").toFixed(2)} · Angle ${expressTrait(g, "angle").toFixed(0)}° · Len ${expressTrait(g, "lenScale").toFixed(0)}<br>` +
    `${speciesName} · Nodes ${win.state.nodes.length}`;
  renderSlots();
}

function renderSlots() {
  const box = $("slots-container");
  if (greenhouse.length === 0) {
    box.innerHTML = '<div style="font-size:11px;color:#64748b;text-align:center">Save plants for breeding.</div>';
    ($("btn-breed") as HTMLButtonElement).style.display = "none";
    return;
  }
  box.innerHTML = greenhouse.map((s, i) => {
    const sel = selected.includes(i) ? "selected" : "";
    const rgb = expressTrait(s.genome, "flowerRGB") as [number, number, number];
    return `<div class="slot ${sel}" data-i="${i}"><span>#${i + 1} · step ${s.step} · ${s.nodes.length} nodes</span><span class="slot-color" style="background:rgb(${rgb[0]},${rgb[1]},${rgb[2]})"></span></div>`;
  }).join("");
  box.querySelectorAll(".slot").forEach((el) => {
    el.addEventListener("click", () => {
      const i = Number((el as HTMLElement).dataset.i);
      const at = selected.indexOf(i);
      if (at > -1) selected.splice(at, 1);
      else { if (selected.length >= 2) selected.shift(); selected.push(i); }
      draw();
    });
  });
  const bb = $("btn-breed") as HTMLButtonElement;
  if (selected.length === 2) {
    bb.style.display = "block";
    bb.textContent = `Breed #${selected[0] + 1} + #${selected[1] + 1}`;
  } else bb.style.display = "none";
}

function projectOnSeg(p: {x:number;y:number}, v: {x:number;y:number}, w: {x:number;y:number}) {
  const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2;
  if (l2 === 0) return { dist: Math.hypot(p.x - v.x, p.y - v.y), t: 1, v, w };
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  const dist = Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
  return { dist, t, v, w };
}

canvas.style.touchAction = "none";
let dragging = false;
let dragStartX = 0, dragStartY = 0;
let dragStartCamX = 0, dragStartCamY = 0;
let dragMoved = false;
function pruneAt(clientX: number, clientY: number) {
  if (dragMoved) return;
  const r = canvas.getBoundingClientRect();
  const win = window as any;
  const { scale, ox, oy } = computeTransform(
    r.width,
    r.height,
    win.state?.showRoots ?? false,
    win.state?.cameraX ?? 0,
    win.state?.cameraY ?? 0,
    win.state?.cameraZoom ?? 1.0
  );
  const wx = (clientX - r.left - ox) / scale;
  const wy = (clientY - r.top - oy) / scale;
  const disp = getWindDisp();
  let best: number | null = null;
  let bestD = 8;
  let bestSeg: { sx: number; sy: number; ex: number; ey: number } | null = null;
  if (win.state) {
    for (const n of win.state.nodes) {
      if (n.type !== "stem" && n.type !== "meristem") continue;
      const parentD = n.parentId !== null ? disp.get(n.parentId) : undefined;
      const sx = parentD ? parentD.wx : n.x;
      const sy = parentD ? parentD.wy : n.y;
      const childD = disp.get(n.id);
      const ex = childD ? childD.wx : n.x + Math.cos(n.angle) * n.length;
      const ey = childD ? childD.wy : n.y + Math.sin(n.angle) * n.length;
      const hit = projectOnSeg({ x: wx, y: wy }, { x: sx, y: sy }, { x: ex, y: ey });
      if (hit.dist < bestD) {
        bestD = hit.dist;
        best = n.id;
        bestSeg = { sx, sy, ex, ey };
      }
    }
  }
  if (best !== null && win.state && bestSeg) {
    win.state = precisionSplitAndPrune(win.state, best, { x: wx, y: wy }, bestSeg);
    try { playPruneSound(); } catch { /* ignore audio error */ }
    draw();
  }
}
canvas.addEventListener("pointerdown", () => { getAudioContext(); });
canvas.addEventListener("click", (e) => pruneAt(e.clientX, e.clientY));

canvas.addEventListener("mousedown", (e) => {
  dragging = true;
  dragMoved = false;
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  const win = window as any;
  dragStartCamX = win.state?.cameraX ?? 0;
  dragStartCamY = win.state?.cameraY ?? 0;
});

window.addEventListener("mousemove", (e) => {
  if (!dragging) return;
  const dx = e.clientX - dragStartX;
  const dy = e.clientY - dragStartY;
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved = true;
  const win = window as any;
  if (win.state) {
    win.state.cameraX = dragStartCamX + dx;
    win.state.cameraY = dragStartCamY + dy;
  }
  draw();
}, { passive: false });

window.addEventListener("mouseup", () => { dragging = false; });

canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const delta = e.deltaY > 0 ? -0.1 : 0.1;
  const win = window as any;
  if (win.state) {
    win.state.cameraZoom = Math.max(0.3, Math.min(3.0, win.state.cameraZoom + delta));
  }
  draw();
}, { passive: false });

$("btn-grow").addEventListener("click", () => { 
  getAudioContext();
  const win = window as unknown as { state: PlantState | null };
  for (let i = 0; i < 10; i++) if (win.state) win.state = growOnce(win.state, prng); 
  playGrowSound(Math.floor(Math.random() * 5));
  draw(); 
});
$("btn-grow-season").addEventListener("click", () => { 
  getAudioContext();
  const win = window as unknown as { state: PlantState | null };
  for (let i = 0; i < 50; i++) if (win.state) win.state = growOnce(win.state, prng); 
  playGrowSound(2);
  draw(); 
});
$("btn-reset").addEventListener("click", () => { getAudioContext(); playWaterSound(); newPlant(); });
$("btn-play").addEventListener("click", (e) => {
  playing = !playing;
  (e.target as HTMLButtonElement).textContent = playing ? "Pause" : "Play";
});

$("btn-save").addEventListener("click", () => {
  getAudioContext();
  const win = window as unknown as { state: PlantState | null };
  if (win.state) greenhouse.push(JSON.parse(JSON.stringify(win.state)));
  playSaveSound();
  persist(); draw();
});
$("btn-breed").addEventListener("click", () => {
  if (selected.length !== 2) return;
  const g0 = greenhouse[selected[0]].genome;
  const g1 = greenhouse[selected[1]].genome;
  const child = breedGenomes(g0, g1, prng);
  const win = window as any;
  win.state = freshState(child, SPECIES[0], { seed: (Math.random() * 1e9) | 0 });
  for (let i = 0; i < 30; i++) win.state = growOnce(win.state, prng);
  selected = [];
  draw();
});
$("btn-pro").addEventListener("click", () => {
  const p = $("pro-panel");
  p.style.display = p.style.display === "none" ? "block" : "none";
});
$("btn-export").addEventListener("click", () => {
  const win = window as any;
  if (!win.state) return;
  const blob = new Blob([exportPlantJSON(win.state)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `zenplant-step${win.state.step}-seed${seed}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});
$("btn-svg").addEventListener("click", () => {
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
const speedSlider = $("grow-speed") as HTMLInputElement;
const speedLabel = $("speed-label");
if (speedSlider) {
  speedSlider.addEventListener("input", () => {
    const win = window as any;
    if (win.state) win.state.growSpeed = parseFloat(speedSlider.value);
    if (speedLabel) speedLabel.textContent = (win.state?.growSpeed ?? 1) + "×";
  });
}
$("btn-import").addEventListener("click", () => $("import-file").click());
$("import-file").addEventListener("change", async (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  const win = window as any;
  win.state = importPlantJSON(await f.text());
  prng = createPrng(win.state.step + seed);
  draw();
});
$("btn-dark").addEventListener("click", () => { 
  const win = window as any;
  if (win.state) {
    win.state.darkMode = !win.state.darkMode; 
    document.body.classList.toggle("dark-mode", win.state.darkMode);
  }
  draw(); 
});
$("btn-wood").addEventListener("click", (e) => { 
  const win = window as any;
  if (win.state) {
    win.state.woodTexture = !win.state.woodTexture; 
    (e.target as HTMLButtonElement).textContent = win.state.woodTexture ? "Wood: ON" : "Wood: OFF"; 
  }
  draw(); 
});
$("btn-wind").addEventListener("click", (e) => { windEnabled = !windEnabled; (e.target as HTMLButtonElement).textContent = windEnabled ? "Wind: ON" : "Wind: OFF"; });

let resizeRaf: number | null = null;
function scheduleDraw() {
  if (resizeRaf !== null) return;
  resizeRaf = requestAnimationFrame(() => { resizeRaf = null; draw(); });
}
window.addEventListener("resize", scheduleDraw);
window.addEventListener("orientationchange", () => setTimeout(draw, 150));
if ((window as unknown as { visualViewport?: { addEventListener: (t: string, f: () => void) => void } }).visualViewport) {
  (window as unknown as { visualViewport: { addEventListener: (t: string, f: () => void) => void } }).visualViewport.addEventListener("resize", scheduleDraw);
}
let lastWindTime = performance.now();
let lastGrowTime = performance.now();
function animLoop(now: number) {
  const dt = (now - lastWindTime) / 1000;
  lastWindTime = now;
  const win = window as any;
  if (windEnabled && win.state) {
    win.state.windTime += dt * 2.0;
    draw();
  }
  const growInterval = win.state?.growSpeed > 0 ? 180 / win.state.growSpeed : 999999;
  if (playing && win.state && now - lastGrowTime > growInterval) {
    win.state = growOnce(win.state, prng);
    lastGrowTime = now;
    if (!windEnabled) draw();
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
