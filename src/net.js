// Network layer. Exposes a small "socket-like" object so the UI code (app.js) did not need to change,
// but every event is now served by AWS: Cognito (login), REST API (game rules), AppSync (leaderboard), S3 (images).
// Battles run in the browser against bots (serverless = no always-on game server); results are validated by the Lambda.
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { post } from 'aws-amplify/api';
import { signIn as amplifySignIn, signUp, signOut, getCurrentUser, fetchAuthSession } from 'aws-amplify/auth';
import { uploadData, getUrl } from 'aws-amplify/storage';
import { Hub } from 'aws-amplify/utils';
import outputs from '../amplify_outputs.json';
import { SHIPS, FACTIONS, MODES, CAPTAINS, levelFor, stats } from '../shared/data';
import * as G from './game.js';

Amplify.configure(outputs);
const restApi = outputs.custom?.API?.REST?.['blacktide-rest'] || outputs.custom?.API?.['blacktide-rest'];
if (restApi?.endpoint) {
  const config = Amplify.getConfig();
  Amplify.configure({
    ...config,
    API: {
      ...config.API,
      REST: { 'blacktide-rest': { endpoint: restApi.endpoint, region: restApi.region } },
    },
  });
}
const client = generateClient();
const handlers = {};
let player = null,
  M = null,
  timer = null,
  human = null,
  authState = 'loading',
  admin = false;
export const isSignedIn = () => authState === 'signedIn';

const emitLocal = (ev, data) => (handlers[ev] || []).forEach((fn) => fn(data));
const parse = (v) => (typeof v === 'string' ? JSON.parse(v || '{}') : v || {});

// ---------- REST API (API Gateway + Lambda, Cognito protected) ----------
async function api(action, body = {}) {
  const token = (await fetchAuthSession()).tokens?.idToken?.toString();
  const { body: res } = await post({
    apiName: 'blacktide-rest',
    path: '/game',
    options: { headers: { Authorization: token }, body: { action, ...body } },
  }).response;
  return res.json();
}
const apply = (r) => {
  if (!isSignedIn()) return r;
  player = r.player;
  emitLocal('profile', toProfile(player));
  return r;
};

function toProfile(p) {
  const u = { ships: parse(p.shipConfigs) },
    xp = p.xp || 0;
  return {
    name: p.displayName || 'Captain',
    gold: p.gold || 0,
    xp,
    level: levelFor(xp),
    faction: FACTIONS[p.faction] ? p.faction : null,
    factionLocked: !!p.faction,
    captain: CAPTAINS.includes(p.captain) ? p.captain : null,
    captainLocked: !!p.captain,
    ship: p.ship || 'sloop',
    owned: p.owned || ['sloop'],
    ships: u.ships,
    flagPath: p.flagPath || null,
    wins: p.wins || 0,
    losses: p.losses || 0,
    kills: p.kills || 0,
    stats: Object.fromEntries(Object.keys(SHIPS).map((id) => [id, stats(u, id, p.faction)])),
  };
}

// ---------- auth ----------
const waitForOAuthRedirect = () =>
  new Promise((resolve) => {
    if (!new URLSearchParams(location.search).has('code')) return resolve();
    const stop = Hub.listen('auth', ({ payload }) => {
      if (['signInWithRedirect', 'signInWithRedirect_failure'].includes(payload.event)) {
        stop();
        resolve();
      }
    });
    setTimeout(() => {
      stop();
      resolve();
    }, 8000);
  });
async function boot() {
  authState = 'loading';
  await waitForOAuthRedirect();
  if (new URLSearchParams(location.search).has('code')) history.replaceState({}, '', location.pathname);
  let session;
  try {
    await getCurrentUser();
    session = await fetchAuthSession();
    if (!session.tokens?.idToken) throw new Error('No active sign-in session.');
  } catch {
    authState = 'signedOut';
    admin = false;
    return { signedOut: true };
  }
  const groupsOf = (s) => s.tokens?.idToken?.payload['cognito:groups'] || [];
  if (!groupsOf(session).length) session = await fetchAuthSession({ forceRefresh: true }).catch(() => session);
  admin = groupsOf(session).includes('Admins');
  authState = 'signedIn';
  try {
    const c = session.tokens?.idToken?.payload;
    const result = await api('init', {
      displayName: String(c?.name || c?.email || 'Captain')
        .split('@')[0]
        .slice(0, 16),
    });
    player = result.player;
    return { profile: toProfile(player), ships: SHIPS, factions: FACTIONS, modes: Object.keys(MODES), admin };
  } catch (e) {
    console.error(e);
    return { error: 'Could not load your profile: ' + (e?.message || e) };
  }
}
export async function createAccount(email, password) {
  return signUp({ username: email, password, options: { userAttributes: { email } } });
}
export async function signIn(email, password) {
  return amplifySignIn({ username: email, password });
}
export const signOutUser = async () => {
  clearInterval(timer);
  timer = null;
  M = null;
  human = null;
  player = null;
  admin = false;
  authState = 'signedOut';
  await signOut();
  location.reload();
};

