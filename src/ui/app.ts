import { createPrng, type Prng } from "../sim/prng";
import { freshState, growOnce, pruneNode } from "../sim/growth";
import { breedGenomes } from "../sim/genetics";
import { japaneseBonsai, zenBamboo, sakuraOrchid, generateGenomeForSpecies, getSpeciesById } from "../data/species";
import { renderPlant, computeTransform, seasonOf, getWindDisp } from "../render/canvas";
import { exportPlantJSON, importPlantJSON, exportGenomeJSON, plantToSVG } from "../export/plugin";
import type { Genome, PlantState } from "../sim/types";

const $ = (id: string) => document.getElementById(id)!;
const canvas = $("plant") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

const SPECIES = [japaneseBonsai, zenBamboo, sakuraOrchid];
let speciesIdx = 0;
let prng: Prng = createPrng(42);
let seed = 42;
let state: PlantState;
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
  if (state && state.nodes.length > 0) {
    greenhouse.push(JSON.parse(JSON.stringify(state)));
    persist();
  }
  seed = newSeed;
  prng = createPrng(seed);
  const genome = generateGenomeForSpecies(SPECIES[speciesIdx], seed);
  state = freshState(genome, SPECIES[speciesIdx], { seed });
  for (let i = 0; i < 80; i++) state = growOnce(state, prng);
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
  const info = renderPlant(ctx, state, r.width, r.height);
  const [name, color] = info.split("|");
  const badge = $("season-badge");
  badge.textContent = `${name} · step ${state.step} · seed ${seed}`;
  (badge as HTMLElement).style.color = color;
  const g = state.genome;
  $("genome-info").innerHTML =
    `Vigor ${g.vigor.toFixed(2)} · Angle ${g.angle.toFixed(0)}° · Len ${g.lenScale.toFixed(0)}<br>` +
    `Species ${SPECIES[speciesIdx].name} · Nodes ${state.nodes.length}`;
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
    return `<div class="slot ${sel}" data-i="${i}"><span>#${i + 1} · step ${s.step} · ${s.nodes.length} nodes</span><span class="slot-color" style="background:rgb(${s.genome.flowerRGB[0]},${s.genome.flowerRGB[1]},${s.genome.flowerRGB[2]})"></span></div>`;
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

function distToSeg(p: {x:number;y:number}, v: {x:number;y:number}, w: {x:number;y:number}) {
  const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2;
  if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
}

canvas.style.touchAction = "none";
let dragging = false;
let dragStartX = 0, dragStartY = 0;
let dragStartCamX = 0, dragStartCamY = 0;
let dragMoved = false;
function pruneAt(clientX: number, clientY: number) {
  if (dragMoved) return;
  const r = canvas.getBoundingClientRect();
  const { scale, ox, oy } = computeTransform(
    r.width,
    r.height,
    state.showRoots,
    state.cameraX ?? 0,
    state.cameraY ?? 0,
    state.cameraZoom ?? 1.0
  );
  const wx = (clientX - r.left - ox) / scale;
  const wy = (clientY - r.top - oy) / scale;
  const disp = getWindDisp();
  let best: number | null = null, bestD = 20;
  for (const n of state.nodes) {
    if (n.type !== "stem" && n.type !== "meristem") continue;
    const parentD = n.parentId !== null ? disp.get(n.parentId) : undefined;
    const sx = parentD ? parentD.wx : n.x;
    const sy = parentD ? parentD.wy : n.y;
    const childD = disp.get(n.id);
    const ex = childD ? childD.wx : n.x + Math.cos(n.angle) * n.length;
    const ey = childD ? childD.wy : n.y + Math.sin(n.angle) * n.length;
    const d = distToSeg({ x: wx, y: wy }, { x: sx, y: sy }, { x: ex, y: ey });
    if (d < bestD) { bestD = d; best = n.id; }
  }
  if (best !== null) { state = pruneNode(state, best); state.cutAnimTime = 1.0; draw(); }
}
canvas.addEventListener("click", (e) => pruneAt(e.clientX, e.clientY));
canvas.addEventListener("pointerup", (e) => pruneAt(e.clientX, e.clientY));

canvas.addEventListener("mousedown", (e) => {
  dragging = true;
  dragMoved = false;
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  dragStartCamX = state.cameraX;
  dragStartCamY = state.cameraY;
});

window.addEventListener("mousemove", (e) => {
  if (!dragging) return;
  const dx = e.clientX - dragStartX;
  const dy = e.clientY - dragStartY;
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved = true;
  state.cameraX = dragStartCamX + dx;
  state.cameraY = dragStartCamY + dy;
  draw();
});

