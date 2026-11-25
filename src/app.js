import {
  socket,
  signIn,
  createAccount,
  signOutUser,
  isSignedIn,
  uploadFlag,
  getFlagUrl,
  listPlayers,
  deletePlayer,
} from './net.js';
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
let me,
  SH,
  FA,
  MODES,
  mode = '1v1',
  practiceDifficulty = null,
  G = null,
  captainReady = false,
  factionReady = false,
  authState = 'loading',
  adminState = false;
const keys = {};
const FLAG_EMOJI = { pirate: '🏴‍☠️', spanish: '🇪🇸', french: '🇫🇷', british: '🇬🇧' };
const CAPTAINS = {
  mara: { name: 'Mara Vane', title: 'THE NAVIGATOR', face: '👩🏽‍✈️', coat: '#9e593c' },
  rook: { name: 'Rook Mercer', title: 'THE GUNNER', face: '🧔🏾‍♂️', coat: '#374d4d' },
  becket: { name: 'Elias Becket', title: 'THE PRIVATEER', face: '🤠', coat: '#7f4730' },
  sable: { name: 'Sable Quinn', title: 'THE LOOKOUT', face: '👩🏿‍🦱', coat: '#513e70' },
  silas: { name: 'Silas Crowe', title: 'THE QUARTERMASTER', face: '🧔🏻‍♂️', coat: '#596447' },
  isla: { name: 'Isla Reed', title: 'THE CORSAIR', face: '👩🏻‍🦰', coat: '#875344' },
};
const PARTS = {
  hull: 'Hull: +15% health',
  sails: 'Sails: +8% speed',
  cannons: 'Cannons: +12% damage',
  armor: 'Armor: 6% less damage taken',
};
const norm = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const hull = (c, l, w) => {
  c.beginPath();
  c.moveTo(l / 2, 0);
  c.quadraticCurveTo(l * 0.3, w, -l * 0.3, w);
  c.lineTo(-l / 2, w * 0.7);
  c.lineTo(-l / 2, -w * 0.7);
  c.lineTo(-l * 0.3, -w);
  c.quadraticCurveTo(l * 0.3, -w, l / 2, 0);
  c.closePath();
};
function drawFactionFlag(c, faction, x, y, scale = 1) {
  if (!faction) return;
  const w = 19 * scale,
    h = 12 * scale,
    colors = { pirate: '#111315', spanish: '#c5282f', french: '#244c89', british: '#173767' };
  c.save();
  c.lineCap = 'round';
  c.strokeStyle = '#39291c';
  c.lineWidth = 2 * scale;
  c.beginPath();
  c.moveTo(x, y - 2 * scale);
  c.lineTo(x, y + 19 * scale);
  c.stroke();
  c.beginPath();
  c.moveTo(x, y);
  c.quadraticCurveTo(x + w * 0.47, y - scale, x + w, y + 2 * scale);
  c.lineTo(x + w * 0.91, y + h);
  c.quadraticCurveTo(x + w * 0.45, y + h - scale, x, y + h + 2 * scale);
  c.closePath();
  c.save();
  c.clip();
  c.fillStyle = colors[faction] || colors.pirate;
  c.fillRect(x, y - scale, w, h + 3 * scale);
  if (faction === 'spanish') {
    c.fillStyle = '#edbe39';
    c.fillRect(x, y + h * 0.28, w, h * 0.45);
  }
  if (faction === 'french') {
    c.fillStyle = '#f5f0df';
    c.fillRect(x + w / 3, y, w / 3, h + 2 * scale);
    c.fillStyle = '#c9343a';
    c.fillRect(x + (2 * w) / 3, y, w / 3, h + 2 * scale);
  }
  if (faction === 'british') {
    c.strokeStyle = '#f5f0df';
    c.lineWidth = 5 * scale;
    c.beginPath();
    c.moveTo(x - 2 * scale, y);
    c.lineTo(x + w + 2 * scale, y + h);
    c.moveTo(x + w, y);
    c.lineTo(x, y + h);
    c.stroke();
    c.strokeStyle = '#c9343a';
    c.lineWidth = 2 * scale;
    c.beginPath();
    c.moveTo(x - scale, y);
    c.lineTo(x + w + scale, y + h);
    c.moveTo(x + w, y);
    c.lineTo(x, y + h);
    c.stroke();
    c.fillStyle = '#f5f0df';
    c.fillRect(x + w * 0.39, y, w * 0.22, h);
    c.fillRect(x, y + h * 0.35, w, h * 0.3);
    c.fillStyle = '#c9343a';
    c.fillRect(x + w * 0.45, y, w * 0.1, h);
    c.fillRect(x, y + h * 0.42, w, h * 0.16);
  }
  if (faction === 'pirate') {
    c.fillStyle = '#fff';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `bold ${10 * scale}px serif`;
    c.fillText('☠', x + w * 0.53, y + h * 0.58);
  }
  c.restore();
  c.strokeStyle = '#dbc18b';
  c.lineWidth = 0.7 * scale;
  c.stroke();
  c.restore();
}
function broadsideCanHit(ship, ships, side) {
  const dir = ship.a + ((side ? 1 : -1) * Math.PI) / 2;
  return ships.some((target) => {
    if (!target.al || target.tm === ship.tm) return false;
    const dx = target.x - ship.x,
      dy = target.y - ship.y,
      distance = Math.hypot(dx, dy);
    if (distance > ship.rg || distance < 1) return false;
    const offset = Math.abs(norm(Math.atan2(dy, dx) - dir));
    const tolerance = Math.asin(Math.min(1, ((ship.l + target.l) * 0.5) / distance)) + 0.055;
    return offset <= tolerance;
  });
}

function show(id) {
  if (authState === 'loading') id = 'loading';
  else if (authState === 'signedOut' && id !== 'auth') id = 'auth';
  else if (authState === 'signedIn' && id === 'auth') id = 'lobby';
  if (id === 'admin' && !adminState) id = 'lobby';
  $$('.screen').forEach((e) => (e.hidden = e.id !== id));
  $('#bar').hidden = authState !== 'signedIn' || ['loading', 'auth', 'profileError', 'battle'].includes(id);
  $$('[data-go]').forEach((b) => b.classList.toggle('on', b.dataset.go === id));
  if (id === 'lobby' && me) {
    buildLobby();
    markLobby();
  }
  if (id === 'upgrade' && me) drawUp();
  if (id === 'board' && me) loadBoard();
  if (id === 'yard' && me) renderYard();
  if (id === 'profile' && me) {
    renderProfile();
    renderFlag();
  }
  if (id === 'admin' && me) loadAdmin();
  if (id === 'battle' && G) fit();
}
$$('[data-go]').forEach((b) => (b.onclick = () => show(b.dataset.go)));

