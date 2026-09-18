export const QUALITY_SETTINGS = {
  low: {
    name: 'Low',
    maxParticles: 180,
    fireballLayers: 2,
    sparkCount: 25,
    smokeCount: 20,
    debrisCount: 8,
    emberCount: 15,
    shockwave: true,
    cameraShake: true,
    trailLength: 12,
    cloudCount: 4
  },
  medium: {
    name: 'Medium',
    maxParticles: 420,
    fireballLayers: 3,
    sparkCount: 55,
    smokeCount: 45,
    debrisCount: 14,
    emberCount: 30,
    shockwave: true,
    cameraShake: true,
    trailLength: 20,
    cloudCount: 6
  },
  high: {
    name: 'High',
    maxParticles: 750,
    fireballLayers: 4,
    sparkCount: 90,
    smokeCount: 70,
    debrisCount: 22,
    emberCount: 50,
    shockwave: true,
    cameraShake: true,
    trailLength: 28,
    cloudCount: 8
  },
  ultra: {
    name: 'Ultra',
    maxParticles: 1200,
    fireballLayers: 5,
    sparkCount: 140,
    smokeCount: 110,
    debrisCount: 35,
    emberCount: 80,
    shockwave: true,
    cameraShake: true,
    trailLength: 40,
    cloudCount: 12
  }
};

export const ROCKET_TYPES = {
  basic: {
    name: 'راکت پایه',
    mass: 1.0,
    thrustMult: 1.0,
    dragMult: 1.0,
    color: '#e2e8f0',
    finColor: '#3b82f6',
    size: 1.0
  },
  heavy: {
    name: 'راکت سنگین',
    mass: 1.6,
    thrustMult: 1.35,
    dragMult: 1.25,
    color: '#cbd5e1',
    finColor: '#ef4444',
    size: 1.25
  },
  lightweight: {
    name: 'راکت سبک',
    mass: 0.65,
    thrustMult: 0.85,
    dragMult: 0.7,
    color: '#f1f5f9',
    finColor: '#22c55e',
    size: 0.85
  }
};

export const PHYSICS = {
  gravity: 9.81,
  airDensity: 1.225,
  groundY: 0,
  maxSimTime: 120,
  thrustBase: 240,
  fuelBurnRate: 0.18
};
