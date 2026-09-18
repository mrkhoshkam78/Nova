import { ParticlePool, PARTICLE_TYPES } from './particles.js';
import { QUALITY_SETTINGS } from './config.js';

export class ExplosionSystem {
  constructor() {
    this.pool = new ParticlePool(1400);
    this.quality = QUALITY_SETTINGS.high;
    this.shakeIntensity = 0;
    this.shakeDecay = 0;
    this.lightFlash = 0;
    this.explosions = [];
  }

  setQuality(level) {
    this.quality = QUALITY_SETTINGS[level] || QUALITY_SETTINGS.high;
    this.pool.maxSize = this.quality.maxParticles;
  }

  clear() {
    this.pool.clear();
    this.explosions.length = 0;
    this.shakeIntensity = 0;
    this.lightFlash = 0;
  }

  /**
   * Create a cinematic multi-layer explosion
   * @param {number} x - world x
   * @param {number} y - world y
   * @param {number} intensity - 0.3 .. 2.5 based on impact energy
   */
  explode(x, y, intensity = 1.0) {
    intensity = Math.max(0.35, Math.min(2.8, intensity));
    const q = this.quality;
    const scale = intensity;

    this.explosions.push({
      x, y,
      intensity,
      time: 0,
      duration: 1.8 + scale * 1.4
    });

    // Camera shake
    if (q.cameraShake) {
      this.shakeIntensity = Math.max(this.shakeIntensity, 6 + scale * 14);
      this.shakeDecay = 2.2 + scale * 0.8;
    }

    // Screen light flash
    this.lightFlash = Math.max(this.lightFlash, 0.55 + scale * 0.4);

    // 1. FLASH — instant bright core
    this._spawnFlash(x, y, scale);

    // 2. FIREBALL layers
    this._spawnFireball(x, y, scale, q.fireballLayers);

    // 3. Sparks
    this._spawnSparks(x, y, scale, q.sparkCount);

    // 4. Embers
    this._spawnEmbers(x, y, scale, q.emberCount);

    // 5. Smoke
    this._spawnSmoke(x, y, scale, q.smokeCount);

    // 6. Debris
    this._spawnDebris(x, y, scale, q.debrisCount);

    // 7. Shockwave
    if (q.shockwave) {
      this._spawnShockwave(x, y, scale);
    }

    // 8. Secondary glow particles
    this._spawnGlow(x, y, scale);
  }

  _spawnFlash(x, y, scale) {
    const p = this.pool.acquire();
    if (!p) return;
    p.type = PARTICLE_TYPES.FLASH;
    p.x = x; p.y = y;
    p.vx = 0; p.vy = 0;
    p.ax = 0; p.ay = 0;
    p.life = 0;
    p.maxLife = 0.08 + scale * 0.04;
    p.size = 18 + scale * 35;
    p.sizeEnd = p.size * 2.8;
    p.r = 255; p.g = 255; p.b = 255; p.a = 1;
    p.rEnd = 255; p.gEnd = 220; p.bEnd = 160; p.aEnd = 0;
    p.drag = 1; p.gravity = 0;
    p.layer = 10;
  }

  _spawnFireball(x, y, scale, layers) {
    for (let i = 0; i < layers; i++) {
      const t = i / Math.max(1, layers - 1);
      const count = 3 + Math.floor(scale * 2);
      for (let j = 0; j < count; j++) {
        const p = this.pool.acquire();
        if (!p) return;

        const angle = Math.random() * Math.PI * 2;
        const speed = (8 + Math.random() * 22) * scale * (1 - t * 0.4);
        p.type = PARTICLE_TYPES.FIREBALL;
        p.x = x + (Math.random() - 0.5) * 8 * scale;
        p.y = y + (Math.random() - 0.5) * 8 * scale;
        p.vx = Math.cos(angle) * speed;
        p.vy = Math.sin(angle) * speed + 4 * scale;
        p.ax = 0; p.ay = 0;
        p.life = 0;
        p.maxLife = 0.35 + Math.random() * 0.45 + scale * 0.25 - t * 0.15;
        p.size = (12 + Math.random() * 18) * scale * (1.1 - t * 0.5);
        p.sizeEnd = p.size * (1.6 + Math.random() * 0.8);
        // Orange → red → dark
        const heat = 1 - t * 0.6;
        p.r = 255;
        p.g = Math.floor(80 + 140 * heat + Math.random() * 40);
        p.b = Math.floor(20 + 40 * heat);
        p.a = 0.95;
        p.rEnd = 40 + Math.random() * 30;
        p.gEnd = 15;
        p.bEnd = 5;
        p.aEnd = 0;
        p.drag = 0.92 - Math.random() * 0.04;
        p.gravity = -6 - Math.random() * 8; // rise then slow
        p.layer = 5 - i;
        p.rotation = Math.random() * Math.PI * 2;
        p.rotSpeed = (Math.random() - 0.5) * 4;
      }
    }
  }

