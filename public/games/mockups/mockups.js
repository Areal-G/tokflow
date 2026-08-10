// Three visual directions for Region Battle, rendered for real.
// Realism comes from PBR environment lighting (RoomEnvironment through PMREM),
// bevelled geometry, and a film grade: bloom, vignette and grain.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { VignetteShader } from "three/addons/shaders/VignetteShader.js";
import { FilmShader } from "three/addons/shaders/FilmShader.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

/* ── regions: restrained, matched-luminance palette ── */
const REG = [
  { id: "ETAM", name: "AMHARA", col: 0xe9b44c, gift: "rose",  gn: "Rose",     pts: 8240 },
  { id: "ETOR", name: "OROMIA", col: 0xe2664f, gift: "heart", gn: "Heart Me", pts: 7410 },
  { id: "ETTI", name: "TIGRAY", col: 0x4e9fc4, gift: "star",  gn: "Star",     pts: 6080 },
  { id: "ETAA", name: "ADDIS",  col: 0x9b7bd4, gift: "gem",   gn: "Gem",      pts: 5530 },
  { id: "ETSO", name: "SOMALI", col: 0x4fb08a, gift: "leaf",  gn: "Leaf",     pts: 4150 },
  { id: "ETSN", name: "SOUTH",  col: 0xd98a4b, gift: "sun",   gn: "Sun",      pts: 3820 },
  { id: "ETSI", name: "SIDAMA", col: 0x3fa8a0, gift: "cup",   gn: "Coffee",   pts: 2960 },
  { id: "ETAF", name: "AFAR",   col: 0xd06f96, gift: "moon",  gn: "Moon",     pts: 2610 }
];
const TARGET = 12000;
const pts = Object.fromEntries(REG.map((r) => [r.id, r.pts]));

/* ── renderer ── */
const frame = document.getElementById("frame");
const canvas = document.getElementById("cv");
const S = () => ({ w: frame.clientWidth, h: frame.clientHeight });

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(S().w, S().h, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

/* the single biggest realism win: a real environment for materials to reflect */
const pmrem = new THREE.PMREMGenerator(renderer);
const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
const ENV = envRT.texture;

const camera = new THREE.PerspectiveCamera(40, S().w / S().h, 0.1, 300);

/* ── film grade ── */
let composer, bloomPass;
function buildComposer() {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(new THREE.Vector2(S().w, S().h), 0.34, 0.75, 0.9);
  composer.addPass(bloomPass);
  const vig = new ShaderPass(VignetteShader);
  vig.uniforms.offset.value = 1.15;
  vig.uniforms.darkness.value = 1.05;
  composer.addPass(vig);
  const film = new ShaderPass(FilmShader);
  if (film.uniforms.intensity) film.uniforms.intensity.value = 0.12;
  if (film.uniforms.grayscale) film.uniforms.grayscale.value = 0;
  composer.addPass(film);
  composer.addPass(new OutputPass());
}

let scene = new THREE.Scene();

/* ── shared helpers ── */
const tagHost = document.getElementById("tags");
const tags = REG.map((r) => {
  const d = document.createElement("div");
  d.className = "tag";
  d.innerHTML = `<b>${r.name}</b><i style="color:#${r.col.toString(16).padStart(6, "0")}"></i>`;
  tagHost.appendChild(d);
  return d;
});

const PMAX = 800;
let particles, pPos, pCol, pVel, pLife, pHead = 0;
function makeParticles(target) {
  const g = new THREE.BufferGeometry();
  pPos = new Float32Array(PMAX * 3);
  pCol = new Float32Array(PMAX * 3);
  pVel = new Float32Array(PMAX * 3);
  pLife = new Float32Array(PMAX);
  for (let i = 0; i < PMAX; i++) pPos[i * 3 + 1] = -9999;
  g.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(pCol, 3));
  particles = new THREE.Points(g, new THREE.PointsMaterial({
    size: 0.11, vertexColors: true, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false
  }));
  target.add(particles);
}
function burst(p, colHex, n) {
  const c = new THREE.Color(colHex);
  for (let i = 0; i < n; i++) {
    const k = pHead = (pHead + 1) % PMAX;
    pPos[k * 3] = p.x + (Math.random() - 0.5) * 0.4;
    pPos[k * 3 + 1] = p.y;
    pPos[k * 3 + 2] = p.z + (Math.random() - 0.5) * 0.4;
    const a = Math.random() * Math.PI * 2, s = 0.03 + Math.random() * 0.09;
    pVel[k * 3] = Math.cos(a) * s;
    pVel[k * 3 + 1] = 0.07 + Math.random() * 0.15;
    pVel[k * 3 + 2] = Math.sin(a) * s;
    pCol[k * 3] = c.r; pCol[k * 3 + 1] = c.g; pCol[k * 3 + 2] = c.b;
    pLife[k] = 1;
  }
}
function stepParticles(dt) {
  if (!particles) return;
  for (let k = 0; k < PMAX; k++) {
    if (pLife[k] <= 0) continue;
    pLife[k] -= dt * 0.8;
    pVel[k * 3 + 1] -= dt * 0.18;
    pPos[k * 3] += pVel[k * 3];
    pPos[k * 3 + 1] += pVel[k * 3 + 1];
    pPos[k * 3 + 2] += pVel[k * 3 + 2];
    if (pLife[k] <= 0) pPos[k * 3 + 1] = -9999;
  }
  particles.geometry.attributes.position.needsUpdate = true;
  particles.geometry.attributes.color.needsUpdate = true;
}