window.addEventListener("mouseup", () => { dragging = false; });

canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const delta = e.deltaY > 0 ? -0.1 : 0.1;
  state.cameraZoom = Math.max(0.3, Math.min(3.0, state.cameraZoom + delta));
  draw();
}, { passive: false });

$("btn-grow").addEventListener("click", () => { for (let i = 0; i < 10; i++) state = growOnce(state, prng); draw(); });
$("btn-grow-season").addEventListener("click", () => { for (let i = 0; i < 50; i++) state = growOnce(state, prng); draw(); });
$("btn-reset").addEventListener("click", () => newPlant());
$("btn-play").addEventListener("click", (e) => {
  playing = !playing;
  (e.target as HTMLButtonElement).textContent = playing ? "Pause" : "Play";
});
$("species-select").addEventListener("change", (e) => {
  speciesIdx = Number((e.target as HTMLSelectElement).value);
  newPlant(seed);
});
$("btn-save").addEventListener("click", () => {
  greenhouse.push(JSON.parse(JSON.stringify(state)));
  persist(); draw();
});
$("btn-breed").addEventListener("click", () => {
  if (selected.length !== 2) return;
  const g0 = greenhouse[selected[0]].genome;
  const g1 = greenhouse[selected[1]].genome;
  const child = breedGenomes(g0, g1, prng);
  state = freshState(child, SPECIES[speciesIdx], { seed: (Math.random() * 1e9) | 0 });
  for (let i = 0; i < 30; i++) state = growOnce(state, prng);
  selected = [];
  draw();
});
$("btn-pro").addEventListener("click", () => {
  const p = $("pro-panel");
  p.style.display = p.style.display === "none" ? "block" : "none";
});
$("btn-export").addEventListener("click", () => {
  const blob = new Blob([exportPlantJSON(state)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `zenplant-step${state.step}-seed${seed}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});
$("btn-svg").addEventListener("click", () => {
  const blob = new Blob([plantToSVG(state, 400, 500)], { type: "image/svg+xml" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `zenplant-step${state.step}.svg`;
  a.click();
  URL.revokeObjectURL(a.href);
});
$("btn-png")?.addEventListener("click", () => {
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = `zenplant-step${state.step}-seed${seed}.png`;
  a.click();
});
$("btn-timelapse")?.addEventListener("click", (e) => {
  state.isRecording = !state.isRecording;
  (e.target as HTMLButtonElement).textContent = state.isRecording
    ? `Stop (${state.timelapseFrames.length})`
    : "Record Timelapse";
  if (!state.isRecording && state.timelapseFrames.length > 0) {
    const a = document.createElement("a");
    a.href = state.timelapseFrames[state.timelapseFrames.length - 1];
    a.download = `zenplant-frame${state.timelapseFrames.length}.webp`;
    a.click();
    state.timelapseFrames = [];
  }
});
const speedSlider = $("grow-speed") as HTMLInputElement;
const speedLabel = $("speed-label");
if (speedSlider) {
  speedSlider.addEventListener("input", () => {
    state.growSpeed = parseFloat(speedSlider.value);
    if (speedLabel) speedLabel.textContent = state.growSpeed + "×";
  });
}
$("btn-import").addEventListener("click", () => $("import-file").click());
$("import-file").addEventListener("change", async (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  state = importPlantJSON(await f.text());
  prng = createPrng(state.step + seed);
  draw();
});
$("btn-dark").addEventListener("click", () => { state.darkMode = !state.darkMode; draw(); });
$("btn-wood").addEventListener("click", (e) => { state.woodTexture = !state.woodTexture; (e.target as HTMLButtonElement).textContent = state.woodTexture ? "Wood: ON" : "Wood: OFF"; draw(); });
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
  if (windEnabled && state) {
    state.windTime += dt * 2.0;
    draw();
  }
  const growInterval = state.growSpeed > 0 ? 180 / state.growSpeed : 999999;
  if (playing && state && now - lastGrowTime > growInterval) {
    state = growOnce(state, prng);
    lastGrowTime = now;
    if (!windEnabled) draw();
  }
  if (state?.isRecording && state.timelapseFrames.length < 300) {
    state.timelapseFrames.push(canvas.toDataURL("image/webp", 0.8));
    const recBtn = $("btn-timelapse");
    if (recBtn) recBtn.textContent = `Stop (${state.timelapseFrames.length})`;
  }
  requestAnimationFrame(animLoop);
}
requestAnimationFrame(animLoop);
newPlant();
