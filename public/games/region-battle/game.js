// Region Battle — a real-time 3D broadcast stage driven by live TokFlow events.
// Eight illuminated pylons on a reflective studio floor; every gift drives its
// region's pylon upward and fires light through it.
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

/* ─────────────── regions & gift mapping ─────────────── */
const REGIONS = [
  { id: "AMH", name: "AMHARA",  color: 0xf0b93f, gift: "rose",    giftName: "Rose" },
  { id: "ORO", name: "OROMIA",  color: 0xf06a4f, gift: "heart",   giftName: "Heart Me" },
  { id: "TIG", name: "TIGRAY",  color: 0x46b6e8, gift: "star",    giftName: "Star" },
  { id: "ADD", name: "ADDIS",   color: 0xa77ff0, gift: "gem",     giftName: "Gem" },
  { id: "SOM", name: "SOMALI",  color: 0x3fca8e, gift: "leaf",    giftName: "Leaf" },
  { id: "SNP", name: "SOUTH",   color: 0xf59042, gift: "sun",     giftName: "Sun" },
  { id: "SID", name: "SIDAMA",  color: 0x33c2b6, gift: "cup",     giftName: "Coffee" },
  { id: "AFR", name: "AFAR",    color: 0xf070a8, gift: "moon",    giftName: "Moon" }
];
const TARGET = 12000;
const state = Object.fromEntries(REGIONS.map((r, i) => [r.id, 1200 + (7 - i) * 900]));

/* ─────────────── renderer / scene ─────────────── */
const host = document.getElementById("stage");
const frame = document.getElementById("frame");
const size = () => ({ w: frame.clientWidth, h: frame.clientHeight });
// preserveDrawingBuffer lets the host screenshot the stage straight from the canvas.
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(size().w, size().h);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
host.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x05070d, 0.028);

const camera = new THREE.PerspectiveCamera(42, size().w / size().h, 0.1, 200);
camera.position.set(0, 9, 26);

/* studio backdrop: a large gradient dome so metal has something to reflect */
{
  const c = document.createElement("canvas");
  c.width = 32; c.height = 256;
  const g = c.getContext("2d").createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0.00, "#1b2740");
  g.addColorStop(0.42, "#0a0f1c");
  g.addColorStop(0.70, "#05070d");
  g.addColorStop(1.00, "#020306");
  const ctx = c.getContext("2d");
  ctx.fillStyle = g; ctx.fillRect(0, 0, 32, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = tex;
  scene.environment = tex;
}