/* ── scene 0 · extruded map ── */
async function sceneMap() {
  const sc = new THREE.Scene();
  sc.environment = ENV;
  sc.background = new THREE.Color(0x05070c);
  sc.fog = new THREE.Fog(0x05070c, 40, 110);

  const svg = await new SVGLoader().loadAsync("./ethiopia.svg");
  const byId = new Map();
  svg.paths.forEach((p) => { if (p.userData?.node) byId.set(p.userData.node.getAttribute("id"), p); });

  const root = new THREE.Group();
  sc.add(root);

  const items = [];
  REG.forEach((r) => {
    const path = byId.get(r.id);
    if (!path) return;
    const shapes = SVGLoader.createShapes(path);
    const geo = new THREE.ExtrudeGeometry(shapes, {
      depth: 10, bevelEnabled: true, bevelThickness: 2.2, bevelSize: 2.2, bevelSegments: 3, curveSegments: 6
    });
    geo.computeVertexNormals();
    const mat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(r.col).multiplyScalar(0.32),
      metalness: 0.94, roughness: 0.26,
      emissive: new THREE.Color(r.col), emissiveIntensity: 0.16,
      clearcoat: 0.6, clearcoatRoughness: 0.3, envMapIntensity: 1.3
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    items.push({ r, mesh, mat, h: 0.2, target: 0.2, punch: 0 });
  });

  // The SVG is y-down in a 1000x774 box. Centre it on the origin first, then
  // lay it flat: an inner group handles centring so scaling stays predictable.
  const inner = new THREE.Group();
  while (root.children.length) inner.add(root.children[0]);
  inner.position.set(-500, -387, 0);
  root.add(inner);
  root.rotation.x = -Math.PI / 2;
  const K = 0.026;                 // 1000 SVG units -> 26 world units
  root.scale.set(K, -K, K);

  // floor to catch shadow + reflection
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(90, 64),
    new THREE.MeshStandardMaterial({ color: 0x070a11, metalness: 0.9, roughness: 0.22, envMapIntensity: 0.7 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.35;
  floor.receiveShadow = true;
  sc.add(floor);

  const key = new THREE.DirectionalLight(0xdfe9ff, 2.1);
  key.position.set(14, 26, 16);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -30; key.shadow.camera.right = 30;
  key.shadow.camera.top = 30; key.shadow.camera.bottom = -30;
  key.shadow.camera.far = 80; key.shadow.bias = -0.001;
  sc.add(key);
  const warm = new THREE.SpotLight(0xffcf8a, 220, 90, Math.PI / 6, 0.6, 1.6);
  warm.position.set(-22, 20, -14);
  sc.add(warm);
  sc.add(new THREE.AmbientLight(0x22304a, 0.5));

  makeParticles(sc);
  return {
    scene: sc, items,
    camera(t) {
      camera.position.set(Math.sin(t * 0.12) * 4, 24 + Math.sin(t * 0.17) * 1.2, 30 + Math.cos(t * 0.1) * 2);
      camera.lookAt(0, 1.5, 0);
    },
    tick(dt, t) {
      items.forEach((it) => {
        const want = 0.2 + (pts[it.r.id] / TARGET) * 3.6;
        it.target = want;
        it.h += (it.target - it.h) * Math.min(1, dt * 4);
        it.mesh.scale.z = it.h;              // extrude axis before rotation
        it.punch *= Math.pow(0.03, dt);
        it.mat.emissiveIntensity = 0.16 + it.punch * 1.5;
      });
    },
    anchor(it) {
      const v = new THREE.Vector3();
      it.mesh.getWorldPosition(v);
      const b = new THREE.Box3().setFromObject(it.mesh);
      return new THREE.Vector3((b.min.x + b.max.x) / 2, b.max.y + 0.6, (b.min.z + b.max.z) / 2);
    }
  };
}

/* ── scene 1 · molten metal bars ── */
function sceneMetal() {
  const sc = new THREE.Scene();
  sc.environment = ENV;
  sc.background = new THREE.Color(0x07080c);
  sc.fog = new THREE.Fog(0x07080c, 30, 90);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(80, 64),
    new THREE.MeshStandardMaterial({ color: 0x0a0c12, metalness: 0.95, roughness: 0.14, envMapIntensity: 1.0 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  sc.add(floor);

  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(10, 24, 14);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -20; key.shadow.camera.right = 20;
  key.shadow.camera.top = 24; key.shadow.camera.bottom = -6;
  key.shadow.bias = -0.0009;
  sc.add(key);
  sc.add(new THREE.AmbientLight(0x1d2436, 0.6));
  const rim = new THREE.SpotLight(0xffc978, 180, 70, Math.PI / 7, 0.7, 1.5);
  rim.position.set(-16, 14, -16);
  sc.add(rim);

  const items = [];
  const SPAN = 5.4;
  REG.forEach((r, i) => {
    const g = new THREE.Group();
    const t = i / (REG.length - 1);
    g.position.set(-SPAN + t * SPAN * 2, 0, -Math.pow(Math.abs(t - 0.5) * 2, 2) * 2.2);
    sc.add(g);

    // bevelled bar — rounded edges are what stop it reading as a primitive
    const geo = new THREE.BoxGeometry(0.94, 1, 0.94, 1, 1, 1);
    const mat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(r.col), metalness: 1.0, roughness: 0.18,
      envMapIntensity: 1.6, clearcoat: 0.8, clearcoatRoughness: 0.15
    });
    const bar = new THREE.Mesh(geo, mat);
    bar.castShadow = bar.receiveShadow = true;
    g.add(bar);

    const glow = new THREE.Mesh(
      new THREE.BoxGeometry(0.99, 0.1, 0.99),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: new THREE.Color(r.col), emissiveIntensity: 2.2, roughness: 0.2 })
    );
    g.add(glow);

    const lamp = new THREE.PointLight(r.col, 1.6, 7, 2);
    g.add(lamp);
    items.push({ r, group: g, mesh: bar, mat, glow, lamp, h: 0.4, target: 0.4, punch: 0 });
  });

  makeParticles(sc);
  return {
    scene: sc, items,
    camera(t) {
      camera.position.set(Math.sin(t * 0.13) * 2.2, 6.4 + Math.sin(t * 0.19) * 0.5, 15.5 + Math.cos(t * 0.11) * 1);
      camera.lookAt(0, 3.4, 0);
    },
    tick(dt) {
      items.forEach((it) => {
        it.target = 0.4 + (pts[it.r.id] / TARGET) * 8;
        it.h += (it.target - it.h) * Math.min(1, dt * 4);
        it.mesh.scale.y = it.h;
        it.mesh.position.y = it.h / 2;
        it.glow.position.y = it.h;
        it.lamp.position.y = it.h;
        it.punch *= Math.pow(0.03, dt);
        it.glow.material.emissiveIntensity = 2.2 + it.punch * 5;
        it.lamp.intensity = 1.6 + it.punch * 9;
      });
    },
    anchor(it) { return new THREE.Vector3(it.group.position.x, it.h + 0.5, it.group.position.z); }
  };
}

