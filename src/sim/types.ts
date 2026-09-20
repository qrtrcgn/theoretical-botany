export type BudState = "dormant" | "active" | "flowering" | "senescent";

export type NodeType = "stem" | "meristem" | "leaf" | "bud" | "flower" | "root";

export type LeafShape = "simple" | "compound" | "serrated" | "lobed" | "needle" | "heart" | "oval";
export type InflorescenceType = "solitary" | "raceme" | "umbel" | "spike" | "cyme" | "capitulum";
export type FlowerSymmetry = "radial" | "bilateral";
export type FlowerShape = "circle" | "daisy" | "spiral" | "thorns" | "trumpet" | "ring";
export type FlowerMaterial = "matte" | "neon" | "metallic";

export interface PlantNode {
  id: number;
  parentId: number | null;
  type: NodeType;
  x: number;
  y: number;
  angle: number;
  length: number;
  targetLength: number;
  v: number;
  age: number;
  terminal: boolean;
  budState: BudState;
  depth: number;
  isCut: boolean;
  resourceProduction: number;
  shade: number;
  curve: number;
  leafSizeJitter: number;
  leafShapeJitter: number;
  leafHueShift: number;
  hasThorns: boolean;
  fruitAge: number;
  attachT?: number;
  pedicelLength?: number;
  fallState?: "attached" | "falling";
  fallSeed?: number;
  fallVY?: number;
  fallRotSpeed?: number;
  fallSwayPhase?: number;
  fallAge?: number;
  leafShape?: number;
  sizeMul?: number;
}

export interface Genome {
  vigor: [number, number];
  angle: [number, number];
  decay: [number, number];
  lenScale: [number, number];
  flowerRGB: [[number, number, number], [number, number, number]];
  flowerRadius: [number, number];
  flowerShape: [number, number];
  flowerStretch: [[number, number], [number, number]];
  flowerMaterial: [number, number];
  budActivationThreshold: [number, number];
  shadeTolerance: [number, number];
  apicalDominance: [number, number];
  internodeElasticity: [number, number];
  dormancyStrength: [number, number];
  leafShape: [number, number];
  leafSize: [number, number];
  leafDensity: [number, number];
  inflorescence: [number, number];
  petalCount: [number, number];
  sepalCount: [number, number];
  stamenCount: [number, number];
  symmetry: [number, number];
  curl: [number, number];
  windSensitivity: [number, number];
  barkRoughness: [number, number];
  thornDensity: [number, number];
  vineMode: [number, number];
  stiffness: [number, number];
}

export interface SpeciesDef {
  id: string;
  name: string;
  genus: string;
  version: string;
  traitRanges: {
    vigor: [number, number];
    angle: [number, number];
    decay: [number, number];
    lenScale: [number, number];
  };
  hiddenTraits: {
    budActivationThreshold: number;
    shadeTolerance: number;
    apicalDominance: number;
    internodeElasticity: number;
    dormancyStrength: number;
  };
  leafResourceYield: number;
  seasonalRange: [number, number];
  palette: {
    typicalRGB: [number, number, number];
    typicalShape: number;
    typicalMaterial: number;
  };
}

export interface ResourcePool {
  energy: number;
  water: number;
  structural: number;
}

export interface Environment {
  lightDirection: [number, number];
  gravity: number;
  seasonIndex: number;
  temperature: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  type: "pollen" | "leaf" | "dew" | "water";
  rotation: number;
  rotSpeed: number;
}

export interface SavedPlant {
  genome: Genome;
  timestamp: number;
  speciesLabel: string;
}

export interface PlantState {
  idCounter: number;
  step: number;
  cycleLength: number;
  root: PlantNode;
  nodes: PlantNode[];
  genome: Genome;
  speciesId: string;
  resources: ResourcePool;
  environment: Environment;
  greenhouse: SavedPlant[];
  selectedSlots: number[];
  windTime: number;
  darkMode: boolean;
  showRoots: boolean;
  woodTexture: boolean;
  particles: Particle[];
  cutAnimTime: number;
  cameraX: number;
  cameraY: number;
  cameraZoom: number;
  growSpeed: number;
  timelapseFrames: string[];
  isRecording: boolean;
}
