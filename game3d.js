/**
 * KingTown v4.2.0
 * جنگل انبوه | حمله ۳نقشه | پاداش روزانه | توپ جنگی | مقاومت سازه | حد ۲۵ نیرو | کماندار برج
 */
import * as THREE from 'three';

const $ = id => document.getElementById(id);
const container = document.getElementById('scene-container');
const SAVE_KEY = 'kingTown_v420';

let diamonds = 200, stone = 420, tokens = 15, oil = 0, level = 1;
let rot = 0, zoom = 1.05, mode = 'build', chosen = null, selectedKey = null, moveTarget = null;
let enemyHP = 160, clan = null, thUpgrade = null, lastDaily = null;
const trainQueue = [];
const troops = { swordsman: 0, archer: 0, thief: 0, cavalry: 0 };
const MAX_MINE = 5, TH_MAX = 5, TOKEN_MAX = 100;

// مقاومت تخریب (hp) برای هر سازه
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

function campLimit() { return 20 + getThLevel() * 5; } // سطح۱ = ۲۵
function thUpgradeSeconds(n) { return 120 * n; }
function capacity() {
  const lv = getThLevel();
  return { diamonds: 500, stone: 900 + lv * 300, oil: 40 + lv * 20, tokens: TOKEN_MAX };
}
function canUpgradeTH(next) {
  return buildings.filter(b => b.type !== 'wall' && b.type !== 'townhall').length >= Math.max(2, next);
}
function totalTroops() {
  return troops.swordsman + troops.archer + troops.thief + troops.cavalry;
}
function totalPower() {
  return Object.keys(troops).reduce((s, t) => s + troops[t] * troopPower[t], 0);
}

let buildings = [
  { type: 'townhall', x: 0, z: 0, thLevel: 1, rotY: 0, hp: 500 },
  { type: 'diamondmine', x: -2, z: -1, rotY: 0, hp: 120 },
  { type: 'stonepit', x: 2, z: -1, rotY: 0, hp: 140 },
  { type: 'barracks', x: -2, z: 2, rotY: 0, hp: 200 },
  { type: 'cannon', x: 2, z: 2, rotY: 0, hp: 180 },
  { type: 'wall', x: -1, z: 3, rotY: 0, hp: 100 },
  { type: 'wall', x: 0, z: 3, rotY: 0, hp: 100 },
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

// ——— Three.js ———
const scene = new THREE.Scene();
// آسمان جنگلی به‌جای آبی خالص
scene.background = new THREE.Color(0x3a6a40);
scene.fog = new THREE.Fog(0x3a6a40, 28, 70);

const frustum = 13;
let aspect = container.clientWidth / Math.max(container.clientHeight, 1);
const camera = new THREE.OrthographicCamera(-frustum * aspect, frustum * aspect, frustum, -frustum, 0.1, 200);
camera.position.set(20, 18, 20); camera.lookAt(0, 0.4, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.insertBefore(renderer.domElement, container.firstChild);
Object.assign(renderer.domElement.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', touchAction: 'none' });

scene.add(new THREE.HemisphereLight(0xe8f0d0, 0x2a4a20, 0.5));
const sun = new THREE.DirectionalLight(0xfff0c8, 1.35);
sun.position.set(-12, 22, 10); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 2; sun.shadow.camera.far = 65;
sun.shadow.camera.left = sun.shadow.camera.bottom = -24;
sun.shadow.camera.right = sun.shadow.camera.top = 24;
sun.shadow.bias = -0.00025;
scene.add(sun);
scene.add(new THREE.DirectionalLight(0x80a070, 0.25).translateX(10).translateY(5).translateZ(-12));

const grassA = new THREE.MeshStandardMaterial({ color: 0x4e9038, roughness: 0.8 });
const grassB = new THREE.MeshStandardMaterial({ color: 0x458832, roughness: 0.8 });
const tileGeo = new THREE.BoxGeometry(1, 0.12, 1);
for (let x = -12; x <= 12; x++) for (let z = -12; z <= 12; z++) {
  const m = new THREE.Mesh(tileGeo, (x + z) % 2 === 0 ? grassA : grassB);
  m.position.set(x, -0.06, z); m.receiveShadow = true; scene.add(m);
}

// جنگل انبوه در حاشیه (بجای فضای خالی آبی)
const leafMat = new THREE.MeshStandardMaterial({ color: 0x1e5a28, roughness: 0.65 });
const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3018, roughness: 0.75 });
function denseTree(x, z, scale = 1) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08 * scale, 0.14 * scale, 0.9 * scale, 5), trunkMat);
  trunk.position.y = 0.45 * scale; trunk.castShadow = true; g.add(trunk);
  [0.75, 0.58, 0.4].forEach((s, i) => {
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(s * scale, 1), leafMat);
    leaf.position.y = (1.1 + i * 0.4) * scale; leaf.castShadow = true; g.add(leaf);
  });
  g.position.set(x, 0, z); scene.add(g);
}
for (let i = -11; i <= 11; i++) {
  denseTree(i, -11, 0.9 + (i % 3) * 0.15);
  denseTree(i, 11, 0.85 + (i % 2) * 0.2);
  if (i % 1 === 0) { denseTree(-11, i, 0.9); denseTree(11, i, 0.95); }
}
// ردیف دوم جنگل برای تراکم
for (let i = -10; i <= 10; i += 2) {
  denseTree(i + 0.5, -10, 0.7);
  denseTree(i - 0.3, 10, 0.75);
  denseTree(-10, i + 0.4, 0.7);
  denseTree(10, i - 0.2, 0.8);
}

