// Dynamic Power-Up System for Neon Kinetic Clash
import { assets } from './assets.js';

export const POWERUP_TYPES = {
  OVERDRIVE: {
    id: 'OVERDRIVE',
    name: 'Overdrive',
    symbol: '⚡',
    color: '#ff9900',
    duration: 6000,
    desc: 'Hyper-speed plasma orb',
  },
  MULTIBALL: {
    id: 'MULTIBALL',
    name: 'Multiball',
    symbol: '🔮',
    color: '#d000ff',
    duration: 10000,
    desc: 'Splits orb into 3 balls!',
  },
  SHIELD: {
    id: 'SHIELD',
    name: 'Titan Shield',
    symbol: '🛡️',
    color: '#00f0ff',
    duration: 8500,
    desc: 'Goal line laser barrier',
  },
  FREEZE: {
    id: 'FREEZE',
    name: 'Cryo Freeze',
    symbol: '❄️',
    color: '#38bdf8',
    duration: 4500,
    desc: 'Slows opponent striker',
  },
  VORTEX: {
    id: 'VORTEX',
    name: 'Vortex',
    symbol: '🌌',
    color: '#a855f7',
    duration: 8000,
    desc: 'Gravitational singularity',
  },
  BLASTER: {
    id: 'BLASTER',
    name: 'Laser Blaster',
    symbol: '🔫',
    color: '#ef4444',
    duration: 6000,
    desc: 'Tap to fire pulse cannons',
  },
  CURVEBALL: {
    id: 'CURVEBALL',
    name: 'Curveball',
    symbol: '🌀',
    color: '#06b6d4',
    duration: 7500,
    desc: 'Aerodynamic Magnus curving arc',
  },
  TITAN: {
    id: 'TITAN',
    name: 'Titan Mallet',
    symbol: '🔨',
    color: '#eab308',
    duration: 8000,
    desc: '45% larger striker & smash radius',
  },
  EMP: {
    id: 'EMP',
    name: 'EMP Pulse',
    symbol: '💥',
    color: '#ec4899',
    duration: 1200,
    desc: 'Disrupts lasers & pushes puck',
  },
  GHOST: {
    id: 'GHOST',
    name: 'Ghost Mirage',
    symbol: '👻',
    color: '#8b5cf6',
    duration: 7000,
    desc: 'Phased transparent puck illusion',
  },
};

export class PowerUpManager {
  constructor(arenaWidth, arenaHeight) {
    this.arenaWidth = arenaWidth;
    this.arenaHeight = arenaHeight;
    this.activeOnField = []; // Collectibles waiting to be hit
    this.spawnTimer = 0;
    this.spawnInterval = 6500 + Math.random() * 3000; // Active 6.5 - 9.5s cadence
    this.activeEffects = {
      p1: {},
      p2: {},
      global: {},
    };
    this.lasers = []; // Laser projectiles fired by players
  }

  reset() {
    this.activeOnField = [];
    this.spawnTimer = 0;
    this.activeEffects = { p1: {}, p2: {}, global: {} };
    this.lasers = [];
  }

  // Update timers and spawn powerups
  update(dt, onCollect) {
    this.spawnTimer += dt;
    if (this.spawnTimer >= this.spawnInterval && this.activeOnField.length < 3) {
      this.spawnTimer = 0;
      this.spawnInterval = 7000 + Math.random() * 4000;
      this.spawnRandomPowerUp();
    }

    // Update active on-field pulsing
    for (const p of this.activeOnField) {
      p.pulse += dt * 0.005;
    }

    // Update laser projectiles
    for (let i = this.lasers.length - 1; i >= 0; i--) {
      const l = this.lasers[i];
      l.y += l.vy * (dt / 16);
      if (l.y < 0 || l.y > this.arenaHeight) {
        this.lasers.splice(i, 1);
      }
    }

    // Update active effects countdown
    const now = Date.now();
    ['p1', 'p2'].forEach((playerKey) => {
      for (const [typeId, effect] of Object.entries(this.activeEffects[playerKey])) {
        if (now >= effect.expiresAt) {
          delete this.activeEffects[playerKey][typeId];
        }
      }
    });

    for (const [typeId, effect] of Object.entries(this.activeEffects.global)) {
      if (now >= effect.expiresAt) {
        delete this.activeEffects.global[typeId];
      }
    }
  }

