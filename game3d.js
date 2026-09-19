/**
 * KingTown v6.0.1 — جهش گرافیکی عمیق
 * بافت رویه‌ای · شیدر · ذرات · روز/شب · ابر · گیاه · پرچم · مسیر · Kenney · جزئیات کامل
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const $ = id => document.getElementById(id);
const container = document.getElementById('scene-container');
const SAVE_KEY = 'kingTown_v601';

let diamonds = 200, stone = 420, tokens = 15, oil = 0, level = 1;
let rot = 0, zoom = 1.08, mode = 'build', chosen = null, selectedKey = null, moveTarget = null;
let enemyHP = 160, clan = null, thUpgrade = null, lastDaily = null;
const trainQueue = [];
const troops = { swordsman: 0, archer: 0, thief: 0, cavalry: 0 };
const MAX_MINE = 5, TH_MAX = 5, TOKEN_MAX = 100;

const defs = {
  townhall:    { name: 'مرکز فرماندهی', costD: 0, costT: 0, costS: 0, max: 1, hp: 500 },
  diamondmine: { name: 'معدن الماس', costD: 0, costT: 5, costS: 0, max: MAX_MINE, hp: 120 },
  stonepit:    { name: 'معدن سنگ', costD: 150, costT: 0, costS: 0, max: MAX_MINE, hp: 140 },
  barracks:    { name: 'پادگان', costD: 180, costT: 0, costS: 0, max: 99, hp: 200 },
  cannon:      { name: 'برج دفاعی', costD: 0, costT: 0, costS: 120, max: 99, hp: 180 },
  warcannon:   { name: 'توپ جنگی', costD: 0, costT: 0, costS: 200, max: 10, hp: 280 },
  wall:        { name: 'دیوار', costD: 0, costT: 0, costS: 40, max: 99, hp: 100 }
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
  { type: 'wall', x: 1, z: 3, rotY: 0, hp: 100, wallLevel: 1 }
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

// ===================== PROCEDURAL TEXTURES =====================
function makeNoiseCanvas(size, fn) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const v = fn(x, y, size);
      img.data[i] = v[0]; img.data[i + 1] = v[1]; img.data[i + 2] = v[2]; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

const texGrass = makeNoiseCanvas(128, (x, y, s) => {
  const n = hash2(x * 0.15, y * 0.15) * 0.3 + hash2(x * 0.4, y * 0.4) * 0.2;
  const g = 90 + n * 50, r = 40 + n * 20, b = 30 + n * 15;
  return [r, g, b];
});
texGrass.repeat.set(2, 2);

const texGrassB = makeNoiseCanvas(128, (x, y) => {
  const n = hash2(x * 0.12 + 10, y * 0.12) * 0.35;
  return [35 + n * 25, 80 + n * 45, 28 + n * 15];
});
texGrassB.repeat.set(2, 2);

const texStone = makeNoiseCanvas(128, (x, y) => {
  const n = hash2(x * 0.2, y * 0.2) * 0.4 + hash2(x * 0.5, y * 0.5) * 0.2;
  const v = 120 + n * 60;
  return [v * 0.85, v * 0.9, v * 0.88];
});
texStone.repeat.set(1.5, 1.5);

const texWood = makeNoiseCanvas(128, (x, y) => {
  const grain = Math.sin(y * 0.4) * 15 + hash2(x * 0.1, y * 0.3) * 25;
  return [90 + grain, 55 + grain * 0.5, 25 + grain * 0.3];
});
texWood.repeat.set(1, 2);

const texRoof = makeNoiseCanvas(64, (x, y) => {
  const n = hash2(x * 0.3, y * 0.3) * 0.3;
  return [160 + n * 40, 55 + n * 20, 35 + n * 15];
});
texRoof.repeat.set(2, 2);

const texDirt = makeNoiseCanvas(64, (x, y) => {
  const n = hash2(x * 0.25, y * 0.25) * 0.4;
  return [100 + n * 40, 80 + n * 30, 45 + n * 20];
});
texDirt.repeat.set(3, 3);

const texMetal = makeNoiseCanvas(64, (x, y) => {
  const n = hash2(x * 0.4, y * 0.4) * 0.3;
  const v = 100 + n * 50;
  return [v, v * 1.05, v * 0.95];
});

// ===================== SCENE & RENDERER =====================
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x7aab6a, 0.016);

const frustum = 12.5;
let aspect = container.clientWidth / Math.max(container.clientHeight, 1);
const camera = new THREE.OrthographicCamera(-frustum * aspect, frustum * aspect, frustum, -frustum, 0.1, 220);
camera.position.set(22, 19, 22);
camera.lookAt(0, 0.5, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2.5));
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.insertBefore(renderer.domElement, container.firstChild);
Object.assign(renderer.domElement.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', touchAction: 'none' });

// Sky gradient sphere
(function makeSky() {
  const c = document.createElement('canvas');
  c.width = 8; c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#4aa8e8'); g.addColorStop(0.4, '#9ad0e8');
  g.addColorStop(0.6, '#c0dca0'); g.addColorStop(1, '#5a9a48');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 8, 256);
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(95, 32, 16),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), side: THREE.BackSide, depthWrite: false })
  );
  sky.renderOrder = -20;
  scene.add(sky);
  scene.background = new THREE.Color(0x7ab8d0);
})();

// ===================== LIGHTING + DAY/NIGHT =====================
const hemi = new THREE.HemisphereLight(0xfff5e0, 0x3a6a30, 0.5);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2d0, 1.5);
sun.position.set(-16, 28, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1; sun.shadow.camera.far = 80;
sun.shadow.camera.left = sun.shadow.camera.bottom = -28;
sun.shadow.camera.right = sun.shadow.camera.top = 28;
sun.shadow.bias = -0.0002; sun.shadow.normalBias = 0.035; sun.shadow.radius = 2.2;
scene.add(sun);
const fill = new THREE.DirectionalLight(0xa0c8ff, 0.32);
fill.position.set(14, 10, -16); scene.add(fill);
const rim = new THREE.DirectionalLight(0xffd090, 0.22);
rim.position.set(0, 8, 18); scene.add(rim);
let dayPhase = 0.35; // 0..1

function updateDayNight(t) {
  dayPhase = (Math.sin(t * 0.02) * 0.5 + 0.5) * 0.3 + 0.35; // stay mostly day
  const warmth = 0.7 + dayPhase * 0.3;
  sun.intensity = 0.9 + dayPhase * 0.7;
  sun.color.setRGB(1, 0.92 * warmth, 0.8 * warmth);
  hemi.intensity = 0.35 + dayPhase * 0.25;
  renderer.toneMappingExposure = 1.05 + dayPhase * 0.3;
}

// ===================== MATERIALS =====================
const M = {
  grassA: new THREE.MeshStandardMaterial({ map: texGrass, roughness: 0.9, metalness: 0.0 }),
  grassB: new THREE.MeshStandardMaterial({ map: texGrassB, roughness: 0.9, metalness: 0.0 }),
  dirt: new THREE.MeshStandardMaterial({ map: texDirt, roughness: 0.95, metalness: 0.0 }),
  wood: new THREE.MeshStandardMaterial({ map: texWood, roughness: 0.78, metalness: 0.05 }),
  woodDark: new THREE.MeshStandardMaterial({ color: 0x3a2815, map: texWood, roughness: 0.82, metalness: 0.05 }),
  leaf: new THREE.MeshStandardMaterial({ color: 0x1e6a2a, roughness: 0.72 }),
  leafDark: new THREE.MeshStandardMaterial({ color: 0x14501e, roughness: 0.75 }),
  stone: new THREE.MeshStandardMaterial({ map: texStone, roughness: 0.68, metalness: 0.08 }),
  stoneDark: new THREE.MeshStandardMaterial({ color: 0x6a7670, map: texStone, roughness: 0.7, metalness: 0.1 }),
  stoneLight: new THREE.MeshStandardMaterial({ color: 0xb0bcb6, map: texStone, roughness: 0.6, metalness: 0.1 }),
  roof: new THREE.MeshStandardMaterial({ map: texRoof, roughness: 0.5, metalness: 0.12 }),
  metal: new THREE.MeshStandardMaterial({ map: texMetal, roughness: 0.35, metalness: 0.7 }),
  metalDark: new THREE.MeshStandardMaterial({ color: 0x3a4a42, map: texMetal, roughness: 0.4, metalness: 0.75 }),
  gold: new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.28, metalness: 0.85, emissive: 0x553300, emissiveIntensity: 0.18 }),
  flag: new THREE.MeshStandardMaterial({ color: 0xc02828, side: THREE.DoubleSide, roughness: 0.55 }),
  camp: new THREE.MeshStandardMaterial({ map: texDirt, color: 0x6a5040, roughness: 0.9 }),
  skin: new THREE.MeshStandardMaterial({ color: 0xd4a574, roughness: 0.7 }),
  clothBlue: new THREE.MeshStandardMaterial({ color: 0x2a4a8a, roughness: 0.65 }),
  clothPurple: new THREE.MeshStandardMaterial({ color: 0x6a2a8a, roughness: 0.65 }),
  clothGreen: new THREE.MeshStandardMaterial({ color: 0x3a4a2a, roughness: 0.65 }),
  clothBrown: new THREE.MeshStandardMaterial({ color: 0x6a3a1a, roughness: 0.65 }),
  sel: new THREE.MeshBasicMaterial({ color: 0x40e8f0, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
  plaster: new THREE.MeshStandardMaterial({ color: 0xd8c8a8, roughness: 0.75 })
};

// Crystal shader
const crystalUniforms = { time: { value: 0 }, color: { value: new THREE.Color(0x40e0f0) } };
const crystalMat = new THREE.ShaderMaterial({
  uniforms: crystalUniforms,
  vertexShader: `
    varying vec3 vN; varying vec3 vP;
    void main() {
      vN = normalize(normalMatrix * normal);
      vP = (modelViewMatrix * vec4(position,1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
    }`,
  fragmentShader: `
    uniform float time; uniform vec3 color;
    varying vec3 vN; varying vec3 vP;
    void main() {
      float fres = pow(1.0 - abs(dot(normalize(vN), normalize(-vP))), 2.2);
      float pulse = 0.55 + 0.45 * sin(time * 3.0 + vP.y * 4.0);
      vec3 col = color * (0.6 + fres * 0.8) * pulse + vec3(0.2,0.5,0.55) * fres;
      gl_FragColor = vec4(col, 0.88);
    }`,
  transparent: true
});

// Fire shader
const fireUniforms = { time: { value: 0 } };
const fireMat = new THREE.ShaderMaterial({
  uniforms: fireUniforms,
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
    }`,
  fragmentShader: `
    uniform float time; varying vec2 vUv;
    void main() {
      float f = vUv.y + sin(vUv.x * 10.0 + time * 8.0) * 0.05;
      vec3 col = mix(vec3(1.0,0.2,0.0), vec3(1.0,0.8,0.1), f);
      float a = smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.5, vUv.y);
      gl_FragColor = vec4(col, a * 0.9);
    }`,
  transparent: true, depthWrite: false, side: THREE.DoubleSide
});

// ===================== TERRAIN =====================
const tileGeo = new THREE.BoxGeometry(1, 0.14, 1);
for (let x = -13; x <= 13; x++) {
  for (let z = -13; z <= 13; z++) {
    const h = Math.sin(x * 0.3) * Math.cos(z * 0.3) * 0.04;
    const m = new THREE.Mesh(tileGeo, (x + z) % 2 === 0 ? M.grassA : M.grassB);
    m.position.set(x, -0.07 + h, z);
    m.receiveShadow = true;
    scene.add(m);
  }
}

// Dirt path through base
(function makePaths() {
  const pathMat = M.dirt;
  for (let z = -3; z <= 3; z++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 1), pathMat);
    p.position.set(0, -0.02, z); p.receiveShadow = true; scene.add(p);
  }
  for (let x = -2; x <= 2; x++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(1, 0.08, 1.4), pathMat);
    p.position.set(x, -0.02, 0); p.receiveShadow = true; scene.add(p);
  }
})();

// ===================== VEGETATION =====================
function makeTree(x, z, scale = 1) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.07 * scale, 0.13 * scale, 0.95 * scale, 6), M.wood);
  trunk.position.y = 0.48 * scale; trunk.castShadow = true; trunk.receiveShadow = true; g.add(trunk);
  [[1.15, 0.72, M.leaf], [1.55, 0.55, M.leaf], [1.88, 0.38, M.leafDark]].forEach(([y, s, mat]) => {
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(s * scale, 1), mat);
    leaf.position.y = y * scale; leaf.castShadow = true; g.add(leaf);
  });
  g.position.set(x, 0, z); g.rotation.y = Math.random() * 6.28; scene.add(g);
}
for (let i = -12; i <= 12; i++) {
  makeTree(i, -12, 0.85 + (Math.abs(i) % 3) * 0.12);
  makeTree(i, 12, 0.9 + (Math.abs(i) % 2) * 0.15);
  makeTree(-12, i, 0.88); makeTree(12, i, 0.92);
}
for (let i = -11; i <= 11; i += 2) {
  makeTree(i + 0.6, -11, 0.65); makeTree(i - 0.4, 11, 0.7);
  makeTree(-11, i + 0.5, 0.68); makeTree(11, i - 0.3, 0.72);
}

// Bushes & grass tufts
const bushGeo = new THREE.IcosahedronGeometry(0.25, 0);
for (let i = 0; i < 40; i++) {
  const bx = (Math.random() - 0.5) * 20;
  const bz = (Math.random() - 0.5) * 20;
  if (Math.abs(bx) < 4 && Math.abs(bz) < 4) continue;
  const bush = new THREE.Mesh(bushGeo, Math.random() > 0.5 ? M.leaf : M.leafDark);
  bush.position.set(bx, 0.15, bz);
  bush.scale.setScalar(0.6 + Math.random() * 0.8);
  bush.castShadow = true; scene.add(bush);
}

// ===================== CLOUDS =====================
const clouds = [];
function makeCloud(x, y, z) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xf0f4f8, roughness: 1, transparent: true, opacity: 0.85 });
  for (let i = 0; i < 5; i++) {
    const s = 0.8 + Math.random() * 1.2;
    const p = new THREE.Mesh(new THREE.SphereGeometry(s, 8, 6), mat);
    p.position.set((Math.random() - 0.5) * 2.5, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 1.2);
    g.add(p);
  }
  g.position.set(x, y, z);
  g.userData.speed = 0.15 + Math.random() * 0.2;
  scene.add(g); clouds.push(g);
}
for (let i = 0; i < 8; i++) {
  makeCloud((Math.random() - 0.5) * 40, 12 + Math.random() * 6, (Math.random() - 0.5) * 40);
}

// ===================== CAMP =====================
const campGroup = new THREE.Group();
const campFloor = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.2, 0.12, 32), M.camp);
campFloor.position.set(0, 0.04, -4.3); campFloor.receiveShadow = true; campFloor.castShadow = true; campGroup.add(campFloor);
for (let i = 0; i < 8; i++) {
  const a = (i / 8) * Math.PI * 2;
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.1 + Math.random() * 0.06, 0), M.stoneDark);
  rock.position.set(Math.cos(a) * 0.4, 0.1, -4.3 + Math.sin(a) * 0.4); rock.castShadow = true; campGroup.add(rock);
}
const fireCore = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.4, 6), fireMat);
fireCore.position.set(0, 0.32, -4.3); fireCore.name = 'fire'; campGroup.add(fireCore);
const fireOuter = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.52, 6), fireMat);
fireOuter.position.set(0, 0.38, -4.3); fireOuter.name = 'fire2'; campGroup.add(fireOuter);
const fireLight = new THREE.PointLight(0xff6020, 1.5, 8, 1.5);
fireLight.position.set(0, 0.6, -4.3); campGroup.add(fireLight);
const fireParticles = [];
for (let i = 0; i < 16; i++) {
  const p = new THREE.Mesh(
    new THREE.SphereGeometry(0.025 + Math.random() * 0.03, 4, 4),
    new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(0.07 + Math.random() * 0.06, 1, 0.55), transparent: true, opacity: 0.85 })
  );
  p.userData = { baseY: 0.35 + Math.random() * 0.2, speed: 0.5 + Math.random() * 0.7, phase: Math.random() * 6.28, x: (Math.random() - 0.5) * 0.2, z: (Math.random() - 0.5) * 0.2 };
  p.position.set(p.userData.x, p.userData.baseY, -4.3 + p.userData.z);
  campGroup.add(p); fireParticles.push(p);
}
// Tent, logs, bench
const tent = new THREE.Mesh(new THREE.ConeGeometry(0.75, 1.05, 4), new THREE.MeshStandardMaterial({ color: 0x6a4a28, map: texWood, roughness: 0.75 }));
tent.position.set(-1.35, 0.55, -4.0); tent.rotation.y = Math.PI / 4; tent.castShadow = true; campGroup.add(tent);
for (let i = 0; i < 5; i++) {
  const log = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.55, 6), M.woodDark);
  log.rotation.z = Math.PI / 2; log.rotation.y = i * 0.35;
  log.position.set(0.95, 0.1, -3.65 + i * 0.1); log.castShadow = true; campGroup.add(log);
}
const bench = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.08, 0.28), M.wood);
bench.position.set(1.25, 0.22, -4.85); bench.castShadow = true; campGroup.add(bench);
scene.add(campGroup);

// ===================== PARTICLES GLOBAL =====================
const leafParticles = [];
for (let i = 0; i < 25; i++) {
  const leaf = new THREE.Mesh(
    new THREE.PlaneGeometry(0.12, 0.08),
    new THREE.MeshBasicMaterial({ color: 0x4a8a30, side: THREE.DoubleSide, transparent: true, opacity: 0.8 })
  );
  leaf.position.set((Math.random() - 0.5) * 24, 2 + Math.random() * 5, (Math.random() - 0.5) * 24);
  leaf.userData = { speed: 0.3 + Math.random() * 0.4, sway: Math.random() * 6.28, rot: Math.random() };
  scene.add(leaf); leafParticles.push(leaf);
}
const smokeParticles = [];
const sparkles = [];

// ===================== KENNEY LOADER =====================
const gltfLoader = new GLTFLoader();
const kenneyCache = {};
const KENNEY_BASE = 'assets/kenney/Models/GLB format/';
function loadKenney(name) {
  return new Promise(resolve => {
    if (kenneyCache[name]) { resolve(kenneyCache[name].clone()); return; }
    gltfLoader.load(KENNEY_BASE + name + '.glb', gltf => {
      gltf.scene.traverse(c => {
        if (c.isMesh) {
          c.castShadow = true; c.receiveShadow = true;
          if (c.material) { c.material = c.material.clone(); c.material.roughness = 0.65; c.material.metalness = 0.08; }
        }
      });
      kenneyCache[name] = gltf.scene; resolve(gltf.scene.clone());
    }, undefined, () => resolve(null));
  });
}
['border', 'border-high', 'column', 'column-thin', 'border-corner'].forEach(n => loadKenney(n));

// ===================== BUILDINGS =====================
const buildingMeshes = new Map();
const troopMeshes = [];
const fullLabels = new Map();
const arrows = [];
const flagMeshes = [];

function disposeObj(obj) {
  obj.traverse(c => {
    if (c.geometry) c.geometry.dispose?.();
    if (c.material && !Object.values(M).includes(c.material) && c.material !== crystalMat && c.material !== fireMat) {
      (Array.isArray(c.material) ? c.material : [c.material]).forEach(m => m.dispose?.());
    }
  });
}

function thPalette(lv) {
  return [
    { body: 0xc89850, roof: 0xe0b858 }, { body: 0xb88840, roof: 0xd4a848 },
    { body: 0x8a6030, roof: 0xc09048 }, { body: 0x6a4820, roof: 0xa07838 },
    { body: 0x4a3018, roof: 0x806030 }
  ][Math.min(Math.max(lv, 1), 5) - 1];
}

function addSelRing(g) {
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.88, 40), M.sel);
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; ring.visible = false; ring.name = 'selRing';
  g.add(ring);
}

function addFlag(g, x, y, z) {
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.0, 5), M.wood);
  pole.position.set(x, y, z); g.add(pole);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.28), M.flag);
  flag.position.set(x + 0.24, y + 0.35, z);
  flag.userData.flagAnim = true;
  g.add(flag); flagMeshes.push(flag);
}

function createBuildingMesh(b) {
  const g = new THREE.Group();
  g.userData = { key: `${b.x},${b.z}`, type: b.type };
  const wLv = b.wallLevel || 1;
  const dLv = b.defLevel || 1;

  if (b.type === 'wall') {
    const h = 0.9 + wLv * 0.12;
    const thick = 0.46 + wLv * 0.04;
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.14, h, thick), wLv >= 3 ? M.stoneLight : M.stone);
    body.position.y = h / 2 + 0.02; body.castShadow = true; body.receiveShadow = true; g.add(body);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.1, thick + 0.1), M.stoneDark);
    cap.position.y = h + 0.05; cap.castShadow = true; g.add(cap);
    for (let i = -0.4; i <= 0.4; i += 0.4) {
      const mer = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.24 + wLv * 0.04, thick + 0.08), M.stoneDark);
      mer.position.set(i, h + 0.2, 0); mer.castShadow = true; g.add(mer);
    }
    for (let y = 0.2; y < h; y += 0.2) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.02, thick + 0.01), M.stoneDark);
      line.position.y = y; g.add(line);
    }
    if (wLv >= 2) {
      const iron = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.06, 0.05), M.metalDark);
      iron.position.set(0, h * 0.5, thick / 2 + 0.02); g.add(iron);
    }
    if (wLv >= 3) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 4), M.metal);
      spike.position.set(0, h + 0.4, 0); g.add(spike);
    }
    addSelRing(g); g.rotation.y = ((b.rotY || 0) * Math.PI) / 180; return g;
  }

  if (b.type === 'cannon') {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.66, 0.32, 12), M.wood);
    base.position.y = 0.16; base.castShadow = true; base.receiveShadow = true; g.add(base);
    const th = 1.5 + dLv * 0.15;
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.38 + dLv * 0.02, 0.5, th, 12), M.stone);
    tower.position.y = 0.32 + th / 2; tower.castShadow = true; tower.receiveShadow = true; g.add(tower);
    for (let y = 0.5; y < 0.32 + th; y += 0.3) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.035, 6, 20), M.stoneDark);
      band.rotation.x = Math.PI / 2; band.position.y = y; g.add(band);
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const mer = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.26, 0.14), M.stoneLight);
      mer.position.set(Math.cos(a) * 0.44, 0.32 + th + 0.1, Math.sin(a) * 0.44); mer.castShadow = true; g.add(mer);
    }
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.24, 0.13), M.clothPurple);
    torso.position.y = 0.32 + th - 0.05; g.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 6), M.skin);
    head.position.y = 0.32 + th + 0.18; g.add(head);
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.015, 5, 12, Math.PI), M.wood);
    bow.position.set(0.13, 0.32 + th, 0); bow.rotation.y = Math.PI / 2; g.add(bow);
    if (dLv >= 2) addFlag(g, 0.5, 0.32 + th * 0.5, 0);
    g.userData.isTower = true; addSelRing(g); return g;
  }

  if (b.type === 'warcannon') {
    const platform = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.18, 1.05), M.woodDark);
    platform.position.y = 0.09; platform.castShadow = true; platform.receiveShadow = true; g.add(platform);
    [-0.48, 0.48].forEach(ox => {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.12, 14), M.wood);
      wheel.rotation.z = Math.PI / 2; wheel.position.set(ox, 0.26, 0); wheel.castShadow = true; g.add(wheel);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.14, 8), M.metal);
      hub.rotation.z = Math.PI / 2; hub.position.set(ox, 0.26, 0); g.add(hub);
      for (let i = 0; i < 6; i++) {
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.03), M.woodDark);
        spoke.position.set(ox, 0.26, 0); spoke.rotation.z = Math.PI / 2; spoke.rotation.x = (i / 6) * Math.PI; g.add(spoke);
      }
    });
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.05, 8), M.metalDark);
    axle.rotation.z = Math.PI / 2; axle.position.y = 0.26; g.add(axle);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.2, 12), M.metal);
    barrel.rotation.z = Math.PI / 2; barrel.position.set(0.22, 0.52, 0); barrel.castShadow = true; g.add(barrel);
    const reinforce = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.03, 6, 12), M.metalDark);
    reinforce.rotation.y = Math.PI / 2; reinforce.position.set(0.1, 0.52, 0); g.add(reinforce);
    const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.12, 0.14, 12), M.metalDark);
    muzzle.rotation.z = Math.PI / 2; muzzle.position.set(0.88, 0.52, 0); g.add(muzzle);
    const breech = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.28), M.metalDark);
    breech.position.set(-0.35, 0.42, 0); g.add(breech);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), M.metalDark);
    ball.position.set(-0.15, 0.2, 0.4); ball.castShadow = true; g.add(ball);
    // smoke emitter marker
    g.userData.smokePos = new THREE.Vector3(0.9, 0.55, 0);
    addSelRing(g); return g;
  }

  const isTH = b.type === 'townhall';
  const lv = isTH ? (b.thLevel || 1) : 1;
  const pal = isTH ? thPalette(lv) : null;

  const base = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.22, 1.25), M.stoneDark);
  base.position.y = 0.11; base.castShadow = true; base.receiveShadow = true; g.add(base);
  const step = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.1, 0.28), M.stone);
  step.position.set(0, 0.14, 0.58); g.add(step);

  if (isTH) {
    if (lv >= 3) {
      const bodyH = 1.1 + (lv - 3) * 0.35;
      const bodyMat = new THREE.MeshStandardMaterial({ color: pal.body, roughness: 0.48, metalness: 0.14, map: texStone });
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.64, bodyH, 10), bodyMat);
      body.position.y = 0.22 + bodyH / 2; body.castShadow = true; body.receiveShadow = true; g.add(body);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, bodyH * 0.9, 6), M.stoneLight);
        col.position.set(Math.cos(a) * 0.58, 0.22 + bodyH * 0.45, Math.sin(a) * 0.58); col.castShadow = true; g.add(col);
      }
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.3;
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.05),
          new THREE.MeshStandardMaterial({ color: 0xf5e090, emissive: 0x775500, emissiveIntensity: 0.5 }));
        win.position.set(Math.cos(a) * 0.62, 0.55 + bodyH * 0.25, Math.sin(a) * 0.62);
        win.lookAt(0, win.position.y, 0); g.add(win);
      }
      const roofMat = new THREE.MeshStandardMaterial({ color: pal.roof, map: texRoof, roughness: 0.35, metalness: 0.28 });
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.82, 0.7 + lv * 0.04, 10), roofMat);
      roof.position.y = 0.22 + bodyH + 0.35; roof.castShadow = true; g.add(roof);
      const balc = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.08, 10), M.stone);
      balc.position.y = 0.22 + bodyH * 0.55; g.add(balc);
      addFlag(g, 0, 0.22 + bodyH + 0.9, 0);
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
      const bodyMat = new THREE.MeshStandardMaterial({ color: pal.body, roughness: 0.52, metalness: 0.1, map: texStone });
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.0, bodyH, 1.0), bodyMat);
      body.position.y = 0.22 + bodyH / 2; body.castShadow = true; body.receiveShadow = true; g.add(body);
      const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.5, 0.06), M.woodDark);
      doorFrame.position.set(0, 0.4, 0.52); g.add(doorFrame);
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.42, 0.04), M.wood);
      door.position.set(0, 0.38, 0.55); g.add(door);
      [-0.28, 0.28].forEach(wx => {
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.04),
          new THREE.MeshStandardMaterial({ color: 0xf0d870, emissive: 0x664400, emissiveIntensity: 0.4 }));
        win.position.set(wx, 0.55 + bodyH * 0.25, 0.51); g.add(win);
      });
      const roofMat = new THREE.MeshStandardMaterial({ color: pal.roof, map: texRoof, roughness: 0.4, metalness: 0.2 });
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.88, 0.52 + lv * 0.06, 4), roofMat);
      roof.position.y = 0.22 + bodyH + 0.28; roof.rotation.y = Math.PI / 4; roof.castShadow = true; g.add(roof);
      addFlag(g, 0, 0.22 + bodyH + 0.65, 0);
    }
    addSelRing(g); return g;
  }

  if (b.type === 'diamondmine') {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.7, 1.0), new THREE.MeshStandardMaterial({ color: 0x2a6a70, roughness: 0.55, metalness: 0.15, map: texStone }));
    frame.position.y = 0.55; frame.castShadow = true; frame.receiveShadow = true; g.add(frame);
    [[-0.48, -0.48], [0.48, -0.48], [-0.48, 0.48], [0.48, 0.48]].forEach(([px, pz]) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.3, 5), M.wood);
      post.position.set(px, 0.85, pz); post.castShadow = true; g.add(post);
    });
    const beam = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.08, 0.08), M.woodDark);
    beam.position.y = 1.45; g.add(beam);
    [[0, 1.55, 0.28], [0.25, 1.35, 0.18], [-0.22, 1.4, 0.2], [0.1, 1.75, 0.22]].forEach(([cx, cy, s], i) => {
      const cry = new THREE.Mesh(new THREE.OctahedronGeometry(s, 0), crystalMat);
      cry.position.set(cx, cy, i * 0.05 - 0.08);
      cry.rotation.set(Math.random(), Math.random(), Math.random());
      cry.castShadow = true;
      if (i === 0) cry.userData.spin = true;
      g.add(cry);
    });
    const glow = new THREE.PointLight(0x40e0f0, 0.9, 4.5);
    glow.position.set(0, 1.6, 0); g.add(glow);
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.15, 8), M.metal);
    bucket.position.set(0.35, 0.95, 0.35); g.add(bucket);
    addSelRing(g); return g;
  }

  if (b.type === 'stonepit') {
    const pit = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 0.35, 10), M.dirt);
    pit.position.y = 0.28; pit.receiveShadow = true; g.add(pit);
    for (let i = 0; i < 10; i++) {
      const s = 0.1 + Math.random() * 0.16;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), i % 2 ? M.stone : M.stoneDark);
      rock.position.set((Math.random() - 0.5) * 0.7, 0.4 + Math.random() * 0.5, (Math.random() - 0.5) * 0.7);
      rock.rotation.set(Math.random(), Math.random(), Math.random());
      rock.castShadow = true; g.add(rock);
    }
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.7, 5), M.wood);
    handle.position.set(0.4, 0.7, 0.3); handle.rotation.z = 0.5; g.add(handle);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.08, 0.08), M.metal);
    head.position.set(0.55, 0.95, 0.3); g.add(head);
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.25, 0.3), M.wood);
    crate.position.set(-0.4, 0.35, 0.35); crate.castShadow = true; g.add(crate);
    addSelRing(g); return g;
  }

  if (b.type === 'barracks') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.85, 0.9), new THREE.MeshStandardMaterial({ color: 0xa06838, map: texWood, roughness: 0.6, metalness: 0.05 }));
    body.position.y = 0.65; body.castShadow = true; body.receiveShadow = true; g.add(body);
    const roofL = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.08, 0.55), M.roof);
    roofL.position.set(0, 1.2, -0.2); roofL.rotation.x = 0.35; roofL.castShadow = true; g.add(roofL);
    const roofR = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.08, 0.55), M.roof);
    roofR.position.set(0, 1.2, 0.2); roofR.rotation.x = -0.35; roofR.castShadow = true; g.add(roofR);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.55, 0.05), M.woodDark);
    door.position.set(0, 0.5, 0.48); g.add(door);
    addFlag(g, 0.55, 1.35, 0);
    const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 6), new THREE.MeshStandardMaterial({ color: 0xc04030, metalness: 0.35, roughness: 0.45 }));
    shield.rotation.x = Math.PI / 2; shield.position.set(-0.35, 0.85, 0.48); g.add(shield);
    const rack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.08), M.woodDark);
    rack.position.set(0.3, 0.7, 0.48); g.add(rack);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshBasicMaterial({ color: 0xe8a020, transparent: true, opacity: 0 }));
    glow.position.y = 1.7; glow.name = 'trainGlow'; g.add(glow);
    addSelRing(g); return g;
  }

  addSelRing(g); return g;
}

function rebuildBuildings() {
  flagMeshes.length = 0;
  buildingMeshes.forEach(m => { scene.remove(m); disposeObj(m); });
  buildingMeshes.clear();
  buildings.forEach(b => {
    const mesh = createBuildingMesh(b);
    mesh.position.set(b.x, 0, b.z);
    scene.add(mesh);
    buildingMeshes.set(`${b.x},${b.z}`, mesh);
  });
  updateSelectionVisual(); updateFullLabels();
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
      let extra = '';
      if (b.type === 'wall') extra = ` (سطح ${b.wallLevel || 1})`;
      if (b.type === 'cannon' || b.type === 'warcannon') extra = ` (سطح ${b.defLevel || 1})`;
      if (b.type === 'townhall') extra = ` (سطح ${b.thLevel || 1})`;
      $('sel-name').textContent = defs[b.type].name + extra + hpStr;
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

// ===================== TROOPS =====================
function createTroopMesh(type) {
  const g = new THREE.Group();
  if (type === 'cavalry') {
    const horse = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.3, 0.58), new THREE.MeshStandardMaterial({ color: 0x5a3a1e, map: texWood, roughness: 0.7 }));
    horse.position.y = 0.36; horse.castShadow = true; g.add(horse);
    const hHead = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.15, 0.3), new THREE.MeshStandardMaterial({ color: 0x5a3a1e }));
    hHead.position.set(0, 0.5, 0.38); g.add(hHead);
    [-0.13, 0.13].forEach(lx => [0.16, -0.16].forEach(lz => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.3, 0.07), new THREE.MeshStandardMaterial({ color: 0x3a2a12 }));
      leg.position.set(lx, 0.15, lz); g.add(leg);
    }));
    const rider = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.26, 0.14), M.clothBrown);
    rider.position.y = 0.62; rider.castShadow = true; g.add(rider);
    const rHead = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), M.skin);
    rHead.position.y = 0.82; g.add(rHead);
    const lance = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.75, 5), M.metal);
    lance.position.set(0.16, 0.72, 0.12); lance.rotation.z = -0.35; g.add(lance);
    return g;
  }
  const cloth = type === 'swordsman' ? M.clothBlue : type === 'archer' ? M.clothPurple : M.clothGreen;
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.13), new THREE.MeshStandardMaterial({ color: 0x2a2a2a }));
  legs.position.y = 0.2; g.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.34, 0.17), cloth);
  torso.position.y = 0.54; torso.castShadow = true; g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 8, 6), M.skin);
  head.position.y = 0.82; g.add(head);
  if (type === 'swordsman') {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.2, 0.19), M.metal); plate.position.y = 0.58; g.add(plate);
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.125, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), M.metalDark);
    helm.position.y = 0.88; g.add(helm);
    const sword = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.48, 0.04), M.metal);
    sword.position.set(0.22, 0.58, 0); g.add(sword);
  }
  if (type === 'archer') {
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshStandardMaterial({ color: 0x3a2a15 }));
    hair.position.y = 0.9; hair.scale.set(1, 0.55, 1); g.add(hair);
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.02, 5, 12, Math.PI), M.wood);
    bow.position.set(0.2, 0.58, 0); bow.rotation.y = Math.PI / 2; g.add(bow);
  }
  if (type === 'thief') {
    const hood = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.22, 7), M.clothGreen);
    hood.position.y = 0.98; g.add(hood);
    const bag = new THREE.Mesh(new THREE.SphereGeometry(0.1, 7, 5), M.woodDark);
    bag.position.set(-0.17, 0.42, 0); g.add(bag);
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

// ===================== CITY NPCs =====================
const cityNPCs = [];
function spawnCityNPCs() {
  cityNPCs.forEach(n => scene.remove(n.mesh));
  cityNPCs.length = 0;
  const paths = [
    { points: [[-3, -2], [3, -2], [3, 1], [-3, 1]], speed: 0.35 },
    { points: [[-4, 0], [-4, 3], [1, 3], [1, 0]], speed: 0.28 },
    { points: [[2, -3], [4, 0], [2, 2], [0, -1]], speed: 0.4 },
    { points: [[-2, 2], [0, 0], [2, -2], [-1, -3]], speed: 0.32 },
    { points: [[-5, -1], [-1, -4], [3, -3], [4, 1]], speed: 0.3 },
    { points: [[1, 2], [-2, 3], [-3, 0], [0, -2]], speed: 0.33 }
  ];
  paths.forEach((path, pi) => {
    const types = ['swordsman', 'archer', 'thief', 'swordsman', 'archer', 'thief'];
    const mesh = createTroopMesh(types[pi % types.length]);
    mesh.scale.setScalar(0.68);
    mesh.position.set(path.points[0][0], 0, path.points[0][1]);
    scene.add(mesh);
    cityNPCs.push({ mesh, path: path.points, speed: path.speed, t: Math.random() });
  });
}
function updateCityNPCs(dt) {
  cityNPCs.forEach(npc => {
    const pts = npc.path;
    const i0 = Math.floor(npc.t) % pts.length;
    const i1 = (i0 + 1) % pts.length;
    const f = npc.t - Math.floor(npc.t);
    npc.mesh.position.x = pts[i0][0] + (pts[i1][0] - pts[i0][0]) * f;
    npc.mesh.position.z = pts[i0][1] + (pts[i1][1] - pts[i0][1]) * f;
    npc.mesh.position.y = Math.sin(npc.t * 8) * 0.02;
    npc.mesh.rotation.y = Math.atan2(pts[i1][0] - pts[i0][0], pts[i1][1] - pts[i0][1]);
    npc.t += dt * npc.speed * 0.15;
  });
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
    const raw = localStorage.getItem(SAVE_KEY) || localStorage.getItem('kingTown_v505') || localStorage.getItem('kingTown_v420');
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

// ===================== INPUT / GAME LOGIC =====================
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
      rebuildBuildings(); selectedKey = key; updateSelectionVisual();
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

$('btn-rotate-sel')?.addEventListener('click', () => {
  const b = buildings.find(o => `${o.x},${o.z}` === selectedKey);
  if (b?.type === 'wall') { b.rotY = ((b.rotY || 0) + 45) % 360; rebuildBuildings(); message(b.rotY + '°'); }
});
$('btn-deselect')?.addEventListener('click', () => { selectedKey = null; moveTarget = null; updateSelectionVisual(); });

function startTraining(type) {
  if (countType('barracks') < 1) { message('ابتدا پادگان بسازید'); return; }
  if (totalTroops() + trainQueue.length >= campLimit()) { message('ظرفیت کمپ پر است (حداکثر ' + campLimit() + ')'); return; }
  const cost = troopCost[type];
  if (oil < cost) { message('نفت کافی نیست'); return; }
  oil -= cost;
  const dur = troopTime[type] * 1000;
  trainQueue.push({ type, endsAt: performance.now() + dur, duration: dur });
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
  } else if (code) message('کد نامعتبر است');
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
        deploy[side + '-' + i] = { type: atkPick, side };
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

// Arrows from towers
setInterval(() => {
  buildings.filter(b => b.type === 'cannon').forEach(b => {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.48, 5), M.wood);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.11, 5), M.metal);
    tip.position.y = 0.28; shaft.add(tip);
    shaft.position.set(b.x, 2.0, b.z);
    shaft.rotation.z = Math.PI / 2;
    const dir = new THREE.Vector3((Math.random() - 0.5) * 2, -0.04, (Math.random() - 0.5) * 2).normalize();
    shaft.userData = { vel: dir.multiplyScalar(0.2), life: 50 };
    scene.add(shaft); arrows.push(shaft);
  });
}, 2500);

// War cannon smoke
setInterval(() => {
  buildings.filter(b => b.type === 'warcannon').forEach(b => {
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(
        new THREE.SphereGeometry(0.08 + Math.random() * 0.06, 6, 5),
        new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.5 })
      );
      s.position.set(b.x + 0.9, 0.6, b.z);
      s.userData = { vel: new THREE.Vector3(0.02 + Math.random() * 0.03, 0.04 + Math.random() * 0.03, (Math.random() - 0.5) * 0.02), life: 40 };
      scene.add(s); smokeParticles.push(s);
    }
  });
}, 3200);

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

  crystalUniforms.time.value = t;
  fireUniforms.time.value = t;
  updateDayNight(t);

  buildingMeshes.forEach(mesh => {
    mesh.traverse(c => {
      if (c.userData?.spin) {
        c.rotation.y = t * 1.8;
        c.position.y += Math.sin(t * 2.5) * 0.0005;
      }
    });
  });

  flagMeshes.forEach((f, i) => {
    f.rotation.y = Math.sin(t * 2.5 + i) * 0.25;
    f.scale.x = 1 + Math.sin(t * 3 + i) * 0.05;
  });

  troopMeshes.forEach(m => {
    const ph = m.userData.phase + t * m.userData.speed;
    m.position.x = m.userData.baseX + Math.sin(ph) * 0.14;
    m.position.z = m.userData.baseZ + Math.cos(ph * 0.7) * 0.11;
    m.position.y = Math.sin(t * 2.2 + m.userData.phase) * 0.025;
    m.rotation.y = Math.sin(ph) * 0.35;
  });

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
  if (fireLight) fireLight.intensity = 1.2 + Math.sin(t * 6) * 0.4;

  leafParticles.forEach(p => {
    p.position.y -= p.userData.speed * dt * 0.5;
    p.position.x += Math.sin(t + p.userData.sway) * 0.01;
    p.rotation.z += p.userData.rot * dt;
    if (p.position.y < 0) p.position.y = 6 + Math.random() * 3;
  });

  clouds.forEach(c => {
    c.position.x += c.userData.speed * dt;
    if (c.position.x > 25) c.position.x = -25;
  });

  for (let i = arrows.length - 1; i >= 0; i--) {
    const a = arrows[i];
    a.position.add(a.userData.vel);
    a.userData.life--;
    if (a.userData.life <= 0) { scene.remove(a); disposeObj(a); arrows.splice(i, 1); }
  }
  for (let i = smokeParticles.length - 1; i >= 0; i--) {
    const s = smokeParticles[i];
    s.position.add(s.userData.vel);
    s.userData.life--;
    s.material.opacity *= 0.97;
    s.scale.multiplyScalar(1.02);
    if (s.userData.life <= 0) { scene.remove(s); disposeObj(s); smokeParticles.splice(i, 1); }
  }

  updateTraining();
  updateThUpgrade();
  updateCityNPCs(dt);
  renderer.render(scene, camera);
}

rebuildBuildings();
spawnCityNPCs();
refreshTroopVisuals();
updateUI();
animate();

window.KingTownEngine = {
  version: '6.0.1',
  getBuildings: () => buildings,
  getTroops: () => ({ ...troops }),
  totalPower, capacity, campLimit,
  scene, camera, renderer
};
console.info('[KingTown] v6.0.1 deep graphics ready');
