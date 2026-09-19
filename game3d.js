/**
 * KingTown v3.5.5
 * موتور Three.js بهینه‌شده | منطق ارتقا / نیرو / منابع بررسی‌شده
 * رفع باگ تعامل و نشت حافظه | تولید منابع مقیاس‌پذیر
 */
import * as THREE from 'three';

const $ = id => document.getElementById(id);
const container = document.getElementById('scene-container');
const SAVE_KEY = 'kingTown_v355';

// ——— State ———
let diamonds = 750, stone = 420, tokens = 15, oil = 0, level = 1;
let rot = 0, zoom = 1.05;
let mode = 'build';
let chosen = null;
let selectedKey = null;
let moveTarget = null;
let enemyHP = 160;

const troops = { swordsman: 0, archer: 0, thief: 0 };
const MAX_MINE = 5;
const TH_MAX_LEVEL = 5;

const defs = {
  townhall:    { name: 'مرکز فرماندهی', costD: 0,   costT: 0, costS: 0,  max: 1 },
  diamondmine: { name: 'معدن الماس',    costD: 0,   costT: 5, costS: 0,  max: MAX_MINE },
  stonepit:    { name: 'معدن سنگ',      costD: 150, costT: 0, costS: 0,  max: MAX_MINE },
  barracks:    { name: 'پادگان',        costD: 180, costT: 0, costS: 0,  max: 99 },
  cannon:      { name: 'برج دفاعی',     costD: 150, costT: 0, costS: 0,  max: 99 },
  wall:        { name: 'دیوار سنگی',    costD: 0,   costT: 0, costS: 40, max: 99 }
};

const troopCost = { swordsman: 8, archer: 10, thief: 12 };
const troopNames = { swordsman: 'شمشیردار', archer: 'کماندار زن', thief: 'دزد سنگ' };

let buildings = [
  { type: 'townhall', x: 0, z: 0, thLevel: 1 },
  { type: 'diamondmine', x: -2, z: -1 },
  { type: 'stonepit', x: 2, z: -1 },
  { type: 'barracks', x: -2, z: 2 },
  { type: 'cannon', x: 2, z: 2 },
  { type: 'wall', x: -1, z: 3 },
  { type: 'wall', x: 0, z: 3 },
  { type: 'wall', x: 1, z: 3 }
];

// ——— Shared materials & geometries (بهینه‌سازی حافظه) ———
const mats = {
  grassA: new THREE.MeshStandardMaterial({ color: 0x6aaa48, roughness: 0.88 }),
  grassB: new THREE.MeshStandardMaterial({ color: 0x5c9a3e, roughness: 0.88 }),
  wood:   new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.8 }),
  leaf:   new THREE.MeshStandardMaterial({ color: 0x2d6a32, roughness: 0.75 }),
  stone:  new THREE.MeshStandardMaterial({ color: 0x8a9a8e, roughness: 0.75 }),
  base:   new THREE.MeshStandardMaterial({ color: 0x5a4a32, roughness: 0.8 }),
  flag:   new THREE.MeshStandardMaterial({ color: 0xc43c2e, side: THREE.DoubleSide }),
  sel:    new THREE.MeshBasicMaterial({ color: 0x48d7db, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
};
const geos = {
  tile: new THREE.BoxGeometry(1, 0.1, 1),
  trunk: new THREE.CylinderGeometry(0.1, 0.15, 0.8, 5),
  wallBody: new THREE.BoxGeometry(0.95, 0.85, 0.32),
  merlon: new THREE.BoxGeometry(0.2, 0.22, 0.35),
  base: new THREE.BoxGeometry(1.15, 0.2, 1.15),
  ring: new THREE.RingGeometry(0.75, 0.88, 32)
};

function disposeObject(obj) {
  obj.traverse(c => {
    if (c.geometry && !Object.values(geos).includes(c.geometry)) c.geometry.dispose?.();
    if (c.material && !Object.values(mats).includes(c.material)) {
      if (Array.isArray(c.material)) c.material.forEach(m => m.dispose?.());
      else c.material.dispose?.();
    }
  });
}

// ——— Confirm ———
function confirmAction(title, text) {
  return new Promise(resolve => {
    const modal = $('confirm');
    if (!modal) { resolve(true); return; }
    $('confirm-title').textContent = title;
    $('confirm-text').textContent = text;
    modal.classList.remove('hide');
    const yes = () => { cleanup(); resolve(true); };
    const no = () => { cleanup(); resolve(false); };
    function cleanup() {
      modal.classList.add('hide');
      $('confirm-yes')?.removeEventListener('click', yes);
      $('confirm-no')?.removeEventListener('click', no);
    }
    $('confirm-yes')?.addEventListener('click', yes);
    $('confirm-no')?.addEventListener('click', no);
  });
}

// ——— Three.js core ———
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x7eb8e8);
scene.fog = new THREE.Fog(0x7eb8e8, 42, 85);

