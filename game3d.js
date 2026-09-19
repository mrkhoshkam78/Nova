/**
 * KingTown v5.05 — جهش گرافیکی
 * نورپردازی پیشرفته · متریال PBR · آسمان گرادیان · ذرات · مدل‌های پرجزئیات · سایه نرم
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const $ = id => document.getElementById(id);
const container = document.getElementById('scene-container');
const SAVE_KEY = 'kingTown_v505';

let diamonds = 200, stone = 420, tokens = 15, oil = 0, level = 1;
let rot = 0, zoom = 1.08, mode = 'build', chosen = null, selectedKey = null, moveTarget = null;
let enemyHP = 160, clan = null, thUpgrade = null, lastDaily = null;
const trainQueue = [];
const troops = { swordsman: 0, archer: 0, thief: 0, cavalry: 0 };
const MAX_MINE = 5, TH_MAX = 5, TOKEN_MAX = 100;

const defs = {
  townhall:    { name: 'مرکز فرماندهی', costD: 0, costT: 0, costS: 0, max: 1, hp: 500, cat: 'econ' },
  diamondmine: { name: 'معدن الماس', costD: 0, costT: 5, costS: 0, max: MAX_MINE, hp: 120, cat: 'econ' },
  stonepit:    { name: 'معدن سنگ', costD: 150, costT: 0, costS: 0, max: MAX_MINE, hp: 140, cat: 'econ' },
  barracks:    { name: 'پادگان', costD: 180, costT: 0, costS: 0, max: 99, hp: 200, cat: 'mil' },
  cannon:      { name: 'برج دفاعی', costD: 0, costT: 0, costS: 120, max: 99, hp: 180, cat: 'mil' },
  warcannon:   { name: 'توپ جنگی', costD: 0, costT: 0, costS: 200, max: 10, hp: 280, cat: 'mil' },
  wall:        { name: 'دیوار', costD: 0, costT: 0, costS: 40, max: 99, hp: 100, cat: 'mil' }
};
const troopCost = { swordsman: 8, archer: 10, thief: 12, cavalry: 20 };
const troopTime = { swordsman: 7, archer: 20, thief: 12, cavalry: 30 };
const troopPower = { swordsman: 18, archer: 22, thief: 15, cavalry: 35 };
const troopAtk = { swordsman: 'melee', archer: 'ranged', thief: 'raid', cavalry: 'charge' };
const troopNames = { swordsman: 'شمشیردار', archer: 'کماندار', thief: 'دزد', cavalry: 'سواره' };
const troopIcons = { swordsman: '🗡️', archer: '🏹', thief: '🥷', cavalry: '🐴' };

function campLimit() { return 20 + getThLevel() * 5; }
function thUpgradeSeconds(n) { return 120 * n; }
function capacity() {
  const lv = getThLevel();
  return { diamonds: 500, stone: 900 + lv * 300, oil: 40 + lv * 20, tokens: TOKEN_MAX };
}
function canUpgradeTH(next) {
  return buildings.filter(b => b.type !== 'wall' && b.type !== 'townhall').length >= Math.max(2, next);
}
function totalTroops() { return troops.swordsman + troops.archer + troops.thief + troops.cavalry; }
function totalPower() { return Object.keys(troops).reduce((s, t) => s + troops[t] * troopPower[t], 0); }

let buildings = [
  { type: 'townhall', x: 0, z: 0, thLevel: 1, rotY: 0, hp: 500 },
  { type: 'diamondmine', x: -2, z: -1, rotY: 0, hp: 120 },
  { type: 'stonepit', x: 2, z: -1, rotY: 0, hp: 140 },
  { type: 'barracks', x: -2, z: 2, rotY: 0, hp: 200 },
  { type: 'cannon', x: 2, z: 2, rotY: 0, hp: 180, defLevel: 1 },
  { type: 'wall', x: -1, z: 3, rotY: 0, hp: 100, wallLevel: 1 },
  { type: 'wall', x: 0, z: 3, rotY: 0, hp: 100, wallLevel: 1 },
  { type: 'wall', x: 1, z: 3, rotY: 0, hp: 100 }
];

function confirmAction(title, text) {
  return new Promise(resolve => {
    const m = $('confirm'); if (!m) { resolve(true); return; }
    $('confirm-title').textContent = title;
    $('confirm-text').textContent = text;
    m.classList.remove('hide');
    const yes = () => { cleanup(); resolve(true); };
    const no = () => { cleanup(); resolve(false); };
    function cleanup() { m.classList.add('hide'); $('confirm-yes')?.removeEventListener('click', yes); $('confirm-no')?.removeEventListener('click', no); }
    $('confirm-yes')?.addEventListener('click', yes);
    $('confirm-no')?.addEventListener('click', no);
  });
}

// ===================== GRAPHICS CORE v5 =====================
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x6a9a5a, 0.018);

const frustum = 12.5;
let aspect = container.clientWidth / Math.max(container.clientHeight, 1);
const camera = new THREE.OrthographicCamera(-frustum * aspect, frustum * aspect, frustum, -frustum, 0.1, 220);
camera.position.set(22, 19, 22);
camera.lookAt(0, 0.5, 0);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance',
  alpha: false
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2.5));
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.28;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.insertBefore(renderer.domElement, container.firstChild);
Object.assign(renderer.domElement.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', touchAction: 'none' });

// —— آسمان گرادیان (به‌جای رنگ تخت) ——
function makeSky() {
  const canvas = document.createElement('canvas');
  canvas.width = 4; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#5eb0e8');
  g.addColorStop(0.35, '#8ec8e8');
  g.addColorStop(0.55, '#b8dce0');
  g.addColorStop(0.75, '#90c070');
  g.addColorStop(1, '#4a8a40');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.LinearFilter;
  const skyMat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, depthWrite: false });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(90, 32, 16), skyMat);
  sky.renderOrder = -10;
  scene.add(sky);
  scene.background = new THREE.Color(0x7ab8d8);
}
makeSky();

// —— نورپردازی سینمایی ——
const hemi = new THREE.HemisphereLight(0xfff5e0, 0x3a6a30, 0.55);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff2d0, 1.55);
sun.position.set(-16, 28, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 80;
sun.shadow.camera.left = sun.shadow.camera.bottom = -28;
sun.shadow.camera.right = sun.shadow.camera.top = 28;
sun.shadow.bias = -0.0002;
sun.shadow.normalBias = 0.035;
sun.shadow.radius = 2.5;
scene.add(sun);

const fill = new THREE.DirectionalLight(0xa0c8ff, 0.35);
fill.position.set(14, 10, -16);
scene.add(fill);

const rim = new THREE.DirectionalLight(0xffd090, 0.25);
rim.position.set(0, 8, 18);
scene.add(rim);

// —— کتابخانه متریال PBR ——
const M = {
  grassA: new THREE.MeshStandardMaterial({ color: 0x4c9a3a, roughness: 0.88, metalness: 0.0 }),
  grassB: new THREE.MeshStandardMaterial({ color: 0x428832, roughness: 0.88, metalness: 0.0 }),
  dirt: new THREE.MeshStandardMaterial({ color: 0x6a5a38, roughness: 0.92, metalness: 0.0 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x5a3a1e, roughness: 0.78, metalness: 0.05 }),
  woodDark: new THREE.MeshStandardMaterial({ color: 0x3a2815, roughness: 0.8, metalness: 0.05 }),
  leaf: new THREE.MeshStandardMaterial({ color: 0x1e6a2a, roughness: 0.72, metalness: 0.0 }),
  leafDark: new THREE.MeshStandardMaterial({ color: 0x14501e, roughness: 0.75, metalness: 0.0 }),
  stone: new THREE.MeshStandardMaterial({ color: 0x8a9690, roughness: 0.68, metalness: 0.08 }),
  stoneDark: new THREE.MeshStandardMaterial({ color: 0x6a7670, roughness: 0.7, metalness: 0.1 }),
  stoneLight: new THREE.MeshStandardMaterial({ color: 0xa8b4ae, roughness: 0.62, metalness: 0.1 }),
  plaster: new THREE.MeshStandardMaterial({ color: 0xd4c4a0, roughness: 0.75, metalness: 0.02 }),
  roofTile: new THREE.MeshStandardMaterial({ color: 0xb05030, roughness: 0.55, metalness: 0.15 }),
  roofGold: new THREE.MeshStandardMaterial({ color: 0xd4a84b, roughness: 0.4, metalness: 0.35 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x6a7a72, roughness: 0.35, metalness: 0.65 }),
  metalDark: new THREE.MeshStandardMaterial({ color: 0x3a4a42, roughness: 0.4, metalness: 0.7 }),
  gold: new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.28, metalness: 0.85, emissive: 0x553300, emissiveIntensity: 0.15 }),
  crystal: new THREE.MeshStandardMaterial({ color: 0x40e0f0, roughness: 0.12, metalness: 0.35, emissive: 0x108898, emissiveIntensity: 0.55, transparent: true, opacity: 0.92 }),
  flag: new THREE.MeshStandardMaterial({ color: 0xc02828, side: THREE.DoubleSide, roughness: 0.6 }),
  camp: new THREE.MeshStandardMaterial({ color: 0x4a3824, roughness: 0.9 }),
  skin: new THREE.MeshStandardMaterial({ color: 0xd4a574, roughness: 0.7 }),
  clothBlue: new THREE.MeshStandardMaterial({ color: 0x2a4a8a, roughness: 0.65 }),
  clothPurple: new THREE.MeshStandardMaterial({ color: 0x6a2a8a, roughness: 0.65 }),
  clothGreen: new THREE.MeshStandardMaterial({ color: 0x3a4a2a, roughness: 0.65 }),
  clothBrown: new THREE.MeshStandardMaterial({ color: 0x6a3a1a, roughness: 0.65 }),
  sel: new THREE.MeshBasicMaterial({ color: 0x40e8f0, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
  fireCore: new THREE.MeshBasicMaterial({ color: 0xff5010 }),
  fireOuter: new THREE.MeshBasicMaterial({ color: 0xffa020, transparent: true, opacity: 0.55 })
};

const G = {
  tile: new THREE.BoxGeometry(1, 0.14, 1),
  ring: new THREE.RingGeometry(0.7, 0.88, 40),
  campFloor: new THREE.CylinderGeometry(2.05, 2.15, 0.12, 32)
};

// —— زمین با جزئیات ——
for (let x = -13; x <= 13; x++) {
  for (let z = -13; z <= 13; z++) {
    const m = new THREE.Mesh(G.tile, (x + z) % 2 === 0 ? M.grassA : M.grassB);
    m.position.set(x, -0.07, z);
    m.receiveShadow = true;
    scene.add(m);
  }
}
// لکه‌های خاک حذف شدند (v5.05)

// —— جنگل انبوه پرجزئیات ——
function makeTree(x, z, scale = 1) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07 * scale, 0.13 * scale, 0.95 * scale, 6),
    M.wood
  );
  trunk.position.y = 0.48 * scale;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  g.add(trunk);
  const layers = [
    { y: 1.15, s: 0.72, mat: M.leaf },
    { y: 1.55, s: 0.55, mat: M.leaf },
    { y: 1.88, s: 0.38, mat: M.leafDark }
  ];
  layers.forEach(L => {
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(L.s * scale, 1), L.mat);
    leaf.position.y = L.y * scale;
    leaf.castShadow = true;
    g.add(leaf);
  });
  g.position.set(x, 0, z);
  g.rotation.y = Math.random() * Math.PI;
  scene.add(g);
}
for (let i = -12; i <= 12; i++) {
  makeTree(i, -12, 0.85 + (Math.abs(i) % 3) * 0.12);
  makeTree(i, 12, 0.9 + (Math.abs(i) % 2) * 0.15);
  makeTree(-12, i, 0.88);
  makeTree(12, i, 0.92);
}
for (let i = -11; i <= 11; i += 2) {
  makeTree(i + 0.6, -11, 0.65 + Math.random() * 0.2);
  makeTree(i - 0.4, 11, 0.7);
  makeTree(-11, i + 0.5, 0.68);
  makeTree(11, i - 0.3, 0.72);
}

// —— کمپ با آتش واقعی‌تر ——
const campGroup = new THREE.Group();
const campFloor = new THREE.Mesh(G.campFloor, M.camp);
campFloor.position.set(0, 0.04, -4.3);
campFloor.receiveShadow = true;
campFloor.castShadow = true;
campGroup.add(campFloor);
for (let i = 0; i < 8; i++) {
  const a = (i / 8) * Math.PI * 2;
  const rock = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.1 + Math.random() * 0.06, 0),
    M.stoneDark
  );
  rock.position.set(Math.cos(a) * 0.38, 0.1, -4.3 + Math.sin(a) * 0.38);
  rock.castShadow = true;
  campGroup.add(rock);
}
const fireCore = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.38, 6), M.fireCore);
fireCore.position.set(0, 0.3, -4.3);
fireCore.name = 'fire';
campGroup.add(fireCore);
const fireOuter = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.5, 6), M.fireOuter);
fireOuter.position.set(0, 0.35, -4.3);
fireOuter.name = 'fire2';
campGroup.add(fireOuter);
const fireLight = new THREE.PointLight(0xff6020, 1.4, 7, 1.5);
fireLight.position.set(0, 0.55, -4.3);
fireLight.castShadow = false;
campGroup.add(fireLight);
// ذرات آتش
const fireParticles = [];
for (let i = 0; i < 12; i++) {
  const p = new THREE.Mesh(
    new THREE.SphereGeometry(0.03 + Math.random() * 0.025, 4, 4),
    new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(0.08 + Math.random() * 0.06, 1, 0.55), transparent: true, opacity: 0.8 })
  );
  p.userData = { baseY: 0.4 + Math.random() * 0.2, speed: 0.4 + Math.random() * 0.6, phase: Math.random() * 6.28, x: (Math.random() - 0.5) * 0.15, z: (Math.random() - 0.5) * 0.15 };
  p.position.set(p.userData.x, p.userData.baseY, -4.3 + p.userData.z);
  campGroup.add(p);
  fireParticles.push(p);
}
// چادر و کنده هیزم کمپ
const tent = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.0, 4), new THREE.MeshStandardMaterial({ color: 0x6a4a28, roughness: 0.75 }));
tent.position.set(-1.3, 0.55, -4.0); tent.rotation.y = Math.PI / 4; tent.castShadow = true; campGroup.add(tent);
const tentPole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 5), M.wood);
tentPole.position.set(-1.3, 0.55, -4.0); campGroup.add(tentPole);
for (let i = 0; i < 4; i++) {
  const log = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.5, 6), M.woodDark);
  log.rotation.z = Math.PI / 2; log.rotation.y = i * 0.4;
  log.position.set(0.9 + (i % 2) * 0.15, 0.1, -3.7 + i * 0.12); log.castShadow = true; campGroup.add(log);
}
const bench = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.08, 0.25), M.wood);
bench.position.set(1.2, 0.2, -4.8); bench.castShadow = true; campGroup.add(bench);

scene.add(campGroup);

// —— بارگذاری مدل‌های Kenney برای دیوار/ستون ——
const gltfLoader = new GLTFLoader();
const kenneyCache = {};
const KENNEY_BASE = 'assets/kenney/Models/GLB format/';

function loadKenney(name) {
  return new Promise(resolve => {
    if (kenneyCache[name]) { resolve(kenneyCache[name].clone()); return; }
    gltfLoader.load(KENNEY_BASE + name + '.glb', gltf => {
      gltf.scene.traverse(c => {
        if (c.isMesh) {
          c.castShadow = true;
          c.receiveShadow = true;
          if (c.material) {
            c.material = c.material.clone();
            c.material.roughness = 0.65;
            c.material.metalness = 0.08;
          }
        }
      });
      kenneyCache[name] = gltf.scene;
      resolve(gltf.scene.clone());
    }, undefined, () => resolve(null));
  });
}

// پیش‌بارگذاری چند مدل
['border', 'border-high', 'column', 'column-thin', 'border-corner'].forEach(n => loadKenney(n));

const buildingMeshes = new Map();
const troopMeshes = [];
const fullLabels = new Map();
const arrows = [];
const sparkles = [];

function disposeObj(obj) {
  obj.traverse(c => {
    if (c.geometry) c.geometry.dispose?.();
    if (c.material && !Object.values(M).includes(c.material)) {
      (Array.isArray(c.material) ? c.material : [c.material]).forEach(m => m.dispose?.());
    }
  });
}

function thPalette(lv) {
  const palettes = [
    { body: 0xc89850, roof: 0xe0b858, accent: 0xd4a040 },
    { body: 0xb88840, roof: 0xd4a848, accent: 0xc09030 },
    { body: 0x8a6030, roof: 0xc09048, accent: 0xa07028 },
    { body: 0x6a4820, roof: 0xa07838, accent: 0x805828 },
    { body: 0x4a3018, roof: 0x806030, accent: 0xffd700 }
  ];
  return palettes[Math.min(Math.max(lv, 1), 5) - 1];
}

function addSelRing(g) {
  const ring = new THREE.Mesh(G.ring, M.sel);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  ring.visible = false;
  ring.name = 'selRing';
  g.add(ring);
}

function createBuildingMesh(b) {
  const g = new THREE.Group();
  g.userData = { key: `${b.x},${b.z}`, type: b.type };
  const wLv = b.wallLevel || 1;
  const dLv = b.defLevel || 1;

  // ——— دیوار با سطوح و اتصال بهتر کنج ———
  if (b.type === 'wall') {
    const h = 0.9 + wLv * 0.12;
    const thick = 0.44 + wLv * 0.04;
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.12, h, thick), wLv >= 3 ? M.stoneLight : M.stone);
    body.position.y = h / 2 + 0.02; body.castShadow = true; body.receiveShadow = true; g.add(body);
    // کلاهک اتصال کنج (اورلپ برای اتصال بصری)
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.1, thick + 0.08), M.stoneDark);
    cap.position.y = h + 0.05; cap.castShadow = true; g.add(cap);
    // کنگره
    const merH = 0.22 + wLv * 0.04;
    for (let i = -0.4; i <= 0.4; i += 0.4) {
      const mer = new THREE.Mesh(new THREE.BoxGeometry(0.28, merH, thick + 0.06), M.stoneDark);
      mer.position.set(i, h + 0.1 + merH / 2, 0); mer.castShadow = true; g.add(mer);
    }
    // خطوط آجر
    for (let y = 0.2; y < h; y += 0.22) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(1.13, 0.025, thick + 0.01), M.stoneDark);
      line.position.y = y; g.add(line);
    }
    if (wLv >= 2) {
      const iron = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.06, 0.06), M.metalDark);
      iron.position.set(0, h * 0.55, thick / 2 + 0.02); g.add(iron);
    }
    if (wLv >= 3) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 4), M.metal);
      spike.position.set(0, h + 0.35, 0); g.add(spike);
    }
    addSelRing(g);
    g.rotation.y = ((b.rotY || 0) * Math.PI) / 180;
    return g;
  }

  // ——— برج دفاعی ارتقاپذیر ———
  if (b.type === 'cannon') {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.66, 0.32, 12), M.wood);
    base.position.y = 0.16; base.castShadow = true; base.receiveShadow = true; g.add(base);
    const th = 1.5 + dLv * 0.15;
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.38 + dLv * 0.02, 0.5, th, 12), M.stone);
    tower.position.y = 0.32 + th / 2; tower.castShadow = true; tower.receiveShadow = true; g.add(tower);
    for (let y = 0.5; y < 0.32 + th; y += 0.32) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.035, 6, 20), M.stoneDark);
      band.rotation.x = Math.PI / 2; band.position.y = y; g.add(band);
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const mer = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.26, 0.14), M.stoneLight);
      mer.position.set(Math.cos(a) * 0.44, 0.32 + th + 0.1, Math.sin(a) * 0.44); mer.castShadow = true; g.add(mer);
    }
    // کماندار
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.24, 0.13), M.clothPurple);
    torso.position.y = 0.32 + th - 0.05; g.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 6), M.skin);
    head.position.y = 0.32 + th + 0.18; g.add(head);
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.015, 5, 12, Math.PI), M.wood);
    bow.position.set(0.13, 0.32 + th, 0); bow.rotation.y = Math.PI / 2; g.add(bow);
    if (dLv >= 2) {
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.35), M.flag);
      banner.position.set(0.5, 0.32 + th * 0.6, 0); g.add(banner);
    }
    g.userData.isTower = true;
    addSelRing(g);
    return g;
  }

  // ——— توپ جنگی پرجزئیات ———
  if (b.type === 'warcannon') {
    const platform = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.18, 1.05), M.woodDark);
    platform.position.y = 0.09; platform.castShadow = true; platform.receiveShadow = true; g.add(platform);
    // چرخ‌ها با پره
    [-0.48, 0.48].forEach(ox => {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.12, 14), M.wood);
      wheel.rotation.z = Math.PI / 2; wheel.position.set(ox, 0.26, 0); wheel.castShadow = true; g.add(wheel);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.14, 8), M.metal);
      hub.rotation.z = Math.PI / 2; hub.position.set(ox, 0.26, 0); g.add(hub);
      for (let i = 0; i < 6; i++) {
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.03), M.woodDark);
        spoke.position.set(ox, 0.26, 0);
        spoke.rotation.z = Math.PI / 2;
        spoke.rotation.x = (i / 6) * Math.PI;
        g.add(spoke);
      }
    });
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.05, 8), M.metalDark);
    axle.rotation.z = Math.PI / 2; axle.position.y = 0.26; g.add(axle);
    // لوله چندبخشی
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.2, 12), M.metal);
    barrel.rotation.z = Math.PI / 2; barrel.position.set(0.22, 0.52, 0); barrel.castShadow = true; g.add(barrel);
    const reinforce = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.03, 6, 12), M.metalDark);
    reinforce.rotation.y = Math.PI / 2; reinforce.position.set(0.1, 0.52, 0); g.add(reinforce);
    const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.12, 0.14, 12), M.metalDark);
    muzzle.rotation.z = Math.PI / 2; muzzle.position.set(0.88, 0.52, 0); g.add(muzzle);
    // پایه عقب
    const breech = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.28), M.metalDark);
    breech.position.set(-0.35, 0.42, 0); g.add(breech);
    // گلوله کنار توپ
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), M.metalDark);
    ball.position.set(-0.15, 0.2, 0.4); ball.castShadow = true; g.add(ball);
    if (dLv >= 2) {
      const smoke = new THREE.PointLight(0xff6020, 0.4, 2);
      smoke.position.set(0.9, 0.55, 0); g.add(smoke);
    }
    addSelRing(g);
    return g;
  }

  const isTH = b.type === 'townhall';
  const lv = isTH ? (b.thLevel || 1) : 1;
  const pal = isTH ? thPalette(lv) : null;

  // پایه سنگی مشترک
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.22, 1.25), M.stoneDark);
  base.position.y = 0.11; base.castShadow = true; base.receiveShadow = true; g.add(base);
  const step = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.1, 0.28), M.stone);
  step.position.set(0, 0.14, 0.58); g.add(step);

  // ——— مرکز فرماندهی پرجزئیات ———
  if (isTH) {
    if (lv >= 3) {
      const bodyH = 1.1 + (lv - 3) * 0.35;
      const bodyMat = new THREE.MeshStandardMaterial({ color: pal.body, roughness: 0.48, metalness: 0.14 });
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.64, bodyH, 10), bodyMat);
      body.position.y = 0.22 + bodyH / 2; body.castShadow = true; body.receiveShadow = true; g.add(body);
      // ستون‌های تزئینی
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, bodyH * 0.9, 6), M.stoneLight);
        col.position.set(Math.cos(a) * 0.58, 0.22 + bodyH * 0.45, Math.sin(a) * 0.58);
        col.castShadow = true; g.add(col);
      }
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.3;
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.05),
          new THREE.MeshStandardMaterial({ color: 0xf5e090, emissive: 0x775500, emissiveIntensity: 0.45 }));
        win.position.set(Math.cos(a) * 0.62, 0.55 + bodyH * 0.25, Math.sin(a) * 0.62);
        win.lookAt(0, win.position.y, 0); g.add(win);
      }
      const roofMat = new THREE.MeshStandardMaterial({ color: pal.roof, roughness: 0.35, metalness: 0.28 });
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.82, 0.7 + lv * 0.04, 10), roofMat);
      roof.position.y = 0.22 + bodyH + 0.35; roof.castShadow = true; g.add(roof);
      // بالکن
      const balc = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.08, 10), M.stone);
      balc.position.y = 0.22 + bodyH * 0.55; g.add(balc);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 6), M.wood);
      pole.position.y = 0.22 + bodyH + 1.0; g.add(pole);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.32), M.flag);
      flag.position.set(0.28, 0.22 + bodyH + 1.35, 0); g.add(flag);
      if (lv >= 4) {
        const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 0), M.gold);
        gem.position.y = 0.22 + bodyH + 0.58; gem.userData.spin = true; g.add(gem);
      }
      if (lv >= 5) {
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const spire = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3, 5), M.gold);
          spire.position.set(Math.cos(a) * 0.4, 0.22 + bodyH + 0.8, Math.sin(a) * 0.4); g.add(spire);
        }
      }
    } else {
      const bodyH = 0.75 + lv * 0.22;
      const bodyMat = new THREE.MeshStandardMaterial({ color: pal.body, roughness: 0.52, metalness: 0.1 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.0, bodyH, 1.0), bodyMat);
      body.position.y = 0.22 + bodyH / 2; body.castShadow = true; body.receiveShadow = true; g.add(body);
      // قاب و در
      const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.5, 0.06), M.woodDark);
      doorFrame.position.set(0, 0.4, 0.52); g.add(doorFrame);
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.42, 0.04), M.wood);
      door.position.set(0, 0.38, 0.55); g.add(door);
      // پنجره‌ها
      [-0.28, 0.28].forEach(wx => {
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.04),
          new THREE.MeshStandardMaterial({ color: 0xf0d870, emissive: 0x664400, emissiveIntensity: 0.35 }));
        win.position.set(wx, 0.55 + bodyH * 0.25, 0.51); g.add(win);
      });
      const roofMat = new THREE.MeshStandardMaterial({ color: pal.roof, roughness: 0.4, metalness: 0.2 });
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.88, 0.52 + lv * 0.06, 4), roofMat);
      roof.position.y = 0.22 + bodyH + 0.28; roof.rotation.y = Math.PI / 4; roof.castShadow = true; g.add(roof);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.95 + lv * 0.1, 5), M.wood);
      pole.position.y = 0.22 + bodyH + 0.72; g.add(pole);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.28), M.flag);
      flag.position.set(0.24, 0.22 + bodyH + 1.05, 0); g.add(flag);
    }
    addSelRing(g);
    return g;
  }

  // ——— معدن الماس بسیار پرجزئیات ———
  if (b.type === 'diamondmine') {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.7, 1.0), new THREE.MeshStandardMaterial({ color: 0x2a6a70, roughness: 0.55, metalness: 0.15 }));
    frame.position.y = 0.55; frame.castShadow = true; frame.receiveShadow = true; g.add(frame);
    // داربست چوبی
    [[-0.48, -0.48], [0.48, -0.48], [-0.48, 0.48], [0.48, 0.48]].forEach(([px, pz]) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.3, 5), M.wood);
      post.position.set(px, 0.85, pz); post.castShadow = true; g.add(post);
    });
    const beam = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.08, 0.08), M.woodDark);
    beam.position.y = 1.45; g.add(beam);
    // کریستال‌های چندتایی
    const crystalPos = [[0, 1.55], [0.25, 1.35], [-0.22, 1.4], [0.1, 1.75]];
    crystalPos.forEach(([cx, cy], i) => {
      const cry = new THREE.Mesh(new THREE.OctahedronGeometry(0.18 + i * 0.04, 0), M.crystal);
      cry.position.set(cx, cy, i * 0.05 - 0.08);
      cry.rotation.set(Math.random(), Math.random(), Math.random());
      cry.castShadow = true;
      if (i === 0) cry.userData.spin = true;
      g.add(cry);
    });
    const glow = new THREE.PointLight(0x40e0f0, 0.85, 4);
    glow.position.set(0, 1.6, 0); g.add(glow);
    // سطل و طناب
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.15, 8), M.metal);
    bucket.position.set(0.35, 0.95, 0.35); g.add(bucket);
    addSelRing(g);
    return g;
  }

  // ——— معدن سنگ پرجزئیات ———
  if (b.type === 'stonepit') {
    const pit = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 0.35, 10), M.dirt);
    pit.position.y = 0.28; pit.receiveShadow = true; g.add(pit);
    // توده سنگ‌های متنوع
    for (let i = 0; i < 9; i++) {
      const s = 0.1 + Math.random() * 0.16;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), i % 2 ? M.stone : M.stoneDark);
      rock.position.set((Math.random() - 0.5) * 0.7, 0.4 + Math.random() * 0.5, (Math.random() - 0.5) * 0.7);
      rock.rotation.set(Math.random(), Math.random(), Math.random());
      rock.castShadow = true; g.add(rock);
    }
    // کلنگ
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.7, 5), M.wood);
    handle.position.set(0.4, 0.7, 0.3); handle.rotation.z = 0.5; g.add(handle);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.08, 0.08), M.metal);
    head.position.set(0.55, 0.95, 0.3); g.add(head);
    // جعبه چوبی
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.25, 0.3), M.wood);
    crate.position.set(-0.4, 0.35, 0.35); crate.castShadow = true; g.add(crate);
    addSelRing(g);
    return g;
  }

  // ——— پادگان ظاهر جدید ———
  if (b.type === 'barracks') {
    // ساختمان مستطیلی با سقف شیب‌دار
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.85, 0.9), new THREE.MeshStandardMaterial({ color: 0xa06838, roughness: 0.6, metalness: 0.05 }));
    body.position.y = 0.65; body.castShadow = true; body.receiveShadow = true; g.add(body);
    // سقف دو شیب
    const roofL = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.08, 0.55), new THREE.MeshStandardMaterial({ color: 0x8a4030, roughness: 0.5, metalness: 0.1 }));
    roofL.position.set(0, 1.2, -0.2); roofL.rotation.x = 0.35; roofL.castShadow = true; g.add(roofL);
    const roofR = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.08, 0.55), new THREE.MeshStandardMaterial({ color: 0x9a4830, roughness: 0.5, metalness: 0.1 }));
    roofR.position.set(0, 1.2, 0.2); roofR.rotation.x = -0.35; roofR.castShadow = true; g.add(roofR);
    // در بزرگ
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.55, 0.05), M.woodDark);
    door.position.set(0, 0.5, 0.48); g.add(door);
    // پرچم نظامی
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 5), M.wood);
    pole.position.set(0.55, 1.5, 0); g.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.22), M.flag);
    flag.position.set(0.72, 1.75, 0); g.add(flag);
    // سپر روی دیوار
    const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 6), new THREE.MeshStandardMaterial({ color: 0xc04030, metalness: 0.35, roughness: 0.45 }));
    shield.rotation.x = Math.PI / 2; shield.position.set(-0.35, 0.85, 0.48); g.add(shield);
    // رک سلاح
    const rack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.08), M.woodDark);
    rack.position.set(0.3, 0.7, 0.48); g.add(rack);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshBasicMaterial({ color: 0xe8a020, transparent: true, opacity: 0 }));
    glow.position.y = 1.7; glow.name = 'trainGlow'; g.add(glow);
    addSelRing(g);
    return g;
  }

  addSelRing(g);
  return g;
}


// ——— NPCهای متحرک شهر ———
const cityNPCs = [];
function spawnCityNPCs() {
  cityNPCs.forEach(n => { scene.remove(n.mesh); });
  cityNPCs.length = 0;
  const paths = [
    { points: [[-3, -2], [3, -2], [3, 1], [-3, 1]], speed: 0.35 },
    { points: [[-4, 0], [-4, 3], [1, 3], [1, 0]], speed: 0.28 },
    { points: [[2, -3], [4, 0], [2, 2], [0, -1]], speed: 0.4 },
    { points: [[-2, 2], [0, 0], [2, -2], [-1, -3]], speed: 0.32 }
  ];
  paths.forEach((path, pi) => {
    const mesh = createTroopMesh(pi % 2 === 0 ? 'swordsman' : 'archer');
    mesh.scale.setScalar(0.7);
    mesh.position.set(path.points[0][0], 0, path.points[0][1]);
    scene.add(mesh);
    cityNPCs.push({ mesh, path: path.points, speed: path.speed, t: Math.random(), idx: 0 });
  });
}
function updateCityNPCs(dt) {
  cityNPCs.forEach(npc => {
    const pts = npc.path;
    const i0 = Math.floor(npc.t) % pts.length;
    const i1 = (i0 + 1) % pts.length;
    const f = npc.t - Math.floor(npc.t);
    const x = pts[i0][0] + (pts[i1][0] - pts[i0][0]) * f;
    const z = pts[i0][1] + (pts[i1][1] - pts[i0][1]) * f;
    npc.mesh.position.x = x; npc.mesh.position.z = z;
    npc.mesh.position.y = Math.sin(npc.t * 8) * 0.02;
    const dx = pts[i1][0] - pts[i0][0], dz = pts[i1][1] - pts[i0][1];
    npc.mesh.rotation.y = Math.atan2(dx, dz);
    npc.t += dt * npc.speed * 0.15;
  });
}

function rebuildBuildings() {
  buildingMeshes.forEach(m => { scene.remove(m); disposeObj(m); });
  buildingMeshes.clear();
  buildings.forEach(b => {
    const mesh = createBuildingMesh(b);
    mesh.position.set(b.x, 0, b.z);
    scene.add(mesh);
    buildingMeshes.set(`${b.x},${b.z}`, mesh);
  });
  updateSelectionVisual();
  updateFullLabels();
}

function updateFullLabels() {
  fullLabels.forEach(m => scene.remove(m)); fullLabels.clear();
  const cap = capacity();
  const showD = diamonds >= cap.diamonds - 0.5, showS = stone >= cap.stone - 0.5;
  buildings.forEach(b => {
    if ((b.type === 'diamondmine' && showD) || (b.type === 'stonepit' && showS)) {
      const canvas = document.createElement('canvas');
      canvas.width = 128; canvas.height = 48;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'rgba(12,30,22,0.92)';
      ctx.beginPath(); ctx.roundRect(4, 4, 120, 40, 8); ctx.fill();
      ctx.strokeStyle = '#f0d060'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#f0d060'; ctx.font = 'bold 22px system-ui'; ctx.textAlign = 'center';
      ctx.fillText('پر شد!', 64, 32);
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true }));
      spr.scale.set(1.5, 0.55, 1); spr.position.set(b.x, 2.35, b.z);
      scene.add(spr); fullLabels.set(`${b.x},${b.z}`, spr);
    }
  });
}

function updateSelectionVisual() {
  buildingMeshes.forEach((mesh, key) => {
    const ring = mesh.getObjectByName('selRing');
    if (ring) ring.visible = key === selectedKey;
  });
  const info = $('selected-info'); if (!info) return;
  if (selectedKey) {
    const b = buildings.find(o => `${o.x},${o.z}` === selectedKey);
    if (b) {
      info.classList.remove('hide');
      const hpStr = b.hp != null ? ` · مقاومت ${b.hp}` : '';
      $('sel-name').textContent = defs[b.type].name + (b.type === 'townhall' ? ` (سطح ${b.thLevel || 1})` : '') + hpStr;
      const up = $('btn-upgrade');
      if (up) up.style.display = b.type === 'townhall' && (b.thLevel || 1) < TH_MAX && !thUpgrade ? '' : 'none';
      const ud = $('btn-upgrade-def');
      if (ud) {
        const canDef = (b.type === 'wall' && (b.wallLevel || 1) < 3) ||
          ((b.type === 'cannon' || b.type === 'warcannon') && (b.defLevel || 1) < 3);
        ud.classList.toggle('hide', !canDef);
      }
      $('btn-rotate-sel')?.classList.toggle('hide', b.type !== 'wall');
    }
  } else info.classList.add('hide');
}

function createTroopMesh(type) {
  const g = new THREE.Group();
  const skin = M.skin;
  const cloth = type === 'swordsman' ? M.clothBlue : type === 'archer' ? M.clothPurple : type === 'thief' ? M.clothGreen : M.clothBrown;

  if (type === 'cavalry') {
    const horse = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.3, 0.58), new THREE.MeshStandardMaterial({ color: 0x5a3a1e, roughness: 0.7 }));
    horse.position.y = 0.36; horse.castShadow = true; g.add(horse);
    const hHead = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.15, 0.3), new THREE.MeshStandardMaterial({ color: 0x5a3a1e }));
    hHead.position.set(0, 0.5, 0.38); g.add(hHead);
    [-0.13, 0.13].forEach(lx => {
      [0.16, -0.16].forEach(lz => {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.3, 0.07), new THREE.MeshStandardMaterial({ color: 0x3a2a12 }));
        leg.position.set(lx, 0.15, lz); g.add(leg);
      });
    });
    const rider = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.26, 0.14), cloth);
    rider.position.y = 0.62; rider.castShadow = true; g.add(rider);
    const rHead = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), skin);
    rHead.position.y = 0.82; g.add(rHead);
    const lance = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.75, 5), M.metal);
    lance.position.set(0.16, 0.72, 0.12); lance.rotation.z = -0.35; g.add(lance);
    return g;
  }

  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.13), new THREE.MeshStandardMaterial({ color: 0x2a2a2a }));
  legs.position.y = 0.2; g.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.34, 0.17), cloth);
  torso.position.y = 0.54; torso.castShadow = true; g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 8, 6), skin);
  head.position.y = 0.82; g.add(head);

  if (type === 'swordsman') {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.2, 0.19), M.metal);
    plate.position.y = 0.58; g.add(plate);
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.125, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), M.metalDark);
    helm.position.y = 0.88; g.add(helm);
    const sword = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.48, 0.04), M.metal);
    sword.position.set(0.22, 0.58, 0); g.add(sword);
    const hilt = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.04), M.wood);
    hilt.position.set(0.22, 0.36, 0); g.add(hilt);
  }
  if (type === 'archer') {
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshStandardMaterial({ color: 0x3a2a15 }));
    hair.position.y = 0.9; hair.scale.set(1, 0.55, 1); g.add(hair);
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.02, 5, 12, Math.PI), M.wood);
    bow.position.set(0.2, 0.58, 0); bow.rotation.y = Math.PI / 2; g.add(bow);
    const quiver = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.28, 6), M.woodDark);
    quiver.position.set(-0.15, 0.55, 0); g.add(quiver);
  }
  if (type === 'thief') {
    const hood = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.22, 7), M.clothGreen);
    hood.position.y = 0.98; g.add(hood);
    const bag = new THREE.Mesh(new THREE.SphereGeometry(0.1, 7, 5), M.woodDark);
    bag.position.set(-0.17, 0.42, 0); g.add(bag);
    const dagger = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.24, 0.03), M.metal);
    dagger.position.set(0.17, 0.5, 0); g.add(dagger);
  }
  return g;
}

function refreshTroopVisuals() {
  troopMeshes.forEach(m => { scene.remove(m); disposeObj(m); });
  troopMeshes.length = 0;
  let idx = 0;
  const place = (type, count) => {
    for (let i = 0; i < Math.min(count, 20); i++) {
      const m = createTroopMesh(type);
      const col = idx % 5, row = Math.floor(idx / 5);
      m.position.set(-1.05 + col * 0.52, 0, -5.1 + row * 0.44);
      m.userData = { baseX: m.position.x, baseZ: m.position.z, phase: Math.random() * 6.28, speed: 0.28 + Math.random() * 0.4 };
      m.scale.setScalar(type === 'cavalry' ? 0.78 : 0.88);
      scene.add(m); troopMeshes.push(m); idx++;
    }
  };
  place('swordsman', troops.swordsman); place('archer', troops.archer);
  place('thief', troops.thief); place('cavalry', troops.cavalry);
}

function countType(t) { return buildings.filter(b => b.type === t).length; }
function getThLevel() { const th = buildings.find(b => b.type === 'townhall'); return th ? (th.thLevel || 1) : 1; }
function clampResources() {
  const c = capacity();
  diamonds = Math.min(diamonds, c.diamonds); stone = Math.min(stone, c.stone);
  oil = Math.min(oil, c.oil); tokens = Math.min(tokens, c.tokens);
}

function updateUI() {
  if (!$('diamonds')) return;
  clampResources();
  const c = capacity();
  $('diamonds').textContent = Math.floor(diamonds);
  $('stone').textContent = Math.floor(stone);
  $('tokens').textContent = tokens;
  $('oil').textContent = Math.floor(oil);
  $('level').textContent = level;
  if ($('cap-d')) $('cap-d').textContent = '/' + c.diamonds;
  if ($('cap-s')) $('cap-s').textContent = '/' + c.stone;
  if ($('cap-o')) $('cap-o').textContent = '/' + c.oil;
  $('t-swordsman').textContent = troops.swordsman;
  $('t-archer').textContent = troops.archer;
  $('t-thief').textContent = troops.thief;
  if ($('t-cavalry')) $('t-cavalry').textContent = troops.cavalry;
  if ($('power-total')) $('power-total').textContent = totalPower();
  if ($('camp-cap')) $('camp-cap').textContent = `(${totalTroops()}/${campLimit()})`;
  if ($('bar-diamonds')) $('bar-diamonds').style.width = Math.min(100, (diamonds / c.diamonds) * 100) + '%';
  if ($('bar-stone')) $('bar-stone').style.width = Math.min(100, (stone / c.stone) * 100) + '%';
  if ($('bar-tokens')) $('bar-tokens').style.width = Math.min(100, (tokens / TOKEN_MAX) * 100) + '%';
  if ($('bar-oil')) $('bar-oil').style.width = Math.min(100, (oil / c.oil) * 100) + '%';
  const thLv = getThLevel();
  if ($('mission-bar')) $('mission-bar').style.width = (thLv / TH_MAX) * 100 + '%';
  if ($('mission-text')) $('mission-text').textContent = thLv >= TH_MAX ? 'مرکز فرماندهی در اوج قدرت است!' : `مرکز را به سطح ${thLv + 1} برسانید`;
  if ($('clan-info')) $('clan-info').textContent = clan ? `عضو: ${clan.name}` : 'هنوز عضو کلنی نیستید';
  updateFullLabels();
}
function message(t) { if ($('msg')) $('msg').innerHTML = '<b>' + t + '</b>'; }

function save() {
  localStorage.setItem(SAVE_KEY, JSON.stringify({ diamonds, stone, tokens, oil, level, rot, zoom, buildings, troops, enemyHP, clan, lastDaily }));
  message('پیشرفت ذخیره شد');
}
function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY) || localStorage.getItem('kingTown_v420') || localStorage.getItem('kingTown_v405');
    if (!raw) return;
    const s = JSON.parse(raw);
    if (typeof s.diamonds === 'number') diamonds = Math.min(s.diamonds, 500);
    if (typeof s.stone === 'number') stone = s.stone;
    if (typeof s.tokens === 'number') tokens = s.tokens;
    if (typeof s.oil === 'number') oil = s.oil;
    if (typeof s.level === 'number') level = s.level;
    if (typeof s.rot === 'number') rot = s.rot;
    if (typeof s.zoom === 'number') zoom = s.zoom;
    if (Array.isArray(s.buildings)) buildings = s.buildings.map(b => ({ rotY: 0, hp: defs[b.type]?.hp || 100, ...b }));
    if (s.troops) Object.keys(troops).forEach(k => { troops[k] = s.troops[k] | 0; });
    if (s.clan) clan = s.clan;
    if (s.lastDaily) lastDaily = s.lastDaily;
    if (typeof s.enemyHP === 'number') enemyHP = s.enemyHP;
  } catch (e) {}
}
load();

// ——— منطق بازی (بدون تغییر اساسی) ———
document.querySelectorAll('[data-type]').forEach(btn => {
  btn.addEventListener('click', () => {
    const t = btn.dataset.type;
    if (chosen === t) { chosen = null; btn.classList.remove('selected-build'); message('انتخاب لغو شد'); return; }
    document.querySelectorAll('[data-type]').forEach(b => b.classList.remove('selected-build'));
    if (t === 'townhall' && countType('townhall') >= 1) { message('فقط یک مرکز فرماندهی مجاز است'); return; }
    if ((t === 'diamondmine' || t === 'stonepit') && countType(t) >= MAX_MINE) { message(`حداکثر ${MAX_MINE} معدن`); return; }
    chosen = t; btn.classList.add('selected-build'); mode = 'build';
    $('mode-build')?.classList.add('active');
    $('mode-move')?.classList.remove('active');
    $('mode-rotate-wall')?.classList.remove('active');
    message('انتخاب: ' + defs[t].name);
  });
});

$('mode-build')?.addEventListener('click', () => {
  mode = 'build'; moveTarget = null; selectedKey = null;
  $('mode-build').classList.add('active');
  $('mode-move')?.classList.remove('active');
  $('mode-rotate-wall')?.classList.remove('active');
  if ($('mode-label')) $('mode-label').textContent = 'ساخت';
  updateSelectionVisual(); message('حالت ساخت');
});
$('mode-move')?.addEventListener('click', () => {
  mode = 'move'; chosen = null;
  document.querySelectorAll('[data-type]').forEach(b => b.classList.remove('selected-build'));
  $('mode-move').classList.add('active');
  $('mode-build')?.classList.remove('active');
  $('mode-rotate-wall')?.classList.remove('active');
  if ($('mode-label')) $('mode-label').textContent = 'جابجایی';
  message('سازه را انتخاب کنید، سپس جای جدید');
});
$('mode-rotate-wall')?.addEventListener('click', () => {
  mode = 'rotate';
  $('mode-rotate-wall').classList.add('active');
  $('mode-build')?.classList.remove('active');
  $('mode-move')?.classList.remove('active');
  if ($('mode-label')) $('mode-label').textContent = 'چرخش دیوار';
  message('روی دیوار کلیک کنید');
});

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

renderer.domElement.addEventListener('pointerdown', e => {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hit = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(groundPlane, hit)) return;
  const gx = Math.round(hit.x), gz = Math.round(hit.z);
  if (Math.abs(gx) > 12 || Math.abs(gz) > 12) return;
  if (gz <= -3 && Math.abs(gx) < 3 && mode === 'build' && chosen) { message('منطقه کمپ نیروهاست'); return; }
  const key = `${gx},${gz}`;
  const occupied = buildings.find(o => o.x === gx && o.z === gz);

  if (mode === 'rotate') {
    if (occupied?.type === 'wall') {
      occupied.rotY = ((occupied.rotY || 0) + 45) % 360;
      rebuildBuildings();
spawnCityNPCs(); selectedKey = key; updateSelectionVisual();
      message('زاویه دیوار: ' + occupied.rotY + '°');
    } else message('فقط دیوار قابل چرخش است');
    return;
  }
  if (mode === 'move') {
    if (!moveTarget) {
      if (!occupied) { message('ابتدا سازه انتخاب کنید'); return; }
      moveTarget = occupied; selectedKey = key; updateSelectionVisual();
      message(defs[occupied.type].name + ' — جای جدید را لمس کنید');
    } else {
      if (occupied) { message('این خانه اشغال است'); return; }
      if (gz <= -3 && Math.abs(gx) < 3) { message('منطقه کمپ'); return; }
      moveTarget.x = gx; moveTarget.z = gz; moveTarget = null;
      selectedKey = `${gx},${gz}`; rebuildBuildings(); message('جابه‌جا شد');
    }
    return;
  }
  if (occupied && !chosen) {
    selectedKey = key; updateSelectionVisual();
    message(defs[occupied.type].name + (occupied.hp != null ? ' · مقاومت ' + occupied.hp : ''));
    return;
  }
  if (mode === 'build' && chosen) {
    if (occupied) { message('این خانه اشغال است'); return; }
    const d = defs[chosen];
    if (chosen === 'townhall' && countType('townhall') >= 1) { message('فقط یک مرکز'); return; }
    if ((chosen === 'diamondmine' || chosen === 'stonepit') && countType(chosen) >= MAX_MINE) { message('حداکثر ' + MAX_MINE); return; }
    if (diamonds < d.costD) { message('الماس کافی نیست'); return; }
    if (tokens < d.costT) { message('سکه کافی نیست'); return; }
    if (stone < d.costS) { message('سنگ کافی نیست'); return; }
    diamonds -= d.costD; tokens -= d.costT; stone -= d.costS;
    const nb = { type: chosen, x: gx, z: gz, rotY: 0, hp: d.hp };
    if (chosen === 'townhall') nb.thLevel = 1;
    if (chosen === 'wall') nb.wallLevel = 1;
    if (chosen === 'cannon' || chosen === 'warcannon') nb.defLevel = 1;
    buildings.push(nb); rebuildBuildings(); updateUI(); message(d.name + ' ساخته شد');
  }
});

$('btn-upgrade')?.addEventListener('click', async () => {
  const th = buildings.find(b => b.type === 'townhall');
  if (!th || (th.thLevel || 1) >= TH_MAX || thUpgrade) return;
  const next = (th.thLevel || 1) + 1;
  if (!canUpgradeTH(next)) { message('به ساختمان‌های بیشتری نیاز دارید'); return; }
  const cost = next * 200, secs = thUpgradeSeconds(next);
  if (!(await confirmAction('ارتقا مرکز', `سطح ${next} — ${cost} الماس — ${Math.floor(secs / 60)} دقیقه؟`))) return;
  if (diamonds < cost) { message('الماس کافی نیست'); return; }
  diamonds -= cost;
  thUpgrade = { endsAt: performance.now() + secs * 1000, duration: secs * 1000, nextLv: next };
  $('th-upgrade-overlay')?.classList.remove('hide');
  updateUI(); message('ارتقا آغاز شد');
});
$('btn-rotate-sel')?.addEventListener('click', () => {
  const b = buildings.find(o => `${o.x},${o.z}` === selectedKey);
  if (b?.type === 'wall') { b.rotY = ((b.rotY || 0) + 45) % 360; rebuildBuildings(); message(b.rotY + '°'); }
});
$('btn-deselect')?.addEventListener('click', () => { selectedKey = null; moveTarget = null; updateSelectionVisual(); });

$('btn-upgrade-def')?.addEventListener('click', async () => {
  const b = buildings.find(o => `${o.x},${o.z}` === selectedKey);
  if (!b) return;
  if (b.type === 'wall') {
    const lv = b.wallLevel || 1;
    if (lv >= 3) { message('دیوار در حداکثر سطح است'); return; }
    const cost = lv * 60;
    if (!(await confirmAction('ارتقای دیوار', `سطح ${lv + 1} — ${cost} سنگ؟`))) return;
    if (stone < cost) { message('سنگ کافی نیست'); return; }
    stone -= cost; b.wallLevel = lv + 1; b.hp = 100 + b.wallLevel * 40;
    rebuildBuildings(); updateUI(); message('دیوار → سطح ' + b.wallLevel);
  } else if (b.type === 'cannon' || b.type === 'warcannon') {
    const lv = b.defLevel || 1;
    if (lv >= 3) { message('حداکثر سطح دفاع'); return; }
    const cost = lv * 80;
    if (!(await confirmAction('ارتقای دفاع', `سطح ${lv + 1} — ${cost} سنگ؟`))) return;
    if (stone < cost) { message('سنگ کافی نیست'); return; }
    stone -= cost; b.defLevel = lv + 1; b.hp = (defs[b.type].hp || 180) + b.defLevel * 50;
    rebuildBuildings(); updateUI(); message(defs[b.type].name + ' → سطح ' + b.defLevel);
  }
});



function startTraining(type) {
  if (countType('barracks') < 1) { message('ابتدا پادگان بسازید'); return; }
  if (totalTroops() + trainQueue.length >= campLimit()) { message('ظرفیت کمپ پر است (حداکثر ' + campLimit() + ')'); return; }
  const cost = troopCost[type];
  if (oil < cost) { message('نفت کافی نیست'); return; }
  oil -= cost;
  const dur = troopTime[type] * 1000;
  trainQueue.push({ type, endsAt: performance.now() + dur, duration: dur, id: Math.random().toString(36).slice(2) });
  renderTrainOverlay(); updateUI(); message('آموزش ' + troopNames[type] + ' شروع شد');
}
function renderTrainOverlay() {
  const list = $('train-list'), ov = $('train-overlay');
  if (!list || !ov) return;
  if (!trainQueue.length) { ov.classList.add('hide'); return; }
  ov.classList.remove('hide');
  list.innerHTML = trainQueue.map(t => {
    const left = Math.max(0, t.endsAt - performance.now());
    return `<div class="train-card"><span>${troopIcons[t.type]}</span><div class="train-bar"><i style="width:${(1 - left / t.duration) * 100}%"></i></div><b>${Math.ceil(left / 1000)}s</b></div>`;
  }).join('');
}
function updateTraining() {
  const now = performance.now();
  let ch = false;
  for (let i = trainQueue.length - 1; i >= 0; i--) {
    if (trainQueue[i].endsAt <= now) {
      troops[trainQueue[i].type]++;
      message(troopNames[trainQueue[i].type] + ' آماده شد!');
      trainQueue.splice(i, 1); ch = true;
    }
  }
  if (trainQueue.length || ch) renderTrainOverlay();
  if (ch) { refreshTroopVisuals(); updateUI(); }
  const training = trainQueue.length > 0;
  buildingMeshes.forEach(mesh => {
    const glow = mesh.getObjectByName('trainGlow');
    if (glow) glow.material.opacity = training ? 0.4 + Math.sin(now * 0.008) * 0.35 : 0;
  });
}
function updateThUpgrade() {
  if (!thUpgrade) return;
  const left = thUpgrade.endsAt - performance.now();
  if ($('th-progress')) $('th-progress').style.width = Math.max(0, 1 - left / thUpgrade.duration) * 100 + '%';
  if ($('th-timer')) $('th-timer').textContent = Math.ceil(Math.max(0, left) / 1000) + 's';
  if (left <= 0) {
    const th = buildings.find(b => b.type === 'townhall');
    if (th) { th.thLevel = thUpgrade.nextLv; th.hp = 500 + thUpgrade.nextLv * 80; }
    level = Math.max(level, thUpgrade.nextLv);
    message('مرکز به سطح ' + thUpgrade.nextLv + ' رسید!');
    thUpgrade = null; $('th-upgrade-overlay')?.classList.add('hide');
    rebuildBuildings(); updateUI();
  }
}
document.querySelectorAll('[data-troop]').forEach(btn => btn.addEventListener('click', () => startTraining(btn.dataset.troop)));

function updateOilPreview() {
  const n = Math.max(0, parseInt($('stone-amount')?.value || '0', 10));
  if ($('oil-preview')) $('oil-preview').textContent = '= ' + (Math.floor(n / 30) * 5) + ' نفت';
}
$('stone-amount')?.addEventListener('input', updateOilPreview); updateOilPreview();
$('convert-oil')?.addEventListener('click', async () => {
  const n = Math.max(0, parseInt($('stone-amount')?.value || '0', 10));
  if (n < 30) { message('حداقل ۳۰ سنگ'); return; }
  const oilOut = Math.floor(n / 30) * 5, use = Math.floor(n / 30) * 30;
  if (!(await confirmAction('تبدیل', use + ' سنگ ← ' + oilOut + ' نفت؟'))) return;
  if (stone < use) { message('سنگ کافی نیست'); return; }
  stone -= use; oil += oilOut; clampResources(); updateUI(); message('+' + oilOut + ' نفت');
});

document.querySelectorAll('[data-pack]').forEach(btn => {
  btn.addEventListener('click', async () => {
    const pack = parseInt(btn.dataset.pack, 10);
    if (tokens + pack > TOKEN_MAX) { message('سقف سکه ' + TOKEN_MAX); return; }
    if (!(await confirmAction('خرید سکه', pack + ' سکه ≈ $' + pack / 5 + '؟'))) return;
    tokens += pack; clampResources(); updateUI(); message('+' + pack + ' سکه');
  });
});


$('btn-reward')?.addEventListener('click', () => {
  const code = ($('reward-code')?.value || '').trim().toUpperCase();
  if (code === 'RZ1999') {
    const c = capacity();
    diamonds = c.diamonds; stone = c.stone; oil = c.oil; tokens = c.tokens;
    updateUI(); message('کد RZ1999 پذیرفته شد — همه منابع پر شد!');
    if ($('reward-code')) $('reward-code').value = '';
  } else if (code) {
    message('کد نامعتبر است');
  }
});

$('btn-join-clan')?.addEventListener('click', () => { clan = { name: 'کلن طلایی' }; updateUI(); message('به کلن طلایی پیوستید!'); });
$('btn-daily')?.addEventListener('click', () => {
  const today = new Date().toDateString();
  if (lastDaily === today) { message('پاداش امروز را قبلاً گرفته‌اید'); return; }
  lastDaily = today;
  const d = 30 + Math.floor(Math.random() * 40);
  const s = 40 + Math.floor(Math.random() * 50);
  const o = 3 + Math.floor(Math.random() * 5);
  diamonds += d; stone += s; oil += o;
  clampResources(); updateUI(); save();
  message('پاداش روزانه: +' + d + ' الماس، +' + s + ' سنگ، +' + o + ' نفت');
});

let atkPick = null;
const deploy = {};
function openAttackPage() {
  if (totalTroops() <= 0) { message('نیرویی برای حمله ندارید'); return; }
  Object.keys(deploy).forEach(k => delete deploy[k]);
  atkPick = null;
  document.querySelectorAll('.drop-zones').forEach(dz => {
    dz.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      const z = document.createElement('div');
      z.className = 'drop-zone'; z.dataset.slot = i;
      z.addEventListener('click', () => {
        if (!atkPick) { message('ابتدا نوع نیرو را انتخاب کنید'); return; }
        const side = dz.dataset.side;
        const key = side + '-' + i;
        deploy[key] = { type: atkPick, side };
        z.classList.add('filled'); z.textContent = troopIcons[atkPick];
        updateDeployUI();
      });
      dz.appendChild(z);
    }
  });
  const btns = $('atk-troop-btns');
  if (btns) {
    btns.innerHTML = Object.keys(troops).filter(t => troops[t] > 0).map(t =>
      `<button data-atk="${t}">${troopIcons[t]} ${troopNames[t]} ×${troops[t]}</button>`
    ).join('');
    btns.querySelectorAll('[data-atk]').forEach(b => {
      b.addEventListener('click', () => {
        atkPick = b.dataset.atk;
        btns.querySelectorAll('button').forEach(x => x.classList.remove('picked'));
        b.classList.add('picked');
        message('نیرو: ' + troopNames[atkPick] + ' — نقطه حمله را بزنید');
      });
    });
  }
  updateDeployUI();
  if ($('attack-result')) $('attack-result').textContent = '';
  $('attack-page')?.classList.remove('hide');
}
function updateDeployUI() {
  const n = Object.keys(deploy).length;
  if ($('deploy-summary')) {
    $('deploy-summary').textContent = n
      ? Object.entries(deploy).map(([, v]) => troopIcons[v.type] + ' → ' + v.side).join(' · ')
      : 'هنوز نیرویی مستقر نشده';
  }
  const go = $('attack-go'); if (go) go.disabled = n === 0;
}
$('attack')?.addEventListener('click', openAttackPage);
$('attack-close')?.addEventListener('click', () => $('attack-page')?.classList.add('hide'));
$('attack-go')?.addEventListener('click', () => {
  const deployed = Object.values(deploy);
  if (!deployed.length) return;
  let atkPower = 0;
  deployed.forEach(d => {
    let p = troopPower[d.type];
    if (d.side === 'north' && (troopAtk[d.type] === 'charge' || troopAtk[d.type] === 'melee')) p *= 1.25;
    if (d.side === 'center' && troopAtk[d.type] === 'ranged') p *= 1.3;
    if (d.side === 'south' && troopAtk[d.type] === 'raid') p *= 1.35;
    atkPower += p;
  });
  const defPower = enemyHP * 0.45 + countType('cannon') * 15 + countType('warcannon') * 30 + countType('wall') * 5;
  const diff = Math.abs(atkPower - defPower);
  const used = {};
  deployed.forEach(d => { used[d.type] = (used[d.type] || 0) + 1; });
  Object.keys(used).forEach(t => { troops[t] = Math.max(0, troops[t] - used[t]); });
  let won;
  if (diff <= 7) {
    const types = deployed.map(d => troopAtk[d.type]);
    const ranged = types.filter(t => t === 'ranged').length;
    const charge = types.filter(t => t === 'charge' || t === 'melee').length;
    won = ranged >= charge ? atkPower + 5 >= defPower : atkPower >= defPower - 3;
  } else won = atkPower > defPower;
  if (won) {
    const loot = 90 + Math.floor(Math.random() * 140);
    diamonds += loot; stone += 55; oil += 4; level++;
    enemyHP = 160 + level * 25;
    if ($('attack-result')) $('attack-result').textContent = 'پیروزی! +' + loot + ' الماس';
    message('حمله موفق بود!');
  } else {
    enemyHP = Math.max(40, enemyHP - Math.floor(atkPower * 0.3));
    if ($('attack-result')) $('attack-result').textContent = 'شکست — دفاع دشمن قوی‌تر بود';
    message('حمله ناموفق');
  }
  clampResources(); refreshTroopVisuals(); updateUI();
  const go = $('attack-go'); if (go) go.disabled = true;
});

$('btn-war')?.addEventListener('click', () => {
  if (!clan) { message('ابتدا از منو به کلن بپیوندید'); return; }
  const p = totalPower();
  if ($('war-my-power')) $('war-my-power').textContent = 'قدرت: ' + p;
  const enemyP = 80 + level * 25 + Math.floor(Math.random() * 40);
  if ($('war-enemy-power')) $('war-enemy-power').textContent = 'قدرت: ' + enemyP;
  if ($('war-enemy-name')) $('war-enemy-name').textContent = ['کلن سایه', 'کلن طوفان', 'کلن آهن'][Math.floor(Math.random() * 3)];
  const list = $('war-troop-list');
  if (list) list.innerHTML = Object.keys(troops).filter(t => troops[t] > 0)
    .map(t => `<div>${troopIcons[t]} ${troopNames[t]} ×${troops[t]} (قدرت ${troopPower[t]})</div>`).join('') || '<div>نیرویی ندارید</div>';
  if ($('war-result')) $('war-result').textContent = '';
  $('war-page')?.classList.remove('hide');
  $('war-fight').onclick = () => {
    const myP = totalPower();
    if (myP <= 0) { if ($('war-result')) $('war-result').textContent = 'نیرویی ندارید!'; return; }
    const diff = Math.abs(myP - enemyP);
    let won = myP > enemyP;
    if (diff <= 7) won = myP + (troops.archer * 2) >= enemyP;
    if (troops.swordsman) troops.swordsman--;
    else if (troops.archer) troops.archer--;
    else if (troops.thief) troops.thief--;
    else if (troops.cavalry) troops.cavalry--;
    if (won) {
      const loot = 80 + Math.floor(Math.random() * 120);
      diamonds += loot; stone += 50; oil += 5; level++;
      if ($('war-result')) $('war-result').textContent = 'پیروزی کلن! +' + loot + ' الماس';
      message('پیروزی در جنگ کلن!');
    } else {
      if ($('war-result')) $('war-result').textContent = 'شکست — نیروها آسیب دیدند';
      message('شکست در جنگ کلن');
    }
    clampResources(); refreshTroopVisuals(); updateUI();
  };
});
$('war-close')?.addEventListener('click', () => $('war-page')?.classList.add('hide'));

$('save')?.addEventListener('click', save);
$('menu')?.addEventListener('click', () => $('drawer')?.classList.remove('hide'));
$('close')?.addEventListener('click', () => $('drawer')?.classList.add('hide'));
$('reset')?.addEventListener('click', async () => {
  if (await confirmAction('شروع دوباره', 'همه پیشرفت پاک شود؟')) {
    localStorage.removeItem(SAVE_KEY); location.reload();
  }
});
$('retreat')?.addEventListener('click', () => $('modal')?.classList.add('hide'));

function applyView() {
  const angle = rot * Math.PI / 2 + Math.PI / 4;
  const dist = 22 / zoom;
  camera.position.set(Math.sin(angle) * dist, dist * 0.88, Math.cos(angle) * dist);
  camera.lookAt(0, 0.55, 0); camera.zoom = zoom; camera.updateProjectionMatrix();
}
$('left')?.addEventListener('click', () => { rot = (rot + 3) % 4; applyView(); });
$('right')?.addEventListener('click', () => { rot = (rot + 1) % 4; applyView(); });
$('plus')?.addEventListener('click', () => { zoom = Math.min(2.5, zoom + 0.15); applyView(); });
$('minus')?.addEventListener('click', () => { zoom = Math.max(0.5, zoom - 0.15); applyView(); });
applyView();

setInterval(() => {
  stone += countType('stonepit') * (2 + (getThLevel() - 1) * 0.3);
  clampResources(); updateUI();
}, 1200);
setInterval(() => {
  diamonds += countType('diamondmine') * 1;
  clampResources(); updateUI();
}, 60000);

// تیر با جزئیات
setInterval(() => {
  buildings.filter(b => b.type === 'cannon').forEach(b => {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.48, 5), M.wood);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.11, 5), M.metal);
    tip.position.y = 0.28; shaft.add(tip);
    const fletch = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.015, 0.05), M.flag);
    fletch.position.y = -0.2; shaft.add(fletch);
    shaft.position.set(b.x, 2.0, b.z);
    shaft.rotation.z = Math.PI / 2;
    const dir = new THREE.Vector3((Math.random() - 0.5) * 2, -0.04, (Math.random() - 0.5) * 2).normalize();
    shaft.userData = { vel: dir.multiplyScalar(0.2), life: 50 };
    scene.add(shaft); arrows.push(shaft);
  });
}, 2500);

window.addEventListener('resize', () => {
  const w = container.clientWidth, h = container.clientHeight;
  aspect = w / Math.max(h, 1);
  camera.left = -frustum * aspect; camera.right = frustum * aspect;
  camera.top = frustum; camera.bottom = -frustum;
  camera.updateProjectionMatrix(); renderer.setSize(w, h);
});

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();
  const dt = Math.min(clock.getDelta(), 0.05);

  buildingMeshes.forEach(mesh => {
    mesh.traverse(c => {
      if (c.userData?.spin) {
        c.rotation.y = t * 1.8;
        c.position.y = (c.userData.baseY || c.position.y) + Math.sin(t * 2.5) * 0.03;
      }
    });
  });

  troopMeshes.forEach(m => {
    const ph = m.userData.phase + t * m.userData.speed;
    m.position.x = m.userData.baseX + Math.sin(ph) * 0.14;
    m.position.z = m.userData.baseZ + Math.cos(ph * 0.7) * 0.11;
    m.position.y = Math.sin(t * 2.2 + m.userData.phase) * 0.025;
    m.rotation.y = Math.sin(ph) * 0.35;
  });

  // آتش + ذرات
  const f1 = campGroup.getObjectByName('fire');
  const f2 = campGroup.getObjectByName('fire2');
  if (f1) { f1.scale.set(1, 0.85 + Math.sin(t * 9) * 0.25, 1); f1.rotation.y = t * 3; }
  if (f2) { f2.scale.set(1, 1 + Math.sin(t * 7 + 1) * 0.3, 1); f2.rotation.y = -t * 2; }
  fireParticles.forEach(p => {
    const u = p.userData;
    p.position.y = u.baseY + ((t * u.speed + u.phase) % 1.2);
    p.position.x = u.x + Math.sin(t * 3 + u.phase) * 0.05;
    p.material.opacity = Math.max(0, 0.9 - (p.position.y - u.baseY) * 0.7);
    if (p.position.y > u.baseY + 1.1) p.position.y = u.baseY;
  });
  if (fireLight) fireLight.intensity = 1.2 + Math.sin(t * 6) * 0.35;

  for (let i = arrows.length - 1; i >= 0; i--) {
    const a = arrows[i];
    a.position.add(a.userData.vel);
    a.userData.life--;
    if (a.userData.life <= 0) { scene.remove(a); disposeObj(a); arrows.splice(i, 1); }
  }

  updateTraining();
  updateThUpgrade();
  updateCityNPCs(dt);
  renderer.render(scene, camera);
}

rebuildBuildings();
refreshTroopVisuals();
updateUI();
animate();

window.KingTownEngine = {
  version: '5.05',
  getBuildings: () => buildings,
  getTroops: () => ({ ...troops }),
  totalPower, capacity, campLimit,
  scene, camera, renderer
};
console.info('[KingTown] v5.05 detail graphics ready');