// ---------- login ----------
let authMode = 'signup';
function setAuthState(state) {
  authState = state;
}
function setAuthMode(next) {
  authMode = next;
  $('#go').textContent = authMode === 'signup' ? 'Create account' : 'Sign in';
  $('#switchAuth').textContent = authMode === 'signup' ? 'Sign in' : 'Create an account';
  $('#authPassword').autocomplete = authMode === 'signin' ? 'current-password' : 'new-password';
  $('#msg').textContent = '';
}
$('#switchAuth').onclick = () => setAuthMode(authMode === 'signup' ? 'signin' : 'signup');
$('#authForm').onsubmit = async (event) => {
  event.preventDefault();
  const email = $('#authEmail').value.trim(),
    password = $('#authPassword').value;
  const button = $('#go');
  button.disabled = true;
  try {
    setAuthState('loading');
    show('loading');
    if (authMode === 'signup') await createAccount(email, password);
    const result = await signIn(email, password);
    if (result.isSignedIn) socket.emit('auth', {}, enter);
    else {
      setAuthState('signedOut');
      show('auth');
      $('#msg').textContent = 'Could not sign in. Please check your email and password.';
    }
  } catch (error) {
    setAuthState('signedOut');
    show('auth');
    $('#msg').textContent = error.message || 'Authentication failed.';
  } finally {
    button.disabled = false;
  }
};
const enter = (r) => {
  if (r.signedOut) {
    setAuthState('signedOut');
    return show('auth');
  }
  if (r.error) {
    setAuthState('signedIn');
    $('#profileErrorText').textContent = r.error;
    return show('profileError');
  }
  setAuthState('signedIn');
  SH = r.ships;
  FA = r.factions;
  MODES = r.modes;
  captainReady = !!r.profile.captainLocked;
  factionReady = !!r.profile.factionLocked;
  adminState = !!r.admin;
  $('#adminNav').hidden = !adminState;
  $('#authEmail').value = '';
  $('#authPassword').value = '';
  $('#msg').textContent = '';
  $('#profileErrorText').textContent = '';
  setMe(r.profile);
  show('lobby');
};
$('#retryProfile').onclick = () => {
  setAuthState('loading');
  show('loading');
  socket.emit('auth', {}, enter);
};
socket.emit('auth', {}, enter);
function setMe(p) {
  if (authState !== 'signedIn') return;
  me = p;
  $('#who').textContent = `${p.name}, level ${p.level}, ${p.gold} gold`;
  renderYard();
  renderUp();
  renderProfile();
  markLobby();
  if (!$('#upgrade').hidden) drawUp();
}
socket.on('profile', setMe);

// ---------- lobby ----------
function buildLobby() {
  $('#captains').innerHTML = Object.entries(CAPTAINS)
    .map(
      ([id, c]) =>
        `<button class="captain-card" data-captain="${id}"><span class="captain-portrait" style="--captain-coat:${c.coat}">${c.face}</span><span class="captain-card-copy"><b>${c.name}</b><small>${c.title}</small></span></button>`
    )
    .join('');
  $$('[data-captain]').forEach(
    (b) =>
      (b.onclick = () => {
        if (me.captainLocked) return;
        me.captain = b.dataset.captain;
        me.captainLocked = true;
        captainReady = true;
        markLobby();
        socket.emit('captain', b.dataset.captain);
      })
  );
  $('#factions').innerHTML = Object.entries(FA)
    .map(
      ([k, f]) =>
        `<button data-f="${k}"><span class="flag-emoji">${FLAG_EMOJI[k] || '⚑'}</span><b>${f.name}</b><small>${f.note}</small></button>`
    )
    .join('');
  $$('#factions button').forEach(
    (b) =>
      (b.onclick = () => {
        if (me.factionLocked) return;
        me.faction = b.dataset.f;
        me.factionLocked = true;
        factionReady = true;
        markLobby();
        socket.emit('faction', b.dataset.f);
      })
  );
  $('#modes').innerHTML = MODES.map((m) => `<button data-m="${m}">${m}</button>`).join('');
  $$('#modes button').forEach(
    (b) =>
      (b.onclick = () => {
        mode = b.dataset.m;
        markLobby();
      })
  );
  $$('[data-difficulty]').forEach((b) => {
    b.classList.toggle('on', b.dataset.difficulty === practiceDifficulty);
    b.setAttribute('aria-pressed', String(b.dataset.difficulty === practiceDifficulty));
    b.onclick = () => {
      practiceDifficulty = b.dataset.difficulty;
      markLobby();
    };
  });
}
function markLobby() {
  $$('#factions button').forEach((b) => {
    b.classList.toggle('on', b.dataset.f === me.faction);
    b.disabled = !!me.factionLocked;
  });
  $$('#modes button').forEach((b) => b.classList.toggle('on', b.dataset.m === mode));
  $$('[data-difficulty]').forEach((b) => {
    b.classList.toggle('on', b.dataset.difficulty === practiceDifficulty);
    b.setAttribute('aria-pressed', String(b.dataset.difficulty === practiceDifficulty));
  });
  $$('[data-captain]').forEach((b) => {
    b.classList.toggle('on', b.dataset.captain === me.captain);
    b.disabled = !!me.captainLocked;
  });
  $('#captainPrompt').textContent = me.captainLocked
    ? `${CAPTAINS[me.captain]?.name || 'Captain'} is your permanent captain.`
    : 'Choose a captain to continue to battle. Your choice is permanent.';
  $('#flagPrompt').textContent = me.factionLocked
    ? `${FA[me.faction]?.name || 'Faction'} flag permanently chosen.`
    : 'Choose a faction flag. Once selected, it cannot be changed.';
  $('#botDifficultyPrompt').textContent = practiceDifficulty
    ? `${practiceDifficulty[0].toUpperCase()}${practiceDifficulty.slice(1)} practice selected. ${practiceDifficulty === 'easy' ? 'Bots usually sail sloops.' : practiceDifficulty === 'medium' ? 'Bots sail frigates.' : 'Bots sail galleons and Man-of-War ships.'}`
    : 'Choose Easy, Medium, or Hard before practicing against a bot.';
  $('#find').disabled = authState !== 'signedIn' || !captainReady || !factionReady;
  $('#bots').disabled = authState !== 'signedIn' || !captainReady || !factionReady || !practiceDifficulty;
  $('#fleet').textContent = `You will sail the ${SH[me.ship].name}. Change ships in the Shipyard.`;
}
const requirePlayAuth = () => {
  if (authState === 'signedIn' && isSignedIn()) return true;
  $('#qstat').textContent = 'Please sign in to play.';
  if (authState === 'signedOut') {
    show('auth');
    $('#msg').textContent = 'Please sign in to play.';
  }
  return false;
};
$('#find').onclick = () => {
  if (!requirePlayAuth()) return;
  socket.emit('queue', { mode, bots: false });
  $('#qstat').textContent = 'Searching for captains...';
};
$('#bots').onclick = () => {
  if (!requirePlayAuth()) return;
  if (!practiceDifficulty) {
    $('#qstat').textContent = 'Choose Easy, Medium, or Hard to practice.';
    return;
  }
  socket.emit('queue', { mode, bots: true, difficulty: practiceDifficulty });
};
$('#cancel').onclick = () => {
  socket.emit('unqueue');
  $('#qstat').textContent = '';
};
socket.on('queued', (q) => ($('#qstat').textContent = `Waiting for captains: ${q.have} of ${q.need}`));
socket.on('queueError', (message) => ($('#qstat').textContent = message));

