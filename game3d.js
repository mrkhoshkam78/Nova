/**
 * KingTown v4.0.5
 * کیفیت بالاتر | سکه | کمپ آتش | چندآموزش | جنگ کلن | تایمر ارتقا TH | سواره | برج تیرانداز
 */
import * as THREE from 'three';

const $ = id => document.getElementById(id);
const container = document.getElementById('scene-container');
const SAVE_KEY = 'kingTown_v405';

let diamonds = 200, stone = 420, tokens = 15, oil = 0, level = 1;
let rot = 0, zoom = 1.05, mode = 'build', chosen = null, selectedKey = null, moveTarget = null;
let enemyHP = 160;
let clan = null; // { name, power }
let thUpgrade = null; // { endsAt, duration, nextLv }
const trainQueue = []; // multiple simultaneous

const troops = { swordsman: 0, archer: 0, thief: 0, cavalry: 0 };
const MAX_MINE = 5, TH_MAX = 5, TOKEN_MAX = 100;

const defs = {
  townhall:    { name: 'مرکز فرماندهی', costD: 0, costT: 0, costS: 0, max: 1 },
  diamondmine: { name: 'معدن الماس', costD: 0, costT: 5, costS: 0, max: MAX_MINE },
  stonepit:    { name: 'معدن سنگ', costD: 150, costT: 0, costS: 0, max: MAX_MINE },
  barracks:    { name: 'پادگان', costD: 180, costT: 0, costS: 0, max: 99 },
  cannon:      { name: 'برج دفاعی', costD: 0, costT: 0, costS: 120, max: 99 },
  wall:        { name: 'دیوار', costD: 0, costT: 0, costS: 40, max: 99 }
};

const troopCost = { swordsman: 8, archer: 10, thief: 12, cavalry: 20 };
const troopTime = { swordsman: 7, archer: 20, thief: 12, cavalry: 30 };
const troopPower = { swordsman: 18, archer: 22, thief: 15, cavalry: 35 };
const troopNames = { swordsman: 'شمشیردار', archer: 'کماندار', thief: 'دزد', cavalry: 'سواره' };
const troopIcons = { swordsman: '🗡️', archer: '🏹', thief: '🥷', cavalry: '🐴' };

// تایمر ارتقا TH: سطح n→n+1 = 2min * n
function thUpgradeSeconds(nextLv) { return 120 * nextLv; }

function capacity() {
  const lv = getThLevel();
  return { diamonds: 500, stone: 900 + lv * 300, oil: 40 + lv * 20, tokens: TOKEN_MAX };
}

function canUpgradeTH(next) {
  const imp = buildings.filter(b => b.type !== 'wall' && b.type !== 'townhall');
  return imp.length >= Math.max(2, next);
}

let buildings = [
  { type: 'townhall', x: 0, z: 0, thLevel: 1, rotY: 0 },
  { type: 'diamondmine', x: -2, z: -1, rotY: 0 },
  { type: 'stonepit', x: 2, z: -1, rotY: 0 },
  { type: 'barracks', x: -2, z: 2, rotY: 0 },
  { type: 'cannon', x: 2, z: 2, rotY: 0 },
  { type: 'wall', x: -1, z: 3, rotY: 0 },
  { type: 'wall', x: 0, z: 3, rotY: 0 },
  { type: 'wall', x: 1, z: 3, rotY: 0 }
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
scene.background = new THREE.Color(0x6aa8d8);
scene.fog = new THREE.Fog(0x6aa8d8, 38, 78);

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
renderer.toneMappingExposure = 1.22;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.insertBefore(renderer.domElement, container.firstChild);
Object.assign(renderer.domElement.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', touchAction: 'none' });

scene.add(new THREE.HemisphereLight(0xfff8e8, 0x2a4a28, 0.55));
const sun = new THREE.DirectionalLight(0xfff2d0, 1.4);
sun.position.set(-12, 22, 10); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 2; sun.shadow.camera.far = 65;
sun.shadow.camera.left = sun.shadow.camera.bottom = -24;
sun.shadow.camera.right = sun.shadow.camera.top = 24;
sun.shadow.bias = -0.00025;
scene.add(sun);
scene.add(new THREE.DirectionalLight(0x90b8ff, 0.3).translateX(10).translateY(5).translateZ(-12));

// بافت زمین بهتر
const grassA = new THREE.MeshStandardMaterial({ color: 0x5ea040, roughness: 0.82, metalness: 0.02 });
const grassB = new THREE.MeshStandardMaterial({ color: 0x529638, roughness: 0.82, metalness: 0.02 });
const tileGeo = new THREE.BoxGeometry(1, 0.12, 1);
for (let x = -12; x <= 12; x++) for (let z = -12; z <= 12; z++) {
  const m = new THREE.Mesh(tileGeo, (x + z) % 2 === 0 ? grassA : grassB);
  m.position.set(x, -0.06, z); m.receiveShadow = true; scene.add(m);
}

function addTree(x, z) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.85, 6), new THREE.MeshStandardMaterial({ color: 0x5a3820, roughness: 0.75 }));
  trunk.position.y = 0.42; trunk.castShadow = true; g.add(trunk);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2a6830, roughness: 0.7 });
  [0.7, 0.55, 0.38].forEach((s, i) => {
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), leafMat);
    leaf.position.y = 1.05 + i * 0.42; leaf.castShadow = true; g.add(leaf);
  });
  g.position.set(x, 0, z); scene.add(g);
}
for (let i = -10; i <= 10; i += 2) { addTree(i, -11); addTree(i, 11); addTree(-11, i); addTree(11, i); }

