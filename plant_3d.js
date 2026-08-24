// 3D Plant Generator using Three.js - High Botanical Detail
let scene, camera, renderer, controls;
let plantGroup;

const params = {
    // Habitus
    wuchsform: "Aufrecht", // Aufrecht, Kriechend, Hängend
    
    // Sprossachse
    iterations: 4,
    thickness: 1.0,
    lengthMultiplier: 0.7,
    branchAngle: 25,
    
    // Blätter
    blattstellung: "Wechselständig", // Wechselständig, Gegenständig, Quirlständig
    blattform: "Lanzettlich", // Lanzettlich, Herzförmig, Eiförmig
    
    // Blüten
    bluetenstand: "Einzelblüte", // Einzelblüte, Traube, Dolde
    symmetrie: "Radiär", // Radiär, Zygomorph
    
    // Farben
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
    camera.position.set(0, 40, 60);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 15, 0);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
    hemiLight.position.set(0, 50, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(20, 40, 20);
    dirLight.castShadow = true;
    scene.add(dirLight);

    const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(200, 200),
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
    const gui = new dat.GUI({width: 300});
    
    let f1 = gui.addFolder('Habitus & Spross');
    f1.add(params, 'wuchsform', ["Aufrecht", "Kriechend", "Hängend"]).onChange(generatePlant);
    f1.add(params, 'iterations', 1, 6).step(1).onChange(generatePlant);
    f1.add(params, 'thickness', 0.2, 2.0).onChange(generatePlant);
    f1.add(params, 'lengthMultiplier', 0.5, 0.9).onChange(generatePlant);
    f1.add(params, 'branchAngle', 10, 90).onChange(generatePlant);
    f1.open();

    let f2 = gui.addFolder('Blätter');
    f2.add(params, 'blattstellung', ["Wechselständig", "Gegenständig", "Quirlständig"]).onChange(generatePlant);
    f2.add(params, 'blattform', ["Lanzettlich", "Herzförmig", "Eiförmig"]).onChange(generatePlant);
    f2.open();
    
    let f3 = gui.addFolder('Blüten');
    f3.add(params, 'bluetenstand', ["Einzelblüte", "Traube", "Dolde"]).onChange(generatePlant);
    f3.add(params, 'symmetrie', ["Radiär", "Zygomorph"]).onChange(generatePlant);
    f3.open();

    let f4 = gui.addFolder('Farben');
    f4.addColor(params, 'stemColor').onChange(generatePlant);
    f4.addColor(params, 'leafColor').onChange(generatePlant);
    f4.addColor(params, 'flowerColor').onChange(generatePlant);
}