// ---------- shipyard ----------
function renderYard() {
  $('#yardWallet').textContent = `✦ ${me.gold.toLocaleString()} GOLD`;
  $('#ships').innerHTML = Object.entries(SH)
    .map(([id, s], index) => {
      const own = me.owned.includes(id),
        sel = me.ship === id;
      return `<button class="ship-card ${sel ? 'on' : ''}" data-inspect="${id}"><span class="ship-card-index">0${index + 1}</span><span class="ship-card-name">${s.name}</span><span class="ship-card-meta">${own ? 'READY TO SAIL' : `LEVEL ${s.level} · ${s.price.toLocaleString()} GOLD`}</span></button>`;
    })
    .join('');
  $$('[data-inspect]').forEach(
    (b) =>
      (b.onclick = () => {
        yardSelected = b.dataset.inspect;
        renderYard();
      })
  );
  const id = yardSelected && SH[yardSelected] ? yardSelected : me.ship,
    s = SH[id],
    t = me.stats[id],
    own = me.owned.includes(id);
  $('#stageName').textContent = s.name;
  $('#stageClass').textContent =
    `${s.slots / 2}-GUN CLASS · ${s.level === 1 ? 'COASTAL' : s.level < 6 ? 'BLUE-WATER' : 'HEAVY FLEET'}`;
  $('#shipTitle').textContent = s.name;
  $('#shipDesc').textContent =
    `${own ? 'A proven vessel in your fleet.' : 'A new hull ready to join your fleet.'} Configure your guns and upgrades before heading into battle.`;
  $('#shipStats').innerHTML = [
    ['HULL', t.hp],
    ['SPEED', t.speed],
    ['TURNING', t.turn],
    ['GUN PORTS', s.slots],
  ]
    .map(([a, b]) => `<div><small>${a}</small><b>${b}</b></div>`)
    .join('');
  $('#shipAction').innerHTML =
    id === me.ship
      ? '<button class="yard-cta" disabled>Currently selected</button>'
      : own
        ? `<button class="yard-cta" data-s="${id}">Select vessel</button>`
        : me.level < s.level
          ? `<button class="yard-cta" disabled>Unlocks at level ${s.level}</button>`
          : `<button class="yard-cta" data-b="${id}" ${me.gold < s.price ? 'disabled' : ''}>Commission · ${s.price.toLocaleString()} gold</button>`;
  const scene = $('#yardScene');
  if (scene) drawYardScene(scene, id);
  $$('[data-s]').forEach((b) => (b.onclick = () => socket.emit('select', b.dataset.s)));
  $$('[data-b]').forEach((b) => (b.onclick = () => socket.emit('buy', b.dataset.b)));
}
let yardSelected = null;
function drawYardScene(canvas, id, captainId = null, factionId = me?.faction) {
  const box = canvas.getBoundingClientRect(),
    dpr = devicePixelRatio || 1;
  canvas.width = Math.max(1, box.width * dpr);
  canvas.height = Math.max(1, box.height * dpr);
  const c = canvas.getContext('2d'),
    w = box.width,
    h = box.height;
  c.scale(dpr, dpr);
  const sky = c.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#89b8bd');
  sky.addColorStop(0.54, '#d1c49f');
  sky.addColorStop(0.55, '#214d5a');
  sky.addColorStop(1, '#0c2937');
  c.fillStyle = sky;
  c.fillRect(0, 0, w, h);
  c.fillStyle = '#f2d79a';
  c.globalAlpha = 0.3;
  c.beginPath();
  c.arc(w * 0.79, h * 0.21, 34, 0, 7);
  c.fill();
  c.globalAlpha = 1;
  for (let i = 0; i < 10; i++) {
    let y = h * (0.62 + i * 0.045);
    c.strokeStyle = `rgba(174,203,187,${0.24 - i * 0.012})`;
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(0, y);
    c.bezierCurveTo(w * 0.3, y - 8, w * 0.68, y + 8, w, y - 3);
    c.stroke();
  }
  c.save();
  c.translate(w * 0.51, h * 0.59);
  c.scale(Math.min(w / 590, 1.05), Math.min(h / 300, 1));
  const len = SH[id].len * 4.2,
    mast = Math.max(92, len * 1.03),
    hullY = 0;
  c.fillStyle = '#071a20';
  c.globalAlpha = 0.42;
  c.beginPath();
  c.ellipse(0, 32, len * 0.58, 20, 0, 0, 7);
  c.fill();
  c.globalAlpha = 1;
  // carved hull, deck and copper waterline
  c.beginPath();
  c.moveTo(-len * 0.58, hullY);
  c.lineTo(len * 0.53, hullY);
  c.lineTo(len * 0.42, 25);
  c.quadraticCurveTo(0, 48, -len * 0.48, 24);
  c.closePath();
  const wood = c.createLinearGradient(0, -5, 0, 38);
  wood.addColorStop(0, '#9c633a');
  wood.addColorStop(0.45, '#583522');
  wood.addColorStop(1, '#241b16');
  c.fillStyle = wood;
  c.fill();
  c.strokeStyle = '#d0a35d';
  c.lineWidth = 2;
  c.stroke();
  for (let j = 0; j < 4; j++) {
    c.strokeStyle = 'rgba(224,178,109,.55)';
    c.beginPath();
    c.moveTo(-len * 0.45, 4 + j * 6);
    c.quadraticCurveTo(0, 17 + j * 5, len * 0.42, 3 + j * 5);
    c.stroke();
  }
  c.fillStyle = '#35281c';
  c.fillRect(-len * 0.45, -7, len * 0.88, 9);
  c.fillStyle = '#c39757';
  c.fillRect(-len * 0.38, -11, len * 0.74, 4);
  const count = id === 'sloop' ? 2 : id === 'frigate' ? 3 : 4;
  for (let i = 0; i < count; i++) {
    const x = -len * 0.28 + i * ((len * 0.56) / Math.max(1, count - 1)),
      mh = mast * (i === 1 ? 1 : 0.78);
    c.strokeStyle = '#3a291a';
    c.lineWidth = 5;
    c.beginPath();
    c.moveTo(x, 0);
    c.lineTo(x, -mh);
    c.stroke();
    c.strokeStyle = '#bd985f';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(x - 5, -mh * 0.48);
    c.lineTo(x + 5, -mh * 0.48);
    c.stroke();
    const sw = len * 0.29,
      sh = mh * 0.35,
      top = -mh * 0.85;
    for (let k = 0; k < (i === 1 ? 2 : 1); k++) {
      let sy = top + k * sh * 0.84;
      c.beginPath();
      c.moveTo(x - sw * 0.48, sy + 4);
      c.quadraticCurveTo(x, sy - 7, x + sw * 0.48, sy + 4);
      c.lineTo(x + sw * 0.42, sy + sh);
      c.quadraticCurveTo(x, sy + sh + 10, x - sw * 0.42, sy + sh);
      c.closePath();
      const sg = c.createLinearGradient(x - sw / 2, 0, x + sw / 2, 0);
      sg.addColorStop(0, '#bd9c6a');
      sg.addColorStop(0.5, '#e0c99b');
      sg.addColorStop(1, '#9b7950');
      c.fillStyle = sg;
      c.fill();
      c.strokeStyle = '#513d2c';
      c.lineWidth = 1;
      c.stroke();
      for (let f = -1; f <= 1; f++) {
        c.strokeStyle = 'rgba(75,55,38,.24)';
        c.beginPath();
        c.moveTo(x + f * sw * 0.2, sy + 7);
        c.lineTo(x + f * sw * 0.16, sy + sh - 3);
        c.stroke();
      }
    }
    c.strokeStyle = 'rgba(43,35,28,.75)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(x, -mh);
    c.lineTo(x - sw * 0.55, 0);
    c.moveTo(x, -mh * 0.7);
    c.lineTo(x + sw * 0.5, 0);
    c.stroke();
  }
  const flagMastX = -len * 0.28 + (len * 0.56) / Math.max(1, count - 1);
  drawFactionFlag(c, factionId, flagMastX, -mast, 1.65);
  if (captainId) {
    const captain = CAPTAINS[captainId] || CAPTAINS.mara;
    c.save();
    c.translate(6, -11);
    c.scale(0.8, 0.8);
    c.fillStyle = captain.coat;
    c.beginPath();
    c.moveTo(-6, 0);
    c.lineTo(6, 0);
    c.lineTo(5, 12);
    c.lineTo(-5, 12);
    c.closePath();
    c.fill();
    c.fillStyle = '#b9825a';
    c.beginPath();
    c.arc(0, -4, 4, 0, 7);
    c.fill();
    c.fillStyle = '#35271b';
    c.beginPath();
    c.ellipse(0, -7, 7, 2, 0, 0, 7);
    c.fill();
    c.fillRect(-3, -12, 6, 5);
    c.strokeStyle = '#ded0a9';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(-3, 12);
    c.lineTo(-4, 16);
    c.moveTo(3, 12);
    c.lineTo(4, 16);
    c.stroke();
    c.restore();
  }
  c.restore();
  c.fillStyle = 'rgba(8,25,32,.35)';
  c.fillRect(0, h - 38, w, 38);
}

