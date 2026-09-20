import { Hono } from "hono";
import { japaneseBonsai, zenBamboo, sakuraOrchid, generateGenomeForSpecies, getSpeciesById } from "./data/species";
import { expressTrait } from "./sim/genetics";

const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok", service: "zenplant" }));

app.get("/api/species", (c) =>
  c.json({
    species: [japaneseBonsai, zenBamboo, sakuraOrchid].map((s) => ({ id: s.id, name: s.name, genus: s.genus, version: s.version })),
  })
);

app.get("/api/genome/:id", (c) => {
  const id = c.req.param("id");
  const sp = getSpeciesById(id);
  if (!sp) return c.json({ error: "unknown species" }, 404);
  const seedParam = c.req.query("seed");
  const seed = seedParam !== undefined ? Number(seedParam) : Date.now();
  return c.json({ genome: generateGenomeForSpecies(sp, seed), speciesId: sp.id, seed });
});

const MIME: Record<string, string> = {
  html: "text/html", js: "application/javascript", css: "text/css",
  json: "application/json", svg: "image/svg+xml", png: "image/png", ico: "image/x-icon",
};

for (const route of ["/", "/index.html"]) {
  app.get(route, async (c) => {
    const f = Bun.file("./public/index.html");
    if (!(await f.exists())) return c.text("public/index.html missing — run bun run build:client", 500);
    return new Response(f, { headers: { "Content-Type": "text/html" } });
  });
}

app.get("/app.js", async (c) => {
  const f = Bun.file("./public/app.js");
  if (!(await f.exists())) return c.text("public/app.js missing — run bun run build:client", 500);
  return new Response(f, { headers: { "Content-Type": "application/javascript" } });
});

app.get("/export/svg", async (c) => {
  const { plantToSVG } = await import("./export/plugin");
  const { freshState, growOnce } = await import("./sim/growth");
  const { createPrng } = await import("./sim/prng");
  const sp = getSpeciesById((c.req.query("species") as string) || "japanese-bonsai") ?? japaneseBonsai;
  const seed = Number(c.req.query("seed") ?? 42);
  const steps = Math.min(200, Number(c.req.query("steps") ?? 40));
  const prng = createPrng(seed);
  let s = freshState(generateGenomeForSpecies(sp, seed), sp, { seed });
  for (let i = 0; i < steps; i++) s = growOnce(s, prng);
  return new Response(plantToSVG(s, 400, 500), { headers: { "Content-Type": "image/svg+xml" } });
});

export default app;

if (import.meta.main) {
  console.log("ZenPlant app module loaded (served by Bun runtime)");
}