// کمپ با آتش مرکزی
const campGroup = new THREE.Group();
const campMat = new THREE.MeshStandardMaterial({ color: 0x4a3828, roughness: 0.85 });
const campFloor = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.1, 0.1, 28), campMat);
campFloor.position.set(0, 0.03, -4.2); campFloor.receiveShadow = true; campGroup.add(campFloor);
// سنگ‌های آتش
for (let i = 0; i < 6; i++) {
  const ang = (i / 6) * Math.PI * 2;
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12, 0), new THREE.MeshStandardMaterial({ color: 0x6a6a5a }));
  rock.position.set(Math.cos(ang) * 0.35, 0.12, -4.2 + Math.sin(ang) * 0.35);
  campGroup.add(rock);
}
// شعله
const fireCore = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 5), new THREE.MeshBasicMaterial({ color: 0xff6020 }));
fireCore.position.set(0, 0.28, -4.2); fireCore.name = 'fire'; campGroup.add(fireCore);
const fireOuter = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.45, 5), new THREE.MeshBasicMaterial({ color: 0xffa030, transparent: true, opacity: 0.6 }));
fireOuter.position.set(0, 0.32, -4.2); fireOuter.name = 'fire2'; campGroup.add(fireOuter);
// نور آتش
const fireLight = new THREE.PointLight(0xff6020, 1.2, 6);
fireLight.position.set(0, 0.5, -4.2); campGroup.add(fireLight);
scene.add(campGroup);