function buildRules() {
    system.rules = {};
    // L = Leaf, X/Y = Growth nodes, B = Flower base
    if (params.blattstellung === "Wechselständig") {
        system.rules["X"] = "F[+L][-Y]F[^X][vY]X";
        system.rules["Y"] = "F[-L][+X]F[vY][^X]Y";
    } else if (params.blattstellung === "Gegenständig") {
        system.rules["X"] = "F[+L][-L][^Y][vY]X";
        system.rules["Y"] = "F[+L][-L][^X][vX]Y";
    } else { // Quirlständig (Whorled)
        system.rules["X"] = "F[+L][-L][^L][vL]FX";
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
    
    // Inflorescence (Blütenstand) modifications at terminal nodes
    let finalSentence = "";
    for (let char of system.sentence) {
        if (char === 'X' || char === 'Y') {
            if (params.bluetenstand === "Einzelblüte") finalSentence += "B";
            else if (params.bluetenstand === "Traube") finalSentence += "F[+B][-B]F[+B][-B]B";
            else if (params.bluetenstand === "Dolde") finalSentence += "[+B][-B][^B][vB]B";
        } else {
            finalSentence += char;
        }
    }
    system.sentence = finalSentence;
}

function createLeafGeometry() {
    const geo = new THREE.BufferGeometry();
    let vertices = [];
    let indices = [];
    
    if (params.blattform === "Lanzettlich") {
        vertices = [
            0, 0, 0,
            -0.5, 1, 0,
            0.5, 1, 0,
            0, 3, 0
        ];
        indices = [0,2,1, 1,2,3];
    } else if (params.blattform === "Herzförmig") {
        vertices = [
            0, 0, 0,
            -1.5, 1.5, 0,
            1.5, 1.5, 0,
            -1, 2.5, 0,
            1, 2.5, 0,
            0, 1.5, 0 // indent
        ];
        indices = [0,2,1, 1,5,3, 2,4,5, 1,2,5];
    } else { // Eiförmig (Ovate)
        vertices = [
            0, 0, 0,
            -1, 1, 0,
            1, 1, 0,
            0, 2.5, 0
        ];
        indices = [0,2,1, 1,2,3];
    }
    
    geo.setIndex(indices);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.computeVertexNormals();
    return geo;
}

function generatePlant() {
    while(plantGroup.children.length > 0){ 
        let child = plantGroup.children[0];
        if(child.geometry) child.geometry.dispose();
        if(child.material) child.material.dispose();
        plantGroup.remove(child); 
    }

    buildRules();
    evaluateLSystem();

    let state = [];
    let pos = new THREE.Vector3(0, 0, 0);
    
    // Habitus Base Orientation
    let dir = new THREE.Vector3(0, 1, 0);
    let right = new THREE.Vector3(1, 0, 0);
    let up = new THREE.Vector3(0, 0, -1);
    
    if (params.wuchsform === "Kriechend") {
        // Starts growing horizontally
        dir.set(1, 0, 0);
        right.set(0, 0, -1);
        up.set(0, 1, 0);
    } else if (params.wuchsform === "Hängend") {
        // Starts growing outwards and slightly down
        dir.set(0.5, 0.5, 0).normalize();
    }
    
    let length = 15.0 / params.iterations;
    let radius = params.thickness;
    let rad = THREE.MathUtils.degToRad(params.branchAngle);

    const stemMat = new THREE.MeshStandardMaterial({ color: params.stemColor, roughness: 0.9 });
    const leafMat = new THREE.MeshStandardMaterial({ color: params.leafColor, side: THREE.DoubleSide, roughness: 0.5 });
    const flowerMat = new THREE.MeshStandardMaterial({ color: params.flowerColor, side: THREE.DoubleSide, roughness: 0.3 });

    const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 6);
    cylGeo.translate(0, 0.5, 0);
    
    const leafGeo = createLeafGeometry();
    
    // Gravity vector for weeping willow effect (Hängend)
    const gravity = new THREE.Vector3(0, -0.15, 0);

    for (let char of system.sentence) {
        // Tropism (Phototropismus oder Gravitropismus)
        if (params.wuchsform === "Hängend" && char === 'F') {
            dir.add(gravity).normalize();
            // Need to orthogonalize right and up
            right.crossVectors(up, dir).normalize();
            up.crossVectors(dir, right).normalize();
        } else if (params.wuchsform === "Kriechend" && char === 'F') {
            // Slight gravity so it hugs the floor, but doesn't go below y=0
            if (pos.y > 0.5) {
                dir.add(new THREE.Vector3(0, -0.1, 0)).normalize();
                right.crossVectors(up, dir).normalize();
                up.crossVectors(dir, right).normalize();
            } else {
                dir.y = 0; dir.normalize();
            }
        }
        
        if (char === 'F') {
            let mesh = new THREE.Mesh(cylGeo, stemMat);
            mesh.scale.set(radius, length, radius);
            
            let quaternion = new THREE.Quaternion();
            // align Y-axis of cylinder to 'dir'
            let defaultDir = new THREE.Vector3(0,1,0);
            quaternion.setFromUnitVectors(defaultDir, dir);
            
            mesh.position.copy(pos);
            mesh.quaternion.copy(quaternion);
            mesh.castShadow = true;
            plantGroup.add(mesh);

            pos.addScaledVector(dir, length);
        } else if (char === '+') { dir.applyAxisAngle(up, rad); right.applyAxisAngle(up, rad);
        } else if (char === '-') { dir.applyAxisAngle(up, -rad); right.applyAxisAngle(up, -rad);
        } else if (char === '^') { dir.applyAxisAngle(right, rad); up.applyAxisAngle(right, rad);
        } else if (char === 'v') { dir.applyAxisAngle(right, -rad); up.applyAxisAngle(right, -rad);
        } else if (char === '[') {
            state.push({ pos: pos.clone(), dir: dir.clone(), right: right.clone(), up: up.clone(), len: length, rad: radius });
            length *= params.lengthMultiplier;
            radius *= 0.7;
        } else if (char === ']') {
            let s = state.pop();
            pos.copy(s.pos); dir.copy(s.dir); right.copy(s.right); up.copy(s.up);
            length = s.len; radius = s.rad;
        } else if (char === 'L') {
            let mesh = new THREE.Mesh(leafGeo, leafMat);
            let leafScale = radius * 4;
            mesh.scale.set(leafScale, leafScale, leafScale);
            
            let quaternion = new THREE.Quaternion();
            // Bend the leaf slightly away from the stem
            let leafDir = dir.clone().applyAxisAngle(right, Math.PI/4);
            quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), leafDir);
            
            mesh.position.copy(pos);
            mesh.quaternion.copy(quaternion);
            plantGroup.add(mesh);
        } else if (char === 'B') {
            if (Math.random() > 0.3) { // 70% chance to actually bloom to avoid clutter
                drawFlower3D(pos, dir, right, up, radius, flowerMat);
            }
        }
    }
}