/* ─────────────── floor ─────────────── */
const floor = new THREE.Mesh(
  new THREE.CircleGeometry(60, 96),
  new THREE.MeshStandardMaterial({ color: 0x05070c, roughness: 0.16, metalness: 0.92 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

/* concentric arena rings on the floor */
for (let i = 0; i < 4; i++) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(9.2 + i * 2.6, 9.28 + i * 2.6, 128),
    new THREE.MeshBasicMaterial({ color: 0x2a3b5c, transparent: true, opacity: 0.24 - i * 0.045, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.01;
  scene.add(ring);
}

/* ─────────────── lighting ─────────────── */
scene.add(new THREE.AmbientLight(0x2a3550, 0.7));

const key = new THREE.DirectionalLight(0xbcd2ff, 1.5);
key.position.set(9, 20, 12);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.near = 1; key.shadow.camera.far = 60;
key.shadow.camera.left = -22; key.shadow.camera.right = 22;
key.shadow.camera.top = 22; key.shadow.camera.bottom = -22;
key.shadow.bias = -0.0008;
scene.add(key);

const rimA = new THREE.SpotLight(0xf0c469, 90, 60, Math.PI / 7, 0.55, 1.6);
rimA.position.set(-16, 16, -12);
scene.add(rimA);

const rimB = new THREE.SpotLight(0x5f8dff, 70, 60, Math.PI / 7, 0.6, 1.6);
rimB.position.set(17, 14, -14);
scene.add(rimB);

/* ─────────────── gift icon textures (canvas-drawn, swapped for real TikTok art) ─────────────── */
function giftTexture(kind, hex) {
  const S = 128, c = document.createElement("canvas");
  c.width = c.height = S;
  const x = c.getContext("2d");
  const col = "#" + hex.toString(16).padStart(6, "0");
  x.translate(S / 2, S / 2);
  x.fillStyle = col; x.strokeStyle = col;
  x.lineWidth = 9; x.lineCap = "round"; x.lineJoin = "round";
  const P = Math.PI;
  if (kind === "rose") {
    x.beginPath(); x.arc(0, -6, 30, 0, P * 2); x.fill();
    x.fillStyle = "rgba(255,255,255,.34)";
    x.beginPath(); x.arc(0, -6, 16, 0, P * 2); x.fill();
    x.strokeStyle = "#5d9a52"; x.lineWidth = 7;
    x.beginPath(); x.moveTo(0, 24); x.lineTo(0, 52); x.stroke();
  } else if (kind === "heart") {
    x.beginPath();
    x.moveTo(0, 34);
    x.bezierCurveTo(-46, 4, -32, -34, 0, -14);
    x.bezierCurveTo(32, -34, 46, 4, 0, 34);
    x.fill();
  } else if (kind === "star") {
    x.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 17 : 40, a = (i / 10) * P * 2 - P / 2;
      i ? x.lineTo(Math.cos(a) * r, Math.sin(a) * r) : x.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    x.closePath(); x.fill();
  } else if (kind === "gem") {
    x.beginPath(); x.moveTo(-24, -18); x.lineTo(24, -18); x.lineTo(40, 0); x.lineTo(0, 44); x.lineTo(-40, 0);
    x.closePath(); x.fill();
    x.fillStyle = "rgba(255,255,255,.35)";
    x.beginPath(); x.moveTo(-24, -18); x.lineTo(24, -18); x.lineTo(0, 8); x.closePath(); x.fill();
  } else if (kind === "leaf") {
    x.beginPath(); x.ellipse(0, 0, 22, 40, P / 4, 0, P * 2); x.fill();
    x.strokeStyle = "rgba(255,255,255,.4)"; x.lineWidth = 5;
    x.beginPath(); x.moveTo(-22, 22); x.lineTo(22, -22); x.stroke();
  } else if (kind === "sun") {
    x.beginPath(); x.arc(0, 0, 22, 0, P * 2); x.fill();
    x.lineWidth = 8;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * P * 2;
      x.beginPath();
      x.moveTo(Math.cos(a) * 31, Math.sin(a) * 31);
      x.lineTo(Math.cos(a) * 45, Math.sin(a) * 45);
      x.stroke();
    }
  } else if (kind === "cup") {
    x.beginPath(); x.moveTo(-28, -16); x.lineTo(24, -16); x.lineTo(20, 26);
    x.quadraticCurveTo(-2, 40, -24, 26); x.closePath(); x.fill();
    x.lineWidth = 8;
    x.beginPath(); x.arc(30, 0, 14, -P / 2, P / 2); x.stroke();
  } else if (kind === "moon") {
    x.beginPath(); x.arc(4, 0, 38, 0, P * 2); x.fill();
    x.globalCompositeOperation = "destination-out";
    x.beginPath(); x.arc(24, -14, 32, 0, P * 2); x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* label texture: region name + score, drawn crisp */
function labelTexture(name, score, hex) {
  const W = 512, H = 160, c = document.createElement("canvas");
  c.width = W; c.height = H;
  const x = c.getContext("2d");
  const col = "#" + hex.toString(16).padStart(6, "0");
  x.clearRect(0, 0, W, H);
  x.textAlign = "center";
  x.fillStyle = "#ffffff";
  x.font = "700 54px -apple-system, 'Segoe UI', system-ui, sans-serif";
  x.fillText(name, W / 2, 58);
  x.fillStyle = col;
  x.font = "800 46px -apple-system, 'Segoe UI', system-ui, sans-serif";
  x.fillText(score.toLocaleString(), W / 2, 124);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/* ─────────────── pylons ─────────────── */
const SPAN = 5.1;        // tuned so all eight fit a 9:16 frame
const COL_H = 11;
const pylons = REGIONS.map((r, i) => {
  const group = new THREE.Group();
  const t = REGIONS.length === 1 ? 0.5 : i / (REGIONS.length - 1);
  const x = -SPAN + t * SPAN * 2;
  const z = -Math.pow(Math.abs(t - 0.5) * 2, 2) * 2.6;   // gentle arc toward camera
  group.position.set(x, 0, z);
  scene.add(group);

  // plinth
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.52, 0.62, 0.34, 40),
    new THREE.MeshStandardMaterial({ color: 0x161b26, roughness: 0.28, metalness: 0.95 })
  );
  base.position.y = 0.17;
  base.castShadow = base.receiveShadow = true;
  group.add(base);

  const trim = new THREE.Mesh(
    new THREE.TorusGeometry(0.53, 0.022, 12, 56),
    new THREE.MeshStandardMaterial({ color: r.color, emissive: r.color, emissiveIntensity: 1.1, roughness: 0.3 })
  );
  trim.rotation.x = Math.PI / 2;
  trim.position.y = 0.35;
  group.add(trim);

  // glass column
  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.35, COL_H, 32, 1, true),
    new THREE.MeshPhysicalMaterial({
      color: 0xa8bcd8, transparent: true, opacity: 0.10, roughness: 0.06,
      metalness: 0.2, side: THREE.DoubleSide
    })
  );
  column.position.y = COL_H / 2 + 0.34;
  group.add(column);

  // the energy core — scales with score
  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(0.29, 0.29, 1, 32),
    new THREE.MeshStandardMaterial({
      color: r.color, emissive: r.color, emissiveIntensity: 0.85,
      roughness: 0.3, metalness: 0.2
    })
  );
  core.position.y = 0.5;
  core.castShadow = true;
  group.add(core);

  // meniscus cap that rides the top of the core
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.32, 0.07, 32),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: r.color, emissiveIntensity: 1.5, roughness: 0.1 })
  );
  group.add(cap);

  // point light inside the column
  const lamp = new THREE.PointLight(r.color, 2.4, 9, 2);
  lamp.position.y = 1;
  group.add(lamp);

  // floating gift icon
  const icon = new THREE.Mesh(
    new THREE.PlaneGeometry(0.92, 0.92),
    new THREE.MeshBasicMaterial({ map: giftTexture(r.gift, r.color), transparent: true, depthWrite: false })
  );
  icon.position.y = COL_H + 1.5;
  group.add(icon);

  // crisp HTML label, projected onto the plinth each frame
  const label = document.createElement("div");
  label.className = "tag";
  label.style.setProperty("--tc", "#" + r.color.toString(16).padStart(6, "0"));
  label.innerHTML = `<b>${r.name}</b><i></i>`;
  document.getElementById("tags").appendChild(label);

  // mirrored core under the floor = reflection
  const mirror = new THREE.Mesh(
    new THREE.CylinderGeometry(0.29, 0.29, 1, 24),
    new THREE.MeshBasicMaterial({ color: r.color, transparent: true, opacity: 0.16, depthWrite: false })
  );
  group.add(mirror);

  // shockwave ring, fired on a gift
  const wave = new THREE.Mesh(
    new THREE.RingGeometry(0.58, 0.68, 48),
    new THREE.MeshBasicMaterial({ color: r.color, transparent: true, opacity: 0, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false })
  );
  wave.rotation.x = -Math.PI / 2;
  wave.position.y = 0.05;
  group.add(wave);

  return { r, group, core, cap, lamp, trim, label, wave, icon, mirror,
           height: 0.5, target: 0.5, waveT: 1, punch: 0 };
});