const buildingMeshes = new Map();
const troopMeshes = [];
const fullLabels = new Map(); // "x,z" -> sprite-like mesh
const arrows = []; // tower projectiles

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
    // بدنه ضخیم‌تر برای اتصال بهتر کنج
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.9, 0.38), new THREE.MeshStandardMaterial({ color: 0x8a9a8e, roughness: 0.7, metalness: 0.05 }));
    body.position.y = 0.45; body.castShadow = true; g.add(body);
    for (let i = -0.35; i <= 0.35; i += 0.35) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, 0.42), new THREE.MeshStandardMaterial({ color: 0x9aa89e }));
      m.position.set(i, 1.02, 0); m.castShadow = true; g.add(m);
    }
    addRing();
    g.rotation.y = ((b.rotY || 0) * Math.PI) / 180;
    return g;
  }

  const isTH = b.type === 'townhall';
  const lv = isTH ? (b.thLevel || 1) : 1;

  // برج دفاعی: بدون سقف، طراحی برج + تیر
  if (b.type === 'cannon') {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.25, 8), new THREE.MeshStandardMaterial({ color: 0x5a4a32 }));
    base.position.y = 0.12; base.castShadow = true; g.add(base);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.48, 1.4, 8), new THREE.MeshStandardMaterial({ color: 0x7a8a82, roughness: 0.65 }));
    tower.position.y = 0.9; tower.castShadow = true; g.add(tower);
    // کنگره بالای برج
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const mer = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.2, 0.15), new THREE.MeshStandardMaterial({ color: 0x9aa89e }));
      mer.position.set(Math.cos(a) * 0.38, 1.7, Math.sin(a) * 0.38); g.add(mer);
    }
    // کماندار روی برج
    const archer = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), new THREE.MeshStandardMaterial({ color: 0xd4a574 }));
    archer.position.y = 1.85; g.add(archer);
    g.userData.isTower = true;
    addRing();
    return g;
  }

  const [col, roofCol] = isTH ? thColors(lv) : ({
    diamondmine: [0x38c8d0, 0x70e8f0],
    stonepit: [0x8a9a92, 0xb0c0b8],
    barracks: [0xb07040, 0xd09858]
  }[b.type] || [0x888888, 0xaaaaaa]);

  const base = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.22, 1.18), new THREE.MeshStandardMaterial({ color: 0x5a4a30, roughness: 0.8 }));
  base.position.y = 0.11; base.castShadow = true; base.receiveShadow = true; g.add(base);

  // از سطح ۳ ظاهر TH کاملاً تغییر می‌کند
  if (isTH && lv >= 3) {
    const bodyH = 1.0 + (lv - 3) * 0.35;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, bodyH, 6), new THREE.MeshStandardMaterial({ color: col, roughness: 0.55, metalness: 0.1 }));
    body.position.y = 0.22 + bodyH / 2; body.castShadow = true; g.add(body);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.6 + lv * 0.05, 6), new THREE.MeshStandardMaterial({ color: roofCol, roughness: 0.45, metalness: 0.15 }));
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
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.98, bodyH, 0.98), new THREE.MeshStandardMaterial({ color: col, roughness: 0.6 }));
    body.position.y = 0.22 + bodyH / 2; body.castShadow = true; g.add(body);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.85, 0.48 + (isTH ? lv * 0.06 : 0), 4), new THREE.MeshStandardMaterial({ color: roofCol, roughness: 0.5 }));
    roof.position.y = 0.22 + bodyH + 0.26; roof.rotation.y = Math.PI / 4; roof.castShadow = true; g.add(roof);
    if (isTH) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.85 + lv * 0.1, 5), new THREE.MeshStandardMaterial({ color: 0x4a3a28 }));
      pole.position.y = 0.22 + bodyH + 0.65; g.add(pole);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.24), new THREE.MeshStandardMaterial({ color: 0xc03028, side: THREE.DoubleSide }));
      flag.position.set(0.2, 0.22 + bodyH + 0.95, 0); g.add(flag);
    }
  }

  if (b.type === 'diamondmine') {
    const cry = new THREE.Mesh(new THREE.OctahedronGeometry(0.34, 0), new THREE.MeshStandardMaterial({ color: 0x40d8e0, emissive: 0x208898, emissiveIntensity: 0.5, metalness: 0.55, roughness: 0.15 }));
    cry.position.y = 1.55; cry.castShadow = true; cry.userData.spin = true; g.add(cry);
  }
  if (b.type === 'barracks') {
    const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.08, 6), new THREE.MeshStandardMaterial({ color: 0xc04030 }));
    sh.rotation.x = Math.PI / 2; sh.position.set(0, 1.2, 0.5); g.add(sh);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshBasicMaterial({ color: 0xe8a020, transparent: true, opacity: 0 }));
    glow.position.y = 1.8; glow.name = 'trainGlow'; g.add(glow);
  }

  addRing();
  return g;
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
  fullLabels.forEach(m => { scene.remove(m); });
  fullLabels.clear();
  const cap = capacity();
  const showD = diamonds >= cap.diamonds - 0.5;
  const showS = stone >= cap.stone - 0.5;
  buildings.forEach(b => {
    if ((b.type === 'diamondmine' && showD) || (b.type === 'stonepit' && showS)) {
      // برچسب ساده با صفحه رنگی
      const canvas = document.createElement('canvas');
      canvas.width = 128; canvas.height = 48;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'rgba(20,40,30,0.85)';
      ctx.roundRect(4, 4, 120, 40, 8); ctx.fill();
      ctx.fillStyle = '#f0d060';
      ctx.font = 'bold 22px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('پر شد!', 64, 32);
      const tex = new THREE.CanvasTexture(canvas);
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
      const spr = new THREE.Sprite(mat);
      spr.scale.set(1.4, 0.5, 1);
      spr.position.set(b.x, 2.2, b.z);
      scene.add(spr);
      fullLabels.set(`${b.x},${b.z}`, spr);
    }
  });
}

