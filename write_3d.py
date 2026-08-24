import os

html = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>3D Theoretical Plant Generator</title>
    <style>
        body { margin: 0; overflow: hidden; background-color: #1a1a2e; color: #fff; font-family: sans-serif; }
        #info { position: absolute; top: 10px; left: 10px; z-index: 100; pointer-events: none; }
        h1 { margin: 0 0 5px 0; font-size: 20px; text-shadow: 1px 1px 2px #000; }
        p { margin: 0; font-size: 12px; opacity: 0.8; }
    </style>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/dat-gui/0.7.9/dat.gui.min.js"></script>
</head>
<body>
    <div id="info">
        <h1>3D Botanik Engine</h1>
        <p>Left Click: Rotate | Right Click: Pan | Scroll: Zoom</p>
    </div>
    <script src="plant_3d.js"></script>
</body>
</html>
"""

js = """
// 3D Plant Generator using Three.js
let scene, camera, renderer, controls;
let plantGroup;

const params = {
    iterations: 4,
    growthType: "Monopodial",
    phyllotaxis: "Alternate",
    branchAngle: 25,
    lengthMultiplier: 0.7,
    thickness: 1.0,
    stemColor: "#4caf50",
    leafColor: "#2e7d32",
    flowerColor: "#ff4081",
    generate: function() { generatePlant(); }
};

let system = { axiom: "X", rules: {}, sentence: "" };

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    scene.fog = new THREE.Fog(0x1a1a2e, 10, 100);

    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 30, 50);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 15, 0);

    // Lights
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
    hemiLight.position.set(0, 50, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(20, 40, 20);
    dirLight.castShadow = true;
    scene.add(dirLight);

    // Ground
    const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(100, 100),
        new THREE.MeshStandardMaterial({ color: 0x222233 })
    );
    plane.rotation.x = -Math.PI / 2;
    plane.receiveShadow = true;
    scene.add(plane);

    plantGroup = new THREE.Group();
    scene.add(plantGroup);

    setupGUI();
    generatePlant();

    window.addEventListener('resize', onWindowResize);
    animate();
}

function setupGUI() {
    const gui = new dat.GUI();
    let f1 = gui.addFolder('Botanik & Struktur');
    f1.add(params, 'iterations', 1, 6).step(1).onFinishChange(generatePlant);
    f1.add(params, 'growthType', ["Monopodial", "Sympodial"]).onChange(generatePlant);
    f1.add(params, 'phyllotaxis', ["Alternate", "Opposite", "Whorled"]).onChange(generatePlant);
    f1.open();

    let f2 = gui.addFolder('Geometrie');
    f2.add(params, 'branchAngle', 10, 90).onChange(generatePlant);
    f2.add(params, 'lengthMultiplier', 0.5, 0.9).onChange(generatePlant);
    f2.add(params, 'thickness', 0.2, 2.0).onChange(generatePlant);
    f2.open();

    let f3 = gui.addFolder('Farben');
    f3.addColor(params, 'stemColor').onChange(generatePlant);
    f3.addColor(params, 'leafColor').onChange(generatePlant);
    f3.addColor(params, 'flowerColor').onChange(generatePlant);
    f3.open();
}

function buildRules() {
    system.rules = {};
    if (params.phyllotaxis === "Alternate") {
        system.rules["X"] = "F[+L][-Y]F[^X][vY]X";
        system.rules["Y"] = "F[-L][+X]F[vY][^X]Y";
    } else if (params.phyllotaxis === "Opposite") {
        system.rules["X"] = "F[+L][-L][^Y][vY]X";
        system.rules["Y"] = "F[+L][-L][^X][vX]Y";
    } else { // Whorled
        system.rules["X"] = "F[+L][-L][^L][vL]FX";
    }

    if (params.growthType === "Sympodial") {
        system.rules["X"] = "F[+X][-X][^X][vX]";
    }
}