/* ─────────────── particles ─────────────── */
const PMAX = 900;
const pGeo = new THREE.BufferGeometry();
const pPos = new Float32Array(PMAX * 3);
const pCol = new Float32Array(PMAX * 3);
const pVel = new Float32Array(PMAX * 3);
const pLife = new Float32Array(PMAX);
pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
pGeo.setAttribute("color", new THREE.BufferAttribute(pCol, 3));
const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({
  size: 0.17, vertexColors: true, transparent: true, opacity: 0.95,
  blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
}));
scene.add(particles);
let pHead = 0;

function burst(pos, colorHex, count) {
  const c = new THREE.Color(colorHex);
  for (let i = 0; i < count; i++) {
    const k = pHead = (pHead + 1) % PMAX;
    pPos[k * 3] = pos.x + (Math.random() - 0.5) * 0.5;
    pPos[k * 3 + 1] = pos.y + Math.random() * 0.4;
    pPos[k * 3 + 2] = pos.z + (Math.random() - 0.5) * 0.5;
    const a = Math.random() * Math.PI * 2, s = 0.05 + Math.random() * 0.14;
    pVel[k * 3] = Math.cos(a) * s;
    pVel[k * 3 + 1] = 0.10 + Math.random() * 0.20;
    pVel[k * 3 + 2] = Math.sin(a) * s;
    pCol[k * 3] = c.r; pCol[k * 3 + 1] = c.g; pCol[k * 3 + 2] = c.b;
    pLife[k] = 1;
  }
}