const frustum = 13;
let aspect = container.clientWidth / Math.max(container.clientHeight, 1);
const camera = new THREE.OrthographicCamera(-frustum * aspect, frustum * aspect, frustum, -frustum, 0.1, 200);
camera.position.set(20, 18, 20);
camera.lookAt(0, 0.4, 0);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance',
  alpha: false
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.insertBefore(renderer.domElement, container.firstChild);
Object.assign(renderer.domElement.style, {
  position: 'absolute', inset: '0', width: '100%', height: '100%', touchAction: 'none'
});

scene.add(new THREE.HemisphereLight(0xfff5e0, 0x3a5a30, 0.52));
const sun = new THREE.DirectionalLight(0xfff0d0, 1.35);
sun.position.set(-14, 24, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(1536, 1536);
sun.shadow.camera.near = 2;
sun.shadow.camera.far = 70;
sun.shadow.camera.left = sun.shadow.camera.bottom = -26;
sun.shadow.camera.right = sun.shadow.camera.top = 26;
sun.shadow.bias = -0.0003;
scene.add(sun);
const fill = new THREE.DirectionalLight(0xa0c8ff, 0.28);
fill.position.set(12, 6, -14);
scene.add(fill);

// Ground
for (let x = -12; x <= 12; x++) {
  for (let z = -12; z <= 12; z++) {
    const m = new THREE.Mesh(geos.tile, (x + z) % 2 === 0 ? mats.grassA : mats.grassB);
    m.position.set(x, -0.05, z);
    m.receiveShadow = true;
    scene.add(m);
  }
}

function addTree(x, z) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(geos.trunk, mats.wood);
  trunk.position.y = 0.4;
  trunk.castShadow = true;
  g.add(trunk);
  [0.65, 0.5, 0.35].forEach((s, i) => {
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), mats.leaf);
    leaf.position.y = 1.0 + i * 0.4;
    leaf.castShadow = true;
    g.add(leaf);
  });
  g.position.set(x, 0, z);
  scene.add(g);
}
for (let i = -10; i <= 10; i += 2) {
  addTree(i, -11); addTree(i, 11); addTree(-11, i); addTree(11, i);
}

// ——— Buildings ———
const buildingMeshes = new Map();
const troopMeshes = [];

function thColors(lv) {
  const pal = [
    [0xc48b4a, 0xe3bd62],
    [0xb87a3a, 0xd4a84b],
    [0xa86a2a, 0xc4983a],
    [0x8a5a22, 0xb08030],
    [0x6a4018, 0x906020]
  ];
  return pal[Math.min(Math.max(lv, 1), 5) - 1];
}

