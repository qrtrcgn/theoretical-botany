import argparse
import json
import numpy as np
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

from flora.core.config import EngineConfig, MorphologyConfig, InflorescenceConfig, MechanicsConfig, NodeType
from flora import create_default_engine
from flora.biology.genetics import Genome, breed, extract_phenotype_pool
from flora.biology.pruning import cut_at
from flora.io.exporter import export_obj, export_gltf

#: Upper bound for a single /api/simulate call so wall-clock catch-up
#: (zen garden "grew while you were away") cannot explode the plant.
MAX_CATCHUP_STEPS = 200

#: Directory containing this server; used to locate the hand-authored UI template
#: regardless of the process CWD (server is safe to launch from any directory).
_BASE_DIR = Path(__file__).resolve().parent

# Botanical schema for debug decoding (mirrors botanical_schema.json)
_BOTANICAL_SCHEMA = {
    "habitus": {
        "wuchsform": ["aufrecht", "kriechend", "kletternd", "hängend", "polsterförmig", "rosettenbildend"],
        "lebensform": ["annuell", "bienne", "perenn", "gehölz", "kraut"],
    },
    "sprossachse": {
        "querschnitt": ["rund", "vierkantig", "gefurcht", "gerieft"],
        "oberflaeche": ["glatt", "behaart", "stachelig", "bereift"],
    },
    "blaetter": {
        "stellung": ["wechselständig", "gegenständig", "quirlständig"],
        "form": ["eiförmig", "lanzettlich", "herzförmig", "spatelförmig", "fiederspaltig"],
        "rand": ["ganzrandig", "gezähnt", "gesägt", "gelappt"],
    },
    "blueten": {
        "bluetenstand": ["traube", "aehre", "rispe", "dolde", "koepfchen", "einzelbluete"],
        "symmetrie": ["radiaersymmetrisch", "zygomorph", "asymmetrisch"],
    },
}

# Locus -> schema mapping (allele % len(options))
_LOCUS_MAP = [
    ("habitus.wuchsform", "habitus", "wuchsform"),
    ("habitus.lebensform", "habitus", "lebensform"),
    ("sprossachse.querschnitt", "sprossachse", "querschnitt"),
    ("sprossachse.oberflaeche", "sprossachse", "oberflaeche"),
    ("blaetter.stellung", "blaetter", "stellung"),
    ("blaetter.form", "blaetter", "form"),
    ("blaetter.rand", "blaetter", "rand"),
    ("blueten.bluetenstand", "blueten", "bluetenstand"),
    ("blueten.symmetrie", "blueten", "symmetrie"),
    ("farbe/symmetrie-mod", None, None),  # Locus 9: visuelle Modifikation (Farbe/Petals)
]


def _build_debug_info(strands: list, pheno: dict) -> dict:
    """Build debug payload for the frontend gene inspector."""
    pool_serialized = {str(k): v for k, v in pheno.items()}
    traits = []
    for locus, (label, cat, key) in enumerate(_LOCUS_MAP):
        alleles = pheno.get(locus, [])
        if cat and key:
            options = _BOTANICAL_SCHEMA[cat][key]
            # Use first allele as representative (sorted pool)
            rep = alleles[0] if alleles else 0
            decoded = options[rep % len(options)]
        else:
            decoded = f"alleles={alleles}"
        traits.append({"locus": locus, "label": label, "alleles": alleles, "decoded": decoded})
    # Extra loci beyond schema
    max_locus = max(pheno.keys(), default=-1)
    for locus in range(len(_LOCUS_MAP), max_locus + 1):
        alleles = pheno.get(locus, [])
        traits.append({"locus": locus, "label": f"locus_{locus}", "alleles": alleles, "decoded": f"alleles={alleles}"})
    return {"strands": strands, "ploidy": len(strands), "pool": pool_serialized, "traits": traits}


# Map phenotype pools to engine configs
def phenotype_to_config(pheno_pool: dict, seed: int) -> EngineConfig:
    def get_allele(locus):
        alleles = pheno_pool.get(locus, [0])
        return alleles[0] if alleles else 0

    # 0: Habitus -> 0: Aufrecht (monopodial), 1,2,3: sympodial (crawling/rosette logic in visual)
    h = get_allele(0)
    habit = "monopodial" if h == 0 else "sympodial"
    
    # 1: Verzweigung -> 0: sympodial (terminal flower), 1: monopodial
    v = get_allele(1)
    
    # 2: Blattform (visual)
    
    # 3: Phyllotaxis -> 0: alternate, 1: opposite, 2: whorled
    phy = get_allele(3) % 3
    phy_mode = ["alternate", "opposite", "whorled"][phy]
    
    # 4: Blattgröße -> influences leaf_mass
    bg = get_allele(4) % 4
    leaf_m = [0.001, 0.005, 0.0005, 0.010][bg]
    
    # 5: Infloreszenz -> 0: cyme (körbchen-like), 1: panicle, 2: raceme, 3: single
    i = get_allele(5) % 4
    inflo = ["cyme", "panicle", "raceme", "spike"][i]
    
    morph = MorphologyConfig(branch_angle=0.7, phyllotaxis_mode=phy_mode, leaf_mass=leaf_m, flower_mass=0.0005)
    inf = InflorescenceConfig(growth_habit=habit, inflorescence_type=inflo)
    mech = MechanicsConfig()
    
    return EngineConfig(seed=seed, morphology=morph, inflorescence=inf, mechanics=mech)