/* ─────────────── post-processing ─────────────── */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(size().w, size().h), 0.42, 0.7, 0.86);
composer.addPass(bloom);
composer.addPass(new OutputPass());

/* ─────────────── UI ─────────────── */
const ICON_SVG = {
  rose: '<path d="M12 21v-7" stroke="#5d9a52" stroke-width="1.8" stroke-linecap="round" fill="none"/><circle cx="12" cy="9" r="6" fill="CC"/><circle cx="12" cy="9" r="3" fill="#fff" opacity=".33"/>',
  heart: '<path d="M12 20.5S3.6 14.8 3.6 9.3A4.7 4.7 0 0 1 12 6.5a4.7 4.7 0 0 1 8.4 2.8c0 5.5-8.4 11.2-8.4 11.2z" fill="CC"/>',
  star: '<path d="M12 2.6l2.7 6 6.6.7-4.9 4.4 1.4 6.5L12 16.9 6.2 20.2l1.4-6.5L2.7 9.3l6.6-.7z" fill="CC"/>',
  gem: '<path d="M7 3h10l4 6-9 12L3 9z" fill="CC"/><path d="M7 3l2 6h6l2-6" fill="#fff" opacity=".3"/>',
  leaf: '<path d="M20 4C10 4 4 9 4 15.5c0 2 .6 3.4.6 3.4S9 12 19 8c0 0-7.6 3.4-11.4 11.4C12 21 20 18 20 4z" fill="CC"/>',
  sun: '<circle cx="12" cy="12" r="4.6" fill="CC"/><g stroke="CC" stroke-width="1.9" stroke-linecap="round"><path d="M12 2.4v2.6M12 19v2.6M2.4 12h2.6M19 12h2.6M5.2 5.2l1.9 1.9M16.9 16.9l1.9 1.9M18.8 5.2l-1.9 1.9M7.1 16.9l-1.9 1.9"/></g>',
  cup: '<path d="M5 8h12v6a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5z" fill="CC"/><path d="M17 9.6h1.6a2.4 2.4 0 0 1 0 4.8H17" stroke="CC" stroke-width="1.7" fill="none"/>',
  moon: '<path d="M20 14.4A8.6 8.6 0 0 1 9.6 4 8.6 8.6 0 1 0 20 14.4z" fill="CC"/>'
};
const hexOf = (n) => "#" + n.toString(16).padStart(6, "0");

const grid = document.getElementById("grid");
REGIONS.forEach((r) => {
  const el = document.createElement("div");
  el.className = "g";
  el.style.setProperty("--gc", hexOf(r.color));
  el.innerHTML = `<svg viewBox="0 0 24 24">${ICON_SVG[r.gift].replaceAll("CC", hexOf(r.color))}</svg>` +
    `<span class="rn">${r.name}</span><span class="gn">${r.giftName}</span>`;
  el.addEventListener("click", () => score(r.id, 300 + Math.floor(Math.random() * 900), true));
  grid.appendChild(el);
});