function createBuildingMesh(b) {
  const g = new THREE.Group();
  g.userData = { key: `${b.x},${b.z}`, type: b.type };

  const addRing = () => {
    const ring = new THREE.Mesh(geos.ring, mats.sel);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    ring.visible = false;
    ring.name = 'selRing';
    g.add(ring);
  };

  if (b.type === 'wall') {
    const body = new THREE.Mesh(geos.wallBody, mats.stone);
    body.position.y = 0.42;
    body.castShadow = true;
    g.add(body);
    for (let i = -0.3; i <= 0.3; i += 0.3) {
      const m = new THREE.Mesh(geos.merlon, mats.stone);
      m.position.set(i, 0.98, 0);
      m.castShadow = true;
      g.add(m);
    }
    addRing();
    return g;
  }

  const isTH = b.type === 'townhall';
  const lv = isTH ? (b.thLevel || 1) : 1;
  const palette = isTH ? thColors(lv) : {
    diamondmine: [0x48d7db, 0x7ef0f8],
    stonepit: [0x9ba5a2, 0xc0d0c8],
    barracks: [0xb77d4d, 0xd4a06a],
    cannon: [0x7b8e88, 0xa0b0a8]
  }[b.type] || [0x888888, 0xaaaaaa];
  const [col, roofCol] = palette;

  const base = new THREE.Mesh(geos.base, mats.base);
  base.position.y = 0.1;
  base.castShadow = true;
  base.receiveShadow = true;
  g.add(base);

  const bodyH = isTH ? 0.7 + lv * 0.25 : 0.9;
  const bodyMat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.65 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.95, bodyH, 0.95), bodyMat);
  body.position.y = 0.2 + bodyH / 2;
  body.castShadow = true;
  g.add(body);

  const roofMat = new THREE.MeshStandardMaterial({ color: roofCol, roughness: 0.55 });
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(0.82, 0.45 + (isTH ? lv * 0.08 : 0), 4),
    roofMat
  );
  roof.position.y = 0.2 + bodyH + 0.25;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  g.add(roof);

  if (isTH) {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 0.9 + lv * 0.15, 5),
      mats.wood
    );
    pole.position.y = 0.2 + bodyH + 0.7;
    g.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.25), mats.flag);
    flag.position.set(0.22, 0.2 + bodyH + 1.0 + lv * 0.05, 0);
    g.add(flag);
    if (lv >= 3) {
      const win = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.22, 0.04),
        new THREE.MeshStandardMaterial({ color: 0xf0d878, emissive: 0x553300, emissiveIntensity: 0.35 })
      );
      win.position.set(0, 0.55, 0.48);
      g.add(win);
    }
    if (lv >= 5) {
      const gem = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.18),
        new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: 0xaa8800, emissiveIntensity: 0.5 })
      );
      gem.position.y = 0.2 + bodyH + 0.7;
      g.add(gem);
    }
  }

  if (b.type === 'diamondmine') {
    const cry = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.32),
      new THREE.MeshStandardMaterial({
        color: 0x48d7db, emissive: 0x228899, emissiveIntensity: 0.45,
        metalness: 0.5, roughness: 0.2
      })
    );
    cry.position.y = 0.2 + bodyH + 0.5;
    cry.castShadow = true;
    cry.userData.spin = true;
    g.add(cry);
  }
  if (b.type === 'cannon') {
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.13, 0.65, 7),
      new THREE.MeshStandardMaterial({ color: 0x4a5a52, metalness: 0.4 })
    );
    barrel.rotation.z = Math.PI / 2;
    barrel.position.set(0.3, 0.2 + bodyH * 0.6, 0);
    barrel.castShadow = true;
    g.add(barrel);
  }
  if (b.type === 'barracks') {
    const sh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.22, 0.07, 5),
      new THREE.MeshStandardMaterial({ color: 0xc05040 })
    );
    sh.rotation.x = Math.PI / 2;
    sh.position.set(0, 0.2 + bodyH + 0.12, 0.48);
    g.add(sh);
  }

  addRing();
  return g;
}

function rebuildBuildings() {
  buildingMeshes.forEach(m => {
    scene.remove(m);
    disposeObject(m);
  });
  buildingMeshes.clear();
  buildings.forEach(b => {
    const mesh = createBuildingMesh(b);
    mesh.position.set(b.x, 0, b.z);
    scene.add(mesh);
    buildingMeshes.set(`${b.x},${b.z}`, mesh);
  });
  updateSelectionVisual();
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
      $('sel-name').textContent =
        defs[b.type].name + (b.type === 'townhall' ? ` (سطح ${b.thLevel || 1})` : '');
      const up = $('btn-upgrade');
      if (up) {
        up.style.display =
          b.type === 'townhall' && (b.thLevel || 1) < TH_MAX_LEVEL ? '' : 'none';
      }
    }
  } else {
    info.classList.add('hide');
  }
}

