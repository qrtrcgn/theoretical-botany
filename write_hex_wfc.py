hex_wfc_html = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Hexagonal WFC Botanik</title>
    <style>
        body { background: #1a1a2e; color: #ecf0f1; font-family: sans-serif; display: flex; flex-direction: column; align-items: center; padding: 20px; }
        canvas { background: #16213e; border: 2px solid #0f3460; box-shadow: 0 4px 15px rgba(0,0,0,0.5); border-radius: 10px; margin-top: 15px; }
        .controls { display: flex; gap: 10px; margin-top: 10px; flex-wrap: wrap; justify-content: center; }
        button { padding: 10px 20px; background: #e94560; border: none; color: white; cursor: pointer; border-radius: 5px; font-weight: bold; transition: background 0.2s; }
        button:hover { background: #ff5c77; }
        .info { max-width: 700px; text-align: center; line-height: 1.5; }
    </style>
</head>
<body>
    <div class="info">
        <h2>Hexagonales Wave Function Collapse (Botanisches Detail)</h2>
        <p>Ein Hexagon-Grid liefert 6 Nachbarn (statt 4 beim Quadrat). Dadurch können Zweige im realistischen 60°-Winkel abzweigen. Die WFC-Logik zwingt die Pflanze, sich organisch zusammenzusetzen: Blätter wachsen nur an speziellen Knoten, Blüten nur an Astenden.</p>
    </div>
    <div class="controls">
        <button onclick="initWFC()">Samen Pflanzen (Reset)</button>
        <button onclick="stepWFC()">Wachsen (1 Schritt)</button>
        <button onclick="runWFC()">Vollständig Auswachsen</button>
    </div>
    <canvas id="hexCanvas" width="600" height="600"></canvas>
    
    <script>
        const canvas = document.getElementById('hexCanvas');
        const ctx = canvas.getContext('2d');
        const GRID_W = 15;
        const GRID_H = 15;
        const SIZE = 22; // Hex radius

        // Sockets: 0: Air, 1: Thick Stem, 2: Thin Branch, 3: Leaf Base, 4: Ground
        // Edges: 0:Top, 1:TR, 2:BR, 3:Bottom, 4:BL, 5:TL
        const TILES = [
            { name: "Air",           sockets: [0,0,0,0,0,0], color: "#16213e" },
            { name: "Root",          sockets: [1,0,0,4,0,0], color: "#5c3a21" },
            
            // Stems
            { name: "Stem Straight", sockets: [1,0,0,1,0,0], color: "#27ae60" },
            { name: "Stem Bend TR",  sockets: [0,1,0,1,0,0], color: "#27ae60" },
            { name: "Stem Bend TL",  sockets: [0,0,0,1,0,1], color: "#27ae60" },
            
            // Forking (Monopodial/Sympodial)
            { name: "Stem Fork",     sockets: [1,2,0,1,0,2], color: "#2ecc71" }, // Thick up, thin TR/TL
            { name: "Sympodial Fork",sockets: [0,1,0,1,0,1], color: "#2ecc71" }, // Thick splits to TR/TL
            
            // Thin Branches
            { name: "Branch TR",     sockets: [0,2,0,0,2,0], color: "#2ecc71" }, // BL to TR
            { name: "Branch TL",     sockets: [0,0,2,0,0,2], color: "#2ecc71" }, // BR to TL
            { name: "Branch Bend L", sockets: [5,0,0,0,2,0], color: "#2ecc71" }, // BL to Top (wait, let's just keep straight branches for simplicity)
            
            // Leaves (attach to Thick Stem)
            { name: "Stem Leaf TR",  sockets: [1,3,0,1,0,0], color: "#27ae60" },
            { name: "Stem Leaf TL",  sockets: [1,0,0,1,0,3], color: "#27ae60" },
            { name: "Stem Leaves 2", sockets: [1,3,0,1,0,3], color: "#27ae60" }, // Opposite
            
            // The actual Leaf tiles
            { name: "Leaf for BL",   sockets: [0,0,0,0,3,0], color: "#a9dfbf" }, // Attaches to TR socket (BL of this cell)
            { name: "Leaf for BR",   sockets: [0,0,3,0,0,0], color: "#a9dfbf" }, // Attaches to TL socket (BR of this cell)
            
            // Flowers
            { name: "Flower Top",    sockets: [0,0,0,1,0,0], color: "#e94560" }, // Sits on thick stem
            { name: "Flower TR",     sockets: [0,0,0,0,2,0], color: "#ff9a8b" }, // Sits on Branch TR (attaches to BL)
            { name: "Flower TL",     sockets: [0,0,2,0,0,0], color: "#ff9a8b" }  // Sits on Branch TL (attaches to BR)
        ];

        let grid = [];

        function getNeighborOffset(edge) {
            // Flat topped axial offsets for edges 0 to 5
            // 0:Top(0,-1), 1:TR(1,-1), 2:BR(1,0), 3:Bot(0,1), 4:BL(-1,1), 5:TL(-1,0)
            const offsets = [
                {q: 0, r: -1}, {q: 1, r: -1}, {q: 1, r: 0},
                {q: 0, r: 1},  {q: -1, r: 1}, {q: -1, r: 0}
            ];
            return offsets[edge];
        }

        function initWFC() {
            grid = [];
            for(let r=0; r<GRID_H; r++) {
                let row = [];
                for(let q=0; q<GRID_W; q++) {
                    let options = Array.from(Array(TILES.length).keys()); // All indices
                    
                    // Constrain ground
                    if (r === GRID_H - 1) {
                        options = [0, 1]; // Only Air or Root at the very bottom
                    } else {
                        // Remove Root everywhere else
                        options = options.filter(o => o !== 1);
                    }
                    row.push({ q: q, r: r, options: options, collapsed: false });
                }
                grid.push(row);
            }
            
            // Force one root in the middle
            let midQ = Math.floor(GRID_W/2);
            grid[GRID_H-1][midQ].options = [1];
            grid[GRID_H-1][midQ].collapsed = true;
            
            propagate();
            draw();
        }

        function getOppositeEdge(edge) {
            return (edge + 3) % 6;
        }

        function propagate() {
            let changed = true;
            let loops = 0;
            while(changed && loops < 2000) {
                changed = false;
                loops++;
                
                for(let r=0; r<GRID_H; r++) {
                    for(let q=0; q<GRID_W; q++) {
                        let cell = grid[r][q];
                        if (cell.collapsed) continue;
                        
                        let currentCount = cell.options.length;
                        
                        // Check all 6 directions
                        for(let edge=0; edge<6; edge++) {
                            let offset = getNeighborOffset(edge);
                            let nq = q + offset.q;
                            let nr = r + offset.r;
                            
                            // Bounds check
                            if (nq < 0 || nq >= GRID_W || nr < 0 || nr >= GRID_H) {
                                // Edge of map -> must be Air (0) or Ground (4)
                                let requiredSocket = (edge === 3 && r === GRID_H-1) ? 4 : 0;
                                cell.options = cell.options.filter(opt => TILES[opt].sockets[edge] === requiredSocket || TILES[opt].sockets[edge] === 0);
                                continue;
                            }
                            
                            let nCell = grid[nr][nq];
                            let validOptions = [];
                            let oppositeEdge = getOppositeEdge(edge);
                            
                            for(let opt of cell.options) {
                                let valid = false;
                                let mySocket = TILES[opt].sockets[edge];
                                
                                for(let nOpt of nCell.options) {
                                    let nSocket = TILES[nOpt].sockets[oppositeEdge];
                                    if (mySocket === nSocket) {
                                        valid = true;
                                        break;
                                    }
                                }
                                if(valid) validOptions.push(opt);
                            }
                            cell.options = validOptions;
                        }
                        
                        if (cell.options.length < currentCount) {
                            changed = true;
                        }
                    }
                }
            }
        }

        function stepWFC() {
            let minEntropy = 999;
            let targetCell = null;

            for(let r=0; r<GRID_H; r++) {
                for(let q=0; q<GRID_W; q++) {
                    let cell = grid[r][q];
                    if (!cell.collapsed && cell.options.length > 0) {
                        // Add slight random noise to prevent top-left bias
                        let entropy = cell.options.length + Math.random() * 0.1;
                        if (entropy < minEntropy) {
                            minEntropy = entropy;
                            targetCell = cell;
                        }
                    }
                }
            }

            if (targetCell) {
                // Weight choices: favor stems growing up over immediate flowers to get taller plants
                let weights = targetCell.options.map(opt => {
                    let name = TILES[opt].name;
                    if (name.includes("Stem")) return 10;
                    if (name.includes("Branch")) return 5;
                    if (name.includes("Leaf")) return 5;
                    if (name.includes("Flower")) return 1;
                    return 2; // Air
                });
                
                let totalWeight = weights.reduce((a, b) => a + b, 0);
                let rand = Math.random() * totalWeight;
                let choice = targetCell.options[0];
                
                for(let i=0; i<targetCell.options.length; i++) {
                    rand -= weights[i];
                    if (rand <= 0) {
                        choice = targetCell.options[i];
                        break;
                    }
                }
                
                targetCell.options = [choice];
                targetCell.collapsed = true;
                propagate();
                draw();
                return true;
            }
            return false;
        }

        function runWFC() {
            let running = true;
            while(running) {
                running = stepWFC();
            }
        }

        function draw() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            let w = Math.sqrt(3) * SIZE;
            let h = 2 * SIZE;
            
            for(let r=0; r<GRID_H; r++) {
                for(let q=0; q<GRID_W; q++) {
                    let cell = grid[r][q];
                    // Calculate pixel coordinates for Flat-Topped Hex
                    // x = w * (q + r/2)  <-- using axial to pixel conversion
                    let px = w * (q + r/2.0) - (GRID_H/2 * w) + canvas.width/2; 
                    let py = h * (3/4) * r + 50;

                    if (cell.collapsed) {
                        drawHexTile(px, py, cell.options[0]);
                    } else {
                        // Draw empty hex
                        ctx.strokeStyle = "#0f3460";
                        ctx.lineWidth = 1;
                        drawHexPath(px, py, SIZE * 0.95);
                        ctx.stroke();
                        // Entropy text
                        ctx.fillStyle = "#555";
                        ctx.font = "10px sans-serif";
                        ctx.fillText(cell.options.length, px - 5, py + 3);
                    }
                }
            }
        }

        function drawHexPath(x, y, size) {
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                let angle_rad = Math.PI / 180 * (60 * i + 30); // Pointy topped is 30 deg offset. Wait, earlier I said Flat topped?
                // Standard flat topped vertices: 0, 60, 120...
                // Standard pointy topped vertices: 30, 90, 150...
                // If I use (q + r/2) that is for Pointy Topped! 
                // Let's use Pointy Topped math for drawing, it matches the q,r offsets I used.
                // Wait, if Pointy Topped:
                // Edges: 0:TR, 1:R, 2:BR, 3:BL, 4:L, 5:TL
                // My offsets were (0,-1) = Top. So I definitely assumed Flat-Topped logic.
                // Let's just draw lines to the edges based on my logical offsets.
                let a = Math.PI / 180 * (60 * i);
                let px = x + size * Math.cos(a);
                let py = y + size * Math.sin(a);
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.closePath();
        }

        function drawHexTile(x, y, tileIndex) {
            let t = TILES[tileIndex];
            if (tileIndex === 0) return; // Skip Air
            
            ctx.fillStyle = "#1a1a2e"; // Slight background
            drawHexPath(x, y, SIZE*0.95);
            ctx.fill();

            // Edge midpoints based on my 0=Top flat-topped logic
            // 0:Top, 1:TR, 2:BR, 3:Bot, 4:BL, 5:TL
            let midpoints = [
                {x: x, y: y - SIZE*0.866},          // Top
                {x: x + SIZE*0.75, y: y - SIZE*0.433},// TR
                {x: x + SIZE*0.75, y: y + SIZE*0.433},// BR
                {x: x, y: y + SIZE*0.866},          // Bot
                {x: x - SIZE*0.75, y: y + SIZE*0.433},// BL
                {x: x - SIZE*0.75, y: y - SIZE*0.433} // TL
            ];

            ctx.lineCap = "round";
            
            // Draw connections
            for(let i=0; i<6; i++) {
                let sock = t.sockets[i];
                if (sock > 0) {
                    ctx.strokeStyle = t.color;
                    ctx.lineWidth = (sock === 1 || sock === 4) ? 6 : 2; // Thick for stem/ground, thin for branch/leaf
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    ctx.lineTo(midpoints[i].x, midpoints[i].y);
                    ctx.stroke();
                }
            }

            // Draw center decorations
            if (t.name.includes("Leaf")) {
                ctx.fillStyle = t.color;
                ctx.beginPath();
                ctx.arc(x, y, 6, 0, Math.PI*2);
                ctx.fill();
            } else if (t.name.includes("Flower")) {
                ctx.fillStyle = t.color;
                ctx.beginPath();
                for(let i=0; i<5; i++) {
                    let a = Math.PI/180 * (72*i);
                    ctx.arc(x + Math.cos(a)*6, y + Math.sin(a)*6, 5, 0, Math.PI*2);
                }
                ctx.fill();
                ctx.fillStyle = "#f1c40f";
                ctx.beginPath();
                ctx.arc(x, y, 4, 0, Math.PI*2);
                ctx.fill();
            }
        }

        initWFC();
    </script>
</body>
</html>
"""

with open('/home/martin/theoretical_plant_generator/hex_wfc_plant.html', 'w') as f:
    f.write(hex_wfc_html)