const rail = document.getElementById("rail");
const rows = {};
REGIONS.forEach((r, i) => {
  const el = document.createElement("div");
  el.className = "rk";
  el.style.setProperty("--rc", hexOf(r.color));
  el.style.animationDelay = (1.35 + i * 0.06) + "s";
  el.innerHTML = `<span class="n"></span><span class="r">${r.name}</span><span class="v"></span>`;
  rail.appendChild(el);
  rows[r.id] = el;
});

function refreshUI() {
  const sorted = [...REGIONS].sort((a, b) => state[b.id] - state[a.id]);
  sorted.forEach((r, i) => {
    const el = rows[r.id];
    el.style.order = i;
    el.querySelector(".n").textContent = i + 1;
    el.querySelector(".v").textContent = state[r.id].toLocaleString();
  });
  const top = sorted[0];
  document.getElementById("leadName").textContent = top.name;
  document.getElementById("leadPts").textContent = state[top.id].toLocaleString() + " POINTS";
}

/* ─────────────── scoring ─────────────── */
const flashEl = document.getElementById("flash");
let shake = 0;

function score(id, points, local) {
  state[id] = Math.min(TARGET, state[id] + points);
  const p = pylons.find((x) => x.r.id === id);
  if (!p) return;
  p.target = 0.5 + (state[id] / TARGET) * 11;
  p.punch = 1;
  p.waveT = 0;
  burst(new THREE.Vector3(p.group.position.x, p.height, p.group.position.z), p.r.color, points > 700 ? 90 : 40);
  if (points > 700) {
    shake = Math.min(1, shake + 0.55);
    flashEl.animate([{ opacity: 0 }, { opacity: 0.4 }, { opacity: 0 }], { duration: 320, easing: "ease-out" });
  }
  const row = rows[id];
  row.classList.add("up");
  setTimeout(() => row.classList.remove("up"), 700);
  refreshUI();
}

/* ─────────────── live engine ─────────────── */
const giftByName = new Map();
REGIONS.forEach((r) => giftByName.set(r.giftName.toLowerCase(), r.id));
const memberOf = new Map();   // viewer -> region, so later gifts count for their side

function connect() {
  let ws;
  try { ws = new WebSocket(`ws://${location.host}/events`); } catch { return; }
  ws.addEventListener("message", (e) => {
    let msg; try { msg = JSON.parse(e.data); } catch { return; }
    if (msg.type !== "live-event") return;
    const ev = msg.event;
    const who = (ev.user?.username || ev.user?.id || "").toLowerCase();
    if (ev.type === "gift") {
      const gname = String(ev.gift?.name || "").toLowerCase();
      const coins = Math.max(0, Number(ev.gift?.totalCoins) || 0);
      let region = giftByName.get(gname);
      if (region) memberOf.set(who, region);
      else region = memberOf.get(who);
      if (region) score(region, Math.max(10, coins * 10));
    } else if (ev.type === "comment" || ev.type === "like") {
      const region = memberOf.get(who);
      if (region) score(region, ev.type === "like" ? Math.max(1, Number(ev.count) || 1) : 1);
    }
  });
  ws.addEventListener("close", () => setTimeout(connect, 2500));
  ws.addEventListener("error", () => ws.close());
}
connect();

/* ─────────────── clock ─────────────── */
let remain = 292;
setInterval(() => {
  remain = Math.max(0, remain - 1);
  const m = String(Math.floor(remain / 60)).padStart(2, "0");
  const s = String(remain % 60).padStart(2, "0");
  document.getElementById("clock").textContent = `${m}:${s}`;
}, 1000);

/* ─────────────── loop ─────────────── */
pylons.forEach((p) => { p.target = 0.5 + (state[p.r.id] / TARGET) * 11; });
refreshUI();

// exposed so the stage can be inspected and screenshotted while it runs
window.__rb = { REGIONS, state, pylons, camera, scene, renderer, score };

let last = performance.now(), elapsed = 0;

