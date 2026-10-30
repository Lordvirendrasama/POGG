import { PhysicsEngine, ARENA_W, ARENA_H } from './engine/physics.js';
import { PowerUpManager, POWERUP_TYPES } from './engine/powerups.js';
import { ParticleSystem } from './engine/particles.js';
import { sounds } from './engine/audio.js';
import { haptics } from './engine/haptics.js';
import { BotAI } from './engine/ai.js';
import { network } from './network/peer.js';
import { assets } from './engine/assets.js';
import QRCode from 'qrcode';

// Game Constants
const WIN_SCORE = 10;

class GameApp {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.container = document.getElementById('game-container');

    // Engine Subsystems
    this.physics = new PhysicsEngine();
    this.powerups = new PowerUpManager(ARENA_W, ARENA_H);
    this.particles = new ParticleSystem();
    this.ai = new BotAI('VETERAN');

    // State Variables
    this.mode = 'AI'; // 'AI', 'ONLINE_HOST', 'ONLINE_GUEST', 'LOCAL_2P'
    this.gameState = 'MENU'; // 'MENU', 'COUNTDOWN', 'PLAYING', 'GOAL_PAUSE', 'GAMEOVER'
    this.scoreP1 = 0;
    this.scoreP2 = 0;
    this.countdownTimer = 3;
    this.lastTime = performance.now();
    this.wakeLock = null;

    // Visual Juice: Hit-Stop Frame Freeze & Camera Shake
    this.hitStopTimer = 0;
    this.screenShake = 0;

    // Viewport Scaling factors
    this.scale = 1.0;
    this.offsetX = 0;
    this.offsetY = 0;

    // Active Touch Pointers & Keyboard Keys
    this.touches = new Map(); // pointerId -> { x, y }
    this.keys = new Set();
    this.inputMethod = localStorage.getItem('nkc_input_method') || 'KEYBOARD';

    // Cached UI elements
    this.ui = {
      hud: document.getElementById('game-hud'),
      scoreP1: document.getElementById('score-p1'),
      scoreP2: document.getElementById('score-p2'),
      statusText: document.getElementById('status-text'),
      pingDot: document.getElementById('ping-dot'),
      hudSpeedPill: document.getElementById('hud-speed-pill'),
      btnTouchSpike: document.getElementById('btn-touch-spike'),
      powerupHud: document.getElementById('powerup-hud'),
      blasterHint: document.getElementById('blaster-hint'),
      countdownOverlay: document.getElementById('countdown-overlay'),
      countdownText: document.getElementById('countdown-text'),

      // Input Method Elements
      btnInputToggle: document.getElementById('btn-input-toggle'),
      hudInputBadge: document.getElementById('hud-input-badge'),
      keyVisualizer: document.getElementById('key-visualizer'),
      inputPills: document.querySelectorAll('.input-pill'),
      kbW: document.getElementById('kb-w'),
      kbA: document.getElementById('kb-a'),
      kbS: document.getElementById('kb-s'),
      kbD: document.getElementById('kb-d'),
      kbSpace: document.getElementById('kb-space'),

      // Screen Panels
      screenMenu: document.getElementById('screen-menu'),
      screenHost: document.getElementById('screen-host'),
      screenJoin: document.getElementById('screen-join'),
      screenDiff: document.getElementById('screen-difficulty'),
      screenGameOver: document.getElementById('screen-gameover'),

      // Host Lobby Elements
      hostCodeDisplay: document.getElementById('host-code-display'),
      qrCanvas: document.getElementById('qr-canvas'),
      inputJoinCode: document.getElementById('input-join-code'),

      // Game Over Elements
      gameoverTitle: document.getElementById('gameover-title'),
      gameoverSubtitle: document.getElementById('gameover-subtitle'),
      gameoverScore: document.getElementById('gameover-score'),

      // Puck Arsenal and Menu Quick Actions
      puckPreviewCanvas: document.getElementById('puck-preview-canvas'),
      puckPreviewTitle: document.getElementById('puck-preview-title'),
      puckPreviewTag: document.getElementById('puck-preview-tag'),
      puckPreviewDesc: document.getElementById('puck-preview-desc'),
      puckSkinBtns: document.querySelectorAll('.puck-skin-btn'),
      colorSwatches: document.querySelectorAll('.color-swatch-btn'),
      customColorInput: document.getElementById('custom-puck-color-input'),
      activeColorName: document.getElementById('active-color-name'),
      btnMenuSound: document.getElementById('btn-menu-sound'),
      btnMenuFs: document.getElementById('btn-menu-fs'),
      btnSound: document.getElementById('btn-sound'),
    };

    // Attract Demo Bots & Puck Preview state
    this.demoAi1 = new BotAI('VETERAN');
    this.demoAi2 = new BotAI('VETERAN');
    this.puckPreviewAngle = 0;

