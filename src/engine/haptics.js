// Mobile Haptic Feedback Engine using Android Vibration API

class HapticEngine {
  constructor() {
    this.enabled = true;
    this.supported = typeof navigator !== 'undefined' && 'vibrate' in navigator;
  }

  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  vibrate(pattern) {
    if (!this.enabled || !this.supported) return;
    try {
      navigator.vibrate(pattern);
    } catch {
      // Ignore vibration errors if restricted by browser security policies
    }
  }

  vibrateLight() {
    this.vibrate(15);
  }

  vibrateMedium() {
    this.vibrate(40);
  }

  vibrateHeavy() {
    this.vibrate([60, 40, 100]);
  }

  hitBall() {
    this.vibrate(25);
  }

  wallBounce() {
    this.vibrate(12);
  }

  collectPowerup() {
    this.vibrate([20, 30, 40]);
  }

  goalScored() {
    this.vibrate([60, 40, 100, 50, 160]);
  }

  freezeStun() {
    this.vibrate([40, 40, 40]);
  }

  laserFired() {
    this.vibrate(20);
  }
}

export const haptics = new HapticEngine();