  spawnRandomPowerUp() {
    const types = Object.keys(POWERUP_TYPES);
    const selectedKey = types[Math.floor(Math.random() * types.length)];
    const def = POWERUP_TYPES[selectedKey];

    // Spawn in neutral middle band of the arena
    const marginX = this.arenaWidth * 0.18;
    const x = marginX + Math.random() * (this.arenaWidth - marginX * 2);
    const minY = this.arenaHeight * 0.38;
    const maxY = this.arenaHeight * 0.62;
    const y = minY + Math.random() * (maxY - minY);

    this.activeOnField.push({
      id: Math.random().toString(36).substring(2, 8),
      type: def.id,
      name: def.name,
      symbol: def.symbol,
      color: def.color,
      x,
      y,
      radius: 26,
      pulse: 0,
      duration: def.duration,
    });
  }

  // Check if ball or player collides with collectible
  checkCollision(circleX, circleY, circleRadius, collectorPlayerKey) {
    for (let i = this.activeOnField.length - 1; i >= 0; i--) {
      const p = this.activeOnField[i];
      const dx = circleX - p.x;
      const dy = circleY - p.y;
      const dist = Math.hypot(dx, dy);

      if (dist < circleRadius + p.radius) {
        // Collected!
        const collected = this.activeOnField.splice(i, 1)[0];
        this.applyEffect(collected.type, collectorPlayerKey);
        return collected;
      }
    }
    return null;
  }

  applyEffect(typeId, collectorPlayerKey) {
    const def = POWERUP_TYPES[typeId];
    if (!def) return;
    const now = Date.now();

    if (typeId === 'VORTEX') {
      this.activeEffects.global['VORTEX'] = {
        expiresAt: now + def.duration,
        x: this.arenaWidth / 2,
        y: this.arenaHeight / 2,
        strength: 0.22,
        angle: 0,
      };
    } else if (typeId === 'EMP') {
      const oppKey = collectorPlayerKey === 'p1' ? 'p2' : 'p1';
      // Wipe opponent beneficial buffs
      this.activeEffects[oppKey] = {};
      // Dissolve opponent laser beams
      this.lasers = this.lasers.filter(l => l.playerKey === collectorPlayerKey);
      this.activeEffects.global['EMP'] = {
        expiresAt: now + def.duration,
        collector: collectorPlayerKey,
      };
    } else if (typeId === 'FREEZE') {
      // Freezes the OPPONENT
      const targetKey = collectorPlayerKey === 'p1' ? 'p2' : 'p1';
      this.activeEffects[targetKey]['FREEZE'] = {
        expiresAt: now + def.duration,
      };
    } else {
      // Applies to collector (SHIELD, BLASTER, OVERDRIVE, MULTIBALL, CURVEBALL, TITAN, GHOST)
      this.activeEffects[collectorPlayerKey][typeId] = {
        expiresAt: now + def.duration,
      };
    }
  }

  fireLaser(playerKey, strikerX, strikerY) {
    if (!this.activeEffects[playerKey]['BLASTER']) return;
    const isP1 = playerKey === 'p1';
    const vy = isP1 ? -16 : 16;
    const color = isP1 ? '#00f0ff' : '#ff007f';

    // Dual cannons
    this.lasers.push({
      x: strikerX - 18,
      y: isP1 ? strikerY - 25 : strikerY + 25,
      vy,
      color,
      playerKey,
    });
    this.lasers.push({
      x: strikerX + 18,
      y: isP1 ? strikerY - 25 : strikerY + 25,
      vy,
      color,
      playerKey,
    });
  }

  isEffectActive(playerKey, typeId) {
    const effect = this.activeEffects[playerKey]?.[typeId];
    return !!effect && Date.now() < effect.expiresAt;
  }

  isGlobalActive(typeId) {
    const effect = this.activeEffects.global?.[typeId];
    return !!effect && Date.now() < effect.expiresAt;
  }

  getGlobalEffect(typeId) {
    return this.activeEffects.global?.[typeId];
  }

