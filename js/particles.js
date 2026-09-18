/**
 * High-performance particle pool & system
 */

const PARTICLE_TYPES = {
  FLASH: 0,
  FIREBALL: 1,
  SPARK: 2,
  EMBER: 3,
  SMOKE: 4,
  DEBRIS: 5,
  SHOCKWAVE: 6,
  GLOW: 7,
  TRAIL: 8
};

export class ParticlePool {
  constructor(maxSize = 1200) {
    this.maxSize = maxSize;
    this.pool = [];
    this.active = [];
    for (let i = 0; i < maxSize; i++) {
      this.pool.push(this._createParticle());
    }
  }

  _createParticle() {
    return {
      active: false,
      type: 0,
      x: 0, y: 0,
      vx: 0, vy: 0,
      ax: 0, ay: 0,
      life: 0,
      maxLife: 1,
      size: 1,
      sizeEnd: 0,
      r: 255, g: 255, b: 255, a: 1,
      rEnd: 0, gEnd: 0, bEnd: 0, aEnd: 0,
      rotation: 0,
      rotSpeed: 0,
      drag: 0.98,
      gravity: 0,
      layer: 0
    };
  }

  acquire() {
    let p = this.pool.pop();
    if (!p) {
      if (this.active.length > this.maxSize * 0.95) return null;
      p = this._createParticle();
    }
    p.active = true;
    this.active.push(p);
    return p;
  }

  release(p) {
    p.active = false;
    this.pool.push(p);
  }

  clear() {
    for (const p of this.active) {
      p.active = false;
      this.pool.push(p);
    }
    this.active.length = 0;
  }

  update(dt) {
    const active = this.active;
    let write = 0;
    for (let i = 0; i < active.length; i++) {
      const p = active[i];
      if (!p.active) continue;

      p.life += dt;
      if (p.life >= p.maxLife) {
        this.release(p);
        continue;
      }

      // Physics
      p.vx += p.ax * dt;
      p.vy += (p.ay + p.gravity) * dt;
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += p.rotSpeed * dt;

      active[write++] = p;
    }
    active.length = write;
  }

  getActiveCount() {
    return this.active.length;
  }
}

export { PARTICLE_TYPES };