function updateSelectionVisual() {
  buildingMeshes.forEach((mesh, key) => {
    const ring = mesh.getObjectByName('selRing');
    if (ring) ring.visible = key === selectedKey;
  });
  const info = $('selected-info');
  if (!info) return;
  if (selectedKey) {
    const b = buildings.find(o => `${o.x},${o.z}` === selectedKey);
    if (b) {
      info.classList.remove('hide');
      $('sel-name').textContent = defs[b.type].name + (b.type === 'townhall' ? ` (سطح ${b.thLevel || 1})` : '');
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
    // اسب
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
    const lance = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 4), new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.5 }));
    lance.position.set(0.15, 0.7, 0.1); lance.rotation.z = -0.4; g.add(lance);
    return g;
  }

  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.28, 0.12), new THREE.MeshStandardMaterial({ color: 0x2a2a2a }));
  legs.position.y = 0.2; g.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.32, 0.16), new THREE.MeshStandardMaterial({ color: cloth }));
  torso.position.y = 0.52; torso.castShadow = true; g.add(torso);
  if (type === 'swordsman') {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.18, 0.18), new THREE.MeshStandardMaterial({ color: 0x6a7a8a, metalness: 0.4 }));
    plate.position.y = 0.55; g.add(plate);
  }
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 7, 6), new THREE.MeshStandardMaterial({ color: skin }));
  head.position.y = 0.8; g.add(head);
  if (type === 'swordsman') {
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.5 }));
    helm.position.y = 0.86; g.add(helm);
    const sword = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.45, 0.04), new THREE.MeshStandardMaterial({ color: 0xc0c8d0, metalness: 0.7 }));
    sword.position.set(0.2, 0.55, 0); g.add(sword);
  }
  if (type === 'archer') {
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), new THREE.MeshStandardMaterial({ color: 0x3a2a1a }));
    hair.position.y = 0.88; hair.scale.set(1, 0.55, 1); g.add(hair);
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.02, 4, 10, Math.PI), new THREE.MeshStandardMaterial({ color: 0x8a5a2a }));
    bow.position.set(0.18, 0.55, 0); bow.rotation.y = Math.PI / 2; g.add(bow);
  }
  if (type === 'thief') {
    const hood = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.2, 6), new THREE.MeshStandardMaterial({ color: 0x2a3a2a }));
    hood.position.y = 0.95; g.add(hood);
    const bag = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), new THREE.MeshStandardMaterial({ color: 0x5a4a2a }));
    bag.position.set(-0.16, 0.42, 0); g.add(bag);
  }
  return g;
}

function refreshTroopVisuals() {
  troopMeshes.forEach(m => { scene.remove(m); disposeObj(m); });
  troopMeshes.length = 0;
  let idx = 0;
  const place = (type, count) => {
    const n = Math.min(count, 20);
    for (let i = 0; i < n; i++) {
      const m = createTroopMesh(type);
      const col = idx % 5, row = Math.floor(idx / 5);
      m.position.set(-1.0 + col * 0.5, 0, -5.0 + row * 0.42);
      m.userData.baseX = m.position.x;
      m.userData.baseZ = m.position.z;
      m.userData.phase = Math.random() * Math.PI * 2;
      m.userData.speed = 0.3 + Math.random() * 0.4;
      m.scale.setScalar(type === 'cavalry' ? 0.75 : 0.85);
      scene.add(m); troopMeshes.push(m); idx++;
    }
  };
  place('swordsman', troops.swordsman);
  place('archer', troops.archer);
  place('thief', troops.thief);
  place('cavalry', troops.cavalry);
}

function totalPower() {
  return troops.swordsman * troopPower.swordsman + troops.archer * troopPower.archer +
    troops.thief * troopPower.thief + troops.cavalry * troopPower.cavalry;
}

function countType(t) { return buildings.filter(b => b.type === t).length; }
function getThLevel() { const th = buildings.find(b => b.type === 'townhall'); return th ? (th.thLevel || 1) : 1; }

