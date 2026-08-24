html = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Interactive Node Flora-Scaper</title>
    <style>
        body { background: #1a1a2e; color: #ecf0f1; font-family: sans-serif; display: flex; flex-direction: column; align-items: center; padding: 20px; margin: 0;}
        canvas { background: #16213e; border: 2px solid #0f3460; box-shadow: 0 4px 15px rgba(0,0,0,0.5); border-radius: 10px; cursor: pointer; }
        .info { max-width: 800px; text-align: center; line-height: 1.5; margin-bottom: 10px; }
        #gui-container { position: absolute; top: 10px; right: 10px; }
        button { padding:10px 20px; font-size: 16px; font-weight: bold; background:#e94560; color:white; border:none; border-radius:5px; cursor:pointer; transition: background 0.2s;}
        button:hover { background: #ff5c77; }
    </style>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/dat-gui/0.7.9/dat.gui.min.js"></script>
</head>
<body>
    <div id="gui-container"></div>
    <div class="info">
        <h2>Node-Based Interactive Plant Sculptor</h2>
        <p>No grid! Click on a glowing node (line segment ending) to grow it. The new segments, leaves, and flowers branch out at specific angles based on your botanical rules.</p>
    </div>
    <button onclick="initPlant()" style="margin-bottom: 15px;">Plant New Seed</button>
    <canvas id="plantCanvas" width="800" height="800"></canvas>
    
    <script>
        const canvas = document.getElementById('plantCanvas');
        const ctx = canvas.getContext('2d');

        const dna = {
            stemType: "herbaceous", // woody (brown), herbaceous (green)
            growthForm: "monopodial", // monopodial (straight main stem), sympodial (forking)
            phyllotaxis: "alternate", // alternate, opposite, whorled
            branchAngle: 35, // degrees
            segmentLength: 45,
            leafShape: "lanceolate", // lanceolate, cordate, round
            flowerType: "single", // single, umbel
            symmetry: "radial", // radial, zygomorphic
            clickAction: "grow_stem" // grow_stem, force_flower
        };

        const gui = new dat.GUI({ autoPlace: false });
        document.getElementById('gui-container').appendChild(gui.domElement);
        
        let f1 = gui.addFolder("Stem & Growth");
        f1.add(dna, 'stemType', ['woody', 'herbaceous']);
        f1.add(dna, 'growthForm', ['monopodial', 'sympodial']);
        f1.add(dna, 'branchAngle', 10, 90);
        f1.add(dna, 'segmentLength', 20, 80);
        f1.open();
        
        let f2 = gui.addFolder("Leaves");
        f2.add(dna, 'phyllotaxis', ['alternate', 'opposite', 'whorled']);
        f2.add(dna, 'leafShape', ['lanceolate', 'cordate', 'round']);
        f2.open();
        
        let f3 = gui.addFolder("Flowers");
        f3.add(dna, 'symmetry', ['radial', 'zygomorphic']);
        f3.open();
        
        gui.add(dna, 'clickAction', ['grow_stem', 'force_flower']).name("Click Action");

        class Node {
            constructor(x, y, angle, type, depth, side = 1) {
                this.x = x;
                this.y = y;
                this.angle = angle; // Radians
                this.type = type; // 'root', 'stem', 'leaf', 'flower', 'petal'
                this.depth = depth;
                this.side = side; // 1 or -1, used for alternate phyllotaxis
                this.children = [];
                this.isTerminal = true;
                
                // End point of the segment starting from this node (if it's a structural node)
                let len = type === 'stem' || type === 'root' ? dna.segmentLength * Math.pow(0.9, depth) : 0;
                this.endX = this.x + Math.cos(this.angle) * len;
                this.endY = this.y + Math.sin(this.angle) * len;
            }
            
            grow() {
                if (this.type === 'flower' || this.type === 'leaf' || this.type === 'petal') return; // Cannot grow from these
                this.isTerminal = false;
                
                let radAngle = dna.branchAngle * Math.PI / 180;
                
                if (dna.clickAction === "force_flower") {
                    let flower = new Node(this.endX, this.endY, this.angle, 'flower', this.depth + 1);
                    this.children.push(flower);
                    
                    // Generate petals based on symmetry
                    if (dna.symmetry === "radial") {
                        for(let i=0; i<5; i++) {
                            let pAngle = this.angle + (Math.PI * 2 / 5) * i;
                            flower.children.push(new Node(this.endX, this.endY, pAngle, 'petal', this.depth + 2));
                        }
                    } else if (dna.symmetry === "zygomorphic") {
                        // Bilateral symmetry relative to stem angle
                        flower.children.push(new Node(this.endX, this.endY, this.angle, 'petal_bottom', this.depth + 2));
                        flower.children.push(new Node(this.endX, this.endY, this.angle - Math.PI/3, 'petal_side', this.depth + 2));
                        flower.children.push(new Node(this.endX, this.endY, this.angle + Math.PI/3, 'petal_side', this.depth + 2));
                        flower.children.push(new Node(this.endX, this.endY, this.angle + Math.PI, 'petal_top', this.depth + 2));
                    }
                    return;
                }

                // Normal Growth
                // 1. Sprout Leaves based on Phyllotaxis at the CURRENT joint
                if (dna.phyllotaxis === "alternate") {
                    this.children.push(new Node(this.endX, this.endY, this.angle + radAngle * this.side, 'leaf', this.depth + 1));
                } else if (dna.phyllotaxis === "opposite") {
                    this.children.push(new Node(this.endX, this.endY, this.angle + radAngle, 'leaf', this.depth + 1));
                    this.children.push(new Node(this.endX, this.endY, this.angle - radAngle, 'leaf', this.depth + 1));
                } else if (dna.phyllotaxis === "whorled") {
                    this.children.push(new Node(this.endX, this.endY, this.angle + radAngle, 'leaf', this.depth + 1));
                    this.children.push(new Node(this.endX, this.endY, this.angle - radAngle, 'leaf', this.depth + 1));
                    this.children.push(new Node(this.endX, this.endY, this.angle + Math.PI/2, 'leaf', this.depth + 1));
                    this.children.push(new Node(this.endX, this.endY, this.angle - Math.PI/2, 'leaf', this.depth + 1));
                }

                // 2. Sprout Stems based on Growth Form
                let nextSide = this.side * -1; // toggle side for alternate
                
                if (dna.growthForm === "monopodial") {
                    // Straight continuation
                    this.children.push(new Node(this.endX, this.endY, this.angle + (Math.random()*0.1 - 0.05), 'stem', this.depth + 1, nextSide));
                    // Maybe a small side branch occasionally
                    if (Math.random() > 0.5) {
                        this.children.push(new Node(this.endX, this.endY, this.angle - radAngle * this.side, 'stem', this.depth + 1, nextSide));
                    }
                } else if (dna.growthForm === "sympodial") {
                    // Fork into two
                    this.children.push(new Node(this.endX, this.endY, this.angle + radAngle, 'stem', this.depth + 1, nextSide));
                    this.children.push(new Node(this.endX, this.endY, this.angle - radAngle, 'stem', this.depth + 1, nextSide));
                }
            }
        }

        let rootNode = null;
        let allNodes = [];

        function initPlant() {
            rootNode = new Node(canvas.width / 2, canvas.height - 50, -Math.PI / 2, 'root', 0);
            collectNodes();
            draw();
        }

        function collectNodes() {
            allNodes = [];
            function traverse(node) {
                allNodes.push(node);
                node.children.forEach(c => traverse(c));
            }
            if (rootNode) traverse(rootNode);
        }

        canvas.addEventListener('click', (e) => {
            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left, mouseY = e.clientY - rect.top;
            
            // Find closest active (terminal) stem/root node end point
            let closestNode = null;
            let minDist = 30; // click radius
            
            for(let node of allNodes) {
                if (node.isTerminal && (node.type === 'stem' || node.type === 'root')) {
                    let dist = Math.sqrt((node.endX - mouseX)**2 + (node.endY - mouseY)**2);
                    if (dist < minDist) {
                        minDist = dist;
                        closestNode = node;
                    }
                }
            }
            
            if (closestNode) {
                closestNode.grow();
                collectNodes();
                draw();
            }
        });

        function drawLeaf(x, y, angle, size) {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(angle + Math.PI/2); // point outward
            ctx.fillStyle = "#2ecc71";
            ctx.beginPath();
            
            if (dna.leafShape === "lanceolate") {
                ctx.moveTo(0, 0);
                ctx.quadraticCurveTo(size/4, -size/2, 0, -size);
                ctx.quadraticCurveTo(-size/4, -size/2, 0, 0);
            } else if (dna.leafShape === "cordate") {
                ctx.moveTo(0, -size/4);
                ctx.bezierCurveTo(size/2, size/4, size, -size/2, 0, -size);
                ctx.bezierCurveTo(-size, -size/2, -size/2, size/4, 0, -size/4);
            } else if (dna.leafShape === "round") {
                ctx.ellipse(0, -size/2, size/2, size/2, 0, 0, Math.PI*2);
            }
            ctx.fill();
            ctx.restore();
        }

        function drawPetal(x, y, angle, type, size) {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(angle + Math.PI/2); 
            ctx.fillStyle = "#e94560";
            if (type === 'petal_bottom') ctx.fillStyle = "#ff5c77"; // highlight lip
            
            ctx.beginPath();
            if (type === 'petal_bottom') {
                ctx.ellipse(0, -size/2, size*0.8, size/2, 0, 0, Math.PI*2);
            } else if (type === 'petal_side') {
                ctx.ellipse(0, -size/2, size*0.4, size*0.6, 0, 0, Math.PI*2);
            } else if (type === 'petal_top') {
                ctx.ellipse(0, -size/2, size*0.5, size*0.7, 0, 0, Math.PI*2);
            } else {
                // Radial petal
                ctx.ellipse(0, -size/2, size/3, size/1.5, 0, 0, Math.PI*2);
            }
            ctx.fill();
            ctx.restore();
        }

        function draw() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Draw all segments
            for(let node of allNodes) {
                if (node.type === 'stem' || node.type === 'root') {
                    ctx.beginPath();
                    ctx.moveTo(node.x, node.y);
                    ctx.lineTo(node.endX, node.endY);
                    ctx.strokeStyle = dna.stemType === "woody" ? "#8b4513" : "#27ae60";
                    ctx.lineWidth = Math.max(1, 8 - node.depth);
                    ctx.lineCap = "round";
                    ctx.stroke();
                } else if (node.type === 'leaf') {
                    drawLeaf(node.x, node.y, node.angle, 20 * Math.pow(0.9, node.depth));
                } else if (node.type.startsWith('petal')) {
                    drawPetal(node.x, node.y, node.angle, node.type, 20 * Math.pow(0.9, node.depth-2));
                } else if (node.type === 'flower') {
                    // Draw center
                    ctx.fillStyle = "#f1c40f";
                    ctx.beginPath();
                    ctx.arc(node.x, node.y, 4, 0, Math.PI*2);
                    ctx.fill();
                }
            }
            
            // Highlight active nodes
            for(let node of allNodes) {
                if (node.isTerminal && (node.type === 'stem' || node.type === 'root')) {
                    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
                    ctx.beginPath();
                    ctx.arc(node.endX, node.endY, 6, 0, Math.PI*2);
                    ctx.fill();
                    
                    ctx.strokeStyle = "#fff";
                    ctx.lineWidth = 1;
                    ctx.stroke();
                }
            }
        }
        
        initPlant();
    </script>
</body>
</html>
"""

with open('/home/martin/theoretical_plant_generator/node_plant.html', 'w') as f:
    f.write(html)
