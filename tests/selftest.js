// Headless check of the game rules (no browser, no AWS): npm test
import { createMatch, tick } from '../src/game.js';
import { stats, SHIPS } from '../shared/data';

const m = createMatch('t', '5v5', [], true);
let n = 0;
while (!m.over && n < 6000) {
  tick(m, 0.05);
  n++;
}
if (!m.over || m.ships.length !== 10) throw new Error('match did not finish correctly');
if (!(stats({}, 'galleon', 'pirate').speed < stats({}, 'sloop', 'pirate').speed))
  throw new Error('bigger ships must be slower');
if (Object.keys(SHIPS).length !== 4) throw new Error('ship list changed');
const practice = (difficulty) => createMatch('practice', '5v5', [], true, difficulty).ships.filter((ship) => ship.bot);
const easy = practice('easy');
if (easy.filter((ship) => ship.type === 'sloop').length < 8) throw new Error('easy practice should usually use sloops');
if (practice('medium').some((ship) => ship.type !== 'frigate')) throw new Error('medium practice should use frigates');
const hardShips = practice('hard').map((ship) => ship.type);
if (!hardShips.includes('galleon') || !hardShips.includes('manowar'))
  throw new Error('hard practice should mix galleons and Man-of-War ships');
console.log(`OK: 5v5 bot match finished in ${(n * 0.05).toFixed(0)}s, winner team ${m.winner}`);
