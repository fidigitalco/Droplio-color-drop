// Automated playtest: a speed-limited bot plays all 120 levels on the real GameEngine physics.
// Run with: npm run playtest   (optional arg = max tray speed in world units/s, default 9)
const path = require('path');
const { GameEngine } = require(path.join(__dirname, '../.playtest/src/game/GameEngine.js'));
const L = require(path.join(__dirname, '../.playtest/src/data/levels.js'));
const G = L.GEOMETRY;
const TRAY_HALF = L.TRAY_W / 2;
function landTime(b) {
  const d = b.y - G.trayRimY;
  if (d <= 0) return 0;
  return d / Math.max(-b.vy, 0.1);
}
// speed-limited bot: the tray target moves at most MAX_SPEED world units / s (human-like)
const MAX_SPEED = +process.argv[2] || 9;
const results = [];
for (const lv of L.LEVELS) {
  const e = new GameEngine(lv);
  e.start();
  let t = 0, target = 0;
  const dt = 1 / 60;
  while (e.phase === 'playing' && t < 400) {
    const falling = e.balls.filter((b) => b.state === 'falling');
    const mand = falling.filter((b) => b.kind === 0 || b.kind === 1).map((b) => ({ b, T: landTime(b) })).sort((a, b) => a.T - b.T);
    const opt = falling.filter((b) => b.kind === 2 || b.kind === 3).map((b) => ({ b, T: landTime(b) })).sort((a, b) => a.T - b.T);
    const bombs = falling.filter((b) => b.kind === 4).map((b) => ({ b, T: landTime(b) }));
    let want = target;
    if (mand.length) want = mand[0].b.x - L.COLOR_OFFSET[mand[0].b.color];
    if (opt.length && (!mand.length || mand[0].T > opt[0].T + 0.7)) want = opt[0].b.x;
    const clamp = (v) => Math.max(-L.TRAY_C_MAX, Math.min(L.TRAY_C_MAX, v));
    const CLR = TRAY_HALF + G.ballR + 0.3;
    const danger = bombs.filter(({ T }) => T < 1.1).map(({ b, T }) => b.driftAmp > 0 ? b.baseX + b.driftAmp * Math.sin(b.driftFreq * (b.age + T)) : b.x);
    const safe = (c) => danger.every((bx) => Math.abs(bx - c) >= CLR - 0.1);
    want = clamp(want);
    if (!safe(want)) {
      const cands = [];
      for (const bx of danger) cands.push(clamp(bx - CLR), clamp(bx + CLR));
      const ok = cands.filter(safe).sort((a, b) => Math.abs(a - want) - Math.abs(b - want));
      if (ok.length) want = ok[0];
    }
    const step = MAX_SPEED * dt;
    target += Math.max(-step, Math.min(step, want - target));
    e.setTrayTarget(target);
    e.update(dt);
    e.drainEvents();
    t += dt;
  }
  results.push({ id: lv.id, phase: e.phase, mistakes: e.mistakes, stars: e.stars(), t: t.toFixed(0) });
}
const won = results.filter((r) => r.phase === 'won');
console.log(`bot speed ${MAX_SPEED}: won ${won.length}/${results.length}`);
const lost = results.filter((r) => r.phase !== 'won');
if (lost.length) console.log('not won:', lost.map((r) => `${r.id}(${r.phase},m${r.mistakes})`).join(' '));
const star = [0, 0, 0, 0];
won.forEach((r) => star[r.stars]++);
console.log('stars 1/2/3:', star.slice(1).join('/'));
const perWorld = {}; results.forEach((r) => { const w = Math.floor((r.id - 1) / 30) + 1; perWorld[w] = (perWorld[w] || 0) + (r.phase === 'won' ? 1 : 0); });
console.log('won per world (of 30):', JSON.stringify(perWorld));
console.log('durations (s):', [1, 30, 120, 300].map((i) => `L${i}:${results[i - 1].t}`).join(' '));
