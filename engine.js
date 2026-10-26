/* Original, custom air hockey code. No third-party code, assets, or network dependencies. */
(function (root) {
  'use strict';
  const W = 600, H = 800, WALL = 16, GOAL_LEFT = 180, GOAL_RIGHT = 420;
  const STEP = 1 / 240, EPSILON = 1e-9;
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const BOT = {
    easy: { delay: 0.25, error: 72, speed: 0.70 },
    normal: { delay: 0.15, error: 38, speed: 0.88 },
    hard: { delay: 0.085, error: 17, speed: 1.0 }
  };
  class AirHockeyEngine {
    constructor({ random = Math.random, onEvent = () => {} } = {}) {
      this.random = random;
      this.onEvent = onEvent;
      this.width = W;
      this.height = H;
      this.state = 'idle';
      this.previousState = null;
      this.config = this._normalize({});
      this.scores = [0, 0];
      this.paddles = [this._paddle(728), this._paddle(72)];
      this.puck = { x: W / 2, y: H / 2, vx: 0, vy: 0, r: 10 };
      this.rush = { phase: 'off', remaining: 0 };
      this.countdown = 0;
      this.goalTimer = 0;
      this.winner = null;
      this.lastScorer = null;
      this._receiver = 0;
      this._bot = { remaining: 0, target: W / 2 };
    }
    _paddle(y) {
      return { x: W / 2, y, width: 132, height: 16, vx: 0 };
    }
    _normalize(config) {
      const min = clamp(finite(config.rushMin, 15), 5, 60);
      return Object.freeze({
        mode: config.mode === 'pvp' ? 'pvp' : 'bot',
        target: Math.round(clamp(finite(config.target, 10), 1, 50)),
        speed: clamp(finite(config.speed, 1), 0.65, 1.4),
        difficulty: Object.hasOwn(BOT, config.difficulty) ? config.difficulty : 'normal',
        rushEnabled: config.rushEnabled !== false,
        rushMin: min,
        rushMax: clamp(finite(config.rushMax, 30), min, 90),
        rushDuration: clamp(finite(config.rushDuration, 8), 3, 20),
        rushBoost: clamp(finite(config.rushBoost, 1.5), 1.2, 2)
      });
    }
    _random() { return clamp(finite(this.random(), 0.5), 0, 1); }
    _emit(type, extra = {}) { this.onEvent({ type, ...extra }); }
    _waitForRush() { return this.config.rushMin + this._random() * (this.config.rushMax - this.config.rushMin); }
    get puckSpeed() {
      return 400 * this.config.speed * (this.rush.phase === 'active' ? this.config.rushBoost : 1);
    }
    get paddleSpeed() { return 440 * (this.rush.phase === 'active' ? 1.15 : 1); }
    start(config = {}) {
      this.config = this._normalize(config);
      this.scores = [0, 0];
      this.winner = null;
      this.lastScorer = null;
      this.previousState = null;
      this.goalTimer = 0;
      this.rush = this.config.rushEnabled
        ? { phase: 'normal', remaining: this._waitForRush() }
        : { phase: 'off', remaining: 0 };
      this._receiver = this._random() < 0.5 ? 0 : 1;
      this._prepareServe();
    }
    _prepareServe() {
      for (const paddle of this.paddles) { paddle.x = W / 2; paddle.vx = 0; }
      Object.assign(this.puck, { x: W / 2, y: H / 2, vx: 0, vy: 0 });
      this._bot = { remaining: 0, target: W / 2 };
      this.countdown = 3;
      this.state = 'countdown';
      this._emit('countdown', { value: 3 });
    }
    _serve() {
      const angle = (this._random() * 2 - 1) * 0.42;
      this.puck.vx = Math.sin(angle) * this.puckSpeed;
      this.puck.vy = Math.cos(angle) * this.puckSpeed * (this._receiver === 0 ? 1 : -1);
      this.countdown = 0;
      this.state = 'playing';
      this._emit('serve', { receiver: this._receiver });
    }
    pause() {
      if (!['playing', 'countdown', 'goal'].includes(this.state)) return;
      this.previousState = this.state;
      this.state = 'paused';
    }
    resume() {
      if (this.state !== 'paused') return;
      this.state = this.previousState;
      this.previousState = null;
    }
    /** dt is seconds. Discard long stalls beyond 250 ms to avoid surprise catch-up. */
    update(dt, input = {}) {
      if (!Number.isFinite(dt) || dt <= 0 || ['idle', 'paused', 'finished'].includes(this.state)) return;
      let remaining = Math.min(dt, 0.25);
      while (remaining > EPSILON) {
        const step = Math.min(STEP, remaining);
        if (this.state === 'countdown') {
          const previous = Math.ceil(this.countdown - EPSILON);
          this.countdown = Math.max(0, this.countdown - step);
          const current = Math.ceil(this.countdown - EPSILON);
          if (this.countdown <= EPSILON) this._serve();
          else if (current !== previous) this._emit('countdown', { value: current });
        } else if (this.state === 'goal') {
          this.goalTimer = Math.max(0, this.goalTimer - step);
          if (this.goalTimer <= EPSILON) this._prepareServe();
        } else if (this.state === 'playing') {
          this._updateRush(step);
          this._movePaddle(this.paddles[0], finite(input.p1, 0), step);
          const bot = this.config.mode === 'bot';
          const direction = bot ? this._botDirection(step) : finite(input.p2, 0);
          this._movePaddle(this.paddles[1], direction, step, bot ? BOT[this.config.difficulty].speed : 1);
          this._movePuck(step);
        } else break;
        remaining -= step;
      }
    }
    _updateRush(dt) {
      if (this.rush.phase === 'off') return;
      this.rush.remaining -= dt;
      if (this.rush.remaining > EPSILON) return;
      const overflow = Math.max(0, -this.rush.remaining);
      if (this.rush.phase === 'normal') {
        this.rush.phase = 'warning';
        this.rush.remaining = 3 - overflow;
        this._emit('rush-warning');
      } else if (this.rush.phase === 'warning') {
        this.rush.phase = 'active';
        this.rush.remaining = this.config.rushDuration - overflow;
        this._setPuckSpeed();
        this._emit('rush-start');
      } else {
        this.rush.phase = 'normal';
        this.rush.remaining = this._waitForRush() - overflow;
        this._setPuckSpeed();
        this._emit('rush-end');
      }
    }
    _setPuckSpeed() {
      const current = Math.hypot(this.puck.vx, this.puck.vy);
      if (current <= EPSILON) return;
      const ratio = this.puckSpeed / current;
      this.puck.vx *= ratio;
      this.puck.vy *= ratio;
    }
    _movePaddle(paddle, direction, dt, multiplier = 1) {
      const before = paddle.x, half = paddle.width / 2;
      paddle.x = clamp(before + clamp(direction, -1, 1) * this.paddleSpeed * multiplier * dt,
        WALL + half, W - WALL - half);
      paddle.vx = (paddle.x - before) / dt;
    }
    _botDirection(dt) {
      const settings = BOT[this.config.difficulty];
      this._bot.remaining -= dt;
      if (this._bot.remaining <= 0) {
        this._bot.remaining = settings.delay * (0.85 + this._random() * 0.3);
        let target = W / 2;
        if (this.puck.vy < -EPSILON) {
          const contactY = this.paddles[1].y + this.paddles[1].height / 2 + this.puck.r;
          const time = Math.max(0, (contactY - this.puck.y) / this.puck.vy);
          const low = WALL + this.puck.r, span = W - 2 * low;
          const projected = this.puck.x + this.puck.vx * time - low;
          const folded = ((projected % (2 * span)) + 2 * span) % (2 * span);
          target = low + (folded <= span ? folded : 2 * span - folded);
          target += (this._random() * 2 - 1) * settings.error;
        } else target += (this.puck.x - W / 2) * 0.25;
        const half = this.paddles[1].width / 2;
        this._bot.target = clamp(target, WALL + half, W - WALL - half);
      }
      return clamp((this._bot.target - this.paddles[1].x) / (this.paddleSpeed * settings.speed * dt), -1, 1);
    }
    _movePuck(dt) {
      const puck = this.puck;
      puck.x += puck.vx * dt;
      puck.y += puck.vy * dt;
      if (puck.x - puck.r < WALL && puck.vx < 0) {
        puck.x = WALL + puck.r;
        puck.vx = Math.abs(puck.vx);
        this._emit('wall', { x: WALL, y: puck.y });
      } else if (puck.x + puck.r > W - WALL && puck.vx > 0) {
        puck.x = W - WALL - puck.r;
        puck.vx = -Math.abs(puck.vx);
        this._emit('wall', { x: W - WALL, y: puck.y });
      }
      const fitsGoal = puck.x - puck.r >= GOAL_LEFT && puck.x + puck.r <= GOAL_RIGHT;
      if (!fitsGoal && puck.y - puck.r < WALL && puck.vy < 0) {
        puck.y = WALL + puck.r;
        puck.vy = Math.abs(puck.vy);
        this._emit('wall', { x: puck.x, y: WALL });
      } else if (!fitsGoal && puck.y + puck.r > H - WALL && puck.vy > 0) {
        puck.y = H - WALL - puck.r;
        puck.vy = -Math.abs(puck.vy);
        this._emit('wall', { x: puck.x, y: H - WALL });
      }
      if (fitsGoal && puck.y + puck.r <= WALL) { this._score(0); return; }
      if (fitsGoal && puck.y - puck.r >= H - WALL) { this._score(1); return; }
      this._collidePaddle(0);
      this._collidePaddle(1);
    }
    _collidePaddle(index) {
      const puck = this.puck, paddle = this.paddles[index];
      const left = paddle.x - paddle.width / 2, right = paddle.x + paddle.width / 2;
      const top = paddle.y - paddle.height / 2, bottom = paddle.y + paddle.height / 2;
      const dx = puck.x - clamp(puck.x, left, right), dy = puck.y - clamp(puck.y, top, bottom);
      const distance = Math.hypot(dx, dy);
      if (distance >= puck.r) return;
      const nx = distance > EPSILON ? dx / distance : 0;
      const ny = distance > EPSILON ? dy / distance : (puck.vy > 0 ? -1 : 1);
      const relativeX = puck.vx - paddle.vx;
      const approach = relativeX * nx + puck.vy * ny;
      puck.x += nx * (puck.r - distance + 0.01);
      puck.y += ny * (puck.r - distance + 0.01);
      if (approach >= 0) return;
      const frontHit = index === 0 ? ny < -0.4 && puck.vy > 0 : ny > 0.4 && puck.vy < 0;
      if (frontHit) {
        const offset = clamp((puck.x - paddle.x) / (paddle.width / 2), -1, 1);
        const angle = clamp(offset * Math.PI / 3 + (paddle.vx / this.paddleSpeed) * 0.14,
          -Math.PI * 0.36, Math.PI * 0.36);
        puck.vx = Math.sin(angle) * this.puckSpeed;
        puck.vy = Math.cos(angle) * this.puckSpeed * (index === 0 ? -1 : 1);
      } else {
        puck.vx = relativeX - 2 * approach * nx + paddle.vx;
        puck.vy -= 2 * approach * ny;
        // Avoid trapping side/corner hits in an almost horizontal rally.
        if (Math.abs(puck.vy) < Math.abs(puck.vx) * 0.3) {
          puck.vy = (Math.sign(puck.vy) || (index === 0 ? -1 : 1)) * Math.abs(puck.vx) * 0.3;
        }
        this._setPuckSpeed();
      }
      this._emit('hit', { player: index, x: puck.x, y: puck.y });
    }
    _score(player) {
      if (this.state !== 'playing') return;
      this.scores[player] += 1;
      this.lastScorer = player;
      this.puck.vx = this.puck.vy = 0;
      this._receiver = 1 - player;
      this._emit('goal', { player, scores: [...this.scores] });
      if (this.scores[player] >= this.config.target) {
        this.winner = player;
        this.state = 'finished';
        this._emit('win', { player, scores: [...this.scores] });
      } else {
        this.state = 'goal';
        this.goalTimer = 0.9;
      }
    }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { AirHockeyEngine };
  if (root) root.AirHockeyEngine = AirHockeyEngine;
})(typeof window !== 'undefined' ? window : null);
