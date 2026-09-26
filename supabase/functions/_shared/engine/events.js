// Chaos mode: an original deck of events. One is flipped at the start of each
// round (when play returns to the first seat) and lasts until the next flip.
// Effects are either ongoing modifiers read by the rules, or one-off happenings
// resolved on the server when the card is flipped.

import { RESOURCES } from './constants.js';
import { emptyHand, handSize, handToList } from './hand.js';
import { B, P, log } from './log.js';
import { randomInt, shuffle } from './rng.js';
import { victoryPoints } from './rules.js';

export const EVENTS = Object.freeze({
  drought: { name: 'Drought', text: 'Wheat Terraces produce nothing this round.', tone: 'bad', icon: 'wheat', produce: { terraces: 0 } },
  mudslide: { name: 'Mudslide', text: 'Clay Pits produce nothing this round.', tone: 'bad', icon: 'clay', produce: { claypit: 0 } },
  rockfall: { name: 'Rockfall', text: 'The Quarries are blocked — no Stone this round.', tone: 'bad', icon: 'stone', produce: { quarry: 0 } },
  bumperCrop: { name: 'Bumper Crop', text: 'Wheat Terraces produce double this round.', tone: 'good', icon: 'wheat', produce: { terraces: 2 } },
  timberRush: { name: 'Timber Rush', text: 'Cedar Groves produce double this round.', tone: 'good', icon: 'timber', produce: { grove: 2 } },
  goatFair: { name: 'Goat Fair', text: 'Goat Pastures produce double this round.', tone: 'good', icon: 'fleece', produce: { pasture: 2 } },
  marketDay: { name: 'Market Day', text: 'Everyone trades 3:1 at the market this round (2:1 harbors still count).', tone: 'good', icon: 'trade', bankRate: 3 },
  barnRaising: { name: 'Barn Raising', text: 'Trails cost just 1 Timber this round.', tone: 'good', icon: 'road', cost: { road: { timber: 1 } } },
  housewarming: {
    name: 'Housewarming',
    text: 'Homesteads need no Fleece this round.',
    tone: 'good',
    icon: 'settlement',
    cost: { settlement: { timber: 1, clay: 1, wheat: 1 } },
  },
  calmNight: { name: 'Calm Night', text: 'A 7 makes nobody discard this round (the Jackal still moves).', tone: 'good', icon: 'jackal', noDiscard: true },
  caravan: { name: 'Caravan', text: 'A caravan passes through: everyone gets a random resource from the supply.', tone: 'good', icon: 'harvest', onFlip: caravan },
  sandstorm: { name: 'Sandstorm', text: 'The Jackal is blown back to the Dunes.', tone: 'wild', icon: 'jackal', onFlip: sandstorm },
  tithe: { name: 'Tithe', text: 'Anyone holding 8 or more cards gives one at random to the supply.', tone: 'bad', icon: 'cards', onFlip: tithe },
  windfall: { name: 'Windfall', text: 'Whoever has the fewest points takes 2 random resources from the supply.', tone: 'good', icon: 'trophy', onFlip: windfall },
  shiftingSands: { name: 'Shifting Sands', text: 'Two number tokens swap places — for the rest of the game!', tone: 'wild', icon: 'dice', onFlip: shiftingSands },
});

export const EVENT_IDS = Object.freeze(Object.keys(EVENTS));

export const currentEvent = (s) => (s.chaos?.current ? EVENTS[s.chaos.current] : null);

export function newChaosDeck(rng) {
  return { deck: shuffle(rng, EVENT_IDS), current: null, round: 0 };
}

/** Start a new round's event (reshuffling when the deck runs out). */
export function flipEvent(s, env) {
  if (!s.chaos) return;
  if (s.chaos.deck.length === 0) s.chaos.deck = shuffle(env.rng, EVENT_IDS);
  s.chaos.current = s.chaos.deck.pop();
  s.chaos.round += 1;
  const event = EVENTS[s.chaos.current];
  log(s, [`Round ${s.chaos.round} event — ${event.name}: ${event.text}`], 'event');
  event.onFlip?.(s, env);
}

// --- one-off effects ---------------------------------------------------------

function randomFromSupply(s, env) {
  const available = RESOURCES.filter((r) => s.bank[r] > 0);
  return available.length ? available[randomInt(env.rng, available.length)] : null;
}

function giveFromSupply(s, idx, count, env) {
  const got = emptyHand();
  for (let k = 0; k < count; k++) {
    const r = randomFromSupply(s, env);
    if (!r) break;
    s.bank[r] -= 1;
    s.players[idx].resources[r] += 1;
    got[r] += 1;
  }
  if (handSize(got) > 0) log(s, [P(s, idx), ' received ', B(got)], 'gain');
}

function caravan(s, env) {
  s.players.forEach((p, i) => {
    if (!p.left) giveFromSupply(s, i, 1, env);
  });
}

function sandstorm(s) {
  s.robber = s.board.desert;
}

function tithe(s, env) {
  s.players.forEach((p, i) => {
    if (handSize(p.resources) < 8) return;
    const cards = handToList(p.resources);
    const r = cards[randomInt(env.rng, cards.length)];
    p.resources[r] -= 1;
    s.bank[r] += 1;
    log(s, [P(s, i), ' paid the tithe.'], 'discard');
  });
}

function windfall(s, env) {
  const points = s.players.map((_, i) => victoryPoints(s, i));
  const lowest = Math.min(...points);
  points.forEach((vp, i) => {
    if (vp === lowest && !s.players[i].left) giveFromSupply(s, i, 2, env);
  });
}

function shiftingSands(s, env) {
  const numbered = s.board.hexes.flatMap((h, i) => (h.number ? [i] : []));
  const a = numbered[randomInt(env.rng, numbered.length)];
  const others = numbered.filter((i) => s.board.hexes[i].number !== s.board.hexes[a].number);
  const b = others[randomInt(env.rng, others.length)];
  const na = s.board.hexes[a].number;
  s.board.hexes[a].number = s.board.hexes[b].number;
  s.board.hexes[b].number = na;
  log(s, [`The ${s.board.hexes[b].number} and ${s.board.hexes[a].number} tokens swapped places.`], 'event');
}