  _spawnSparks(x, y, scale, count) {
    const n = Math.floor(count * (0.7 + scale * 0.4));
    for (let i = 0; i < n; i++) {
      const p = this.pool.acquire();
      if (!p) return;

      const angle = Math.random() * Math.PI * 2;
      const speed = (25 + Math.random() * 70) * scale;
      p.type = PARTICLE_TYPES.SPARK;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed + Math.random() * 15;
      p.ax = 0; p.ay = 0;
      p.life = 0;
      p.maxLife = 0.25 + Math.random() * 0.55;
      p.size = 1.2 + Math.random() * 2.8 * scale;
      p.sizeEnd = 0.3;
      p.r = 255;
      p.g = 200 + Math.floor(Math.random() * 55);
      p.b = 80 + Math.floor(Math.random() * 80);
      p.a = 1;
      p.rEnd = 255;
      p.gEnd = 80;
      p.bEnd = 20;
      p.aEnd = 0;
      p.drag = 0.96;
      p.gravity = 25 + Math.random() * 40;
      p.layer = 6;
    }
  }

  _spawnEmbers(x, y, scale, count) {
    const n = Math.floor(count * (0.6 + scale * 0.5));
    for (let i = 0; i < n; i++) {
      const p = this.pool.acquire();
      if (!p) return;

      const angle = -Math.PI * 0.2 + Math.random() * Math.PI * 1.4;
      const speed = (8 + Math.random() * 35) * scale;
      p.type = PARTICLE_TYPES.EMBER;
      p.x = x + (Math.random() - 0.5) * 12;
      p.y = y + (Math.random() - 0.5) * 8;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed + 5;
      p.ax = (Math.random() - 0.5) * 8;
      p.ay = 0;
      p.life = 0;
      p.maxLife = 0.8 + Math.random() * 1.6 + scale * 0.4;
      p.size = 1.5 + Math.random() * 3.5;
      p.sizeEnd = 0.4;
      p.r = 255;
      p.g = 140 + Math.floor(Math.random() * 80);
      p.b = 30;
      p.a = 0.9;
      p.rEnd = 80;
      p.gEnd = 20;
      p.bEnd = 5;
      p.aEnd = 0;
      p.drag = 0.97;
      p.gravity = 8 + Math.random() * 18;
      p.layer = 4;
    }
  }

  _spawnSmoke(x, y, scale, count) {
    const n = Math.floor(count * (0.8 + scale * 0.35));
    for (let i = 0; i < n; i++) {
      const p = this.pool.acquire();
      if (!p) return;

      const angle = Math.random() * Math.PI * 2;
      const speed = (3 + Math.random() * 14) * scale;
      p.type = PARTICLE_TYPES.SMOKE;
      p.x = x + (Math.random() - 0.5) * 20 * scale;
      p.y = y + (Math.random() - 0.5) * 15 * scale;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed + 6 + Math.random() * 10;
      p.ax = (Math.random() - 0.5) * 3;
      p.ay = 0;
      p.life = 0;
      p.maxLife = 1.6 + Math.random() * 2.8 + scale * 0.9;
      p.size = (10 + Math.random() * 22) * scale;
      p.sizeEnd = p.size * (2.2 + Math.random() * 1.5);
      const gray = 40 + Math.floor(Math.random() * 50);
      p.r = gray; p.g = gray; p.b = gray + 10;
      p.a = 0.45 + Math.random() * 0.25;
      p.rEnd = 30; p.gEnd = 30; p.bEnd = 35;
      p.aEnd = 0;
      p.drag = 0.985;
      p.gravity = -4 - Math.random() * 6; // rises slowly
      p.layer = 1;
      p.rotation = Math.random() * Math.PI * 2;
      p.rotSpeed = (Math.random() - 0.5) * 1.2;
    }
  }