// ---------- upgrade + gun slot editor ----------
const sc = $('#slots'),
  sx = sc.getContext('2d');
const slotPos = (i, n, side) => ({
  x: sc.width / 2 - sc.width * 0.22 + (i + 0.5) * ((sc.width * 0.44) / n),
  y: sc.height / 2 + (side ? 1 : -1) * sc.height * 0.14,
});
function drawUp() {
  if (!me) return;
  const n = SH[me.ship].slots / 2,
    g = me.stats[me.ship].guns;
  $('#upgradeWallet').textContent = `✦ ${me.gold.toLocaleString()} GOLD`;
  $('#upgradeShipName').textContent = SH[me.ship].name;
  drawYardScene($('#upgradeScene'), me.ship);
  sx.clearRect(0, 0, sc.width, sc.height);
  sx.save();
  sx.translate(sc.width / 2, sc.height / 2);
  hull(sx, sc.width * 0.8, sc.height * 0.2);
  sx.fillStyle = '#8a5a2b';
  sx.fill();
  sx.strokeStyle = '#c8963e';
  sx.stroke();
  sx.restore();
  drawFactionFlag(sx, me.faction, sc.width * 0.15, sc.height * 0.5, 0.72);
  sx.save();
  sx.font = 'bold 12px system-ui';
  sx.textAlign = 'left';
  sx.fillStyle = '#d7bd7c';
  sx.fillText('PORT · Q  ↑ FIRE OUTWARD', 10, 25);
  sx.fillStyle = '#d7bd7c';
  sx.fillText('STARBOARD · E  ↓ FIRE OUTWARD', 10, sc.height - 12);
  for (let side = 0; side < 2; side++) {
    const yDir = side ? 1 : -1;
    // The broadside arrows show where the selected side's guns fire from the hull.
    const mid = slotPos(Math.floor((n - 1) / 2), n, side);
    sx.strokeStyle = side ? '#e29a58' : '#e7d29b';
    sx.fillStyle = sx.strokeStyle;
    sx.lineWidth = 2;
    sx.beginPath();
    sx.moveTo(mid.x, mid.y + yDir * 8);
    sx.lineTo(mid.x, mid.y + yDir * 30);
    sx.stroke();
    sx.beginPath();
    sx.moveTo(mid.x - 5, mid.y + yDir * 23);
    sx.lineTo(mid.x, mid.y + yDir * 30);
    sx.lineTo(mid.x + 5, mid.y + yDir * 23);
    sx.stroke();
    for (let i = 0; i < n; i++) {
      const p = slotPos(i, n, side),
        active = i < g;
      sx.beginPath();
      sx.arc(p.x, p.y, 8, 0, 7);
      sx.fillStyle = active ? '#d5b36c' : '#10232a';
      sx.fill();
      sx.lineWidth = 2;
      sx.strokeStyle = active ? '#fff0bd' : '#75806d';
      sx.stroke();
      if (active) {
        sx.strokeStyle = side ? '#e29a58' : '#e7d29b';
        sx.lineWidth = 3;
        sx.beginPath();
        sx.moveTo(p.x, p.y + yDir * 7);
        sx.lineTo(p.x, p.y + yDir * 18);
        sx.stroke();
      }
    }
  }
  sx.restore();
}
sc.onclick = (e) => {
  const r = sc.getBoundingClientRect(),
    x = ((e.clientX - r.left) * sc.width) / r.width,
    y = ((e.clientY - r.top) * sc.height) / r.height;
  const n = SH[me.ship].slots / 2,
    g = me.stats[me.ship].guns;
  for (let side = 0; side < 2; side++)
    for (let i = 0; i < n; i++) {
      const p = slotPos(i, n, side);
      if (Math.hypot(p.x - x, p.y - y) < 16) return socket.emit('guns', i + 1 === g && g > 1 ? i : i + 1);
    }
};
function renderUp() {
  const u = me.ships[me.ship] || {},
    t = me.stats[me.ship];
  $('#parts').innerHTML = Object.entries(PARTS)
    .map(([k, l]) => {
      const lv = u[k] || 0,
        max = lv >= 5,
        cost = 150 * (lv + 1);
      return `<div><span>${l}</span><i>${'●'.repeat(lv) + '○'.repeat(5 - lv)}</i><button data-p="${k}" ${max || me.gold < cost ? 'disabled' : ''}>${max ? 'Maxed' : cost + ' gold'}</button></div>`;
    })
    .join('');
  $$('[data-p]').forEach((b) => (b.onclick = () => socket.emit('upgrade', b.dataset.p)));
  $('#sheet').innerHTML =
    `<h3>${SH[me.ship].name}</h3>` +
    [
      ['Health', t.hp],
      ['Speed', t.speed],
      ['Turning', t.turn],
      ['Damage per ball', t.dmg],
      ['Guns per side', t.guns],
      ['Reload (seconds)', t.reload],
      ['Range', t.range],
      ['Damage reduction', Math.round(t.armor * 100) + '%'],
    ]
      .map(([a, b]) => `<p><span>${a}</span><b>${b}</b></p>`)
      .join('');
}

