export class UI {
  constructor(callbacks) {
    this.cb = callbacks;
    this.elements = {
      altitude: document.getElementById('altitude'),
      velocity: document.getElementById('velocity'),
      acceleration: document.getElementById('acceleration'),
      flightTime: document.getElementById('flightTime'),
      enginePower: document.getElementById('enginePower'),
      launchAngle: document.getElementById('launchAngle'),
      rocketStatus: document.getElementById('rocketStatus'),
      qualityLevel: document.getElementById('qualityLevel'),
      rocketType: document.getElementById('rocketType'),
      angleSlider: document.getElementById('angleSlider'),
      angleValue: document.getElementById('angleValue'),
      powerSlider: document.getElementById('powerSlider'),
      powerValue: document.getElementById('powerValue'),
      qualitySelect: document.getElementById('qualitySelect'),
      launchBtn: document.getElementById('launchBtn'),
      pauseBtn: document.getElementById('pauseBtn'),
      resumeBtn: document.getElementById('resumeBtn'),
      restartBtn: document.getElementById('restartBtn'),
      controlPanel: document.getElementById('controlPanel'),
      toggleControls: document.getElementById('toggleControls')
    };

    this._bind();
  }

  _bind() {
    const e = this.elements;

    e.angleSlider.addEventListener('input', () => {
      const v = e.angleSlider.value;
      e.angleValue.textContent = v + '°';
      e.launchAngle.textContent = v + '°';
      this.cb.onAngleChange?.(Number(v));
    });

    e.powerSlider.addEventListener('input', () => {
      const v = e.powerSlider.value;
      e.powerValue.textContent = v + '%';
      e.enginePower.textContent = v + '%';
      this.cb.onPowerChange?.(Number(v));
    });

    e.rocketType.addEventListener('change', () => {
      this.cb.onRocketTypeChange?.(e.rocketType.value);
    });

    e.qualitySelect.addEventListener('change', () => {
      this.cb.onQualityChange?.(e.qualitySelect.value);
      e.qualityLevel.textContent = e.qualitySelect.options[e.qualitySelect.selectedIndex].text;
    });

    e.launchBtn.addEventListener('click', () => this.cb.onLaunch?.());
    e.pauseBtn.addEventListener('click', () => this.cb.onPause?.());
    e.resumeBtn.addEventListener('click', () => this.cb.onResume?.());
    e.restartBtn.addEventListener('click', () => this.cb.onRestart?.());

    e.toggleControls.addEventListener('click', () => {
      e.controlPanel.classList.toggle('hidden-mobile');
    });
  }

  updateStats(state) {
    if (!state) return;
    const e = this.elements;
    e.altitude.textContent = Math.round(state.altitude) + ' m';
    e.velocity.textContent = state.speed.toFixed(1) + ' m/s';
    const accel = Math.sqrt(state.ax * state.ax + state.ay * state.ay);
    e.acceleration.textContent = accel.toFixed(1) + ' m/s²';
    e.flightTime.textContent = state.flightTime.toFixed(1) + ' s';
  }

  setStatus(text, color) {
    const el = this.elements.rocketStatus;
    el.textContent = text;
    if (color) el.style.color = color;
    else el.style.color = '';
  }

  setButtons({ canLaunch, canPause, canResume }) {
    this.elements.launchBtn.disabled = !canLaunch;
    this.elements.pauseBtn.disabled = !canPause;
    this.elements.resumeBtn.disabled = !canResume;
  }

  lockControls(lock) {
    this.elements.angleSlider.disabled = lock;
    this.elements.powerSlider.disabled = lock;
    this.elements.rocketType.disabled = lock;
  }

  getSettings() {
    return {
      angle: Number(this.elements.angleSlider.value),
      power: Number(this.elements.powerSlider.value),
      rocketType: this.elements.rocketType.value,
      quality: this.elements.qualitySelect.value
    };
  }
}
