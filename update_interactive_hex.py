html = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Interactive Flora-Scaper: 2D Botanik</title>
    <style>
        body { background: #1a1a2e; color: #ecf0f1; font-family: sans-serif; display: flex; flex-direction: column; align-items: center; padding: 20px; }
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
        <h2>Interactive Plant Sculptor (2D WFC)</h2>
        <p>Wähle rechts deine botanische DNA. Klicke dann auf die rot leuchtenden <strong>Wachstumspunkte</strong>, um die Pflanze Teil für Teil organisch wachsen zu lassen! Der Algorithmus sorgt dafür, dass nur botanisch sinnvolle Verbindungen entstehen.</p>
    </div>
    <button onclick="initWFC()" style="margin-bottom: 15px;">Pflanze neu starten</button>
    <canvas id="hexCanvas" width="700" height="700"></canvas>
    
    <script>
        const canvas = document.getElementById('hexCanvas');
        const ctx = canvas.getContext('2d');
        const GRID_W = 19, GRID_H = 19, SIZE = 20;

        const dna = {
            habitus: "aufrecht",      
            blattstellung: "wechselständig", 
            bluetenstand: "einzelbluete",  
            symmetrie: "radiär" 
        };

        const gui = new dat.GUI({ autoPlace: false });
        document.getElementById('gui-container').appendChild(gui.domElement);
        gui.add(dna, 'habitus', ['aufrecht', 'kriechend']).onChange(initWFC);
        gui.add(dna, 'blattstellung', ['wechselständig', 'gegenständig']).onChange(initWFC);
        gui.add(dna, 'bluetenstand', ['einzelbluete', 'traube']).onChange(initWFC);
        gui.add(dna, 'symmetrie', ['radiär', 'zygomorph']).onChange(() => draw());

        const ALL_TILES = [
            { id: 0, name: "Air",           sockets: [0,0,0,0,0,0], color: "#16213e", type: "air" },
            { id: 1, name: "Root",          sockets: [1,0,0,4,0,0], color: "#5c3a21", type: "root" },
            
            { id: 2, name: "Stem Straight", sockets: [1,0,0,1,0,0], color: "#27ae60", type: "stem", habitus: "aufrecht" },
            { id: 3, name: "Stem Bend TR",  sockets: [0,1,0,1,0,0], color: "#27ae60", type: "stem", habitus: "any" },
            { id: 4, name: "Stem Bend TL",  sockets: [0,0,0,1,0,1], color: "#27ae60", type: "stem", habitus: "any" },
            { id: 5, name: "Stem Horiz R",  sockets: [0,1,0,0,1,0], color: "#27ae60", type: "stem", habitus: "kriechend" }, 
            { id: 6, name: "Stem Horiz L",  sockets: [0,0,1,0,0,1], color: "#27ae60", type: "stem", habitus: "kriechend" }, 
            
            { id: 7, name: "Stem Fork",     sockets: [1,2,0,1,0,2], color: "#2ecc71", type: "fork", habitus: "aufrecht" }, 
            { id: 8, name: "Stem Fork Horiz",sockets: [0,2,0,0,1,2], color: "#2ecc71", type: "fork", habitus: "kriechend" }, 
            
            { id: 9, name: "Branch TR",     sockets: [0,2,0,0,2,0], color: "#2ecc71", type: "branch" }, 
            { id: 10, name: "Branch TL",     sockets: [0,0,2,0,0,2], color: "#2ecc71", type: "branch" }, 
            
            { id: 11, name: "Stem Leaf TR",  sockets: [1,3,0,1,0,0], color: "#27ae60", type: "stem", phyll: "wechselständig" },
            { id: 12, name: "Stem Leaf TL",  sockets: [1,0,0,1,0,3], color: "#27ae60", type: "stem", phyll: "wechselständig" },
            { id: 13, name: "Stem Leaves 2", sockets: [1,3,0,1,0,3], color: "#27ae60", type: "stem", phyll: "gegenständig" }, 
            
            { id: 14, name: "Leaf for BL",   sockets: [0,0,0,0,3,0], color: "#a9dfbf", type: "leaf" }, 
            { id: 15, name: "Leaf for BR",   sockets: [0,0,3,0,0,0], color: "#a9dfbf", type: "leaf" }, 
            
            { id: 16, name: "Flower Top",    sockets: [0,0,0,1,0,0], color: "#e94560", type: "flower" }, 
            { id: 17, name: "Flower TR",     sockets: [0,0,0,0,2,0], color: "#ff9a8b", type: "flower" }, 
            { id: 18, name: "Flower TL",     sockets: [0,0,2,0,0,0], color: "#ff9a8b", type: "flower" }  
        ];

        let activeTiles = [];
        let grid = [];

        function getNeighborOffset(edge) {
            const offsets = [{q:0, r:-1}, {q:1, r:-1}, {q:1, r:0}, {q:0, r:1}, {q:-1, r:1}, {q:-1, r:0}];
            return offsets[edge];
        }

        function initWFC() {
            activeTiles = ALL_TILES.filter(t => {
                if (t.habitus && t.habitus !== "any" && t.habitus !== dna.habitus) return false;
                if (t.phyll && t.phyll !== dna.blattstellung) return false;
                if (dna.bluetenstand === "einzelbluete" && (t.id === 17 || t.id === 18)) return false; 
                return true;
            });

            grid = [];
            for(let r=0; r<GRID_H; r++) {
                let row = [];
                for(let q=0; q<GRID_W; q++) {
                    let options = activeTiles.map(t => t.id);
                    if (r === GRID_H - 1) options = [0, 1]; 
                    else options = options.filter(o => o !== 1);
                    row.push({ q: q, r: r, options: options, collapsed: false });
                }
                grid.push(row);
            }
            let midQ = Math.floor(GRID_W/2);
            grid[GRID_H-1][midQ].options = [1];
            grid[GRID_H-1][midQ].collapsed = true;
            propagate();
            draw();
        }

        function propagate() {
            let changed = true; let loops = 0;
            while(changed && loops < 3000) {
                changed = false; loops++;
                for(let r=0; r<GRID_H; r++) {
                    for(let q=0; q<GRID_W; q++) {
                        let cell = grid[r][q];
                        if (cell.collapsed) continue;
                        let currentCount = cell.options.length;
                        for(let edge=0; edge<6; edge++) {
                            let offset = getNeighborOffset(edge);
                            let nq = q + offset.q, nr = r + offset.r;
                            if (nq < 0 || nq >= GRID_W || nr < 0 || nr >= GRID_H) {
                                let req = (edge === 3 && r === GRID_H-1) ? 4 : 0;
                                cell.options = cell.options.filter(o => ALL_TILES[o].sockets[edge] === req || ALL_TILES[o].sockets[edge] === 0);
                                continue;
                            }
                            let nCell = grid[nr][nq];
                            let validOpts = [];
                            let oppEdge = (edge + 3) % 6;
                            for(let opt of cell.options) {
                                let valid = false;
                                let mySock = ALL_TILES[opt].sockets[edge];
                                for(let nOpt of nCell.options) {
                                    if (mySock === ALL_TILES[nOpt].sockets[oppEdge]) { valid = true; break; }
                                }
                                if(valid) validOpts.push(opt);
                            }
                            cell.options = validOpts;
                        }
                        if (cell.options.length < currentCount) changed = true;
                    }
                }
            }
        }

        function isGrowthPoint(q, r) {
            // A cell is a growth point if it is not collapsed, has plant options, and is adjacent to a collapsed plant tile.
            let cell = grid[r][q];
            if (cell.collapsed) return false;
            let hasPlantOpt = cell.options.some(o => o !== 0);
            if (!hasPlantOpt) return false;
            
            for(let edge=0; edge<6; edge++) {
                let offset = getNeighborOffset(edge);
                let nq = q + offset.q, nr = r + offset.r;
                if (nq >= 0 && nq < GRID_W && nr >= 0 && nr < GRID_H) {
                    let nCell = grid[nr][nq];
                    if (nCell.collapsed && nCell.options[0] !== 0) {
                        return true;
                    }
                }
            }
            return false;
        }

        canvas.addEventListener('click', (e) => {
            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left, mouseY = e.clientY - rect.top;
            let w = Math.sqrt(3) * SIZE, h = 2 * SIZE;
            let bestQ = -1, bestR = -1, minDist = 9999;
            for(let r=0; r<GRID_H; r++) {
                for(let q=0; q<GRID_W; q++) {
                    let px = w * (q + r/2.0) - (GRID_H/2 * w) + canvas.width/2; 
                    let py = h * (3/4) * r + 50;
                    let dist = Math.sqrt((px-mouseX)**2 + (py-mouseY)**2);
                    if (dist < minDist) { minDist = dist; bestQ = q; bestR = r; }
                }
            }
            if (minDist < SIZE) {
                if (isGrowthPoint(bestQ, bestR)) {
                    let cell = grid[bestR][bestQ];
                    let plantOpts = cell.options.filter(o => o !== 0);
                    // Weight branches/stems higher than flowers initially to let plant grow
                    let choice = plantOpts[Math.floor(Math.random() * plantOpts.length)];
                    cell.options = [choice];
                    cell.collapsed = true;
                    propagate();
                    draw();
                }
            }
        });

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
            let t = ALL_TILES[tileIndex];
            if (t.id === 0) return; 
            ctx.fillStyle = "#1a1a2e"; drawHexPath(x, y, SIZE*0.95); ctx.fill();
            let midpoints = [
                {x: x, y: y - SIZE*0.866}, {x: x + SIZE*0.75, y: y - SIZE*0.433},
                {x: x + SIZE*0.75, y: y + SIZE*0.433}, {x: x, y: y + SIZE*0.866},
                {x: x - SIZE*0.75, y: y + SIZE*0.433}, {x: x - SIZE*0.75, y: y - SIZE*0.433} 
            ];
            ctx.lineCap = "round";
            for(let i=0; i<6; i++) {
                let sock = t.sockets[i];
                if (sock > 0) {
                    ctx.strokeStyle = t.color;
                    ctx.lineWidth = (sock === 1 || sock === 4) ? 6 : 2; 
                    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(midpoints[i].x, midpoints[i].y); ctx.stroke();
                }
            }
            if (t.type === "leaf") {
                ctx.fillStyle = t.color; ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI*2); ctx.fill();
            } else if (t.type === "flower") {
                ctx.fillStyle = t.color;
                if (dna.symmetrie === "radiär") {
                    ctx.beginPath();
                    for(let i=0; i<5; i++) {
                        let a = Math.PI/180 * (72*i);
                        ctx.arc(x + Math.cos(a)*6, y + Math.sin(a)*6, 5, 0, Math.PI*2);
                    }
                    ctx.fill();
                } else if (dna.symmetrie === "zygomorph") {
                    ctx.beginPath();
                    ctx.ellipse(x, y + 4, 8, 4, 0, 0, Math.PI*2); 
                    ctx.ellipse(x - 5, y - 4, 4, 6, Math.PI/4, 0, Math.PI*2); 
                    ctx.ellipse(x + 5, y - 4, 4, 6, -Math.PI/4, 0, Math.PI*2); 
                    ctx.fill();
                }
                ctx.fillStyle = "#f1c40f"; ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI*2); ctx.fill();
            }
        }

        function draw() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            let w = Math.sqrt(3) * SIZE, h = 2 * SIZE;
            for(let r=0; r<GRID_H; r++) {
                for(let q=0; q<GRID_W; q++) {
                    let cell = grid[r][q];
                    let px = w * (q + r/2.0) - (GRID_H/2 * w) + canvas.width/2; 
                    let py = h * (3/4) * r + 50;
                    if (cell.collapsed) drawHexTile(px, py, cell.options[0]);
                    else {
                        ctx.strokeStyle = "#0f3460"; ctx.lineWidth = 1;
                        drawHexPath(px, py, SIZE * 0.95); ctx.stroke();
                        
                        if(isGrowthPoint(q, r)) {
                            // Highlight valid growth points
                            ctx.fillStyle = "rgba(233, 69, 96, 0.4)"; 
                            ctx.fill();
                            // Pulse effect optional
                        }
                    }
                }
            }
        }
        initWFC();
    </script>
</body>
</html>
"""

with open('/home/martin/theoretical_plant_generator/interactive_hex.html', 'w') as f:
    f.write(html)