// کمپ + آتش
const campGroup = new THREE.Group();
const campFloor = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.1, 0.1, 28), new THREE.MeshStandardMaterial({ color: 0x4a3828, roughness: 0.85 }));
campFloor.position.set(0, 0.03, -4.2); campFloor.receiveShadow = true; campGroup.add(campFloor);
for (let i = 0; i < 6; i++) {
  const a = (i / 6) * Math.PI * 2;
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12, 0), new THREE.MeshStandardMaterial({ color: 0x6a6a5a }));
  rock.position.set(Math.cos(a) * 0.35, 0.12, -4.2 + Math.sin(a) * 0.35); campGroup.add(rock);
}
const fireCore = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 5), new THREE.MeshBasicMaterial({ color: 0xff6020 }));
fireCore.position.set(0, 0.28, -4.2); fireCore.name = 'fire'; campGroup.add(fireCore);
const fireOuter = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.45, 5), new THREE.MeshBasicMaterial({ color: 0xffa030, transparent: true, opacity: 0.55 }));
fireOuter.position.set(0, 0.32, -4.2); fireOuter.name = 'fire2'; campGroup.add(fireOuter);
campGroup.add(new THREE.PointLight(0xff6020, 1.1, 6).translateY(0.5).translateZ(-4.2));
scene.add(campGroup);

const buildingMeshes = new Map();
const troopMeshes = [];
const fullLabels = new Map();
const arrows = [];

function disposeObj(obj) {
  obj.traverse(c => {
    if (c.geometry) c.geometry.dispose?.();
    if (c.material) (Array.isArray(c.material) ? c.material : [c.material]).forEach(m => m.dispose?.());
  });
}
function thColors(lv) {
  return [[0xc48b4a, 0xe3bd62], [0xb87a3a, 0xd4a84b], [0x8a5a2a, 0xc09040], [0x6a4020, 0xa07030], [0x4a3018, 0x806028]][Math.min(Math.max(lv, 1), 5) - 1];
}