// ——— Troops ———
function createTroopMesh(type) {
  const g = new THREE.Group();
  const skin = type === 'archer' ? 0xf5c6a0 : 0xd4a574;
  const cloth =
    type === 'swordsman' ? 0x3a5a8a : type === 'archer' ? 0x5a3a6a : 0x4a4a3a;
  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.35, 0.14),
    new THREE.MeshStandardMaterial({ color: cloth })
  );
  torso.position.y = 0.55;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 6, 5),
    new THREE.MeshStandardMaterial({ color: skin })
  );
  head.position.y = 0.82;
  g.add(head);
  [-0.06, 0.06].forEach(lx => {
    const leg = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.28, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x333333 })
    );
    leg.position.set(lx, 0.2, 0);
    g.add(leg);
  });
  if (type === 'swordsman') {
    const sword = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.4, 0.04),
      new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.6 })
    );
    sword.position.set(0.18, 0.55, 0);
    g.add(sword);
  }
  if (type === 'archer') {
    const bow = new THREE.Mesh(
      new THREE.TorusGeometry(0.14, 0.02, 4, 8, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0x8a5a2a })
    );
    bow.position.set(0.16, 0.55, 0);
    bow.rotation.y = Math.PI / 2;
    g.add(bow);
  }
  if (type === 'thief') {
    const bag = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 5, 4),
      new THREE.MeshStandardMaterial({ color: 0x6a5a3a })
    );
    bag.position.set(-0.16, 0.45, 0);
    g.add(bag);
  }
  return g;
}

function refreshTroopVisuals() {
  troopMeshes.forEach(m => {
    scene.remove(m);
    disposeObject(m);
  });
  troopMeshes.length = 0;
  let idx = 0;
  const place = (type, count) => {
    const n = Math.min(count, 20);
    for (let i = 0; i < n; i++) {
      const m = createTroopMesh(type);
      const angle = (idx / 12) * Math.PI * 2;
      m.position.set(Math.cos(angle) * 2.2, 0, Math.sin(angle) * 2.2 - 1.5);
      m.scale.setScalar(0.9);
      scene.add(m);
      troopMeshes.push(m);
      idx++;
    }
  };
  place('swordsman', troops.swordsman);
  place('archer', troops.archer);
  place('thief', troops.thief);
}

// ——— Logic helpers ———
function countType(t) {
  return buildings.filter(b => b.type === t).length;
}

function getThLevel() {
  const th = buildings.find(b => b.type === 'townhall');
  return th ? (th.thLevel || 1) : 1;
}

function productionRate() {
  // مقیاس با سطح مرکز فرماندهی
  const bonus = 1 + (getThLevel() - 1) * 0.15;
  return {
    diamonds: Math.floor(countType('diamondmine') * 2 * bonus),
    stone: Math.floor(countType('stonepit') * 2 * bonus)
  };
}

function updateUI() {
  if (!$('diamonds')) return;
  $('diamonds').textContent = Math.floor(diamonds);
  $('stone').textContent = Math.floor(stone);
  $('tokens').textContent = tokens;
  $('oil').textContent = oil;
  $('level').textContent = level;
  $('t-swordsman').textContent = troops.swordsman;
  $('t-archer').textContent = troops.archer;
  $('t-thief').textContent = troops.thief;
  $('troops-total').textContent =
    troops.swordsman + troops.archer + troops.thief;

  const maxD = 3000, maxS = 2000, maxT = 50, maxO = 100;
  if ($('bar-diamonds'))
    $('bar-diamonds').style.width = Math.min(100, (diamonds / maxD) * 100) + '%';
  if ($('bar-stone'))
    $('bar-stone').style.width = Math.min(100, (stone / maxS) * 100) + '%';
  if ($('bar-tokens'))
    $('bar-tokens').style.width = Math.min(100, (tokens / maxT) * 100) + '%';
  if ($('bar-oil'))
    $('bar-oil').style.width = Math.min(100, (oil / maxO) * 100) + '%';

  const thLv = getThLevel();
  if ($('mission-bar'))
    $('mission-bar').style.width = (thLv / TH_MAX_LEVEL) * 100 + '%';
  if ($('mission-text'))
    $('mission-text').textContent =
      thLv >= TH_MAX_LEVEL
        ? 'مرکز فرماندهی در اوج قدرت است!'
        : `مرکز فرماندهی را به سطح ${thLv + 1} برسان`;
}

