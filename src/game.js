// Pure game logic. In the serverless build it runs in the browser (battles vs bots); results are validated by the game-api Lambda.
import { SHIPS, FACTIONS, MODES, stats } from '../shared/data';
const W = 1800,
  H = 1100,
  TAU = Math.PI * 2,
  MATCH_SECONDS = 240;
const norm = (a) => {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function mkShip(m, id, name, team, st, type, faction, sock, user) {
  const i = m.ships.filter((s) => s.team === team).length,
    n = MODES[m.mode];
  return {
    id,
    name,
    team,
    type,
    faction: FACTIONS[faction] ? faction : 'pirate',
    st,
    sock,
    user,
    bot: !sock,
    x: team ? W - 250 : 250,
    y: H / 2 + (i - (n - 1) / 2) * 140,
    a: team ? Math.PI : 0,
    sp: 0,
    hp: st.hp,
    alive: true,
    rl: [0, 0],
    slow: 0,
    in: { t: 0.5, r: 0 },
    kills: 0,
    dmg: 0,
  };
}
// humans: [{sock,user}]. With withBots=true humans join team 0 and bots fill both teams.
function createMatch(id, mode, humans, withBots, botDifficulty = null) {
  const n = MODES[mode],
    m = { id, mode, ships: [], balls: [], t: 0, over: false, paused: false };
  humans.forEach((h, k) =>
    m.ships.push(
      mkShip(
        m,
        'p' + k,
        h.user.name,
        withBots ? 0 : k % 2,
        stats(h.user, h.user.ship, h.user.faction),
        h.user.ship,
        h.user.faction,
        h.sock,
        h.user
      )
    )
  );
  let botIndex = 0;
  if (withBots)
    for (const team of [0, 1]) {
      let c;
      while ((c = m.ships.filter((s) => s.team === team).length) < n) {
        const teamBotIndex = c - (team === 0 ? humans.length : 0);
        const type =
          botDifficulty === 'easy'
            ? teamBotIndex % 5 === 4
              ? 'frigate'
              : 'sloop'
            : botDifficulty === 'medium'
              ? 'frigate'
              : botDifficulty === 'hard'
                ? botIndex % 2 === 0
                  ? 'galleon'
                  : 'manowar'
                : ['sloop', 'sloop', 'frigate', 'galleon'][Math.floor(Math.random() * 4)];
        const f = Object.keys(FACTIONS)[Math.floor(Math.random() * 4)];
        m.ships.push(
          mkShip(m, 'b' + team + c, 'Bot ' + (m.ships.length + 1), team, stats({}, type, f), type, f, null, null)
        );
        botIndex++;
      }
    }
  return m;
}
function fire(m, s, side, ammo) {
  if (!s.alive || s.rl[side] > 0) return;
  s.rl[side] = s.st.reload;
  const g = s.st.guns,
    dir = s.a + ((side ? 1 : -1) * Math.PI) / 2,
    spd = 420,
    len = SHIPS[s.type].len;
  for (let i = 0; i < g; i++) {
    const k = (i - (g - 1) / 2) * ((len * 0.9) / Math.max(g, 1)),
      d = dir + (Math.random() - 0.5) * 0.1;
    m.balls.push({
      x: s.x + Math.cos(s.a) * k,
      y: s.y + Math.sin(s.a) * k,
      vx: Math.cos(d) * spd,
      vy: Math.sin(d) * spd,
      life: s.st.range / spd,
      dmg: ammo === 'chain' ? s.st.dmg * 0.35 : s.st.dmg,
      chain: ammo === 'chain',
      o: s,
      team: s.team,
    });
  }
}
function ai(m, s) {
  let e = null,
    d = 1e9;
  for (const o of m.ships)
    if (o.alive && o.team !== s.team) {
      const q = Math.hypot(o.x - s.x, o.y - s.y);
      if (q < d) {
        d = q;
        e = o;
      }
    }
  if (!e) {
    s.in.t = 0.2;
    s.in.r = 0;
    return;
  }
  const rel = norm(Math.atan2(e.y - s.y, e.x - s.x) - s.a);
  if (d > s.st.range * 0.9) {
    s.in.r = clamp(rel * 2, -1, 1);
    s.in.t = 1;
    return;
  }
  const side = rel > 0 ? 1 : 0,
    err = rel - ((side ? 1 : -1) * Math.PI) / 2;
  s.in.r = clamp(err * 2, -1, 1);
  s.in.t = 0.5;
  if (Math.abs(err) < 0.3 && Math.random() < 0.5) fire(m, s, side, 'ball');
}
function tick(m, dt) {
  m.t += dt;
  const ev = [];
  for (const s of m.ships) {
    if (!s.alive) continue;
    if (s.bot) ai(m, s);
    s.slow = Math.max(0, s.slow - dt);
    s.rl = s.rl.map((v) => Math.max(0, v - dt));
    const top = s.st.speed * clamp(s.in.t, 0, 1) * (s.slow > 0 ? 0.5 : 1);
    s.sp += (top - s.sp) * Math.min(1, dt * 0.8);
    s.a = norm(s.a + s.in.r * s.st.turn * dt * (0.3 + (0.7 * s.sp) / s.st.speed));
    s.x = clamp(s.x + Math.cos(s.a) * s.sp * dt, 30, W - 30);
    s.y = clamp(s.y + Math.sin(s.a) * s.sp * dt, 30, H - 30);
  }
  for (const b of m.balls) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    for (const s of m.ships) {
      if (!s.alive || s.team === b.team || Math.hypot(s.x - b.x, s.y - b.y) > SHIPS[s.type].len * 0.5) continue;
      b.life = 0;
      const d = b.dmg * (1 - s.st.armor);
      s.hp -= d;
      b.o.dmg += d;
      if (b.chain) s.slow = 3;
      if (s.hp <= 0) {
        s.alive = false;
        s.hp = 0;
        b.o.kills++;
        ev.push(b.o.name + ' sank ' + s.name);
      }
      break;
    }
  }
  m.balls = m.balls.filter((b) => b.life > 0);
  const alive = [0, 1].map((t) => m.ships.some((s) => s.alive && s.team === t));
  if (!alive[0] || !alive[1] || m.t > MATCH_SECONDS) {
    m.over = true;
    const hp = (t) => m.ships.filter((s) => s.team === t).reduce((a, s) => a + s.hp, 0);
    m.winner = alive[0] && !alive[1] ? 0 : alive[1] && !alive[0] ? 1 : hp(0) >= hp(1) ? 0 : 1;
  }
  return ev;
}
const snapshot = (m) => ({
  ships: m.ships.map((s) => ({
    id: s.id,
    n: s.name,
    tm: s.team,
    ty: s.type,
    fc: s.faction,
    l: SHIPS[s.type].len,
    x: Math.round(s.x),
    y: Math.round(s.y),
    a: +s.a.toFixed(3),
    hp: Math.round(s.hp),
    mx: s.st.hp,
    al: s.alive,
    gn: s.st.guns,
    rg: s.st.range,
    rl: s.rl.map((v) => +v.toFixed(1)),
    rt: s.st.reload,
  })),
  balls: m.balls.map((b) => [Math.round(b.x), Math.round(b.y), b.chain ? 1 : 0]),
  left: Math.max(0, Math.ceil(MATCH_SECONDS - m.t)),
  over: m.over,
});
export { W, H, createMatch, fire, tick, snapshot };
