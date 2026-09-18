import { PARTICLE_TYPES } from './particles.js';
import { QUALITY_SETTINGS } from './config.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.width = 0;
    this.height = 0;
    this.scale = 1;
    this.cameraX = 0;
    this.cameraY = 0;
    this.targetCamX = 0;
    this.targetCamY = 0;
    this.zoom = 1;
    this.quality = QUALITY_SETTINGS.high;
    this.clouds = [];
    this._initClouds();
    this.resize();
  }

  setQuality(level) {
    this.quality = QUALITY_SETTINGS[level] || QUALITY_SETTINGS.high;
    this._initClouds();
  }

  _initClouds() {
    this.clouds = [];
    const n = this.quality.cloudCount || 6;
    for (let i = 0; i < n; i++) {
      this.clouds.push({
        x: Math.random() * 4000 - 1000,
        y: 180 + Math.random() * 420,
        w: 80 + Math.random() * 160,
        h: 25 + Math.random() * 40,
        speed: 4 + Math.random() * 12,
        alpha: 0.15 + Math.random() * 0.25
      });
    }
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.canvas.style.width = this.width + 'px';
    this.canvas.style.height = this.height + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.scale = Math.min(this.width / 600, this.height / 500) * 1.4;
  }

  worldToScreen(wx, wy) {
    const sx = (wx - this.cameraX) * this.scale * this.zoom + this.width / 2;
    const bottomMargin = Math.min(280, this.height * 0.38);
    const sy = this.height - bottomMargin - (wy - this.cameraY) * this.scale * this.zoom;
    return { x: sx, y: sy };
  }

  updateCamera(rocketState, shake, dt) {
    if (rocketState && rocketState.alive) {
      this.targetCamX = rocketState.x * 0.35;
      this.targetCamY = Math.max(0, rocketState.y * 0.45 - 40);
      // Zoom out a bit at high altitude
      const targetZoom = Math.max(0.45, 1 - rocketState.altitude / 3500);
      this.zoom += (targetZoom - this.zoom) * Math.min(1, dt * 1.5);
    } else {
      this.targetCamX *= 0.98;
      this.targetCamY *= 0.98;
    }
    this.cameraX += (this.targetCamX - this.cameraX) * Math.min(1, dt * 3.5);
    this.cameraY += (this.targetCamY - this.cameraY) * Math.min(1, dt * 3.5);

    if (shake) {
      this.cameraX += shake.x;
      this.cameraY += shake.y;
    }
  }

  clear(lightFlash = 0) {
    const ctx = this.ctx;
    // Sky gradient
    const grad = ctx.createLinearGradient(0, 0, 0, this.height);
    grad.addColorStop(0, '#0b1220');
    grad.addColorStop(0.35, '#152238');
    grad.addColorStop(0.7, '#1e3a5f');
    grad.addColorStop(1, '#2a4a6e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.width, this.height);

    // Light flash overlay
    if (lightFlash > 0.02) {
      ctx.fillStyle = `rgba(255, 220, 160, ${lightFlash * 0.55})`;
      ctx.fillRect(0, 0, this.width, this.height);
    }
  }

  drawEnvironment(dt) {
    const ctx = this.ctx;
    const bottomMargin = Math.min(280, this.height * 0.38);
    const groundY = this.height - bottomMargin;

    // Sun glow
    const sunX = this.width * 0.82;
    const sunY = this.height * 0.18;
    const sunGrad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 120);
    sunGrad.addColorStop(0, 'rgba(255, 230, 180, 0.35)');
    sunGrad.addColorStop(0.4, 'rgba(255, 200, 100, 0.12)');
    sunGrad.addColorStop(1, 'rgba(255, 180, 80, 0)');
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 120, 0, Math.PI * 2);
    ctx.fill();

    // Clouds
    for (const c of this.clouds) {
      c.x += c.speed * dt;
      if (c.x > this.cameraX + 2500) c.x = this.cameraX - 1500;
      const sx = (c.x - this.cameraX) * this.scale * 0.3 + this.width * 0.3;
      const sy = groundY - c.y * this.scale * 0.25;
      ctx.fillStyle = `rgba(200, 220, 255, ${c.alpha})`;
      ctx.beginPath();
      ctx.ellipse(sx, sy, c.w * this.scale * 0.25, c.h * this.scale * 0.25, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(sx + c.w * 0.15, sy - 5, c.w * 0.18, c.h * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Horizon haze
    const haze = ctx.createLinearGradient(0, groundY - 120, 0, groundY);
    haze.addColorStop(0, 'rgba(100, 140, 180, 0)');
    haze.addColorStop(1, 'rgba(80, 120, 160, 0.25)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, groundY - 120, this.width, 120);

    // Ground
    const groundGrad = ctx.createLinearGradient(0, groundY, 0, this.height);
    groundGrad.addColorStop(0, '#1a2f1a');
    groundGrad.addColorStop(0.3, '#243a24');
    groundGrad.addColorStop(1, '#0f1a0f');
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, groundY, this.width, this.height - groundY);

    // Ground texture lines
    ctx.strokeStyle = 'rgba(40, 70, 40, 0.4)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      const gy = groundY + 10 + i * 12;
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(this.width, gy + Math.sin(i) * 3);
      ctx.stroke();
    }

    // Launch pad
    this._drawLaunchPad(groundY);
  }

  _drawLaunchPad(groundY) {
    const ctx = this.ctx;
    const pad = this.worldToScreen(0, 0);
    const padW = 70 * this.scale * this.zoom;
    const padH = 12 * this.scale * this.zoom;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(pad.x, groundY + 4, padW * 0.7, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Platform
    ctx.fillStyle = '#4a5568';
    ctx.fillRect(pad.x - padW / 2, groundY - padH, padW, padH);
    ctx.fillStyle = '#718096';
    ctx.fillRect(pad.x - padW / 2, groundY - padH, padW, 3);

    // Support structure
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2 * this.scale;
    ctx.beginPath();
    ctx.moveTo(pad.x - padW * 0.35, groundY - padH);
    ctx.lineTo(pad.x - padW * 0.35, groundY - padH - 25 * this.scale * this.zoom);
    ctx.moveTo(pad.x + padW * 0.35, groundY - padH);
    ctx.lineTo(pad.x + padW * 0.35, groundY - padH - 25 * this.scale * this.zoom);
    ctx.stroke();

    // Base plate
    ctx.fillStyle = '#334155';
    ctx.fillRect(pad.x - padW * 0.6, groundY, padW * 1.2, 6);
  }

  drawRocket(state, rocketType, trail) {
    if (!state || state.exploded) return;
    const ctx = this.ctx;
    // Offset rocket so its base sits on the ground when y≈0
    const visualY = state.y + (state.y < 2 ? 1.2 : 0);
    const pos = this.worldToScreen(state.x, visualY);
    const size = (rocketType?.size || 1) * 32 * this.scale * this.zoom;
    const angle = -state.angle + Math.PI / 2; // visual orientation

    // Exhaust trail / plume when thrusting
    if (state.thrustActive && state.fuel > 0) {
      this._drawExhaust(pos.x, pos.y, angle, size, state.fuel);
    }

    // Trail
    if (trail && trail.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(180, 210, 255, 0.35)';
      ctx.lineWidth = 1.5 * this.scale;
      for (let i = 0; i < trail.length; i++) {
        const t = this.worldToScreen(trail[i].x, trail[i].y);
        if (i === 0) ctx.moveTo(t.x, t.y);
        else ctx.lineTo(t.x, t.y);
      }
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(angle);

    // Body
    const bodyColor = rocketType?.color || '#f8fafc';
    const finColor = rocketType?.finColor || '#3b82f6';

    // Shadow under rocket
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(0, size * 0.9, size * 0.35, size * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();

    // Main body
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.moveTo(0, -size * 1.1);
    ctx.lineTo(size * 0.28, -size * 0.3);
    ctx.lineTo(size * 0.28, size * 0.55);
    ctx.lineTo(-size * 0.28, size * 0.55);
    ctx.lineTo(-size * 0.28, -size * 0.3);
    ctx.closePath();
    ctx.fill();

    // Nose cone
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.moveTo(0, -size * 1.1);
    ctx.lineTo(size * 0.28, -size * 0.3);
    ctx.lineTo(-size * 0.28, -size * 0.3);
    ctx.closePath();
    ctx.fill();

    // Window
    ctx.fillStyle = '#1e3a5f';
    ctx.beginPath();
    ctx.arc(0, -size * 0.15, size * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(150, 200, 255, 0.5)';
    ctx.beginPath();
    ctx.arc(-size * 0.03, -size * 0.18, size * 0.04, 0, Math.PI * 2);
    ctx.fill();

    // Fins
    ctx.fillStyle = finColor;
    // Left fin
    ctx.beginPath();
    ctx.moveTo(-size * 0.28, size * 0.25);
    ctx.lineTo(-size * 0.55, size * 0.65);
    ctx.lineTo(-size * 0.28, size * 0.55);
    ctx.closePath();
    ctx.fill();
    // Right fin
    ctx.beginPath();
    ctx.moveTo(size * 0.28, size * 0.25);
    ctx.lineTo(size * 0.55, size * 0.65);
    ctx.lineTo(size * 0.28, size * 0.55);
    ctx.closePath();
    ctx.fill();

    // Engine nozzle
    ctx.fillStyle = '#475569';
    ctx.fillRect(-size * 0.18, size * 0.55, size * 0.36, size * 0.18);

    ctx.restore();
  }

  _drawExhaust(x, y, angle, size, fuel) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    const len = size * (1.2 + fuel * 0.8);
    const grad = ctx.createLinearGradient(0, size * 0.7, 0, size * 0.7 + len);
    grad.addColorStop(0, 'rgba(255, 255, 220, 0.9)');
    grad.addColorStop(0.25, 'rgba(255, 180, 50, 0.7)');
    grad.addColorStop(0.6, 'rgba(255, 80, 20, 0.4)');
    grad.addColorStop(1, 'rgba(40, 20, 10, 0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-size * 0.12, size * 0.7);
    ctx.quadraticCurveTo(-size * 0.25, size * 0.7 + len * 0.5, 0, size * 0.7 + len);
    ctx.quadraticCurveTo(size * 0.25, size * 0.7 + len * 0.5, size * 0.12, size * 0.7);
    ctx.closePath();
    ctx.fill();

    // Core bright
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.beginPath();
    ctx.moveTo(-size * 0.05, size * 0.7);
    ctx.lineTo(0, size * 0.7 + len * 0.55);
    ctx.lineTo(size * 0.05, size * 0.7);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  drawParticles(particles) {
    const ctx = this.ctx;
    // Sort by layer (back to front)
    const sorted = particles.slice().sort((a, b) => a.layer - b.layer);

    for (const p of sorted) {
      if (!p.active) continue;
      const t = p.life / p.maxLife;
      const pos = this.worldToScreen(p.x, p.y);

      const r = Math.floor(p.r + (p.rEnd - p.r) * t);
      const g = Math.floor(p.g + (p.gEnd - p.g) * t);
      const b = Math.floor(p.b + (p.bEnd - p.b) * t);
      const a = p.a + (p.aEnd - p.a) * t;
      const size = (p.size + (p.sizeEnd - p.size) * t) * this.scale * this.zoom;

      if (a < 0.01 || size < 0.3) continue;

      ctx.save();
      ctx.translate(pos.x, pos.y);
      if (p.rotation) ctx.rotate(p.rotation);
      ctx.globalAlpha = Math.max(0, Math.min(1, a));

      switch (p.type) {
        case PARTICLE_TYPES.FLASH:
        case PARTICLE_TYPES.GLOW: {
          const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, size);
          grd.addColorStop(0, `rgba(${r},${g},${b},${a})`);
          grd.addColorStop(0.4, `rgba(${r},${g},${b},${a * 0.5})`);
          grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
          ctx.fillStyle = grd;
          ctx.beginPath();
          ctx.arc(0, 0, size, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case PARTICLE_TYPES.FIREBALL: {
          const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, size);
          grd.addColorStop(0, `rgba(255, 255, 220, ${a})`);
          grd.addColorStop(0.25, `rgba(${r},${g},${b},${a})`);
          grd.addColorStop(0.7, `rgba(${Math.floor(r * 0.6)},${Math.floor(g * 0.3)},20,${a * 0.6})`);
          grd.addColorStop(1, `rgba(30,10,5,0)`);
          ctx.fillStyle = grd;
          ctx.beginPath();
          ctx.arc(0, 0, size, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case PARTICLE_TYPES.SPARK:
        case PARTICLE_TYPES.EMBER: {
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.shadowColor = `rgb(${r},${g},${b})`;
          ctx.shadowBlur = size * 2;
          ctx.beginPath();
          ctx.arc(0, 0, size, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
          // Motion streak
          if (p.type === PARTICLE_TYPES.SPARK) {
            ctx.strokeStyle = `rgba(${r},${g},${b},0.5)`;
            ctx.lineWidth = size * 0.6;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(-p.vx * 0.015, -p.vy * 0.015);
            ctx.stroke();
          }
          break;
        }
        case PARTICLE_TYPES.SMOKE: {
          const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, size);
          grd.addColorStop(0, `rgba(${r},${g},${b},${a})`);
          grd.addColorStop(0.6, `rgba(${r},${g},${b},${a * 0.5})`);
          grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
          ctx.fillStyle = grd;
          ctx.beginPath();
          ctx.arc(0, 0, size, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case PARTICLE_TYPES.DEBRIS: {
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.fillRect(-size / 2, -size / 2, size, size * 0.7);
          break;
        }
        case PARTICLE_TYPES.SHOCKWAVE: {
          ctx.strokeStyle = `rgba(${r},${g},${b},${a})`;
          ctx.lineWidth = Math.max(1, 3 * (1 - t) * this.scale);
          ctx.beginPath();
          ctx.arc(0, 0, size, 0, Math.PI * 2);
          ctx.stroke();
          // Secondary softer ring
          ctx.strokeStyle = `rgba(${r},${g},${b},${a * 0.35})`;
          ctx.lineWidth = Math.max(1, 6 * (1 - t) * this.scale);
          ctx.beginPath();
          ctx.arc(0, 0, size * 0.92, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
        default: {
          ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
          ctx.beginPath();
          ctx.arc(0, 0, size, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }
  }

  drawImpactMarker(x, y) {
    const pos = this.worldToScreen(x, y);
    const bottomMargin = Math.min(280, this.height * 0.38);
    const groundY = this.height - bottomMargin;
    // Scorch mark
    this.ctx.fillStyle = 'rgba(20, 15, 10, 0.55)';
    this.ctx.beginPath();
    this.ctx.ellipse(pos.x, groundY + 2, 28 * this.scale, 10 * this.scale, 0, 0, Math.PI * 2);
    this.ctx.fill();
  }
}
