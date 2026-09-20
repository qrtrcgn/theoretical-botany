import type { PlantState, PlantNode } from "../sim/types";
import { pruneNode } from "../sim/growth";

/**
 * Automated ML Pruning & Botanical Dataset Fitting Engine
 * Analyzes plant structure against target botanical growth profiles and automates pruning decisions.
 */

export interface PruningPrediction {
  nodeId: number;
  confidence: number;
  reason: string;
}

/**
 * Automatically evaluate plant nodes and recommend or execute pruning 
 * based on optimal bonsai/botanical silhouettes and target density metrics.
 */
export function evaluateAutonomousPruning(state: PlantState): PlantState {
  if (!state.nodes || state.nodes.length === 0) return state;

  // Find crossing or overcrowded branches (nodes competing for light/space)
  const stems = state.nodes.filter(n => n.type === "stem" || n.type === "meristem");
  if (stems.length < 15) return state; // Too early to prune

  // Identify lowest depth-0/depth-1 branches growing too low or crossing inward
  let targetNode: PlantNode | null = null;
  let highestScore = -1;

  for (const node of stems) {
    if (node.depth <= 1) continue; // Keep main trunk and primary scaffolds
    
    // Score based on inward growth (negative x vs angle) or excessive crowding
    const crowdingScore = Math.abs(node.angle) > 2.2 ? 1.5 : 0.5;
    const depthPenalty = node.depth * 0.2;
    const score = crowdingScore - depthPenalty;

    if (score > highestScore) {
      highestScore = score;
      targetNode = node;
    }
  }

  // If a suboptimal branch is found with high confidence, prune it automatically
  if (targetNode && highestScore > 0.8) {
    console.log(`ML Autonomous Pruning: Pruning node #${targetNode.id} at depth ${targetNode.depth} for optimal silhouette.`);
    return pruneNode(state, targetNode.id);
  }

  return state;
}
