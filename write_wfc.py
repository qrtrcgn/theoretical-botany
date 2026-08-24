wfc_html = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>WFC Plant Generator</title>
    <style>
        body { background: #2c3e50; color: white; font-family: sans-serif; display: flex; flex-direction: column; align-items: center; padding: 20px; }
        canvas { background: #34495e; border: 2px solid #ecf0f1; margin-top: 20px; box-shadow: 0 4px 8px rgba(0,0,0,0.3); }
        .controls { display: flex; gap: 10px; margin-top: 10px; }
        button { padding: 10px 15px; background: #27ae60; border: none; color: white; cursor: pointer; border-radius: 4px; font-weight: bold; }
        button:hover { background: #2ecc71; }
        .info { max-width: 600px; text-align: center; line-height: 1.5; }
    </style>
</head>
<body>
    <div class="info">
        <h2>Wave Function Collapse (WFC) - Botanik</h2>
        <p>Dieses Grid nutzt WFC: Jeder Block hat "Sockets" (Verbindungen). Wird ein Block gesetzt, schränkt er die Wahrscheinlichkeit der benachbarten Blöcke ein (z.B. eine Blüte kann nur nach oben in die Luft zeigen und braucht unten einen Stamm).</p>
    </div>
    <div class="controls">
        <button onclick="initWFC()">Neu Starten</button>
        <button onclick="stepWFC()">Schritt (Collapse)</button>
        <button onclick="runWFC()">Automatisch Ausfüllen</button>
    </div>
    <canvas id="wfcCanvas" width="400" height="400"></canvas>
    
    <script>
        const canvas = document.getElementById('wfcCanvas');
        const ctx = canvas.getContext('2d');
        const GRID_SIZE = 10;
        const CELL_SIZE = 40;

        // TILE DEFINITIONS
        // Sockets: [Top, Right, Bottom, Left]
        // 0 = Air, 1 = Stem, 2 = Leaf Attachment
        const TILES = [
            { name: "Air",       sockets: [0, 0, 0, 0], color: "#34495e" },
            { name: "Stem",      sockets: [1, 0, 1, 0], color: "#2ecc71" },
            { name: "Branch R",  sockets: [1, 2, 1, 0], color: "#27ae60" },
            { name: "Branch L",  sockets: [1, 0, 1, 2], color: "#27ae60" },
            { name: "Cross",     sockets: [1, 2, 1, 2], color: "#229954" },
            { name: "Leaf R",    sockets: [0, 0, 0, 2], color: "#82e0aa" }, // expects attachment on its left
            { name: "Leaf L",    sockets: [0, 2, 0, 0], color: "#82e0aa" }, // expects attachment on its right
            { name: "Flower",    sockets: [0, 0, 1, 0], color: "#e74c3c" }, // expects stem below
            { name: "Root",      sockets: [1, 0, -1, 0], color: "#8b4513" } // -1 means ground
        ];

        let grid = [];
        
        function initWFC() {
            grid = [];
            for(let y=0; y<GRID_SIZE; y++) {
                let row = [];
                for(let x=0; x<GRID_SIZE; x++) {
                    // Start with all possibilities
                    let options = [0,1,2,3,4,5,6,7];
                    if (y === GRID_SIZE - 1) {
                        // Bottom row must be root or air
                        options = [0, 8];
                    }
                    row.push({ options: options, collapsed: false });
                }
                grid.push(row);
            }
            // Force a root in the middle bottom to guarantee a plant
            grid[GRID_SIZE-1][Math.floor(GRID_SIZE/2)].options = [8];
            grid[GRID_SIZE-1][Math.floor(GRID_SIZE/2)].collapsed = true;
            propagate();
            draw();
        }

        function checkMatch(socketA, socketB) {
            return socketA === socketB;
        }

        function propagate() {
            let changed = true;
            let loops = 0;
            while(changed && loops < 1000) {
                changed = false;
                loops++;
                for(let y=0; y<GRID_SIZE; y++) {
                    for(let x=0; x<GRID_SIZE; x++) {
                        let cell = grid[y][x];
                        if (cell.collapsed) continue;
                        
                        let currentOptionsCount = cell.options.length;
                        
                        // Check Top neighbor
                        if (y > 0) {
                            let validOptions = [];
                            let topCell = grid[y-1][x];
                            for(let opt of cell.options) {
                                let valid = false;
                                for(let topOpt of topCell.options) {
                                    // cell's Top socket must match topCell's Bottom socket
                                    if(checkMatch(TILES[opt].sockets[0], TILES[topOpt].sockets[2])) valid = true;
                                }
                                if(valid) validOptions.push(opt);
                            }
                            cell.options = validOptions;
                        } else {
                            // Top edge of board, top socket must be 0
                            cell.options = cell.options.filter(o => TILES[o].sockets[0] === 0);
                        }

                        // Check Bottom neighbor
                        if (y < GRID_SIZE - 1) {
                            let validOptions = [];
                            let botCell = grid[y+1][x];
                            for(let opt of cell.options) {
                                let valid = false;
                                for(let botOpt of botCell.options) {
                                    // cell's Bottom socket must match botCell's Top socket
                                    if(checkMatch(TILES[opt].sockets[2], TILES[botOpt].sockets[0])) valid = true;
                                }
                                if(valid) validOptions.push(opt);
                            }
                            cell.options = validOptions;
                        } else {
                            // Bottom edge is ground, must match -1 or 0
                            cell.options = cell.options.filter(o => TILES[o].sockets[2] === -1 || TILES[o].sockets[2] === 0);
                        }

                        // Check Right
                        if (x < GRID_SIZE - 1) {
                            let validOptions = [];
                            let rightCell = grid[y][x+1];
                            for(let opt of cell.options) {
                                let valid = false;
                                for(let rightOpt of rightCell.options) {
                                    if(checkMatch(TILES[opt].sockets[1], TILES[rightOpt].sockets[3])) valid = true;
                                }
                                if(valid) validOptions.push(opt);
                            }
                            cell.options = validOptions;
                        } else {
                            cell.options = cell.options.filter(o => TILES[o].sockets[1] === 0);
                        }
                        
                        // Check Left
                        if (x > 0) {
                            let validOptions = [];
                            let leftCell = grid[y][x-1];
                            for(let opt of cell.options) {
                                let valid = false;
                                for(let leftOpt of leftCell.options) {
                                    if(checkMatch(TILES[opt].sockets[3], TILES[leftOpt].sockets[1])) valid = true;
                                }
                                if(valid) validOptions.push(opt);
                            }
                            cell.options = validOptions;
                        } else {
                            cell.options = cell.options.filter(o => TILES[o].sockets[3] === 0);
                        }

                        if (cell.options.length < currentOptionsCount) {
                            changed = true;
                        }
                    }
                }
            }
        }

        function stepWFC() {
            // Find cell with lowest entropy (fewest options > 1)
            let minEntropy = 999;
            let targetCell = null;
            let targetX = -1;
            let targetY = -1;

            for(let y=0; y<GRID_SIZE; y++) {
                for(let x=0; x<GRID_SIZE; x++) {
                    let cell = grid[y][x];
                    if (!cell.collapsed && cell.options.length > 0) {
                        if (cell.options.length < minEntropy) {
                            minEntropy = cell.options.length;
                            targetCell = cell;
                            targetX = x; targetY = y;
                        }
                    }
                }
            }

            if (targetCell) {
                // Weighted choice to favor stems growing up rather than immediate flowers
                // Let's just do random choice for now
                let choice = targetCell.options[Math.floor(Math.random() * targetCell.options.length)];
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
            let safety = 0;
            while(running && safety < 200) {
                running = stepWFC();
                safety++;
            }
        }

        function drawTile(x, y, tileIndex) {
            let px = x * CELL_SIZE;
            let py = y * CELL_SIZE;
            let t = TILES[tileIndex];
            
            ctx.fillStyle = "#34495e";
            ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
            
            if (tileIndex === 0) return; // Air

            ctx.fillStyle = t.color;
            if (t.name === "Stem" || t.name === "Root") {
                ctx.fillRect(px + 15, py, 10, CELL_SIZE);
            }
            else if (t.name === "Branch R") {
                ctx.fillRect(px + 15, py, 10, CELL_SIZE);
                ctx.fillRect(px + 15, py + 15, CELL_SIZE-15, 10);
            }
            else if (t.name === "Branch L") {
                ctx.fillRect(px + 15, py, 10, CELL_SIZE);
                ctx.fillRect(px, py + 15, 15, 10);
            }
            else if (t.name === "Cross") {
                ctx.fillRect(px + 15, py, 10, CELL_SIZE);
                ctx.fillRect(px, py + 15, CELL_SIZE, 10);
            }
            else if (t.name === "Leaf R") {
                ctx.beginPath();
                ctx.arc(px + 10, py + 20, 10, 0, Math.PI*2);
                ctx.fill();
            }
            else if (t.name === "Leaf L") {
                ctx.beginPath();
                ctx.arc(px + 30, py + 20, 10, 0, Math.PI*2);
                ctx.fill();
            }
            else if (t.name === "Flower") {
                ctx.fillStyle = t.color;
                ctx.beginPath();
                ctx.arc(px + 20, py + 20, 15, 0, Math.PI*2);
                ctx.fill();
                ctx.fillStyle = "#f1c40f";
                ctx.beginPath();
                ctx.arc(px + 20, py + 20, 5, 0, Math.PI*2);
                ctx.fill();
                ctx.fillStyle = "#2ecc71";
                ctx.fillRect(px + 15, py + 30, 10, 10); // stem connection
            }
        }

        function draw() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            for(let y=0; y<GRID_SIZE; y++) {
                for(let x=0; x<GRID_SIZE; x++) {
                    let cell = grid[y][x];
                    if (cell.collapsed) {
                        drawTile(x, y, cell.options[0]);
                    } else {
                        // Draw uncollapsed state
                        ctx.fillStyle = "#2c3e50";
                        ctx.fillRect(x*CELL_SIZE, y*CELL_SIZE, CELL_SIZE, CELL_SIZE);
                        ctx.strokeStyle = "#34495e";
                        ctx.strokeRect(x*CELL_SIZE, y*CELL_SIZE, CELL_SIZE, CELL_SIZE);
                        
                        ctx.fillStyle = "#7f8c8d";
                        ctx.font = "10px Arial";
                        ctx.fillText(cell.options.length, x*CELL_SIZE + 15, y*CELL_SIZE + 25);
                    }
                }
            }
        }

        initWFC();
    </script>
</body>
</html>
"""

with open('/home/martin/theoretical_plant_generator/wfc_plant.html', 'w') as f:
    f.write(wfc_html)
