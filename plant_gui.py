import tkinter as tk
from tkinter import ttk, simpledialog, messagebox
import math
import random

def vary_color(hex_color, variance=15):
    hex_color = hex_color.lstrip('#')
    try:
        r, g, b = tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))
    except ValueError:
        r, g, b = 255, 255, 255
    
    shift = variance if variance < 0 else 0
    v = abs(variance)
    
    r = max(0, min(255, r + shift + random.randint(-v, v)))
    g = max(0, min(255, g + shift + random.randint(-v, v)))
    b = max(0, min(255, b + shift + random.randint(-v, v)))
    return f"#{r:02x}{g:02x}{b:02x}"

class Genome:
    def __init__(self, genotype=None):
        self.traits_meta = {
            "growth": {"dom": {"M": "monopodial", "s": "sympodial"}}, 
            "stem": {"dom": {"W": "woody", "h": "herbaceous"}},       
            "leaf_shape": {"dom": {"L": "lanceolate", "r": "round", "c": "cordate"}}, 
            "phyllotaxis": {"dom": {"A": "alternate", "o": "opposite", "w": "whorled"}},
            "inflorescence": {"dom": {"S": "single", "r": "raceme", "p": "panicle", "c": "cyme"}},
            "symmetry": {"dom": {"R": "radial", "z": "zygomorphic"}},
            "petal_count": {"dom": {"5": "five", "3": "three", "x": "many (8+)"}},
            "petal_shape": {"dom": {"R": "round", "P": "pointed", "F": "fringed"}},
            "sepals": {"dom": {"Y": "yes", "n": "no"}},
            "stamens": {"dom": {"F": "few (5)", "M": "many (20+)"}}
        }
        
        if genotype:
            self.traits = genotype
        else:
            self.traits = {
                "growth": {"alleles": ["M", "M"]},
                "stem": {"alleles": ["W", "h"]},
                "leaf_shape": {"alleles": ["L", "r"]},
                "phyllotaxis": {"alleles": ["A", "o"]},
                "inflorescence": {"alleles": ["S", "r"]},
                "symmetry": {"alleles": ["R", "z"]},
                "petal_count": {"alleles": ["5", "5"]},
                "petal_shape": {"alleles": ["R", "P"]},
                "sepals": {"alleles": ["Y", "Y"]},
                "stamens": {"alleles": ["F", "M"]},
                "color_r": {"alleles": [233, 200], "type": "polygenic"},
                "color_g": {"alleles": [69, 100], "type": "polygenic"},
                "color_b": {"alleles": [96, 150], "type": "polygenic"},
                "angle": {"alleles": [35, 45], "type": "polygenic"}
            }

    def randomize(self):
        for trait, meta in self.traits_meta.items():
            possible_alleles = list(meta["dom"].keys())
            self.traits[trait]["alleles"] = [random.choice(possible_alleles), random.choice(possible_alleles)]
        self.traits["color_r"]["alleles"] = [random.randint(0,255), random.randint(0,255)]
        self.traits["color_g"]["alleles"] = [random.randint(0,255), random.randint(0,255)]
        self.traits["color_b"]["alleles"] = [random.randint(0,255), random.randint(0,255)]
        self.traits["angle"]["alleles"] = [random.randint(15, 80), random.randint(15, 80)]

    def set_phenotype(self, trait, phenotype_value):
        if trait in self.traits_meta:
            for allele, pheno in self.traits_meta[trait]["dom"].items():
                if pheno == phenotype_value:
                    self.traits[trait]["alleles"] = [allele, allele]
                    break

    def get_phenotype(self):
        pheno = {}
        for trait, data in self.traits.items():
            if data.get("type") == "polygenic":
                val = (data["alleles"][0] + data["alleles"][1]) / 2.0
                if random.random() < 0.05: val += random.uniform(-15, 15)
                pheno[trait] = val
            else:
                a1, a2 = data["alleles"]
                dom_order = list(self.traits_meta[trait]["dom"].keys())
                winner = a1 if dom_order.index(a1) <= dom_order.index(a2) else a2
                if random.random() < 0.02: winner = random.choice(dom_order)
                pheno[trait] = self.traits_meta[trait]["dom"][winner]
        
        r, g, b = [max(0, min(255, int(pheno[c]))) for c in ["color_r", "color_g", "color_b"]]
        pheno["flower_color"] = f"#{r:02x}{g:02x}{b:02x}"
        return pheno

    def cross(self, other):
        child = {}
        for trait in self.traits:
            a1 = random.choice(self.traits[trait]["alleles"])
            a2 = random.choice(other.traits[trait]["alleles"])
            if self.traits[trait].get("type") == "polygenic" and random.random() < 0.1:
                a1 += random.uniform(-10, 10)
            child[trait] = self.traits[trait].copy()
            child[trait]["alleles"] = [a1, a2]
        return Genome(child)