function clampResources() {
  const c = capacity();
  diamonds = Math.min(diamonds, c.diamonds);
  stone = Math.min(stone, c.stone);
  oil = Math.min(oil, c.oil);
  tokens = Math.min(tokens, c.tokens);
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

function message(t) { if ($('msg')) $('msg').textContent = t; }

function save() {
  localStorage.setItem(SAVE_KEY, JSON.stringify({ diamonds, stone, tokens, oil, level, rot, zoom, buildings, troops, enemyHP, clan }));
  message('پیشرفت ذخیره شد');
}

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY) || localStorage.getItem('kingTown_v400');
    if (!raw) return;
    const s = JSON.parse(raw);
    if (typeof s.diamonds === 'number') diamonds = Math.min(s.diamonds, 500);
    if (typeof s.stone === 'number') stone = s.stone;
    if (typeof s.tokens === 'number') tokens = s.tokens;
    if (typeof s.oil === 'number') oil = s.oil;
    if (typeof s.level === 'number') level = s.level;
    if (typeof s.rot === 'number') rot = s.rot;
    if (typeof s.zoom === 'number') zoom = s.zoom;
    if (Array.isArray(s.buildings)) buildings = s.buildings.map(b => ({ rotY: 0, ...b }));
    if (s.troops) {
      troops.swordsman = s.troops.swordsman | 0;
      troops.archer = s.troops.archer | 0;
      troops.thief = s.troops.thief | 0;
      troops.cavalry = s.troops.cavalry | 0;
    }
    if (s.clan) clan = s.clan;
    if (typeof s.enemyHP === 'number') enemyHP = s.enemyHP;
  } catch (e) {}
}
load();

// انتخاب ساخت بدون تأیید
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
    message(`انتخاب: ${defs[t].name}`);
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
  message('روی دیوار کلیک کنید (هر کلیک ۴۵ درجه)');
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
  if (gz <= -3 && Math.abs(gx) < 3 && mode === 'build' && chosen) { message('این منطقه کمپ نیروهاست'); return; }

  const key = `${gx},${gz}`;
  const occupied = buildings.find(o => o.x === gx && o.z === gz);

  if (mode === 'rotate') {
    if (occupied?.type === 'wall') {
      occupied.rotY = ((occupied.rotY || 0) + 45) % 360;
      rebuildBuildings(); selectedKey = key; updateSelectionVisual();
      message(`زاویه دیوار: ${occupied.rotY}°`);
    } else message('فقط دیوار قابل چرخش است');
    return;
  }
  if (mode === 'move') {
    if (!moveTarget) {
      if (!occupied) { message('ابتدا یک سازه انتخاب کنید'); return; }
      moveTarget = occupied; selectedKey = key; updateSelectionVisual();
      message(`${defs[occupied.type].name} — جای جدید را لمس کنید`);
    } else {
      if (occupied) { message('این خانه اشغال است'); return; }
      if (gz <= -3 && Math.abs(gx) < 3) { message('منطقه کمپ'); return; }
      moveTarget.x = gx; moveTarget.z = gz; moveTarget = null;
      selectedKey = `${gx},${gz}`; rebuildBuildings(); message('جابه‌جا شد');
    }
    return;
  }
  if (occupied && !chosen) {
    selectedKey = key; updateSelectionVisual(); message(defs[occupied.type].name); return;
  }
  if (mode === 'build' && chosen) {
    if (occupied) { message('این خانه اشغال است'); return; }
    const d = defs[chosen];
    if (chosen === 'townhall' && countType('townhall') >= 1) { message('فقط یک مرکز'); return; }
    if ((chosen === 'diamondmine' || chosen === 'stonepit') && countType(chosen) >= MAX_MINE) { message(`حداکثر ${MAX_MINE}`); return; }
    if (diamonds < d.costD) { message('الماس کافی نیست'); return; }
    if (tokens < d.costT) { message('سکه کافی نیست'); return; }
    if (stone < d.costS) { message('سنگ کافی نیست'); return; }
    diamonds -= d.costD; tokens -= d.costT; stone -= d.costS;
    const nb = { type: chosen, x: gx, z: gz, rotY: 0 };
    if (chosen === 'townhall') nb.thLevel = 1;
    buildings.push(nb); rebuildBuildings(); updateUI(); message(d.name + ' ساخته شد');
  }
});