function drawFlower3D(pos, dir, right, up, radius, mat) {
    let size = radius * 6;
    let group = new THREE.Group();
    group.position.copy(pos);
    
    // Align group to dir
    let quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir);
    group.quaternion.copy(quaternion);
    
    const petalGeo = new THREE.CircleGeometry(size/2, 16);
    petalGeo.translate(0, size/2, 0); // shift pivot
    
    if (params.symmetrie === "Radiär") {
        for(let i=0; i<5; i++) {
            let petal = new THREE.Mesh(petalGeo, mat);
            petal.rotation.y = (Math.PI * 2 / 5) * i;
            petal.rotation.x = Math.PI / 4; // open outwards
            group.add(petal);
        }
    } else {
        // Zygomorph (Bilateral - Orchid/Snapdragon)
        // Top hood
        let top = new THREE.Mesh(petalGeo, mat);
        top.rotation.x = Math.PI / 6;
        top.scale.set(1.2, 1.5, 1);
        group.add(top);
        
        // Two side wings
        let left = new THREE.Mesh(petalGeo, mat);
        left.rotation.y = Math.PI / 2;
        left.rotation.x = Math.PI / 3;
        left.scale.set(0.8, 1, 1);
        group.add(left);
        
        let rightPetal = new THREE.Mesh(petalGeo, mat);
        rightPetal.rotation.y = -Math.PI / 2;
        rightPetal.rotation.x = Math.PI / 3;
        rightPetal.scale.set(0.8, 1, 1);
        group.add(rightPetal);
        
        // Bottom lip
        let bottom = new THREE.Mesh(petalGeo, mat);
        bottom.rotation.y = Math.PI;
        bottom.rotation.x = Math.PI / 2;
        bottom.scale.set(1.5, 1, 1);
        group.add(bottom);
    }
    
    // Center stigma/anthers
    const center = new THREE.Mesh(new THREE.SphereGeometry(size/4), new THREE.MeshStandardMaterial({color: 0xffd700}));
    group.add(center);
    
    plantGroup.add(group);
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