class Node:
    def __init__(self, x, y, angle, type_, depth, pheno, side=1, max_len=40, v=1.0):
        self.x = x; self.y = y; self.angle = angle; self.type = type_
        self.depth = depth; self.side = side; self.children = []
        self.is_terminal = True
        self.pheno = pheno
        
        # Algorithmic Botany: Vegetativeness
        self.v = v 
        
        # Algorithmic Botany: Biomechanics base
        self.base_thickness = 1.0
        self.calculated_thickness = 1.0 
        self.mass = 1.0 # arbitrary mass unit
        
        if type_ in ['stem', 'root', 'flower_stalk']:
            base = "#8b4513" if pheno['stem'] == 'woody' else "#27ae60"
            self.color = vary_color(base, 20)
        elif type_ == 'leaf' or type_ == 'sepal':
            self.color = vary_color("#2ecc71", 15)
        elif type_.startswith('petal'):
            base = pheno['flower_color']
            if 'bottom' in type_: base = vary_color(base, -30)
            self.color = vary_color(base, 10)
        elif type_ == 'stamen':
            self.color = vary_color("#e67e22", 10)
        else:
            self.color = "#f1c40f"
            
        # Internode scaling based on Vegetativeness L(v) = L_max * (v/v_max)^p
        p_compress = 1.5 
        
        if type_ in ['stem', 'root']:
            self.length = max_len * (0.9 ** depth) * random.uniform(0.9, 1.1)
        elif type_ == 'flower_stalk' or type_ == 'stamen':
            # Floral internodes shrink as v approaches 0
            self.length = (max_len * 0.8) * (self.v ** p_compress) * random.uniform(0.8, 1.2)
        else:
            self.length = 0
            
        self.update_endpoints()

    def update_endpoints(self):
        self.end_x = self.x + math.cos(self.angle) * self.length
        self.end_y = self.y + math.sin(self.angle) * self.length

class PlantApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Flora-Scaper (Algorithmic Botany: PMT & Tropisms)")
        
        self.main_frame = tk.Frame(root, bg="#1a1a2e")
        self.main_frame.pack(fill=tk.BOTH, expand=True)
        
        self.canvas = tk.Canvas(self.main_frame, width=750, height=800, bg="#16213e", highlightthickness=0)
        self.canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        self.canvas.bind("<Button-1>", self.on_left_click)   
        self.canvas.bind("<Button-3>", self.on_right_click)  
        
        self.panel = tk.Frame(self.main_frame, width=320, bg="#0f3460", padx=10, pady=10)
        self.panel.pack(side=tk.RIGHT, fill=tk.Y)
        
        self.saved_plants = {"Wildtype": Genome()}
        self.current_genome = Genome()
        
        self.stem_var = tk.StringVar()
        self.growth_var = tk.StringVar()
        self.phyll_var = tk.StringVar()
        self.leaf_var = tk.StringVar()
        self.infl_var = tk.StringVar()
        self.sym_var = tk.StringVar()
        self.pcount_var = tk.StringVar()
        self.pshape_var = tk.StringVar()
        self.sepal_var = tk.StringVar()
        self.stamen_var = tk.StringVar()
        self.angle_var = tk.DoubleVar()
        
        self.build_gui()
        self.sync_ui_to_genome()
        self.root_node = None
        self.reset_plant()

    def build_gui(self):
        self.notebook = ttk.Notebook(self.panel)
        self.notebook.pack(fill=tk.BOTH, expand=True, pady=5)
        
        self.tab_plant = tk.Frame(self.notebook, bg="#1a1a2e", padx=5, pady=5)
        self.notebook.add(self.tab_plant, text="Plant DNA")
        
        self.create_dropdown(self.tab_plant, "Stem Type (Biomechanics):", self.stem_var, ["woody", "herbaceous"], "stem")
        self.create_dropdown(self.tab_plant, "Apical Dominance (Growth):", self.growth_var, ["monopodial", "sympodial"], "growth")
        self.create_dropdown(self.tab_plant, "Phyllotaxis:", self.phyll_var, ["alternate", "opposite", "whorled"], "phyllotaxis")
        self.create_dropdown(self.tab_plant, "Leaf Shape:", self.leaf_var, ["lanceolate", "round", "cordate"], "leaf_shape")
        
        ttk.Label(self.tab_plant, text="Branch Angle:", background="#1a1a2e", foreground="white").pack(anchor=tk.W)
        s = tk.Scale(self.tab_plant, variable=self.angle_var, from_=10, to=90, orient=tk.HORIZONTAL, bg="#1a1a2e", fg="white", highlightthickness=0)
        s.pack(fill=tk.X, pady=2)
        s.bind("<ButtonRelease-1>", lambda e: self.update_genome_from_ui())
        
        self.tab_flower = tk.Frame(self.notebook, bg="#1a1a2e", padx=5, pady=5)
        self.notebook.add(self.tab_flower, text="Flower Anatomy")
        
        self.create_dropdown(self.tab_flower, "Inflorescence Topology:", self.infl_var, ["single", "raceme", "panicle", "cyme"], "inflorescence")
        self.create_dropdown(self.tab_flower, "Symmetry:", self.sym_var, ["radial", "zygomorphic"], "symmetry")
        self.create_dropdown(self.tab_flower, "Petal Count:", self.pcount_var, ["three", "five", "many (8+)"], "petal_count")
        self.create_dropdown(self.tab_flower, "Petal Shape:", self.pshape_var, ["round", "pointed", "fringed"], "petal_shape")
        self.create_dropdown(self.tab_flower, "Sepals:", self.sepal_var, ["yes", "no"], "sepals")
        self.create_dropdown(self.tab_flower, "Stamens:", self.stamen_var, ["few (5)", "many (20+)"], "stamens")
        
        self.tab_breed = tk.Frame(self.notebook, bg="#1a1a2e", padx=5, pady=5)
        self.notebook.add(self.tab_breed, text="Breeding")
        
        tk.Button(self.tab_breed, text="💾 Save Current Strain", command=self.save_plant, bg="#f39c12", fg="white").pack(fill=tk.X, pady=10)
        self.p1_var = tk.StringVar(value="Wildtype"); self.p2_var = tk.StringVar(value="Wildtype")
        self.p1_menu = ttk.OptionMenu(self.tab_breed, self.p1_var, "Wildtype", "Wildtype"); self.p1_menu.pack(fill=tk.X, pady=5)
        self.p2_menu = ttk.OptionMenu(self.tab_breed, self.p2_var, "Wildtype", "Wildtype"); self.p2_menu.pack(fill=tk.X, pady=5)
        tk.Button(self.tab_breed, text="🧬 Crossbreed Parents!", command=self.crossbreed, bg="#e94560", fg="white", font=("Arial", 12, "bold")).pack(fill=tk.X, pady=15)
        
        tk.Button(self.panel, text="🎲 Randomize Genome", command=self.randomize_genome, bg="#9b59b6", fg="white", font=("Arial", 10, "bold")).pack(fill=tk.X, pady=5)
        tk.Button(self.panel, text="Plant New Seed", command=self.reset_plant, bg="#3498db", fg="white").pack(fill=tk.X, pady=2)
        tk.Button(self.panel, text="Grow All (Step)", command=self.grow_step, bg="#2ecc71", fg="white").pack(fill=tk.X, pady=2)
        tk.Button(self.panel, text="Auto Generate", command=self.auto_generate, bg="#e67e22", fg="white").pack(fill=tk.X, pady=2)

    def create_dropdown(self, parent, label, var, options, trait_key):
        ttk.Label(parent, text=label, background="#1a1a2e", foreground="white").pack(anchor=tk.W)
        menu = ttk.OptionMenu(parent, var, options[0], *options, command=lambda _: self.update_genome_from_ui(trait_key))
        menu.pack(fill=tk.X, pady=2)

    def sync_ui_to_genome(self):
        pheno = self.current_genome.get_phenotype()
        self.stem_var.set(pheno["stem"])
        self.growth_var.set(pheno["growth"])
        self.phyll_var.set(pheno["phyllotaxis"])
        self.leaf_var.set(pheno["leaf_shape"])
        self.infl_var.set(pheno["inflorescence"])
        self.sym_var.set(pheno["symmetry"])
        self.pcount_var.set(pheno["petal_count"])
        self.pshape_var.set(pheno["petal_shape"])
        self.sepal_var.set(pheno["sepals"])
        self.stamen_var.set(pheno["stamens"])
        self.angle_var.set(pheno["angle"])

    def update_genome_from_ui(self, changed_trait=None):
        pheno_map = {
            "stem": self.stem_var.get(), "growth": self.growth_var.get(), "phyllotaxis": self.phyll_var.get(),
            "leaf_shape": self.leaf_var.get(), "inflorescence": self.infl_var.get(), "symmetry": self.sym_var.get(),
            "petal_count": self.pcount_var.get(), "petal_shape": self.pshape_var.get(),
            "sepals": self.sepal_var.get(), "stamens": self.stamen_var.get()
        }
        if changed_trait: self.current_genome.set_phenotype(changed_trait, pheno_map[changed_trait])
        self.current_genome.traits["angle"]["alleles"] = [self.angle_var.get(), self.angle_var.get()]
        self.reset_plant()

    def randomize_genome(self):
        self.current_genome.randomize(); self.sync_ui_to_genome(); self.reset_plant()

    def save_plant(self):
        name = simpledialog.askstring("Save Plant", "Enter name for this strain:")
        if name:
            self.saved_plants[name] = self.current_genome
            self.update_menus()

    def update_menus(self):
        menu1 = self.p1_menu["menu"]; menu1.delete(0, "end")
        menu2 = self.p2_menu["menu"]; menu2.delete(0, "end")
        for p in self.saved_plants.keys():
            menu1.add_command(label=p, command=lambda value=p: self.p1_var.set(value))
            menu2.add_command(label=p, command=lambda value=p: self.p2_var.set(value))

    def crossbreed(self):
        p1 = self.p1_var.get(); p2 = self.p2_var.get()
        if p1 in self.saved_plants and p2 in self.saved_plants:
            self.current_genome = self.saved_plants[p1].cross(self.saved_plants[p2])
            self.sync_ui_to_genome(); self.reset_plant()
            messagebox.showinfo("Success", f"Crossed {p1} x {p2}!\nNew seed planted.")

    def reset_plant(self):
        pheno = self.current_genome.get_phenotype()
        self.root_node = Node(400, 750, -math.pi/2, 'root', 0, pheno)
        self.update_physics()
        self.draw()

    def get_all_nodes(self):
        nodes = []
        def traverse(n):
            nodes.append(n)
            for c in n.children: traverse(c)
        traverse(self.root_node)
        return nodes

    # ================= ALGORITHMIC BOTANY =================
    
    def calculate_da_vinci_thickness(self, node):
        """Pipe Model Theory: Parent cross-sectional area = sum of child areas"""
        if not node.children:
            node.calculated_thickness = 1.0
            return 1.0
            
        area_sum = 0
        n_exponent = 2.5 if node.pheno['stem'] == 'woody' else 2.0
        
        for c in node.children:
            child_rad = self.calculate_da_vinci_thickness(c)
            if c.type in ['stem', 'root', 'flower_stalk']:
                area_sum += child_rad ** n_exponent
                
        # Base thickness of 1 + supporting branches
        node.calculated_thickness = max(1.0, (area_sum ** (1.0/n_exponent)))
        return node.calculated_thickness

    def apply_gravitropism(self, node):
        """Bending moment applied to nodes: heavy branches sag, wood resists"""
        if node.type not in ['stem', 'root']: return
        
        # Herbaceous = low E (stiffness), bends easily. Woody = high E, bends little.
        E = 150.0 if node.pheno['stem'] == 'woody' else 20.0
        
        # Area moment of inertia I \propto D^4
        I = (node.calculated_thickness / 2.0) ** 4
        
        # Bending \propto Mass * Length^2 / (E * I). We simplify.
        # Deflection per step:
        sag = (0.05 * node.length) / (E * max(0.1, I))
        
        # Gravity vector is down (+Y). So angle moves towards +pi/2
        target_angle = math.pi/2
        
        # Apply slight bend
        if node.angle < target_angle:
            node.angle += sag
        elif node.angle > target_angle:
            node.angle -= sag
            
        # Update coordinates downstream
        node.update_endpoints()
        self.update_children_positions(node)

    def update_children_positions(self, node):
        for c in node.children:
            c.x = node.end_x; c.y = node.end_y
            if c.type not in ['leaf', 'flower', 'sepal', 'petal']:
                c.update_endpoints()
            self.update_children_positions(c)

    def update_physics(self):
        if not self.root_node: return
        self.calculate_da_vinci_thickness(self.root_node)
        # Apply bending top-down
        for n in self.get_all_nodes():
            self.apply_gravitropism(n)

    # ======================================================

    def grow_node(self, node):
        if not node.is_terminal or node.type not in ['stem', 'root']: return
        node.is_terminal = False
        rad_angle = math.radians(node.pheno['angle'])
        
        # Auxin/Apical Dominance abstraction
        term_chance = 0.8 if node.pheno['growth'] == "sympodial" else 0.3
        if node.depth > 7 or (node.depth > 3 and random.random() > term_chance):
            self.generate_inflorescence(node)
            return

        phy = node.pheno['phyllotaxis']
        if phy == "alternate": node.children.append(Node(node.end_x, node.end_y, node.angle + rad_angle*node.side, 'leaf', node.depth+1, node.pheno))
        elif phy == "opposite": 
            node.children.extend([Node(node.end_x, node.end_y, node.angle+rad_angle, 'leaf', node.depth+1, node.pheno), Node(node.end_x, node.end_y, node.angle-rad_angle, 'leaf', node.depth+1, node.pheno)])
        elif phy == "whorled":
            node.children.extend([Node(node.end_x, node.end_y, node.angle+rad_angle, 'leaf', node.depth+1, node.pheno), Node(node.end_x, node.end_y, node.angle-rad_angle, 'leaf', node.depth+1, node.pheno),
                                  Node(node.end_x, node.end_y, node.angle+math.pi/2, 'leaf', node.depth+1, node.pheno), Node(node.end_x, node.end_y, node.angle-math.pi/2, 'leaf', node.depth+1, node.pheno)])
            
        next_side = node.side * -1
        form = node.pheno['growth']
        if form == "monopodial":
            node.children.append(Node(node.end_x, node.end_y, node.angle + random.uniform(-0.1, 0.1), 'stem', node.depth+1, node.pheno, next_side))
            if random.random() > 0.3: node.children.append(Node(node.end_x, node.end_y, node.angle - rad_angle*node.side, 'stem', node.depth+1, node.pheno, next_side))
        elif form == "sympodial":
            node.children.extend([Node(node.end_x, node.end_y, node.angle+rad_angle, 'stem', node.depth+1, node.pheno, next_side), Node(node.end_x, node.end_y, node.angle-rad_angle, 'stem', node.depth+1, node.pheno, next_side)])

    def generate_detailed_flower(self, parent_node, x, y, angle, depth):
        pheno = parent_node.pheno
        if pheno['sepals'] == "yes":
            for i in range(5):
                parent_node.children.append(Node(x, y, angle + (math.pi*2/5)*i + (math.pi/5), 'sepal', depth+1, pheno))

        count = 5
        if pheno['petal_count'] == "three": count = 3
        elif pheno['petal_count'] == "many (8+)": count = random.randint(8, 14)
        
        if pheno['symmetry'] == "radial":
            for i in range(count): parent_node.children.append(Node(x, y, angle + (math.pi*2/count)*i, 'petal', depth+1, pheno))
        else:
            parent_node.children.extend([
                Node(x, y, angle, 'petal_bottom', depth+1, pheno),
                Node(x, y, angle-math.pi/3, 'petal_side', depth+1, pheno),
                Node(x, y, angle+math.pi/3, 'petal_side', depth+1, pheno),
                Node(x, y, angle+math.pi, 'petal_top', depth+1, pheno)
            ])
            
        stamen_count = 5 if pheno['stamens'] == "few (5)" else random.randint(15, 25)
        for i in range(stamen_count):
            parent_node.children.append(Node(x, y, angle + random.uniform(0, math.pi*2), 'stamen', depth+1, pheno, max_len=random.uniform(5, 12)))
            
        parent_node.children.append(Node(x, y, angle, 'carpel', depth+1, pheno))

    def grow_inflorescence_l_system(self, apex):
        """Topological grammar using the Vegetativeness parameter v"""
        # If v <= 0, floral transition is complete
        if apex.v <= 0:
            self.generate_detailed_flower(apex, apex.end_x, apex.end_y, apex.angle, apex.depth)
            apex.is_terminal = False
            return
            
        inf = apex.pheno['inflorescence']
        delta_v = 0.25 # decay rate
        
        if inf == "raceme":
            # A(v) -> I(L) [ + K ] A(v - delta)
            stalk = Node(apex.end_x, apex.end_y, apex.angle + random.uniform(-0.1, 0.1), 'flower_stalk', apex.depth+1, apex.pheno, v=apex.v)
            apex.children.append(stalk)
            
            # lateral flower (K)
            side_angle = apex.angle + (math.pi/2.5) * (1 if apex.depth%2==0 else -1)
            self.generate_detailed_flower(stalk, stalk.end_x, stalk.end_y, side_angle, apex.depth+1)
            
            # Next apex
            stalk.v = apex.v - delta_v
            apex.is_terminal = False
            
        elif inf == "panicle":
            # A(v) -> I(L) [ + B ] A(v - delta)
            stalk = Node(apex.end_x, apex.end_y, apex.angle + random.uniform(-0.1, 0.1), 'flower_stalk', apex.depth+1, apex.pheno, v=apex.v)
            apex.children.append(stalk)
            
            # lateral sub-branch B
            for i in range(random.randint(1, 2)):
                b_angle = apex.angle + random.uniform(-math.pi/3, math.pi/3)
                b_node = Node(stalk.end_x, stalk.end_y, b_angle, 'flower_stalk', apex.depth+1, apex.pheno, v=(apex.v - 0.4))
                stalk.children.append(b_node)
            
            stalk.v = apex.v - delta_v
            apex.is_terminal = False
            
        elif inf == "cyme":
            # A(v) -> I(L) [ + A(v-d) ] [ - A(v-d) ] K
            # Apex terminates immediately in flower
            self.generate_detailed_flower(apex, apex.end_x, apex.end_y, apex.angle, apex.depth)
            
            # Lateral axes resume growth
            a1 = Node(apex.end_x, apex.end_y, apex.angle + math.pi/3, 'flower_stalk', apex.depth+1, apex.pheno, v=apex.v - delta_v)
            a2 = Node(apex.end_x, apex.end_y, apex.angle - math.pi/3, 'flower_stalk', apex.depth+1, apex.pheno, v=apex.v - delta_v)
            apex.children.extend([a1, a2])
            apex.is_terminal = False
            
        elif inf == "single":
            apex.v = 0
            self.generate_detailed_flower(apex, apex.end_x, apex.end_y, apex.angle, apex.depth)
            apex.is_terminal = False

    def generate_inflorescence(self, node):
        node.type = 'flower_stalk'
        node.v = 1.0 # Initialize vegetativeness
        self.grow_inflorescence_l_system(node)

    def grow_step(self):
        nodes = self.get_all_nodes()
        active = [n for n in nodes if n.is_terminal and n.type in ['stem', 'root', 'flower_stalk']]
        for n in active:
            if n.type == 'flower_stalk':
                self.grow_inflorescence_l_system(n)
            else:
                self.grow_node(n)
        self.update_physics()
        self.draw()

    def auto_generate(self):
        for _ in range(7):
            self.grow_step()

    def get_closest_node(self, x, y):
        nodes = self.get_all_nodes()
        closest = None; min_dist = 20
        for n in nodes:
            dist = math.hypot(n.end_x - x, n.end_y - y)
            if dist < min_dist: min_dist = dist; closest = n
        return closest

    def on_left_click(self, e):
        n = self.get_closest_node(e.x, e.y)
        if n and n.is_terminal:
            if n.type == 'flower_stalk': self.grow_inflorescence_l_system(n)
            else: self.grow_node(n)
            self.update_physics()
            self.draw()

    def on_right_click(self, e):
        n = self.get_closest_node(e.x, e.y)
        if n and n != self.root_node:
            for p in self.get_all_nodes():
                if n in p.children: p.children.remove(n); p.is_terminal = True; break
            self.update_physics()
            self.draw()

    def draw_rotated_poly(self, x, y, angle, pts, fill):
        res = []
        cos_a = math.cos(angle); sin_a = math.sin(angle)
        for px, py in pts: res.extend([px*cos_a - py*sin_a + x, px*sin_a + py*cos_a + y])
        self.canvas.create_polygon(*res, fill=fill, outline="")

    def draw(self):
        self.canvas.delete("all")
        self.canvas.create_line(0, 750, 800, 750, fill="#0f3460", width=4)
        nodes = self.get_all_nodes()
        
        # 1. Stems (Using Da Vinci calculated_thickness)
        for n in nodes:
            if n.type in ['stem', 'root', 'flower_stalk']:
                w = n.calculated_thickness * 2.0
                if n.type == 'flower_stalk': w = max(1, w * 0.4)
                self.canvas.create_line(n.x, n.y, n.end_x, n.end_y, fill=n.color, width=w, capstyle=tk.ROUND)
        
        for n in nodes:
            if n.type == 'leaf':
                s = 25*(0.9**n.depth)
                shape = n.pheno['leaf_shape']
                if shape == "round":
                    cx = n.x + math.cos(n.angle)*s/2; cy = n.y + math.sin(n.angle)*s/2
                    self.canvas.create_oval(cx-s/2, cy-s/2, cx+s/2, cy+s/2, fill=n.color, outline="")
                elif shape == "cordate":
                    self.draw_rotated_poly(n.x, n.y, n.angle, [(0,-s/4), (s/2,s/4), (s,0), (s/2,-s/2)], fill=n.color)
                else:
                    self.draw_rotated_poly(n.x, n.y, n.angle, [(0,0), (s,s/4), (s*2,0), (s,-s/4)], fill=n.color)
            elif n.type == 'sepal':
                s = max(3, 10*(0.85**(n.depth-2)))
                self.draw_rotated_poly(n.x, n.y, n.angle, [(0,0), (s,s/4), (s*2,0), (s,-s/4)], fill=n.color)
                
        for n in nodes:
            if n.type.startswith('petal'):
                s = max(5, 18*(0.85**(n.depth-2)))
                shape = n.pheno['petal_shape']
                if shape == "round":
                    cx = n.x + math.cos(n.angle)*s/1.5; cy = n.y + math.sin(n.angle)*s/1.5
                    self.canvas.create_oval(cx-s/1.5, cy-s/2, cx+s/1.5, cy+s/2, fill=n.color, outline="")
                elif shape == "fringed":
                    self.draw_rotated_poly(n.x, n.y, n.angle, [(0,0), (s,s/2), (s*1.2,s/4), (s*0.8,0), (s*1.2,-s/4), (s,-s/2)], fill=n.color)
                else: # pointed
                    if 'bottom' in n.type: self.draw_rotated_poly(n.x, n.y, n.angle, [(0,0), (s*1.5,s/2), (s*2.5,0), (s*1.5,-s/2)], fill=n.color)
                    else: self.draw_rotated_poly(n.x, n.y, n.angle, [(0,0), (s,s/3), (s*1.5,0), (s,-s/3)], fill=n.color)
        
        for n in nodes:
            if n.type == 'stamen':
                self.canvas.create_line(n.x, n.y, n.end_x, n.end_y, fill="#e67e22", width=1)
                self.canvas.create_oval(n.end_x-1, n.end_y-1, n.end_x+1, n.end_y+1, fill="#d35400", outline="")
            elif n.type == 'carpel':
                self.canvas.create_oval(n.x-2, n.y-2, n.x+2, n.y+2, fill="#f1c40f", outline="")
                
        for n in nodes:
            if n.is_terminal and n.type in ['stem', 'root', 'flower_stalk']:
                self.canvas.create_oval(n.end_x-3, n.end_y-3, n.end_x+3, n.end_y+3, fill="white", outline="#3498db", width=2)

if __name__ == "__main__":
    root = tk.Tk()
    root.geometry("1100x800")
    app = PlantApp(root)
    root.mainloop()
