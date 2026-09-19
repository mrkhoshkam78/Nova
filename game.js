(() => {
  'use strict';
  const c = document.querySelector('#world');
  const ctx = c.getContext('2d', { alpha: false, desynchronized: true });
  const $ = id => document.getElementById(id);
  const G = window.KFGraphics; // موتور گرافیکی

  let diamonds = 750, stone = 420, tokens = 12, troops = 4, level = 1;
  let rot = 0, zoom = 1, chosen = 'diamondmine', mode = 'build', enemyHP = 140;
  let animTime = 0;

  const defs = {
    townhall:   { name: 'مرکز فرماندهی', cost: 0,   color: '#c48b4a', h: 62, icon: '🏰' },
    diamondmine:{ name: 'معدن الماس',    cost: 120, color: '#48d7db', h: 40, icon: '💎' },
    stonepit:   { name: 'معدن سنگ',      cost: 100, color: '#9ba5a2', h: 36, icon: '🪨' },
    barracks:   { name: 'پادگان',        cost: 180, color: '#b77d4d', h: 48, icon: '⚔' },
    cannon:     { name: 'برج دفاعی',     cost: 150, color: '#7b8e88', h: 46, icon: '🛡' },
    wall:       { name: 'دیوار سنگی',    cost: 25,  color: '#9da99d', h: 20, icon: '🧱' }
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

  // پروجکشن سریع برای کلیک (از موتور)
  function project(a, b, y = 0) {
    return G.project(a, b, y, rot, zoom, c);
  }

  function draw() {
    if (!c.clientWidth || !c.clientHeight) return;

    const w = c.clientWidth;
    const h = c.clientHeight;

    // پس‌زمینه آسمان + نور
    G.drawSky(ctx, w, h);

    // کاشی‌های زمین با کیفیت بالا
    for (let a = -12; a < 12; a++) {
      for (let b = -12; b < 12; b++) {
        G.drawTile(ctx, a, b, rot, zoom, c, (a + b) % 2 === 0);
      }
    }

    // درختان حاشیه
    for (let i = -10; i <= 10; i++) {
      G.drawTree(ctx, i, -10, rot, zoom, c);
      G.drawTree(ctx, i, 10, rot, zoom, c);
      if (i % 2 === 0) {
        G.drawTree(ctx, -10, i, rot, zoom, c);
        G.drawTree(ctx, 10, i, rot, zoom, c);
      }
    }

    // سنگ‌ها
    [[-5, -3], [-4, 4], [5, -4], [6, 3], [-6, 1], [4, 6], [-3, -6], [3, 5]]
      .forEach(([x, z]) => G.drawRock(ctx, x, z, rot, zoom, c));

    // ساختمان‌ها (مرتب‌سازی عمق)
    buildings
      .slice()
      .sort((a, b) => (a.x + a.z) - (b.x + b.z))
      .forEach(o => G.drawBuilding(ctx, o, defs, rot, zoom, c));

    // حلقه مرکز
    const center = project(0, 0);
    G.drawCenterRing(ctx, center, zoom);

    // ذرات محیطی
    G.drawAmbientParticles(ctx, w, h, animTime);
  }

  function update() {
    $('diamonds').textContent = Math.floor(diamonds);
    $('stone').textContent = Math.floor(stone);
    $('tokens').textContent = tokens;
    $('level').textContent = level;
    $('troops').textContent = troops;
  }

  function message(t) {
    $('msg').textContent = t;
  }

  function save() {
    localStorage.setItem('kingdomForgeV2', JSON.stringify({
      diamonds, stone, tokens, troops, level, rot, zoom, buildings
    }));
    message('پیشرفت با موفقیت ذخیره شد ✓');
  }

  try {
    const s = JSON.parse(localStorage.getItem('kingdomForgeV2'));
    if (s) ({ diamonds, stone, tokens, troops, level, rot, zoom, buildings } = s);
  } catch (e) {}

  // انتخاب ساختمان
  document.querySelectorAll('[data-type]').forEach(btn => {
    btn.addEventListener('click', () => {
      chosen = btn.dataset.type;
      mode = 'build';
      message('برای ساخت ' + defs[chosen].name + ' یک خانه خالی روی زمین انتخاب کن');
    });
  });

  // کلیک روی زمین
  c.addEventListener('pointerdown', e => {
    if (mode !== 'build') return;
    const r = c.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    let best = null, dist = Infinity;
    for (let a = -10; a <= 10; a++) {
      for (let b = -10; b <= 10; b++) {
        const q = project(a, b);
        const d = Math.hypot(q.x - mx, q.y - my);
        if (d < dist) {
          dist = d;
          best = { x: a, z: b };
        }
      }
    }
    if (dist > Math.max(30, 42 * zoom)) return;
    if (buildings.some(o => o.x === best.x && o.z === best.z)) {
      return message('این خانه اشغال است!');
    }
    const cost = defs[chosen].cost;
    if (diamonds < cost) return message('الماس کافی نداری!');
    diamonds -= cost;
    buildings.push({ type: chosen, ...best });
    update();
    draw();
    message(defs[chosen].name + ' ساخته شد');
  });

  // کنترل‌های دید
  $('left').onclick = () => { rot = (rot + 3) % 4; draw(); };
  $('right').onclick = () => { rot = (rot + 1) % 4; draw(); };
  $('plus').onclick = () => { zoom = Math.min(1.8, zoom + 0.12); draw(); };
  $('minus').onclick = () => { zoom = Math.max(0.5, zoom - 0.12); draw(); };

  // آموزش نیرو
  $('train').onclick = () => {
    if (stone < 50) return message('سنگ کافی نداری!');
    stone -= 50;
    troops++;
    update();
    message('نیرو آموزش دید؛ تعداد نیروها: ' + troops);
  };

  // حمله
  $('attack').onclick = () => {
    mode = 'battle';
    $('battleText').textContent = `نیروهای آماده: ${troops} | سلامت دشمن: ${enemyHP}`;
    $('modal').classList.remove('hide');
  };
  $('retreat').onclick = () => {
    $('modal').classList.add('hide');
    mode = 'build';
  };
  $('launch').onclick = () => {
    if (!troops) return $('battleText').textContent = 'نیرویی برای اعزام نداری!';
    enemyHP = Math.max(0, enemyHP - troops * 24);
    troops = Math.max(0, troops - 1);
    if (enemyHP === 0) {
      const loot = 100 + Math.floor(Math.random() * 180);
      diamonds += loot;
      stone += 75;
      level++;
      enemyHP = 140;
      $('battleText').textContent = `پیروزی! ${loot} الماس و ۷۵ سنگ به دست آوردی. سطح ${level}`;
    } else {
      $('battleText').textContent = `سلامت دشمن: ${enemyHP} | نیروهای باقی‌مانده: ${troops}`;
    }
    update();
  };

  $('save').onclick = save;
  $('menu').onclick = () => $('drawer').classList.remove('hide');
  $('close').onclick = () => $('drawer').classList.add('hide');
  $('reset').onclick = () => {
    if (confirm('همه پیشرفت ذخیره‌شده پاک شود؟')) {
      localStorage.removeItem('kingdomForgeV2');
      location.reload();
    }
  };

  // تولید منابع
  setInterval(() => {
    diamonds += buildings.filter(o => o.type === 'diamondmine').length * 2;
    stone += buildings.filter(o => o.type === 'stonepit').length * 2;
    update();
  }, 1000);

  // رندر با کیفیت بالا + انیمیشن ذرات
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3); // تا ۳ برابر برای حس ۴K روی صفحه‌های رتینا
    c.width = Math.floor(c.clientWidth * dpr);
    c.height = Math.floor(c.clientHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    draw();
  }

  // حلقه انیمیشن سبک برای ذرات
  function loop(t) {
    animTime = t;
    // فقط هر چند فریم یک‌بار رندر کامل (برای عملکرد)
    if (Math.floor(t / 80) !== Math.floor((t - 16) / 80)) {
      draw();
    }
    requestAnimationFrame(loop);
  }

  window.addEventListener('resize', resize);
  update();
  resize();
  requestAnimationFrame(loop);
})();
