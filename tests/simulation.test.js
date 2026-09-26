// Full games played by simple bots through the real server handler, checking
// invariants after every step. This exercises the whole state machine from
// lobby to game over.

import { describe, expect, it } from 'vitest';
import {
  BANK_PER_RESOURCE,
  PIECE_LIMITS,
  RESOURCES,
  TOPOLOGY,
  handSize,
  hasAll,
  mulberry32,
  victoryPoints,
} from '../supabase/functions/_shared/engine/index.js';
import { createHandler } from '../supabase/functions/_shared/server/handler.js';
import { decide } from './bots.js';
import { createMemoryStore } from '../supabase/functions/_shared/server/memory-store.js';

function checkInvariants(s) {
  for (const r of RESOURCES) {
    const total = s.bank[r] + s.players.reduce((n, p) => n + p.resources[r], 0);
    expect(total, `conservation of ${r}`).toBe(BANK_PER_RESOURCE);
    expect(s.bank[r]).toBeGreaterThanOrEqual(0);
    for (const p of s.players) expect(p.resources[r]).toBeGreaterThanOrEqual(0);
  }
  for (const [v, b] of Object.entries(s.buildings)) {
    if (!s.settings.closeNeighbours) {
      for (const n of TOPOLOGY.vertices[Number(v)].neighbors) expect(s.buildings[n], 'spacing rule').toBeUndefined();
    }
    expect(['settlement', 'city']).toContain(b.kind);
  }
  s.players.forEach((p, i) => {
    const count = (kind) => Object.values(s.buildings).filter((b) => b.owner === i && b.kind === kind).length;
    expect(count('settlement') + p.piecesLeft.settlement).toBe(PIECE_LIMITS.settlement);
    expect(count('city') + p.piecesLeft.city).toBe(PIECE_LIMITS.city);
    const roads = Object.values(s.roads).filter((o) => o === i).length;
    expect(roads + p.piecesLeft.road).toBe(PIECE_LIMITS.road);
  });
  const cards = s.devDeck.length + s.players.reduce((n, p) => n + p.devCards.length + p.knightsPlayed, 0);
  expect(cards).toBeLessThanOrEqual(25);
}

async function playFullGame(seed, players, settings = {}) {
  const rng = mulberry32(seed);
  const store = createMemoryStore();
  const handle = createHandler({ store, rng: mulberry32(seed * 7 + 1), now: () => 0 });
  const users = Array.from({ length: players }, (_, i) => `bot-${i}`);

  const created = await handle(users[0], { op: 'create', username: 'Bot 0', settings: { maxPlayers: 4, ...settings } });
  const gameId = created.gameId;
  for (let i = 1; i < players; i++) {
    const joined = await handle(users[i], { op: 'join', code: created.public.code, username: `Bot ${i}` });
    expect(joined.ok).toBe(true);
  }
  for (let r = 0; r < 3; r++) await handle(users[0], { op: 'reroll_map', gameId });
  expect((await handle(users[0], { op: 'start', gameId })).ok).toBe(true);

  let steps = 0;
  for (; steps < 6000; steps++) {
    const s = store.games.get(gameId).state;
    checkInvariants(s);
    if (s.status === 'finished') break;

    if (s.phase === 'discard') {
      const i = Number(Object.keys(s.pendingDiscards)[0]);
      const cards = RESOURCES.flatMap((r) => Array(s.players[i].resources[r]).fill(r));
      const bundle = {};
      for (let k = 0; k < s.pendingDiscards[i]; k++) {
        const j = Math.floor(rng() * cards.length);
        bundle[cards[j]] = (bundle[cards[j]] ?? 0) + 1;
        cards.splice(j, 1);
      }
      const res = await handle(s.players[i].userId, { op: 'action', gameId, action: { type: 'DISCARD', resources: bundle } });
      expect(res.ok, JSON.stringify(res.error)).toBe(true);
      continue;
    }

    // Occasionally another player answers an open offer.
    if (s.phase === 'main' && s.trades.length && rng() < 0.7) {
      const trade = s.trades[0];
      const responder = (trade.from + 1 + Math.floor(rng() * (players - 1))) % players;
      const accept = hasAll(s.players[responder].resources, trade.want) && rng() < 0.5;
      const type = accept ? 'ACCEPT_TRADE' : 'DECLINE_TRADE';
      const res = await handle(s.players[responder].userId, { op: 'action', gameId, action: { type, tradeId: trade.id } });
      expect(res.ok, JSON.stringify(res.error)).toBe(true);
      continue;
    }

    const cur = s.turn.current;
    const action = decide(s, cur, rng);
    const res = await handle(s.players[cur].userId, { op: 'action', gameId, action: { ...action, id: `a${steps}` } });
    expect(res.ok, `${action.type}: ${JSON.stringify(res.error)}`).toBe(true);
    // each response only ever contains the caller's own hand
    expect(res.private.playerId).toBe(s.players[cur].id);
  }

  const final = store.games.get(gameId).state;
  return { final, steps };
}

// SIM_GAMES=200 npm test  → stress-test with many more seeded games.
const extra = Number(globalThis.process?.env?.SIM_GAMES ?? 0);
const games = [
  [1, 4],
  [2, 3],
  [3, 2],
  [4, 4],
  [5, 3],
  [6, 4, { chaos: true }],
  [7, 3, { chaos: true, closeNeighbours: true, watchmanChoice: true }],
  ...Array.from({ length: extra }, (_, k) => [100 + k, 2 + (k % 3), k % 2 ? { chaos: true } : undefined]),
];

describe('full games', () => {
  for (const [seed, players, settings] of games) {
    it(`bots finish a ${players}-player game (seed ${seed}${settings ? ', ' + Object.keys(settings).join('+') : ''})`, async () => {
      const { final, steps } = await playFullGame(seed, players, settings);
      expect(final.status, `stuck after ${steps} steps in phase ${final.phase}`).toBe('finished');
      expect(victoryPoints(final, final.winner, { hidden: true })).toBeGreaterThanOrEqual(final.settings.vpTarget);
      expect(final.phase).toBe('game_over');
      expect(handSize(final.bank)).toBeLessThanOrEqual(BANK_PER_RESOURCE * 5);
    });
  }
});