// ---------- GraphQL (AppSync): leaderboard + admin ----------
export async function listPlayers() {
  let out = [],
    nextToken;
  do {
    const r = await client.models.Player.list({ limit: 500, nextToken });
    out = out.concat(r.data);
    nextToken = r.nextToken;
  } while (nextToken);
  return out;
}
export const deletePlayer = (id) => client.models.Player.delete({ id });
async function board() {
  const top = (await listPlayers()).sort((a, b) => (b.xp || 0) - (a.xp || 0)).slice(0, 10);
  return Promise.all(
    top.map(async (r) => ({
      name: r.displayName || 'Captain',
      level: levelFor(r.xp || 0),
      xp: r.xp || 0,
      wins: r.wins || 0,
      kills: r.kills || 0,
      flagUrl: r.flagPath ? await getFlagUrl(r.flagPath).catch(() => null) : null,
    }))
  );
}

// ---------- S3: flag images ----------
export const getFlagUrl = async (path) => (await getUrl({ path })).url.toString();
export async function uploadFlag(file) {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.');
  if (file.size > 2 * 1024 * 1024) throw new Error('Image must be smaller than 2 MB.');
  const safe = file.name.replace(/[^\w.-]/g, '_').slice(-60);
  const res = await uploadData({
    path: ({ identityId }) => `flags/${identityId}/${Date.now()}-${safe}`,
    data: file,
    options: { contentType: file.type },
  }).result;
  apply(await api('setFlag', { flagPath: res.path }));
}

// ---------- local battle vs bots (same game rules as before) ----------
async function startLocal(mode, difficulty) {
  if (!isSignedIn()) return emitLocal('queueError', 'Please sign in to play.');
  if (!['easy', 'medium', 'hard'].includes(difficulty))
    return emitLocal('queueError', 'Choose Easy, Medium, or Hard to practice.');
  try {
    await api('startMatch', { mode });
  } catch (e) {
    return emitLocal('queueError', 'Could not start the battle: ' + (e?.message || e));
  }
  if (!isSignedIn() || !player) return;
  const user = {
    name: player.displayName,
    ship: player.ship,
    faction: player.faction,
    ships: parse(player.shipConfigs),
  };
  M = G.createMatch('local', mode, [{ sock: true, user }], true, difficulty);
  human = M.ships.find((s) => s.id === 'p0');
  emitLocal('start', { me: 'p0', W: G.W, H: G.H, mode });
  clearInterval(timer);
  timer = setInterval(step, 50);
}
const stopLocal = () => {
  clearInterval(timer);
  M = null;
  human = null;
};
function step() {
  if (!M) return;
  const ev = M.paused || M.over ? [] : G.tick(M, 0.05);
  if (M.over && !M.finishAt) M.finishAt = Date.now() + 3200;
  emitLocal('state', { ...G.snapshot(M), ev, paused: M.paused });
  if (M.over && Date.now() >= M.finishAt) finishLocal();
}
async function finishLocal() {
  const win = human.team === M.winner,
    report = { win, kills: human.kills, dmg: Math.round(human.dmg) };
  stopLocal();
  const before = levelFor(player.xp || 0);
  try {
    const r = await api('matchResult', report);
    if (!isSignedIn() || !player) return;
    apply(r);
    emitLocal('result', {
      win,
      gold: r.gold,
      xp: r.xp,
      kills: r.kills,
      dmg: r.dmg,
      levelUp: levelFor(player.xp) > before,
      profile: toProfile(player),
    });
  } catch (e) {
    console.error(e);
    emitLocal('result', {
      win,
      gold: 0,
      xp: 0,
      kills: report.kills,
      dmg: report.dmg,
      levelUp: false,
      profile: toProfile(player),
    });
  }
}

// ---------- the socket-like facade used by app.js ----------
export const socket = {
  on(ev, fn) {
    (handlers[ev] ||= []).push(fn);
  },
  emit(ev, data, cb) {
    const act = (name, body) =>
      api(name, body)
        .then(apply)
        .catch((e) => console.error(name, e));
    switch (ev) {
      case 'auth':
        return boot().then(cb);
      case 'leaveMatch':
        return stopLocal();
      default:
        if (!isSignedIn()) return emitLocal('queueError', 'Please sign in to play.');
    }
    switch (ev) {
      case 'captain':
        return act('choose', { captain: data });
      case 'faction':
        return act('choose', { faction: data });
      case 'select':
        return act('select', { ship: data });
      case 'buy':
        return act('buyShip', { ship: data });
      case 'upgrade':
        return act('upgrade', { part: data });
      case 'guns':
        return act('setGuns', { n: data });
      case 'board':
        return board()
          .then(data)
          .catch((error) => emitLocal('boardError', error?.message || 'Could not load leaderboard.'));
      case 'queue':
        return data.bots
          ? startLocal(data.mode, data.difficulty)
          : emitLocal(
              'queueError',
              'Live player-vs-player needs an always-on game server, so this serverless version offers battles against bots. Use "Practice against bots".'
            );
      case 'input':
        if (human && data) {
          human.in.t = Math.max(0, Math.min(1, +data.t || 0));
          human.in.r = Math.max(-1, Math.min(1, +data.r || 0));
        }
        return;
      case 'fire':
        if (M && human && !M.paused && data)
          G.fire(M, human, data.side ? 1 : 0, data.ammo === 'chain' ? 'chain' : 'ball');
        return;
      case 'pauseMatch':
        if (M && !M.over) {
          M.paused = true;
          emitLocal('pause', { paused: true });
        }
        return;
      case 'resumeMatch':
        if (M && M.paused && !M.over) {
          M.paused = false;
          emitLocal('pause', { paused: false });
        }
        return;
      case 'leaveMatch':
        return stopLocal();
      default:
        return undefined;
    }
  },
};
