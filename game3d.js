/**
 * KingTown v6.1.0 — جهش گرافیکی عمیق
 * بافت رویه‌ای · شیدر · ذرات · روز/شب · ابر · گیاه · پرچم · مسیر · Kenney · جزئیات کامل
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const $ = id => document.getElementById(id);
const container = document.getElementById('scene-container');
const SAVE_KEY = 'kingTown_v610';

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
  // ظرفیت کامل وابسته به سطح مرکز فرماندهی
  return {
    diamonds: 300 + lv * 200,
    stone: 600 + lv * 400,
    oil: 30 + lv * 25,
    tokens: TOKEN_MAX
  };
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

function smoothNoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
function fbm(x, y, oct) {
  oct = oct || 4;
  let v = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { v += a * smoothNoise(x * f, y * f); f *= 2; a *= 0.5; }
  return v;
}
function makeNormalApprox(size, heightFn) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const hL = heightFn(x - 1, y), hR = heightFn(x + 1, y);
      const hD = heightFn(x, y - 1), hU = heightFn(x, y + 1);
      let nx = (hL - hR) * 0.5, ny = (hD - hU) * 0.5, nz = 1.0;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      const i = (y * size + x) * 4;
      img.data[i] = ((nx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((nz / len) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
const texCobble = makeNoiseCanvas(128, (x, y) => {
  const cx = Math.floor(x / 16), cy = Math.floor(y / 16);
  const n = hash2(cx, cy);
  const lx = x % 16, ly = y % 16;
  const edge = (lx < 1 || ly < 1 || lx > 14 || ly > 14) ? 30 : 0;
  const v = 100 + n * 50 - edge;
  return [v * 0.9, v * 0.92, v * 0.88];
});
if (texCobble.repeat) texCobble.repeat.set(2, 2);
const texPlasterHQ = makeNoiseCanvas(128, (x, y) => {
  const n = hash2(x * 0.1, y * 0.1);
  return [200 + n * 30, 190 + n * 25, 160 + n * 20];
});
const texGoldHQ = makeNoiseCanvas(64, (x, y) => {
  const n = hash2(x * 0.2, y * 0.2);
  return [220 + n * 30, 180 + n * 40, 40 + n * 20];
});
const nmlStone = makeNormalApprox(64, (x, y) => hash2(x * 0.2, y * 0.2));
const nmlGrass = makeNormalApprox(64, (x, y) => hash2(x * 0.15, y * 0.15));
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
      try { enhanceMaterialsWithNormals(); scatterExtraVegetation(); } catch (e) { console.warn(e); }
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


const DetailLib = {
  addBrickRow(g, y, w, d, mat) {
    const row = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, d), mat);
    row.position.y = y; g.add(row); return row;
  },
  addWindowLit(g, x, y, z, intensity) {
    intensity = intensity || 0.4;
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.2, 0.05),
      new THREE.MeshStandardMaterial({ color: 0xf5e090, emissive: 0x775500, emissiveIntensity: intensity }));
    win.position.set(x, y, z); g.add(win); return win;
  },
  addColumn(g, x, y, z, h, mat) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, h, 6), mat);
    col.position.set(x, y, z); col.castShadow = true; g.add(col); return col;
  },
  addCrate(g, x, y, z, s) {
    s = s || 0.3;
    const crate = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.8, s * 0.9), M.wood);
    crate.position.set(x, y, z); crate.castShadow = true; g.add(crate); return crate;
  },
  addBarrel(g, x, y, z) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.13, 0.28, 8), M.woodDark);
    barrel.position.set(x, y, z); barrel.castShadow = true; g.add(barrel);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.125, 0.015, 4, 10), M.metalDark);
    ring.rotation.x = Math.PI / 2; ring.position.set(x, y + 0.05, z); g.add(ring);
    return barrel;
  },
  addLantern(g, x, y, z) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 5), M.wood);
    pole.position.set(x, y, z); g.add(pole);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 5),
      new THREE.MeshStandardMaterial({ color: 0xffcc66, emissive: 0xffaa33, emissiveIntensity: 0.6 }));
    lamp.position.set(x, y + 0.3, z); g.add(lamp);
    const light = new THREE.PointLight(0xffaa55, 0.35, 3);
    light.position.set(x, y + 0.3, z); g.add(light);
    return lamp;
  },
  addFlower(g, x, z, color) {
    color = color || 0xe05080;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.2, 4), M.leaf);
    stem.position.set(x, 0.1, z); g.add(stem);
    const pet = new THREE.Mesh(new THREE.SphereGeometry(0.06, 5, 4),
      new THREE.MeshStandardMaterial({ color: color, roughness: 0.7 }));
    pet.position.set(x, 0.22, z); g.add(pet); return pet;
  },
  addRockPile(g, x, z, n) {
    n = n || 5;
    for (let i = 0; i < n; i++) {
      const s = 0.08 + Math.random() * 0.12;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), i % 2 ? M.stone : M.stoneDark);
      rock.position.set(x + (Math.random() - 0.5) * 0.4, s * 0.5, z + (Math.random() - 0.5) * 0.4);
      rock.rotation.set(Math.random(), Math.random(), Math.random());
      rock.castShadow = true; g.add(rock);
    }
  },
  surfacePresets: {
    royalStone: { color: 0xb8a888, roughness: 0.55, metalness: 0.12 },
    darkOak: { color: 0x4a3018, roughness: 0.8, metalness: 0.05 },
    copperRoof: { color: 0xb07040, roughness: 0.45, metalness: 0.25 },
    slateRoof: { color: 0x4a5560, roughness: 0.5, metalness: 0.15 },
    marble: { color: 0xe8e0d0, roughness: 0.4, metalness: 0.1 },
    ironBand: { color: 0x3a3a42, roughness: 0.35, metalness: 0.7 },
    mossy: { color: 0x5a7a48, roughness: 0.85, metalness: 0.0 },
    sandBrick: { color: 0xc4a870, roughness: 0.7, metalness: 0.05 }
  },
  matFromPreset(name) {
    const p = this.surfacePresets[name] || this.surfacePresets.royalStone;
    return new THREE.MeshStandardMaterial({ color: p.color, roughness: p.roughness, metalness: p.metalness });
  },
  ornamentPatterns: [
    { id: 0, sides: 4, radius: 0.10, h: 0.15, mat: "stone" },
    { id: 1, sides: 5, radius: 0.12, h: 0.20, mat: "wood" },
    { id: 2, sides: 6, radius: 0.14, h: 0.25, mat: "metal" },
    { id: 3, sides: 7, radius: 0.16, h: 0.30, mat: "gold" },
    { id: 4, sides: 8, radius: 0.18, h: 0.15, mat: "stone" },
    { id: 5, sides: 4, radius: 0.20, h: 0.20, mat: "wood" },
    { id: 6, sides: 5, radius: 0.22, h: 0.25, mat: "metal" },
    { id: 7, sides: 6, radius: 0.10, h: 0.30, mat: "gold" },
    { id: 8, sides: 7, radius: 0.12, h: 0.15, mat: "stone" },
    { id: 9, sides: 8, radius: 0.14, h: 0.20, mat: "wood" },
    { id: 10, sides: 4, radius: 0.16, h: 0.25, mat: "metal" },
    { id: 11, sides: 5, radius: 0.18, h: 0.30, mat: "gold" },
    { id: 12, sides: 6, radius: 0.20, h: 0.15, mat: "stone" },
    { id: 13, sides: 7, radius: 0.22, h: 0.20, mat: "wood" },
    { id: 14, sides: 8, radius: 0.10, h: 0.25, mat: "metal" },
    { id: 15, sides: 4, radius: 0.12, h: 0.30, mat: "gold" },
    { id: 16, sides: 5, radius: 0.14, h: 0.15, mat: "stone" },
    { id: 17, sides: 6, radius: 0.16, h: 0.20, mat: "wood" },
    { id: 18, sides: 7, radius: 0.18, h: 0.25, mat: "metal" },
    { id: 19, sides: 8, radius: 0.20, h: 0.30, mat: "gold" },
    { id: 20, sides: 4, radius: 0.22, h: 0.15, mat: "stone" },
    { id: 21, sides: 5, radius: 0.10, h: 0.20, mat: "wood" },
    { id: 22, sides: 6, radius: 0.12, h: 0.25, mat: "metal" },
    { id: 23, sides: 7, radius: 0.14, h: 0.30, mat: "gold" },
    { id: 24, sides: 8, radius: 0.16, h: 0.15, mat: "stone" },
    { id: 25, sides: 4, radius: 0.18, h: 0.20, mat: "wood" },
    { id: 26, sides: 5, radius: 0.20, h: 0.25, mat: "metal" },
    { id: 27, sides: 6, radius: 0.22, h: 0.30, mat: "gold" },
    { id: 28, sides: 7, radius: 0.10, h: 0.15, mat: "stone" },
    { id: 29, sides: 8, radius: 0.12, h: 0.20, mat: "wood" },
    { id: 30, sides: 4, radius: 0.14, h: 0.25, mat: "metal" },
    { id: 31, sides: 5, radius: 0.16, h: 0.30, mat: "gold" },
    { id: 32, sides: 6, radius: 0.18, h: 0.15, mat: "stone" },
    { id: 33, sides: 7, radius: 0.20, h: 0.20, mat: "wood" },
    { id: 34, sides: 8, radius: 0.22, h: 0.25, mat: "metal" },
    { id: 35, sides: 4, radius: 0.10, h: 0.30, mat: "gold" },
    { id: 36, sides: 5, radius: 0.12, h: 0.15, mat: "stone" },
    { id: 37, sides: 6, radius: 0.14, h: 0.20, mat: "wood" },
    { id: 38, sides: 7, radius: 0.16, h: 0.25, mat: "metal" },
    { id: 39, sides: 8, radius: 0.18, h: 0.30, mat: "gold" },
    { id: 40, sides: 4, radius: 0.20, h: 0.15, mat: "stone" },
    { id: 41, sides: 5, radius: 0.22, h: 0.20, mat: "wood" },
    { id: 42, sides: 6, radius: 0.10, h: 0.25, mat: "metal" },
    { id: 43, sides: 7, radius: 0.12, h: 0.30, mat: "gold" },
    { id: 44, sides: 8, radius: 0.14, h: 0.15, mat: "stone" },
    { id: 45, sides: 4, radius: 0.16, h: 0.20, mat: "wood" },
    { id: 46, sides: 5, radius: 0.18, h: 0.25, mat: "metal" },
    { id: 47, sides: 6, radius: 0.20, h: 0.30, mat: "gold" },
    { id: 48, sides: 7, radius: 0.22, h: 0.15, mat: "stone" },
    { id: 49, sides: 8, radius: 0.10, h: 0.20, mat: "wood" },
    { id: 50, sides: 4, radius: 0.12, h: 0.25, mat: "metal" },
    { id: 51, sides: 5, radius: 0.14, h: 0.30, mat: "gold" },
    { id: 52, sides: 6, radius: 0.16, h: 0.15, mat: "stone" },
    { id: 53, sides: 7, radius: 0.18, h: 0.20, mat: "wood" },
    { id: 54, sides: 8, radius: 0.20, h: 0.25, mat: "metal" },
    { id: 55, sides: 4, radius: 0.22, h: 0.30, mat: "gold" },
    { id: 56, sides: 5, radius: 0.10, h: 0.15, mat: "stone" },
    { id: 57, sides: 6, radius: 0.12, h: 0.20, mat: "wood" },
    { id: 58, sides: 7, radius: 0.14, h: 0.25, mat: "metal" },
    { id: 59, sides: 8, radius: 0.16, h: 0.30, mat: "gold" },
  ],
  applyOrnament(g, pattern, x, y, z) {
    const mat = pattern.mat === 'gold' ? M.gold : pattern.mat === 'metal' ? M.metal : pattern.mat === 'wood' ? M.wood : M.stone;
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(pattern.radius * 0.6, pattern.radius, pattern.h, pattern.sides), mat);
    mesh.position.set(x, y, z); mesh.castShadow = true; g.add(mesh); return mesh;
  }
};

function scatterExtraVegetation() {
  const flowerColors = [0xe05080, 0xf0d050, 0x50a0e0, 0xe08040, 0xd040d0];
  for (let i = 0; i < 35; i++) {
    const x = (Math.random() - 0.5) * 18;
    const z = (Math.random() - 0.5) * 18;
    if (Math.abs(x) < 3 && Math.abs(z) < 3) continue;
    DetailLib.addFlower(scene, x, z, flowerColors[i % flowerColors.length]);
  }
  for (let i = 0; i < 14; i++) {
    const x = (Math.random() - 0.5) * 16;
    const z = (Math.random() - 0.5) * 16;
    if (Math.abs(x) < 2.5 && Math.abs(z) < 2.5) continue;
    DetailLib.addRockPile(scene, x, z, 3 + (i % 4));
  }
  for (let z = -3; z <= 3; z += 3) {
    DetailLib.addLantern(scene, 1.2, 0.4, z);
    DetailLib.addLantern(scene, -1.2, 0.4, z);
  }
  DetailLib.addBarrel(scene, 3.2, 0.15, 1.5);
  DetailLib.addBarrel(scene, 3.5, 0.15, 1.8);
  DetailLib.addCrate(scene, -3.2, 0.15, 0.5);
  DetailLib.addCrate(scene, -3.5, 0.15, 0.8, 0.25);
}

function enhanceMaterialsWithNormals() {
  if (typeof nmlGrass !== 'undefined' && M.grassA) {
    M.grassA.normalMap = nmlGrass;
    M.grassA.normalScale = new THREE.Vector2(0.4, 0.4);
  }
  if (typeof nmlStone !== 'undefined' && M.stone) {
    M.stone.normalMap = nmlStone;
    M.stone.normalScale = new THREE.Vector2(0.6, 0.6);
    if (M.stoneDark) {
      M.stoneDark.normalMap = nmlStone;
      M.stoneDark.normalScale = new THREE.Vector2(0.5, 0.5);
    }
  }
  if (typeof texCobble !== 'undefined') {
    M.cobble = new THREE.MeshStandardMaterial({ map: texCobble, roughness: 0.75, metalness: 0.05 });
  }
  if (typeof texPlasterHQ !== 'undefined') {
    M.plasterHQ = new THREE.MeshStandardMaterial({ map: texPlasterHQ, roughness: 0.72, metalness: 0.02 });
  }
}

const BuildingStyleAtlas = {
  cottage: { bodyRoughness: 0.55, roofPitch: 0.32, windowCount: 3, trimColor: 0x8a6a40, detailDensity: 0.68 },
  keep: { bodyRoughness: 0.48, roofPitch: 0.28, windowCount: 5, trimColor: 0x7a6a50, detailDensity: 0.58 },
  tower: { bodyRoughness: 0.50, roofPitch: 0.40, windowCount: 2, trimColor: 0x6a7a80, detailDensity: 0.76 },
  warehouse: { bodyRoughness: 0.70, roofPitch: 0.25, windowCount: 4, trimColor: 0x9a7a50, detailDensity: 0.56 },
  forge: { bodyRoughness: 0.60, roofPitch: 0.35, windowCount: 2, trimColor: 0x5a4a3a, detailDensity: 0.92 },
  market: { bodyRoughness: 0.65, roofPitch: 0.30, windowCount: 6, trimColor: 0xb08a50, detailDensity: 0.94 },
  chapel: { bodyRoughness: 0.45, roofPitch: 0.50, windowCount: 4, trimColor: 0xd0c8b0, detailDensity: 0.64 },
  gatehouse: { bodyRoughness: 0.52, roofPitch: 0.38, windowCount: 3, trimColor: 0x8a8a90, detailDensity: 0.90 },
  barracks_v2: { bodyRoughness: 0.58, roofPitch: 0.33, windowCount: 3, trimColor: 0xa06838, detailDensity: 0.90 },
  mine_frame: { bodyRoughness: 0.62, roofPitch: 0.20, windowCount: 1, trimColor: 0x2a6a70, detailDensity: 0.60 },
};
const ParticleProfiles = {
  ember: { count: 8, life: 30, speed: 0.20, size: 0.020, gravity: 0.000, color: 0xff6000 },
  smoke: { count: 11, life: 40, speed: 0.28, size: 0.030, gravity: 0.001, color: 0xef5000 },
  leaf: { count: 14, life: 50, speed: 0.36, size: 0.040, gravity: 0.002, color: 0xdf4000 },
  spark: { count: 17, life: 60, speed: 0.44, size: 0.050, gravity: 0.003, color: 0xcf3000 },
  dust: { count: 20, life: 70, speed: 0.52, size: 0.060, gravity: 0.004, color: 0xbf2000 },
  pollen: { count: 23, life: 80, speed: 0.60, size: 0.070, gravity: 0.005, color: 0xaf1000 },
  ash: { count: 26, life: 90, speed: 0.68, size: 0.080, gravity: 0.006, color: 0x9f0000 },
  glow: { count: 29, life: 100, speed: 0.76, size: 0.090, gravity: 0.007, color: 0x8ef000 },
};
const MeshSegmentCatalog = [
  { seg: 0, kind: "ledge", w: 0.30, h: 0.04, d: 0.20, yOff: 0.10, matKey: "stone" },
  { seg: 1, kind: "trim", w: 0.38, h: 0.06, d: 0.25, yOff: 0.22, matKey: "wood" },
  { seg: 2, kind: "sill", w: 0.46, h: 0.08, d: 0.30, yOff: 0.34, matKey: "metal" },
  { seg: 3, kind: "lintel", w: 0.54, h: 0.10, d: 0.35, yOff: 0.46, matKey: "roof" },
  { seg: 4, kind: "cornice", w: 0.62, h: 0.12, d: 0.40, yOff: 0.58, matKey: "plaster" },
  { seg: 5, kind: "plinth", w: 0.70, h: 0.04, d: 0.45, yOff: 0.70, matKey: "stone" },
  { seg: 6, kind: "band", w: 0.78, h: 0.06, d: 0.50, yOff: 0.10, matKey: "wood" },
  { seg: 7, kind: "cap", w: 0.86, h: 0.08, d: 0.20, yOff: 0.22, matKey: "metal" },
  { seg: 8, kind: "ledge", w: 0.94, h: 0.10, d: 0.25, yOff: 0.34, matKey: "roof" },
  { seg: 9, kind: "trim", w: 1.02, h: 0.12, d: 0.30, yOff: 0.46, matKey: "plaster" },
  { seg: 10, kind: "sill", w: 0.30, h: 0.04, d: 0.35, yOff: 0.58, matKey: "stone" },
  { seg: 11, kind: "lintel", w: 0.38, h: 0.06, d: 0.40, yOff: 0.70, matKey: "wood" },
  { seg: 12, kind: "cornice", w: 0.46, h: 0.08, d: 0.45, yOff: 0.10, matKey: "metal" },
  { seg: 13, kind: "plinth", w: 0.54, h: 0.10, d: 0.50, yOff: 0.22, matKey: "roof" },
  { seg: 14, kind: "band", w: 0.62, h: 0.12, d: 0.20, yOff: 0.34, matKey: "plaster" },
  { seg: 15, kind: "cap", w: 0.70, h: 0.04, d: 0.25, yOff: 0.46, matKey: "stone" },
  { seg: 16, kind: "ledge", w: 0.78, h: 0.06, d: 0.30, yOff: 0.58, matKey: "wood" },
  { seg: 17, kind: "trim", w: 0.86, h: 0.08, d: 0.35, yOff: 0.70, matKey: "metal" },
  { seg: 18, kind: "sill", w: 0.94, h: 0.10, d: 0.40, yOff: 0.10, matKey: "roof" },
  { seg: 19, kind: "lintel", w: 1.02, h: 0.12, d: 0.45, yOff: 0.22, matKey: "plaster" },
  { seg: 20, kind: "cornice", w: 0.30, h: 0.04, d: 0.50, yOff: 0.34, matKey: "stone" },
  { seg: 21, kind: "plinth", w: 0.38, h: 0.06, d: 0.20, yOff: 0.46, matKey: "wood" },
  { seg: 22, kind: "band", w: 0.46, h: 0.08, d: 0.25, yOff: 0.58, matKey: "metal" },
  { seg: 23, kind: "cap", w: 0.54, h: 0.10, d: 0.30, yOff: 0.70, matKey: "roof" },
  { seg: 24, kind: "ledge", w: 0.62, h: 0.12, d: 0.35, yOff: 0.10, matKey: "plaster" },
  { seg: 25, kind: "trim", w: 0.70, h: 0.04, d: 0.40, yOff: 0.22, matKey: "stone" },
  { seg: 26, kind: "sill", w: 0.78, h: 0.06, d: 0.45, yOff: 0.34, matKey: "wood" },
  { seg: 27, kind: "lintel", w: 0.86, h: 0.08, d: 0.50, yOff: 0.46, matKey: "metal" },
  { seg: 28, kind: "cornice", w: 0.94, h: 0.10, d: 0.20, yOff: 0.58, matKey: "roof" },
  { seg: 29, kind: "plinth", w: 1.02, h: 0.12, d: 0.25, yOff: 0.70, matKey: "plaster" },
  { seg: 30, kind: "band", w: 0.30, h: 0.04, d: 0.30, yOff: 0.10, matKey: "stone" },
  { seg: 31, kind: "cap", w: 0.38, h: 0.06, d: 0.35, yOff: 0.22, matKey: "wood" },
  { seg: 32, kind: "ledge", w: 0.46, h: 0.08, d: 0.40, yOff: 0.34, matKey: "metal" },
  { seg: 33, kind: "trim", w: 0.54, h: 0.10, d: 0.45, yOff: 0.46, matKey: "roof" },
  { seg: 34, kind: "sill", w: 0.62, h: 0.12, d: 0.50, yOff: 0.58, matKey: "plaster" },
  { seg: 35, kind: "lintel", w: 0.70, h: 0.04, d: 0.20, yOff: 0.70, matKey: "stone" },
  { seg: 36, kind: "cornice", w: 0.78, h: 0.06, d: 0.25, yOff: 0.10, matKey: "wood" },
  { seg: 37, kind: "plinth", w: 0.86, h: 0.08, d: 0.30, yOff: 0.22, matKey: "metal" },
  { seg: 38, kind: "band", w: 0.94, h: 0.10, d: 0.35, yOff: 0.34, matKey: "roof" },
  { seg: 39, kind: "cap", w: 1.02, h: 0.12, d: 0.40, yOff: 0.46, matKey: "plaster" },
  { seg: 40, kind: "ledge", w: 0.30, h: 0.04, d: 0.45, yOff: 0.58, matKey: "stone" },
  { seg: 41, kind: "trim", w: 0.38, h: 0.06, d: 0.50, yOff: 0.70, matKey: "wood" },
  { seg: 42, kind: "sill", w: 0.46, h: 0.08, d: 0.20, yOff: 0.10, matKey: "metal" },
  { seg: 43, kind: "lintel", w: 0.54, h: 0.10, d: 0.25, yOff: 0.22, matKey: "roof" },
  { seg: 44, kind: "cornice", w: 0.62, h: 0.12, d: 0.30, yOff: 0.34, matKey: "plaster" },
  { seg: 45, kind: "plinth", w: 0.70, h: 0.04, d: 0.35, yOff: 0.46, matKey: "stone" },
  { seg: 46, kind: "band", w: 0.78, h: 0.06, d: 0.40, yOff: 0.58, matKey: "wood" },
  { seg: 47, kind: "cap", w: 0.86, h: 0.08, d: 0.45, yOff: 0.70, matKey: "metal" },
  { seg: 48, kind: "ledge", w: 0.94, h: 0.10, d: 0.50, yOff: 0.10, matKey: "roof" },
  { seg: 49, kind: "trim", w: 1.02, h: 0.12, d: 0.20, yOff: 0.22, matKey: "plaster" },
  { seg: 50, kind: "sill", w: 0.30, h: 0.04, d: 0.25, yOff: 0.34, matKey: "stone" },
  { seg: 51, kind: "lintel", w: 0.38, h: 0.06, d: 0.30, yOff: 0.46, matKey: "wood" },
  { seg: 52, kind: "cornice", w: 0.46, h: 0.08, d: 0.35, yOff: 0.58, matKey: "metal" },
  { seg: 53, kind: "plinth", w: 0.54, h: 0.10, d: 0.40, yOff: 0.70, matKey: "roof" },
  { seg: 54, kind: "band", w: 0.62, h: 0.12, d: 0.45, yOff: 0.10, matKey: "plaster" },
  { seg: 55, kind: "cap", w: 0.70, h: 0.04, d: 0.50, yOff: 0.22, matKey: "stone" },
  { seg: 56, kind: "ledge", w: 0.78, h: 0.06, d: 0.20, yOff: 0.34, matKey: "wood" },
  { seg: 57, kind: "trim", w: 0.86, h: 0.08, d: 0.25, yOff: 0.46, matKey: "metal" },
  { seg: 58, kind: "sill", w: 0.94, h: 0.10, d: 0.30, yOff: 0.58, matKey: "roof" },
  { seg: 59, kind: "lintel", w: 1.02, h: 0.12, d: 0.35, yOff: 0.70, matKey: "plaster" },
  { seg: 60, kind: "cornice", w: 0.30, h: 0.04, d: 0.40, yOff: 0.10, matKey: "stone" },
  { seg: 61, kind: "plinth", w: 0.38, h: 0.06, d: 0.45, yOff: 0.22, matKey: "wood" },
  { seg: 62, kind: "band", w: 0.46, h: 0.08, d: 0.50, yOff: 0.34, matKey: "metal" },
  { seg: 63, kind: "cap", w: 0.54, h: 0.10, d: 0.20, yOff: 0.46, matKey: "roof" },
  { seg: 64, kind: "ledge", w: 0.62, h: 0.12, d: 0.25, yOff: 0.58, matKey: "plaster" },
  { seg: 65, kind: "trim", w: 0.70, h: 0.04, d: 0.30, yOff: 0.70, matKey: "stone" },
  { seg: 66, kind: "sill", w: 0.78, h: 0.06, d: 0.35, yOff: 0.10, matKey: "wood" },
  { seg: 67, kind: "lintel", w: 0.86, h: 0.08, d: 0.40, yOff: 0.22, matKey: "metal" },
  { seg: 68, kind: "cornice", w: 0.94, h: 0.10, d: 0.45, yOff: 0.34, matKey: "roof" },
  { seg: 69, kind: "plinth", w: 1.02, h: 0.12, d: 0.50, yOff: 0.46, matKey: "plaster" },
  { seg: 70, kind: "band", w: 0.30, h: 0.04, d: 0.20, yOff: 0.58, matKey: "stone" },
  { seg: 71, kind: "cap", w: 0.38, h: 0.06, d: 0.25, yOff: 0.70, matKey: "wood" },
  { seg: 72, kind: "ledge", w: 0.46, h: 0.08, d: 0.30, yOff: 0.10, matKey: "metal" },
  { seg: 73, kind: "trim", w: 0.54, h: 0.10, d: 0.35, yOff: 0.22, matKey: "roof" },
  { seg: 74, kind: "sill", w: 0.62, h: 0.12, d: 0.40, yOff: 0.34, matKey: "plaster" },
  { seg: 75, kind: "lintel", w: 0.70, h: 0.04, d: 0.45, yOff: 0.46, matKey: "stone" },
  { seg: 76, kind: "cornice", w: 0.78, h: 0.06, d: 0.50, yOff: 0.58, matKey: "wood" },
  { seg: 77, kind: "plinth", w: 0.86, h: 0.08, d: 0.20, yOff: 0.70, matKey: "metal" },
  { seg: 78, kind: "band", w: 0.94, h: 0.10, d: 0.25, yOff: 0.10, matKey: "roof" },
  { seg: 79, kind: "cap", w: 1.02, h: 0.12, d: 0.30, yOff: 0.22, matKey: "plaster" },
];

function applyMeshSegments(g, catalogSlice, baseY) {
  catalogSlice.forEach((seg, idx) => {
    const mat = M[seg.matKey] || M.stone;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(seg.w, seg.h, seg.d), mat);
    mesh.position.set((idx % 3 - 1) * 0.15, baseY + seg.yOff, 0);
    if (idx % 4 === 0) mesh.castShadow = true;
    g.add(mesh);
  });
}


// ===================== v6.1.0 EXTENDED GRAPHICS DATA =====================
const DayColorRamps = {
  h00: { sky: 0xff64b4, sun: 0xff5a7d, hemi: 0.35, exposure: 1.00 },
  h01: { sky: 0xf66cb7, sun: 0xf66180, hemi: 0.38, exposure: 1.03 },
  h02: { sky: 0xee74ba, sun: 0xee6882, hemi: 0.40, exposure: 1.06 },
  h03: { sky: 0xe57dbd, sun: 0xe57084, hemi: 0.42, exposure: 1.09 },
  h04: { sky: 0xdd85c0, sun: 0xdd7786, hemi: 0.45, exposure: 1.12 },
  h05: { sky: 0xd48dc3, sun: 0xd47e88, hemi: 0.47, exposure: 1.15 },
  h06: { sky: 0xcc96c6, sun: 0xcc878a, hemi: 0.50, exposure: 1.18 },
  h07: { sky: 0xc39ec9, sun: 0xc38e8c, hemi: 0.53, exposure: 1.20 },
  h08: { sky: 0xbba6cd, sun: 0xbb958f, hemi: 0.55, exposure: 1.23 },
  h09: { sky: 0xb2afd0, sun: 0xb29d91, hemi: 0.57, exposure: 1.26 },
  h10: { sky: 0xaab7d3, sun: 0xaaa493, hemi: 0.60, exposure: 1.29 },
  h11: { sky: 0xa1bfd6, sun: 0xa1ab95, hemi: 0.62, exposure: 1.32 },
  h12: { sky: 0x99c8d9, sun: 0x99b497, hemi: 0.65, exposure: 1.35 },
  h13: { sky: 0xa1bfd6, sun: 0xa1ab95, hemi: 0.62, exposure: 1.32 },
  h14: { sky: 0xaab7d3, sun: 0xaaa493, hemi: 0.60, exposure: 1.29 },
  h15: { sky: 0xb2afd0, sun: 0xb29d91, hemi: 0.57, exposure: 1.26 },
  h16: { sky: 0xbba6cd, sun: 0xbb958f, hemi: 0.55, exposure: 1.23 },
  h17: { sky: 0xc39ec9, sun: 0xc38e8c, hemi: 0.52, exposure: 1.20 },
  h18: { sky: 0xcc96c6, sun: 0xcc878a, hemi: 0.50, exposure: 1.18 },
  h19: { sky: 0xd48dc3, sun: 0xd47e88, hemi: 0.47, exposure: 1.15 },
  h20: { sky: 0xdd85c0, sun: 0xdd7786, hemi: 0.45, exposure: 1.12 },
  h21: { sky: 0xe57dbd, sun: 0xe57084, hemi: 0.42, exposure: 1.09 },
  h22: { sky: 0xee74ba, sun: 0xee6882, hemi: 0.40, exposure: 1.06 },
  h23: { sky: 0xf66cb7, sun: 0xf66180, hemi: 0.37, exposure: 1.03 },
};
const DecorationUV = [
  { u0: 0.000, v0: 0.000, u1: 0.100, v1: 0.100, rot: 0.00, scale: 0.50 },
  { u0: 0.100, v0: 0.000, u1: 0.150, v1: 0.160, rot: 0.79, scale: 0.65 },
  { u0: 0.200, v0: 0.000, u1: 0.200, v1: 0.220, rot: 1.57, scale: 0.80 },
  { u0: 0.300, v0: 0.000, u1: 0.250, v1: 0.280, rot: 2.35, scale: 0.95 },
  { u0: 0.400, v0: 0.000, u1: 0.300, v1: 0.340, rot: 3.14, scale: 1.10 },
  { u0: 0.500, v0: 0.000, u1: 0.350, v1: 0.100, rot: 3.93, scale: 1.25 },
  { u0: 0.600, v0: 0.000, u1: 0.400, v1: 0.160, rot: 4.71, scale: 0.50 },
  { u0: 0.700, v0: 0.000, u1: 0.100, v1: 0.220, rot: 5.50, scale: 0.65 },
  { u0: 0.800, v0: 0.000, u1: 0.150, v1: 0.280, rot: 0.00, scale: 0.80 },
  { u0: 0.900, v0: 0.000, u1: 0.200, v1: 0.340, rot: 0.79, scale: 0.95 },
  { u0: 0.000, v0: 0.100, u1: 0.250, v1: 0.100, rot: 1.57, scale: 1.10 },
  { u0: 0.100, v0: 0.100, u1: 0.300, v1: 0.160, rot: 2.35, scale: 1.25 },
  { u0: 0.200, v0: 0.100, u1: 0.350, v1: 0.220, rot: 3.14, scale: 0.50 },
  { u0: 0.300, v0: 0.100, u1: 0.400, v1: 0.280, rot: 3.93, scale: 0.65 },
  { u0: 0.400, v0: 0.100, u1: 0.100, v1: 0.340, rot: 4.71, scale: 0.80 },
  { u0: 0.500, v0: 0.100, u1: 0.150, v1: 0.100, rot: 5.50, scale: 0.95 },
  { u0: 0.600, v0: 0.100, u1: 0.200, v1: 0.160, rot: 0.00, scale: 1.10 },
  { u0: 0.700, v0: 0.100, u1: 0.250, v1: 0.220, rot: 0.79, scale: 1.25 },
  { u0: 0.800, v0: 0.100, u1: 0.300, v1: 0.280, rot: 1.57, scale: 0.50 },
  { u0: 0.900, v0: 0.100, u1: 0.350, v1: 0.340, rot: 2.35, scale: 0.65 },
  { u0: 0.000, v0: 0.200, u1: 0.400, v1: 0.100, rot: 3.14, scale: 0.80 },
  { u0: 0.100, v0: 0.200, u1: 0.100, v1: 0.160, rot: 3.93, scale: 0.95 },
  { u0: 0.200, v0: 0.200, u1: 0.150, v1: 0.220, rot: 4.71, scale: 1.10 },
  { u0: 0.300, v0: 0.200, u1: 0.200, v1: 0.280, rot: 5.50, scale: 1.25 },
  { u0: 0.400, v0: 0.200, u1: 0.250, v1: 0.340, rot: 0.00, scale: 0.50 },
  { u0: 0.500, v0: 0.200, u1: 0.300, v1: 0.100, rot: 0.79, scale: 0.65 },
  { u0: 0.600, v0: 0.200, u1: 0.350, v1: 0.160, rot: 1.57, scale: 0.80 },
  { u0: 0.700, v0: 0.200, u1: 0.400, v1: 0.220, rot: 2.35, scale: 0.95 },
  { u0: 0.800, v0: 0.200, u1: 0.100, v1: 0.280, rot: 3.14, scale: 1.10 },
  { u0: 0.900, v0: 0.200, u1: 0.150, v1: 0.340, rot: 3.93, scale: 1.25 },
  { u0: 0.000, v0: 0.300, u1: 0.200, v1: 0.100, rot: 4.71, scale: 0.50 },
  { u0: 0.100, v0: 0.300, u1: 0.250, v1: 0.160, rot: 5.50, scale: 0.65 },
  { u0: 0.200, v0: 0.300, u1: 0.300, v1: 0.220, rot: 0.00, scale: 0.80 },
  { u0: 0.300, v0: 0.300, u1: 0.350, v1: 0.280, rot: 0.79, scale: 0.95 },
  { u0: 0.400, v0: 0.300, u1: 0.400, v1: 0.340, rot: 1.57, scale: 1.10 },
  { u0: 0.500, v0: 0.300, u1: 0.100, v1: 0.100, rot: 2.35, scale: 1.25 },
  { u0: 0.600, v0: 0.300, u1: 0.150, v1: 0.160, rot: 3.14, scale: 0.50 },
  { u0: 0.700, v0: 0.300, u1: 0.200, v1: 0.220, rot: 3.93, scale: 0.65 },
  { u0: 0.800, v0: 0.300, u1: 0.250, v1: 0.280, rot: 4.71, scale: 0.80 },
  { u0: 0.900, v0: 0.300, u1: 0.300, v1: 0.340, rot: 5.50, scale: 0.95 },
  { u0: 0.000, v0: 0.400, u1: 0.350, v1: 0.100, rot: 0.00, scale: 1.10 },
  { u0: 0.100, v0: 0.400, u1: 0.400, v1: 0.160, rot: 0.79, scale: 1.25 },
  { u0: 0.200, v0: 0.400, u1: 0.100, v1: 0.220, rot: 1.57, scale: 0.50 },
  { u0: 0.300, v0: 0.400, u1: 0.150, v1: 0.280, rot: 2.35, scale: 0.65 },
  { u0: 0.400, v0: 0.400, u1: 0.200, v1: 0.340, rot: 3.14, scale: 0.80 },
  { u0: 0.500, v0: 0.400, u1: 0.250, v1: 0.100, rot: 3.93, scale: 0.95 },
  { u0: 0.600, v0: 0.400, u1: 0.300, v1: 0.160, rot: 4.71, scale: 1.10 },
  { u0: 0.700, v0: 0.400, u1: 0.350, v1: 0.220, rot: 5.50, scale: 1.25 },
  { u0: 0.800, v0: 0.400, u1: 0.400, v1: 0.280, rot: 0.00, scale: 0.50 },
  { u0: 0.900, v0: 0.400, u1: 0.100, v1: 0.340, rot: 0.79, scale: 0.65 },
  { u0: 0.000, v0: 0.500, u1: 0.150, v1: 0.100, rot: 1.57, scale: 0.80 },
  { u0: 0.100, v0: 0.500, u1: 0.200, v1: 0.160, rot: 2.35, scale: 0.95 },
  { u0: 0.200, v0: 0.500, u1: 0.250, v1: 0.220, rot: 3.14, scale: 1.10 },
  { u0: 0.300, v0: 0.500, u1: 0.300, v1: 0.280, rot: 3.93, scale: 1.25 },
  { u0: 0.400, v0: 0.500, u1: 0.350, v1: 0.340, rot: 4.71, scale: 0.50 },
  { u0: 0.500, v0: 0.500, u1: 0.400, v1: 0.100, rot: 5.50, scale: 0.65 },
  { u0: 0.600, v0: 0.500, u1: 0.100, v1: 0.160, rot: 0.00, scale: 0.80 },
  { u0: 0.700, v0: 0.500, u1: 0.150, v1: 0.220, rot: 0.79, scale: 0.95 },
  { u0: 0.800, v0: 0.500, u1: 0.200, v1: 0.280, rot: 1.57, scale: 1.10 },
  { u0: 0.900, v0: 0.500, u1: 0.250, v1: 0.340, rot: 2.35, scale: 1.25 },
  { u0: 0.000, v0: 0.600, u1: 0.300, v1: 0.100, rot: 3.14, scale: 0.50 },
  { u0: 0.100, v0: 0.600, u1: 0.350, v1: 0.160, rot: 3.93, scale: 0.65 },
  { u0: 0.200, v0: 0.600, u1: 0.400, v1: 0.220, rot: 4.71, scale: 0.80 },
  { u0: 0.300, v0: 0.600, u1: 0.100, v1: 0.280, rot: 5.50, scale: 0.95 },
  { u0: 0.400, v0: 0.600, u1: 0.150, v1: 0.340, rot: 0.00, scale: 1.10 },
  { u0: 0.500, v0: 0.600, u1: 0.200, v1: 0.100, rot: 0.79, scale: 1.25 },
  { u0: 0.600, v0: 0.600, u1: 0.250, v1: 0.160, rot: 1.57, scale: 0.50 },
  { u0: 0.700, v0: 0.600, u1: 0.300, v1: 0.220, rot: 2.35, scale: 0.65 },
  { u0: 0.800, v0: 0.600, u1: 0.350, v1: 0.280, rot: 3.14, scale: 0.80 },
  { u0: 0.900, v0: 0.600, u1: 0.400, v1: 0.340, rot: 3.93, scale: 0.95 },
  { u0: 0.000, v0: 0.700, u1: 0.100, v1: 0.100, rot: 4.71, scale: 1.10 },
  { u0: 0.100, v0: 0.700, u1: 0.150, v1: 0.160, rot: 5.50, scale: 1.25 },
  { u0: 0.200, v0: 0.700, u1: 0.200, v1: 0.220, rot: 0.00, scale: 0.50 },
  { u0: 0.300, v0: 0.700, u1: 0.250, v1: 0.280, rot: 0.79, scale: 0.65 },
  { u0: 0.400, v0: 0.700, u1: 0.300, v1: 0.340, rot: 1.57, scale: 0.80 },
  { u0: 0.500, v0: 0.700, u1: 0.350, v1: 0.100, rot: 2.35, scale: 0.95 },
  { u0: 0.600, v0: 0.700, u1: 0.400, v1: 0.160, rot: 3.14, scale: 1.10 },
  { u0: 0.700, v0: 0.700, u1: 0.100, v1: 0.220, rot: 3.93, scale: 1.25 },
  { u0: 0.800, v0: 0.700, u1: 0.150, v1: 0.280, rot: 4.71, scale: 0.50 },
  { u0: 0.900, v0: 0.700, u1: 0.200, v1: 0.340, rot: 5.50, scale: 0.65 },
  { u0: 0.000, v0: 0.800, u1: 0.250, v1: 0.100, rot: 0.00, scale: 0.80 },
  { u0: 0.100, v0: 0.800, u1: 0.300, v1: 0.160, rot: 0.79, scale: 0.95 },
  { u0: 0.200, v0: 0.800, u1: 0.350, v1: 0.220, rot: 1.57, scale: 1.10 },
  { u0: 0.300, v0: 0.800, u1: 0.400, v1: 0.280, rot: 2.35, scale: 1.25 },
  { u0: 0.400, v0: 0.800, u1: 0.100, v1: 0.340, rot: 3.14, scale: 0.50 },
  { u0: 0.500, v0: 0.800, u1: 0.150, v1: 0.100, rot: 3.93, scale: 0.65 },
  { u0: 0.600, v0: 0.800, u1: 0.200, v1: 0.160, rot: 4.71, scale: 0.80 },
  { u0: 0.700, v0: 0.800, u1: 0.250, v1: 0.220, rot: 5.50, scale: 0.95 },
  { u0: 0.800, v0: 0.800, u1: 0.300, v1: 0.280, rot: 0.00, scale: 1.10 },
  { u0: 0.900, v0: 0.800, u1: 0.350, v1: 0.340, rot: 0.79, scale: 1.25 },
  { u0: 0.000, v0: 0.900, u1: 0.400, v1: 0.100, rot: 1.57, scale: 0.50 },
  { u0: 0.100, v0: 0.900, u1: 0.100, v1: 0.160, rot: 2.35, scale: 0.65 },
  { u0: 0.200, v0: 0.900, u1: 0.150, v1: 0.220, rot: 3.14, scale: 0.80 },
  { u0: 0.300, v0: 0.900, u1: 0.200, v1: 0.280, rot: 3.93, scale: 0.95 },
  { u0: 0.400, v0: 0.900, u1: 0.250, v1: 0.340, rot: 4.71, scale: 1.10 },
  { u0: 0.500, v0: 0.900, u1: 0.300, v1: 0.100, rot: 5.50, scale: 1.25 },
  { u0: 0.600, v0: 0.900, u1: 0.350, v1: 0.160, rot: 0.00, scale: 0.50 },
  { u0: 0.700, v0: 0.900, u1: 0.400, v1: 0.220, rot: 0.79, scale: 0.65 },
  { u0: 0.800, v0: 0.900, u1: 0.100, v1: 0.280, rot: 1.57, scale: 0.80 },
  { u0: 0.900, v0: 0.900, u1: 0.150, v1: 0.340, rot: 2.35, scale: 0.95 },
];
const WorldPropLayout = [
  { prop: "barrel", x: -10.00, z: -10.00, rot: 0.00, scale: 0.70 },
  { prop: "crate", x: -8.30, z: -7.70, rot: 0.70, scale: 0.80 },
  { prop: "lantern", x: -6.60, z: -5.40, rot: 1.40, scale: 0.90 },
  { prop: "flower", x: -4.90, z: -3.10, rot: 2.10, scale: 1.00 },
  { prop: "rock", x: -3.20, z: -0.80, rot: 2.80, scale: 1.10 },
  { prop: "banner", x: -1.50, z: 1.50, rot: 3.50, scale: 0.70 },
  { prop: "fence", x: 0.20, z: 3.80, rot: 4.20, scale: 0.80 },
  { prop: "bush", x: 1.90, z: 6.10, rot: 4.90, scale: 0.90 },
  { prop: "barrel", x: 3.60, z: 8.40, rot: 5.60, scale: 1.00 },
  { prop: "crate", x: 5.30, z: -9.30, rot: 0.02, scale: 1.10 },
  { prop: "lantern", x: 7.00, z: -7.00, rot: 0.72, scale: 0.70 },
  { prop: "flower", x: 8.70, z: -4.70, rot: 1.42, scale: 0.80 },
  { prop: "rock", x: -9.60, z: -2.40, rot: 2.12, scale: 0.90 },
  { prop: "banner", x: -7.90, z: -0.10, rot: 2.82, scale: 1.00 },
  { prop: "fence", x: -6.20, z: 2.20, rot: 3.52, scale: 1.10 },
  { prop: "bush", x: -4.50, z: 4.50, rot: 4.22, scale: 0.70 },
  { prop: "barrel", x: -2.80, z: 6.80, rot: 4.92, scale: 0.80 },
  { prop: "crate", x: -1.10, z: 9.10, rot: 5.62, scale: 0.90 },
  { prop: "lantern", x: 0.60, z: -8.60, rot: 0.04, scale: 1.00 },
  { prop: "flower", x: 2.30, z: -6.30, rot: 0.74, scale: 1.10 },
  { prop: "rock", x: 4.00, z: -4.00, rot: 1.44, scale: 0.70 },
  { prop: "banner", x: 5.70, z: -1.70, rot: 2.14, scale: 0.80 },
  { prop: "fence", x: 7.40, z: 0.60, rot: 2.84, scale: 0.90 },
  { prop: "bush", x: 9.10, z: 2.90, rot: 3.54, scale: 1.00 },
  { prop: "barrel", x: -9.20, z: 5.20, rot: 4.24, scale: 1.10 },
  { prop: "crate", x: -7.50, z: 7.50, rot: 4.94, scale: 0.70 },
  { prop: "lantern", x: -5.80, z: 9.80, rot: 5.64, scale: 0.80 },
  { prop: "flower", x: -4.10, z: -7.90, rot: 0.06, scale: 0.90 },
  { prop: "rock", x: -2.40, z: -5.60, rot: 0.76, scale: 1.00 },
  { prop: "banner", x: -0.70, z: -3.30, rot: 1.46, scale: 1.10 },
  { prop: "fence", x: 1.00, z: -1.00, rot: 2.16, scale: 0.70 },
  { prop: "bush", x: 2.70, z: 1.30, rot: 2.86, scale: 0.80 },
  { prop: "barrel", x: 4.40, z: 3.60, rot: 3.56, scale: 0.90 },
  { prop: "crate", x: 6.10, z: 5.90, rot: 4.26, scale: 1.00 },
  { prop: "lantern", x: 7.80, z: 8.20, rot: 4.96, scale: 1.10 },
  { prop: "flower", x: 9.50, z: -9.50, rot: 5.66, scale: 0.70 },
  { prop: "rock", x: -8.80, z: -7.20, rot: 0.08, scale: 0.80 },
  { prop: "banner", x: -7.10, z: -4.90, rot: 0.78, scale: 0.90 },
  { prop: "fence", x: -5.40, z: -2.60, rot: 1.48, scale: 1.00 },
  { prop: "bush", x: -3.70, z: -0.30, rot: 2.18, scale: 1.10 },
  { prop: "barrel", x: -2.00, z: 2.00, rot: 2.88, scale: 0.70 },
  { prop: "crate", x: -0.30, z: 4.30, rot: 3.58, scale: 0.80 },
  { prop: "lantern", x: 1.40, z: 6.60, rot: 4.28, scale: 0.90 },
  { prop: "flower", x: 3.10, z: 8.90, rot: 4.98, scale: 1.00 },
  { prop: "rock", x: 4.80, z: -8.80, rot: 5.68, scale: 1.10 },
  { prop: "banner", x: 6.50, z: -6.50, rot: 0.10, scale: 0.70 },
  { prop: "fence", x: 8.20, z: -4.20, rot: 0.80, scale: 0.80 },
  { prop: "bush", x: 9.90, z: -1.90, rot: 1.50, scale: 0.90 },
  { prop: "barrel", x: -8.40, z: 0.40, rot: 2.20, scale: 1.00 },
  { prop: "crate", x: -6.70, z: 2.70, rot: 2.90, scale: 1.10 },
  { prop: "lantern", x: -5.00, z: 5.00, rot: 3.60, scale: 0.70 },
  { prop: "flower", x: -3.30, z: 7.30, rot: 4.30, scale: 0.80 },
  { prop: "rock", x: -1.60, z: 9.60, rot: 5.00, scale: 0.90 },
  { prop: "banner", x: 0.10, z: -8.10, rot: 5.70, scale: 1.00 },
  { prop: "fence", x: 1.80, z: -5.80, rot: 0.12, scale: 1.10 },
  { prop: "bush", x: 3.50, z: -3.50, rot: 0.82, scale: 0.70 },
  { prop: "barrel", x: 5.20, z: -1.20, rot: 1.52, scale: 0.80 },
  { prop: "crate", x: 6.90, z: 1.10, rot: 2.22, scale: 0.90 },
  { prop: "lantern", x: 8.60, z: 3.40, rot: 2.92, scale: 1.00 },
  { prop: "flower", x: -9.70, z: 5.70, rot: 3.62, scale: 1.10 },
  { prop: "rock", x: -8.00, z: 8.00, rot: 4.32, scale: 0.70 },
  { prop: "banner", x: -6.30, z: -9.70, rot: 5.02, scale: 0.80 },
  { prop: "fence", x: -4.60, z: -7.40, rot: 5.72, scale: 0.90 },
  { prop: "bush", x: -2.90, z: -5.10, rot: 0.14, scale: 1.00 },
  { prop: "barrel", x: -1.20, z: -2.80, rot: 0.84, scale: 1.10 },
  { prop: "crate", x: 0.50, z: -0.50, rot: 1.54, scale: 0.70 },
  { prop: "lantern", x: 2.20, z: 1.80, rot: 2.24, scale: 0.80 },
  { prop: "flower", x: 3.90, z: 4.10, rot: 2.94, scale: 0.90 },
  { prop: "rock", x: 5.60, z: 6.40, rot: 3.64, scale: 1.00 },
  { prop: "banner", x: 7.30, z: 8.70, rot: 4.34, scale: 1.10 },
  { prop: "fence", x: 9.00, z: -9.00, rot: 5.04, scale: 0.70 },
  { prop: "bush", x: -9.30, z: -6.70, rot: 5.74, scale: 0.80 },
  { prop: "barrel", x: -7.60, z: -4.40, rot: 0.16, scale: 0.90 },
  { prop: "crate", x: -5.90, z: -2.10, rot: 0.86, scale: 1.00 },
  { prop: "lantern", x: -4.20, z: 0.20, rot: 1.56, scale: 1.10 },
  { prop: "flower", x: -2.50, z: 2.50, rot: 2.26, scale: 0.70 },
  { prop: "rock", x: -0.80, z: 4.80, rot: 2.96, scale: 0.80 },
  { prop: "banner", x: 0.90, z: 7.10, rot: 3.66, scale: 0.90 },
  { prop: "fence", x: 2.60, z: 9.40, rot: 4.36, scale: 1.00 },
  { prop: "bush", x: 4.30, z: -8.30, rot: 5.06, scale: 1.10 },
  { prop: "barrel", x: 6.00, z: -6.00, rot: 5.76, scale: 0.70 },
  { prop: "crate", x: 7.70, z: -3.70, rot: 0.18, scale: 0.80 },
  { prop: "lantern", x: 9.40, z: -1.40, rot: 0.88, scale: 0.90 },
  { prop: "flower", x: -8.90, z: 0.90, rot: 1.58, scale: 1.00 },
  { prop: "rock", x: -7.20, z: 3.20, rot: 2.28, scale: 1.10 },
  { prop: "banner", x: -5.50, z: 5.50, rot: 2.98, scale: 0.70 },
  { prop: "fence", x: -3.80, z: 7.80, rot: 3.68, scale: 0.80 },
  { prop: "bush", x: -2.10, z: -9.90, rot: 4.38, scale: 0.90 },
  { prop: "barrel", x: -0.40, z: -7.60, rot: 5.08, scale: 1.00 },
  { prop: "crate", x: 1.30, z: -5.30, rot: 5.78, scale: 1.10 },
  { prop: "lantern", x: 3.00, z: -3.00, rot: 0.20, scale: 0.70 },
  { prop: "flower", x: 4.70, z: -0.70, rot: 0.90, scale: 0.80 },
  { prop: "rock", x: 6.40, z: 1.60, rot: 1.60, scale: 0.90 },
  { prop: "banner", x: 8.10, z: 3.90, rot: 2.30, scale: 1.00 },
  { prop: "fence", x: 9.80, z: 6.20, rot: 3.00, scale: 1.10 },
  { prop: "bush", x: -8.50, z: 8.50, rot: 3.70, scale: 0.70 },
  { prop: "barrel", x: -6.80, z: -9.20, rot: 4.40, scale: 0.80 },
  { prop: "crate", x: -5.10, z: -6.90, rot: 5.10, scale: 0.90 },
  { prop: "lantern", x: -3.40, z: -4.60, rot: 5.80, scale: 1.00 },
  { prop: "flower", x: -1.70, z: -2.30, rot: 0.22, scale: 1.10 },
  { prop: "rock", x: 0.00, z: -0.00, rot: 0.92, scale: 0.70 },
  { prop: "banner", x: 1.70, z: 2.30, rot: 1.62, scale: 0.80 },
  { prop: "fence", x: 3.40, z: 4.60, rot: 2.32, scale: 0.90 },
  { prop: "bush", x: 5.10, z: 6.90, rot: 3.02, scale: 1.00 },
  { prop: "barrel", x: 6.80, z: 9.20, rot: 3.72, scale: 1.10 },
  { prop: "crate", x: 8.50, z: -8.50, rot: 4.42, scale: 0.70 },
  { prop: "lantern", x: -9.80, z: -6.20, rot: 5.12, scale: 0.80 },
  { prop: "flower", x: -8.10, z: -3.90, rot: 5.82, scale: 0.90 },
  { prop: "rock", x: -6.40, z: -1.60, rot: 0.24, scale: 1.00 },
  { prop: "banner", x: -4.70, z: 0.70, rot: 0.94, scale: 1.10 },
  { prop: "fence", x: -3.00, z: 3.00, rot: 1.64, scale: 0.70 },
  { prop: "bush", x: -1.30, z: 5.30, rot: 2.34, scale: 0.80 },
  { prop: "barrel", x: 0.40, z: 7.60, rot: 3.04, scale: 0.90 },
  { prop: "crate", x: 2.10, z: 9.90, rot: 3.74, scale: 1.00 },
  { prop: "lantern", x: 3.80, z: -7.80, rot: 4.44, scale: 1.10 },
  { prop: "flower", x: 5.50, z: -5.50, rot: 5.14, scale: 0.70 },
  { prop: "rock", x: 7.20, z: -3.20, rot: 5.84, scale: 0.80 },
  { prop: "banner", x: 8.90, z: -0.90, rot: 0.26, scale: 0.90 },
  { prop: "fence", x: -9.40, z: 1.40, rot: 0.96, scale: 1.00 },
  { prop: "bush", x: -7.70, z: 3.70, rot: 1.66, scale: 1.10 },
];

function spawnWorldProps() {
  WorldPropLayout.forEach((p, i) => {
    if (Math.abs(p.x) < 2.2 && Math.abs(p.z) < 2.2) return;
    if (Math.abs(p.z + 4.3) < 2 && Math.abs(p.x) < 2.5) return; // camp
    try {
      if (p.prop === 'barrel') DetailLib.addBarrel(scene, p.x, 0.15 * p.scale, p.z);
      else if (p.prop === 'crate') DetailLib.addCrate(scene, p.x, 0.15 * p.scale, p.z, 0.28 * p.scale);
      else if (p.prop === 'lantern' && i % 3 === 0) DetailLib.addLantern(scene, p.x, 0.35, p.z);
      else if (p.prop === 'flower') DetailLib.addFlower(scene, p.x, p.z);
      else if (p.prop === 'rock') DetailLib.addRockPile(scene, p.x, p.z, 2);
    } catch (e) {}
  });
}
const AnimCurves = {
  flagWave: [0.9546, 0.9042, 0.8377, 0.7578, 0.6675, 0.5706, 0.4708, 0.3722, 0.2787, 0.1941, 0.1216, 0.0642, 0.0242, 0.0032, 0.0019, 0.0205, 0.0583, 0.1136, 0.1844, 0.2677, 0.3603, 0.4585, 0.5583, 0.6558, 0.7471, 0.8285, 0.8968, 0.9494, 0.9840, 0.9993, 0.9947, 0.9704],
  fireFlicker: [0.0205, 0.0583, 0.1136, 0.1844, 0.2677, 0.3603, 0.4585, 0.5583, 0.6558, 0.7471, 0.8285, 0.8968, 0.9494, 0.9840, 0.9993, 0.9947, 0.9704, 0.9273, 0.8672, 0.7925, 0.7061, 0.6114, 0.5124, 0.4128, 0.3168, 0.2280, 0.1501, 0.0861, 0.0386, 0.0095, 0.0000, 0.0104],
  crystalPulse: [0.1216, 0.0642, 0.0242, 0.0032, 0.0019, 0.0205, 0.0583, 0.1136, 0.1844, 0.2677, 0.3603, 0.4585, 0.5583, 0.6558, 0.7471, 0.8285, 0.8968, 0.9494, 0.9840, 0.9993, 0.9947, 0.9704, 0.9273, 0.8672, 0.7925, 0.7061, 0.6114, 0.5124, 0.4128, 0.3168, 0.2280, 0.1501],
  cloudDrift: [0.1216, 0.0642, 0.0242, 0.0032, 0.0019, 0.0205, 0.0583, 0.1136, 0.1844, 0.2677, 0.3603, 0.4585, 0.5583, 0.6558, 0.7471, 0.8285, 0.8968, 0.9494, 0.9840, 0.9993, 0.9947, 0.9704, 0.9273, 0.8672, 0.7925, 0.7061, 0.6114, 0.5124, 0.4128, 0.3168, 0.2280, 0.1501],
  leafFall: [0.9546, 0.9042, 0.8377, 0.7578, 0.6675, 0.5706, 0.4708, 0.3722, 0.2787, 0.1941, 0.1216, 0.0642, 0.0242, 0.0032, 0.0019, 0.0205, 0.0583, 0.1136, 0.1844, 0.2677, 0.3603, 0.4585, 0.5583, 0.6558, 0.7471, 0.8285, 0.8968, 0.9494, 0.9840, 0.9993, 0.9947, 0.9704],
  npcBob: [0.5706, 0.4708, 0.3722, 0.2787, 0.1941, 0.1216, 0.0642, 0.0242, 0.0032, 0.0019, 0.0205, 0.0583, 0.1136, 0.1844, 0.2677, 0.3603, 0.4585, 0.5583, 0.6558, 0.7471, 0.8285, 0.8968, 0.9494, 0.9840, 0.9993, 0.9947, 0.9704, 0.9273, 0.8672, 0.7925, 0.7061, 0.6114],
  sunArc: [0.5000, 0.5993, 0.6947, 0.7823, 0.8587, 0.9207, 0.9660, 0.9927, 0.9998, 0.9869, 0.9546, 0.9042, 0.8377, 0.7578, 0.6675, 0.5706, 0.4708, 0.3722, 0.2787, 0.1941, 0.1216, 0.0642, 0.0242, 0.0032, 0.0019, 0.0205, 0.0583, 0.1136, 0.1844, 0.2677, 0.3603, 0.4585],
};
const MaterialStacks = {
  wall_l1: { layers: ["stone", "stoneDark", "mortar"], blend: "overlay", detailScale: 1.10 },
  wall_l2: { layers: ["stoneLight", "metalDark", "stone"], blend: "overlay", detailScale: 1.10 },
  wall_l3: { layers: ["stoneLight", "metal", "gold"], blend: "overlay", detailScale: 1.10 },
  th_l1: { layers: ["plaster", "wood", "roof"], blend: "overlay", detailScale: 1.10 },
  th_l3: { layers: ["stone", "gold", "roof"], blend: "overlay", detailScale: 1.10 },
  th_l5: { layers: ["marble", "gold", "crystal"], blend: "overlay", detailScale: 1.10 },
  mine_d: { layers: ["metal", "crystal", "wood"], blend: "overlay", detailScale: 1.10 },
  mine_s: { layers: ["stone", "dirt", "wood"], blend: "overlay", detailScale: 1.10 },
  barracks: { layers: ["wood", "roof", "metal"], blend: "overlay", detailScale: 1.10 },
  cannon: { layers: ["stone", "wood", "metal"], blend: "overlay", detailScale: 1.10 },
  warcannon: { layers: ["metal", "woodDark", "metalDark"], blend: "overlay", detailScale: 1.10 },
};
const LodTable = [
  { dist: 5, segments: 16, shadows: true, particles: true },
  { dist: 7, segments: 16, shadows: true, particles: true },
  { dist: 9, segments: 16, shadows: true, particles: true },
  { dist: 11, segments: 16, shadows: true, particles: true },
  { dist: 13, segments: 15, shadows: true, particles: true },
  { dist: 15, segments: 15, shadows: true, particles: true },
  { dist: 17, segments: 15, shadows: true, particles: true },
  { dist: 19, segments: 15, shadows: true, particles: true },
  { dist: 21, segments: 14, shadows: true, particles: true },
  { dist: 23, segments: 14, shadows: true, particles: true },
  { dist: 25, segments: 14, shadows: true, particles: true },
  { dist: 27, segments: 14, shadows: true, particles: true },
  { dist: 29, segments: 13, shadows: true, particles: true },
  { dist: 31, segments: 13, shadows: true, particles: true },
  { dist: 33, segments: 13, shadows: true, particles: true },
  { dist: 35, segments: 13, shadows: true, particles: false },
  { dist: 37, segments: 12, shadows: true, particles: false },
  { dist: 39, segments: 12, shadows: true, particles: false },
  { dist: 41, segments: 12, shadows: true, particles: false },
  { dist: 43, segments: 12, shadows: true, particles: false },
  { dist: 45, segments: 11, shadows: false, particles: false },
  { dist: 47, segments: 11, shadows: false, particles: false },
  { dist: 49, segments: 11, shadows: false, particles: false },
  { dist: 51, segments: 11, shadows: false, particles: false },
  { dist: 53, segments: 10, shadows: false, particles: false },
  { dist: 55, segments: 10, shadows: false, particles: false },
  { dist: 57, segments: 10, shadows: false, particles: false },
  { dist: 59, segments: 10, shadows: false, particles: false },
  { dist: 61, segments: 9, shadows: false, particles: false },
  { dist: 63, segments: 9, shadows: false, particles: false },
  { dist: 65, segments: 9, shadows: false, particles: false },
  { dist: 67, segments: 9, shadows: false, particles: false },
  { dist: 69, segments: 8, shadows: false, particles: false },
  { dist: 71, segments: 8, shadows: false, particles: false },
  { dist: 73, segments: 8, shadows: false, particles: false },
  { dist: 75, segments: 8, shadows: false, particles: false },
  { dist: 77, segments: 7, shadows: false, particles: false },
  { dist: 79, segments: 7, shadows: false, particles: false },
  { dist: 81, segments: 7, shadows: false, particles: false },
  { dist: 83, segments: 7, shadows: false, particles: false },
  { dist: 85, segments: 6, shadows: false, particles: false },
  { dist: 87, segments: 6, shadows: false, particles: false },
  { dist: 89, segments: 6, shadows: false, particles: false },
  { dist: 91, segments: 6, shadows: false, particles: false },
  { dist: 93, segments: 5, shadows: false, particles: false },
  { dist: 95, segments: 5, shadows: false, particles: false },
  { dist: 97, segments: 5, shadows: false, particles: false },
  { dist: 99, segments: 5, shadows: false, particles: false },
  { dist: 101, segments: 4, shadows: false, particles: false },
  { dist: 103, segments: 4, shadows: false, particles: false },
];
const VisualFxTriggers = [
  { id: 0, fx: "build_place", duration: 200, color: 0x40e0f0, scale: 0.80 },
  { id: 1, fx: "upgrade_flash", duration: 250, color: 0x3fdff0, scale: 0.95 },
  { id: 2, fx: "train_done", duration: 300, color: 0x3edef0, scale: 1.10 },
  { id: 3, fx: "arrow_shot", duration: 350, color: 0x3dddf0, scale: 1.25 },
  { id: 4, fx: "cannon_smoke", duration: 400, color: 0x3cdcf0, scale: 1.40 },
  { id: 5, fx: "resource_full", duration: 450, color: 0x3bdbf0, scale: 0.80 },
  { id: 6, fx: "victory", duration: 500, color: 0x3adaf0, scale: 0.95 },
  { id: 7, fx: "defeat", duration: 550, color: 0x39d9f0, scale: 1.10 },
  { id: 8, fx: "build_place", duration: 600, color: 0x38d8f0, scale: 1.25 },
  { id: 9, fx: "upgrade_flash", duration: 650, color: 0x37d7f0, scale: 1.40 },
  { id: 10, fx: "train_done", duration: 200, color: 0x36d6f0, scale: 0.80 },
  { id: 11, fx: "arrow_shot", duration: 250, color: 0x35d5f0, scale: 0.95 },
  { id: 12, fx: "cannon_smoke", duration: 300, color: 0x34d4f0, scale: 1.10 },
  { id: 13, fx: "resource_full", duration: 350, color: 0x33d3f0, scale: 1.25 },
  { id: 14, fx: "victory", duration: 400, color: 0x32d2f0, scale: 1.40 },
  { id: 15, fx: "defeat", duration: 450, color: 0x31d1f0, scale: 0.80 },
  { id: 16, fx: "build_place", duration: 500, color: 0x30d0f0, scale: 0.95 },
  { id: 17, fx: "upgrade_flash", duration: 550, color: 0x2fcff0, scale: 1.10 },
  { id: 18, fx: "train_done", duration: 600, color: 0x2ecef0, scale: 1.25 },
  { id: 19, fx: "arrow_shot", duration: 650, color: 0x2dcdf0, scale: 1.40 },
  { id: 20, fx: "cannon_smoke", duration: 200, color: 0x2cccf0, scale: 0.80 },
  { id: 21, fx: "resource_full", duration: 250, color: 0x2bcbf0, scale: 0.95 },
  { id: 22, fx: "victory", duration: 300, color: 0x2acaf0, scale: 1.10 },
  { id: 23, fx: "defeat", duration: 350, color: 0x29c9f0, scale: 1.25 },
  { id: 24, fx: "build_place", duration: 400, color: 0x28c8f0, scale: 1.40 },
  { id: 25, fx: "upgrade_flash", duration: 450, color: 0x27c7f0, scale: 0.80 },
  { id: 26, fx: "train_done", duration: 500, color: 0x26c6f0, scale: 0.95 },
  { id: 27, fx: "arrow_shot", duration: 550, color: 0x25c5f0, scale: 1.10 },
  { id: 28, fx: "cannon_smoke", duration: 600, color: 0x24c4f0, scale: 1.25 },
  { id: 29, fx: "resource_full", duration: 650, color: 0x23c3f0, scale: 1.40 },
  { id: 30, fx: "victory", duration: 200, color: 0x22c2f0, scale: 0.80 },
  { id: 31, fx: "defeat", duration: 250, color: 0x21c1f0, scale: 0.95 },
  { id: 32, fx: "build_place", duration: 300, color: 0x20c0f0, scale: 1.10 },
  { id: 33, fx: "upgrade_flash", duration: 350, color: 0x1fbff0, scale: 1.25 },
  { id: 34, fx: "train_done", duration: 400, color: 0x1ebef0, scale: 1.40 },
  { id: 35, fx: "arrow_shot", duration: 450, color: 0x1dbdf0, scale: 0.80 },
  { id: 36, fx: "cannon_smoke", duration: 500, color: 0x1cbcf0, scale: 0.95 },
  { id: 37, fx: "resource_full", duration: 550, color: 0x1bbbf0, scale: 1.10 },
  { id: 38, fx: "victory", duration: 600, color: 0x1abaf0, scale: 1.25 },
  { id: 39, fx: "defeat", duration: 650, color: 0x19b9f0, scale: 1.40 },
  { id: 40, fx: "build_place", duration: 200, color: 0x18b8f0, scale: 0.80 },
  { id: 41, fx: "upgrade_flash", duration: 250, color: 0x17b7f0, scale: 0.95 },
  { id: 42, fx: "train_done", duration: 300, color: 0x16b6f0, scale: 1.10 },
  { id: 43, fx: "arrow_shot", duration: 350, color: 0x15b5f0, scale: 1.25 },
  { id: 44, fx: "cannon_smoke", duration: 400, color: 0x14b4f0, scale: 1.40 },
  { id: 45, fx: "resource_full", duration: 450, color: 0x13b3f0, scale: 0.80 },
  { id: 46, fx: "victory", duration: 500, color: 0x12b2f0, scale: 0.95 },
  { id: 47, fx: "defeat", duration: 550, color: 0x11b1f0, scale: 1.10 },
  { id: 48, fx: "build_place", duration: 600, color: 0x40b0f0, scale: 1.25 },
  { id: 49, fx: "upgrade_flash", duration: 650, color: 0x3faff0, scale: 1.40 },
  { id: 50, fx: "train_done", duration: 200, color: 0x3eaef0, scale: 0.80 },
  { id: 51, fx: "arrow_shot", duration: 250, color: 0x3dadf0, scale: 0.95 },
  { id: 52, fx: "cannon_smoke", duration: 300, color: 0x3cacf0, scale: 1.10 },
  { id: 53, fx: "resource_full", duration: 350, color: 0x3babf0, scale: 1.25 },
  { id: 54, fx: "victory", duration: 400, color: 0x3aaaf0, scale: 1.40 },
  { id: 55, fx: "defeat", duration: 450, color: 0x39a9f0, scale: 0.80 },
  { id: 56, fx: "build_place", duration: 500, color: 0x38a8f0, scale: 0.95 },
  { id: 57, fx: "upgrade_flash", duration: 550, color: 0x37a7f0, scale: 1.10 },
  { id: 58, fx: "train_done", duration: 600, color: 0x36a6f0, scale: 1.25 },
  { id: 59, fx: "arrow_shot", duration: 650, color: 0x35a5f0, scale: 1.40 },
  { id: 60, fx: "cannon_smoke", duration: 200, color: 0x34a4f0, scale: 0.80 },
  { id: 61, fx: "resource_full", duration: 250, color: 0x33a3f0, scale: 0.95 },
  { id: 62, fx: "victory", duration: 300, color: 0x32a2f0, scale: 1.10 },
  { id: 63, fx: "defeat", duration: 350, color: 0x31a1f0, scale: 1.25 },
];

try { spawnWorldProps(); } catch(e) {}

// ---- HQ texture rebuilder (v6.1.0) ----
function rebuildHQTextures() {
  // Higher octaves for grass
  if (typeof fbm === 'function' && typeof makeNoiseCanvas === 'function') {
    try {
      const g = makeNoiseCanvas(256, (x, y) => {
        const n = fbm(x * 0.035, y * 0.035, 6);
        const blade = Math.abs(Math.sin(x * 0.7 + n * 4)) * 18;
        return [42 + n * 32 + blade * 0.25, 95 + n * 60 + blade, 32 + n * 22];
      });
      g.repeat.set(3, 3);
      if (M.grassA) { M.grassA.map = g; M.grassA.needsUpdate = true; }
      const st = makeNoiseCanvas(256, (x, y) => {
        const n = fbm(x * 0.028, y * 0.028, 6);
        const crack = Math.pow(Math.abs(Math.sin(x * 0.12) * Math.cos(y * 0.1)), 10) * 35;
        const v = 105 + n * 75 - crack;
        return [v * 0.88, v * 0.93, v * 0.9];
      });
      st.repeat.set(2, 2);
      if (M.stone) { M.stone.map = st; M.stone.needsUpdate = true; }
    } catch (e) {}
  }
}

const TreeSpeciesProfile = [
  { name: "sp0", trunkH: 0.80, trunkR: 0.06, layers: 3, leafColor: 0x1a5a20, lean: -0.10 },
  { name: "sp1", trunkH: 0.88, trunkR: 0.07, layers: 4, leafColor: 0x1d5f20, lean: -0.05 },
  { name: "sp2", trunkH: 0.96, trunkR: 0.09, layers: 3, leafColor: 0x206420, lean: 0.00 },
  { name: "sp3", trunkH: 1.04, trunkR: 0.10, layers: 4, leafColor: 0x236920, lean: 0.05 },
  { name: "sp4", trunkH: 1.12, trunkR: 0.06, layers: 3, leafColor: 0x266e20, lean: 0.10 },
  { name: "sp5", trunkH: 1.20, trunkR: 0.07, layers: 4, leafColor: 0x297320, lean: -0.10 },
  { name: "sp6", trunkH: 0.80, trunkR: 0.09, layers: 3, leafColor: 0x2c7820, lean: -0.05 },
  { name: "sp7", trunkH: 0.88, trunkR: 0.10, layers: 4, leafColor: 0x2f7d20, lean: 0.00 },
  { name: "sp8", trunkH: 0.96, trunkR: 0.06, layers: 3, leafColor: 0x328220, lean: 0.05 },
  { name: "sp9", trunkH: 1.04, trunkR: 0.07, layers: 4, leafColor: 0x358720, lean: 0.10 },
  { name: "sp10", trunkH: 1.12, trunkR: 0.09, layers: 3, leafColor: 0x388c20, lean: -0.10 },
  { name: "sp11", trunkH: 1.20, trunkR: 0.10, layers: 4, leafColor: 0x1b5100, lean: -0.05 },
  { name: "sp12", trunkH: 0.80, trunkR: 0.06, layers: 3, leafColor: 0x1e5600, lean: 0.00 },
  { name: "sp13", trunkH: 0.88, trunkR: 0.07, layers: 4, leafColor: 0x215b00, lean: 0.05 },
  { name: "sp14", trunkH: 0.96, trunkR: 0.09, layers: 3, leafColor: 0x246000, lean: 0.10 },
  { name: "sp15", trunkH: 1.04, trunkR: 0.10, layers: 4, leafColor: 0x276500, lean: -0.10 },
  { name: "sp16", trunkH: 1.12, trunkR: 0.06, layers: 3, leafColor: 0x2a6a00, lean: -0.05 },
  { name: "sp17", trunkH: 1.20, trunkR: 0.07, layers: 4, leafColor: 0x2d6f00, lean: 0.00 },
  { name: "sp18", trunkH: 0.80, trunkR: 0.09, layers: 3, leafColor: 0x307400, lean: 0.05 },
  { name: "sp19", trunkH: 0.88, trunkR: 0.10, layers: 4, leafColor: 0x337900, lean: 0.10 },
  { name: "sp20", trunkH: 0.96, trunkR: 0.06, layers: 3, leafColor: 0x367e00, lean: -0.10 },
  { name: "sp21", trunkH: 1.04, trunkR: 0.07, layers: 4, leafColor: 0x398300, lean: -0.05 },
  { name: "sp22", trunkH: 1.12, trunkR: 0.09, layers: 3, leafColor: 0x1c47e0, lean: 0.00 },
  { name: "sp23", trunkH: 1.20, trunkR: 0.10, layers: 4, leafColor: 0x1f4ce0, lean: 0.05 },
  { name: "sp24", trunkH: 0.80, trunkR: 0.06, layers: 3, leafColor: 0x2251e0, lean: 0.10 },
  { name: "sp25", trunkH: 0.88, trunkR: 0.07, layers: 4, leafColor: 0x2556e0, lean: -0.10 },
  { name: "sp26", trunkH: 0.96, trunkR: 0.09, layers: 3, leafColor: 0x285be0, lean: -0.05 },
  { name: "sp27", trunkH: 1.04, trunkR: 0.10, layers: 4, leafColor: 0x2b60e0, lean: 0.00 },
  { name: "sp28", trunkH: 1.12, trunkR: 0.06, layers: 3, leafColor: 0x2e65e0, lean: 0.05 },
  { name: "sp29", trunkH: 1.20, trunkR: 0.07, layers: 4, leafColor: 0x316ae0, lean: 0.10 },
  { name: "sp30", trunkH: 0.80, trunkR: 0.09, layers: 3, leafColor: 0x346fe0, lean: -0.10 },
  { name: "sp31", trunkH: 0.88, trunkR: 0.10, layers: 4, leafColor: 0x3774e0, lean: -0.05 },
  { name: "sp32", trunkH: 0.96, trunkR: 0.06, layers: 3, leafColor: 0x3a79e0, lean: 0.00 },
  { name: "sp33", trunkH: 1.04, trunkR: 0.07, layers: 4, leafColor: 0x1d3ec0, lean: 0.05 },
  { name: "sp34", trunkH: 1.12, trunkR: 0.09, layers: 3, leafColor: 0x2043c0, lean: 0.10 },
  { name: "sp35", trunkH: 1.20, trunkR: 0.10, layers: 4, leafColor: 0x2348c0, lean: -0.10 },
  { name: "sp36", trunkH: 0.80, trunkR: 0.06, layers: 3, leafColor: 0x264dc0, lean: -0.05 },
  { name: "sp37", trunkH: 0.88, trunkR: 0.07, layers: 4, leafColor: 0x2952c0, lean: 0.00 },
  { name: "sp38", trunkH: 0.96, trunkR: 0.09, layers: 3, leafColor: 0x2c57c0, lean: 0.05 },
  { name: "sp39", trunkH: 1.04, trunkR: 0.10, layers: 4, leafColor: 0x2f5cc0, lean: 0.10 },
];

const CloudLayerProfiles = [
  { y: 10.0, speed: 0.10, scale: 0.80, opacity: 0.50, count: 3 },
  { y: 10.4, speed: 0.13, scale: 1.00, opacity: 0.60, count: 4 },
  { y: 10.8, speed: 0.16, scale: 1.20, opacity: 0.70, count: 5 },
  { y: 11.2, speed: 0.19, scale: 1.40, opacity: 0.80, count: 6 },
  { y: 11.6, speed: 0.22, scale: 1.60, opacity: 0.50, count: 3 },
  { y: 12.0, speed: 0.25, scale: 0.80, opacity: 0.60, count: 4 },
  { y: 12.4, speed: 0.28, scale: 1.00, opacity: 0.70, count: 5 },
  { y: 12.8, speed: 0.10, scale: 1.20, opacity: 0.80, count: 6 },
  { y: 13.2, speed: 0.13, scale: 1.40, opacity: 0.50, count: 3 },
  { y: 13.6, speed: 0.16, scale: 1.60, opacity: 0.60, count: 4 },
  { y: 14.0, speed: 0.19, scale: 0.80, opacity: 0.70, count: 5 },
  { y: 14.4, speed: 0.22, scale: 1.00, opacity: 0.80, count: 6 },
  { y: 14.8, speed: 0.25, scale: 1.20, opacity: 0.50, count: 3 },
  { y: 15.2, speed: 0.28, scale: 1.40, opacity: 0.60, count: 4 },
  { y: 15.6, speed: 0.10, scale: 1.60, opacity: 0.70, count: 5 },
  { y: 16.0, speed: 0.13, scale: 0.80, opacity: 0.80, count: 6 },
  { y: 16.4, speed: 0.16, scale: 1.00, opacity: 0.50, count: 3 },
  { y: 16.8, speed: 0.19, scale: 1.20, opacity: 0.60, count: 4 },
  { y: 17.2, speed: 0.22, scale: 1.40, opacity: 0.70, count: 5 },
  { y: 17.6, speed: 0.25, scale: 1.60, opacity: 0.80, count: 6 },
  { y: 18.0, speed: 0.28, scale: 0.80, opacity: 0.50, count: 3 },
  { y: 18.4, speed: 0.10, scale: 1.00, opacity: 0.60, count: 4 },
  { y: 18.8, speed: 0.13, scale: 1.20, opacity: 0.70, count: 5 },
  { y: 19.2, speed: 0.16, scale: 1.40, opacity: 0.80, count: 6 },
  { y: 19.6, speed: 0.19, scale: 1.60, opacity: 0.50, count: 3 },
];

const BuildingDamageOverlays = [
  { hpRatio: 1.00, crackIntensity: 0.00, soot: 0.00, emissivePulse: 0.10 },
  { hpRatio: 0.97, crackIntensity: 0.03, soot: 0.02, emissivePulse: 0.12 },
  { hpRatio: 0.94, crackIntensity: 0.06, soot: 0.04, emissivePulse: 0.14 },
  { hpRatio: 0.91, crackIntensity: 0.09, soot: 0.06, emissivePulse: 0.16 },
  { hpRatio: 0.88, crackIntensity: 0.12, soot: 0.08, emissivePulse: 0.18 },
  { hpRatio: 0.85, crackIntensity: 0.15, soot: 0.10, emissivePulse: 0.20 },
  { hpRatio: 0.82, crackIntensity: 0.18, soot: 0.12, emissivePulse: 0.22 },
  { hpRatio: 0.79, crackIntensity: 0.21, soot: 0.14, emissivePulse: 0.24 },
  { hpRatio: 0.76, crackIntensity: 0.24, soot: 0.16, emissivePulse: 0.26 },
  { hpRatio: 0.73, crackIntensity: 0.27, soot: 0.18, emissivePulse: 0.28 },
  { hpRatio: 0.70, crackIntensity: 0.30, soot: 0.20, emissivePulse: 0.30 },
  { hpRatio: 0.67, crackIntensity: 0.33, soot: 0.22, emissivePulse: 0.32 },
  { hpRatio: 0.64, crackIntensity: 0.36, soot: 0.24, emissivePulse: 0.34 },
  { hpRatio: 0.61, crackIntensity: 0.39, soot: 0.26, emissivePulse: 0.36 },
  { hpRatio: 0.58, crackIntensity: 0.42, soot: 0.28, emissivePulse: 0.38 },
  { hpRatio: 0.55, crackIntensity: 0.45, soot: 0.30, emissivePulse: 0.40 },
  { hpRatio: 0.52, crackIntensity: 0.48, soot: 0.32, emissivePulse: 0.42 },
  { hpRatio: 0.49, crackIntensity: 0.51, soot: 0.34, emissivePulse: 0.44 },
  { hpRatio: 0.46, crackIntensity: 0.54, soot: 0.36, emissivePulse: 0.46 },
  { hpRatio: 0.43, crackIntensity: 0.57, soot: 0.38, emissivePulse: 0.48 },
  { hpRatio: 0.40, crackIntensity: 0.60, soot: 0.40, emissivePulse: 0.50 },
  { hpRatio: 0.37, crackIntensity: 0.63, soot: 0.42, emissivePulse: 0.52 },
  { hpRatio: 0.34, crackIntensity: 0.66, soot: 0.44, emissivePulse: 0.54 },
  { hpRatio: 0.31, crackIntensity: 0.69, soot: 0.46, emissivePulse: 0.56 },
  { hpRatio: 0.28, crackIntensity: 0.72, soot: 0.48, emissivePulse: 0.58 },
  { hpRatio: 0.25, crackIntensity: 0.75, soot: 0.50, emissivePulse: 0.60 },
  { hpRatio: 0.22, crackIntensity: 0.78, soot: 0.52, emissivePulse: 0.62 },
  { hpRatio: 0.19, crackIntensity: 0.81, soot: 0.54, emissivePulse: 0.64 },
  { hpRatio: 0.16, crackIntensity: 0.84, soot: 0.56, emissivePulse: 0.66 },
  { hpRatio: 0.13, crackIntensity: 0.87, soot: 0.58, emissivePulse: 0.68 },
];

function sampleAnimCurve(name, t) {
  const c = AnimCurves[name];
  if (!c || !c.length) return 0.5;
  const idx = Math.floor((t % 1) * c.length) % c.length;
  return c[idx];
}

try { rebuildHQTextures(); } catch(e) {}

const LightProbeTable = [
  { x: -8.00, y: 0.50, z: -8.00, color: 0xffe0a0, intensity: 0.15, dist: 2.0 },
  { x: -6.70, y: 0.80, z: -6.30, color: 0xfadd98, intensity: 0.23, dist: 3.0 },
  { x: -5.40, y: 1.10, z: -4.60, color: 0xf5da90, intensity: 0.31, dist: 4.0 },
  { x: -4.10, y: 1.40, z: -2.90, color: 0xf0d788, intensity: 0.39, dist: 5.0 },
  { x: -2.80, y: 1.70, z: -1.20, color: 0xebd480, intensity: 0.47, dist: 2.0 },
  { x: -1.50, y: 0.50, z: 0.50, color: 0xe6d178, intensity: 0.55, dist: 3.0 },
  { x: -0.20, y: 0.80, z: 2.20, color: 0xe1ce70, intensity: 0.15, dist: 4.0 },
  { x: 1.10, y: 1.10, z: 3.90, color: 0xfceb88, intensity: 0.23, dist: 5.0 },
  { x: 2.40, y: 1.40, z: 5.60, color: 0xf7e880, intensity: 0.31, dist: 2.0 },
  { x: 3.70, y: 1.70, z: 7.30, color: 0xf2e578, intensity: 0.39, dist: 3.0 },
  { x: 5.00, y: 0.50, z: -7.00, color: 0xede270, intensity: 0.47, dist: 4.0 },
  { x: 6.30, y: 0.80, z: -5.30, color: 0xe8df68, intensity: 0.55, dist: 5.0 },
  { x: 7.60, y: 1.10, z: -3.60, color: 0xe3dc60, intensity: 0.15, dist: 2.0 },
  { x: -7.10, y: 1.40, z: -1.90, color: 0xfef978, intensity: 0.23, dist: 3.0 },
  { x: -5.80, y: 1.70, z: -0.20, color: 0xf9f670, intensity: 0.31, dist: 4.0 },
  { x: -4.50, y: 0.50, z: 1.50, color: 0xf4f368, intensity: 0.39, dist: 5.0 },
  { x: -3.20, y: 0.80, z: 3.20, color: 0xeff060, intensity: 0.47, dist: 2.0 },
  { x: -1.90, y: 1.10, z: 4.90, color: 0xeaed58, intensity: 0.55, dist: 3.0 },
  { x: -0.60, y: 1.40, z: 6.60, color: 0xe5ea50, intensity: 0.15, dist: 4.0 },
  { x: 0.70, y: 1.70, z: -7.70, color: 0xe0e748, intensity: 0.23, dist: 5.0 },
  { x: 2.00, y: 0.50, z: -6.00, color: 0xfc0460, intensity: 0.31, dist: 2.0 },
  { x: 3.30, y: 0.80, z: -4.30, color: 0xf70158, intensity: 0.39, dist: 3.0 },
  { x: 4.60, y: 1.10, z: -2.60, color: 0xf1fe50, intensity: 0.47, dist: 4.0 },
  { x: 5.90, y: 1.40, z: -0.90, color: 0xecfb48, intensity: 0.55, dist: 5.0 },
  { x: 7.20, y: 1.70, z: 0.80, color: 0xe7f840, intensity: 0.15, dist: 2.0 },
  { x: -7.50, y: 0.50, z: 2.50, color: 0xe2f538, intensity: 0.23, dist: 3.0 },
  { x: -6.20, y: 0.80, z: 4.20, color: 0xfe1250, intensity: 0.31, dist: 4.0 },
  { x: -4.90, y: 1.10, z: 5.90, color: 0xf90f48, intensity: 0.39, dist: 5.0 },
  { x: -3.60, y: 1.40, z: 7.60, color: 0xf40c40, intensity: 0.47, dist: 2.0 },
  { x: -2.30, y: 1.70, z: -6.70, color: 0xef0938, intensity: 0.55, dist: 3.0 },
  { x: -1.00, y: 0.50, z: -5.00, color: 0xea0630, intensity: 0.15, dist: 4.0 },
  { x: 0.30, y: 0.80, z: -3.30, color: 0xe50328, intensity: 0.23, dist: 5.0 },
  { x: 1.60, y: 1.10, z: -1.60, color: 0xe00020, intensity: 0.31, dist: 2.0 },
  { x: 2.90, y: 1.40, z: 0.10, color: 0xfb1d38, intensity: 0.39, dist: 3.0 },
  { x: 4.20, y: 1.70, z: 1.80, color: 0xf61a30, intensity: 0.47, dist: 4.0 },
  { x: 5.50, y: 0.50, z: 3.50, color: 0xf11728, intensity: 0.55, dist: 5.0 },
  { x: 6.80, y: 0.80, z: 5.20, color: 0xec1420, intensity: 0.15, dist: 2.0 },
  { x: -7.90, y: 1.10, z: 6.90, color: 0xe71118, intensity: 0.23, dist: 3.0 },
  { x: -6.60, y: 1.40, z: -7.40, color: 0xe20e10, intensity: 0.31, dist: 4.0 },
  { x: -5.30, y: 1.70, z: -5.70, color: 0xfd2b28, intensity: 0.39, dist: 5.0 },
  { x: -4.00, y: 0.50, z: -4.00, color: 0xf82820, intensity: 0.47, dist: 2.0 },
  { x: -2.70, y: 0.80, z: -2.30, color: 0xf32518, intensity: 0.55, dist: 3.0 },
  { x: -1.40, y: 1.10, z: -0.60, color: 0xee2210, intensity: 0.15, dist: 4.0 },
  { x: -0.10, y: 1.40, z: 1.10, color: 0xe91f08, intensity: 0.23, dist: 5.0 },
  { x: 1.20, y: 1.70, z: 2.80, color: 0xe41c00, intensity: 0.31, dist: 2.0 },
  { x: 2.50, y: 0.50, z: 4.50, color: 0xff3918, intensity: 0.39, dist: 3.0 },
  { x: 3.80, y: 0.80, z: 6.20, color: 0xfa3610, intensity: 0.47, dist: 4.0 },
  { x: 5.10, y: 1.10, z: 7.90, color: 0xf53308, intensity: 0.55, dist: 5.0 },
  { x: 6.40, y: 1.40, z: -6.40, color: 0xf03000, intensity: 0.15, dist: 2.0 },
  { x: 7.70, y: 1.70, z: -4.70, color: 0xeb2cf8, intensity: 0.23, dist: 3.0 },
  { x: -7.00, y: 0.50, z: -3.00, color: 0xe629f0, intensity: 0.31, dist: 4.0 },
  { x: -5.70, y: 0.80, z: -1.30, color: 0xe126e8, intensity: 0.39, dist: 5.0 },
  { x: -4.40, y: 1.10, z: 0.40, color: 0xfc4400, intensity: 0.47, dist: 2.0 },
  { x: -3.10, y: 1.40, z: 2.10, color: 0xf740f8, intensity: 0.55, dist: 3.0 },
  { x: -1.80, y: 1.70, z: 3.80, color: 0xf23df0, intensity: 0.15, dist: 4.0 },
  { x: -0.50, y: 0.50, z: 5.50, color: 0xed3ae8, intensity: 0.23, dist: 5.0 },
  { x: 0.80, y: 0.80, z: 7.20, color: 0xe837e0, intensity: 0.31, dist: 2.0 },
  { x: 2.10, y: 1.10, z: -7.10, color: 0xe334d8, intensity: 0.39, dist: 3.0 },
  { x: 3.40, y: 1.40, z: -5.40, color: 0xfe51f0, intensity: 0.47, dist: 4.0 },
  { x: 4.70, y: 1.70, z: -3.70, color: 0xf94ee8, intensity: 0.55, dist: 5.0 },
  { x: 6.00, y: 0.50, z: -2.00, color: 0xf44be0, intensity: 0.15, dist: 2.0 },
  { x: 7.30, y: 0.80, z: -0.30, color: 0xef48d8, intensity: 0.23, dist: 3.0 },
  { x: -7.40, y: 1.10, z: 1.40, color: 0xea45d0, intensity: 0.31, dist: 4.0 },
  { x: -6.10, y: 1.40, z: 3.10, color: 0xe542c8, intensity: 0.39, dist: 5.0 },
  { x: -4.80, y: 1.70, z: 4.80, color: 0xe03fc0, intensity: 0.47, dist: 2.0 },
  { x: -3.50, y: 0.50, z: 6.50, color: 0xfb5cd8, intensity: 0.55, dist: 3.0 },
  { x: -2.20, y: 0.80, z: -7.80, color: 0xf659d0, intensity: 0.15, dist: 4.0 },
  { x: -0.90, y: 1.10, z: -6.10, color: 0xf156c8, intensity: 0.23, dist: 5.0 },
  { x: 0.40, y: 1.40, z: -4.40, color: 0xec53c0, intensity: 0.31, dist: 2.0 },
  { x: 1.70, y: 1.70, z: -2.70, color: 0xe750b8, intensity: 0.39, dist: 3.0 },
  { x: 3.00, y: 0.50, z: -1.00, color: 0xe24db0, intensity: 0.47, dist: 4.0 },
  { x: 4.30, y: 0.80, z: 0.70, color: 0xfd6ac8, intensity: 0.55, dist: 5.0 },
  { x: 5.60, y: 1.10, z: 2.40, color: 0xf867c0, intensity: 0.15, dist: 2.0 },
  { x: 6.90, y: 1.40, z: 4.10, color: 0xf364b8, intensity: 0.23, dist: 3.0 },
  { x: -7.80, y: 1.70, z: 5.80, color: 0xee61b0, intensity: 0.31, dist: 4.0 },
  { x: -6.50, y: 0.50, z: 7.50, color: 0xe95ea8, intensity: 0.39, dist: 5.0 },
  { x: -5.20, y: 0.80, z: -6.80, color: 0xe45ba0, intensity: 0.47, dist: 2.0 },
  { x: -3.90, y: 1.10, z: -5.10, color: 0xff78b8, intensity: 0.55, dist: 3.0 },
  { x: -2.60, y: 1.40, z: -3.40, color: 0xfa75b0, intensity: 0.15, dist: 4.0 },
  { x: -1.30, y: 1.70, z: -1.70, color: 0xf572a8, intensity: 0.23, dist: 5.0 },
];
const ShadowCascadeHints = [
  { cascade: 0, near: 1.0, far: 10.0, bias: 0.00010, radius: 1.00 },
  { cascade: 1, near: 1.5, far: 12.0, bias: 0.00012, radius: 1.30 },
  { cascade: 2, near: 2.0, far: 14.0, bias: 0.00014, radius: 1.60 },
  { cascade: 3, near: 2.5, far: 16.0, bias: 0.00016, radius: 1.90 },
  { cascade: 0, near: 3.0, far: 18.0, bias: 0.00018, radius: 2.20 },
  { cascade: 1, near: 3.5, far: 20.0, bias: 0.00020, radius: 1.00 },
  { cascade: 2, near: 4.0, far: 22.0, bias: 0.00022, radius: 1.30 },
  { cascade: 3, near: 4.5, far: 24.0, bias: 0.00024, radius: 1.60 },
  { cascade: 0, near: 5.0, far: 26.0, bias: 0.00026, radius: 1.90 },
  { cascade: 1, near: 5.5, far: 28.0, bias: 0.00028, radius: 2.20 },
  { cascade: 2, near: 6.0, far: 30.0, bias: 0.00030, radius: 1.00 },
  { cascade: 3, near: 6.5, far: 32.0, bias: 0.00032, radius: 1.30 },
  { cascade: 0, near: 7.0, far: 34.0, bias: 0.00034, radius: 1.60 },
  { cascade: 1, near: 7.5, far: 36.0, bias: 0.00036, radius: 1.90 },
  { cascade: 2, near: 8.0, far: 38.0, bias: 0.00038, radius: 2.20 },
  { cascade: 3, near: 8.5, far: 40.0, bias: 0.00040, radius: 1.00 },
  { cascade: 0, near: 9.0, far: 42.0, bias: 0.00042, radius: 1.30 },
  { cascade: 1, near: 9.5, far: 44.0, bias: 0.00044, radius: 1.60 },
  { cascade: 2, near: 10.0, far: 46.0, bias: 0.00046, radius: 1.90 },
  { cascade: 3, near: 10.5, far: 48.0, bias: 0.00048, radius: 2.20 },
  { cascade: 0, near: 11.0, far: 50.0, bias: 0.00050, radius: 1.00 },
  { cascade: 1, near: 11.5, far: 52.0, bias: 0.00052, radius: 1.30 },
  { cascade: 2, near: 12.0, far: 54.0, bias: 0.00054, radius: 1.60 },
  { cascade: 3, near: 12.5, far: 56.0, bias: 0.00056, radius: 1.90 },
  { cascade: 0, near: 13.0, far: 58.0, bias: 0.00058, radius: 2.20 },
  { cascade: 1, near: 13.5, far: 60.0, bias: 0.00060, radius: 1.00 },
  { cascade: 2, near: 14.0, far: 62.0, bias: 0.00062, radius: 1.30 },
  { cascade: 3, near: 14.5, far: 64.0, bias: 0.00064, radius: 1.60 },
  { cascade: 0, near: 15.0, far: 66.0, bias: 0.00066, radius: 1.90 },
  { cascade: 1, near: 15.5, far: 68.0, bias: 0.00068, radius: 2.20 },
  { cascade: 2, near: 16.0, far: 70.0, bias: 0.00070, radius: 1.00 },
  { cascade: 3, near: 16.5, far: 72.0, bias: 0.00072, radius: 1.30 },
  { cascade: 0, near: 17.0, far: 74.0, bias: 0.00074, radius: 1.60 },
  { cascade: 1, near: 17.5, far: 76.0, bias: 0.00076, radius: 1.90 },
  { cascade: 2, near: 18.0, far: 78.0, bias: 0.00078, radius: 2.20 },
  { cascade: 3, near: 18.5, far: 80.0, bias: 0.00080, radius: 1.00 },
  { cascade: 0, near: 19.0, far: 82.0, bias: 0.00082, radius: 1.30 },
  { cascade: 1, near: 19.5, far: 84.0, bias: 0.00084, radius: 1.60 },
  { cascade: 2, near: 20.0, far: 86.0, bias: 0.00086, radius: 1.90 },
  { cascade: 3, near: 20.5, far: 88.0, bias: 0.00088, radius: 2.20 },
];
window.KingTownEngine = {
  version: '6.1.0',
  getBuildings: () => buildings,
  getTroops: () => ({ ...troops }),
  totalPower, capacity, campLimit,
  scene, camera, renderer
};
console.info('[KingTown] v6.1.0 enhanced graphics ready');
