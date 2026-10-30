// Kinetic Air-Hockey Physics Engine with Lethal Volley Scaling & AAA Visual Juice

import { assets } from './assets.js';

export const ARENA_W = 600;
export const ARENA_H = 1000;
export const RAIL_LEFT = 24;
export const RAIL_RIGHT = 576;
export const RAIL_TOP = 48;
export const RAIL_BOTTOM = 952;
export const GOAL_X_MIN = 175;
export const GOAL_X_MAX = 425;
export const STRIKER_RADIUS = 42;
export const BALL_RADIUS = 21;

export class PhysicsEngine {
  constructor() {
    this.width = ARENA_W;
    this.height = ARENA_H;
    this.railLeft = RAIL_LEFT;
    this.railRight = RAIL_RIGHT;
    this.railTop = RAIL_TOP;
    this.railBottom = RAIL_BOTTOM;
    this.goalXMin = GOAL_X_MIN;
    this.goalXMax = GOAL_X_MAX;
    this.goalWidth = GOAL_X_MAX - GOAL_X_MIN;

    // Active Puck Skin & Custom Core/Glow Color
    this.puckSkin = localStorage.getItem('nkc_puck_skin') || 'puckKinetic';
    this.puckColor = localStorage.getItem('nkc_puck_color') || '#00f0ff';

    // 4 Precision Goal Pylon Posts
    this.goalPosts = [
      { x: GOAL_X_MIN, y: RAIL_TOP, radius: 10, color: '#ff007f' },
      { x: GOAL_X_MAX, y: RAIL_TOP, radius: 10, color: '#ff007f' },
      { x: GOAL_X_MIN, y: RAIL_BOTTOM, radius: 10, color: '#00f0ff' },
      { x: GOAL_X_MAX, y: RAIL_BOTTOM, radius: 10, color: '#00f0ff' },
    ];

    this.rallyCount = 0;
    this.maxRally = 0;
    this.speedTier = 1; // 1: Cyan, 2: Magenta, 3: Solar Amber, 4: Supernova
    this.currentKmH = 320;

    this.p1 = {
      x: this.width / 2,
      y: 840,
      targetX: this.width / 2,
      targetY: 840,
      vx: 0,
      vy: 0,
      radius: STRIKER_RADIUS,
      mass: 8,
      color: '#00f0ff',
      name: 'P1',
      rotation: 0,
      spikeWindow: 0, // ms duration of timed smash
    };

    this.p2 = {
      x: this.width / 2,
      y: 160,
      targetX: this.width / 2,
      targetY: 160,
      vx: 0,
      vy: 0,
      radius: STRIKER_RADIUS,
      mass: 8,
      color: '#ff007f',
      name: 'P2',
      rotation: 0,
      spikeWindow: 0,
    };

    this.balls = [];
    this.lastHitter = null;
    this.resetBall(0);
  }

  resetBall(direction = 0) {
    const angle = direction === 0
      ? (Math.random() > 0.5 ? Math.PI * 0.35 + Math.random() * 0.3 : -Math.PI * 0.65 - Math.random() * 0.3)
      : (direction > 0 ? Math.PI * 0.5 : -Math.PI * 0.5);

    const initialSpeed = 6.2;
    this.rallyCount = 0;
    this.speedTier = 1;
    this.currentKmH = 240;

    // Reset striker positions to defensive anchors
    this.p1.x = this.width / 2;
    this.p1.y = 840;
    this.p1.targetX = this.width / 2;
    this.p1.targetY = 840;
    this.p1.vx = 0;
    this.p1.vy = 0;
    this.p1.spikeWindow = 0;

    this.p2.x = this.width / 2;
    this.p2.y = 160;
    this.p2.targetX = this.width / 2;
    this.p2.targetY = 160;
    this.p2.vx = 0;
    this.p2.vy = 0;
    this.p2.spikeWindow = 0;

    this.balls = [
      {
        id: 'main',
        x: this.width / 2,
        y: this.height / 2,
        vx: Math.cos(angle) * initialSpeed,
        vy: Math.sin(angle) * initialSpeed,
        radius: BALL_RADIUS,
        trail: [],
        speed: initialSpeed,
      },
    ];
    this.lastHitter = null;
  }

  triggerSpike(playerKey) {
    const striker = playerKey === 'p1' ? this.p1 : this.p2;
    striker.spikeWindow = 280; // 280ms window to smash on contact
  }

  spawnMultiball() {
    if (this.balls.length === 0) return;
    const base = this.balls[0];
    const angles = [base.vx > 0 ? 0.7 : -0.7, base.vx > 0 ? -0.7 : 0.7];
    angles.forEach((offset, idx) => {
      this.balls.push({
        id: `multi_${idx}_${Date.now()}`,
        x: base.x + (idx === 0 ? -25 : 25),
        y: base.y,
        vx: base.vx * Math.cos(offset) - base.vy * Math.sin(offset),
        vy: base.vx * Math.sin(offset) + base.vy * Math.cos(offset),
        radius: BALL_RADIUS,
        trail: [],
        speed: base.speed || 9,
      });
    });
  }

