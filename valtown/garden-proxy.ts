import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";

const app = new Hono();
app.use("/*", cors());

const ENGINE_URL = Deno.env.get("FLORA_ENGINE_URL") ?? "http://localhost:8000";
const MAX_STEPS = 200;

async function forward(path: string, req: Request): Promise<Response> {
  const body = await req.text();
  const resp = await fetch(`${ENGINE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  return new Response(resp.body, {
    status: resp.status,
    headers: { "Content-Type": "application/json" },
  });
}

app.post("/api/simulate", async (c) => {
  const data = await c.req.json().catch(() => ({}));
  data.steps = Math.min(Number(data.steps ?? 10), MAX_STEPS);
  const resp = await fetch(`${ENGINE_URL}/api/simulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return new Response(resp.body, {
    status: resp.status,
    headers: { "Content-Type": "application/json" },
  });
});

app.post("/api/cut_at", (c) => forward("/api/cut_at", c.req.raw));
app.post("/api/prune", (c) => forward("/api/prune", c.req.raw));
app.post("/api/breed", (c) => forward("/api/breed", c.req.raw));
app.get("/api/export/obj", async (c) => {
  const resp = await fetch(`${ENGINE_URL}/api/export/obj`, { method: "POST" });
  return new Response(resp.body, {
    status: resp.status,
    headers: { "Content-Type": "text/plain" },
  });
});

app.get("/", async (c) => {
  const resp = await fetch(`${ENGINE_URL}/`);
  return new Response(resp.body, {
    status: resp.status,
    headers: { "Content-Type": "text/html" },
  });
});

export default app.fetch;
