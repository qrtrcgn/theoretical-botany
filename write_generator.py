js_code = """
let system = {
    axiom: "X",
    rules: {},
    sentence: "",
    length: 100,
    thickness: 10
};

// Parameters bound to GUI
const params = {
    iterations: 4,
    growthType: "Monopodial", // Monopodial, Sympodial
    phyllotaxis: "Alternate", // Alternate, Opposite, Whorled
    branchAngle: 25,
    lengthMultiplier: 0.65,
    leafShape: "Lanceolate", // Lanceolate, Cordate, Round
    inflorescence: "Raceme", // None, Raceme, Umbel, Single
    leafColor: "#2ecc71",
    stemColor: "#8e44ad",
    flowerColor: "#f1c40f",
    generate: function() { generatePlant(); }
};

function setup() {
    createCanvas(windowWidth, windowHeight);
    angleMode(DEGREES);
    
    // Setup GUI
    let gui = new dat.GUI();
    let folderGrow = gui.addFolder('Wachstum & Botanik');
    folderGrow.add(params, 'iterations', 1, 7).step(1).onFinishChange(generatePlant);
    folderGrow.add(params, 'growthType', ["Monopodial", "Sympodial"]).onChange(generatePlant);
    folderGrow.add(params, 'phyllotaxis', ["Alternate", "Opposite", "Whorled"]).onChange(generatePlant);
    folderGrow.add(params, 'inflorescence', ["None", "Single", "Raceme", "Umbel"]).onChange(generatePlant);
    folderGrow.open();
    
    let folderForm = gui.addFolder('Morphologie & Form');
    folderForm.add(params, 'branchAngle', 5, 90).onChange(generatePlant);
    folderForm.add(params, 'lengthMultiplier', 0.4, 0.9).onChange(generatePlant);
    folderForm.add(params, 'leafShape', ["Lanceolate", "Cordate", "Round"]).onChange(generatePlant);
    folderForm.open();
    
    let folderColor = gui.addFolder('Farben');
    folderColor.addColor(params, 'stemColor').onChange(generatePlant);
    folderColor.addColor(params, 'leafColor').onChange(generatePlant);
    folderColor.addColor(params, 'flowerColor').onChange(generatePlant);
    folderColor.open();
    
    gui.add(params, 'generate').name("Pflanze neu generieren");
    
    generatePlant();
}

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
    generatePlant();
}

// Set up the L-System rules based on botanical parameters
function buildRules() {
    system.rules = {};
    
    let sideBranch = "";
    // Phyllotaxis (Blattstellung) determines how branches/leaves are arranged
    if (params.phyllotaxis === "Alternate") {
        // X alternates to Y, Y alternates to X (links/rechts)
        system.rules["X"] = `F[+L][-Y]FX`;
        system.rules["Y"] = `F[-L][+X]FY`;
    } else if (params.phyllotaxis === "Opposite") {
        // Paarig
        system.rules["X"] = `F[+Y][-Y]FX`;
        system.rules["Y"] = `F[+L][-L]X`;
    } else if (params.phyllotaxis === "Whorled") {
        // Quirlständig
        system.rules["X"] = `F[+Y][-Y][++Y][--Y]FX`;
        system.rules["Y"] = `F[+L][-L]X`;
    }

    // Adjust for Growth Type (Wachstumsart)
    if (params.growthType === "Sympodial") {
        // Sympodial: Main axis stops, branches take over
        if (params.phyllotaxis === "Alternate") {
            system.rules["X"] = `F[+Y][-X]`;
            system.rules["Y"] = `F[-X][+Y]`;
        } else {
            system.rules["X"] = `F[+X][-X]`;
            system.rules["Y"] = `F[+X][-X]`;
        }
    }
    
    // Inflorescences (Blütenstände) - added at the end (leaves or flowers)
    // We handle this by replacing terminal nodes in the final string or adjusting F.
    // Actually, L-System evaluation handles terminal symbols during drawing.
    // L = Leaf, B = Blossom (Flower)
}

function evaluateLSystem() {
    system.sentence = system.axiom;
    for (let i = 0; i < params.iterations; i++) {
        let nextSentence = "";
        for (let j = 0; j < system.sentence.length; j++) {
            let current = system.sentence.charAt(j);
            let replace = system.rules[current];
            if (replace) {
                nextSentence += replace;
            } else {
                nextSentence += current;
            }
        }
        system.sentence = nextSentence;
    }
    
    // Process inflorescence by modifying the final sentence
    // Find terminal leaves (L) or ends (X/Y) and replace them based on inflorescence
    let finalSentence = "";
    for (let j = 0; j < system.sentence.length; j++) {
        let char = system.sentence.charAt(j);
        if (char === 'X' || char === 'Y') {
            if (params.inflorescence === "Single") finalSentence += "B";
            else if (params.inflorescence === "Raceme") finalSentence += "FB";
            else if (params.inflorescence === "Umbel") finalSentence += "[+B][-B][++B][--B]B";
            else finalSentence += "L";
        } else if (char === 'L') {
            if (params.inflorescence === "Raceme" && Math.random() > 0.5) {
                finalSentence += "B"; // Some leaves become flowers along the stem
            } else {
                finalSentence += "L";
            }
        }
        else {
            finalSentence += char;
        }
    }
    system.sentence = finalSentence;
}

function generatePlant() {
    buildRules();
    evaluateLSystem();
    drawPlant();
}

function drawPlant() {
    background(20, 30, 40);
    resetMatrix();
    translate(width / 2, height);
    
    // Calculate scaling so it fits the screen
    let currentLength = height / Math.pow(2, params.iterations + 1);
    // Dynamic starting length based on iterations to fit screen
    if (params.growthType === "Monopodial") {
        currentLength = (height * 0.25) / params.iterations;
    } else {
        currentLength = (height * 0.4) / params.iterations;
    }
    currentLength = max(currentLength, 5); // min length
    
    let currentThickness = map(params.iterations, 1, 7, 10, 2);
    
    stroke(params.stemColor);
    
    for (let i = 0; i < system.sentence.length; i++) {
        let current = system.sentence.charAt(i);
        
        if (current === 'F') {
            strokeWeight(currentThickness);
            stroke(params.stemColor);
            line(0, 0, 0, -currentLength);
            translate(0, -currentLength);
        } else if (current === '+') {
            rotate(params.branchAngle + random(-5, 5));
        } else if (current === '-') {
            rotate(-params.branchAngle + random(-5, 5));
        } else if (current === '[') {
            push();
            currentLength *= params.lengthMultiplier;
            currentThickness *= 0.7;
        } else if (current === ']') {
            pop();
            currentLength /= params.lengthMultiplier;
            currentThickness /= 0.7;
        } else if (current === 'L') {
            drawLeaf(currentLength);
        } else if (current === 'B') {
            drawFlower(currentLength);
        }
    }
}

function drawLeaf(len) {
    push();
    fill(params.leafColor);
    noStroke();
    let size = len * 1.5;
    
    if (params.leafShape === "Lanceolate") {
        // Spitz / Lanzettlich
        beginShape();
        vertex(0, 0);
        bezierVertex(-size/2, -size/3, -size/2, -size*2/3, 0, -size);
        bezierVertex(size/2, -size*2/3, size/2, -size/3, 0, 0);
        endShape(CLOSE);
    } else if (params.leafShape === "Cordate") {
        // Herzförmig
        beginShape();
        vertex(0, -size/4);
        bezierVertex(-size, -size, -size, size/2, 0, size);
        bezierVertex(size, size/2, size, -size, 0, -size/4);
        endShape(CLOSE);
    } else if (params.leafShape === "Round") {
        // Rund
        ellipse(0, -size/2, size, size);
    }
    pop();
}

function drawFlower(len) {
    push();
    fill(params.flowerColor);
    noStroke();
    let size = len * 1.2;
    
    // Simple 5-petal flower (Actinomorphic / Radiärsymmetrisch)
    for (let i = 0; i < 5; i++) {
        ellipse(0, -size/2, size/2, size);
        rotate(72);
    }
    fill(255, 200, 0);
    ellipse(0, 0, size/2, size/2); // Center
    pop();
}
"""

with open('plant_generator.js', 'w') as f:
    f.write(js_code)