// ارتقا TH با تایمر
$('btn-upgrade')?.addEventListener('click', async () => {
  const th = buildings.find(b => b.type === 'townhall');
  if (!th || (th.thLevel || 1) >= TH_MAX || thUpgrade) return;
  const next = (th.thLevel || 1) + 1;
  if (!canUpgradeTH(next)) { message('برای این سطح به ساختمان‌های بیشتری نیاز دارید'); return; }
  const cost = next * 200;
  const secs = thUpgradeSeconds(next);
  const ok = await confirmAction('ارتقا مرکز', `سطح ${next} — ${cost} الماس — ${Math.floor(secs / 60)} دقیقه؟`);
  if (!ok) return;
  if (diamonds < cost) { message('الماس کافی نیست'); return; }
  diamonds -= cost;
  thUpgrade = { endsAt: performance.now() + secs * 1000, duration: secs * 1000, nextLv: next };
  $('th-upgrade-overlay')?.classList.remove('hide');
  updateUI();
  message(`ارتقا به سطح ${next} آغاز شد`);
});

$('btn-rotate-sel')?.addEventListener('click', () => {
  const b = buildings.find(o => `${o.x},${o.z}` === selectedKey);
  if (b?.type === 'wall') { b.rotY = ((b.rotY || 0) + 45) % 360; rebuildBuildings(); message(`${b.rotY}°`); }
});
$('btn-deselect')?.addEventListener('click', () => { selectedKey = null; moveTarget = null; updateSelectionVisual(); });

// آموزش چندنیرو همزمان
function startTraining(type) {
  if (countType('barracks') < 1) { message('ابتدا پادگان بسازید'); return; }
  const cost = troopCost[type];
  if (oil < cost) { message('نفت کافی نیست'); return; }
  oil -= cost;
  const dur = troopTime[type] * 1000;
  trainQueue.push({ type, endsAt: performance.now() + dur, duration: dur, id: Math.random().toString(36).slice(2) });
  renderTrainOverlay();
  updateUI();
  message(`آموزش ${troopNames[type]} شروع شد`);
}

function renderTrainOverlay() {
  const list = $('train-list');
  const ov = $('train-overlay');
  if (!list || !ov) return;
  if (!trainQueue.length) { ov.classList.add('hide'); return; }
  ov.classList.remove('hide');
  list.innerHTML = trainQueue.map(t => {
    const left = Math.max(0, t.endsAt - performance.now());
    const pct = (1 - left / t.duration) * 100;
    return `<div class="train-card" data-id="${t.id}"><span>${troopIcons[t.type]}</span><div class="train-bar"><i style="width:${pct}%"></i></div><b>${Math.ceil(left / 1000)}s</b></div>`;
  }).join('');
}

function updateTraining() {
  const now = performance.now();
  let changed = false;
  for (let i = trainQueue.length - 1; i >= 0; i--) {
    if (trainQueue[i].endsAt <= now) {
      troops[trainQueue[i].type]++;
      message(`${troopNames[trainQueue[i].type]} آماده شد!`);
      trainQueue.splice(i, 1);
      changed = true;
    }
  }
  if (trainQueue.length || changed) renderTrainOverlay();
  if (changed) { refreshTroopVisuals(); updateUI(); }

  // درخشش پادگان
  const training = trainQueue.length > 0;
  buildingMeshes.forEach(mesh => {
    const glow = mesh.getObjectByName('trainGlow');
    if (glow) {
      glow.material.opacity = training ? 0.35 + Math.sin(now * 0.008) * 0.3 : 0;
      if (training) glow.scale.setScalar(1 + Math.sin(now * 0.01) * 0.25);
    }
  });
}

function updateThUpgrade() {
  if (!thUpgrade) return;
  const left = thUpgrade.endsAt - performance.now();
  const pct = Math.max(0, 1 - left / thUpgrade.duration);
  if ($('th-progress')) $('th-progress').style.width = pct * 100 + '%';
  if ($('th-timer')) $('th-timer').textContent = Math.ceil(Math.max(0, left) / 1000) + 's';
  if (left <= 0) {
    const th = buildings.find(b => b.type === 'townhall');
    if (th) th.thLevel = thUpgrade.nextLv;
    level = Math.max(level, thUpgrade.nextLv);
    message(`مرکز فرماندهی به سطح ${thUpgrade.nextLv} رسید!`);
    thUpgrade = null;
    $('th-upgrade-overlay')?.classList.add('hide');
    rebuildBuildings();
    updateUI();
  }
}

document.querySelectorAll('[data-troop]').forEach(btn => {
  btn.addEventListener('click', () => startTraining(btn.dataset.troop));
});