  _spawnDebris(x, y, scale, count) {
    const n = Math.floor(count * (0.7 + scale * 0.4));
    for (let i = 0; i < n; i++) {
      const p = this.pool.acquire();
      if (!p) return;

      const angle = Math.random() * Math.PI * 2;
      const speed = (15 + Math.random() * 55) * scale;
      p.type = PARTICLE_TYPES.DEBRIS;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed + Math.random() * 20;
      p.ax = 0; p.ay = 0;
      p.life = 0;
      p.maxLife = 0.9 + Math.random() * 1.4;
      p.size = 2 + Math.random() * 5 * scale;
      p.sizeEnd = p.size * 0.7;
      // metallic / scorched
      const c = 60 + Math.floor(Math.random() * 80);
      p.r = c + 40; p.g = c; p.b = c - 20;
      p.a = 1;
      p.rEnd = 40; p.gEnd = 35; p.bEnd = 30;
      p.aEnd = 0;
      p.drag = 0.98;
      p.gravity = 55 + Math.random() * 40;
      p.layer = 3;
      p.rotation = Math.random() * Math.PI * 2;
      p.rotSpeed = (Math.random() - 0.5) * 12;
    }
  }

  _spawnShockwave(x, y, scale) {
    const p = this.pool.acquire();
    if (!p) return;
    p.type = PARTICLE_TYPES.SHOCKWAVE;
    p.x = x; p.y = y;
    p.vx = 0; p.vy = 0;
    p.ax = 0; p.ay = 0;
    p.life = 0;
    p.maxLife = 0.35 + scale * 0.15;
    p.size = 8;
    p.sizeEnd = 90 + scale * 70;
    p.r = 255; p.g = 240; p.b = 200; p.a = 0.55;
    p.rEnd = 180; p.gEnd = 160; p.bEnd = 120; p.aEnd = 0;
    p.drag = 1; p.gravity = 0;
    p.layer = 8;
  }

  _spawnGlow(x, y, scale) {
    for (let i = 0; i < 4; i++) {
      const p = this.pool.acquire();
      if (!p) return;
      p.type = PARTICLE_TYPES.GLOW;
      p.x = x + (Math.random() - 0.5) * 10;
      p.y = y + (Math.random() - 0.5) * 10;
      p.vx = (Math.random() - 0.5) * 8;
      p.vy = (Math.random() - 0.5) * 8;
      p.ax = 0; p.ay = 0;
      p.life = 0;
      p.maxLife = 0.4 + Math.random() * 0.5;
      p.size = 25 + scale * 40;
      p.sizeEnd = p.size * 1.8;
      p.r = 255; p.g = 160; p.b = 60; p.a = 0.35;
      p.rEnd = 200; p.gEnd = 60; p.bEnd = 10; p.aEnd = 0;
      p.drag = 0.95; p.gravity = 0;
      p.layer = 2;
    }
  }

  update(dt) {
    this.pool.update(dt);

    // Shake decay
    if (this.shakeIntensity > 0.05) {
      this.shakeIntensity *= Math.exp(-this.shakeDecay * dt);
    } else {
      this.shakeIntensity = 0;
    }

    // Light flash decay
    if (this.lightFlash > 0.01) {
      this.lightFlash *= Math.exp(-4.5 * dt);
    } else {
      this.lightFlash = 0;
    }

    // Cleanup old explosion records
    this.explosions = this.explosions.filter(e => {
      e.time += dt;
      return e.time < e.duration;
    });
  }

  getShakeOffset() {
    if (this.shakeIntensity < 0.1) return { x: 0, y: 0 };
    const s = this.shakeIntensity;
    return {
      x: (Math.random() - 0.5) * s * 2,
      y: (Math.random() - 0.5) * s * 2
    };
  }

  getLightFlash() {
    return this.lightFlash;
  }

  getParticles() {
    return this.pool.active;
  }
}