function message(t) {
  if ($('msg')) $('msg').textContent = t;
}

function save() {
  localStorage.setItem(
    SAVE_KEY,
    JSON.stringify({
      diamonds, stone, tokens, oil, level, rot, zoom, buildings, troops, enemyHP
    })
  );
  message('پیشرفت ذخیره شد ✓');
}

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY) || localStorage.getItem('kingTown_v301');
    if (!raw) return;
    const s = JSON.parse(raw);
    if (typeof s.diamonds === 'number') diamonds = s.diamonds;
    if (typeof s.stone === 'number') stone = s.stone;
    if (typeof s.tokens === 'number') tokens = s.tokens;
    if (typeof s.oil === 'number') oil = s.oil;
    if (typeof s.level === 'number') level = s.level;
    if (typeof s.rot === 'number') rot = s.rot;
    if (typeof s.zoom === 'number') zoom = s.zoom;
    if (Array.isArray(s.buildings) && s.buildings.length) buildings = s.buildings;
    if (s.troops && typeof s.troops === 'object') {
      troops.swordsman = s.troops.swordsman | 0;
      troops.archer = s.troops.archer | 0;
      troops.thief = s.troops.thief | 0;
    }
    if (typeof s.enemyHP === 'number') enemyHP = s.enemyHP;
  } catch (e) {
    console.warn('Load failed', e);
  }
}

load();

// ——— UI events ———
document.querySelectorAll('[data-type]').forEach(btn => {
  btn.addEventListener('click', async () => {
    const t = btn.dataset.type;
    if (chosen === t) {
      chosen = null;
      btn.classList.remove('selected-build');
      message('انتخاب لغو شد');
      return;
    }
    document.querySelectorAll('[data-type]').forEach(b => b.classList.remove('selected-build'));
    if (t === 'townhall' && countType('townhall') >= 1) {
      message('فقط یک مرکز فرماندهی مجاز است — آن را انتخاب و ارتقا بده');
      return;
    }
    if ((t === 'diamondmine' || t === 'stonepit') && countType(t) >= MAX_MINE) {
      message(`حداکثر ${MAX_MINE} عدد از این معدن مجاز است`);
      return;
    }
    const ok = await confirmAction('تأیید ساخت', `آیا می‌خواهید ${defs[t].name} را برای ساخت انتخاب کنید؟`);
    if (!ok) return;
    chosen = t;
    btn.classList.add('selected-build');
    mode = 'build';
    $('mode-build')?.classList.add('active');
    $('mode-move')?.classList.remove('active');
    message(`حالت ساخت: ${defs[t].name} — روی زمین خالی کلیک کن`);
  });
});

$('mode-build')?.addEventListener('click', () => {
  mode = 'build';
  moveTarget = null;
  selectedKey = null;
  $('mode-build').classList.add('active');
  $('mode-move')?.classList.remove('active');
  if ($('mode-label')) $('mode-label').textContent = 'حالت ساخت';
  updateSelectionVisual();
  message('حالت ساخت فعال');
});