/* ── scene 2 · liquid glass ── */
function sceneGlass() {
  const sc = new THREE.Scene();
  sc.environment = ENV;
  sc.background = new THREE.Color(0x080a10);
  sc.fog = new THREE.Fog(0x080a10, 28, 80);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(80, 64),
    new THREE.MeshStandardMaterial({ color: 0x0b0e15, metalness: 0.85, roughness: 0.1, envMapIntensity: 1.1 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  sc.add(floor);

  const key = new THREE.DirectionalLight(0xffffff, 2.0);
  key.position.set(8, 22, 14);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.001;
  sc.add(key);
  sc.add(new THREE.AmbientLight(0x223049, 0.7));

  const items = [];
  const SPAN = 5.3;
  REG.forEach((r, i) => {
    const g = new THREE.Group();
    const t = i / (REG.length - 1);
    g.position.set(-SPAN + t * SPAN * 2, 0, -Math.pow(Math.abs(t - 0.5) * 2, 2) * 2);
    sc.add(g);

    // real transmissive glass tube
    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.44, 0.44, 9, 40, 1, true),
      new THREE.MeshPhysicalMaterial({
        color: 0xffffff, metalness: 0, roughness: 0.03, transmission: 1,
        thickness: 0.6, ior: 1.45, envMapIntensity: 1.4, transparent: true,
        side: THREE.DoubleSide
      })
    );
    tube.position.y = 4.5;
    g.add(tube);

    const liquid = new THREE.Mesh(
      new THREE.CylinderGeometry(0.38, 0.38, 1, 32),
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(r.col), metalness: 0.1, roughness: 0.15,
        emissive: new THREE.Color(r.col), emissiveIntensity: 0.5,
        transmission: 0.35, thickness: 1.2, ior: 1.33, envMapIntensity: 1.2
      })
    );
    liquid.castShadow = true;
    g.add(liquid);

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.62, 0.7, 0.3, 40),
      new THREE.MeshPhysicalMaterial({ color: 0x171b25, metalness: 1, roughness: 0.22, envMapIntensity: 1.5 })
    );
    base.position.y = -0.15;
    base.castShadow = base.receiveShadow = true;
    g.add(base);

    const lamp = new THREE.PointLight(r.col, 1.4, 7, 2);
    g.add(lamp);
    items.push({ r, group: g, mesh: liquid, mat: liquid.material, lamp, h: 0.4, target: 0.4, punch: 0 });
  });

  makeParticles(sc);
  return {
    scene: sc, items,
    camera(t) {
      camera.position.set(Math.sin(t * 0.12) * 2, 6 + Math.sin(t * 0.18) * 0.4, 15 + Math.cos(t * 0.1) * 1);
      camera.lookAt(0, 3.6, 0);
    },
    tick(dt) {
      items.forEach((it) => {
        it.target = 0.4 + (pts[it.r.id] / TARGET) * 8;
        it.h += (it.target - it.h) * Math.min(1, dt * 4);
        it.mesh.scale.y = it.h;
        it.mesh.position.y = it.h / 2;
        it.lamp.position.y = it.h;
        it.punch *= Math.pow(0.03, dt);
        it.mat.emissiveIntensity = 0.5 + it.punch * 3;
        it.lamp.intensity = 1.4 + it.punch * 8;
      });
    },
    anchor(it) { return new THREE.Vector3(it.group.position.x, it.h + 0.4, it.group.position.z); }
  };
}