// ---------- leaderboard + profile ----------
function loadBoard() {
  $('#rows').innerHTML = '<tr><td>Loading leaderboard…</td></tr>';
  socket.emit('board', (rows) => {
    if (authState !== 'signedIn' || $('#board').hidden) return;
    $('#rows').innerHTML =
      '<tr><th>Captain</th><th>Level</th><th>XP</th><th>Wins</th><th>Sinkings</th></tr>' +
      rows
        .map(
          (r) =>
            `<tr><td>${r.flagUrl ? '<img class="mini-flag" src="' + esc(r.flagUrl) + '" alt=""> ' : ''}${esc(r.name)}</td><td>${r.level}</td><td>${r.xp}</td><td>${r.wins}</td><td>${r.kills}</td></tr>`
        )
        .join('');
  });
}
socket.on('boardError', (message) => {
  if (authState === 'signedIn' && !$('#board').hidden) $('#rows').innerHTML = `<tr><td>${esc(message)}</td></tr>`;
});
function renderProfile() {
  const captain = CAPTAINS[me.captain];
  $('#profileCaptain').innerHTML = captain
    ? `<span class="captain-portrait profile-portrait" style="--captain-coat:${captain.coat}">${captain.face}</span><div><b>${captain.name}</b><small>${captain.title} · CAPTAIN OF THE ${SH[me.ship].name.toUpperCase()}</small></div>`
    : `<span class="captain-portrait profile-portrait">🏴‍☠️</span><div><b>Captain not chosen</b><small>SELECT A CAPTAIN IN PLAY</small></div>`;
  drawYardScene($('#profileScene'), me.ship, me.captain);
  const played = me.wins + me.losses;
  $('#log').innerHTML = [
    ['Captain', me.name],
    ['Level', me.level],
    ['XP', me.xp],
    ['Gold', me.gold],
    ['Flag', FA[me.faction]?.name || 'Not selected'],
    ['Ships owned', me.owned.length],
    ['Battles', played],
    ['Wins', me.wins],
    ['Win rate', played ? Math.round((me.wins / played) * 100) + '%' : 'No battles yet'],
    ['Ships sunk', me.kills],
  ]
    .map(([a, b]) => `<p><b>${esc(a)}:</b> ${esc(b)}</p>`)
    .join('');
}

// ---------- battle ----------
const cv = $('#game'),
  cx = cv.getContext('2d');
const fit = () => {
  cv.width = innerWidth;
  cv.height = innerHeight;
};
addEventListener('resize', () => {
  if (authState !== 'signedIn') return;
  if (G) fit();
  else if (!$('#yard').hidden) renderYard();
  else if (!$('#upgrade').hidden) drawUp();
  else if (!$('#profile').hidden) renderProfile();
});
socket.on('start', (m) => {
  G = { me: m.me, W: m.W, H: m.H, s: null, r: {}, feed: [], ammo: 'ball', paused: false };
  $('#pauseMenu').hidden = true;
  fit();
  show('battle');
  loop();
});
socket.on('state', (s) => {
  if (!G || G.result) return;
  G.s = s;
  G.paused = !!s.paused;
  $('#pauseMenu').hidden = !G.paused;
  s.ev.forEach((t) => G.feed.push({ t, at: performance.now() }));
});
socket.on('pause', (p) => {
  if (!G) return;
  G.paused = !!p.paused;
  $('#pauseMenu').hidden = !G.paused;
});
socket.on('result', (r) => {
  if (!G) return;
  G.result = true;
  G.paused = true;
  $('#pauseMenu').hidden = true;
  $('#resultMenu').hidden = false;
  setMe(r.profile);
  $('#rt').textContent = r.win ? 'Victory' : 'Defeat';
  $('#rb').innerHTML =
    `<p class="result-status"><b>Battle status</b><span>${r.win ? 'Enemy fleet destroyed' : 'Your fleet was defeated'}</span></p><div class="result-stats"><p><span>Gold earned</span><b>✦ ${r.gold}</b></p><p><span>XP earned</span><b>${r.xp}</b></p><p><span>Ships sunk</span><b>${r.kills}</b></p><p><span>Damage dealt</span><b>${r.dmg}</b></p></div>${r.levelUp ? '<p class="level-up">You reached a new level.</p>' : ''}`;
  show('battle');
  $('#resultMenu').hidden = false;
});
$('#back').onclick = () => {
  G = null;
  keys.w = keys.a = keys.s = keys.d = 0;
  $('#resultMenu').hidden = true;
  $('#qstat').textContent = '';
  show('lobby');
};
$('#pauseResume').onclick = () => {
  if (G?.paused) socket.emit('resumeMatch');
};
$('#pauseQuit').onclick = () => {
  if (!G) return;
  socket.emit('leaveMatch');
  G = null;
  keys.w = keys.a = keys.s = keys.d = 0;
  $('#pauseMenu').hidden = true;
  $('#qstat').textContent = '';
  show('lobby');
};
addEventListener('keydown', (e) => {
  if (authState !== 'signedIn') return;
  if (e.key === 'Escape' && G) {
    e.preventDefault();
    if (!G.paused && !G.s?.over) socket.emit('pauseMatch');
    return;
  }
  if (!G || G.paused || G.result || e.repeat) return;
  const k = e.key.toLowerCase();
  keys[k] = 1;
  if (k === 'q') fire(0);
  if (k === 'e') fire(1);
  if (k === '1') G.ammo = 'ball';
  if (k === '2') G.ammo = 'chain';
});
addEventListener('keyup', (e) => delete keys[e.key.toLowerCase()]);
const fire = (side) => {
  if (G && !G.paused) socket.emit('fire', { side, ammo: G.ammo });
};
setInterval(() => {
  if (G)
    socket.emit(
      'input',
      G.paused
        ? { t: 0.5, r: 0 }
        : {
            t: keys.w || keys.arrowup ? 1 : keys.s || keys.arrowdown ? 0 : 0.5,
            r: (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0),
          }
    );
}, 50);

