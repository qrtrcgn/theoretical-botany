/**
 * ZenPlant - Local AI Bonsai Judge & Stylist Subagent
 * Powered by local Ollama instance running Qwen2.5-Coder:14B (or qwen:latest).
 * 
 * Analyzes plant state and geometry against classical Japanese bonsai aesthetic principles:
 * - Chokkan (Formal Upright)
 * - Moyogi (Informal Upright)
 * - Shakan (Slanting)
 * - Kengai (Cascade) / Han-kengai (Semi-cascade)
 * - Bunjin-gi (Literati)
 * - Hokidachi (Broom Style)
 * 
 * Delivers structured critique, aesthetic balance scores, and specific pruning suggestions.
 */

import type { PlantState, PlantNode } from "../sim/types";
import { expressTrait } from "../sim/genetics";
import { freshState, growOnce } from "../sim/growth";
import { japaneseBonsai, generateGenomeForSpecies, getSpeciesById } from "../data/species";
import { createPrng } from "../sim/prng";

export interface BonsaiAnalysisMetrics {
  speciesName: string;
  totalNodes: number;
  stemCount: number;
  leafCount: number;
  flowerCount: number;
  height: number;
  width: number;
  aspectRatio: number;
  centerOfMassX: number;
  dominantBranchAngleDeg: number;
  trunkCurvature: number;
  maxBranchDepth: number;
  avgShade: number;
  stiffness: number;
}

export interface BonsaiAestheticEvaluation {
  model: string;
  styleClassification: string;
  aestheticScore: number; // 0 to 100
  summary: string;
  strengths: string[];
  criticisms: string[];
  pruningRecommendations: string[];
  rawResponse?: string;
}

/**
 * Extracts geometric and botanical metrics from a plant state to feed into the local LLM.
 */
export function extractBonsaiMetrics(state: PlantState): BonsaiAnalysisMetrics {
  const nodes = state.nodes;
  const stems = nodes.filter((n) => n.type === "stem" || n.type === "meristem");
  const leaves = nodes.filter((n) => n.type === "leaf" && n.fallState !== "falling");
  const flowers = nodes.filter((n) => n.type === "flower" && n.fallState !== "falling");

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let sumX = 0;
  let totalShade = 0;
  let maxDepth = 0;
  let totalCurve = 0;

  for (const n of nodes) {
    if (n.x < minX) minX = n.x;
    if (n.x > maxX) maxX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.y > maxY) maxY = n.y;
    sumX += n.x;
    if (n.depth > maxDepth) maxDepth = n.depth;
    if (n.curve) totalCurve += Math.abs(n.curve);
  }

  for (const l of leaves) {
    totalShade += l.shade ?? 0;
  }

  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const avgX = nodes.length > 0 ? sumX / nodes.length : 0;
  const avgShade = leaves.length > 0 ? totalShade / leaves.length : 0;
  const avgCurve = stems.length > 0 ? totalCurve / stems.length : 0;

  const sp = getSpeciesById(state.speciesId) || japaneseBonsai;
  const angle = expressTrait(state.genome, "angle") || 30;
  const stiffness = expressTrait(state.genome, "stiffness") || 1.0;

  return {
    speciesName: sp.name,
    totalNodes: nodes.length,
    stemCount: stems.length,
    leafCount: leaves.length,
    flowerCount: flowers.length,
    height: Number(height.toFixed(1)),
    width: Number(width.toFixed(1)),
    aspectRatio: Number((width / height).toFixed(2)),
    centerOfMassX: Number(avgX.toFixed(1)),
    dominantBranchAngleDeg: Number(angle.toFixed(1)),
    trunkCurvature: Number(avgCurve.toFixed(3)),
    maxBranchDepth: maxDepth,
    avgShade: Number(avgShade.toFixed(2)),
    stiffness: Number(stiffness.toFixed(2)),
  };
}

/**
 * Check if the local Ollama service is reachable.
 */