  // Render power-up collectibles and lasers with high-fidelity effects
  render(ctx) {
    ctx.save();

    // 1. Render Dual-Core Laser Beams
    for (const l of this.lasers) {
      ctx.save();
      const beamLen = l.vy > 0 ? 22 : -22;

      // Outer Plasma Glow
      ctx.beginPath();
      ctx.moveTo(l.x, l.y);
      ctx.lineTo(l.x, l.y + beamLen);
      ctx.strokeStyle = l.color;
      ctx.lineWidth = 6;
      ctx.shadowColor = l.color;
      ctx.shadowBlur = 18;
      ctx.lineCap = 'round';
      ctx.stroke();

      // White-Hot Laser Core
      ctx.beginPath();
      ctx.moveTo(l.x, l.y);
      ctx.lineTo(l.x, l.y + beamLen);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 10;
      ctx.lineCap = 'round';
      ctx.stroke();

      ctx.restore();
    }

    // 2. Render Center Vortex Singularity Portal
    const vortex = this.getGlobalEffect('VORTEX');
    if (vortex) {
      vortex.angle = (vortex.angle || 0) + 0.04;
      const vortexTex = assets.get('vortexSingularity');

      ctx.save();
      ctx.translate(vortex.x, vortex.y);

      if (vortexTex) {
        // High-Resolution Textured Singularity Disk
        ctx.save();
        ctx.rotate(vortex.angle);
        const vSize = 150;
        ctx.beginPath();
        ctx.arc(0, 0, vSize / 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(vortexTex, -vSize / 2, -vSize / 2, vSize, vSize);
        ctx.restore();

        // Pulsing Event Horizon Rings
        ctx.save();
        ctx.rotate(-vortex.angle * 1.5);
        ctx.beginPath();
        ctx.arc(0, 0, 78, 0, Math.PI * 2);
        ctx.strokeStyle = '#c084fc';
        ctx.lineWidth = 3;
        ctx.setLineDash([16, 12, 4, 12]);
        ctx.shadowColor = '#a855f7';
        ctx.shadowBlur = 24;
        ctx.stroke();
        ctx.restore();
      } else {
        // Procedural fallback
        ctx.rotate(vortex.angle);
        for (let r = 15; r <= 65; r += 16) {
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 1.5);
          ctx.strokeStyle = `rgba(168, 85, 247, ${1 - r / 75})`;
          ctx.lineWidth = 3;
          ctx.shadowColor = '#c084fc';
          ctx.shadowBlur = 15;
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // 3. Render Collectible Orbs with Orbiting Tech Rings
    for (const p of this.activeOnField) {
      const pulseScale = 1 + Math.sin(p.pulse) * 0.12;
      const currentRadius = p.radius * pulseScale;

      ctx.save();

      // Ambient Ground Shadow Glow
      ctx.beginPath();
      ctx.arc(p.x, p.y + 4, currentRadius + 8, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = 0.25;
      ctx.filter = 'blur(8px)';
      ctx.fill();
      ctx.filter = 'none';
      ctx.globalAlpha = 1.0;

      // Orbiting Segmented Tech Ring
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.pulse * 1.8);
      ctx.beginPath();
      ctx.arc(0, 0, currentRadius + 10, 0, Math.PI * 2);
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([8, 8]);
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 12;
      ctx.stroke();
      ctx.restore();

      // Outer Neon Glow Ring
      ctx.beginPath();
      ctx.arc(p.x, p.y, currentRadius + 3, 0, Math.PI * 2);
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 20;
      ctx.stroke();

      // Glassmorphic Inner Orb
      const orbGrad = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, currentRadius);
      orbGrad.addColorStop(0, '#ffffff');
      orbGrad.addColorStop(0.35, p.color);
      orbGrad.addColorStop(1, '#060714');
      ctx.beginPath();
      ctx.arc(p.x, p.y, currentRadius, 0, Math.PI * 2);
      ctx.fillStyle = orbGrad;
      ctx.fill();

      // Icon Symbol in Center
      ctx.font = `bold ${Math.floor(currentRadius * 0.95)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.symbol, p.x, p.y + 1);

      ctx.restore();
    }

    ctx.restore();
  }
}
