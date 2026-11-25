// Shared game data + rules. Used by the browser (display, bots) AND by the game-api Lambda (server-side validation).
export interface ShipDef {
  name: string;
  hp: number;
  speed: number;
  turn: number;
  slots: number;
  price: number;
  level: number;
  len: number;
}
export const SHIPS: Record<string, ShipDef> = {
  sloop: { name: 'Sloop', hp: 300, speed: 150, turn: 2.4, slots: 4, price: 0, level: 1, len: 40 },
  frigate: { name: 'Frigate', hp: 600, speed: 115, turn: 1.8, slots: 8, price: 800, level: 3, len: 56 },
  galleon: { name: 'Galleon', hp: 1100, speed: 85, turn: 1.3, slots: 12, price: 2500, level: 6, len: 72 },
  manowar: { name: 'Man-of-War', hp: 1800, speed: 62, turn: 0.9, slots: 16, price: 6000, level: 10, len: 90 },
};
export const FACTIONS: Record<
  string,
  { name: string; hp: number; speed: number; reload: number; range: number; note: string }
> = {
  pirate: { name: 'Pirates', hp: 1, speed: 1.1, reload: 1, range: 1, note: '+10% speed' },
  spanish: { name: 'Spanish Navy', hp: 1.15, speed: 1, reload: 1, range: 1, note: '+15% health' },
  french: { name: 'French Navy', hp: 1, speed: 1, reload: 1, range: 1.15, note: '+15% cannon range' },
  british: { name: 'British Navy', hp: 1, speed: 1, reload: 0.85, range: 1, note: '15% faster reload' },
};
export const MODES: Record<string, number> = { '1v1': 1, '2v2': 2, '3v3': 3, '4v4': 4, '5v5': 5 }; // players per team
export const CAPTAINS = ['mara', 'rook', 'becket', 'sable', 'silas', 'isla'];
export const PARTS = ['hull', 'sails', 'cannons', 'armor'];
export const MAX_UPGRADE = 5;
export const upgradeCost = (level: number) => 150 * (level + 1);
export const levelFor = (xp: number) => 1 + Math.floor(Math.sqrt(xp / 100));
export const rewards = (win: boolean, kills: number, dmg: number) => ({
  gold: Math.round((win ? 250 : 80) + kills * 60 + dmg / 10),
  xp: Math.round((win ? 120 : 50) + kills * 30 + dmg / 20),
});

// user = { ships: { [shipId]: { hull, sails, cannons, armor, guns } } }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function stats(user: any, id: string, faction?: string | null) {
  const b = SHIPS[id];
  const F = (faction && FACTIONS[faction]) || FACTIONS.pirate;
  const u = (user && user.ships && user.ships[id]) || {};
  const h = u.hull || 0,
    s = u.sails || 0,
    c = u.cannons || 0,
    a = u.armor || 0,
    g = u.guns || b.slots / 2;
  const weight = Math.max(0.4, 1 - 0.012 * (h + a + c) - 0.012 * g); // heavier build = slower
  return {
    hp: Math.round(b.hp * (1 + 0.15 * h) * F.hp),
    speed: Math.round(b.speed * (1 + 0.08 * s) * F.speed * weight),
    turn: +(b.turn * Math.max(0.6, weight)).toFixed(2),
    dmg: Math.round(22 * (1 + 0.12 * c)),
    armor: +Math.min(0.5, 0.06 * a).toFixed(2),
    guns: g,
    reload: +(3 * F.reload * (1 + 0.02 * g)).toFixed(1),
    range: Math.round(380 * F.range),
  };
}