  // Update striker positions towards targets
  updateStrikers(dt, powerUpManager) {
    const p1Frozen = powerUpManager ? powerUpManager.isEffectActive('p1', 'FREEZE') : false;
    const p2Frozen = powerUpManager ? powerUpManager.isEffectActive('p2', 'FREEZE') : false;
    const p1Titan = powerUpManager ? powerUpManager.isEffectActive('p1', 'TITAN') : false;
    const p2Titan = powerUpManager ? powerUpManager.isEffectActive('p2', 'TITAN') : false;

    // Titan mallet radius expansion
    this.p1.radius = p1Titan ? 58 : STRIKER_RADIUS;
    this.p2.radius = p2Titan ? 58 : STRIKER_RADIUS;

    // Smooth, enjoyable, non-twitchy paddle tracking
    const smoothP1 = p1Frozen ? 0.14 : 0.38;
    const smoothP2 = p2Frozen ? 0.14 : 0.38;

    // Decay spike windows
    if (this.p1.spikeWindow > 0) this.p1.spikeWindow -= dt;
    if (this.p2.spikeWindow > 0) this.p2.spikeWindow -= dt;

    // Constrain P1 (Bottom half territory)
    this.p1.targetX = Math.max(RAIL_LEFT + this.p1.radius, Math.min(RAIL_RIGHT - this.p1.radius, this.p1.targetX));
    this.p1.targetY = Math.max(520, Math.min(RAIL_BOTTOM - this.p1.radius - 4, this.p1.targetY));

    // Constrain P2 (Top half territory)
    this.p2.targetX = Math.max(RAIL_LEFT + this.p2.radius, Math.min(RAIL_RIGHT - this.p2.radius, this.p2.targetX));
    this.p2.targetY = Math.max(RAIL_TOP + this.p2.radius + 4, Math.min(480, this.p2.targetY));

    // Calculate striker velocity based on position delta
    const oldP1X = this.p1.x;
    const oldP1Y = this.p1.y;
    this.p1.x += (this.p1.targetX - this.p1.x) * smoothP1;
    this.p1.y += (this.p1.targetY - this.p1.y) * smoothP1;
    this.p1.vx = (this.p1.x - oldP1X) / (dt / 16);
    this.p1.vy = (this.p1.y - oldP1Y) / (dt / 16);
    this.p1.rotation += this.p1.vx * 0.025 + 0.006;

    const oldP2X = this.p2.x;
    const oldP2Y = this.p2.y;
    this.p2.x += (this.p2.targetX - this.p2.x) * smoothP2;
    this.p2.y += (this.p2.targetY - this.p2.y) * smoothP2;
    this.p2.vx = (this.p2.x - oldP2X) / (dt / 16);
    this.p2.vy = (this.p2.y - oldP2Y) / (dt / 16);
    this.p2.rotation -= this.p2.vx * 0.025 + 0.006;
  }

