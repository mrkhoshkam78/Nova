/**
 * Kingdom Forge Graphics Engine v1.0
 * موتور گرافیکی پیشرفته فقط برای رندر ایزومتریک با کیفیت ۴K
 * - سایه‌های نرم، نورپردازی دینامیک، جزئیات بالا، هایلایت و عمق
 * - کاملاً جدا از منطق بازی
 */
(() => {
  'use strict';

  const Engine = {
    // تنظیمات کیفیت (۴K feel)
    quality: {
      shadowBlur: 18,
      softShadow: true,
      ambientLight: 0.72,
      lightDir: { x: -0.55, y: -0.75 }, // جهت نور خورشید
      tileDetail: true,
      buildingDetail: true,
      antiAlias: true,
      particleDensity: 0.35
    },

    // پالت رنگی غنی‌تر
    colors: {
      grassA: '#7cb05a',
      grassB: '#6fa34e',
      grassHighlight: '#9ed06e',
      grassDark: '#4e7a3a',
      soil: '#5c4a32',
      wood: '#6b4a2e',
      woodDark: '#4a3220',
      stone: '#8a9a8e',
      stoneDark: '#5a6a5e',
      roofGold: '#d4a84b',
      roofCyan: '#3ec9d0',
      roofGray: '#7a8a84',
      roofBrown: '#a67c4a',
      metal: '#9aa8a0',
      flag: '#c43c2e'
    },

    // پروجکشن ایزومتریک پیشرفته (با ارتفاع و عمق بهتر)
    project(a, b, y = 0, rot = 0, zoom = 1, canvas) {
      const A = rot * Math.PI / 2;
      const u = a * Math.cos(A) - b * Math.sin(A);
      const v = a * Math.sin(A) + b * Math.cos(A);
      const s = Math.min(canvas.clientWidth, canvas.clientHeight) * 0.078 * zoom;
      return {
        x: canvas.clientWidth * 0.5 + (u - v) * s * 0.97,
        y: canvas.clientHeight * 0.50 + (u + v) * s * 0.48 - y * zoom * 1.05,
        depth: u + v
      };
    },

    // رسم چندضلعی با سایه و گرادیان
    poly(ctx, points, fill, stroke = null, lineW = 1.2) {
      if (!points || points.length < 3) return;
      ctx.beginPath();
      points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
      ctx.closePath();
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineW;
        ctx.stroke();
      }
    },

    // سایه نرم زیر ساختمان
    softShadow(ctx, x, y, w, h, alpha = 0.28) {
      if (!this.quality.softShadow) return;
      ctx.save();
      ctx.globalAlpha = alpha;
      const g = ctx.createRadialGradient(x, y, 2, x, y + h * 0.15, w * 0.7);
      g.addColorStop(0, 'rgba(0,0,0,0.55)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, y + 4, w * 0.55, h * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    },

    // کاشی زمین با جزئیات و نور
    drawTile(ctx, a, b, rot, zoom, canvas, isEven) {
      const p0 = this.project(a, b, 0, rot, zoom, canvas);
      const p1 = this.project(a + 1, b, 0, rot, zoom, canvas);
      const p2 = this.project(a + 1, b + 1, 0, rot, zoom, canvas);
      const p3 = this.project(a, b + 1, 0, rot, zoom, canvas);

      // گرادیان نور روی کاشی
      const midX = (p0.x + p2.x) / 2;
      const midY = (p0.y + p2.y) / 2;
      const g = ctx.createLinearGradient(p0.x, p0.y, p2.x, p2.y);
      if (isEven) {
        g.addColorStop(0, this.colors.grassA);
        g.addColorStop(0.55, this.colors.grassHighlight);
        g.addColorStop(1, this.colors.grassB);
      } else {
        g.addColorStop(0, this.colors.grassB);
        g.addColorStop(0.45, '#78a85a');
        g.addColorStop(1, this.colors.grassA);
      }
      this.poly(ctx, [p0, p1, p2, p3], g, 'rgba(60,100,45,0.35)', 0.8);

      // خطوط جزئیات خیلی ظریف (برای حس ۴K)
      if (this.quality.tileDetail && zoom > 0.7) {
        ctx.save();
        ctx.globalAlpha = 0.12;
        ctx.strokeStyle = '#2a4a22';
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        ctx.restore();
      }
    },

    // درخت با حجم و سایه
    drawTree(ctx, a, b, rot, zoom, canvas) {
      const q = this.project(a, b, 0, rot, zoom, canvas);
      const s = zoom;

      // سایه
      this.softShadow(ctx, q.x, q.y + 6, 28 * s, 18 * s, 0.22);

      // تنه
      const trunkG = ctx.createLinearGradient(q.x - 4, q.y, q.x + 4, q.y);
      trunkG.addColorStop(0, '#5a3a22');
      trunkG.addColorStop(0.5, '#7a5230');
      trunkG.addColorStop(1, '#4a2e18');
      ctx.fillStyle = trunkG;
      ctx.fillRect(q.x - 3.5 * s, q.y - 16 * s, 7 * s, 22 * s);

      // لایه‌های تاج
      const layers = [
        { y: -22, r: 15, c: '#2d5a32' },
        { y: -30, r: 13, c: '#3a7040' },
        { y: -37, r: 10, c: '#4a8848' },
        { y: -43, r: 7,  c: '#5a9a55' }
      ];
      layers.forEach(L => {
        ctx.beginPath();
        ctx.arc(q.x, q.y + L.y * s, L.r * s, 0, Math.PI * 2);
        const lg = ctx.createRadialGradient(q.x - 3, q.y + L.y * s - 4, 1, q.x, q.y + L.y * s, L.r * s);
        lg.addColorStop(0, L.c);
        lg.addColorStop(1, '#1e3a22');
        ctx.fillStyle = lg;
        ctx.fill();
        ctx.strokeStyle = 'rgba(20,40,25,0.4)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
      });
    },

    // سنگ با حجم
    drawRock(ctx, a, b, rot, zoom, canvas) {
      const q = this.project(a, b, 0, rot, zoom, canvas);
      const s = zoom;
      this.softShadow(ctx, q.x, q.y + 4, 26 * s, 14 * s, 0.25);

      const pts = [
        { x: q.x - 14 * s, y: q.y },
        { x: q.x - 8 * s,  y: q.y - 14 * s },
        { x: q.x + 4 * s,  y: q.y - 18 * s },
        { x: q.x + 15 * s, y: q.y - 6 * s },
        { x: q.x + 12 * s, y: q.y + 4 * s },
        { x: q.x - 5 * s,  y: q.y + 6 * s }
      ];
      const g = ctx.createLinearGradient(q.x - 10, q.y - 18, q.x + 10, q.y + 6);
      g.addColorStop(0, '#a8b5ae');
      g.addColorStop(0.5, '#7a8a82');
      g.addColorStop(1, '#4a5a52');
      this.poly(ctx, pts, g, '#3a4a42', 1.1);

      // هایلایت
      ctx.beginPath();
      ctx.moveTo(q.x - 6 * s, q.y - 12 * s);
      ctx.lineTo(q.x + 2 * s, q.y - 15 * s);
      ctx.lineTo(q.x + 5 * s, q.y - 8 * s);
      ctx.strokeStyle = 'rgba(220,230,220,0.35)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    },

    // ساختمان‌های با جزئیات ۳D واقعی‌تر
    drawBuilding(ctx, o, defs, rot, zoom, canvas) {
      const d = defs[o.type];
      const q = this.project(o.x, o.z, 0, rot, zoom, canvas);
      const s = zoom;
      const w = o.type === 'wall' ? 30 : 42;
      const h = d.h * s;

      // سایه نرم
      this.softShadow(ctx, q.x, q.y + 8, w * 1.1, 22, 0.32);

      if (o.type === 'wall') {
        // دیوار سه‌بعدی
        const left = [
          { x: q.x - w / 2, y: q.y - 8 * s },
          { x: q.x, y: q.y - 15 * s },
          { x: q.x, y: q.y + 2 * s },
          { x: q.x - w / 2, y: q.y + 4 * s }
        ];
        const right = [
          { x: q.x, y: q.y - 15 * s },
          { x: q.x + w / 2, y: q.y - 8 * s },
          { x: q.x + w / 2, y: q.y + 4 * s },
          { x: q.x, y: q.y + 2 * s }
        ];
        const top = [
          { x: q.x - w / 2, y: q.y - 8 * s },
          { x: q.x, y: q.y - 15 * s },
          { x: q.x + w / 2, y: q.y - 8 * s },
          { x: q.x, y: q.y - 2 * s }
        ];
        this.poly(ctx, left, '#6a7d72', '#3a4a42');
        this.poly(ctx, right, '#8a9d92', '#4a5a52');
        this.poly(ctx, top, '#a8b8aa', '#5a6a5e');
        // جزئیات سنگ
        ctx.strokeStyle = 'rgba(40,50,45,0.4)';
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(q.x - w / 4, q.y - 6 * s);
        ctx.lineTo(q.x - w / 4, q.y + 1 * s);
        ctx.moveTo(q.x + w / 4, q.y - 6 * s);
        ctx.lineTo(q.x + w / 4, q.y + 1 * s);
        ctx.stroke();
        return;
      }

      // بدنه اصلی (چپ و راست)
      const leftFace = [
        { x: q.x - w / 2, y: q.y - h * 0.38 },
        { x: q.x, y: q.y - h * 0.38 + 14 * s },
        { x: q.x, y: q.y + 14 * s },
        { x: q.x - w / 2, y: q.y }
      ];
      const rightFace = [
        { x: q.x, y: q.y - h * 0.38 + 14 * s },
        { x: q.x + w / 2, y: q.y - h * 0.38 },
        { x: q.x + w / 2, y: q.y },
        { x: q.x, y: q.y + 14 * s }
      ];

      // گرادیان چپ (تاریک‌تر)
      const leftG = ctx.createLinearGradient(q.x - w / 2, q.y, q.x, q.y);
      leftG.addColorStop(0, '#5a452e');
      leftG.addColorStop(1, '#7a5a38');
      this.poly(ctx, leftFace, leftG, '#3a2e1e', 1);

      // گرادیان راست (روشن‌تر)
      const rightG = ctx.createLinearGradient(q.x, q.y, q.x + w / 2, q.y);
      rightG.addColorStop(0, '#8a6a42');
      rightG.addColorStop(1, '#6a4a2e');
      this.poly(ctx, rightFace, rightG, '#3a2e1e', 1);

      // سقف با رنگ مخصوص هر ساختمان
      const roofPts = [
        { x: q.x - w / 2, y: q.y - h * 0.38 },
        { x: q.x, y: q.y - h * 0.38 - 16 * s },
        { x: q.x + w / 2, y: q.y - h * 0.38 },
        { x: q.x, y: q.y - h * 0.38 + 14 * s }
      ];
      const roofG = ctx.createLinearGradient(q.x, q.y - h * 0.55, q.x, q.y - h * 0.2);
      roofG.addColorStop(0, this._lighten(d.color, 25));
      roofG.addColorStop(0.6, d.color);
      roofG.addColorStop(1, this._darken(d.color, 20));
      this.poly(ctx, roofPts, roofG, '#2a2218', 1.2);

      // خط سقف برای عمق
      ctx.beginPath();
      ctx.moveTo(q.x - w / 2 + 2, q.y - h * 0.38);
      ctx.lineTo(q.x, q.y - h * 0.38 - 14 * s);
      ctx.lineTo(q.x + w / 2 - 2, q.y - h * 0.38);
      ctx.strokeStyle = 'rgba(255,240,200,0.25)';
      ctx.lineWidth = 1.4;
      ctx.stroke();

      // آیکون
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 4;
      ctx.fillStyle = '#fff8e0';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `bold ${Math.max(13, 15 * s)}px system-ui, sans-serif`;
      ctx.fillText(d.icon, q.x, q.y - h * 0.52);
      ctx.restore();

      // جزئیات مخصوص هر نوع
      if (o.type === 'townhall') {
        // پرچم
        ctx.fillStyle = this.colors.flag;
        ctx.fillRect(q.x - 2 * s, q.y - h * 0.72, 4 * s, 18 * s);
        ctx.beginPath();
        ctx.moveTo(q.x + 2 * s, q.y - h * 0.72);
        ctx.lineTo(q.x + 14 * s, q.y - h * 0.68);
        ctx.lineTo(q.x + 2 * s, q.y - h * 0.62);
        ctx.fillStyle = '#e8c050';
        ctx.fill();
        // پنجره‌ها
        ctx.fillStyle = '#f0d878';
        ctx.fillRect(q.x - 8 * s, q.y - h * 0.25, 5 * s, 6 * s);
        ctx.fillRect(q.x + 3 * s, q.y - h * 0.25, 5 * s, 6 * s);
      }

      if (o.type === 'diamondmine') {
        // کریستال روی سقف
        ctx.beginPath();
        ctx.moveTo(q.x, q.y - h * 0.55);
        ctx.lineTo(q.x - 7 * s, q.y - h * 0.42);
        ctx.lineTo(q.x, q.y - h * 0.38);
        ctx.lineTo(q.x + 7 * s, q.y - h * 0.42);
        ctx.closePath();
        const cry = ctx.createLinearGradient(q.x, q.y - h * 0.55, q.x, q.y - h * 0.35);
        cry.addColorStop(0, '#a0f8ff');
        cry.addColorStop(1, '#28a8b0');
        ctx.fillStyle = cry;
        ctx.fill();
        ctx.strokeStyle = '#106070';
        ctx.stroke();
      }

      if (o.type === 'cannon') {
        // لوله توپ
        ctx.fillStyle = '#4a5a52';
        ctx.fillRect(q.x - 3 * s, q.y - h * 0.48, 6 * s, 12 * s);
        ctx.beginPath();
        ctx.arc(q.x, q.y - h * 0.5, 5 * s, 0, Math.PI * 2);
        ctx.fillStyle = '#6a7a72';
        ctx.fill();
      }

      if (o.type === 'barracks') {
        // سپر کوچک
        ctx.beginPath();
        ctx.moveTo(q.x, q.y - h * 0.48);
        ctx.lineTo(q.x - 6 * s, q.y - h * 0.38);
        ctx.lineTo(q.x, q.y - h * 0.32);
        ctx.lineTo(q.x + 6 * s, q.y - h * 0.38);
        ctx.closePath();
        ctx.fillStyle = '#c05040';
        ctx.fill();
      }
    },

    // آسمان و پس‌زمینه غنی
    drawSky(ctx, w, h) {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#8ec4e8');
      g.addColorStop(0.35, '#b8d878');
      g.addColorStop(0.7, '#6a9a52');
      g.addColorStop(1, '#3a6a3a');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // نور خورشید نرم
      const sun = ctx.createRadialGradient(w * 0.72, h * 0.18, 10, w * 0.72, h * 0.18, 180);
      sun.addColorStop(0, 'rgba(255,240,180,0.35)');
      sun.addColorStop(0.5, 'rgba(255,220,120,0.12)');
      sun.addColorStop(1, 'rgba(255,200,80,0)');
      ctx.fillStyle = sun;
      ctx.fillRect(0, 0, w, h);
    },

    // حلقه مرکز فرماندهی
    drawCenterRing(ctx, center, zoom) {
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(center.x, center.y + 18, 110 * zoom, 38 * zoom, 0, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(220,210,140,0.45)';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([6, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
      // حلقه داخلی
      ctx.beginPath();
      ctx.ellipse(center.x, center.y + 18, 95 * zoom, 32 * zoom, 0, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,240,180,0.18)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    },

    // ذرات شناور خیلی ظریف (گرده / نور)
    drawAmbientParticles(ctx, w, h, time) {
      if (!this.quality.particleDensity) return;
      ctx.save();
      ctx.globalAlpha = 0.18;
      for (let i = 0; i < 18; i++) {
        const x = (Math.sin(time * 0.0003 + i * 1.7) * 0.5 + 0.5) * w;
        const y = (Math.cos(time * 0.00025 + i * 2.1) * 0.5 + 0.5) * h * 0.7;
        const r = 1.2 + Math.sin(time * 0.001 + i) * 0.8;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = i % 3 === 0 ? '#ffe8a0' : '#c8e8a0';
        ctx.fill();
      }
      ctx.restore();
    },

    // کمک‌کننده‌های رنگ
    _lighten(hex, percent) {
      const num = parseInt(hex.replace('#', ''), 16);
      const r = Math.min(255, (num >> 16) + percent);
      const g = Math.min(255, ((num >> 8) & 0x00FF) + percent);
      const b = Math.min(255, (num & 0x0000FF) + percent);
      return `rgb(${r},${g},${b})`;
    },
    _darken(hex, percent) {
      const num = parseInt(hex.replace('#', ''), 16);
      const r = Math.max(0, (num >> 16) - percent);
      const g = Math.max(0, ((num >> 8) & 0x00FF) - percent);
      const b = Math.max(0, (num & 0x0000FF) - percent);
      return `rgb(${r},${g},${b})`;
    }
  };

  // اکسپورت به گلوبال
  window.KFGraphics = Engine;
})();