function evaluateLSystem() {
    system.sentence = system.axiom;
    for (let i = 0; i < params.iterations; i++) {
        let next = "";
        for (let char of system.sentence) {
            next += system.rules[char] || char;
        }
        system.sentence = next;
    }
}

function generatePlant() {
    // Clear old plant
    while(plantGroup.children.length > 0){ 
        let child = plantGroup.children[0];
        if(child.geometry) child.geometry.dispose();
        if(child.material) child.material.dispose();
        plantGroup.remove(child); 
    }

    buildRules();
    evaluateLSystem();

    // Turtle variables
    let state = [];
    let pos = new THREE.Vector3(0, 0, 0);
    let dir = new THREE.Vector3(0, 1, 0);
    let right = new THREE.Vector3(1, 0, 0);
    let up = new THREE.Vector3(0, 0, -1);
    
    let length = 10.0 / params.iterations;
    let radius = params.thickness;
    let rad = THREE.MathUtils.degToRad(params.branchAngle);

    const stemMat = new THREE.MeshStandardMaterial({ color: params.stemColor, roughness: 0.8 });
    const leafMat = new THREE.MeshStandardMaterial({ color: params.leafColor, side: THREE.DoubleSide, roughness: 0.6 });
    const flowerMat = new THREE.MeshStandardMaterial({ color: params.flowerColor, roughness: 0.3 });

    const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 8);
    cylGeo.translate(0, 0.5, 0); // pivot at base

    for (let char of system.sentence) {
        if (char === 'F') {
            // Draw cylinder
            let mesh = new THREE.Mesh(cylGeo, stemMat);
            mesh.scale.set(radius, length, radius);
            
            // Align mesh to dir
            let quaternion = new THREE.Quaternion();
            quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir);
            mesh.position.copy(pos);
            mesh.quaternion.copy(quaternion);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            plantGroup.add(mesh);

            // Move pos
            pos.addScaledVector(dir, length);
        } else if (char === '+') { // Yaw right
            dir.applyAxisAngle(up, rad);
            right.applyAxisAngle(up, rad);
        } else if (char === '-') { // Yaw left
            dir.applyAxisAngle(up, -rad);
            right.applyAxisAngle(up, -rad);
        } else if (char === '^') { // Pitch up
            dir.applyAxisAngle(right, rad);
            up.applyAxisAngle(right, rad);
        } else if (char === 'v') { // Pitch down
            dir.applyAxisAngle(right, -rad);
            up.applyAxisAngle(right, -rad);
        } else if (char === '[') {
            state.push({
                pos: pos.clone(),
                dir: dir.clone(),
                right: right.clone(),
                up: up.clone(),
                len: length,
                rad: radius
            });
            length *= params.lengthMultiplier;
            radius *= 0.7;
        } else if (char === ']') {
            let s = state.pop();
            pos.copy(s.pos);
            dir.copy(s.dir);
            right.copy(s.right);
            up.copy(s.up);
            length = s.len;
            radius = s.rad;
        } else if (char === 'L') {
            // Draw a simple leaf
            const leafGeo = new THREE.SphereGeometry(radius * 3, 8, 8);
            leafGeo.scale(1, 0.2, 2);
            let mesh = new THREE.Mesh(leafGeo, leafMat);
            mesh.position.copy(pos);
            plantGroup.add(mesh);
        } else if (char === 'B' || char === 'X' || char === 'Y') {
             // Draw terminal nodes as small flowers if at the end of growth
             if(Math.random() > 0.8) {
                 const fGeo = new THREE.DodecahedronGeometry(radius * 4);
                 let mesh = new THREE.Mesh(fGeo, flowerMat);
                 mesh.position.copy(pos);
                 plantGroup.add(mesh);
             }
        }
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

init();
"""

with open('/home/martin/theoretical_plant_generator/index_3d.html', 'w') as f: f.write(html)
with open('/home/martin/theoretical_plant_generator/plant_3d.js', 'w') as f: f.write(js)
