import { RocketPhysics } from './physics.js';
import { Renderer } from './renderer.js';
import { ExplosionSystem } from './explosion.js';
import { UI } from './ui.js';
import { ROCKET_TYPES, QUALITY_SETTINGS } from './config.js';

class Game {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.physics = new RocketPhysics();
    this.renderer = new Renderer(this.canvas);
    this.explosion = new ExplosionSystem();
    this.ui = new UI({
      onLaunch: () => this.launch(),
      onPause: () => this.pause(),
      onResume: () => this.resume(),
      onRestart: () => this.restart(),
      onAngleChange: (a) => { this.pendingAngle = a; },
      onPowerChange: (p) => { this.pendingPower = p; },
      onRocketTypeChange: (t) => { this.pendingType = t; },
      onQualityChange: (q) => this.setQuality(q)
    });

    this.state = 'ready'; // ready | flying | paused | exploded
    this.pendingAngle = 90;
    this.pendingPower = 100;
    this.pendingType = 'basic';
    this.rocketType = ROCKET_TYPES.basic;
    this.trail = [];
    this.lastImpact = null;
    this.rafId = null;
    this.lastTime = 0;
    this.accum = 0;
    this.fixedDt = 1 / 60;

    this._bindResize();
    this.setQuality('high');
    this.restart();
    this.loop(0);
  }

  _bindResize() {
    window.addEventListener('resize', () => {
      this.renderer.resize();
    });
  }

  setQuality(level) {
    this.explosion.setQuality(level);
    this.renderer.setQuality(level);
    this.ui.elements.qualityLevel.textContent = QUALITY_SETTINGS[level]?.name || level;
  }

  launch() {
    if (this.state !== 'ready' && this.state !== 'exploded') return;

    const settings = this.ui.getSettings();
    this.rocketType = ROCKET_TYPES[settings.rocketType] || ROCKET_TYPES.basic;
    this.physics.reset(settings.angle, settings.power, this.rocketType);
    this.physics.launch();
    this.trail = [];
    this.lastImpact = null;
    this.explosion.clear();
    this.state = 'flying';

    this.ui.lockControls(true);
    this.ui.setButtons({ canLaunch: false, canPause: true, canResume: false });
    this.ui.setStatus('در حال پرواز', '#60a5fa');
  }

  pause() {
    if (this.state !== 'flying') return;
    this.state = 'paused';
    this.ui.setButtons({ canLaunch: false, canPause: false, canResume: true });
    this.ui.setStatus('متوقف', '#f59e0b');
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'flying';
    this.ui.setButtons({ canLaunch: false, canPause: true, canResume: false });
    this.ui.setStatus('در حال پرواز', '#60a5fa');
  }

  restart() {
    this.state = 'ready';
    const settings = this.ui.getSettings();
    this.rocketType = ROCKET_TYPES[settings.rocketType] || ROCKET_TYPES.basic;
    this.physics.reset(settings.angle, settings.power, this.rocketType);
    this.trail = [];
    this.lastImpact = null;
    this.explosion.clear();
    this.renderer.cameraX = 0;
    this.renderer.cameraY = 0;
    this.renderer.zoom = 1;

    this.ui.lockControls(false);
    this.ui.setButtons({ canLaunch: true, canPause: false, canResume: false });
    this.ui.setStatus('آماده', '#22c55e');
    this.ui.updateStats(this.physics.getState());
  }

  _updatePhysics(dt) {
    if (this.state !== 'flying') return;

    const result = this.physics.update(dt);
    const state = this.physics.getState();

    // Trail
    if (state.alive) {
      this.trail.push({ x: state.x, y: state.y });
      const maxTrail = this.renderer.quality.trailLength || 20;
      if (this.trail.length > maxTrail) this.trail.shift();
    }

    if (result && result.impact) {
      this.state = 'exploded';
      const intensity = Math.min(2.8, 0.7 + result.speed / 40);
      this.explosion.explode(result.x, result.y, intensity);
      this.lastImpact = { x: result.x, y: result.y };
      this.ui.setButtons({ canLaunch: false, canPause: false, canResume: false });
      this.ui.setStatus('انفجار!', '#ef4444');
      this.ui.lockControls(false);
    } else if (!state.alive && !state.exploded) {
      this.state = 'ready';
      this.ui.setButtons({ canLaunch: true, canPause: false, canResume: false });
      this.ui.setStatus('پایان پرواز', '#94a3b8');
      this.ui.lockControls(false);
    }

    this.ui.updateStats(state);
  }

  loop(timestamp) {
    this.rafId = requestAnimationFrame((t) => this.loop(t));

    if (!this.lastTime) this.lastTime = timestamp;
    let frameDt = (timestamp - this.lastTime) / 1000;
    this.lastTime = timestamp;

    // Clamp large dt (tab switch)
    if (frameDt > 0.1) frameDt = 0.1;

    if (this.state === 'flying' || this.state === 'paused') {
      // Fixed step for physics only when flying
      if (this.state === 'flying') {
        this.accum += frameDt;
        while (this.accum >= this.fixedDt) {
          this._updatePhysics(this.fixedDt);
          this.accum -= this.fixedDt;
        }
      }
    }

    // Always update particles (even when paused so explosion can finish)
    this.explosion.update(frameDt);

    // Render
    const state = this.physics.getState();
    const shake = this.explosion.getShakeOffset();
    this.renderer.updateCamera(state, shake, frameDt);
    this.renderer.clear(this.explosion.getLightFlash());
    this.renderer.drawEnvironment(frameDt);

    if (this.lastImpact) {
      this.renderer.drawImpactMarker(this.lastImpact.x, this.lastImpact.y);
    }

    this.renderer.drawRocket(state, this.rocketType, this.trail);
    this.renderer.drawParticles(this.explosion.getParticles());
  }
}

// Start
new Game();