$('mode-move')?.addEventListener('click', async () => {
  const ok = await confirmAction('جابجایی سازه', 'سازه‌ای را انتخاب کن و بعد جای جدید را کلیک کن.');
  if (!ok) return;
  mode = 'move';
  chosen = null;
  document.querySelectorAll('[data-type]').forEach(b => b.classList.remove('selected-build'));
  $('mode-move').classList.add('active');
  $('mode-build')?.classList.remove('active');
  if ($('mode-label')) $('mode-label').textContent = 'حالت جابجایی';
  message('یک سازه را انتخاب کن، سپس جای خالی جدید را کلیک کن');
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
  const gx = Math.round(hit.x);
  const gz = Math.round(hit.z);
  if (Math.abs(gx) > 11 || Math.abs(gz) > 11) return;

  const key = `${gx},${gz}`;
  const occupied = buildings.find(o => o.x === gx && o.z === gz);

  if (mode === 'move') {
    if (!moveTarget) {
      if (!occupied) {
        message('ابتدا یک سازه انتخاب کن');
        return;
      }
      moveTarget = occupied;
      selectedKey = key;
      updateSelectionVisual();
      message(`${defs[occupied.type].name} انتخاب شد — جای جدید را کلیک کن`);
    } else {
      if (occupied) {
        message('این خانه اشغال است');
        return;
      }
      moveTarget.x = gx;
      moveTarget.z = gz;
      moveTarget = null;
      selectedKey = `${gx},${gz}`;
      rebuildBuildings();
      message('سازه جابه‌جا شد');
    }
    return;
  }

  if (occupied && !chosen) {
    selectedKey = key;
    updateSelectionVisual();
    message(defs[occupied.type].name + ' انتخاب شد');
    return;
  }

  if (mode === 'build' && chosen) {
    if (occupied) {
      message('این خانه اشغال است');
      return;
    }
    const d = defs[chosen];
    if (chosen === 'townhall' && countType('townhall') >= 1) {
      message('فقط یک مرکز فرماندهی');
      return;
    }
    if ((chosen === 'diamondmine' || chosen === 'stonepit') && countType(chosen) >= MAX_MINE) {
      message(`حداکثر ${MAX_MINE} معدن`);
      return;
    }
    if (diamonds < d.costD) {
      message('الماس کافی نیست');
      return;
    }
    if (tokens < d.costT) {
      message('توکن کافی نیست');
      return;
    }
    if (stone < d.costS) {
      message('سنگ کافی نیست');
      return;
    }

    diamonds -= d.costD;
    tokens -= d.costT;
    stone -= d.costS;
    const nb = { type: chosen, x: gx, z: gz };
    if (chosen === 'townhall') nb.thLevel = 1;
    buildings.push(nb);
    rebuildBuildings();
    updateUI();
    message(d.name + ' ساخته شد');
  }
});

$('btn-upgrade')?.addEventListener('click', async () => {
  const th = buildings.find(b => b.type === 'townhall');
  if (!th || (th.thLevel || 1) >= TH_MAX_LEVEL) return;
  const next = (th.thLevel || 1) + 1;
  const cost = next * 200;
  const ok = await confirmAction(
    'ارتقا مرکز فرماندهی',
    `ارتقا به سطح ${next} به ${cost} الماس نیاز دارد. ادامه می‌دهی؟`
  );
  if (!ok) return;
  if (diamonds < cost) {
    message('الماس کافی نیست');
    return;
  }
  diamonds -= cost;
  th.thLevel = next;
  level = Math.max(level, next);
  rebuildBuildings();
  updateUI();
  message(`مرکز فرماندهی به سطح ${next} رسید!`);
});

$('btn-deselect')?.addEventListener('click', () => {
  selectedKey = null;
  moveTarget = null;
  updateSelectionVisual();
  message('انتخاب لغو شد');
});

document.querySelectorAll('[data-troop]').forEach(btn => {
  btn.addEventListener('click', async () => {
    const t = btn.dataset.troop;
    const c = troopCost[t];
    if (countType('barracks') < 1) {
      message('ابتدا یک پادگان بساز');
      return;
    }
    const ok = await confirmAction(
      'آموزش نیرو',
      `آموزش ${troopNames[t]} به ${c} نفت قرمز نیاز دارد. ادامه؟`
    );
    if (!ok) return;
    if (oil < c) {
      message('نفت قرمز کافی نیست — اول سنگ را تبدیل کن');
      return;
    }
    oil -= c;
    troops[t]++;
    refreshTroopVisuals();
    updateUI();
    message(`${troopNames[t]} آموزش دید`);
  });
});

$('convert-oil')?.addEventListener('click', async () => {
  const ok = await confirmAction('تبدیل به نفت قرمز', '۳۰ سنگ = ۵ نفت قرمز. انجام شود؟');
  if (!ok) return;
  if (stone < 30) {
    message('حداقل ۳۰ سنگ لازم است');
    return;
  }
  stone -= 30;
  oil += 5;
  updateUI();
  message('+۵ نفت قرمز');
});

