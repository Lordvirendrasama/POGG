// Intelligent AI Bot Engine for Solo / Practice Mode

export class BotAI {
  constructor(difficulty = 'VETERAN') {
    this.difficulty = difficulty; // 'RECRUIT', 'VETERAN', 'APEX'
    this.lastFireTime = 0;
  }

  setDifficulty(diff) {
    this.difficulty = diff;
  }

  update(physics, powerUpManager) {
    const { p2, balls, width, height } = physics;
    if (balls.length === 0) return;

    // Find the most threatening ball (highest Y or moving towards top)
    let targetBall = balls[0];
    for (const b of balls) {
      if (b.y < targetBall.y || b.vy < 0) {
        targetBall = b;
      }
    }

    const isRecruit = this.difficulty === 'RECRUIT';
    const isApex = this.difficulty === 'APEX';

    // Difficulty settings tuned for enjoyable, realistic human-scale pacing
    const speed = isRecruit ? 5.8 : (isApex ? 11.5 : 8.2);
    const homeX = width / 2;
    const homeY = height * 0.16;

    let desiredX = homeX;
    let desiredY = homeY;

    // Check if there is an uncollected power-up on P2's side
    let targetPowerup = null;
    if (!isRecruit && powerUpManager.activeOnField.length > 0) {
      for (const p of powerUpManager.activeOnField) {
        if (p.y < height * 0.55) {
          targetPowerup = p;
          break;
        }
      }
    }

    // AI Logic
    if (targetBall.vy < 0) {
      // Ball is coming towards AI!
      let predictedX = targetBall.x;

      if (!isRecruit) {
        // Predict trajectory with wall reflections
        const timeToReach = (targetBall.y - p2.y) / Math.abs(targetBall.vy || 1);
        predictedX = targetBall.x + targetBall.vx * timeToReach;

        // Account for side bounces against physical rails
        const minX = physics.railLeft || 24;
        const maxX = physics.railRight || 576;
        while (predictedX < minX || predictedX > maxX) {
          if (predictedX < minX) predictedX = minX + (minX - predictedX);
          if (predictedX > maxX) predictedX = maxX - (predictedX - maxX);
        }
      }

      desiredX = predictedX;

      // Attack / Strike forward if ball is within range
      if (targetBall.y < height * 0.42 && targetBall.y > p2.y) {
        // Strike down through the ball to smash it
        desiredY = Math.min(height * 0.44, targetBall.y + 10);

        // Apex AI angles the shot towards P1's goal corners
        if (isApex) {
          const aimCornerX = targetBall.x > width / 2 ? physics.goalXMin + 15 : physics.goalXMax - 15;
          desiredX += (aimCornerX - desiredX) * 0.2;
        }
      } else {
        // Guard goal
        desiredY = homeY;
      }
    } else {
      // Ball is moving away from AI towards P1
      if (targetPowerup && !isRecruit) {
        // Go grab power-up if safe
        desiredX = targetPowerup.x;
        desiredY = Math.min(height * 0.44, targetPowerup.y);
      } else {
        // Return to defensive anchor
        desiredX = homeX + (targetBall.x - homeX) * 0.35;
        desiredY = homeY;
      }
    }

    // Blaster logic: fire lasers if active
    if (powerUpManager.isEffectActive('p2', 'BLASTER')) {
      const now = Date.now();
      if (now - this.lastFireTime > (isApex ? 350 : 600)) {
        this.lastFireTime = now;
        powerUpManager.fireLaser('p2', p2.x, p2.y);
      }
    }

    // Apply movement towards desired position
    const dx = desiredX - p2.targetX;
    const dy = desiredY - p2.targetY;
    const dist = Math.hypot(dx, dy);

    if (dist > 1) {
      const moveDist = Math.min(dist, speed);
      p2.targetX += (dx / dist) * moveDist;
      p2.targetY += (dy / dist) * moveDist;
    }
  }
}