  // Update game physics step
  update(dt, powerUpManager, particles, callbacks) {
    this.updateStrikers(dt, powerUpManager);

    // Hovercraft Thruster Jet Particles (Subtle, controlled)
    if (particles) {
      if (Math.hypot(this.p1.vx, this.p1.vy) > 1.6) {
        particles.emitThrusterJet(this.p1.x, this.p1.y, -this.p1.vx, -this.p1.vy, this.p1.color);
      }
      if (Math.hypot(this.p2.vx, this.p2.vy) > 1.6) {
        particles.emitThrusterJet(this.p2.x, this.p2.y, -this.p2.vx, -this.p2.vy, this.p2.color);
      }
    }

    const vortex = powerUpManager ? powerUpManager.getGlobalEffect('VORTEX') : null;
    const timeScale = dt / 16.666;

    for (let bIdx = this.balls.length - 1; bIdx >= 0; bIdx--) {
      const ball = this.balls[bIdx];

      // Vortex gravitational pull
      if (vortex) {
        const dx = vortex.x - ball.x;
        const dy = vortex.y - ball.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 15 && dist < 320) {
          const force = (vortex.strength * 45) / Math.max(dist, 50);
          ball.vx += (dx / dist) * force * timeScale;
          ball.vy += (dy / dist) * force * timeScale;
        }
      }

      // Curveball Aerodynamic Magnus Curving Arc
      if (powerUpManager && this.lastHitter && powerUpManager.isEffectActive(this.lastHitter, 'CURVEBALL')) {
        const curveDir = this.lastHitter === 'p1' ? -1 : 1;
        ball.vx += Math.sin(ball.y * 0.016) * 0.28 * curveDir * timeScale;
      }

      // EMP Wave Push
      if (powerUpManager && powerUpManager.isGlobalActive('EMP')) {
        const emp = powerUpManager.getGlobalEffect('EMP');
        const pushDir = emp.collector === 'p1' ? -1 : 1;
        ball.vy += pushDir * 0.45 * timeScale;
      }

      // Enjoyable speed clamps (Trackable, crisp, highly responsive)
      const isOverdrive = powerUpManager && (powerUpManager.isEffectActive('p1', 'OVERDRIVE') || powerUpManager.isEffectActive('p2', 'OVERDRIVE'));
      const maxSpeed = isOverdrive ? 23.5 : 18.5;
      const minSpeed = 5.8;

      // Update positions
      ball.x += ball.vx * timeScale;
      ball.y += ball.vy * timeScale;

      // Gentle damping to prevent runaway acceleration
      ball.vx *= 0.9985;
      ball.vy *= 0.9985;

      const currentSpeed = Math.hypot(ball.vx, ball.vy);
      if (currentSpeed > maxSpeed) {
        ball.vx = (ball.vx / currentSpeed) * maxSpeed;
        ball.vy = (ball.vy / currentSpeed) * maxSpeed;
      } else if (currentSpeed < minSpeed && currentSpeed > 0.1) {
        ball.vx = (ball.vx / currentSpeed) * minSpeed;
        ball.vy = (ball.vy / currentSpeed) * minSpeed;
      }
      ball.speed = currentSpeed;

      // Calculate speed tier and KM/H
      this.currentKmH = Math.round(currentSpeed * 38);
      if (currentSpeed < 10) this.speedTier = 1;
      else if (currentSpeed < 13.5) this.speedTier = 2;
      else if (currentSpeed < 17) this.speedTier = 3;
      else this.speedTier = 4;

      // Clean, controlled trail length
      ball.trail.push({ x: ball.x, y: ball.y, speed: currentSpeed, tier: this.speedTier });
      const maxTrailLength = 8 + this.speedTier * 4;
      if (ball.trail.length > maxTrailLength) {
        ball.trail.shift();
      }

      // Ball rotation for spinning plasma core texture
      ball.rotation = (ball.rotation || 0) + (ball.speed * 0.035);

      // Controlled subtle exhaust in high tiers (no blinding full-screen flashes)
      if (this.speedTier >= 3 && Math.random() < 0.18) {
        particles.emitBallExhaust(ball.x, ball.y, this.getPuckSkinMeta().color);
      }

      // 1. Goal Posts collision (Pylon deflectors)
      for (const post of this.goalPosts) {
        const dx = ball.x - post.x;
        const dy = ball.y - post.y;
        const dist = Math.hypot(dx, dy);
        const minDist = ball.radius + post.radius;
        if (dist < minDist && dist > 0.001) {
          const nx = dx / dist;
          const ny = dy / dist;
          ball.x = post.x + nx * minDist;
          ball.y = post.y + ny * minDist;
          const dot = ball.vx * nx + ball.vy * ny;
          if (dot < 0) {
            ball.vx = (ball.vx - 2 * dot * nx) * 1.05;
            ball.vy = (ball.vy - 2 * dot * ny) * 1.05;
          }
          particles && particles.emitWallSparks(post.x, post.y, nx, ny, 16, post.color);
          callbacks.onWallBounce && callbacks.onWallBounce(this.speedTier);
        }
      }

      // 2. Physical Side Rail Collisions
      if (ball.x - ball.radius <= RAIL_LEFT) {
        ball.x = RAIL_LEFT + ball.radius;
        ball.vx = Math.abs(ball.vx);
        particles && particles.emitWallSparks(ball.x, ball.y, 1, 0, 14 + this.speedTier * 4, '#00f0ff');
        callbacks.onWallBounce && callbacks.onWallBounce(this.speedTier);
      } else if (ball.x + ball.radius >= RAIL_RIGHT) {
        ball.x = RAIL_RIGHT - ball.radius;
        ball.vx = -Math.abs(ball.vx);
        particles && particles.emitWallSparks(ball.x, ball.y, -1, 0, 14 + this.speedTier * 4, '#ff007f');
        callbacks.onWallBounce && callbacks.onWallBounce(this.speedTier);
      }

      // 3. Goal & Top/Bottom Rail Collisions
      const isInGoalX = ball.x >= this.goalXMin && ball.x <= this.goalXMax;

      // Top boundary (P2's side)
      if (ball.y - ball.radius <= RAIL_TOP) {
        if (isInGoalX) {
          if (powerUpManager && powerUpManager.isEffectActive('p2', 'SHIELD')) {
            ball.y = RAIL_TOP + ball.radius + 2;
            ball.vy = Math.abs(ball.vy) * 1.1;
            delete powerUpManager.activeEffects['p2']['SHIELD'];
            particles && particles.emitShockwave(ball.x, RAIL_TOP, '#00f0ff', 180);
            particles && particles.emitShatterGlass(ball.x, RAIL_TOP, '#00f0ff', 30);
            callbacks.onShieldBlock && callbacks.onShieldBlock('p2');
          } else {
            // GOAL FOR P1!
            particles && particles.emitShatterGlass(ball.x, RAIL_TOP, '#00f0ff', 40);
            callbacks.onGoal && callbacks.onGoal('p1', ball.x, RAIL_TOP, this.speedTier);
            return;
          }
        } else {
          // Bounce off top wall outside goal
          ball.y = RAIL_TOP + ball.radius;
          ball.vy = Math.abs(ball.vy);
          particles && particles.emitWallSparks(ball.x, ball.y, 0, 1, 14 + this.speedTier * 4, '#ff007f');
          callbacks.onWallBounce && callbacks.onWallBounce(this.speedTier);
        }
      }

      // Bottom boundary (P1's side)
      if (ball.y + ball.radius >= RAIL_BOTTOM) {
        if (isInGoalX) {
          if (powerUpManager && powerUpManager.isEffectActive('p1', 'SHIELD')) {
            ball.y = RAIL_BOTTOM - ball.radius - 2;
            ball.vy = -Math.abs(ball.vy) * 1.1;
            delete powerUpManager.activeEffects['p1']['SHIELD'];
            particles && particles.emitShockwave(ball.x, RAIL_BOTTOM, '#00f0ff', 180);
            particles && particles.emitShatterGlass(ball.x, RAIL_BOTTOM, '#00f0ff', 30);
            callbacks.onShieldBlock && callbacks.onShieldBlock('p1');
          } else {
            // GOAL FOR P2!
            particles && particles.emitShatterGlass(ball.x, RAIL_BOTTOM, '#ff007f', 40);
            callbacks.onGoal && callbacks.onGoal('p2', ball.x, RAIL_BOTTOM, this.speedTier);
            return;
          }
        } else {
          // Bounce off bottom wall outside goal
          ball.y = RAIL_BOTTOM - ball.radius;
          ball.vy = -Math.abs(ball.vy);
          particles && particles.emitWallSparks(ball.x, ball.y, 0, -1, 14 + this.speedTier * 4, '#00f0ff');
          callbacks.onWallBounce && callbacks.onWallBounce(this.speedTier);
        }
      }

      // 3. Striker collisions
      this.checkStrikerCollision(ball, this.p1, 'p1', particles, callbacks);
      this.checkStrikerCollision(ball, this.p2, 'p2', particles, callbacks);

      // 4. Powerup collectible collision check
      if (powerUpManager) {
        const collector = this.lastHitter || (ball.vy > 0 ? 'p2' : 'p1');
        const collected = powerUpManager.checkCollision(ball.x, ball.y, ball.radius, collector);
        if (collected) {
          callbacks.onPowerupCollected && callbacks.onPowerupCollected(collected, collector);
          if (collected.type === 'MULTIBALL') {
            this.spawnMultiball();
          }
        }
      }
    }

