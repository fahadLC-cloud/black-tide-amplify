/* eslint-disable @typescript-eslint/no-explicit-any */
import type { APIGatewayProxyHandler } from 'aws-lambda';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import { env } from '$amplify/env/game-api';
import type { Schema } from '../../data/resource';
import { SHIPS, FACTIONS, CAPTAINS, MODES, PARTS, MAX_UPGRADE, upgradeCost, rewards } from '../../../shared/data';

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);
const db: any = generateClient<Schema>().models.Player;

const json = (statusCode: number, body: unknown) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  body: JSON.stringify(body),
});
const cfgOf = (p: any) => (typeof p.shipConfigs === 'string' ? JSON.parse(p.shipConfigs || '{}') : p.shipConfigs || {});
const clean = (s: unknown) =>
  String(s ?? '')
    .replace(/[<>"'&]/g, '')
    .trim()
    .slice(0, 16);

// Requirement 3 (REST half): one Cognito-protected endpoint, POST /game, all game rules are enforced here.
export const handler: APIGatewayProxyHandler = async (event) => {
  const sub = event.requestContext.authorizer?.claims?.sub as string | undefined;
  if (!sub) return json(401, { error: 'Not signed in' });
  let req: any;
  try {
    req = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Bad JSON' });
  }
  const action = String(req.action || '');
  console.log(JSON.stringify({ level: 'info', msg: 'request', action, sub }));

  try {
    const save = async (fields: Record<string, unknown>) => {
      const { data, errors } = await db.update({ id: sub, ...fields });
      if (errors?.length) throw new Error(errors[0].message);
      return data;
    };
    let { data: p } = await db.get({ id: sub });

    if (action === 'init') {
      if (!p) {
        const res = await db.create({
          id: sub,
          displayName: clean(req.displayName) || 'Captain',
          ship: 'sloop',
          owned: ['sloop'],
          shipConfigs: '{}',
          gold: 500,
          xp: 0,
          wins: 0,
          losses: 0,
          kills: 0,
        });
        if (res.errors?.length) throw new Error(res.errors[0].message);
        p = res.data;
        console.log(JSON.stringify({ level: 'info', msg: 'player created', sub }));
      }
      return json(200, { player: p });
    }
    if (!p) return json(404, { error: 'Call init first' });

    switch (action) {
      case 'choose': {
        // captain and faction are permanent once chosen
        const f: Record<string, unknown> = {};
        if (req.captain && !p.captain && CAPTAINS.includes(req.captain)) f.captain = req.captain;
        if (req.faction && !p.faction && FACTIONS[req.faction]) f.faction = req.faction;
        return json(200, { player: Object.keys(f).length ? await save(f) : p });
      }
      case 'select':
        if (!(p.owned || []).includes(req.ship)) return json(400, { error: 'You do not own that ship' });
        return json(200, { player: await save({ ship: req.ship }) });
      case 'buyShip': {
        const s = SHIPS[req.ship];
        const level = 1 + Math.floor(Math.sqrt((p.xp || 0) / 100));
        if (!s || (p.owned || []).includes(req.ship)) return json(400, { error: 'Invalid ship' });
        if (level < s.level) return json(400, { error: `Requires level ${s.level}` });
        if ((p.gold || 0) < s.price) return json(400, { error: 'Not enough gold' });
        return json(200, {
          player: await save({ gold: p.gold - s.price, owned: [...p.owned, req.ship], ship: req.ship }),
        });
      }
      case 'upgrade': {
        if (!PARTS.includes(req.part)) return json(400, { error: 'Invalid part' });
        const cfg = cfgOf(p),
          c = cfg[p.ship] || (cfg[p.ship] = { hull: 0, sails: 0, cannons: 0, armor: 0, guns: SHIPS[p.ship].slots / 2 });
        const cost = upgradeCost(c[req.part]);
        if (c[req.part] >= MAX_UPGRADE) return json(400, { error: 'Already maxed' });
        if ((p.gold || 0) < cost) return json(400, { error: 'Not enough gold' });
        c[req.part]++;
        return json(200, { player: await save({ gold: p.gold - cost, shipConfigs: JSON.stringify(cfg) }) });
      }
      case 'setGuns': {
        const cfg = cfgOf(p),
          c = cfg[p.ship] || (cfg[p.ship] = { hull: 0, sails: 0, cannons: 0, armor: 0 });
        c.guns = Math.max(1, Math.min(SHIPS[p.ship].slots / 2, Math.round(Number(req.n)) || 1));
        return json(200, { player: await save({ shipConfigs: JSON.stringify(cfg) }) });
      }
      case 'setFlag': {
        const path = String(req.flagPath || '');
        if (!path.startsWith('flags/') || path.length > 200 || path.includes('..'))
          return json(400, { error: 'Invalid path' });
        return json(200, { player: await save({ flagPath: path }) });
      }
      case 'startMatch':
        if (!MODES[req.mode]) return json(400, { error: 'Invalid mode' });
        return json(200, { player: await save({ matchStartedAt: Date.now(), matchMode: req.mode }) });
      case 'matchResult': {
        // Anti-cheat basics: a match must have been started, last 15s..20min, and rewards are capped by mode size.
        const secs = (Date.now() - (p.matchStartedAt || 0)) / 1000,
          n = MODES[p.matchMode];
        if (!n || secs < 15 || secs > 1200) return json(400, { error: 'No valid match in progress' });
        const kills = Math.max(0, Math.min(n, Math.floor(Number(req.kills) || 0)));
        const dmg = Math.max(0, Math.min(1500 * n, Math.round(Number(req.dmg) || 0)));
        const win = !!req.win,
          r = rewards(win, kills, dmg);
        const player = await save({
          gold: (p.gold || 0) + r.gold,
          xp: (p.xp || 0) + r.xp,
          wins: (p.wins || 0) + (win ? 1 : 0),
          losses: (p.losses || 0) + (win ? 0 : 1),
          kills: (p.kills || 0) + kills,
          matchStartedAt: 0,
          matchMode: '',
        });
        console.log(JSON.stringify({ level: 'info', msg: 'match recorded', sub, win, kills, dmg, ...r }));
        return json(200, { player, gold: r.gold, xp: r.xp, kills, dmg });
      }
      default:
        return json(400, { error: 'Unknown action' });
    }
  } catch (e) {
    console.error(JSON.stringify({ level: 'error', action, sub, err: String(e) }));
    return json(500, { error: 'Server error' });
  }
};
