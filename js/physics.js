import { PHYSICS } from './config.js';

export class RocketPhysics {
  constructor() {
    this.reset();
  }

  reset(angleDeg = 90, power = 100, rocketType = null) {
    this.angle = (angleDeg * Math.PI) / 180;
    this.power = power / 100;
    this.rocketType = rocketType;

    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.ax = 0;
    this.ay = 0;

    this.alive = true;
    this.exploded = false;
    this.flightTime = 0;
    this.altitude = 0;
    this.maxAltitude = 0;
    this.speed = 0;
    this.thrustActive = false;
    this.fuel = 1.0;
    this.mass = rocketType ? rocketType.mass : 1.0;
  }

  launch() {
    this.thrustActive = true;
    this.alive = true;
    this.exploded = false;
    this.flightTime = 0;
  }

  update(dt) {
    if (!this.alive || this.exploded) return;

    this.flightTime += dt;

    const type = this.rocketType || { thrustMult: 1, dragMult: 1, mass: 1 };
    let thrustX = 0;
    let thrustY = 0;

    if (this.thrustActive && this.fuel > 0) {
      const thrustForce = PHYSICS.thrustBase * this.power * type.thrustMult;
      thrustX = Math.cos(this.angle) * thrustForce;
      thrustY = Math.sin(this.angle) * thrustForce;
      this.fuel -= PHYSICS.fuelBurnRate * this.power * dt;
      if (this.fuel <= 0) {
        this.fuel = 0;
        this.thrustActive = false;
      }
    } else {
      this.thrustActive = false;
    }

    // Drag
    const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    this.speed = speed;
    let dragX = 0;
    let dragY = 0;
    if (speed > 0.1) {
      const dragCoeff = 0.08 * type.dragMult;
      const dragMag = dragCoeff * speed * speed;
      dragX = -(this.vx / speed) * dragMag;
      dragY = -(this.vy / speed) * dragMag;
    }

    // Net acceleration
    const mass = Math.max(0.4, type.mass * (0.55 + 0.45 * this.fuel));
    this.ax = (thrustX + dragX) / mass;
    this.ay = (thrustY + dragY) / mass - PHYSICS.gravity;

    // Integrate
    this.vx += this.ax * dt;
    this.vy += this.ay * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    this.altitude = Math.max(0, this.y);
    if (this.altitude > this.maxAltitude) this.maxAltitude = this.altitude;

    // Ground collision
    if (this.y <= PHYSICS.groundY && this.flightTime > 0.15) {
      this.y = PHYSICS.groundY;
      const impactSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
      this.alive = false;
      this.exploded = true;
      return { impact: true, speed: impactSpeed, x: this.x, y: this.y };
    }

    // Out of bounds / too long
    if (this.flightTime > PHYSICS.maxSimTime || this.y > 8000 || Math.abs(this.x) > 12000) {
      this.alive = false;
      return { impact: false };
    }

    return null;
  }

  getState() {
    return {
      x: this.x,
      y: this.y,
      vx: this.vx,
      vy: this.vy,
      ax: this.ax,
      ay: this.ay,
      altitude: this.altitude,
      speed: this.speed,
      flightTime: this.flightTime,
      thrustActive: this.thrustActive,
      fuel: this.fuel,
      angle: this.angle,
      alive: this.alive,
      exploded: this.exploded
    };
  }
}