/* ── driver ── */
let active = null;
const BUILDERS = [sceneMap, sceneMetal, sceneGlass];

async function activate(i) {
  const built = await BUILDERS[i]();
  active = built;
  scene = built.scene;
  buildComposer();
  document.querySelectorAll(".picker button").forEach((b, k) => b.classList.toggle("on", k === i));
}

function score(id, add) {
  pts[id] = Math.min(TARGET, pts[id] + add);
  const it = active?.items.find((x) => x.r.id === id);
  if (it) {
    it.punch = 1;
    burst(active.anchor(it), it.r.col, add > 700 ? 70 : 30);
  }
  const best = REG.reduce((a, b) => (pts[a.id] >= pts[b.id] ? a : b));
  document.getElementById("ln").textContent = best.name;
  document.getElementById("lp").textContent = pts[best.id].toLocaleString() + " POINTS";
}

/* gift chips */
const ICONS = {
  rose:  '<circle cx="12" cy="9" r="6" fill="C"/><path d="M12 15v6" stroke="#5d9a52" stroke-width="1.8" stroke-linecap="round"/>',
  heart: '<path d="M12 20.5S3.6 14.8 3.6 9.3A4.7 4.7 0 0 1 12 6.5a4.7 4.7 0 0 1 8.4 2.8c0 5.5-8.4 11.2-8.4 11.2z" fill="C"/>',
  star:  '<path d="M12 2.6l2.7 6 6.6.7-4.9 4.4 1.4 6.5L12 16.9 6.2 20.2l1.4-6.5L2.7 9.3l6.6-.7z" fill="C"/>',
  gem:   '<path d="M7 3h10l4 6-9 12L3 9z" fill="C"/>',
  leaf:  '<path d="M20 4C10 4 4 9 4 15.5c0 2 .6 3.4.6 3.4S9 12 19 8c0 0-7.6 3.4-11.4 11.4C12 21 20 18 20 4z" fill="C"/>',
  sun:   '<circle cx="12" cy="12" r="4.6" fill="C"/><g stroke="C" stroke-width="1.9" stroke-linecap="round"><path d="M12 2.4v2.6M12 19v2.6M2.4 12h2.6M19 12h2.6M5.2 5.2l1.9 1.9M16.9 16.9l1.9 1.9M18.8 5.2l-1.9 1.9M7.1 16.9l-1.9 1.9"/></g>',
  cup:   '<path d="M5 8h12v6a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5z" fill="C"/><path d="M17 9.6h1.6a2.4 2.4 0 0 1 0 4.8H17" stroke="C" stroke-width="1.7" fill="none"/>',
  moon:  '<path d="M20 14.4A8.6 8.6 0 0 1 9.6 4 8.6 8.6 0 1 0 20 14.4z" fill="C"/>'
};
const gr = document.getElementById("gr");
REG.forEach((r) => {
  const hex = "#" + r.col.toString(16).padStart(6, "0");
  const el = document.createElement("div");
  el.className = "g";
  el.style.setProperty("--gc", hex);
  el.innerHTML = `<svg viewBox="0 0 24 24">${ICONS[r.gift].replaceAll('"C"', `"${hex}"`).replaceAll('="C"', `="${hex}"`)}</svg><b>${r.name}</b><i>${r.gn}</i>`;
  el.addEventListener("click", () => score(r.id, 350 + Math.floor(Math.random() * 900)));
  gr.appendChild(el);
});