$('attack')?.addEventListener('click', () => {
  const total = troops.swordsman + troops.archer + troops.thief;
  if ($('battleText'))
    $('battleText').textContent = `نیروها: ${total} | سلامت دشمن: ${enemyHP}`;
  $('modal')?.classList.remove('hide');
});

$('retreat')?.addEventListener('click', () => $('modal')?.classList.add('hide'));

$('launch')?.addEventListener('click', () => {
  const total = troops.swordsman + troops.archer + troops.thief;
  if (!total) {
    if ($('battleText')) $('battleText').textContent = 'نیرویی نداری!';
    return;
  }
  const dmg =
    troops.swordsman * 18 + troops.archer * 22 + troops.thief * 15;
  enemyHP = Math.max(0, enemyHP - dmg);
  if (troops.swordsman) troops.swordsman--;
  else if (troops.archer) troops.archer--;
  else if (troops.thief) troops.thief--;

  if (enemyHP <= 0) {
    const loot = 120 + Math.floor(Math.random() * 200);
    diamonds += loot;
    stone += 80;
    oil += 3;
    level++;
    enemyHP = 160 + level * 20;
    if ($('battleText'))
      $('battleText').textContent = `پیروزی! ${loot} الماس، ۸۰ سنگ، ۳ نفت. سطح ${level}`;
  } else {
    if ($('battleText'))
      $('battleText').textContent = `سلامت دشمن: ${enemyHP} | نیروهای باقی: ${
        troops.swordsman + troops.archer + troops.thief
      }`;
  }
  refreshTroopVisuals();
  updateUI();
});

$('save')?.addEventListener('click', save);
$('menu')?.addEventListener('click', () => $('drawer')?.classList.remove('hide'));
$('close')?.addEventListener('click', () => $('drawer')?.classList.add('hide'));
$('reset')?.addEventListener('click', async () => {
  const ok = await confirmAction('شروع دوباره', 'همه پیشرفت پاک می‌شود. مطمئنی؟');
  if (ok) {
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem('kingTown_v301');
    location.reload();
  }
});

function applyView() {
  const angle = rot * (Math.PI / 2) + Math.PI / 4;
  const dist = 20 / zoom;
  camera.position.set(Math.sin(angle) * dist, dist * 0.9, Math.cos(angle) * dist);
  camera.lookAt(0, 0.5, 0);
  camera.zoom = zoom;
  camera.updateProjectionMatrix();
}
$('left')?.addEventListener('click', () => {
  rot = (rot + 3) % 4;
  applyView();
});
$('right')?.addEventListener('click', () => {
  rot = (rot + 1) % 4;
  applyView();
});
$('plus')?.addEventListener('click', () => {
  zoom = Math.min(2.4, zoom + 0.15);
  applyView();
});
$('minus')?.addEventListener('click', () => {
  zoom = Math.max(0.55, zoom - 0.15);
  applyView();
});
applyView();

// تولید منابع (مقیاس با سطح TH)
setInterval(() => {
  const p = productionRate();
  diamonds += p.diamonds;
  stone += p.stone;
  updateUI();
}, 1200);

function onResize() {
  const w = container.clientWidth;
  const h = container.clientHeight;
  aspect = w / Math.max(h, 1);
  camera.left = -frustum * aspect;
  camera.right = frustum * aspect;
  camera.top = frustum;
  camera.bottom = -frustum;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
window.addEventListener('resize', onResize);

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();
  buildingMeshes.forEach(mesh => {
    mesh.traverse(c => {
      if (c.userData?.spin) c.rotation.y = t * 1.5;
    });
  });
  troopMeshes.forEach((m, i) => {
    m.position.y = Math.sin(t * 2 + i) * 0.03;
  });
  renderer.render(scene, camera);
}

rebuildBuildings();
refreshTroopVisuals();
updateUI();
animate();

window.KingTownEngine = {
  version: '3.5.5',
  kenneyPath: 'assets/kenney/',
  getBuildings: () => buildings,
  getTroops: () => ({ ...troops }),
  getResources: () => ({ diamonds, stone, tokens, oil }),
  rebuild: rebuildBuildings,
  productionRate,
  scene,
  camera,
  renderer
};

console.info('[KingTown] v3.5.5 ready — engine OK');