function updateOilPreview() {
  const n = Math.max(0, parseInt($('stone-amount')?.value || '0', 10));
  if ($('oil-preview')) $('oil-preview').textContent = `= ${Math.floor(n / 30) * 5} نفت`;
}
$('stone-amount')?.addEventListener('input', updateOilPreview);
updateOilPreview();

$('convert-oil')?.addEventListener('click', async () => {
  const n = Math.max(0, parseInt($('stone-amount')?.value || '0', 10));
  if (n < 30) { message('حداقل ۳۰ سنگ لازم است'); return; }
  const oilOut = Math.floor(n / 30) * 5;
  const use = Math.floor(n / 30) * 30;
  const ok = await confirmAction('تبدیل', `${use} سنگ ← ${oilOut} نفت؟`);
  if (!ok) return;
  if (stone < use) { message('سنگ کافی نیست'); return; }
  stone -= use; oil += oilOut; clampResources(); updateUI(); message(`+${oilOut} نفت`);
});

// خرید سکه در منو
document.querySelectorAll('[data-pack]').forEach(btn => {
  btn.addEventListener('click', async () => {
    const pack = parseInt(btn.dataset.pack, 10);
    if (tokens + pack > TOKEN_MAX) { message(`سقف سکه ${TOKEN_MAX} است`); return; }
    const ok = await confirmAction('خرید سکه', `${pack} سکه به قیمت تقریبی $${pack / 5}؟`);
    if (!ok) return;
    tokens += pack; clampResources(); updateUI(); message(`+${pack} سکه`);
  });
});

// کلن
$('btn-join-clan')?.addEventListener('click', () => {
  clan = { name: 'کلن طلایی', power: 0 };
  updateUI();
  message('به کلن طلایی پیوستید!');
});

// جنگ کلن
$('btn-war')?.addEventListener('click', () => {
  if (!clan) { message('ابتدا از منو به کلن بپیوندید'); return; }
  const p = totalPower();
  if ($('war-my-power')) $('war-my-power').textContent = `قدرت: ${p}`;
  const enemyP = 80 + level * 25 + Math.floor(Math.random() * 40);
  if ($('war-enemy-power')) $('war-enemy-power').textContent = `قدرت: ${enemyP}`;
  if ($('war-enemy-name')) $('war-enemy-name').textContent = ['کلن سایه', 'کلن طوفان', 'کلن آهن'][Math.floor(Math.random() * 3)];
  const list = $('war-troop-list');
  if (list) {
    list.innerHTML = Object.keys(troops).filter(t => troops[t] > 0)
      .map(t => `<div>${troopIcons[t]} ${troopNames[t]} ×${troops[t]} (قدرت ${troopPower[t]})</div>`).join('') || '<div>نیرویی ندارید</div>';
  }
  if ($('war-result')) $('war-result').textContent = '';
  $('war-page')?.classList.remove('hide');
  $('war-fight').onclick = () => {
    const myP = totalPower();
    if (myP <= 0) { if ($('war-result')) $('war-result').textContent = 'نیرویی برای جنگ ندارید!'; return; }
    // از دست دادن بخشی از نیرو
    const loss = Math.min(2, troops.swordsman + troops.archer + troops.thief + troops.cavalry);
    for (let i = 0; i < loss; i++) {
      if (troops.swordsman) troops.swordsman--;
      else if (troops.archer) troops.archer--;
      else if (troops.thief) troops.thief--;
      else if (troops.cavalry) troops.cavalry--;
    }
    if (myP >= enemyP) {
      const loot = 80 + Math.floor(Math.random() * 120);
      diamonds += loot; stone += 50; oil += 5; level++;
      if ($('war-result')) $('war-result').textContent = `پیروزی کلن! +${loot} الماس`;
      message('پیروزی در جنگ کلن!');
    } else {
      if ($('war-result')) $('war-result').textContent = 'شکست خوردید — نیروها آسیب دیدند';
      message('شکست در جنگ کلن');
    }
    clampResources(); refreshTroopVisuals(); updateUI();
  };
});
$('war-close')?.addEventListener('click', () => $('war-page')?.classList.add('hide'));