function createBuildingMesh(b) {
  const g = new THREE.Group();
  g.userData = { key: `${b.x},${b.z}`, type: b.type };
  const addRing = () => {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.72, 0.86, 32), new THREE.MeshBasicMaterial({ color: 0x40d0d8, transparent: true, opacity: 0.65, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; ring.visible = false; ring.name = 'selRing'; g.add(ring);
  };

  if (b.type === 'wall') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.92, 0.4), new THREE.MeshStandardMaterial({ color: 0x8a9a8e, roughness: 0.65, metalness: 0.08 }));
    body.position.y = 0.46; body.castShadow = true; g.add(body);
    for (let i = -0.36; i <= 0.36; i += 0.36) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.26, 0.44), new THREE.MeshStandardMaterial({ color: 0x9aa89e }));
      m.position.set(i, 1.05, 0); m.castShadow = true; g.add(m);
    }
    addRing(); g.rotation.y = ((b.rotY || 0) * Math.PI) / 180; return g;
  }

  // برج دفاعی: بدون سقف + کماندار + تیر
  if (b.type === 'cannon') {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, 0.28, 8), new THREE.MeshStandardMaterial({ color: 0x5a4a32, roughness: 0.75 }));
    base.position.y = 0.14; base.castShadow = true; g.add(base);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 1.5, 8), new THREE.MeshStandardMaterial({ color: 0x7a8a82, roughness: 0.6 }));
    tower.position.y = 0.95; tower.castShadow = true; g.add(tower);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const mer = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.16), new THREE.MeshStandardMaterial({ color: 0x9aa89e }));
      mer.position.set(Math.cos(a) * 0.4, 1.8, Math.sin(a) * 0.4); g.add(mer);
    }
    // کماندار داخل برج
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.12), new THREE.MeshStandardMaterial({ color: 0x5a3a6a }));
    body.position.y = 1.75; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 5), new THREE.MeshStandardMaterial({ color: 0xd4a574 }));
    head.position.y = 1.95; g.add(head);
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.015, 4, 8, Math.PI), new THREE.MeshStandardMaterial({ color: 0x8a5a2a }));
    bow.position.set(0.12, 1.78, 0); bow.rotation.y = Math.PI / 2; g.add(bow);
    g.userData.isTower = true;
    addRing(); return g;
  }

  // توپ جنگی
  if (b.type === 'warcannon') {
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.9), new THREE.MeshStandardMaterial({ color: 0x4a3a28 }));
    base.position.y = 0.15; base.castShadow = true; g.add(base);
    const wheels = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.0, 8), new THREE.MeshStandardMaterial({ color: 0x3a2a18, roughness: 0.8 }));
    wheels.rotation.z = Math.PI / 2; wheels.position.y = 0.2; g.add(wheels);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 1.1, 8), new THREE.MeshStandardMaterial({ color: 0x4a4a42, metalness: 0.5, roughness: 0.4 }));
    barrel.rotation.z = Math.PI / 2; barrel.position.set(0.2, 0.45, 0); barrel.castShadow = true; g.add(barrel);
    g.userData.isWarCannon = true;
    addRing(); return g;
  }

  const isTH = b.type === 'townhall';
  const lv = isTH ? (b.thLevel || 1) : 1;
  const [col, roofCol] = isTH ? thColors(lv) : ({
    diamondmine: [0x38c8d0, 0x70e8f0],
    stonepit: [0x8a9a92, 0xb0c0b8],
    barracks: [0xb07040, 0xd09858]
  }[b.type] || [0x888888, 0xaaaaaa]);

  const base = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.22, 1.18), new THREE.MeshStandardMaterial({ color: 0x5a4a30, roughness: 0.8 }));
  base.position.y = 0.11; base.castShadow = true; base.receiveShadow = true; g.add(base);

  if (isTH && lv >= 3) {
    const bodyH = 1.0 + (lv - 3) * 0.35;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, bodyH, 6), new THREE.MeshStandardMaterial({ color: col, roughness: 0.5, metalness: 0.12 }));
    body.position.y = 0.22 + bodyH / 2; body.castShadow = true; g.add(body);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.6 + lv * 0.05, 6), new THREE.MeshStandardMaterial({ color: roofCol, roughness: 0.4, metalness: 0.15 }));
    roof.position.y = 0.22 + bodyH + 0.3; roof.castShadow = true; g.add(roof);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 5), new THREE.MeshStandardMaterial({ color: 0x4a3a28 }));
    pole.position.y = 0.22 + bodyH + 0.9; g.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.28), new THREE.MeshStandardMaterial({ color: 0xc03028, side: THREE.DoubleSide }));
    flag.position.set(0.25, 0.22 + bodyH + 1.25, 0); g.add(flag);
    if (lv >= 4) {
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.2), new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: 0xaa8800, emissiveIntensity: 0.55, metalness: 0.6 }));
      gem.position.y = 0.22 + bodyH + 0.55; g.add(gem);
    }
  } else {
    const bodyH = isTH ? 0.7 + lv * 0.22 : 0.95;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.98, bodyH, 0.98), new THREE.MeshStandardMaterial({ color: col, roughness: 0.55 }));
    body.position.y = 0.22 + bodyH / 2; body.castShadow = true; g.add(body);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.85, 0.48 + (isTH ? lv * 0.06 : 0), 4), new THREE.MeshStandardMaterial({ color: roofCol, roughness: 0.45 }));
    roof.position.y = 0.22 + bodyH + 0.26; roof.rotation.y = Math.PI / 4; roof.castShadow = true; g.add(roof);
    if (isTH) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.85 + lv * 0.1, 5), new THREE.MeshStandardMaterial({ color: 0x4a3a28 }));
      pole.position.y = 0.22 + bodyH + 0.65; g.add(pole);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.24), new THREE.MeshStandardMaterial({ color: 0xc03028, side: THREE.DoubleSide }));
      flag.position.set(0.2, 0.22 + bodyH + 0.95, 0); g.add(flag);
    }
  }

  if (b.type === 'diamondmine') {
    const cry = new THREE.Mesh(new THREE.OctahedronGeometry(0.34, 0), new THREE.MeshStandardMaterial({ color: 0x40d8e0, emissive: 0x208898, emissiveIntensity: 0.5, metalness: 0.55, roughness: 0.12 }));
    cry.position.y = 1.55; cry.castShadow = true; cry.userData.spin = true; g.add(cry);
  }
  if (b.type === 'barracks') {
    const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.08, 6), new THREE.MeshStandardMaterial({ color: 0xc04030 }));
    sh.rotation.x = Math.PI / 2; sh.position.set(0, 1.2, 0.5); g.add(sh);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshBasicMaterial({ color: 0xe8a020, transparent: true, opacity: 0 }));
    glow.position.y = 1.8; glow.name = 'trainGlow'; g.add(glow);
  }
  addRing(); return g;
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
      ctx.fillStyle = 'rgba(15,35,25,0.9)'; ctx.beginPath();
      ctx.roundRect(4, 4, 120, 40, 8); ctx.fill();
      ctx.fillStyle = '#f0d060'; ctx.font = 'bold 22px system-ui'; ctx.textAlign = 'center';
      ctx.fillText('پر شد!', 64, 32);
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true }));
      spr.scale.set(1.4, 0.5, 1); spr.position.set(b.x, 2.2, b.z);
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
      $('btn-rotate-sel')?.classList.toggle('hide', b.type !== 'wall');
    }
  } else info.classList.add('hide');
}

