'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { AirHockeyEngine } = require('../engine.js');
function advance(engine, seconds, input = {}, dt = 1 / 120) {
  for (let elapsed = 0; elapsed < seconds - 1e-9; elapsed += dt) engine.update(Math.min(dt, seconds - elapsed), input);
}
function game(config = {}) {
  const events = [];
  const engine = new AirHockeyEngine({ random: () => 0.5, onEvent: (event) => events.push(event) });
  engine.start({ mode: 'pvp', rushEnabled: false, ...config });
  advance(engine, 3);
  assert.equal(engine.state, 'playing');
  return { engine, events };
}
function near(actual, expected, tolerance = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be near ${expected}`);
}
test('horizontal controls move both paddles independently and enforce table bounds', () => {
  const { engine } = game();
  engine.puck.vx = engine.puck.vy = 0;
  advance(engine, 0.25, { p1: -1, p2: 1 });
  near(engine.paddles[0].x, 190); near(engine.paddles[1].x, 410);
  advance(engine, 1, { p1: -1, p2: 1 });
  near(engine.paddles[0].x, 82); near(engine.paddles[1].x, 518);
  assert.deepEqual(engine.paddles.map(p => p.y), [728, 72]);
  advance(engine, 0.25, { p1: 0, p2: 0 });
  assert.deepEqual(engine.paddles.map(p => p.vx), [0, 0]);
});
test('max-speed rush shots bounce off both paddle faces without tunneling', () => {
  for (const index of [0, 1]) {
    const { engine, events } = game({ speed: 1.4, rushEnabled: true, rushBoost: 2 });
    engine.rush = { phase: 'active', remaining: 8 };
    const paddle = engine.paddles[index];
    Object.assign(engine.puck, { x: 330, y: paddle.y + (index === 0 ? -80 : 80), vx: 0, vy: index === 0 ? 1120 : -1120 });
    engine.update(0.1);
    assert.equal(Math.sign(engine.puck.vy), index === 0 ? -1 : 1);
    assert.equal(events.filter(e => e.type === 'hit').length, 1);
    near(Math.hypot(engine.puck.vx, engine.puck.vy), 1120);
    assert.ok(engine.puck.vx > 0, 'right-edge contact aims to the right');
    assert.deepEqual(engine.scores, [0, 0]);
  }
});
test('wall rebounds and full goal crossing distinguish end wall from goal opening', () => {
  const { engine } = game();
  Object.assign(engine.puck, { x: 100, y: 28, vx: 0, vy: -400 });
  engine.update(0.02);
  assert.ok(engine.puck.vy > 0);
  assert.deepEqual(engine.scores, [0, 0]);
  Object.assign(engine.puck, { x: 300, y: 17, vx: 0, vy: -400 });
  engine.update(0.02);
  assert.deepEqual(engine.scores, [0, 0], 'partly crossed puck is not a goal');
  engine.update(0.02);
  assert.deepEqual(engine.scores, [1, 0]);
  assert.equal(engine.state, 'goal');
});
test('a goal scores once, next serve faces the conceding player, exact target wins', () => {
  const { engine, events } = game({ target: 2 });
  Object.assign(engine.puck, { x: 300, y: 10, vx: 0, vy: -400 });
  engine.update(0.03);
  assert.deepEqual(engine.scores, [1, 0]);
  advance(engine, 0.2);
  assert.deepEqual(engine.scores, [1, 0]);
  advance(engine, 3.8);
  assert.equal(engine.state, 'playing');
  assert.ok(engine.puck.vy < 0, 'P2 conceded and receives the next serve');
  Object.assign(engine.puck, { x: 300, y: 10, vx: 0, vy: -400 });
  engine.update(0.03);
  assert.equal(engine.state, 'finished');
  assert.equal(engine.winner, 0);
  advance(engine, 10, { p1: 1 });
  assert.deepEqual(engine.scores, [2, 0]);
  assert.equal(events.filter(e => e.type === 'win').length, 1);
  assert.equal(events.filter(e => e.type === 'goal').length, 2);
});
test('random rush warns, boosts exactly once, then restores base puck and paddle speed', () => {
  const { engine, events } = game({ rushEnabled: true, rushMin: 5, rushMax: 7, rushDuration: 3, rushBoost: 1.5 });
  near(engine.rush.remaining, 6);
  engine.rush.remaining = 0.05;
  advance(engine, 0.05);
  assert.equal(engine.rush.phase, 'warning'); near(engine.rush.remaining, 3);
  Object.assign(engine.puck, { x: 300, y: 400, vx: 400, vy: 0 });
  advance(engine, 3);
  assert.equal(engine.rush.phase, 'active');
  near(Math.hypot(engine.puck.vx, engine.puck.vy), 600); near(engine.paddleSpeed, 506);
  advance(engine, 3);
  assert.equal(engine.rush.phase, 'normal');
  near(Math.hypot(engine.puck.vx, engine.puck.vy), 400); near(engine.paddleSpeed, 440); near(engine.rush.remaining, 6);
  for (const type of ['rush-warning', 'rush-start', 'rush-end']) assert.equal(events.filter(event => event.type === type).length, 1);
});
test('pause freezes play and countdown, goals freeze rush, active rush survives a serve', () => {
  const { engine } = game({ rushEnabled: true, rushBoost: 1.8 });
  engine.rush = { phase: 'active', remaining: 6 };
  Object.assign(engine.puck, { x: 300, y: 10, vx: 0, vy: -720 });
  engine.update(0.02);
  const rushAfterGoal = engine.rush.remaining;
  assert.equal(engine.state, 'goal');
  engine.pause();
  const snapshot = JSON.stringify({ puck: engine.puck, paddles: engine.paddles, rush: engine.rush, goal: engine.goalTimer });
  advance(engine, 2, { p1: 1, p2: -1 });
  assert.equal(JSON.stringify({ puck: engine.puck, paddles: engine.paddles, rush: engine.rush, goal: engine.goalTimer }), snapshot);
  engine.resume(); advance(engine, 1);
  assert.equal(engine.state, 'countdown'); near(engine.rush.remaining, rushAfterGoal);
  engine.pause();
  const savedCountdown = engine.countdown;
  advance(engine, 1); near(engine.countdown, savedCountdown);
  engine.resume(); advance(engine, savedCountdown);
  assert.equal(engine.state, 'playing');
  near(Math.hypot(engine.puck.vx, engine.puck.vy), 720); near(engine.rush.remaining, rushAfterGoal);
  engine.pause();
  const playingSnapshot = JSON.stringify({ puck: engine.puck, paddles: engine.paddles, rush: engine.rush });
  advance(engine, 2, { p1: 1 });
  assert.equal(JSON.stringify({ puck: engine.puck, paddles: engine.paddles, rush: engine.rush }), playingSnapshot);
  engine.resume(); assert.equal(engine.state, 'playing');
});
test('bot respects speed and position bounds at every difficulty', () => {
  for (const difficulty of ['easy', 'normal', 'hard']) {
    const { engine } = game({ mode: 'bot', difficulty });
    for (let i = 0; i < 500; i += 1) {
      const before = engine.paddles[1].x;
      engine.update(1 / 120, { p1: i % 2 ? 1 : -1, p2: 1 });
      const paddle = engine.paddles[1];
      assert.ok(paddle.x >= 82 && paddle.x <= 518);
      if (engine.state === 'playing') assert.ok(Math.abs(paddle.x - before) <= 440 / 120 + 1e-6);
      if (engine.state !== 'playing') advance(engine, 4);
    }
  }
});
test('time handling ignores invalid deltas and limits long stalls; frame rates agree', () => {
  const { engine: first } = game(); const { engine: second } = game();
  first.puck.vx = first.puck.vy = second.puck.vx = second.puck.vy = 0;
  const unchanged = JSON.stringify(first.paddles);
  for (const dt of [NaN, Infinity, -1, 0, undefined]) first.update(dt, { p1: 1 });
  assert.equal(JSON.stringify(first.paddles), unchanged);
  advance(first, 0.3, { p1: 1 }, 1 / 30); advance(second, 0.3, { p1: 1 }, 1 / 144);
  near(first.paddles[0].x, second.paddles[0].x);
  first.paddles[0].x = 300; first.update(100000, { p1: -1 }); near(first.paddles[0].x, 190);
});
test('settings reject out-of-range values and a rematch resets all match state', () => {
  const engine = new AirHockeyEngine({ random: () => 0.5 });
  engine.start({ target: 1000, speed: 100, rushMin: 59, rushMax: 5, rushDuration: 100, rushBoost: 5, difficulty: 'invalid' });
  assert.equal(engine.config.target, 50); assert.equal(engine.config.speed, 1.4);
  assert.equal(engine.config.rushMax, 59); assert.equal(engine.config.rushDuration, 20);
  assert.equal(engine.config.rushBoost, 2); assert.equal(engine.config.difficulty, 'normal');
  engine.scores = [49, 20]; engine.winner = 0; engine.pause();
  engine.start({ target: 1, rushEnabled: false });
  assert.deepEqual(engine.scores, [0, 0]); assert.equal(engine.winner, null); assert.equal(engine.previousState, null);
  assert.equal(engine.rush.phase, 'off'); assert.equal(engine.state, 'countdown');
});