function loop() {
  if (!G) return;
  if (!G.paused) draw();
  requestAnimationFrame(loop);
}
function draw() {
  const s = G.s;
  if (!s) return;
  const W = cv.width,
    H = cv.height,
    you = s.ships.find((x) => x.id === G.me);
  if (!you) return;
  for (const x of s.ships) {
    const r = G.r[x.id] || (G.r[x.id] = { x: x.x, y: x.y, a: x.a });
    if (!x.al && r.sinkAt === undefined) r.sinkAt = performance.now();
    r.x += (x.x - r.x) * 0.4;
    r.y += (x.y - r.y) * 0.4;
    r.a += norm(x.a - r.a) * 0.4;
  }
  let targetCamera = G.r[G.me];
  if (s.over) {
    const lastSunk = s.ships.filter((x) => !x.al).sort((a, b) => (G.r[b.id].sinkAt || 0) - (G.r[a.id].sinkAt || 0))[0];
    if (lastSunk) targetCamera = G.r[lastSunk.id];
  }
  if (!G.cam) G.cam = { x: targetCamera.x, y: targetCamera.y };
  G.cam.x += (targetCamera.x - G.cam.x) * 0.055;
  G.cam.y += (targetCamera.y - G.cam.y) * 0.055;
  const c = G.cam,
    t = performance.now() / 1000;
  cx.fillStyle = '#0b2a3a';
  cx.fillRect(0, 0, W, H);
  cx.save();
  cx.translate(W / 2 - c.x, H / 2 - c.y);
  cx.strokeStyle = 'rgba(234,223,194,.08)';
  cx.lineWidth = 2;
  for (let gx = 0; gx <= G.W; gx += 100)
    for (let gy = 0; gy <= G.H; gy += 100) {
      const k = Math.sin(t + gx * 0.02 + gy * 0.013) * 6;
      cx.beginPath();
      cx.moveTo(gx - 14, gy + k);
      cx.quadraticCurveTo(gx, gy + k - 8, gx + 14, gy + k);
      cx.stroke();
    }
  cx.strokeStyle = '#c8963e';
  cx.lineWidth = 4;
  cx.strokeRect(0, 0, G.W, G.H);
  for (const b of s.balls) {
    cx.fillStyle = b[2] ? '#e07a3f' : '#eadfc2';
    cx.beginPath();
    cx.arc(b[0], b[1], 4, 0, 7);
    cx.fill();
  }
  // Draw both broadside firing ranges in world space around the interpolated player ship.
  const playerRender = G.r[you.id];
  for (let side = 0; side < 2 && you.al && !s.over; side++) {
    const dir = playerRender.a + ((side ? 1 : -1) * Math.PI) / 2,
      endX = playerRender.x + Math.cos(dir) * you.rg,
      endY = playerRender.y + Math.sin(dir) * you.rg;
    const perpX = -Math.sin(dir),
      perpY = Math.cos(dir),
      startW = you.l * 0.43,
      endW = you.l * 0.43 + you.rg * 0.055;
    const contact = broadsideCanHit(you, s.ships, side);
    const color = contact ? '#82e6a0' : side ? '#e99a61' : '#f0d58d';
    cx.beginPath();
    cx.moveTo(playerRender.x + perpX * startW, playerRender.y + perpY * startW);
    cx.lineTo(endX + perpX * endW, endY + perpY * endW);
    cx.lineTo(endX - perpX * endW, endY - perpY * endW);
    cx.lineTo(playerRender.x - perpX * startW, playerRender.y - perpY * startW);
    cx.closePath();
    cx.fillStyle = contact ? 'rgba(91,218,131,.24)' : 'rgba(232,190,103,.13)';
    cx.fill();
    cx.strokeStyle = contact ? 'rgba(130,230,160,.9)' : 'rgba(235,200,125,.55)';
    cx.lineWidth = contact ? 2 : 1;
    cx.stroke();
    cx.beginPath();
    cx.moveTo(playerRender.x, playerRender.y);
    cx.lineTo(endX, endY);
    cx.strokeStyle = color;
    cx.lineWidth = contact ? 2 : 1;
    cx.setLineDash([9, 8]);
    cx.stroke();
    cx.setLineDash([]);
  }
  for (const x of s.ships) {
    const r = G.r[x.id],
      l = x.l,
      health = x.hp / x.mx;
    if (!x.al && r.sinkAt === undefined) r.sinkAt = performance.now();
    const sink = x.al ? 0 : Math.max(0, Math.min(1, (performance.now() - r.sinkAt) / 2800));
    cx.save();
    cx.translate(r.x, r.y + sink * 11);
    cx.rotate(r.a + sink * 0.32);
    cx.scale(1, Math.max(0.2, 1 - sink * 0.72));
    cx.globalAlpha = x.al ? 1 : Math.max(0.16, 1 - sink * 0.8);
    // Isometric deck and hull
    cx.fillStyle = '#0007';
    cx.beginPath();
    cx.ellipse(0, l * 0.12, l * 0.58, l * 0.29, 0, 0, 7);
    cx.fill();
    cx.fillStyle = !x.al ? '#555' : x.tm === you.tm ? '#4c4535' : '#614132';
    hull(cx, l, l * 0.24);
    cx.fill();
    cx.lineWidth = x.id === G.me ? 2.5 : 1;
    cx.strokeStyle = x.id === G.me ? '#f2d27a' : '#17120d';
    cx.stroke();
    cx.strokeStyle = '#c79a5b';
    cx.lineWidth = 1;
    cx.beginPath();
    cx.moveTo(-l * 0.37, 0);
    cx.quadraticCurveTo(0, l * 0.04, l * 0.42, 0);
    cx.stroke();
    // Extended gun barrels make the two firing sides visible at battle scale.
    const guns = Math.max(1, x.gn || 2);
    for (let side = 0; side < 2; side++)
      for (let i = 0; i < guns; i++) {
        const px = guns === 1 ? 0 : -l * 0.32 + i * ((l * 0.64) / (guns - 1)),
          py = (side ? 1 : -1) * l * 0.145,
          tipY = (side ? 1 : -1) * l * 0.43;
        cx.strokeStyle = '#19130e';
        cx.lineWidth = Math.max(2, l * 0.045);
        cx.beginPath();
        cx.moveTo(px, py);
        cx.lineTo(px, tipY);
        cx.stroke();
        cx.strokeStyle = x.id === G.me ? '#e2c17e' : '#b79661';
        cx.lineWidth = Math.max(1, l * 0.022);
        cx.beginPath();
        cx.moveTo(px, py);
        cx.lineTo(px, tipY);
        cx.stroke();
      }
    // Mast, furled deck detail and small billowing sails make the battle view read in depth.
    cx.fillStyle = '#ad8b58';
    cx.fillRect(-l * 0.035, -l * 0.045, l * 0.07, l * 0.09);
    const mastX = -l * 0.04,
      mastH = l * 0.66;
    cx.strokeStyle = '#342518';
    cx.lineWidth = Math.max(1, l * 0.025);
    cx.beginPath();
    cx.moveTo(mastX, 0);
    cx.lineTo(mastX, -mastH);
    cx.stroke();
    cx.fillStyle = x.tm === you.tm ? '#c9b78e' : '#a97f66';
    cx.beginPath();
    cx.moveTo(mastX + 1, -mastH * 0.9);
    cx.quadraticCurveTo(mastX + l * 0.28, -mastH * 0.76, mastX + l * 0.24, -mastH * 0.36);
    cx.quadraticCurveTo(mastX + l * 0.1, -mastH * 0.3, mastX + 1, -mastH * 0.35);
    cx.closePath();
    cx.fill();
    cx.strokeStyle = '#413529';
    cx.lineWidth = 0.7;
    cx.stroke();
    cx.strokeStyle = '#211a13';
    cx.lineWidth = 0.7;
    cx.beginPath();
    cx.moveTo(mastX, -mastH);
    cx.lineTo(-l * 0.44, l * 0.04);
    cx.moveTo(mastX, -mastH * 0.8);
    cx.lineTo(l * 0.42, l * 0.03);
    cx.stroke();
    drawFactionFlag(cx, x.fc, mastX, -mastH, 0.9);
    // Damage marks appear progressively as hull integrity falls.
    const scars = health < 0.85 ? Math.ceil((0.85 - health) * 13) : 0;
    for (let i = 0; i < scars; i++) {
      const px = -l * 0.34 + ((i * 17) % Math.max(8, Math.floor(l * 0.68))),
        py = (i % 2 ? 1 : -1) * l * (0.12 + ((i * 7) % 8) / 100);
      cx.strokeStyle = i % 3 === 0 ? '#241713' : '#d2a56e';
      cx.lineWidth = i % 3 === 0 ? 1.6 : 1;
      cx.beginPath();
      cx.moveTo(px, py);
      cx.lineTo(px + l * 0.04, py + (i % 2 ? 2 : -2));
      cx.lineTo(px + l * 0.065, py + (i % 2 ? -1 : 2));
      cx.stroke();
    }
    if (health <= 0.35) {
      const fractures = [
        [
          [-0.31, -0.18],
          [-0.23, -0.08],
          [-0.27, -0.01],
          [-0.08, 0.04],
          [-0.02, 0.19],
        ],
        [
          [0.31, 0.17],
          [0.22, 0.08],
          [0.25, -0.02],
          [0.06, -0.07],
          [-0.08, -0.2],
        ],
        [
          [-0.03, 0.08],
          [0.05, 0.01],
          [0.13, 0.04],
          [0.2, -0.08],
        ],
      ];
      cx.save();
      hull(cx, l, l * 0.24);
      cx.clip();
      cx.lineCap = 'round';
      cx.lineJoin = 'round';
      for (let p = 0; p < fractures.length; p++) {
        const points = fractures[p];
        cx.beginPath();
        points.forEach(([px, py], i) => (i ? cx.lineTo(px * l, py * l) : cx.moveTo(px * l, py * l)));
        cx.strokeStyle = '#1a0f0c';
        cx.lineWidth = Math.max(1.8, l * 0.052);
        cx.stroke();
        cx.beginPath();
        points.forEach(([px, py], i) => (i ? cx.lineTo(px * l, py * l) : cx.moveTo(px * l, py * l)));
        cx.strokeStyle = '#d9ad68';
        cx.lineWidth = Math.max(0.7, l * 0.016);
        cx.stroke();
      }
      cx.restore();
    }
    if (health < 0.3) {
      cx.fillStyle = 'rgba(32,28,25,.55)';
      cx.beginPath();
      cx.arc(-l * 0.2, -l * 0.27, l * 0.08, 0, 7);
      cx.fill();
    }
    cx.restore();
    if (!x.al) {
      const fade = Math.max(0, 1 - sink * 0.82),
        swell = l * (0.24 + sink * 0.34);
      cx.save();
      cx.translate(r.x, r.y + sink * 11);
      cx.globalAlpha = fade * 0.65;
      cx.strokeStyle = '#78b9b3';
      cx.lineWidth = 1.5;
      for (let ring = 0; ring < 2; ring++) {
        cx.beginPath();
        cx.ellipse(0, 0, swell + ring * l * 0.18, (swell + ring * l * 0.18) * 0.42, 0, 0, Math.PI * 2);
        cx.stroke();
      }
      cx.rotate(r.a + sink * 0.32);
      cx.globalAlpha = Math.min(0.75, sink * 1.2);
      for (let wave = 0; wave < 2; wave++) {
        const wy = (wave ? 1 : -1) * l * 0.12 + sink * l * 0.16;
        cx.strokeStyle = '#418b91';
        cx.lineWidth = Math.max(2, l * 0.07);
        cx.beginPath();
        cx.moveTo(-l * 0.48, wy);
        cx.quadraticCurveTo(-l * 0.18, wy - l * 0.08, l * 0.08, wy);
        cx.quadraticCurveTo(l * 0.3, wy + l * 0.07, l * 0.5, wy - l * 0.01);
        cx.stroke();
      }
      cx.restore();
    }
    if (x.al) {
      cx.fillStyle = '#000a';
      cx.fillRect(r.x - 25, r.y - l * 0.6 - 8, 50, 6);
      cx.fillStyle = x.hp / x.mx > 0.35 ? '#7ed36b' : '#e5483a';
      cx.fillRect(r.x - 25, r.y - l * 0.6 - 8, (50 * x.hp) / x.mx, 6);
      cx.fillStyle = '#eadfc2';
      cx.font = '12px system-ui';
      cx.textAlign = 'center';
      cx.fillText(x.n, r.x, r.y - l * 0.6 - 12);
    }
  }
  cx.restore();
  hud(s, you, W, H);
}
function bar(x, y, w, f, col, label) {
  cx.fillStyle = '#000a';
  cx.fillRect(x, y, w, 16);
  cx.fillStyle = col;
  cx.fillRect(x, y, w * Math.max(0, Math.min(1, f)), 16);
  cx.fillStyle = '#fff';
  cx.font = '12px system-ui';
  cx.textAlign = 'left';
  cx.fillText(label, x + 6, y + 12);
}
function hud(s, you, W, H) {
  const portContact = broadsideCanHit(you, s.ships, 0),
    starboardContact = broadsideCanHit(you, s.ships, 1);
  cx.font = 'bold 12px system-ui';
  cx.textAlign = 'left';
  cx.fillStyle = portContact ? '#91edaa' : '#e7d29b';
  cx.fillText(`PORT Q · ${portContact ? 'TARGET IN RANGE' : 'CLEAR'}`, 20, H - 123);
  cx.fillStyle = starboardContact ? '#91edaa' : '#e9a16b';
  cx.fillText(`STARBOARD E · ${starboardContact ? 'TARGET IN RANGE' : 'CLEAR'}`, 150, H - 123);
  bar(20, H - 100, 240, you.hp / you.mx, '#7ed36b', `Hull ${you.hp} / ${you.mx}`);
  bar(20, H - 76, 240, 1 - you.rl[0] / you.rt, '#c8963e', 'Port guns (Q)');
  bar(20, H - 52, 240, 1 - you.rl[1] / you.rt, '#c8963e', 'Starboard guns (E)');
  cx.fillStyle = '#eadfc2';
  cx.font = '14px system-ui';
  cx.textAlign = 'left';
  cx.fillText(
    `Ammo: ${G.ammo === 'ball' ? 'Cannonball (1)' : 'Chain shot (2, slows enemies)'}   W/S speed, A/D steer`,
    20,
    H - 24
  );
  cx.textAlign = 'center';
  cx.font = '20px Georgia';
  cx.fillText(`${Math.floor(s.left / 60)}:${String(s.left % 60).padStart(2, '0')}`, W / 2, 30);
  cx.textAlign = 'right';
  cx.font = '13px system-ui';
  s.ships
    .slice()
    .sort((a, b) => a.tm - b.tm)
    .forEach((x, i) => {
      cx.fillStyle = x.al ? (x.tm === you.tm ? '#7fd1bb' : '#ff9d8e') : '#777';
      cx.fillText(`${x.n}  ${x.al ? x.hp : 'sunk'}`, W - 20, 24 + i * 18);
    });
  G.feed = G.feed.filter((f) => performance.now() - f.at < 6000);
  cx.textAlign = 'right';
  cx.fillStyle = '#f2d27a';
  G.feed.slice(-5).forEach((f, i) => cx.fillText(f.t, W - 20, H - 24 - i * 18));
  if (!you.al) {
    cx.textAlign = 'center';
    cx.font = '28px Georgia';
    cx.fillStyle = '#eadfc2';
    cx.fillText('Your ship has sunk. Watching your crew...', W / 2, H / 2);
  }
}