function createTroopMesh(type) {
  const g = new THREE.Group();
  const skin = type === 'archer' ? 0xf5c6a0 : type === 'thief' ? 0xc4a080 : type === 'cavalry' ? 0xd8b090 : 0xd4a574;
  const cloth = type === 'swordsman' ? 0x2a4a8a : type === 'archer' ? 0x6a2a8a : type === 'thief' ? 0x3a4a2a : 0x6a3a1a;
  if (type === 'cavalry') {
    const horse = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.28, 0.55), new THREE.MeshStandardMaterial({ color: 0x5a3a20 }));
    horse.position.y = 0.35; horse.castShadow = true; g.add(horse);
    const hHead = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.28), new THREE.MeshStandardMaterial({ color: 0x5a3a20 }));
    hHead.position.set(0, 0.48, 0.35); g.add(hHead);
    [-0.12, 0.12].forEach(lx => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.28, 0.07), new THREE.MeshStandardMaterial({ color: 0x3a2a15 }));
      leg.position.set(lx, 0.14, 0.15); g.add(leg);
      const leg2 = leg.clone(); leg2.position.z = -0.15; g.add(leg2);
    });
    const rider = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.25, 0.14), new THREE.MeshStandardMaterial({ color: cloth }));
    rider.position.y = 0.6; g.add(rider);
    const rHead = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), new THREE.MeshStandardMaterial({ color: skin }));
    rHead.position.y = 0.8; g.add(rHead);
    return g;
  }
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.28, 0.12), new THREE.MeshStandardMaterial({ color: 0x2a2a2a }));
  legs.position.y = 0.2; g.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.32, 0.16), new THREE.MeshStandardMaterial({ color: cloth }));
  torso.position.y = 0.52; torso.castShadow = true; g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 7, 6), new THREE.MeshStandardMaterial({ color: skin }));
  head.position.y = 0.8; g.add(head);
  if (type === 'swordsman') {
    const sword = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.45, 0.04), new THREE.MeshStandardMaterial({ color: 0xc0c8d0, metalness: 0.7 }));
    sword.position.set(0.2, 0.55, 0); g.add(sword);
  }
  if (type === 'archer') {
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.02, 4, 10, Math.PI), new THREE.MeshStandardMaterial({ color: 0x8a5a2a }));
    bow.position.set(0.18, 0.55, 0); bow.rotation.y = Math.PI / 2; g.add(bow);
  }
  if (type === 'thief') {
    const hood = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.2, 6), new THREE.MeshStandardMaterial({ color: 0x2a3a2a }));
    hood.position.y = 0.95; g.add(hood);
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
      m.position.set(-1.0 + col * 0.5, 0, -5.0 + row * 0.42);
      m.userData = { baseX: m.position.x, baseZ: m.position.z, phase: Math.random() * 6.28, speed: 0.3 + Math.random() * 0.4 };
      m.scale.setScalar(type === 'cavalry' ? 0.75 : 0.85);
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
    const raw = localStorage.getItem(SAVE_KEY) || localStorage.getItem('kingTown_v405');
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