$('attack')?.addEventListener('click', () => {
  const p = totalPower();
  if ($('battleText')) $('battleText').textContent = `قدرت شما: ${p} | دشمن: ${enemyHP}`;
  $('modal')?.classList.remove('hide');
});
$('retreat')?.addEventListener('click', () => $('modal')?.classList.add('hide'));
$('launch')?.addEventListener('click', () => {
  const p = totalPower();
  if (p <= 0) { if ($('battleText')) $('battleText').textContent = 'نیرویی ندارید!'; return; }
  enemyHP = Math.max(0, enemyHP - p);
  if (troops.swordsman) troops.swordsman--;
  else if (troops.archer) troops.archer--;
  else if (troops.thief) troops.thief--;
  else if (troops.cavalry) troops.cavalry--;
  if (enemyHP <= 0) {
    const loot = 100 + Math.floor(Math.random() * 150);
    diamonds += loot; stone += 60; oil += 3; level++;
    enemyHP = 160 + level * 25;
    if ($('battleText')) $('battleText').textContent = `پیروزی! +${loot} الماس`;
  } else if ($('battleText')) $('battleText').textContent = `دشمن: ${enemyHP} | قدرت: ${totalPower()}`;
  clampResources(); refreshTroopVisuals(); updateUI();
});

$('save')?.addEventListener('click', save);
$('menu')?.addEventListener('click', () => $('drawer')?.classList.remove('hide'));
$('close')?.addEventListener('click', () => $('drawer')?.classList.add('hide'));
$('reset')?.addEventListener('click', async () => {
  if (await confirmAction('شروع دوباره', 'همه پیشرفت پاک شود؟')) {
    localStorage.removeItem(SAVE_KEY); location.reload();
  }
});

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

// تولید: سنگ هر ۱.۲ث — الماس هر ۶۰ث یک عدد
setInterval(() => {
  const lv = getThLevel();
  stone += countType('stonepit') * (2 + (lv - 1) * 0.3);
  clampResources(); updateUI();
}, 1200);
setInterval(() => {
  diamonds += countType('diamondmine') * 1;
  clampResources(); updateUI();
}, 60000);

// تیراندازی برج‌ها
setInterval(() => {
  buildings.filter(b => b.type === 'cannon').forEach(b => {
    const arrow = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.01, 0.4, 4),
      new THREE.MeshBasicMaterial({ color: 0xc0c0a0 })
    );
    arrow.position.set(b.x, 1.9, b.z);
    arrow.rotation.z = Math.PI / 2;
    const dir = new THREE.Vector3((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2).normalize();
    arrow.userData = { vel: dir.multiplyScalar(0.15), life: 40 };
    scene.add(arrow); arrows.push(arrow);
  });
}, 2800);

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
  const now = performance.now();

  buildingMeshes.forEach(mesh => {
    mesh.traverse(c => { if (c.userData?.spin) c.rotation.y = t * 1.6; });
  });

  // حرکت رندوم سربازان در کمپ
  troopMeshes.forEach(m => {
    const ph = m.userData.phase + t * m.userData.speed;
    m.position.x = m.userData.baseX + Math.sin(ph) * 0.15;
    m.position.z = m.userData.baseZ + Math.cos(ph * 0.7) * 0.12;
    m.position.y = Math.sin(t * 2 + m.userData.phase) * 0.02;
    m.rotation.y = Math.sin(ph) * 0.3;
  });

  // آتش
  const f1 = campGroup.getObjectByName('fire');
  const f2 = campGroup.getObjectByName('fire2');
  if (f1) { f1.scale.y = 0.9 + Math.sin(t * 8) * 0.2; f1.rotation.y = t * 2; }
  if (f2) { f2.scale.y = 1 + Math.sin(t * 6 + 1) * 0.25; f2.rotation.y = -t * 1.5; }

  // تیرها
  for (let i = arrows.length - 1; i >= 0; i--) {
    const a = arrows[i];
    a.position.add(a.userData.vel);
    a.userData.life--;
    if (a.userData.life <= 0) { scene.remove(a); disposeObj(a); arrows.splice(i, 1); }
  }

  updateTraining();
  updateThUpgrade();
  renderer.render(scene, camera);
}

rebuildBuildings();
refreshTroopVisuals();
updateUI();
animate();

window.KingTownEngine = {
  version: '4.0.5',
  getBuildings: () => buildings,
  getTroops: () => ({ ...troops }),
  totalPower,
  capacity,
  scene, camera, renderer
};
console.info('[KingTown] v4.0.5 ready');