// ---------- cloud extras: sign out, flag upload (S3), admin panel (Cognito group Admins) ----------
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
const signoutDialog = $('#signoutDialog');
let signoutFocusReturn = null;
function closeSignoutDialog() {
  if (signoutDialog.open) signoutDialog.close();
  signoutFocusReturn?.focus();
}
$('#signout').onclick = (event) => {
  signoutFocusReturn = event.currentTarget;
  $('#signoutBattle').hidden = !G;
  signoutDialog.showModal();
  $('#confirmSignout').focus();
};
$('#cancelSignout').onclick = closeSignoutDialog;
signoutDialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  closeSignoutDialog();
});
signoutDialog.addEventListener('click', (event) => {
  if (event.target === signoutDialog) closeSignoutDialog();
});
$('#confirmSignout').onclick = async () => {
  const button = $('#confirmSignout');
  button.disabled = true;
  socket.emit('leaveMatch');
  G = null;
  me = null;
  SH = FA = MODES = null;
  adminState = false;
  yardSelected = null;
  captainReady = factionReady = false;
  mode = '1v1';
  practiceDifficulty = null;
  Object.keys(keys).forEach((k) => delete keys[k]);
  $('#who').textContent = '';
  $('#adminNav').hidden = true;
  $('#rows').replaceChildren();
  $('#adminRows').replaceChildren();
  [
    'captains',
    'factions',
    'modes',
    'ships',
    'parts',
    'sheet',
    'shipStats',
    'shipAction',
    'log',
    'profileCaptain',
  ].forEach((id) => {
    const element = document.getElementById(id);
    if (element) element.replaceChildren();
  });
  [
    'fleet',
    'captainPrompt',
    'flagPrompt',
    'yardWallet',
    'upgradeWallet',
    'shipTitle',
    'shipDesc',
    'stageName',
    'stageClass',
    'upgradeShipName',
  ].forEach((id) => {
    const element = document.getElementById(id);
    if (element) element.textContent = '';
  });
  ['yardScene', 'upgradeScene', 'profileScene', 'slots'].forEach((id) => {
    const canvas = document.getElementById(id);
    if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  });
  cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
  $('#pauseMenu').hidden = true;
  $('#resultMenu').hidden = true;
  $('#rt').textContent = '';
  $('#rb').replaceChildren();
  $('#flagImg').removeAttribute('src');
  $('#flagImg').hidden = true;
  $('#flagFile').value = '';
  $('#flagMsg').textContent = '';
  $('#authEmail').value = '';
  $('#authPassword').value = '';
  $('#msg').textContent = '';
  $('#qstat').textContent = '';
  setAuthState('signedOut');
  signoutDialog.close();
  show('auth');
  try {
    await signOutUser();
  } catch (error) {
    $('#msg').textContent = `Could not sign out: ${error.message || error}`;
    button.disabled = false;
  }
};
async function renderFlag() {
  const img = $('#flagImg'),
    profile = me;
  try {
    const url = profile?.flagPath ? await getFlagUrl(profile.flagPath) : null;
    if (me !== profile || authState !== 'signedIn') return;
    img.hidden = !url;
    if (url) img.src = url;
    else img.removeAttribute('src');
  } catch {
    if (me === profile) img.hidden = true;
  }
}
$('#flagUp').onclick = async () => {
  const f = $('#flagFile').files[0],
    msg = $('#flagMsg');
  if (!f) return (msg.textContent = 'Choose an image first.');
  msg.textContent = 'Uploading to Amazon S3...';
  try {
    await uploadFlag(f);
    msg.textContent = 'Flag image saved.';
    renderFlag();
  } catch (e) {
    msg.textContent = e.message || 'Upload failed.';
  }
};
async function loadAdmin() {
  $('#adminRows').innerHTML = '<tr><td>Loading player records…</td></tr>';
  try {
    const rows = (await listPlayers()).sort((x, y) => (y.xp || 0) - (x.xp || 0));
    if (authState !== 'signedIn' || !adminState || $('#admin').hidden) return;
    $('#adminRows').innerHTML =
      '<tr><th>Captain</th><th>XP</th><th>Gold</th><th>Wins</th><th></th></tr>' +
      rows
        .map(
          (r) =>
            `<tr><td>${esc(r.displayName)}</td><td>${r.xp || 0}</td><td>${r.gold || 0}</td><td>${r.wins || 0}</td><td><button data-del="${esc(r.id)}">Delete</button></td></tr>`
        )
        .join('');
    $$('[data-del]').forEach(
      (b) =>
        (b.onclick = async () => {
          if (confirm('Delete this player record?')) {
            await deletePlayer(b.dataset.del);
            loadAdmin();
          }
        })
    );
  } catch (error) {
    $('#adminRows').innerHTML = `<tr><td>${esc(error.message || error)}</td></tr>`;
  }
}
