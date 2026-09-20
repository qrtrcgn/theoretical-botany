import { readFileSync } from "fs";

export function parsePlaFile(filePath: string) {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  const speciesList: any[] = [];
  let currentSpecies: any = null;

  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith(";")) continue; // Skip comments and empty lines

    // Detect start of a new plant
    const startMatch = line.match(/^\[(.*?)\] start PlantStudio plant/);
    if (startMatch) {
      if (currentSpecies) speciesList.push(currentSpecies);
      
      const rawName = startMatch[1];
      currentSpecies = {
        id: rawName.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        name: rawName.charAt(0).toUpperCase() + rawName.slice(1),
        genus: rawName, // Rough guess
        version: "1.0.0",
        traitRanges: {
          vigor: [0.5, 1.0], 
          angle: [20, 45],
          decay: [0.05, 0.15],
          lenScale: [20, 50],
        },
        hiddenTraits: {
          budActivationThreshold: 0.5,
          shadeTolerance: 0.5,
          apicalDominance: 1.0,
          internodeElasticity: 1.0,
          dormancyStrength: 0.5,
        },
        leafResourceYield: 1.0,
        seasonalRange: [0, 200],
        palette: {
          typicalRGB: [34, 139, 34],
          typicalShape: 0,
          typicalMaterial: 0,
        },
        rawPlaData: {} as Record<string, string>
      };
      continue;
    }

    if (currentSpecies) {
      // Look for parameter lines: "Some description [kParamName] =value"
      const paramMatch = line.match(/^(.*?)\[(.*?)\]\s*=\s*(.*)$/);
      if (paramMatch) {
        const key = paramMatch[2];
        const val = paramMatch[3];
        currentSpecies.rawPlaData[key] = val;

        // Map some basic properties to ZenPlant genome bounds
        if (key === "kGeneralRandomSway") {
            const sway = parseFloat(val);
            currentSpecies.traitRanges.angle = [sway * 5, sway * 15]; // Example heuristic translation
        }
        if (key === "kGeneralAgeAtMaturity") {
            const age = parseInt(val);
            currentSpecies.seasonalRange = [0, age * 2]; 
        }
        if (key === "kInternodeLengthA") {
            const len = parseFloat(val);
            currentSpecies.traitRanges.lenScale = [len * 5, len * 10]; 
        }
      }
    }
  }

  if (currentSpecies) speciesList.push(currentSpecies);
  return speciesList;
}

if (import.meta.main) {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: bun run src/data/import_pla.ts <path-to-.pla-file>");
    process.exit(1);
  }
  const species = parsePlaFile(file);
  console.log(`Parsed ${species.length} species from ${file}:\n`);
  
  // Output as a TypeScript module format so it can be pasted directly into species.ts
  species.forEach(sp => {
    // Delete raw data to keep output clean, but it's there if needed
    delete sp.rawPlaData;
    
    console.log(`export const ${sp.id.replace(/-([a-z])/g, (g: string) => g[1].toUpperCase())} = ${JSON.stringify(sp, null, 2)};\n`);
  });
}
