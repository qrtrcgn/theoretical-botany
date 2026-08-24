html = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Interactive Flora-Scaper</title>
    <style>
        body { background: #1a1a2e; color: #ecf0f1; font-family: sans-serif; display: flex; flex-direction: column; align-items: center; padding: 20px; }
        canvas { background: #16213e; border: 2px solid #0f3460; box-shadow: 0 4px 15px rgba(0,0,0,0.5); border-radius: 10px; cursor: pointer; }
        .info { max-width: 700px; text-align: center; line-height: 1.5; margin-bottom: 10px; }
        .controls { margin-bottom: 15px; }
        button { padding: 10px 20px; background: #e94560; border: none; color: white; cursor: pointer; border-radius: 5px; font-weight: bold; }
        button:hover { background: #ff5c77; }
    </style>
</head>
<body>
    <div class="info">
        <h2>Interactive Plant Sculptor (WFC)</h2>
        <p>Klicke auf das Raster, um die Pflanze manuell wachsen zu lassen! <br>Wie bei Townscaper wählst du den Ort, und der Algorithmus entscheidet anhand der Botanik-Regeln, was dort entstehen kann (Ast, Blatt, Blüte oder nichts, falls es keinen Sinn ergibt).</p>
    </div>
    <div class="controls">
        <button onclick="initWFC()">Alles löschen</button>
    </div>
    <canvas id="hexCanvas" width="600" height="600"></canvas>
    
    <script>
        const canvas = document.getElementById('hexCanvas');
        const ctx = canvas.getContext('2d');
        const GRID_W = 15;
        const GRID_H = 15;
        const SIZE = 22;

        const TILES = [
            { name: "Air",           sockets: [0,0,0,0,0,0], color: "#16213e" },
            { name: "Root",          sockets: [1,0,0,4,0,0], color: "#5c3a21" },
            { name: "Stem Straight", sockets: [1,0,0,1,0,0], color: "#27ae60" },
            { name: "Stem Bend TR",  sockets: [0,1,0,1,0,0], color: "#27ae60" },
            { name: "Stem Bend TL",  sockets: [0,0,0,1,0,1], color: "#27ae60" },
            { name: "Stem Fork",     sockets: [1,2,0,1,0,2], color: "#2ecc71" }, 
            { name: "Sympodial Fork",sockets: [0,1,0,1,0,1], color: "#2ecc71" }, 
            { name: "Branch TR",     sockets: [0,2,0,0,2,0], color: "#2ecc71" }, 
            { name: "Branch TL",     sockets: [0,0,2,0,0,2], color: "#2ecc71" }, 
            { name: "Stem Leaf TR",  sockets: [1,3,0,1,0,0], color: "#27ae60" },
            { name: "Stem Leaf TL",  sockets: [1,0,0,1,0,3], color: "#27ae60" },
            { name: "Stem Leaves 2", sockets: [1,3,0,1,0,3], color: "#27ae60" }, 
            { name: "Leaf for BL",   sockets: [0,0,0,0,3,0], color: "#a9dfbf" }, 
            { name: "Leaf for BR",   sockets: [0,0,3,0,0,0], color: "#a9dfbf" }, 
            { name: "Flower Top",    sockets: [0,0,0,1,0,0], color: "#e94560" }, 
            { name: "Flower TR",     sockets: [0,0,0,0,2,0], color: "#ff9a8b" }, 
            { name: "Flower TL",     sockets: [0,0,2,0,0,0], color: "#ff9a8b" }  
        ];

        let grid = [];

        function getNeighborOffset(edge) {
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
                    let options = Array.from(Array(TILES.length).keys());
                    if (r === GRID_H - 1) options = [0, 1]; 
                    else options = options.filter(o => o !== 1);
                    row.push({ q: q, r: r, options: options, collapsed: false });
                }
                grid.push(row);
            }
            // Root
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
                        for(let edge=0; edge<6; edge++) {
                            let offset = getNeighborOffset(edge);
                            let nq = q + offset.q;
                            let nr = r + offset.r;
                            
                            if (nq < 0 || nq >= GRID_W || nr < 0 || nr >= GRID_H) {
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
                                    if (mySocket === TILES[nOpt].sockets[oppositeEdge]) {
                                        valid = true; break;
                                    }
                                }
                                if(valid) validOptions.push(opt);
                            }
                            cell.options = validOptions;
                        }
                        if (cell.options.length < currentCount) changed = true;
                    }
                }
            }
        }

        // Handle clicks
        canvas.addEventListener('click', (e) => {
            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            // Find which hex was clicked
            let w = Math.sqrt(3) * SIZE;
            let h = 2 * SIZE;
            let bestQ = -1, bestR = -1, minDist = 9999;

            for(let r=0; r<GRID_H; r++) {
                for(let q=0; q<GRID_W; q++) {
                    let px = w * (q + r/2.0) - (GRID_H/2 * w) + canvas.width/2; 
                    let py = h * (3/4) * r + 50;
                    let dist = Math.sqrt(Math.pow(px - mouseX, 2) + Math.pow(py - mouseY, 2));
                    if (dist < minDist) {
                        minDist = dist;
                        bestQ = q;
                        bestR = r;
                    }
                }
            }

            if (minDist < SIZE) {
                let cell = grid[bestR][bestQ];
                if (!cell.collapsed && cell.options.length > 0) {
                    // Filter out 'Air' if possible, favor plant parts to force growth
                    let plantOptions = cell.options.filter(o => o !== 0);
                    let choice = 0;
                    if (plantOptions.length > 0) {
                        choice = plantOptions[Math.floor(Math.random() * plantOptions.length)];
                    } else {
                        choice = cell.options[0];
                    }
                    cell.options = [choice];
                    cell.collapsed = true;
                    propagate();
                    draw();
                }
            }
        });

        function draw() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            let w = Math.sqrt(3) * SIZE;
            let h = 2 * SIZE;
            for(let r=0; r<GRID_H; r++) {
                for(let q=0; q<GRID_W; q++) {
                    let cell = grid[r][q];
                    let px = w * (q + r/2.0) - (GRID_H/2 * w) + canvas.width/2; 
                    let py = h * (3/4) * r + 50;

                    if (cell.collapsed) {
                        drawHexTile(px, py, cell.options[0]);
                    } else {
                        ctx.strokeStyle = "#0f3460";
                        ctx.lineWidth = 1;
                        drawHexPath(px, py, SIZE * 0.95);
                        ctx.stroke();
                        
                        // subtle highlight for playable cells (cells with plant options)
                        let hasPlantOption = cell.options.some(o => o !== 0);
                        if(hasPlantOption) {
                            ctx.fillStyle = "rgba(233, 69, 96, 0.2)";
                            ctx.fill();
                        }
                    }
                }
            }
        }

        function drawHexPath(x, y, size) {
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
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
            if (tileIndex === 0) return; 
            
            ctx.fillStyle = "#1a1a2e"; 
            drawHexPath(x, y, SIZE*0.95);
            ctx.fill();

            let midpoints = [
                {x: x, y: y - SIZE*0.866},
                {x: x + SIZE*0.75, y: y - SIZE*0.433},
                {x: x + SIZE*0.75, y: y + SIZE*0.433},
                {x: x, y: y + SIZE*0.866},
                {x: x - SIZE*0.75, y: y + SIZE*0.433},
                {x: x - SIZE*0.75, y: y - SIZE*0.433} 
            ];

            ctx.lineCap = "round";
            for(let i=0; i<6; i++) {
                let sock = t.sockets[i];
                if (sock > 0) {
                    ctx.strokeStyle = t.color;
                    ctx.lineWidth = (sock === 1 || sock === 4) ? 6 : 2; 
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    ctx.lineTo(midpoints[i].x, midpoints[i].y);
                    ctx.stroke();
                }
            }

            if (t.name.includes("Leaf")) {
                ctx.fillStyle = t.color;
                ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI*2); ctx.fill();
            } else if (t.name.includes("Flower")) {
                ctx.fillStyle = t.color;
                ctx.beginPath();
                for(let i=0; i<5; i++) {
                    let a = Math.PI/180 * (72*i);
                    ctx.arc(x + Math.cos(a)*6, y + Math.sin(a)*6, 5, 0, Math.PI*2);
                }
                ctx.fill();
                ctx.fillStyle = "#f1c40f";
                ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI*2); ctx.fill();
            }
        }
        initWFC();
    </script>
</body>
</html>
"""

with open('/home/martin/theoretical_plant_generator/interactive_hex.html', 'w') as f:
    f.write(html)