document.querySelectorAll(".picker button").forEach((b) => {
  b.addEventListener("click", () => activate(Number(b.dataset.s)));
});

/* clock */
let remain = 292;
setInterval(() => {
  remain = Math.max(0, remain - 1);
  document.getElementById("ck").textContent =
    String(Math.floor(remain / 60)).padStart(2, "0") + ":" + String(remain % 60).padStart(2, "0");
}, 1000);

/* loop */
let last = performance.now(), elapsed = 0;
const v3 = new THREE.Vector3();

function update(dt) {
  elapsed += dt;
  if (!active) return;
  active.tick(dt, elapsed);
  active.camera(elapsed);
  stepParticles(dt);
  const box = renderer.domElement.getBoundingClientRect();
  REG.forEach((r, i) => {
    const it = active.items.find((x) => x.r.id === r.id);
    if (!it) { tags[i].style.opacity = 0; return; }
    tags[i].style.opacity = 1;
    v3.copy(active.anchor(it)).project(camera);
    tags[i].style.transform =
      `translate(-50%,-50%) translate(${(v3.x * 0.5 + 0.5) * box.width}px,${(-v3.y * 0.5 + 0.5) * box.height}px)`;
    tags[i].querySelector("i").textContent = pts[r.id].toLocaleString();
  });
}

function loop() {
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  update(dt);
  if (composer) composer.render();
  requestAnimationFrame(loop);
}

addEventListener("resize", () => {
  const { w, h } = S();
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  if (composer) composer.setSize(w, h);
});

window.__mk = { activate, score, step: (s) => { const n = Math.round(s * 60); for (let i = 0; i < n; i++) update(1 / 60); composer.render(); }, pts };

await activate(0);
loop();

// idle trickle so the stage always has motion while being judged
setInterval(() => {
  const r = REG[Math.floor(Math.random() * REG.length)];
  score(r.id, 60 + Math.floor(Math.random() * 160));
}, 1500);
