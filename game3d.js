/**
 * Kingdom Forge Frontier — Three.js Isometric Engine
 * گرافیک سه‌بعدی ایزومتریک نزدیک به حس Clash of Clans
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const $ = id => document.getElementById(id);
const container = document.getElementById('scene-container');

// ——— State ———
let diamonds = 750, stone = 420, tokens = 12, troops = 4, level = 1;
let rot = 0, zoom = 1, chosen = 'diamondmine', mode = 'build', enemyHP = 140;

const defs = {
  townhall:    { name: 'مرکز فرماندهی', cost: 0,   color: 0xc48b4a, h: 2.8, icon: '🏰' },
  diamondmine: { name: 'معدن الماس',    cost: 120, color: 0x48d7db, h: 1.8, icon: '💎' },
  stonepit:    { name: 'معدن سنگ',      cost: 100, color: 0x9ba5a2, h: 1.6, icon: '🪨' },
  barracks:    { name: 'پادگان',        cost: 180, color: 0xb77d4d, h: 2.2, icon: '⚔' },
  cannon:      { name: 'برج دفاعی',     cost: 150, color: 0x7b8e88, h: 2.4, icon: '🛡' },
  wall:        { name: 'دیوار سنگی',    cost: 25,  color: 0x9da99d, h: 1.0, icon: '🧱' }
};

let buildings = [
  { type: 'townhall', x: 0, z: 0 },
  { type: 'diamondmine', x: -2, z: -1 },
  { type: 'stonepit', x: 2, z: -1 },
  { type: 'barracks', x: -2, z: 2 },
  { type: 'cannon', x: 2, z: 2 },
  { type: 'wall', x: -1, z: 3 },
  { type: 'wall', x: 0, z: 3 },
  { type: 'wall', x: 1, z: 3 }
];

// ——— Three.js Core ———
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b8e0);
scene.fog = new THREE.Fog(0x87b8e0, 35, 70);

const aspect = container.clientWidth / container.clientHeight;
const frustum = 12;
const camera = new THREE.OrthographicCamera(
  -frustum * aspect, frustum * aspect,
  frustum, -frustum,
  0.1, 200
);
// ایزومتریک کلاسیک (زاویه Clash of Clans-like)
camera.position.set(18, 18, 18);
camera.lookAt(0, 0, 0);
camera.zoom = 1.1;
camera.updateProjectionMatrix();

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2.5));
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.insertBefore(renderer.domElement, container.firstChild);
renderer.domElement.style.position = 'absolute';
renderer.domElement.style.inset = '0';
renderer.domElement.style.width = '100%';
renderer.domElement.style.height = '100%';
renderer.domElement.style.touchAction = 'none';

// نورپردازی شبیه CoC
const hemi = new THREE.HemisphereLight(0xfff5e0, 0x3a5a30, 0.55);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff0d0, 1.35);
sun.position.set(-12, 22, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 60;
sun.shadow.camera.left = -25;
sun.shadow.camera.right = 25;
sun.shadow.camera.top = 25;
sun.shadow.camera.bottom = -25;
sun.shadow.bias = -0.0004;
scene.add(sun);

const fill = new THREE.DirectionalLight(0xa0c8ff, 0.35);
fill.position.set(10, 8, -12);
scene.add(fill);

// زمین شطرنجی سبز
const groundGroup = new THREE.Group();
scene.add(groundGroup);

const grassMatA = new THREE.MeshStandardMaterial({ color: 0x6aaa48, roughness: 0.85, metalness: 0.05 });
const grassMatB = new THREE.MeshStandardMaterial({ color: 0x5c9a3e, roughness: 0.85, metalness: 0.05 });
const tileGeo = new THREE.BoxGeometry(1, 0.12, 1);

for (let x = -11; x <= 11; x++) {
  for (let z = -11; z <= 11; z++) {
    const mat = (x + z) % 2 === 0 ? grassMatA : grassMatB;
    const tile = new THREE.Mesh(tileGeo, mat);
    tile.position.set(x, -0.06, z);
    tile.receiveShadow = true;
    groundGroup.add(tile);
  }
}

// حاشیه تیره
const borderMat = new THREE.MeshStandardMaterial({ color: 0x3a5a28, roughness: 0.9 });
for (let i = -12; i <= 12; i++) {
  [[i, -12], [i, 12], [-12, i], [12, i]].forEach(([x, z]) => {
    const b = new THREE.Mesh(tileGeo, borderMat);
    b.position.set(x, -0.06, z);
    b.receiveShadow = true;
    groundGroup.add(b);
  });
}

// درختان procedural
function makeTree(x, z) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.18, 0.9, 6),
    new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.8 })
  );
  trunk.position.y = 0.45;
  trunk.castShadow = true;
  g.add(trunk);

  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2d6a32, roughness: 0.75 });
  const sizes = [0.7, 0.55, 0.4];
  const ys = [1.1, 1.55, 1.9];
  sizes.forEach((s, i) => {
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), leafMat);
    leaf.position.y = ys[i];
    leaf.castShadow = true;
    g.add(leaf);
  });
  g.position.set(x, 0, z);
  return g;
}

const trees = [];
for (let i = -10; i <= 10; i += 2) {
  trees.push(makeTree(i, -10), makeTree(i, 10), makeTree(-10, i), makeTree(10, i));
}
trees.forEach(t => scene.add(t));

// سنگ‌ها
function makeRock(x, z) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x7a8a82, roughness: 0.7, metalness: 0.1 });
  const r1 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45, 0), mat);
  r1.position.y = 0.3;
  r1.scale.set(1.2, 0.7, 1);
  r1.castShadow = true;
  g.add(r1);
  const r2 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28, 0), mat);
  r2.position.set(0.3, 0.2, 0.15);
  r2.castShadow = true;
  g.add(r2);
  g.position.set(x, 0, z);
  return g;
}
[[-5,-3],[-4,4],[5,-4],[6,3],[-6,1],[4,6],[-3,-6],[3,5]].forEach(([x,z]) => scene.add(makeRock(x,z)));

// ——— ساختمان‌های سه‌بعدی با جزئیات ———
const buildingMeshes = new Map(); // key: "x,z" -> Group

function createBuildingMesh(type) {
  const d = defs[type];
  const g = new THREE.Group();
  const baseColor = d.color;
  const dark = new THREE.Color(baseColor).multiplyScalar(0.65);
  const light = new THREE.Color(baseColor).multiplyScalar(1.25);

  if (type === 'wall') {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.95, 0.9, 0.35),
      new THREE.MeshStandardMaterial({ color: 0x8a9a8e, roughness: 0.75 })
    );
    body.position.y = 0.45;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);
    // کنگره
    for (let i = -0.3; i <= 0.3; i += 0.3) {
      const merlon = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.25, 0.38),
        new THREE.MeshStandardMaterial({ color: 0x9aa89e })
      );
      merlon.position.set(i, 1.05, 0);
      merlon.castShadow = true;
      g.add(merlon);
    }
    return g;
  }

  // پایه
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 0.25, 1.1),
    new THREE.MeshStandardMaterial({ color: 0x5a4a32, roughness: 0.8 })
  );
  base.position.y = 0.125;
  base.castShadow = true;
  base.receiveShadow = true;
  g.add(base);

  // بدنه اصلی
  const bodyH = d.h * 0.55;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.95, bodyH, 0.95),
    new THREE.MeshStandardMaterial({ color: baseColor, roughness: 0.7, metalness: 0.05 })
  );
  body.position.y = 0.25 + bodyH / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  // سقف شیب‌دار
  const roofGeo = new THREE.ConeGeometry(0.85, d.h * 0.4, 4);
  const roof = new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({
    color: light, roughness: 0.6, metalness: 0.1
  }));
  roof.position.y = 0.25 + bodyH + d.h * 0.18;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  g.add(roof);

  // جزئیات مخصوص
  if (type === 'townhall') {
    // پرچم
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 1.2, 6),
      new THREE.MeshStandardMaterial({ color: 0x4a3a28 })
    );
    pole.position.set(0, 0.25 + bodyH + 0.9, 0);
    g.add(pole);
    const flag = new THREE.Mesh(
      new THREE.PlaneGeometry(0.45, 0.28),
      new THREE.MeshStandardMaterial({ color: 0xc43c2e, side: THREE.DoubleSide })
    );
    flag.position.set(0.25, 0.25 + bodyH + 1.3, 0);
    g.add(flag);
    // پنجره‌ها
    const winMat = new THREE.MeshStandardMaterial({ color: 0xf0d878, emissive: 0x664400, emissiveIntensity: 0.3 });
    [[-0.28, 0.55], [0.28, 0.55]].forEach(([wx, wy]) => {
      const w = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, 0.05), winMat);
      w.position.set(wx, 0.25 + wy, 0.48);
      g.add(w);
    });
  }

  if (type === 'diamondmine') {
    const crystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.35, 0),
      new THREE.MeshStandardMaterial({
        color: 0x48d7db, emissive: 0x228899, emissiveIntensity: 0.4,
        roughness: 0.2, metalness: 0.6
      })
    );
    crystal.position.y = 0.25 + bodyH + 0.55;
    crystal.castShadow = true;
    g.add(crystal);
  }

  if (type === 'cannon') {
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.15, 0.7, 8),
      new THREE.MeshStandardMaterial({ color: 0x4a5a52, metalness: 0.4, roughness: 0.5 })
    );
    barrel.rotation.z = Math.PI / 2;
    barrel.position.set(0.35, 0.25 + bodyH * 0.7, 0);
    barrel.castShadow = true;
    g.add(barrel);
  }

  if (type === 'barracks') {
    const shield = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.25, 0.08, 6),
      new THREE.MeshStandardMaterial({ color: 0xc05040 })
    );
    shield.rotation.x = Math.PI / 2;
    shield.position.set(0, 0.25 + bodyH + 0.15, 0.5);
    g.add(shield);
  }

  if (type === 'stonepit') {
    const pile = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.35, 0),
      new THREE.MeshStandardMaterial({ color: 0x8a9a92, roughness: 0.85 })
    );
    pile.position.set(0.35, 0.4, 0.35);
    pile.scale.set(1, 0.6, 1);
    pile.castShadow = true;
    g.add(pile);
  }

  return g;
}

function rebuildBuildings() {
  // حذف قبلی
  buildingMeshes.forEach(m => scene.remove(m));
  buildingMeshes.clear();

  buildings.forEach(b => {
    const mesh = createBuildingMesh(b.type);
    mesh.position.set(b.x, 0, b.z);
    scene.add(mesh);
    buildingMeshes.set(`${b.x},${b.z}`, mesh);
  });
}
rebuildBuildings();

// حلقه مرکز
const ringGeo = new THREE.RingGeometry(1.6, 1.75, 48);
const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
  color: 0xd8d7a5, transparent: true, opacity: 0.45, side: THREE.DoubleSide
}));
ring.rotation.x = -Math.PI / 2;
ring.position.y = 0.02;
scene.add(ring);

// ——— منطق بازی (همان قبلی) ———
function updateUI() {
  $('diamonds').textContent = Math.floor(diamonds);
  $('stone').textContent = Math.floor(stone);
  $('tokens').textContent = tokens;
  $('level').textContent = level;
  $('troops').textContent = troops;
}
function message(t) { $('msg').textContent = t; }

function save() {
  localStorage.setItem('kingdomForgeV3', JSON.stringify({
    diamonds, stone, tokens, troops, level, rot, zoom, buildings
  }));
  message('پیشرفت با موفقیت ذخیره شد ✓');
}

try {
  const s = JSON.parse(localStorage.getItem('kingdomForgeV3') || localStorage.getItem('kingdomForgeV2'));
  if (s) {
    ({ diamonds, stone, tokens, troops, level, rot, zoom, buildings } = s);
    rebuildBuildings();
  }
} catch (e) {}

document.querySelectorAll('[data-type]').forEach(btn => {
  btn.addEventListener('click', () => {
    chosen = btn.dataset.type;
    mode = 'build';
    message('برای ساخت ' + defs[chosen].name + ' روی زمین کلیک کن');
  });
});

// کلیک روی زمین (raycast)
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

renderer.domElement.addEventListener('pointerdown', e => {
  if (mode !== 'build') return;
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

  // صفحه زمین y=0
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  raycaster.ray.intersectPlane(plane, hit);
  if (!hit) return;

  const gx = Math.round(hit.x);
  const gz = Math.round(hit.z);
  if (Math.abs(gx) > 10 || Math.abs(gz) > 10) return;
  if (buildings.some(o => o.x === gx && o.z === gz)) {
    return message('این خانه اشغال است!');
  }
  const cost = defs[chosen].cost;
  if (diamonds < cost) return message('الماس کافی نداری!');
  diamonds -= cost;
  buildings.push({ type: chosen, x: gx, z: gz });
  rebuildBuildings();
  updateUI();
  message(defs[chosen].name + ' ساخته شد');
});

// کنترل‌های چرخش و زوم
function applyView() {
  const angle = (rot * Math.PI / 2) + Math.PI / 4;
  const dist = 18 / zoom;
  camera.position.set(
    Math.sin(angle) * dist,
    dist * 0.85,
    Math.cos(angle) * dist
  );
  camera.lookAt(0, 0.5, 0);
  camera.zoom = zoom * 1.05;
  camera.updateProjectionMatrix();
}
applyView();

$('left').onclick = () => { rot = (rot + 3) % 4; applyView(); };
$('right').onclick = () => { rot = (rot + 1) % 4; applyView(); };
$('plus').onclick = () => { zoom = Math.min(2.2, zoom + 0.15); applyView(); };
$('minus').onclick = () => { zoom = Math.max(0.6, zoom - 0.15); applyView(); };

$('train').onclick = () => {
  if (stone < 50) return message('سنگ کافی نداری!');
  stone -= 50; troops++; updateUI();
  message('نیرو آموزش دید؛ تعداد: ' + troops);
};
$('attack').onclick = () => {
  mode = 'battle';
  $('battleText').textContent = `نیروهای آماده: ${troops} | سلامت دشمن: ${enemyHP}`;
  $('modal').classList.remove('hide');
};
$('retreat').onclick = () => { $('modal').classList.add('hide'); mode = 'build'; };
$('launch').onclick = () => {
  if (!troops) return $('battleText').textContent = 'نیرویی برای اعزام نداری!';
  enemyHP = Math.max(0, enemyHP - troops * 24);
  troops = Math.max(0, troops - 1);
  if (enemyHP === 0) {
    const loot = 100 + Math.floor(Math.random() * 180);
    diamonds += loot; stone += 75; level++; enemyHP = 140;
    $('battleText').textContent = `پیروزی! ${loot} الماس و ۷۵ سنگ. سطح ${level}`;
  } else {
    $('battleText').textContent = `سلامت دشمن: ${enemyHP} | نیروهای باقی: ${troops}`;
  }
  updateUI();
};
$('save').onclick = save;
$('menu').onclick = () => $('drawer').classList.remove('hide');
$('close').onclick = () => $('drawer').classList.add('hide');
$('reset').onclick = () => {
  if (confirm('همه پیشرفت پاک شود؟')) {
    localStorage.removeItem('kingdomForgeV3');
    localStorage.removeItem('kingdomForgeV2');
    location.reload();
  }
};

setInterval(() => {
  diamonds += buildings.filter(o => o.type === 'diamondmine').length * 2;
  stone += buildings.filter(o => o.type === 'stonepit').length * 2;
  updateUI();
}, 1000);

// Resize
function onResize() {
  const w = container.clientWidth;
  const h = container.clientHeight;
  const a = w / h;
  camera.left = -frustum * a;
  camera.right = frustum * a;
  camera.top = frustum;
  camera.bottom = -frustum;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
window.addEventListener('resize', onResize);

// انیمیشن
function animate() {
  requestAnimationFrame(animate);
  // چرخش خیلی آرام کریستال‌ها
  buildingMeshes.forEach((mesh, key) => {
    const b = buildings.find(o => `${o.x},${o.z}` === key);
    if (b && b.type === 'diamondmine') {
      const crystal = mesh.children.find(c => c.geometry && c.geometry.type === 'OctahedronGeometry');
      if (crystal) crystal.rotation.y += 0.02;
    }
  });
  renderer.render(scene, camera);
}
updateUI();
animate();