function update(dt) {
  elapsed += dt;
  const t = elapsed;

  let leadIdx = 0, best = -1;
  pylons.forEach((p, i) => { if (state[p.r.id] > best) { best = state[p.r.id]; leadIdx = i; } });

  pylons.forEach((p, i) => {
    // spring the core toward its target height
    p.height += (p.target - p.height) * Math.min(1, dt * 4.5);
    p.core.scale.y = p.height;
    p.core.position.y = p.height / 2 + 0.34;
    p.cap.position.y = p.height + 0.34;
    p.lamp.position.y = Math.min(p.height, COL_H);

    // punch: brief overshoot + glow on a score
    p.punch *= Math.pow(0.02, dt);
    const punch = p.punch;
    p.core.scale.x = p.core.scale.z = 1 + punch * 0.3;
    p.core.material.emissiveIntensity = 0.85 + punch * 2.6;
    p.lamp.intensity = 2.4 + punch * 12;

    // leader breathes
    const isLead = i === leadIdx;
    p.trim.material.emissiveIntensity = isLead ? 1.5 + Math.sin(t * 3) * 0.6 : 0.7;
    p.cap.material.emissiveIntensity = 1.5 + (isLead ? Math.sin(t * 3) * 0.5 : 0) + punch * 3;

    // shockwave
    if (p.waveT < 1) {
      p.waveT = Math.min(1, p.waveT + dt * 1.5);
      const k = p.waveT;
      p.wave.scale.setScalar(1 + k * 3.4);
      p.wave.material.opacity = (1 - k) * 0.7;
    }

    // reflection under the floor
    p.mirror.scale.y = p.height;
    p.mirror.position.y = -(p.height / 2 + 0.34);

    // icon float + face camera
    p.icon.position.y = COL_H + 1.5 + Math.sin(t * 1.6 + i) * 0.14;
    p.icon.lookAt(camera.position);
  });

  // project the plinths to screen space so the HTML labels track them
  const box = renderer.domElement.getBoundingClientRect();
  const v = new THREE.Vector3();
  pylons.forEach((p) => {
    v.set(p.group.position.x, 0.1, p.group.position.z).project(camera);
    const sx = (v.x * 0.5 + 0.5) * box.width;
    const sy = (-v.y * 0.5 + 0.5) * box.height;
    p.label.style.transform = `translate(-50%,0) translate(${sx}px,${sy}px)`;
    p.label.querySelector("i").textContent = state[p.r.id].toLocaleString();
  });

  // particles
  for (let k = 0; k < PMAX; k++) {
    if (pLife[k] <= 0) continue;
    pLife[k] -= dt * 0.85;
    pVel[k * 3 + 1] -= dt * 0.22;
    pPos[k * 3] += pVel[k * 3];
    pPos[k * 3 + 1] += pVel[k * 3 + 1];
    pPos[k * 3 + 2] += pVel[k * 3 + 2];
    if (pLife[k] <= 0) { pPos[k * 3 + 1] = -999; }
  }
  pGeo.attributes.position.needsUpdate = true;
  pGeo.attributes.color.needsUpdate = true;

  // slow broadcast camera drift + shake on big gifts
  shake *= Math.pow(0.05, dt);
  const sx = (Math.random() - 0.5) * shake * 0.5;
  const sy = (Math.random() - 0.5) * shake * 0.5;
  camera.position.x = Math.sin(t * 0.13) * 1.5 + sx;
  camera.position.y = 8.6 + Math.sin(t * 0.19) * 0.5 + sy;
  camera.position.z = 25 + Math.cos(t * 0.11) * 1.2;
  camera.lookAt(0, 6.4, 0);
}

function tick() {
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  update(dt);
  composer.render();
  requestAnimationFrame(tick);
}
tick();

// Lets the stage be advanced and rendered without relying on the tab being
// visible — used for capture and automated checks.
window.__rb.step = (seconds) => {
  const frames = Math.max(1, Math.round(seconds * 60));
  for (let i = 0; i < frames; i++) update(1 / 60);
  composer.render();
};

addEventListener("resize", () => {
  const { w, h } = size();
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
});

// demo trickle so the stage is never static while testing offline
setInterval(() => {
  if (Math.random() < 0.5) {
    const r = REGIONS[Math.floor(Math.random() * REGIONS.length)];
    score(r.id, 40 + Math.floor(Math.random() * 120));
  }
}, 1400);
