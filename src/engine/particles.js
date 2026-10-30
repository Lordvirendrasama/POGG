// Particle & Visual FX System with Electric Lightning, Floating Combat Text, and Shockwaves

export class ParticleSystem {
  constructor() {
    this.particles = [];
    this.shockwaves = [];
    this.floatingTexts = [];
    this.lightningArcs = [];
  }

  reset() {
    this.particles = [];
    this.shockwaves = [];
    this.floatingTexts = [];
    this.lightningArcs = [];
  }

  // Create sparks on ball-striker or ball-wall collision
  emitSparks(x, y, count = 15, color = '#ffe600', speedMult = 1.0) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (2.5 + Math.random() * 7) * speedMult;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 2.5 + Math.random() * 3.5,
        alpha: 1.0,
        decay: 0.02 + Math.random() * 0.025,
        color,
        glow: true,
      });
    }
  }

  // Alias for paddle impact sparks
  emitImpactSparks(x, y, color = '#00f0ff', count = 10) {
    this.emitSparks(x, y, count, color, 1.0);
  }

  // Directional sparks when bouncing off wall
  emitWallSparks(x, y, normalX, normalY, count = 14, color = '#00f0ff') {
    const baseAngle = Math.atan2(normalY, normalX);
    for (let i = 0; i < count; i++) {
      const angle = baseAngle + (Math.random() - 0.5) * 1.6;
      const speed = 2.5 + Math.random() * 6;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 2 + Math.random() * 3,
        alpha: 1.0,
        decay: 0.025 + Math.random() * 0.02,
        color,
        glow: true,
      });
    }
  }

  // Hovercraft Thruster Jet Exhaust Plume
  emitThrusterJet(x, y, dirX, dirY, color = '#00f0ff') {
    const angle = Math.atan2(dirY, dirX) + (Math.random() - 0.5) * 0.45;
    const speed = 2 + Math.random() * 5;
    this.particles.push({
      x: x + (Math.random() - 0.5) * 8,
      y: y + (Math.random() - 0.5) * 8,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: 3 + Math.random() * 4,
      alpha: 0.85,
      decay: 0.08 + Math.random() * 0.05,
      color,
      glow: true,
    });
  }

  // Micro Sparks streaming off the ball in Tier 3/4
  emitBallExhaust(x, y, color = '#ffe600') {
    this.particles.push({
      x: x + (Math.random() - 0.5) * 6,
      y: y + (Math.random() - 0.5) * 6,
      vx: (Math.random() - 0.5) * 2,
      vy: (Math.random() - 0.5) * 2,
      radius: 1.8 + Math.random() * 2.2,
      alpha: 0.75,
      decay: 0.06 + Math.random() * 0.04,
      color,
      glow: true,
    });
  }

  // Glass-shattering polygonal neon shards on goals or shield breaks
  emitShatterGlass(x, y, color = '#00f0ff', count = 14) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 7;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 3 + Math.random() * 5,
        rotation: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 0.25,
        alpha: 1.0,
        decay: 0.035 + Math.random() * 0.02,
        color,
        isShard: true,
        glow: true,
      });
    }
  }

  // Large smash impact burst (Clean, controlled)
  emitSmashBurst(x, y, color = '#ff007f') {
    this.emitShockwave(x, y, color, 110, 4);
    this.emitSparks(x, y, 16, '#ffffff', 1.3);
    this.emitSparks(x, y, 12, color, 1.1);
    this.emitShatterGlass(x, y, color, 8);
  }

  // Floating Arcade Combat Text (e.g. "⚡ SMASH! +300 KM/H", "🔥 PARRY!")
  emitFloatingText(x, y, text, color = '#ffe600', size = 26) {
    this.floatingTexts.push({
      x,
      y: y - 10,
      vy: -1.8,
      text,
      color,
      size,
      alpha: 1.0,
      scale: 1.6,
      decay: 0.022,
    });
  }

  // Electric Lightning Arcs for High-Speed Ball Tiers
  emitLightningArc(x1, y1, x2, y2, color = '#00f0ff') {
    const points = [{ x: x1, y: y1 }];
    const segments = 6;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.hypot(dx, dy);
    const normalX = -dy / dist;
    const normalY = dx / dist;

    for (let i = 1; i < segments; i++) {
      const progress = i / segments;
      const jitter = (Math.random() - 0.5) * 28;
      points.push({
        x: x1 + dx * progress + normalX * jitter,
        y: y1 + dy * progress + normalY * jitter,
      });
    }
    points.push({ x: x2, y: y2 });

    this.lightningArcs.push({
      points,
      color,
      alpha: 1.0,
      lineWidth: 2.5 + Math.random() * 2,
      decay: 0.12,
    });
  }

  // Controlled goal celebration burst
  emitGoalBurst(x, y, isPlayer1Goal) {
    const primary = isPlayer1Goal ? '#00f0ff' : '#ff007f';
    const secondary = '#ffe600';
    for (let i = 0; i < 45; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2.5 + Math.random() * 8;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 2.5 + Math.random() * 4,
        alpha: 1.0,
        decay: 0.025 + Math.random() * 0.018,
        color: Math.random() > 0.4 ? primary : secondary,
        glow: true,
      });
    }

    this.shockwaves.push({
      x,
      y,
      radius: 8,
      maxRadius: 220,
      alpha: 1.0,
      decay: 0.035,
      color: primary,
      lineWidth: 5,
    });
  }

  // Expanding impact shockwave
  emitShockwave(x, y, color = '#ffffff', maxR = 140, lineWidth = 5) {
    this.shockwaves.push({
      x,
      y,
      radius: 6,
      maxRadius: maxR,
      alpha: 1.0,
      decay: 0.045,
      color,
      lineWidth,
    });
  }

  // Update physics and lifetimes
  update() {
    // Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.95;
      p.vy *= 0.95;
      if (p.isShard) {
        p.rotation = (p.rotation || 0) + (p.vRot || 0.1);
      }
      p.alpha -= p.decay;
      p.radius *= 0.96;

      if (p.alpha <= 0 || p.radius < 0.5) {
        this.particles.splice(i, 1);
      }
    }

    // Update shockwaves
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const s = this.shockwaves[i];
      s.radius += (s.maxRadius - s.radius) * 0.22;
      s.alpha -= s.decay;
      s.lineWidth *= 0.95;

      if (s.alpha <= 0 || s.radius >= s.maxRadius * 0.95) {
        this.shockwaves.splice(i, 1);
      }
    }

    // Update floating combat texts
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const t = this.floatingTexts[i];
      t.y += t.vy;
      t.scale += (1.0 - t.scale) * 0.18;
      t.alpha -= t.decay;
      if (t.alpha <= 0) {
        this.floatingTexts.splice(i, 1);
      }
    }

    // Update lightning arcs
    for (let i = this.lightningArcs.length - 1; i >= 0; i--) {
      const l = this.lightningArcs[i];
      l.alpha -= l.decay;
      if (l.alpha <= 0) {
        this.lightningArcs.splice(i, 1);
      }
    }
  }

  // Render on canvas
  render(ctx) {
    ctx.save();

    // 1. Render Shockwaves
    for (const s of this.shockwaves) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.lineWidth;
      ctx.globalAlpha = Math.max(0, s.alpha);
      ctx.shadowColor = s.color;
      ctx.shadowBlur = 20;
      ctx.stroke();
      ctx.restore();
    }

    // 2. Render Lightning Arcs
    for (const l of this.lightningArcs) {
      if (l.points.length < 2) continue;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(l.points[0].x, l.points[0].y);
      for (let i = 1; i < l.points.length; i++) {
        ctx.lineTo(l.points[i].x, l.points[i].y);
      }
      ctx.strokeStyle = l.color;
      ctx.lineWidth = l.lineWidth;
      ctx.globalAlpha = Math.max(0, l.alpha);
      ctx.shadowColor = l.color;
      ctx.shadowBlur = 18;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.restore();
    }

    // 3. Render Particles & Shards
    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      if (p.glow) {
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 14;
      }

      if (p.isShard) {
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation || 0);
        ctx.beginPath();
        ctx.moveTo(0, -p.radius);
        ctx.lineTo(p.radius * 0.7, p.radius * 0.8);
        ctx.lineTo(-p.radius * 0.7, p.radius * 0.8);
        ctx.closePath();
        ctx.fillStyle = p.color;
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
      }

      ctx.restore();
    }

    // 4. Render Floating Combat Text
    for (const t of this.floatingTexts) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, t.alpha);
      ctx.font = `900 ${Math.round(t.size * t.scale)}px Orbitron, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = t.color;
      ctx.shadowBlur = 24;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(t.text, t.x, t.y);
      ctx.strokeStyle = t.color;
      ctx.lineWidth = 2;
      ctx.strokeText(t.text, t.x, t.y);
      ctx.restore();
    }

    ctx.restore();
  }
}