# Global state for interactive simulation
_current_engine = None
_current_seed = None
_current_genome_hash = None
_current_pheno = None
_current_strands = None

def serialize_raw_snapshot(engine) -> dict:
    snap = engine.snapshot()
    out = {"n": int(snap["n"])}
    for key, value in snap.items():
        if key == "n":
            continue
        if isinstance(value, np.ndarray):
            out[key] = value.tolist()
        elif isinstance(value, np.generic):
            out[key] = value.item()
        else:
            out[key] = value
    return out


def serialize_nodes(engine, pheno):
    snap = engine.snapshot()
    n = int(snap['n'])
    pos = snap['position'][:n]
    types = snap['node_type'][:n]
    parent = snap['parent'][:n]
    alive = snap['alive'][:n] if 'alive' in snap else engine.state.alive[:n]
    woodiness = snap['woodiness'][:n] if 'woodiness' in snap else np.zeros(n)
    radius = snap['radius'][:n] if 'radius' in snap else np.full(n, 0.005)
    
    # We need to compute headings for each node to get its tip position
    from flora.core.spatial import quat_rotate, UP_VECTOR
    import numpy as np
    
    headings = quat_rotate(snap['orientation'][:n], UP_VECTOR)
    lengths = snap['internode_length'][:n]
    
    nodes_json = []
    for i in range(1, n):
        if not alive[i]:
            continue
            
        # Node's base is pos[i]
        p1 = pos[i]
        
        # Node's tip is pos[i] + heading * length
        length = float(lengths[i])
        
        dir_x = float(headings[i][0])
        dir_y = float(headings[i][1])
        dir_z = float(headings[i][2])
        
        ntype = 'stem'
        if types[i] == NodeType.FLOWER:
            ntype = 'flower'
        elif types[i] == NodeType.LEAF:
            ntype = 'leaf'
        elif types[i] == NodeType.BUD_DORMANT:
            ntype = 'bud'
        elif types[i] == NodeType.APEX:
            ntype = 'apex'
        elif types[i] == NodeType.FLORAL_AXIS or types[i] == 3:
            ntype = 'floral_axis'

        node_dict = {
            'id': int(i),
            'parentId': int(parent[i]),
            'type': ntype,
            'nodeType': int(types[i]),
            'alive': True,
            'radius': float(radius[i] * 100),
            'pos': {'x': float(p1[0] * 100), 'y': float(p1[1] * 100), 'z': float(p1[2] * 100)},
            'dir': {'x': dir_x, 'y': dir_y, 'z': dir_z},
            'currentLength': length * 100,
            'depth': 0,
            'age': float(woodiness[i] * 120) if ntype in ('stem', 'floral_axis') else 0,
        }

        
        if ntype == 'flower':
            col_alleles = pheno.get(9, [0]) if pheno else [0]
            col_allele = col_alleles[i % len(col_alleles)] if col_alleles else 0
            col_allele2 = col_alleles[(i+1) % len(col_alleles)] if len(col_alleles) > 1 else col_allele
            cols = [[220,20,50], [240,200,20], [40,80,220], [240,240,240]]
            fc = cols[col_allele % 4]
            fc2 = cols[col_allele2 % 4]
            
            pet_alleles = pheno.get(8, [0]) if pheno else [0]
            pet = pet_alleles[i % len(pet_alleles)] if pet_alleles else 0
            
            sym_alleles = pheno.get(6, [0]) if pheno else [0]
            sym = sym_alleles[i % len(sym_alleles)] if sym_alleles else 0
            
            wirt_alleles = pheno.get(7, [0]) if pheno else [0]
            wirt = wirt_alleles[i % len(wirt_alleles)] if wirt_alleles else 0
            petals = [5, 4, 3][wirt % 3]
            

            # ADD GAUSSIAN VARIANCE (Bell Curve) FOR FLOWER SIZE
            # Base flower size multiplier
            size_variance = abs(engine.ctx.rng.normal(1.0, 0.4))
            
            defX, defY, defZ = 1.0, 1.0, 1.0
            if pet == 1:
                defX, defY, defZ = 0.2, 1.5, 1.0
            if sym == 0:
                defX = 0.5
                
            defX *= size_variance
            defY *= size_variance
            defZ *= size_variance
            
            node_dict.update({

                'defX': defX, 'defY': defY, 'defZ': defZ,
                'colR': fc[0] - 255, 'colG': fc[1] - 255, 'colB': fc[2] - 255,
                'colR2': fc2[0] - 255, 'colG2': fc2[1] - 255, 'colB2': fc2[2] - 255,
                'petals': petals,
            })
            
        elif ntype == 'leaf':

            # ADD GAUSSIAN VARIANCE (Bell Curve) FOR LEAVES
            size_variance = abs(engine.ctx.rng.normal(1.0, 0.3))
            lf_alleles = pheno.get(2, [0]) if pheno else [0]
            blattF = lf_alleles[i % len(lf_alleles)] if lf_alleles else 0
            if blattF == 0:
                defX, defY, defZ = 0.4, 2.0, 1.0
            elif blattF == 1:
                defX, defY, defZ = 1.2, 1.2, 1.0
            elif blattF == 2:
                defX, defY, defZ = 1.5, 1.0, 1.0
            else:
                defX, defY, defZ = 0.8, 1.5, 0.2
                
            defX *= size_variance
            defY *= size_variance
            defZ *= size_variance
            node_dict.update({'defX': defX, 'defY': defY, 'defZ': defZ, 'colR': 0, 'colG': 0, 'colB': 0})
            
        nodes_json.append(node_dict)
    return nodes_json


class InteractiveFloraHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/' or self.path == '/index.html':
            self.send_response(200)
            self.send_header('Content-type', 'text/html')
            self.end_headers()
            ui_path = _BASE_DIR / 'interactive_ui.html'
            self.wfile.write(ui_path.read_bytes())
        elif self.path in ('/manifest.webmanifest', '/sw.js', '/flora-icon.svg'):
            ctype = {
                '/manifest.webmanifest': 'application/manifest+json',
                '/sw.js': 'application/javascript',
                '/flora-icon.svg': 'image/svg+xml',
            }[self.path]
            target = _BASE_DIR / self.path.lstrip('/')
            if not target.exists():
                self.send_response(404)
                self.end_headers()
                return
            self.send_response(200)
            self.send_header('Content-type', ctype)
            self.end_headers()
            self.wfile.write(target.read_bytes())
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        global _current_engine, _current_seed, _current_genome_hash, _current_pheno, _current_strands
        if self.path == '/api/simulate':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            req = json.loads(post_data.decode('utf-8'))
            
            steps = min(int(req.get('steps', 10)), MAX_CATCHUP_STEPS)
            seed = req.get('seed', 42)
            strands = req.get('strands', [])
            reset = req.get('reset', False)
            
            if not strands:
                # Fallback to a random triploid
                strands = [
                    [0, 1, 0, 1, 0, 0, 1, 2, 0, 1],
                    [1, 0, 0, 0, 1, 0, 0, 1, 0, 0],
                    [0, 0, 1, 0, 0, 1, 0, 0, 1, 0]
                ]
                
            genome = Genome(strands)
            pheno = extract_phenotype_pool(genome)
            _current_pheno = pheno
            _current_strands = [s[:] for s in strands]
            genome_hash = hash(str(strands))
            
            if _current_engine is None or reset or _current_seed != seed or _current_genome_hash != genome_hash:
                config = phenotype_to_config(pheno, seed)
                _current_engine = create_default_engine(config)
                _current_seed = seed
                _current_genome_hash = genome_hash
                # Run the initial steps requested
                for _ in range(steps):
                    _current_engine.step(dt=1.0)
            else:
                # Stateful step on existing engine
                for _ in range(steps):
                    _current_engine.step(dt=1.0)
                
            nodes_json = serialize_nodes(_current_engine, _current_pheno)
            debug = _build_debug_info(strands, _current_pheno)
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'nodes': nodes_json, 'step': _current_engine.step_index, 'strands': strands, 'debug': debug}).encode('utf-8'))

        elif self.path == '/api/raw_snapshot':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            req = json.loads(post_data.decode('utf-8')) if post_data else {}
            steps = int(req.get('steps', 0))

            if _current_engine is None:
                self.send_response(400)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'No active simulation'}).encode('utf-8'))
                return

            for _ in range(max(0, steps)):
                _current_engine.step(dt=1.0)

            raw = serialize_raw_snapshot(_current_engine)
            raw["step"] = _current_engine.step_index

            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(raw).encode('utf-8'))
        
        elif self.path == '/api/prune':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            req = json.loads(post_data.decode('utf-8')) if post_data else {}
            
            cut_id = int(req.get('node_id', -1))
            
            if _current_engine is None:
                self.send_response(400)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'No active simulation'}).encode('utf-8'))
                return
                
            state = _current_engine.state
            if cut_id < 0 or cut_id >= state.n or not state.alive[cut_id]:
                self.send_response(400)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': f'Invalid or dead node_id: {cut_id}'}).encode('utf-8'))
                return
                
            parent_arr = state.parent[:state.n]
            
            # Find all descendants of cut_id (excluding cut_id itself)
            descendants = []
            frontier = [cut_id]
            while frontier:
                curr = frontier.pop(0)
                children = np.flatnonzero(parent_arr == curr).tolist()
                for c in children:
                    if c not in descendants:
                        descendants.append(c)
                        frontier.append(c)
            
            # Kill all descendants
            if descendants:
                desc_arr = np.asarray(descendants, dtype=np.int64)
                state.alive[desc_arr] = False
                state.auxin[desc_arr] = 0.0
                state.vigor[desc_arr] = 0.0
                state.structural_mass[desc_arr] = 0.0
                
            # Change cut_id type to BUD_DORMANT and reset its auxin to enable activation
            state.node_type[cut_id] = int(NodeType.BUD_DORMANT)
            state.auxin[cut_id] = 0.0
            
            # Invalidate topology cache
            state.topology_version += 1
            state._cache.clear()
            
            if 'floral_consumed' in _current_engine.ctx.cache:
                _current_engine.ctx.cache['floral_consumed'].difference_update(descendants)
                _current_engine.ctx.cache['floral_consumed'].discard(cut_id)
                
            nodes_json = serialize_nodes(_current_engine, _current_pheno)
            debug = _build_debug_info(_current_strands or [], _current_pheno or {})
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({
                'status': 'ok',
                'pruned_id': cut_id,
                'killed_count': len(descendants),
                'nodes': nodes_json,
                'debug': debug,
            }).encode('utf-8'))
            
        elif self.path == '/api/cut_at':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            req = json.loads(post_data.decode('utf-8')) if post_data else {}

            if _current_engine is None:
                self.send_response(400)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'No active simulation'}).encode('utf-8'))
                return

            try:
                res = cut_at(
                    _current_engine.state,
                    int(req.get('node_id', -1)),
                    float(req.get('t', 0.5)),
                )
            except ValueError as exc:
                self.send_response(400)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(exc)}).encode('utf-8'))
                return

            if 'floral_consumed' in _current_engine.ctx.cache:
                _current_engine.ctx.cache['floral_consumed'].difference_update(
                    res.get('bud_ids', [])
                )

            nodes_json = serialize_nodes(_current_engine, _current_pheno)
            debug = _build_debug_info(_current_strands or [], _current_pheno or {})

            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({
                'status': 'ok',
                'stub_id': res['stub_id'],
                'killed_count': res['killed_count'],
                'bud_ids': res['bud_ids'],
                'nodes': nodes_json,
                'debug': debug,
            }).encode('utf-8'))

        elif self.path == '/api/export/obj':
            if _current_engine is None:
                self.send_response(400)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'No active simulation'}).encode('utf-8'))
                return
            obj_str = export_obj(_current_engine.state)
            self.send_response(200)
            self.send_header('Content-type', 'text/plain')
            self.send_header('Content-Disposition', 'attachment; filename="plant.obj"')
            self.end_headers()
            self.wfile.write(obj_str.encode('utf-8'))

        elif self.path == '/api/export/gltf':
            if _current_engine is None:
                self.send_response(400)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'No active simulation'}).encode('utf-8'))
                return
            gltf_dict = export_gltf(_current_engine.state)
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Content-Disposition', 'attachment; filename="plant.gltf"')
            self.end_headers()
            self.wfile.write(json.dumps(gltf_dict, indent=2).encode('utf-8'))

        elif self.path == '/api/breed':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            req = json.loads(post_data.decode('utf-8'))
            
            g1 = Genome(req.get('g1', []))
            g2 = Genome(req.get('g2', []))
            child = breed(g1, g2, seed=req.get('seed', None))
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'strands': child.strands}).encode('utf-8'))
            
def run(server_class=HTTPServer, handler_class=InteractiveFloraHandler, host="", port=8000):
    server_class.allow_reuse_address = True
    server_address = (host, port)
    httpd = server_class(server_address, handler_class)
    bind_host = host if host else "0.0.0.0"
    print(f"Starting native Python botanical API on {bind_host}:{port}...")
    print(f"Open http://localhost:{port} in your browser")
    httpd.serve_forever()

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the interactive Flora HTTP server.")
    parser.add_argument("--host", default="", help="host/interface to bind (default all interfaces)")
    parser.add_argument("--port", type=int, default=8000, help="HTTP port")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    run(host=args.host, port=args.port)