export async function checkOllamaHealth(endpoint = "http://localhost:11434"): Promise<boolean> {
  try {
    const res = await fetch(`${endpoint}/api/tags`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Evaluates a bonsai plant state using the local Qwen subagent via Ollama.
 */
export async function evaluateBonsaiWithQwen(
  state: PlantState,
  options: {
    model?: string;
    endpoint?: string;
    temperature?: number;
  } = {}
): Promise<BonsaiAestheticEvaluation> {
  const endpoint = options.endpoint || "http://localhost:11434";
  const preferredModel = options.model || "Qwen2.5-Coder:14B";

  const metrics = extractBonsaiMetrics(state);

  const prompt = `You are a master Japanese Bonsai Sensei and algorithmic botany evaluator.
Analyze the following botanical and geometric measurements of a procedurally cultivated bonsai tree:

- Species: ${metrics.speciesName}
- Total Node Count: ${metrics.totalNodes}
- Stems: ${metrics.stemCount} | Foliage Leaves: ${metrics.leafCount} | Flowers: ${metrics.flowerCount}
- Bounding Box: Width ${metrics.width}px, Height ${metrics.height}px (Aspect Ratio: ${metrics.aspectRatio})
- Horizontal Center of Mass Offset: ${metrics.centerOfMassX}px
- Branching Angle: ${metrics.dominantBranchAngleDeg}°
- Trunk Curvature Index: ${metrics.trunkCurvature}
- Branching Depth Hierarchy: ${metrics.maxBranchDepth} levels
- Foliage Self-Shading Index: ${metrics.avgShade} (0 = open sun, 1 = heavily shaded)
- Wood Stiffness: ${metrics.stiffness}

Evaluate this tree based on traditional Japanese bonsai rules (Shokan, Moyogi, Kengai, Shakan, Bunjin-gi, Hokidachi).
Return your critique ONLY in valid JSON with this exact schema:
{
  "styleClassification": "Name of best-fitting classical bonsai style",
  "aestheticScore": 85,
  "summary": "Concise 1-2 sentence evaluation of the overall silhouette and energy (ki)",
  "strengths": ["list of 2-3 specific aesthetic strengths"],
  "criticisms": ["list of 1-2 areas for improvement or branch crowding"],
  "pruningRecommendations": ["actionable advice on where to snip or wire branches"]
}`;

  const isHealthy = await checkOllamaHealth(endpoint);
  if (!isHealthy) {
    console.warn(`[Local AI Subagent] Ollama server at ${endpoint} is not responding. Falling back to local heuristic evaluation.`);
    return fallbackEvaluation(metrics);
  }

  try {
    const response = await fetch(`${endpoint}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: preferredModel,
        prompt,
        stream: false,
        options: {
          temperature: options.temperature ?? 0.3,
          num_predict: 1024,
        },
      }),
      signal: AbortSignal.timeout(45000),
    });

    if (!response.ok) {
      throw new Error(`Ollama HTTP error ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as { response: string };
    const rawText = data.response;

    // Parse JSON from model output
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        model: preferredModel,
        styleClassification: parsed.styleClassification || "Moyogi (Informal Upright)",
        aestheticScore: typeof parsed.aestheticScore === "number" ? parsed.aestheticScore : 80,
        summary: parsed.summary || "Harmonious procedural bonsai structure.",
        strengths: Array.isArray(parsed.strengths) ? parsed.strengths : ["Balanced branching"],
        criticisms: Array.isArray(parsed.criticisms) ? parsed.criticisms : [],
        pruningRecommendations: Array.isArray(parsed.pruningRecommendations) ? parsed.pruningRecommendations : [],
        rawResponse: rawText,
      };
    } else {
      throw new Error("Could not parse JSON from model output");
    }
  } catch (err: unknown) {
    console.warn(`[Local AI Subagent] Error during Qwen inference:`, err);
    return fallbackEvaluation(metrics);
  }
}

function fallbackEvaluation(metrics: BonsaiAnalysisMetrics): BonsaiAestheticEvaluation {
  const isUpright = Math.abs(metrics.centerOfMassX) < 15;
  const style = isUpright ? "Chokkan (Formal Upright)" : "Moyogi (Informal Upright)";
  const score = Math.round(Math.min(95, Math.max(60, 80 + (metrics.leafCount / (metrics.stemCount + 1)) * 5 - metrics.avgShade * 20)));

  return {
    model: "heuristic-fallback",
    styleClassification: style,
    aestheticScore: score,
    summary: `A healthy ${metrics.speciesName} specimen exhibiting natural growth balance.`,
    strengths: [
      `Organic branch distribution across ${metrics.maxBranchDepth} hierarchy levels`,
      `Good aspect ratio (${metrics.aspectRatio}) for stable ceramic potting`,
    ],
    criticisms: [
      metrics.avgShade > 0.4 ? "Canopy density causes moderate internal self-shading" : "Trunk taper could be reinforced",
    ],
    pruningRecommendations: [
      "Thin interior lateral shoots to open light pathways to primary branches",
    ],
  };
}

// CLI runner
if (import.meta.main) {
  (async () => {
    console.log("[Local AI Subagent] Initializing sample Bonsai specimen for evaluation...");
    const sp = japaneseBonsai;
    const prng = createPrng(108);
    const genome = generateGenomeForSpecies(sp, 108);
    let state = freshState(genome, sp, { seed: 108 });
    
    // Grow sample tree for 75 steps
    for (let i = 0; i < 75; i++) {
      state = growOnce(state, prng);
    }

    console.log(`[Local AI Subagent] Specimen grown: ${state.nodes.length} nodes. Querying Qwen 2.5 Coder 14B on Ollama...`);
    const result = await evaluateBonsaiWithQwen(state);

    console.log("\n======================================================");
    console.log("🌸 LOCAL AI BONSAI SENSEI EVALUATION");
    console.log(`Evaluator Model: ${result.model}`);
    console.log(`Style:           ${result.styleClassification}`);
    console.log(`Aesthetic Score: ${result.aestheticScore}/100`);
    console.log(`Summary:         ${result.summary}`);
    console.log("Strengths:");
    result.strengths.forEach((s) => console.log(`  + ${s}`));
    console.log("Criticisms:");
    result.criticisms.forEach((c) => console.log(`  - ${c}`));
    console.log("Pruning Recommendations:");
    result.pruningRecommendations.forEach((r) => console.log(`  ✂ ${r}`));
    console.log("======================================================\n");
  })();
}