    this.init();
  }

  setInputMethod(method) {
    this.inputMethod = method;
    try {
      localStorage.setItem('nkc_input_method', method);
    } catch {}
    this.syncInputUi();
    this.toast(`Input: ${method}`);
  }

  syncInputUi() {
    // Update pills on main menu
    this.ui.inputPills.forEach((pill) => {
      const mode = pill.getAttribute('data-input');
      pill.classList.toggle('active', mode === this.inputMethod);
    });

    // Update in-game HUD
    const iconMap = { KEYBOARD: '⌨️', MOUSE: '🖱️', TOUCH: '📱' };
    const labelMap = { KEYBOARD: '⌨️ KEYS', MOUSE: '🖱️ MOUSE', TOUCH: '📱 TOUCH' };
    if (this.ui.btnInputToggle) {
      this.ui.btnInputToggle.textContent = iconMap[this.inputMethod] || '⌨️';
    }
    if (this.ui.hudInputBadge) {
      this.ui.hudInputBadge.textContent = labelMap[this.inputMethod] || '⌨️ KEYS';
    }

    // Toggle on-screen key visualizer
    if (this.ui.keyVisualizer) {
      const showVisualizer = this.inputMethod === 'KEYBOARD' && (this.gameState === 'PLAYING' || this.gameState === 'COUNTDOWN');
      this.ui.keyVisualizer.classList.toggle('hidden', !showVisualizer);
    }

    // Toggle on-screen mobile spike button
    if (this.ui.btnTouchSpike) {
      const showSpike = this.inputMethod === 'TOUCH' && (this.gameState === 'PLAYING' || this.gameState === 'COUNTDOWN');
      this.ui.btnTouchSpike.classList.toggle('hidden', !showSpike);
    }
  }

  async init() {
    this.setupResize();
    this.setupInputs();
    this.setupEventListeners();
    this.checkUrlParams();

    // Preload high-detail graphics
    await assets.load();

    // Sync active puck skin UI
    this.syncPuckArsenalUi();

    // Start 60fps render loop
    requestAnimationFrame(this.loop.bind(this));
  }

  syncPuckArsenalUi() {
    const meta = this.physics.getPuckSkinMeta();
    if (this.ui.puckPreviewTitle) this.ui.puckPreviewTitle.textContent = meta.name;
    if (this.ui.puckPreviewTag) {
      this.ui.puckPreviewTag.textContent = meta.tag;
      this.ui.puckPreviewTag.style.color = meta.color;
    }
    if (this.ui.puckPreviewDesc) this.ui.puckPreviewDesc.textContent = meta.desc;

    // Dynamically Animate Performance Telemetry Bars
    const stats = meta.stats || { accel: 88, deflect: 92, spin: 85 };
    const accelBar = document.getElementById('stat-accel-bar');
    const deflectBar = document.getElementById('stat-deflect-bar');
    const spinBar = document.getElementById('stat-spin-bar');
    const accelVal = document.getElementById('stat-accel-val');
    const deflectVal = document.getElementById('stat-deflect-val');
    const spinVal = document.getElementById('stat-spin-val');

    if (accelBar) accelBar.style.width = `${stats.accel}%`;
    if (deflectBar) deflectBar.style.width = `${stats.deflect}%`;
    if (spinBar) spinBar.style.width = `${stats.spin}%`;
    if (accelVal) accelVal.textContent = `${stats.accel}%`;
    if (deflectVal) deflectVal.textContent = `${stats.deflect}%`;
    if (spinVal) spinVal.textContent = `${stats.spin}%`;

    this.ui.puckSkinBtns.forEach((btn) => {
      const skinKey = btn.getAttribute('data-skin');
      btn.classList.toggle('active', skinKey === this.physics.puckSkin);
    });

    // Sync active color swatches and readout label
    const activeColor = this.physics.puckColor || meta.color;
    let matchedSwatch = false;
    this.ui.colorSwatches.forEach((swatch) => {
      const color = swatch.getAttribute('data-color');
      const isMatch = color?.toLowerCase() === activeColor?.toLowerCase();
      swatch.classList.toggle('active', isMatch);
      if (isMatch) {
        matchedSwatch = true;
        if (this.ui.activeColorName) {
          this.ui.activeColorName.textContent = `⚡ ${swatch.getAttribute('data-name')}`;
          this.ui.activeColorName.style.color = activeColor;
          this.ui.activeColorName.style.textShadow = `0 0 10px ${activeColor}88`;
        }
      }
    });

    if (!matchedSwatch && this.ui.activeColorName) {
      this.ui.activeColorName.textContent = `⚡ CUSTOM (${activeColor.toUpperCase()})`;
      this.ui.activeColorName.style.color = activeColor;
      this.ui.activeColorName.style.textShadow = `0 0 10px ${activeColor}88`;
    }

    if (this.ui.customColorInput && activeColor.startsWith('#')) {
      this.ui.customColorInput.value = activeColor;
    }
  }

  // Set difficulty from chips or hotkeys with rich visual & audio feedback
  setDifficultyDirect(diff) {
    sounds.init();
    sounds.playUiSelect();
    document.querySelectorAll('.diff-chip').forEach((c) => {
      c.classList.toggle('active', c.getAttribute('data-diff') === diff);
    });
    this.ai.setDifficulty(diff);

    const readout = document.getElementById('diff-meta-readout');
    const readouts = {
      RECRUIT: 'DEFENSIVE CREASE • 380 KM/H',
      VETERAN: 'TACTICAL BANKSHOTS • 650 KM/H',
      APEX: 'GOD-TIER PREDATOR • MACH 3.0',
    };
    if (readout && readouts[diff]) {
      readout.textContent = readouts[diff];
      if (diff === 'RECRUIT') readout.style.color = '#10b981';
      else if (diff === 'VETERAN') readout.style.color = '#ffe600';
      else if (diff === 'APEX') readout.style.color = '#ff0055';
    }
    this.toast(`AI Protocol: ${diff}`);
  }

  // 3D Holographic Equipment Pedestal Showcase (Levitation Bob, Radar Rings, Projector Beams)
  renderPuckPreview() {
    if (!this.ui.puckPreviewCanvas || this.gameState !== 'MENU') return;
    const canvas = this.ui.puckPreviewCanvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const cx = w / 2;
    const pedestalY = 122;
    const meta = this.physics.getPuckSkinMeta();
    const texture = assets.get(this.physics.puckSkin) || assets.get('puckKinetic') || assets.get('puckCore');

    const now = performance.now();
    this.puckPreviewAngle = (this.puckPreviewAngle || 0) + 0.016;
    this.pedestalAngle = (this.pedestalAngle || 0) + 0.012;

    // Levitation Float Bobbing
    const bobY = Math.sin(now * 0.0035) * 5.5;
    const puckY = 62 + bobY;
    const radius = 34;

    // 1. Hologram Projector Pedestal Base (Concentric Ellipses & Radar Ticks)
    ctx.save();
    const poolGrad = ctx.createRadialGradient(cx, pedestalY, 4, cx, pedestalY, 56);
    poolGrad.addColorStop(0, meta.color + '44');
    poolGrad.addColorStop(0.5, meta.color + '15');
    poolGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = poolGrad;
    ctx.beginPath();
    ctx.ellipse(cx, pedestalY, 55, 15, 0, 0, Math.PI * 2);
    ctx.fill();

    // Outer radar ring
    ctx.strokeStyle = meta.color;
    ctx.lineWidth = 1.4;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.ellipse(cx, pedestalY, 48, 13, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Inner rotating dashed emitter ring
    ctx.lineWidth = 1.6;
    ctx.setLineDash([6, 8]);
    ctx.lineDashOffset = -this.pedestalAngle * 32;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.ellipse(cx, pedestalY, 36, 10, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // 2. Hologram Projection Light Cone (Vertical Radiation Beams)
    ctx.save();
    const coneGrad = ctx.createLinearGradient(0, pedestalY, 0, puckY);
    coneGrad.addColorStop(0, meta.color + '38');
    coneGrad.addColorStop(0.7, meta.color + '12');
    coneGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = coneGrad;
    ctx.beginPath();
    ctx.moveTo(cx - 36, pedestalY);
    ctx.lineTo(cx - radius * 0.9, puckY);
    ctx.lineTo(cx + radius * 0.9, puckY);
    ctx.lineTo(cx + 36, pedestalY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // 3. Floating Hologram Spark Motes
    if (!this.hologramMotes) {
      this.hologramMotes = Array.from({ length: 8 }, () => ({
        x: cx + (Math.random() - 0.5) * 55,
        y: pedestalY - Math.random() * 50,
        vy: 0.35 + Math.random() * 0.55,
        alpha: Math.random() * 0.8,
        size: 1 + Math.random() * 1.5,
      }));
    }
    ctx.save();
    ctx.fillStyle = meta.color;
    this.hologramMotes.forEach((mote) => {
      mote.y -= mote.vy;
      if (mote.y < puckY - 12) {
        mote.y = pedestalY - 2;
        mote.x = cx + (Math.random() - 0.5) * 50;
      }
      ctx.globalAlpha = mote.alpha * 0.75;
      ctx.beginPath();
      ctx.arc(mote.x, mote.y, mote.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();

    // 4. Puck Drop Shadow onto Pedestal
    const shadowScale = Math.max(0.7, 1 - (bobY / 24));
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, pedestalY, 34 * shadowScale, 9 * shadowScale, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.filter = 'blur(3px)';
    ctx.fill();
    ctx.restore();

    // 5. Outer Pulsing Energy Halo around Puck
    const pulse = 1 + Math.sin(now * 0.007) * 0.12;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, puckY, radius + 8 * pulse, 0, Math.PI * 2);
    ctx.fillStyle = meta.color;
    ctx.globalAlpha = 0.32;
    ctx.shadowColor = meta.color;
    ctx.shadowBlur = 22 * pulse;
    ctx.fill();
    ctx.restore();

    // 6. 3D Puck Disc (With isometric tilt and metallic bevel chamfer)
    ctx.save();
    ctx.translate(cx, puckY);
    ctx.scale(1, 0.94);

    if (texture) {
      // Texture clipping
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.clip();
      ctx.rotate(this.puckPreviewAngle);
      ctx.drawImage(texture, -radius * 1.05, -radius * 1.05, radius * 2.1, radius * 2.1);
      ctx.restore();

      // Metallic Specular Bevel Chamfer (3D Rim Glint)
      const shineGrad = ctx.createLinearGradient(-radius, -radius, radius, radius);
      shineGrad.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
      shineGrad.addColorStop(0.35, 'rgba(255, 255, 255, 0.05)');
      shineGrad.addColorStop(0.7, 'rgba(0, 0, 0, 0.2)');
      shineGrad.addColorStop(1, 'rgba(0, 0, 0, 0.8)');
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.strokeStyle = shineGrad;
      ctx.lineWidth = 2.8;
      ctx.stroke();

      // Outer signature glow rim
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.strokeStyle = meta.color;
      ctx.lineWidth = 2.2;
      ctx.shadowColor = meta.color;
      ctx.shadowBlur = 12;
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fillStyle = meta.color;
      ctx.fill();
    }

    // Center Fusion Reactor Core with White Spark
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.32, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 14;
    ctx.fill();

    // 7. Dynamic Cyber Laser Scan Beam across the Puck
    const scanOffset = Math.sin(now * 0.005) * (radius * 0.82);
    const scanWidth = Math.sqrt(Math.max(0, radius * radius - scanOffset * scanOffset)) * 0.96;
    ctx.beginPath();
    ctx.moveTo(-scanWidth, scanOffset);
    ctx.lineTo(scanWidth, scanOffset);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = meta.color;
    ctx.shadowBlur = 10;
    ctx.stroke();

    ctx.restore();
  }

  // Handle URL params if player joined via shared link or QR code (?room=CODE)
  checkUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam && roomParam.length === 4) {
      this.ui.inputJoinCode.value = roomParam.toUpperCase();
      this.showScreen(this.ui.screenJoin);
      this.toast(`Auto-connecting to room ${roomParam.toUpperCase()}...`);
      setTimeout(() => {
        this.joinMatchWithCode(roomParam.toUpperCase());
      }, 500);
    }
  }

  // Responsive Canvas Sizing (Locks Virtual 600x1000 Arena)
  setupResize() {
    const resize = () => {
      const containerW = this.container.clientWidth || window.innerWidth;
      const containerH = this.container.clientHeight || window.innerHeight;

      const targetAspect = ARENA_W / ARENA_H;
      const containerAspect = containerW / containerH;

      let drawW, drawH;
      if (containerAspect < targetAspect) {
        // Limited by width
        drawW = containerW;
        drawH = containerW / targetAspect;
      } else {
        // Limited by height
        drawH = containerH;
        drawW = containerH * targetAspect;
      }

      // High DPI display support
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = drawW * dpr;
      this.canvas.height = drawH * dpr;
      this.canvas.style.width = `${drawW}px`;
      this.canvas.style.height = `${drawH}px`;

      this.scale = (drawW / ARENA_W) * dpr;
      this.screenScale = drawW / ARENA_W;
      const rect = this.canvas.getBoundingClientRect();
      this.offsetX = rect.left;
      this.offsetY = rect.top;
    };

    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', () => setTimeout(resize, 200));
    resize();
  }

  // Pointer / Touch / Mouse & Keyboard Handlers for Mobile & PC
  setupInputs() {
    const getVirtualPos = (clientX, clientY) => {
      const rect = this.canvas.getBoundingClientRect();
      const screenScale = rect.width / ARENA_W;
      const x = (clientX - rect.left) / screenScale;
      const y = (clientY - rect.top) / screenScale;
      return { x, y };
    };

    // 1. MOUSE CONTROLS (Universal on PC - always responsive for P1)
    window.addEventListener('mousemove', (e) => {
      const pos = getVirtualPos(e.clientX, e.clientY);
      if (this.gameState === 'COUNTDOWN') {
        this.processInput(pos, false);
        return;
      }
      if (this.gameState !== 'PLAYING') return;
      this.processInput(pos, false);
    });

    window.addEventListener('mousedown', (e) => {
      sounds.init();
      if (this.gameState === 'COUNTDOWN') {
        this.skipCountdown();
        return;
      }
      if (this.gameState !== 'PLAYING') return;
      const pos = getVirtualPos(e.clientX, e.clientY);
      this.processInput(pos, false);
      this.triggerAction('p1');
    });

    // Tap/Click countdown overlay to skip immediately
    this.ui.countdownOverlay?.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      sounds.init();
      this.skipCountdown();
    });

    // 2. TOUCH CONTROLS (Active on mobile touch or when inputMethod === 'TOUCH')
    this.canvas.addEventListener('pointerdown', (e) => {
      sounds.init();
      if (this.gameState === 'COUNTDOWN') {
        this.skipCountdown();
      }
      if (e.pointerType === 'touch' && this.inputMethod !== 'TOUCH') {
        this.setInputMethod('TOUCH');
      }
      const pos = getVirtualPos(e.clientX, e.clientY);
      this.touches.set(e.pointerId, pos);
      this.processInput(pos, true);
    });

    this.canvas.addEventListener('pointermove', (e) => {
      if (this.touches.has(e.pointerId)) {
        const pos = getVirtualPos(e.clientX, e.clientY);
        this.touches.set(e.pointerId, pos);
        this.processInput(pos, false);
      }
    });

    const handlePointerUp = (e) => {
      this.touches.delete(e.pointerId);
    };
    this.canvas.addEventListener('pointerup', handlePointerUp);
    this.canvas.addEventListener('pointercancel', handlePointerUp);

    // 3. KEYBOARD CONTROLS (Universal on PC)
    window.addEventListener('keydown', (e) => {
      sounds.init();
      const k = e.key ? e.key.toLowerCase() : '';
      const c = e.code ? e.code.toLowerCase() : '';

      // Skip countdown instantly on any gameplay key
      if (this.gameState === 'COUNTDOWN') {
        this.skipCountdown();
      }

      // Title Menu Hotkeys
      if (this.gameState === 'MENU') {
        if (k === ' ' || c === 'space') {
          e.preventDefault();
          this.startMatch('AI');
          return;
        }
        if (k === '1') {
          this.setDifficultyDirect('RECRUIT');
          return;
        } else if (k === '2') {
          this.setDifficultyDirect('VETERAN');
          return;
        } else if (k === '3') {
          this.setDifficultyDirect('APEX');
          return;
        } else if (k === 'm') {
          document.getElementById('btn-menu-sound')?.click();
          return;
        }
      }

      if (k) this.keys.add(k);
      if (c) this.keys.add(c);

      // Prevent page scrolling on arrow keys or space
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'space'].includes(k) ||
          ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'space'].includes(c)) {
        e.preventDefault();
      }

      if (k === ' ' || c === 'space' || k === 'f' || c === 'keyf') {
        this.triggerAction('p1');
      }
      if (k === 'enter' || c === 'enter' || c === 'numpad0') {
        this.triggerAction('p2');
      }
    }, { capture: true });

    window.addEventListener('keyup', (e) => {
      const k = e.key ? e.key.toLowerCase() : '';
      const c = e.code ? e.code.toLowerCase() : '';
      if (k) this.keys.delete(k);
      if (c) this.keys.delete(c);
    }, { capture: true });
  }

  triggerAction(playerKey) {
    if (this.mode === 'ONLINE_GUEST') {
      if (this.powerups.isEffectActive('p2', 'BLASTER')) {
        this.powerups.fireLaser('p2', this.physics.p2.x, this.physics.p2.y);
        sounds.playLaser();
        haptics.laserFired();
        network.send({ type: 'INPUT', x: this.physics.p2.targetX, y: this.physics.p2.targetY, fireLaser: true });
      } else {
        this.physics.triggerSpike('p2');
        sounds.playPaddleHit(1.6, this.physics.speedTier, true);
        haptics.vibrateMedium();
        this.particles.emitShockwave(this.physics.p2.x, this.physics.p2.y, '#ffe600', 85);
        network.send({ type: 'INPUT', x: this.physics.p2.targetX, y: this.physics.p2.targetY, spike: true });
      }
    } else {
      if (this.powerups.isEffectActive(playerKey, 'BLASTER')) {
        const striker = playerKey === 'p1' ? this.physics.p1 : this.physics.p2;
        this.powerups.fireLaser(playerKey, striker.x, striker.y);
        sounds.playLaser();
        haptics.laserFired();
      } else {
        this.physics.triggerSpike(playerKey);
        const striker = playerKey === 'p1' ? this.physics.p1 : this.physics.p2;
        sounds.playPaddleHit(1.6, this.physics.speedTier, true);
        haptics.vibrateMedium();
        this.particles.emitShockwave(striker.x, striker.y, '#ffe600', 85);
      }
    }
  }

  updateKeyboardInput(dt) {
    if (this.gameState !== 'PLAYING' && this.gameState !== 'COUNTDOWN') return;

    const speed = 18 * (dt / 16.66);
    const hasKey = (...arr) => arr.some((k) => this.keys.has(k.toLowerCase()));

    // Key states
    const isLeft = hasKey('a', 'keya', 'arrowleft');
    const isRight = hasKey('d', 'keyd', 'arrowright');
    const isUp = hasKey('w', 'keyw', 'arrowup');
    const isDown = hasKey('s', 'keys', 'arrowdown');
    const isSpace = hasKey(' ', 'space', 'f', 'keyf');

    // Update on-screen key visualizer boxes
    if (this.ui.kbW) this.ui.kbW.classList.toggle('active', isUp);
    if (this.ui.kbA) this.ui.kbA.classList.toggle('active', isLeft);
    if (this.ui.kbS) this.ui.kbS.classList.toggle('active', isDown);
    if (this.ui.kbD) this.ui.kbD.classList.toggle('active', isRight);
    if (this.ui.kbSpace) this.ui.kbSpace.classList.toggle('active', isSpace);

    if (this.mode === 'LOCAL_2P') {
      // Local 2P on 1 Keyboard: P1 on WASD, P2 on Arrow Keys
      const p1L = hasKey('a', 'keya');
      const p1R = hasKey('d', 'keyd');
      const p1U = hasKey('w', 'keyw');
      const p1D = hasKey('s', 'keys');

      const p2L = hasKey('arrowleft');
      const p2R = hasKey('arrowright');
      const p2U = hasKey('arrowup');
      const p2D = hasKey('arrowdown');

      if (p1L) this.physics.p1.targetX -= speed;
      if (p1R) this.physics.p1.targetX += speed;
      if (p1U) this.physics.p1.targetY -= speed;
      if (p1D) this.physics.p1.targetY += speed;

      if (p2L) this.physics.p2.targetX -= speed;
      if (p2R) this.physics.p2.targetX += speed;
      if (p2U) this.physics.p2.targetY -= speed;
      if (p2D) this.physics.p2.targetY += speed;
    } else if (this.mode === 'ONLINE_GUEST') {
      // Guest controls bottom striker on their screen
      let dx = 0;
      let dy = 0;
      if (isLeft) dx -= speed;
      if (isRight) dx += speed;
      if (isUp) dy -= speed;
      if (isDown) dy += speed;

      if (dx !== 0 || dy !== 0) {
        const curX = Math.max(ARENA_W * 0.08, Math.min(ARENA_W * 0.92, this.physics.p1.targetX + dx));
        const curY = Math.max(ARENA_H * 0.52, Math.min(ARENA_H * 0.94, this.physics.p1.targetY + dy));
        this.physics.p1.targetX = curX;
        this.physics.p1.targetY = curY;
        this.processInput({ x: curX, y: curY }, false);
      }
    } else {
      // Solo AI or Online Host (P1)
      if (isLeft) this.physics.p1.targetX -= speed;
      if (isRight) this.physics.p1.targetX += speed;
      if (isUp) this.physics.p1.targetY -= speed;
      if (isDown) this.physics.p1.targetY += speed;
    }
  }

  processInput(pos, isInitialTap = false) {
    if (this.gameState !== 'PLAYING' && this.gameState !== 'COUNTDOWN') return;

    if (this.mode === 'ONLINE_GUEST') {
      // In Guest mode, the player plays on the bottom of their screen.
      // Invert coordinates for host physics:
      const hostX = ARENA_W - pos.x;
      const hostY = ARENA_H - pos.y;

      if (isInitialTap && this.powerups.isEffectActive('p2', 'BLASTER')) {
        this.powerups.fireLaser('p2', this.physics.p2.x, this.physics.p2.y);
        sounds.playLaser();
        haptics.laserFired();
        network.send({ type: 'INPUT', x: hostX, y: hostY, fireLaser: true });
      } else {
        network.send({ type: 'INPUT', x: hostX, y: hostY });
      }
      return;
    }

    if (this.mode === 'LOCAL_2P') {
      // Top half controls P2, Bottom half controls P1
      if (pos.y < ARENA_H * 0.5) {
        this.physics.p2.targetX = pos.x;
        this.physics.p2.targetY = pos.y;
        if (isInitialTap && this.powerups.isEffectActive('p2', 'BLASTER')) {
          this.powerups.fireLaser('p2', this.physics.p2.x, this.physics.p2.y);
          sounds.playLaser();
          haptics.laserFired();
        }
      } else {
        this.physics.p1.targetX = pos.x;
        this.physics.p1.targetY = pos.y;
        if (isInitialTap && this.powerups.isEffectActive('p1', 'BLASTER')) {
          this.powerups.fireLaser('p1', this.physics.p1.x, this.physics.p1.y);
          sounds.playLaser();
          haptics.laserFired();
        }
      }
      return;
    }

    // Default: P1 controls the bottom striker
    this.physics.p1.targetX = pos.x;
    this.physics.p1.targetY = pos.y;

    if (isInitialTap && this.powerups.isEffectActive('p1', 'BLASTER')) {
      this.powerups.fireLaser('p1', this.physics.p1.x, this.physics.p1.y);
      sounds.playLaser();
      haptics.laserFired();
    }
  }

  setupEventListeners() {
    // Menu Navigation & Mode Launches
    document.getElementById('btn-menu-host')?.addEventListener('click', () => {
      sounds.init();
      this.startHostLobby();
    });

    document.getElementById('btn-menu-join')?.addEventListener('click', () => {
      sounds.init();
      this.showScreen(this.ui.screenJoin);
    });

    document.getElementById('btn-menu-ai')?.addEventListener('click', () => {
      sounds.init();
      this.startMatch('AI');
    });

    document.getElementById('btn-menu-local')?.addEventListener('click', () => {
      sounds.init();
      this.startMatch('LOCAL_2P');
    });

    // Puck Arsenal Skin Selector
    this.ui.puckSkinBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        sounds.init();
        sounds.playUiSelect();
        const skinKey = e.currentTarget.getAttribute('data-skin');
        if (skinKey) {
          this.physics.setPuckSkin(skinKey);
          this.syncPuckArsenalUi();
          const meta = this.physics.getPuckSkinMeta();
          this.toast(`Equipped ${meta.name}`);
        }
      });
    });

    // Puck Color Swatches Selection
    this.ui.colorSwatches.forEach((swatch) => {
      swatch.addEventListener('click', (e) => {
        sounds.init();
        sounds.playUiSelect();
        const color = e.currentTarget.getAttribute('data-color');
        const name = e.currentTarget.getAttribute('data-name');
        if (color) {
          this.physics.setPuckColor(color);
          this.syncPuckArsenalUi();
          this.toast(`Puck Color: ${name || color}`);
        }
      });
    });

    // Custom Color Input (Picker)
    this.ui.customColorInput?.addEventListener('input', (e) => {
      const color = e.target.value;
      if (color) {
        this.physics.setPuckColor(color);
        this.syncPuckArsenalUi();
      }
    });

    this.ui.customColorInput?.addEventListener('change', (e) => {
      sounds.init();
      sounds.playUiSelect();
      this.toast(`Custom Color: ${e.target.value}`);
    });

    // AI Difficulty Protocol Selection & Launch
    document.querySelectorAll('.diff-chip').forEach((chip) => {
      chip.addEventListener('click', (e) => {
        sounds.init();
        const diff = e.currentTarget.getAttribute('data-diff');
        const isAlreadyActive = e.currentTarget.classList.contains('active');
        this.setDifficultyDirect(diff);
        if (isAlreadyActive) {
          this.toast(`Launching ${diff} Solo Protocol...`);
          this.startMatch('AI');
        }
      });
      chip.addEventListener('dblclick', (e) => {
        const diff = e.currentTarget.getAttribute('data-diff');
        this.setDifficultyDirect(diff);
        this.startMatch('AI');
      });
    });

    // Title Screen Quick Action Buttons
    document.getElementById('btn-menu-sound')?.addEventListener('click', () => {
      sounds.init();
      const isMuted = sounds.toggleMute();
      const label = document.getElementById('sound-btn-label');
      if (label) label.textContent = isMuted ? 'AUDIO: OFF' : 'AUDIO: ON';
      const eqBars = document.querySelectorAll('.sound-eq-bars .eq-bar');
      eqBars.forEach((bar) => {
        bar.style.animationPlayState = isMuted ? 'paused' : 'running';
        if (isMuted) bar.style.height = '3px';
      });
      if (this.ui.btnSound) {
        this.ui.btnSound.textContent = isMuted ? '🔇' : '🔊';
      }
      sounds.playUiSelect();
      this.toast(isMuted ? 'Audio Muted' : 'Audio Enabled');
    });

    document.getElementById('btn-menu-fs')?.addEventListener('click', () => {
      sounds.init();
      sounds.playUiSelect();
      this.toggleFullscreen();
    });

    // Universal Sci-Fi UI Audio Feedback on interactive hover
    document.querySelectorAll('.btn, .diff-chip, .puck-skin-btn, .color-swatch-btn, .input-pill, .btn-top-action').forEach((el) => {
      el.addEventListener('mouseenter', () => {
        sounds.playUiHover();
      });
    });

    // Host Lobby Buttons
    document.getElementById('btn-copy-link')?.addEventListener('click', () => {
      const joinUrl = `${window.location.origin}${window.location.pathname}?room=${network.roomCode}`;
      navigator.clipboard.writeText(joinUrl).then(() => {
        this.toast('Invite link copied to clipboard!');
        haptics.vibrateLight();
      });
    });

    document.getElementById('btn-open-tab')?.addEventListener('click', () => {
      if (network.roomCode) {
        const joinUrl = `${window.location.origin}${window.location.pathname}?room=${network.roomCode}`;
        window.open(joinUrl, '_blank');
        this.toast('Opening Player 2 in new tab...');
      }
    });

    document.getElementById('btn-cancel-host')?.addEventListener('click', () => {
      network.disconnect();
      this.showScreen(this.ui.screenMenu);
    });

    // Join Lobby Buttons
    document.getElementById('btn-confirm-join')?.addEventListener('click', () => {
      const code = this.ui.inputJoinCode.value.trim().toUpperCase();
      if (code.length < 4) {
        this.toast('Enter 4-character room code');
        return;
      }
      this.joinMatchWithCode(code);
    });

    document.getElementById('btn-cancel-join')?.addEventListener('click', () => {
      this.showScreen(this.ui.screenMenu);
    });

    // Legacy Screen Difficulty Buttons (if navigated from elsewhere)
    document.querySelectorAll('.btn-diff-select').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const diff = e.currentTarget.getAttribute('data-diff');
        this.ai.setDifficulty(diff);
        // If clicking on separate difficulty screen, launch match
        if (btn.classList.contains('btn')) {
          this.startMatch('AI');
        }
      });
    });

    document.getElementById('btn-cancel-diff')?.addEventListener('click', () => {
      this.showScreen(this.ui.screenMenu);
    });

    // Game Over Buttons
    document.getElementById('btn-rematch').addEventListener('click', () => {
      if (this.mode === 'ONLINE_GUEST') {
        network.send({ type: 'REQUEST_REMATCH' });
        this.toast('Rematch requested...');
      } else {
        if (this.mode === 'ONLINE_HOST') {
          network.send({ type: 'REMATCH_START' });
        }
        this.startMatch(this.mode);
      }
    });

    document.getElementById('btn-return-menu').addEventListener('click', () => {
      network.disconnect();
      this.showScreen(this.ui.screenMenu);
    });

    // HUD Quick Actions
    document.getElementById('btn-sound').addEventListener('click', (e) => {
      const isMuted = sounds.toggleMute();
      e.currentTarget.textContent = isMuted ? '🔇' : '🔊';
    });

    document.getElementById('btn-fullscreen').addEventListener('click', () => {
      this.toggleFullscreen();
    });

    document.getElementById('btn-quit').addEventListener('click', () => {
      network.disconnect();
      this.ui.hud.classList.add('hidden');
      this.showScreen(this.ui.screenMenu);
    });

    // Input Method Selector (Pills on Main Menu)
    this.ui.inputPills.forEach((pill) => {
      pill.addEventListener('click', (e) => {
        sounds.init();
        const method = e.currentTarget.getAttribute('data-input');
        this.setInputMethod(method);
      });
    });

    // Floating Touch Spike Button
    this.ui.btnTouchSpike?.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      sounds.init();
      this.triggerAction('p1');
    });

    // In-Game Input Method Toggle Button
    this.ui.btnInputToggle?.addEventListener('click', () => {
      sounds.init();
      const methods = ['KEYBOARD', 'MOUSE', 'TOUCH'];
      const nextIndex = (methods.indexOf(this.inputMethod) + 1) % methods.length;
      this.setInputMethod(methods[nextIndex]);
    });

    // Initial sync
    this.syncInputUi();
  }

  showScreen(screenToShow) {
    [this.ui.screenMenu, this.ui.screenHost, this.ui.screenJoin, this.ui.screenDiff, this.ui.screenGameOver].forEach((panel) => {
      panel?.classList?.add('hidden');
    });
    if (screenToShow) {
      screenToShow.classList.remove('hidden');
    }
    this.syncInputUi();
  }

  // Host Online Room flow
  async startHostLobby() {
    this.showScreen(this.ui.screenHost);
    this.ui.hostCodeDisplay.textContent = '...';

    try {
      const roomCode = await network.hostRoom(null, {
        onConnected: () => {
          this.toast('Player 2 connected! Match starting...');
          haptics.vibrateMedium();
          setTimeout(() => {
            network.send({ type: 'START_MATCH' });
            this.startMatch('ONLINE_HOST');
          }, 800);
        },
        onDisconnected: () => {
          this.toast('Player 2 disconnected');
          this.showScreen(this.ui.screenMenu);
        },
        onMessage: (data) => {
          this.handleNetworkMessage(data);
        },
      });

      this.ui.hostCodeDisplay.textContent = roomCode;

      // Generate QR Code for fast mobile camera scanning
      const joinUrl = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
      QRCode.toCanvas(this.ui.qrCanvas, joinUrl, {
        width: 170,
        margin: 1,
        color: { dark: '#00f0ffff', light: '#080914ff' },
      });
    } catch (err) {
      this.toast('Failed to create room: ' + err.message);
      this.showScreen(this.ui.screenMenu);
    }
  }

  // Join Room flow
  async joinMatchWithCode(code) {
    this.toast('Connecting to room...');
    try {
      await network.joinRoom(code, {
        onConnected: () => {
          this.toast('Connected! Waiting for host...');
        },
        onDisconnected: () => {
          this.toast('Host disconnected');
          this.showScreen(this.ui.screenMenu);
        },
        onMessage: (data) => {
          this.handleNetworkMessage(data);
        },
      });
    } catch (err) {
      this.toast(err.message || 'Could not connect');
    }
  }

  // Handle messages across WebRTC
  handleNetworkMessage(data) {
    if (data.type === 'START_MATCH') {
      this.startMatch('ONLINE_GUEST');
    } else if (data.type === 'STATE' && this.mode === 'ONLINE_GUEST') {
      // Invert positions for guest's first-person view
      this.physics.p1.x = ARENA_W - data.p1.x;
      this.physics.p1.y = ARENA_H - data.p1.y;
      this.physics.p2.x = ARENA_W - data.p2.x;
      this.physics.p2.y = ARENA_H - data.p2.y;

      this.physics.balls = data.balls.map((b) => ({
        ...b,
        x: ARENA_W - b.x,
        y: ARENA_H - b.y,
        vx: -b.vx,
        vy: -b.vy,
        trail: b.trail ? b.trail.map((t) => ({ x: ARENA_W - t.x, y: ARENA_H - t.y })) : [],
      }));

      this.powerups.activeOnField = (data.powerups || []).map((p) => ({
        ...p,
        x: ARENA_W - p.x,
        y: ARENA_H - p.y,
      }));

      this.powerups.activeEffects = data.effects || { p1: {}, p2: {}, global: {} };

      // Swap scores visually for guest
      this.scoreP1 = data.scoreP2;
      this.scoreP2 = data.scoreP1;
      this.updateScoreboard();

      if (data.state && this.gameState !== data.state) {
        this.gameState = data.state;
      }
    } else if (data.type === 'INPUT' && this.mode === 'ONLINE_HOST') {
      // Host receives Guest's striker input (already inverted by guest)
      this.physics.p2.targetX = data.x;
      this.physics.p2.targetY = data.y;
      if (data.fireLaser) {
        this.powerups.fireLaser('p2', this.physics.p2.x, this.physics.p2.y);
        sounds.playLaser();
      }
      if (data.spike) {
        this.physics.triggerSpike('p2');
      }
    } else if (data.type === 'REQUEST_REMATCH') {
      this.toast('Player 2 wants a rematch!');
      this.startMatch('ONLINE_HOST');
    } else if (data.type === 'REMATCH_START') {
      this.startMatch('ONLINE_GUEST');
    } else if (data.type === 'GOAL') {
      this.triggerGoalEffects(data.scorer === 'p1' ? 'p2' : 'p1');
    }
  }

  // Start Match
  startMatch(mode) {
    this.mode = mode;
    this.scoreP1 = 0;
    this.scoreP2 = 0;
    this.updateScoreboard();
    this.powerups.reset();
    this.particles.reset();
    this.physics.resetBall(0);

    this.showScreen(null); // Hide all overlay menus
    this.ui.hud.classList.remove('hidden');
    this.syncInputUi();

    this.requestWakeLock();
    this.startCountdown();
  }

  // Instantly skip countdown and begin active volley
  skipCountdown() {
    if (this.gameState !== 'COUNTDOWN') return;
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
    this.countdownTimer = 0;
    this.gameState = 'PLAYING';
    if (this.ui.countdownOverlay) {
      this.ui.countdownOverlay.classList.add('hidden');
    }
    try {
      sounds.playCountdown(true);
      haptics.vibrateMedium();
    } catch (err) {
      console.warn('Audio/Haptic error:', err);
    }
  }

  // 3 - 2 - 1 - CLASH Countdown with Instant Fast Forward & Auto-Hide
  startCountdown() {
    this.gameState = 'COUNTDOWN';
    this.countdownTimer = 3;
    if (this.ui.countdownOverlay) {
      this.ui.countdownOverlay.classList.remove('hidden');
    }

    const triggerPop = (text, isClash = false) => {
      if (this.ui.countdownText) {
        this.ui.countdownText.textContent = text;
        this.ui.countdownText.classList.remove('pop-anim');
        void this.ui.countdownText.offsetWidth; // Force reflow
        this.ui.countdownText.classList.add('pop-anim');
      }
      try {
        sounds.playCountdown(isClash);
        if (isClash) {
          haptics.vibrateMedium();
        } else {
          haptics.vibrateLight();
        }
      } catch (err) {
        console.warn('Audio/Haptic error:', err);
      }
    };

    triggerPop('3', false);

    if (this.countdownInterval) clearInterval(this.countdownInterval);

    // Fast, responsive 420ms ticks (3 -> 2 -> 1 -> CLASH!)
    this.countdownInterval = setInterval(() => {
      this.countdownTimer--;
      if (this.countdownTimer > 0) {
        triggerPop(this.countdownTimer.toString(), false);
      } else if (this.countdownTimer === 0) {
        triggerPop('CLASH!', true);
        this.gameState = 'PLAYING';
        // Hide CLASH overlay promptly after a quick flash so it never covers gameplay
        setTimeout(() => {
          if (this.ui.countdownOverlay && this.gameState === 'PLAYING') {
            this.ui.countdownOverlay.classList.add('hidden');
          }
        }, 320);
      } else {
        clearInterval(this.countdownInterval);
        this.countdownInterval = null;
        if (this.ui.countdownOverlay) {
          this.ui.countdownOverlay.classList.add('hidden');
        }
      }
    }, 420);
  }

  // Game Loop with Hit-Stop Impact Freeze & Error Recovery
  loop(time) {
    try {
      const dt = Math.min(time - this.lastTime, 40); // Cap frame delta
      this.lastTime = time;

      // Hit-Stop Frame Freeze on heavy impacts
      if (this.hitStopTimer > 0) {
        this.hitStopTimer -= dt;
        this.render(); // Keep rendering with camera shake during freeze-frame
        return;
      }

      this.update(dt);
      this.render();
    } catch (err) {
      console.error('Game loop error:', err);
    } finally {
      requestAnimationFrame(this.loop.bind(this));
    }
  }

  update(dt) {
    this.particles.update();

    if (this.gameState === 'MENU') {
      // Attract Demo Mode: 2 AI bots play a showcase match in the background!
      const ball = this.physics.balls[0];
      if (ball) {
        // AI for P2 (top)
        this.demoAi2.update(this.physics, this.powerups);

        // AI for P1 (bottom) - smooth tracking
        const p1 = this.physics.p1;
        const targetX = Math.max(90, Math.min(ARENA_W - 90, ball.x + (ball.vx * 10)));
        p1.targetX += (targetX - p1.targetX) * 0.12;
        p1.targetY = 820;
      }

      this.physics.update(dt, this.powerups, this.particles, {
        onPaddleHit: (intensity, playerKey, isSpike, speedTier) => {
          this.particles.emitImpactSparks(
            playerKey === 'p1' ? this.physics.p1.x : this.physics.p2.x,
            playerKey === 'p1' ? this.physics.p1.y : this.physics.p2.y,
            playerKey === 'p1' ? '#00f0ff' : '#ff007f',
            6
          );
        },
        onWallBounce: () => {},
        onPowerupCollected: () => {},
        onShieldBlock: () => {},
        onGoal: (scorer, ballX, ballY) => {
          this.particles.emitGoalBurst(ballX, ballY, scorer === 'p1');
          this.physics.resetBall(scorer === 'p1' ? 1 : -1);
        },
      });

      this.renderPuckPreview();
      return;
    }

    this.updateKeyboardInput(dt);

    if (this.mode === 'AI' && (this.gameState === 'PLAYING' || this.gameState === 'COUNTDOWN')) {
      this.ai.update(this.physics, this.powerups);
    }

    // Allow paddle movement during countdown so players can position themselves
    if (this.gameState === 'COUNTDOWN') {
      this.physics.updateStrikers(dt, this.powerups);
    }

    if (this.gameState === 'PLAYING') {
      // Only host or local runs authoritative physics simulation
      if (this.mode !== 'ONLINE_GUEST') {
        this.powerups.update(dt);
        this.physics.update(dt, this.powerups, this.particles, {
          onPaddleHit: (intensity, playerKey, isSpike, speedTier) => {
            try {
              sounds.playPaddleHit(intensity, speedTier, isSpike);
              if (isSpike) {
                haptics.vibrateHeavy();
                this.hitStopTimer = 28;
                this.screenShake = 7;
              } else {
                haptics.hitBall();
                this.hitStopTimer = 0;
                if (speedTier >= 3) {
                  this.screenShake = 3.5;
                } else if (speedTier === 2) {
                  this.screenShake = 2;
                }
              }
            } catch (err) {
              console.warn('onPaddleHit error:', err);
            }
          },
          onWallBounce: (speedTier) => {
            try {
              sounds.playWallBounce(speedTier);
              haptics.wallBounce();
              if (speedTier >= 3) {
                this.screenShake = Math.max(this.screenShake, 2.5);
              }
            } catch (err) {
              console.warn('onWallBounce error:', err);
            }
          },
          onPowerupCollected: (powerup, playerKey) => {
            try {
              sounds.playPowerupCollect();
              haptics.collectPowerup();
              this.toast(`${playerKey.toUpperCase()} collected ${powerup.name}!`);
            } catch (err) {
              console.warn('onPowerupCollected error:', err);
            }
          },
          onShieldBlock: (playerKey) => {
            try {
              sounds.playWallBounce(2);
              haptics.vibrateMedium();
              this.screenShake = 6;
              this.toast(`Titan Shield deflected goal!`);
            } catch (err) {
              console.warn('onShieldBlock error:', err);
            }
          },
          onGoal: (scorer, ballX, ballY, speedTier) => {
            try {
              this.handleGoal(scorer, ballX, ballY, speedTier);
            } catch (err) {
              console.warn('onGoal error:', err);
            }
          },
        });

        // Broadcast authoritative state to Guest phone
        if (this.mode === 'ONLINE_HOST') {
          network.send({
            type: 'STATE',
            p1: { x: this.physics.p1.x, y: this.physics.p1.y },
            p2: { x: this.physics.p2.x, y: this.physics.p2.y },
            balls: this.physics.balls,
            powerups: this.powerups.activeOnField,
            effects: this.powerups.activeEffects,
            scoreP1: this.scoreP1,
            scoreP2: this.scoreP2,
            state: this.gameState,
          });
        }
      }
    }

    this.updateHUD();
  }

  handleGoal(scorer, ballX, ballY, speedTier = 1) {
    if (scorer === 'p1') {
      this.scoreP1++;
    } else {
      this.scoreP2++;
    }

    this.screenShake = 10;
    this.hitStopTimer = 40; // Controlled goal celebration pause

    this.triggerGoalEffects(scorer, ballX, ballY);

    if (this.mode === 'ONLINE_HOST') {
      network.send({ type: 'GOAL', scorer });
    }

    this.updateScoreboard();

    // Check Win Condition
    if (this.scoreP1 >= WIN_SCORE || this.scoreP2 >= WIN_SCORE) {
      this.handleGameOver();
    } else {
      this.gameState = 'GOAL_PAUSE';
      setTimeout(() => {
        this.physics.resetBall(scorer === 'p1' ? 1 : -1);
        this.startCountdown();
      }, 1400);
    }
  }

  triggerGoalEffects(scorer, ballX = ARENA_W / 2, ballY = ARENA_H / 2) {
    sounds.playGoal();
    haptics.goalScored();
    this.particles.emitGoalBurst(ballX, ballY, scorer === 'p1');
  }

  handleGameOver() {
    this.gameState = 'GAMEOVER';
    const isP1Win = this.scoreP1 > this.scoreP2;
    const isGuest = this.mode === 'ONLINE_GUEST';

    const playerWon = (isP1Win && !isGuest) || (!isP1Win && isGuest);

    this.ui.gameoverTitle.textContent = playerWon ? 'VICTORY!' : 'DEFEAT';
    this.ui.gameoverTitle.style.color = playerWon ? 'var(--cyan)' : 'var(--magenta)';
    this.ui.gameoverSubtitle.textContent = playerWon ? 'Dominant Arena Mastery!' : 'Better luck next clash!';
    this.ui.gameoverScore.textContent = `${this.scoreP1} - ${this.scoreP2}`;

    this.showScreen(this.ui.screenGameOver);
  }

  updateScoreboard() {
    this.ui.scoreP1.textContent = this.scoreP1.toString();
    this.ui.scoreP2.textContent = this.scoreP2.toString();
  }

  updateHUD() {
    // Ping & Network Status
    if (this.mode === 'ONLINE_HOST' || this.mode === 'ONLINE_GUEST') {
      const ping = network.ping || 18;
      if (this.ui.statusText) this.ui.statusText.textContent = `${ping}ms`;
      if (this.ui.pingDot) this.ui.pingDot.className = ping > 120 ? 'ping-dot bad' : 'ping-dot';
    } else if (this.mode === 'AI') {
      if (this.ui.statusText) this.ui.statusText.textContent = `BOT: ${this.ai.difficulty}`;
      if (this.ui.pingDot) this.ui.pingDot.className = 'ping-dot';
    } else {
      if (this.ui.statusText) this.ui.statusText.textContent = 'LOCAL 2P';
      if (this.ui.pingDot) this.ui.pingDot.className = 'ping-dot';
    }

    // Velocity Tachometer Pill
    if (this.ui.hudSpeedPill) {
      this.ui.hudSpeedPill.textContent = `⚡ ${this.physics.currentKmH} KM/H`;
      const tierColor = this.physics.getTierColor(this.physics.speedTier);
      this.ui.hudSpeedPill.style.color = tierColor;
      this.ui.hudSpeedPill.style.borderColor = tierColor;
    }

    // Power-up indicators
    const p1Active = Object.keys(this.powerups.activeEffects.p1 || {});
    if (this.ui.blasterHint) this.ui.blasterHint.classList.toggle('hidden', !this.powerups.isEffectActive('p1', 'BLASTER'));

    if (this.ui.powerupHud) {
      this.ui.powerupHud.innerHTML = p1Active
        .map((k) => {
          const def = POWERUP_TYPES[k];
          return def ? `<div class="powerup-pill"><span>${def.symbol}</span> ${def.name}</div>` : '';
        })
        .join('');
    }
  }

  render() {
    const { ctx } = this;
    ctx.save();

    // Camera Screen Shake
    if (this.screenShake > 0) {
      const sx = (Math.random() - 0.5) * this.screenShake;
      const sy = (Math.random() - 0.5) * this.screenShake;
      ctx.translate(sx, sy);
      this.screenShake *= 0.80;
      if (this.screenShake < 0.2) this.screenShake = 0;
    }

    ctx.scale(this.scale, this.scale);

    // 1. Render Arena and Entities
    this.physics.render(ctx, this.powerups);

    // 2. Render Collectibles & Lasers
    this.powerups.render(ctx);

    // 3. Render Particles, Shockwaves, and Floating Combat Text
    this.particles.render(ctx);

    ctx.restore();
  }

  toast(msg) {
    const existing = document.querySelector('.toast-msg');
    if (existing) existing.remove();

    const toastEl = document.createElement('div');
    toastEl.className = 'toast-msg';
    toastEl.textContent = msg;
    document.body.appendChild(toastEl);
    setTimeout(() => toastEl.remove(), 2100);
  }

  async requestWakeLock() {
    if ('wakeLock' in navigator) {
      try {
        this.wakeLock = await navigator.wakeLock.request('screen');
      } catch {}
    }
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }
}

// Start Game Engine on DOM load
window.addEventListener('DOMContentLoaded', () => {
  new GameApp();
});