    // Check laser projectile collisions
    if (powerUpManager) {
      for (let lIdx = powerUpManager.lasers.length - 1; lIdx >= 0; lIdx--) {
        const laser = powerUpManager.lasers[lIdx];
        for (const ball of this.balls) {
          const dist = Math.hypot(laser.x - ball.x, laser.y - ball.y);
          if (dist < ball.radius + 12) {
            ball.vy += laser.vy * 0.55;
            particles.emitSparks(laser.x, laser.y, 14, laser.color, 1.4);
            powerUpManager.lasers.splice(lIdx, 1);
            break;
          }
        }
      }
    }
  }

  // Elastic collision with lethal acceleration and timed smash
  checkStrikerCollision(ball, striker, strikerKey, particles, callbacks) {
    const dx = ball.x - striker.x;
    const dy = ball.y - striker.y;
    const dist = Math.hypot(dx, dy);
    const minDist = ball.radius + striker.radius;

    if (dist < minDist) {
      const nx = dx / (dist || 1);
      const ny = dy / (dist || 1);

      ball.x = striker.x + nx * minDist;
      ball.y = striker.y + ny * minDist;

      const rvx = ball.vx - striker.vx;
      const rvy = ball.vy - striker.vy;
      const velAlongNormal = rvx * nx + rvy * ny;

      if (velAlongNormal < 0) {
        this.rallyCount++;
        this.maxRally = Math.max(this.maxRally, this.rallyCount);

        // Check if player timed a Perfect Kinetic Spike!
        const isSpike = striker.spikeWindow > 0;
        striker.spikeWindow = 0; // Consume spike

        // Controlled, enjoyable volley acceleration multiplier (rallies build smoothly)
        const baseBoost = 1.025 + Math.min(this.rallyCount * 0.008, 0.12);
        const smashMultiplier = isSpike ? 1.30 : baseBoost;

        const impulseMagnitude = -(1 + smashMultiplier) * velAlongNormal;

        // Controlled paddle velocity transfer (clamped to prevent runaway speeds)
        const clampedVx = Math.max(-4.2, Math.min(4.2, striker.vx * 0.24));
        const clampedVy = Math.max(-4.2, Math.min(4.2, striker.vy * 0.24));

        ball.vx += nx * impulseMagnitude + clampedVx;
        ball.vy += ny * impulseMagnitude + clampedVy;

        // Controlled directional spin curve
        const tangentX = -ny;
        const tangentY = nx;
        const spinForce = Math.max(-2.5, Math.min(2.5, (rvx * tangentX + rvy * tangentY) * 0.08));
        ball.vx += tangentX * spinForce;
        ball.vy += tangentY * spinForce;

        this.lastHitter = strikerKey;

        const tierColor = this.getTierColor(this.speedTier);
        if (isSpike) {
          particles.emitSmashBurst(ball.x, ball.y, striker.color);
          particles.emitFloatingText(ball.x, ball.y - 20, '⚡ CRITICAL SMASH!', '#ffe600', 26);
          callbacks.onPaddleHit && callbacks.onPaddleHit(1.8, strikerKey, true, this.speedTier);
        } else {
          particles.emitSparks(ball.x, ball.y, 10 + this.speedTier * 2, tierColor, 1.0);
          particles.emitShockwave(ball.x, ball.y, tierColor, 60 + this.speedTier * 12);
          callbacks.onPaddleHit && callbacks.onPaddleHit(1.0, strikerKey, false, this.speedTier);
        }
      }
    }
  }

  getTierColor(tier) {
    switch (tier) {
      case 1: return '#00f0ff'; // Cyan
      case 2: return '#d946ef'; // Magenta / Neon Purple
      case 3: return '#ff9900'; // Solar Amber
      case 4: return '#ffffff'; // Supernova God Tier
      default: return '#00f0ff';
    }
  }

  // Render Precision-Engineered Cyber Stadium with Physical Rails, Goal Cavities, and Shooting Zones
  renderStadiumStage(ctx) {
    // 1. High-Detail Cyberpunk Hexagonal Floor Deck
    const arenaBg = assets.get('arenaBg');
    if (arenaBg) {
      ctx.drawImage(arenaBg, 0, 0, this.width, this.height);
      // Dark radial stadium vignette to focus lighting on play area
      const vignette = ctx.createRadialGradient(this.width / 2, this.height / 2, 80, this.width / 2, this.height / 2, 540);
      vignette.addColorStop(0, 'rgba(6, 7, 18, 0.28)');
      vignette.addColorStop(0.75, 'rgba(6, 7, 18, 0.65)');
      vignette.addColorStop(1, 'rgba(4, 5, 12, 0.94)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, this.width, this.height);
    } else {
      ctx.fillStyle = '#080914';
      ctx.fillRect(0, 0, this.width, this.height);
    }

    // 2. Goal Net Cavities with 3D Depth
    // Top Goal Cavity (P2)
    ctx.save();
    const topNetGrad = ctx.createLinearGradient(0, 8, 0, RAIL_TOP);
    topNetGrad.addColorStop(0, '#04050d');
    topNetGrad.addColorStop(1, 'rgba(255, 0, 127, 0.15)');
    ctx.fillStyle = topNetGrad;
    ctx.fillRect(this.goalXMin, 8, this.goalWidth, RAIL_TOP - 8);

    // Top Net 3D Perspective Grid
    ctx.strokeStyle = 'rgba(255, 0, 127, 0.4)';
    ctx.lineWidth = 1.2;
    for (let x = this.goalXMin; x <= this.goalXMax; x += 18) {
      ctx.beginPath();
      ctx.moveTo(x, RAIL_TOP);
      ctx.lineTo(this.width / 2 + (x - this.width / 2) * 0.75, 8);
      ctx.stroke();
    }
    for (let y = 14; y < RAIL_TOP; y += 10) {
      ctx.beginPath();
      ctx.moveTo(this.goalXMin, y);
      ctx.lineTo(this.goalXMax, y);
      ctx.stroke();
    }

    // Top Goal Mouth Neon Line
    ctx.strokeStyle = '#ff007f';
    ctx.lineWidth = 4;
    ctx.shadowColor = '#ff007f';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.moveTo(this.goalXMin, RAIL_TOP);
    ctx.lineTo(this.goalXMax, RAIL_TOP);
    ctx.stroke();
    ctx.restore();

    // Bottom Goal Cavity (P1)
    ctx.save();
    const botNetGrad = ctx.createLinearGradient(0, RAIL_BOTTOM, 0, 992);
    botNetGrad.addColorStop(0, 'rgba(0, 240, 255, 0.15)');
    botNetGrad.addColorStop(1, '#04050d');
    ctx.fillStyle = botNetGrad;
    ctx.fillRect(this.goalXMin, RAIL_BOTTOM, this.goalWidth, 992 - RAIL_BOTTOM);

    // Bottom Net 3D Perspective Grid
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
    ctx.lineWidth = 1.2;
    for (let x = this.goalXMin; x <= this.goalXMax; x += 18) {
      ctx.beginPath();
      ctx.moveTo(x, RAIL_BOTTOM);
      ctx.lineTo(this.width / 2 + (x - this.width / 2) * 0.75, 992);
      ctx.stroke();
    }
    for (let y = RAIL_BOTTOM + 8; y < 992; y += 10) {
      ctx.beginPath();
      ctx.moveTo(this.goalXMin, y);
      ctx.lineTo(this.goalXMax, y);
      ctx.stroke();
    }

    // Bottom Goal Mouth Neon Line
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 4;
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.moveTo(this.goalXMin, RAIL_BOTTOM);
    ctx.lineTo(this.goalXMax, RAIL_BOTTOM);
    ctx.stroke();
    ctx.restore();

    // 3. Tactical Field Markings, Creases, and Shooting Zones
    ctx.save();
    ctx.font = '700 11px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Top Defensive Crease (P2 Zone Arc)
    ctx.strokeStyle = 'rgba(255, 0, 127, 0.45)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([8, 8]);
    ctx.shadowColor = '#ff007f';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(this.width / 2, RAIL_TOP, 135, 0, Math.PI);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 0, 127, 0.35)';
    ctx.fillText('// SECTOR 02 // DEFENSE CREASE //', this.width / 2, RAIL_TOP + 36);

    // Bottom Defensive Crease (P1 Zone Arc)
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.45)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([8, 8]);
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(this.width / 2, RAIL_BOTTOM, 135, Math.PI, 0);
    ctx.stroke();
    ctx.fillStyle = 'rgba(0, 240, 255, 0.35)';
    ctx.fillText('// SECTOR 01 // DEFENSE CREASE //', this.width / 2, RAIL_BOTTOM - 24);

    // Kinetic Shooting / Attack Zones (Flank Hashmarks & Chevrons)
    ctx.setLineDash([]);
    ctx.lineWidth = 2;

    // P1 Attack Chevrons (Pointing toward Top Goal)
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.28)';
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 8;
    for (let y = 600; y <= 740; y += 45) {
      // Left flank
      ctx.beginPath();
      ctx.moveTo(RAIL_LEFT + 15, y + 10);
      ctx.lineTo(RAIL_LEFT + 35, y);
      ctx.lineTo(RAIL_LEFT + 55, y + 10);
      ctx.stroke();

      // Right flank
      ctx.beginPath();
      ctx.moveTo(RAIL_RIGHT - 55, y + 10);
      ctx.lineTo(RAIL_RIGHT - 35, y);
      ctx.lineTo(RAIL_RIGHT - 15, y + 10);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0, 240, 255, 0.22)';
    ctx.fillText('[ ATTACK POCKET ]', this.width / 2, 670);

    // P2 Attack Chevrons (Pointing toward Bottom Goal)
    ctx.strokeStyle = 'rgba(255, 0, 127, 0.28)';
    ctx.shadowColor = '#ff007f';
    ctx.shadowBlur = 8;
    for (let y = 260; y <= 400; y += 45) {
      // Left flank
      ctx.beginPath();
      ctx.moveTo(RAIL_LEFT + 15, y - 10);
      ctx.lineTo(RAIL_LEFT + 35, y);
      ctx.lineTo(RAIL_LEFT + 55, y - 10);
      ctx.stroke();

      // Right flank
      ctx.beginPath();
      ctx.moveTo(RAIL_RIGHT - 55, y - 10);
      ctx.lineTo(RAIL_RIGHT - 35, y);
      ctx.lineTo(RAIL_RIGHT - 15, y - 10);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255, 0, 127, 0.22)';
    ctx.fillText('[ ATTACK POCKET ]', this.width / 2, 330);

    // Neutral Midline (Laser Ionization Barrier)
    ctx.save();
    const midGrad = ctx.createLinearGradient(RAIL_LEFT, 500, RAIL_RIGHT, 500);
    midGrad.addColorStop(0, '#00f0ff');
    midGrad.addColorStop(0.5, '#ffe600');
    midGrad.addColorStop(1, '#ff007f');
    ctx.strokeStyle = midGrad;
    ctx.lineWidth = 3;
    ctx.setLineDash([16, 10]);
    ctx.shadowColor = '#ffe600';
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.moveTo(RAIL_LEFT, 500);
    ctx.lineTo(RAIL_RIGHT, 500);
    ctx.stroke();

    // Center Singularity Ring
    ctx.setLineDash([]);
    const timeSec = performance.now() * 0.002;
    ctx.translate(this.width / 2, 500);

    // Rotating Outer Ring
    ctx.save();
    ctx.rotate(timeSec);
    ctx.beginPath();
    ctx.arc(0, 0, 75, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.45)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([12, 12]);
    ctx.stroke();
    ctx.restore();

    // Rotating Inner Ring
    ctx.save();
    ctx.rotate(-timeSec * 1.5);
    ctx.beginPath();
    ctx.arc(0, 0, 48, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 230, 0, 0.55)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    ctx.shadowColor = '#ffe600';
    ctx.shadowBlur = 12;
    ctx.stroke();
    ctx.restore();

    // Center Crosshairs
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(-12, 0); ctx.lineTo(12, 0);
    ctx.moveTo(0, -12); ctx.lineTo(0, 12);
    ctx.stroke();

    ctx.restore();
    ctx.restore();

    // 4. Physical Outer Industrial Bumpers (The Bounding Walls)
    ctx.save();
    // Beveled frame chassis outside playable area
    ctx.fillStyle = '#070914';

    // Left outer frame
    ctx.fillRect(0, 0, RAIL_LEFT, this.height);
    // Right outer frame
    ctx.fillRect(RAIL_RIGHT, 0, this.width - RAIL_RIGHT, this.height);
    // Top bumper frame (outside goal)
    ctx.fillRect(0, 0, this.goalXMin, RAIL_TOP);
    ctx.fillRect(this.goalXMax, 0, this.width - this.goalXMax, RAIL_TOP);
    // Bottom bumper frame (outside goal)
    ctx.fillRect(0, RAIL_BOTTOM, this.goalXMin, this.height - RAIL_BOTTOM);
    ctx.fillRect(this.goalXMax, RAIL_BOTTOM, this.width - this.goalXMax, this.height - RAIL_BOTTOM);

    // Contact Energy Rails (Exact collision borders)
    const timeNow = performance.now() * 0.003;
    const pulseY1 = ((timeNow * 240) % (RAIL_BOTTOM - RAIL_TOP)) + RAIL_TOP;
    const pulseY2 = (((timeNow + 1.2) * 240) % (RAIL_BOTTOM - RAIL_TOP)) + RAIL_TOP;

    // Left Contact Rail (Cyan)
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 3.5;
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.moveTo(RAIL_LEFT, RAIL_TOP);
    ctx.lineTo(RAIL_LEFT, RAIL_BOTTOM);
    ctx.stroke();

    // Travelling energy pulse on left rail
    ctx.beginPath();
    ctx.arc(RAIL_LEFT, pulseY1, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.shadowBlur = 22;
    ctx.fill();

    // Right Contact Rail (Magenta)
    ctx.strokeStyle = '#ff007f';
    ctx.shadowColor = '#ff007f';
    ctx.beginPath();
    ctx.moveTo(RAIL_RIGHT, RAIL_TOP);
    ctx.lineTo(RAIL_RIGHT, RAIL_BOTTOM);
    ctx.stroke();

    // Travelling energy pulse on right rail
    ctx.beginPath();
    ctx.arc(RAIL_RIGHT, pulseY2, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.shadowBlur = 22;
    ctx.fill();

    // Top Bumpers (Magenta)
    ctx.beginPath();
    ctx.moveTo(RAIL_LEFT, RAIL_TOP);
    ctx.lineTo(this.goalXMin, RAIL_TOP);
    ctx.moveTo(this.goalXMax, RAIL_TOP);
    ctx.lineTo(RAIL_RIGHT, RAIL_TOP);
    ctx.stroke();

    // Bottom Bumpers (Cyan)
    ctx.strokeStyle = '#00f0ff';
    ctx.shadowColor = '#00f0ff';
    ctx.beginPath();
    ctx.moveTo(RAIL_LEFT, RAIL_BOTTOM);
    ctx.lineTo(this.goalXMin, RAIL_BOTTOM);
    ctx.moveTo(this.goalXMax, RAIL_BOTTOM);
    ctx.lineTo(RAIL_RIGHT, RAIL_BOTTOM);
    ctx.stroke();

    ctx.restore();

    // 5. Four Precision Goal Pylons (Posts)
    for (const post of this.goalPosts) {
      ctx.save();
      // Drop shadow
      ctx.beginPath();
      ctx.arc(post.x, post.y + 2, post.radius + 3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fill();

      // Metallic Post Collar
      ctx.beginPath();
      ctx.arc(post.x, post.y, post.radius, 0, Math.PI * 2);
      ctx.fillStyle = '#1e2438';
      ctx.strokeStyle = post.color;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = post.color;
      ctx.shadowBlur = 14;
      ctx.fill();
      ctx.stroke();

      // Glowing LED Core
      ctx.beginPath();
      ctx.arc(post.x, post.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.shadowBlur = 10;
      ctx.fill();

      ctx.restore();
    }
  }

  // Render Titan Shield Barriers Locked to Goal Mouths
  renderGoals(ctx, powerUpManager) {
    const shieldTex = assets.get('titanShield');

    // Top Titan Shield (P2)
    if (powerUpManager && powerUpManager.isEffectActive('p2', 'SHIELD')) {
      const shieldY = RAIL_TOP;
      const shieldW = this.goalWidth + 16;
      const shieldH = 26;
      ctx.save();
      if (shieldTex) {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(this.goalXMin - 8, shieldY - shieldH / 2, shieldW, shieldH, 8);
        ctx.clip();
        ctx.drawImage(shieldTex, this.goalXMin - 8, shieldY - shieldW / 2, shieldW, shieldW);
        ctx.restore();
      }

      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 3.5;
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = 24;
      ctx.beginPath();
      ctx.roundRect(this.goalXMin - 8, shieldY - shieldH / 2, shieldW, shieldH, 8);
      ctx.stroke();
      ctx.restore();
    }

    // Bottom Titan Shield (P1)
    if (powerUpManager && powerUpManager.isEffectActive('p1', 'SHIELD')) {
      const shieldY = RAIL_BOTTOM;
      const shieldW = this.goalWidth + 16;
      const shieldH = 26;
      ctx.save();
      if (shieldTex) {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(this.goalXMin - 8, shieldY - shieldH / 2, shieldW, shieldH, 8);
        ctx.clip();
        ctx.drawImage(shieldTex, this.goalXMin - 8, shieldY - shieldW / 2, shieldW, shieldW);
        ctx.restore();
      }

      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 3.5;
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = 24;
      ctx.beginPath();
      ctx.roundRect(this.goalXMin - 8, shieldY - shieldH / 2, shieldW, shieldH, 8);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Render High-Fidelity Stadium, Dynamic Point-Light, Strikers, and Balls
  render(ctx, powerUpManager) {
    ctx.save();

    // 1. Precision Stadium Stage, Bumpers, Goals & Shooting Zones
    this.renderStadiumStage(ctx);

    // 2. Real-time Point-Lighting from Balls
    for (const ball of this.balls) {
      const lightRadius = 170 + ball.speed * 9;
      const tierColor = this.getTierColor(this.speedTier);

      const lightGrad = ctx.createRadialGradient(ball.x, ball.y, 4, ball.x, ball.y, lightRadius);
      lightGrad.addColorStop(0, tierColor);
      lightGrad.addColorStop(0.35, 'rgba(0, 240, 255, 0.22)');
      lightGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.58;
      ctx.fillStyle = lightGrad;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, lightRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 3. Goal Shield Defenses
    this.renderGoals(ctx, powerUpManager);

    // 4. High-Tech Strikers
    this.renderStriker(ctx, this.p1, 'strikerCyan', powerUpManager ? powerUpManager.isEffectActive('p1', 'FREEZE') : false);
    this.renderStriker(ctx, this.p2, 'strikerMagenta', powerUpManager ? powerUpManager.isEffectActive('p2', 'FREEZE') : false);

    // 5. Kinetic Balls with Ribbon Trail
    for (const ball of this.balls) {
      this.renderBall(ctx, ball, powerUpManager);
    }

    // 6. In-Arena Holographic Velocity Tachometer
    this.renderTachometer(ctx);

    ctx.restore();
  }

  renderStriker(ctx, striker, assetKey, isFrozen) {
    ctx.save();
    const texture = assets.get(assetKey);

    // Dynamic drop shadow underneath striker
    ctx.save();
    ctx.beginPath();
    ctx.arc(striker.x + (striker.vx * 1.5), striker.y + (striker.vy * 1.5) + 6, striker.radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.filter = 'blur(6px)';
    ctx.fill();
    ctx.restore();

    // Rotating Holographic Telemetry HUD Ring
    ctx.save();
    ctx.translate(striker.x, striker.y);
    ctx.rotate(striker.rotation * 1.5);
    ctx.strokeStyle = isFrozen ? '#38bdf8' : striker.color;
    ctx.lineWidth = 1.8;
    ctx.globalAlpha = 0.65;
    ctx.setLineDash([12, 10, 4, 10]);
    ctx.beginPath();
    ctx.arc(0, 0, striker.radius + 9, 0, Math.PI * 2);
    ctx.stroke();

    // 4 Radar Ticks
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * (striker.radius + 5), Math.sin(angle) * (striker.radius + 5));
      ctx.lineTo(Math.cos(angle) * (striker.radius + 14), Math.sin(angle) * (striker.radius + 14));
      ctx.stroke();
    }
    ctx.restore();

    // Timed Spike Energy Charging Ring & Hexagon Shield
    if (striker.spikeWindow > 0) {
      const spikePulse = (striker.spikeWindow / 280);
      ctx.save();
      ctx.translate(striker.x, striker.y);
      ctx.rotate(-striker.rotation * 2);
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        const r = striker.radius + 22 * (1 - spikePulse * 0.4);
        const hx = Math.cos(a) * r;
        const hy = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(hx, hy);
        else ctx.lineTo(hx, hy);
      }
      ctx.closePath();
      ctx.strokeStyle = '#ffe600';
      ctx.lineWidth = 4 * spikePulse;
      ctx.shadowColor = '#ffe600';
      ctx.shadowBlur = 28;
      ctx.stroke();
      ctx.restore();
    }

    // Outer Neon Glow Ring
    ctx.beginPath();
    ctx.arc(striker.x, striker.y, striker.radius + 3, 0, Math.PI * 2);
    ctx.strokeStyle = isFrozen ? '#38bdf8' : striker.color;
    ctx.lineWidth = 3.5;
    ctx.shadowColor = isFrozen ? '#38bdf8' : striker.color;
    ctx.shadowBlur = 24;
    ctx.stroke();

    // High-Resolution Textured Striker Body
    if (texture) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(striker.x, striker.y, striker.radius, 0, Math.PI * 2);
      ctx.clip();

      ctx.translate(striker.x, striker.y);
      ctx.rotate(striker.rotation);
      ctx.drawImage(texture, -striker.radius, -striker.radius, striker.radius * 2, striker.radius * 2);
      ctx.restore();

      // Tactile Mallet 3D Chamfer Rim & Center Knob Accent
      ctx.save();
      ctx.translate(striker.x, striker.y);
      const strikerBevel = ctx.createLinearGradient(-striker.radius, -striker.radius, striker.radius, striker.radius);
      strikerBevel.addColorStop(0, 'rgba(255, 255, 255, 0.65)');
      strikerBevel.addColorStop(0.3, 'rgba(255, 255, 255, 0)');
      strikerBevel.addColorStop(0.7, 'rgba(0, 0, 0, 0)');
      strikerBevel.addColorStop(1, 'rgba(0, 0, 0, 0.7)');
      ctx.beginPath();
      ctx.arc(0, 0, striker.radius, 0, Math.PI * 2);
      ctx.strokeStyle = strikerBevel;
      ctx.lineWidth = 2.8;
      ctx.stroke();

      // Glowing Grip Center Ring
      ctx.beginPath();
      ctx.arc(0, 0, striker.radius * 0.44, 0, Math.PI * 2);
      ctx.strokeStyle = isFrozen ? '#38bdf8' : striker.color;
      ctx.lineWidth = 1.8;
      ctx.shadowColor = isFrozen ? '#38bdf8' : striker.color;
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.restore();
    } else {
      // Procedural fallback
      const grad = ctx.createRadialGradient(
        striker.x, striker.y, 6,
        striker.x, striker.y, striker.radius
      );
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.4, isFrozen ? '#38bdf8' : striker.color);
      grad.addColorStop(1, '#060712');

      ctx.beginPath();
      ctx.arc(striker.x, striker.y, striker.radius, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
    }

    // Freeze Crystal overlay if frozen
    if (isFrozen) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = 2.5;
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        ctx.beginPath();
        ctx.moveTo(striker.x, striker.y);
        ctx.lineTo(striker.x + Math.cos(a) * striker.radius, striker.y + Math.sin(a) * striker.radius);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.restore();
  }

  setPuckSkin(skinKey) {
    this.puckSkin = skinKey;
    try {
      localStorage.setItem('nkc_puck_skin', skinKey);
    } catch {}
  }

  setPuckColor(color) {
    this.puckColor = color;
    try {
      localStorage.setItem('nkc_puck_color', color);
    } catch {}
  }

  getPuckSkinMeta() {
    const meta = {
      puckKinetic: {
        name: 'CYBER KINETIC',
        tag: '⚡ VOLTAGE CORE',
        desc: 'Balanced Titanium Rim • High-Voltage Cyan Field',
        color: '#00f0ff',
        trailColor: '#00f0ff',
        sparkColor: '#ffe600',
        stats: { accel: 88, deflect: 92, spin: 85, mass: 'TITANIUM' },
      },
      puckSolar: {
        name: 'SOLAR FLARE',
        tag: '🔥 PLASMA FUSION',
        desc: 'Heavy Tungsten Mass • Blazing Molten Amber Corona',
        color: '#ff6600',
        trailColor: '#ff8800',
        sparkColor: '#ffd700',
        stats: { accel: 82, deflect: 98, spin: 78, mass: 'TUNGSTEN' },
      },
      puckVoid: {
        name: 'VOID NEBULA',
        tag: '🌌 SINGULARITY',
        desc: 'Event Horizon Vortex • Cosmic Ultraviolet Rift',
        color: '#d946ef',
        trailColor: '#c026d3',
        sparkColor: '#e879f9',
        stats: { accel: 94, deflect: 84, spin: 98, mass: 'DARK MATTER' },
      },
      puckMatrix: {
        name: 'MATRIX SYNC',
        tag: '🟢 QUANTUM GRID',
        desc: 'Holographic Circuit Core • Low-Friction Glide',
        color: '#10b981',
        trailColor: '#059669',
        sparkColor: '#34d399',
        stats: { accel: 98, deflect: 80, spin: 92, mass: 'QUANTUM' },
      },
    };
    const base = meta[this.puckSkin] || meta.puckKinetic;
    if (this.puckColor) {
      return {
        ...base,
        color: this.puckColor,
        trailColor: this.puckColor,
        sparkColor: this.puckColor,
      };
    }
    return base;
  }

  renderBall(ctx, ball, powerUpManager) {
    ctx.save();
    const isOverdrive = powerUpManager && (powerUpManager.isEffectActive('p1', 'OVERDRIVE') || powerUpManager.isEffectActive('p2', 'OVERDRIVE'));
    const isGhost = powerUpManager && (powerUpManager.isEffectActive('p1', 'GHOST') || powerUpManager.isEffectActive('p2', 'GHOST'));
    const tierColor = this.getTierColor(isOverdrive ? 4 : this.speedTier);
    const skinMeta = this.getPuckSkinMeta();
    const puckTexture = assets.get(this.puckSkin) || assets.get('puckKinetic') || assets.get('puckCore');

    const effectiveTrailColor = skinMeta.trailColor;
    const effectiveRimColor = skinMeta.color;

    // Ghost mirage phase effect
    if (isGhost) {
      ctx.globalAlpha = 0.42 + Math.sin(performance.now() * 0.009) * 0.22;
    }

    // 1. Dynamic Drop Shadow underneath the puck
    ctx.save();
    ctx.beginPath();
    ctx.arc(ball.x + (ball.vx * 0.4), ball.y + (ball.vy * 0.4) + 5, ball.radius + 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
    ctx.filter = 'blur(5px)';
    ctx.fill();
    ctx.restore();

    // 2. High-Octane Ribbon Trail with Chromatic Aberration in Tier 3/4
    if (ball.trail.length > 1) {
      ctx.save();
      for (let i = 1; i < ball.trail.length; i++) {
        const p1 = ball.trail[i - 1];
        const p2 = ball.trail[i];
        const progress = i / ball.trail.length;

        // Chromatic aberration offset for Mach speeds
        if (this.speedTier >= 3) {
          // Red channel offset
          ctx.beginPath();
          ctx.moveTo(p1.x - 3, p1.y);
          ctx.lineTo(p2.x - 3, p2.y);
          ctx.strokeStyle = '#ff0055';
          ctx.lineWidth = ball.radius * (0.2 + progress * 0.5);
          ctx.lineCap = 'round';
          ctx.globalAlpha = progress * 0.35;
          ctx.stroke();

          // Cyan channel offset
          ctx.beginPath();
          ctx.moveTo(p1.x + 3, p1.y);
          ctx.lineTo(p2.x + 3, p2.y);
          ctx.strokeStyle = '#00f0ff';
          ctx.lineWidth = ball.radius * (0.2 + progress * 0.5);
          ctx.lineCap = 'round';
          ctx.globalAlpha = progress * 0.35;
          ctx.stroke();
        }

        // Primary ribbon trail
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.strokeStyle = effectiveTrailColor;
        ctx.lineWidth = ball.radius * (0.35 + progress * 0.85);
        ctx.lineCap = 'round';
        ctx.globalAlpha = progress * 0.6;
        ctx.shadowColor = effectiveTrailColor;
        ctx.shadowBlur = 18;
        ctx.stroke();
      }
      ctx.restore();
    }

    // 3. Puck Outer Corona Glow (pulsing with energetic frequency)
    const pulse = 1 + Math.sin(performance.now() * 0.009) * 0.12;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius + 6 * pulse, 0, Math.PI * 2);
    ctx.fillStyle = effectiveRimColor;
    ctx.globalAlpha = 0.52;
    ctx.shadowColor = effectiveRimColor;
    ctx.shadowBlur = 32 * pulse;
    ctx.fill();

    // 4. High-Detail Rotating Puck Texture
    if (puckTexture) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
      ctx.clip();

      ctx.translate(ball.x, ball.y);
      ctx.rotate(ball.rotation || 0);
      ctx.drawImage(puckTexture, -ball.radius * 1.05, -ball.radius * 1.05, ball.radius * 2.1, ball.radius * 2.1);
      ctx.restore();

      // Chamfered Metallic Edge Specular Glint (Top-left 3D highlight)
      ctx.save();
      ctx.translate(ball.x, ball.y);
      const shineGrad = ctx.createLinearGradient(-ball.radius, -ball.radius, ball.radius, ball.radius);
      shineGrad.addColorStop(0, 'rgba(255, 255, 255, 0.7)');
      shineGrad.addColorStop(0.3, 'rgba(255, 255, 255, 0.05)');
      shineGrad.addColorStop(0.7, 'rgba(0, 0, 0, 0.1)');
      shineGrad.addColorStop(1, 'rgba(0, 0, 0, 0.7)');
      ctx.beginPath();
      ctx.arc(0, 0, ball.radius, 0, Math.PI * 2);
      ctx.strokeStyle = shineGrad;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.restore();

      // Glowing outer rim
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
      ctx.strokeStyle = effectiveRimColor;
      ctx.lineWidth = 2.2;
      ctx.shadowColor = effectiveRimColor;
      ctx.shadowBlur = 14;
      ctx.stroke();
    } else {
      // Procedural fallback
      ctx.globalAlpha = 1.0;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
      ctx.fillStyle = effectiveRimColor;
      ctx.fill();
    }

    // 5. Intense White-Hot Fusion Center
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius * 0.38, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 18;
    ctx.fill();

    ctx.restore();
  }

  // Live Holographic Tachometer & Rally Counter
  renderTachometer(ctx) {
    if (this.rallyCount === 0 && this.currentKmH < 450) return;
    ctx.save();
    const tierColor = this.getTierColor(this.speedTier);

    ctx.font = '900 12px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const tY = this.height / 2 - 95; // Positioned cleanly above center face-off ring
    const text = `⚡ ${this.currentKmH} KM/H  •  RALLY ${this.rallyCount}x`;

    // Backdrop pill
    ctx.fillStyle = 'rgba(6, 7, 18, 0.85)';
    ctx.strokeStyle = tierColor;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = tierColor;
    ctx.shadowBlur = 14;

    const pillW = 216;
    const pillH = 26;
    ctx.beginPath();
    ctx.roundRect(this.width / 2 - pillW / 2, tY - pillH / 2, pillW, pillH, 13);
    ctx.fill();
    ctx.stroke();

    // Text with glowing color
    ctx.fillStyle = tierColor;
    ctx.fillText(text, this.width / 2, tY);

    ctx.restore();
  }
}