// ساخت
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
  if (Math.abs(gx) > 11 || Math.abs(gz) > 11) return;
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
    if (glow) glow.material.opacity = training ? 0.35 + Math.sin(now * 0.008) * 0.3 : 0;
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

$('btn-join-clan')?.addEventListener('click', () => { clan = { name: 'کلن طلایی' }; updateUI(); message('به کلن طلایی پیوستید!'); });

// پاداش روزانه
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

// ——— سیستم حمله با ۳ نقشه ———
let atkPick = null; // troop type
const deploy = {}; // side -> { type, count }

function openAttackPage() {
  if (totalTroops() <= 0) { message('نیرویی برای حمله ندارید'); return; }
  Object.keys(deploy).forEach(k => delete deploy[k]);
  atkPick = null;
  // ساخت drop zones
  document.querySelectorAll('.drop-zones').forEach(dz => {
    dz.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      const z = document.createElement('div');
      z.className = 'drop-zone';
      z.dataset.slot = i;
      z.addEventListener('click', () => {
        if (!atkPick) { message('ابتدا نوع نیرو را انتخاب کنید'); return; }
        const side = dz.dataset.side;
        const key = side + '-' + i;
        deploy[key] = { type: atkPick, side };
        z.classList.add('filled');
        z.textContent = troopIcons[atkPick];
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
        message('نیرو: ' + troopNames[atkPick] + ' — نقطه حمله را روی نقشه بزنید');
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
      ? Object.entries(deploy).map(([k, v]) => troopIcons[v.type] + ' → ' + v.side).join(' · ')
      : 'هنوز نیرویی مستقر نشده';
  }
  const go = $('attack-go');
  if (go) go.disabled = n === 0;
}

$('attack')?.addEventListener('click', openAttackPage);
$('attack-close')?.addEventListener('click', () => $('attack-page')?.classList.add('hide'));

$('attack-go')?.addEventListener('click', () => {
  const deployed = Object.values(deploy);
  if (!deployed.length) return;
  // قدرت بر اساس نوع حمله و دفاع
  let atkPower = 0;
  deployed.forEach(d => {
    let p = troopPower[d.type];
    // شمال: charge/melee بهتر | مرکز: ranged | جنوب: raid
    if (d.side === 'north' && (troopAtk[d.type] === 'charge' || troopAtk[d.type] === 'melee')) p *= 1.25;
    if (d.side === 'center' && troopAtk[d.type] === 'ranged') p *= 1.3;
    if (d.side === 'south' && troopAtk[d.type] === 'raid') p *= 1.35;
    atkPower += p;
  });
  // دفاع دشمن
  const defPower = enemyHP * 0.45 + countType('cannon') * 15 + countType('warcannon') * 30 + countType('wall') * 5;
  const diff = Math.abs(atkPower - defPower);

  // مصرف یک نیرو از هر نوع مستقر
  const used = {};
  deployed.forEach(d => { used[d.type] = (used[d.type] || 0) + 1; });
  Object.keys(used).forEach(t => { troops[t] = Math.max(0, troops[t] - used[t]); });

  let won;
  if (diff <= 7) {
    // نزدیک: بر اساس نوع حمله غالب
    const types = deployed.map(d => troopAtk[d.type]);
    const ranged = types.filter(t => t === 'ranged').length;
    const charge = types.filter(t => t === 'charge' || t === 'melee').length;
    won = ranged >= charge ? atkPower + 5 >= defPower : atkPower >= defPower - 3;
  } else {
    won = atkPower > defPower;
  }

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

// جنگ کلن
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
    if (diff <= 7) won = myP + (troops.archer * 2) >= enemyP; // کماندار در نبرد نزدیک مزیت
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
// modal unused legacy
$('retreat')?.addEventListener('click', () => $('modal')?.classList.add('hide'));

function applyView() {
  const angle = rot * Math.PI / 2 + Math.PI / 4;
  const dist = 20 / zoom;
  camera.position.set(Math.sin(angle) * dist, dist * 0.9, Math.cos(angle) * dist);
  camera.lookAt(0, 0.5, 0); camera.zoom = zoom; camera.updateProjectionMatrix();
}
$('left')?.addEventListener('click', () => { rot = (rot + 3) % 4; applyView(); });
$('right')?.addEventListener('click', () => { rot = (rot + 1) % 4; applyView(); });
$('plus')?.addEventListener('click', () => { zoom = Math.min(2.4, zoom + 0.15); applyView(); });
$('minus')?.addEventListener('click', () => { zoom = Math.max(0.55, zoom - 0.15); applyView(); });
applyView();

setInterval(() => {
  stone += countType('stonepit') * (2 + (getThLevel() - 1) * 0.3);
  clampResources(); updateUI();
}, 1200);
setInterval(() => {
  diamonds += countType('diamondmine') * 1;
  clampResources(); updateUI();
}, 60000);

// تیر کماندار برج — جزئیات بیشتر
setInterval(() => {
  buildings.filter(b => b.type === 'cannon').forEach(b => {
    // تیر با سر و پر
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.45, 5), new THREE.MeshStandardMaterial({ color: 0x8a6a3a, metalness: 0.1 }));
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 5), new THREE.MeshStandardMaterial({ color: 0xc0c0b0, metalness: 0.6 }));
    tip.position.y = 0.28; shaft.add(tip);
    const fletch = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.06), new THREE.MeshStandardMaterial({ color: 0xc03028 }));
    fletch.position.y = -0.2; shaft.add(fletch);
    shaft.position.set(b.x, 1.95, b.z);
    shaft.rotation.z = Math.PI / 2;
    const dir = new THREE.Vector3((Math.random() - 0.5) * 2, -0.05, (Math.random() - 0.5) * 2).normalize();
    shaft.userData = { vel: dir.multiplyScalar(0.18), life: 45 };
    scene.add(shaft); arrows.push(shaft);
  });
}, 2600);

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
  buildingMeshes.forEach(mesh => mesh.traverse(c => { if (c.userData?.spin) c.rotation.y = t * 1.6; }));
  troopMeshes.forEach(m => {
    const ph = m.userData.phase + t * m.userData.speed;
    m.position.x = m.userData.baseX + Math.sin(ph) * 0.15;
    m.position.z = m.userData.baseZ + Math.cos(ph * 0.7) * 0.12;
    m.position.y = Math.sin(t * 2 + m.userData.phase) * 0.02;
    m.rotation.y = Math.sin(ph) * 0.3;
  });
  const f1 = campGroup.getObjectByName('fire'), f2 = campGroup.getObjectByName('fire2');
  if (f1) { f1.scale.y = 0.9 + Math.sin(t * 8) * 0.2; f1.rotation.y = t * 2; }
  if (f2) { f2.scale.y = 1 + Math.sin(t * 6 + 1) * 0.25; f2.rotation.y = -t * 1.5; }
  for (let i = arrows.length - 1; i >= 0; i--) {
    const a = arrows[i];
    a.position.add(a.userData.vel);
    a.userData.life--;
    if (a.userData.life <= 0) { scene.remove(a); disposeObj(a); arrows.splice(i, 1); }
  }
  updateTraining(); updateThUpgrade();
  renderer.render(scene, camera);
}

rebuildBuildings(); refreshTroopVisuals(); updateUI(); animate();

window.KingTownEngine = {
  version: '4.2.0', getBuildings: () => buildings, getTroops: () => ({ ...troops }),
  totalPower, capacity, campLimit, scene, camera, renderer
};
console.info('[KingTown] v4.2.0 ready');
