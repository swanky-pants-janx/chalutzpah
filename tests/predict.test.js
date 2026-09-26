// Optimistic moves must never show something the server then does differently.
// Bots play full games through the real server; before every move, the acting
// player's browser-side prediction (public view + own hand only) is compared
// with what the server actually did.

import { describe, expect, it } from 'vitest';
import {
  RESOURCES,
  mulberry32,
  predictView,
  privateView,
  publicView,
} from '../supabase/functions/_shared/engine/index.js';
import { createHandler } from '../supabase/functions/_shared/server/handler.js';
import { createMemoryStore } from '../supabase/functions/_shared/server/memory-store.js';
import { decide } from './bots.js';

function shape(pub, priv, me) {
  return {
    status: pub.status,
    phase: pub.phase,
    turn: pub.turn,
    robber: pub.robber,
    buildings: pub.buildings,
    roads: pub.roads,
    bank: pub.bank,
    trades: pub.trades,
    pendingDiscards: pub.pendingDiscards,
    achievements: pub.achievements,
    roadLengths: pub.roadLengths,
    players: pub.players.map((p, i) => ({
      piecesLeft: p.piecesLeft,
      knightsPlayed: p.knightsPlayed,
      publicVP: p.publicVP,
      ...(i === me ? { resourceCount: p.resourceCount, devCardCount: p.devCardCount } : {}),
    })),
    resources: priv.resources,
    devCards: priv.devCards,
  };
}

const newParts = (log, afterSeq) => log.filter((e) => e.seq > afterSeq).map((e) => e.parts);

async function checkGame(seed, players, settings = {}) {
  const rng = mulberry32(seed);
  const store = createMemoryStore();
  const handle = createHandler({ store, rng: mulberry32(seed * 31 + 7), now: () => 0 });
  const users = Array.from({ length: players }, (_, i) => `bot-${i}`);
  const created = await handle(users[0], { op: 'create', username: 'Bot 0', settings });
  for (let i = 1; i < players; i++) await handle(users[i], { op: 'join', code: created.public.code, username: `Bot ${i}` });
  await handle(users[0], { op: 'start', gameId: created.gameId });
  const gameId = created.gameId;
  const counts = {};

  for (let step = 0; step < 6000; step++) {
    const s = store.games.get(gameId).state;
    if (s.status === 'finished') break;

    let actor = s.turn.current;
    let action;
    if (s.phase === 'discard') {
      actor = Number(Object.keys(s.pendingDiscards)[0]);
      const cards = RESOURCES.flatMap((r) => Array(s.players[actor].resources[r]).fill(r));
      action = { type: 'DISCARD', resources: {} };
      for (let k = 0; k < s.pendingDiscards[actor]; k++) {
        const r = cards.splice(Math.floor(rng() * cards.length), 1)[0];
        action.resources[r] = (action.resources[r] ?? 0) + 1;
      }
    } else if (s.phase === 'main' && s.trades.length && rng() < 0.6) {
      const trade = s.trades[0];
      if (rng() < 0.3) {
        action = { type: 'CANCEL_TRADE', tradeId: trade.id };
      } else {
        actor = (trade.from + 1) % players;
        action = { type: 'DECLINE_TRADE', tradeId: trade.id };
      }
    } else if (s.phase === 'main' && !s.trades.length && rng() < 0.2) {
      // offer 1 of your most plentiful resource for 1 you don't have
      const hand = s.players[actor].resources;
      const give = [...RESOURCES].sort((a, b) => hand[b] - hand[a])[0];
      const want = RESOURCES.find((r) => hand[r] === 0 && r !== give);
      action = hand[give] > 0 && want ? { type: 'OFFER_TRADE', give: { [give]: 1 }, want: { [want]: 1 } } : decide(s, actor, rng);
    } else {
      action = decide(s, actor, rng);
    }

    const pub = publicView(s);
    const priv = privateView(s, actor);
    const predicted = predictView(pub, priv, action);
    const res = await handle(s.players[actor].userId, { op: 'action', gameId, action });
    expect(res.ok, `${action.type}: ${JSON.stringify(res.error)}`).toBe(true);

    if (!predicted) continue;
    counts[action.type] = (counts[action.type] ?? 0) + 1;
    const label = `step ${step}: ${JSON.stringify(action)}`;
    const jackalOnly = action.type === 'MOVE_ROBBER' && action.victim != null;
    if (jackalOnly) {
      expect(predicted.pub.robber, label).toBe(res.public.robber);
      expect(predicted.pub.phase, label).toBe(res.public.phase);
      continue;
    }
    expect(shape(predicted.pub, predicted.priv, actor), label).toEqual(shape(res.public, res.private, actor));
    const lastSeq = Math.max(0, ...[...pub.log, ...priv.log].map((e) => e.seq));
    const serverSeq = Math.max(0, ...pub.log.map((e) => e.seq), s.logSeq);
    expect(newParts(predicted.pub.log, lastSeq), label).toEqual(newParts(res.public.log, serverSeq));
  }
  expect(store.games.get(gameId).state.status).toBe('finished');
  return counts;
}

describe('optimistic move prediction', () => {
  it('matches the server on every predictable move across full games', async () => {
    const totals = {};
    for (const [seed, players, settings] of [
      [11, 4],
      [12, 3],
      [13, 2],
      [14, 4],
      [15, 4, { chaos: true, closeNeighbours: true, watchmanChoice: true }],
    ]) {
      const counts = await checkGame(seed, players, settings);
      totals.games = (totals.games ?? 0) + 1;
      for (const [k, n] of Object.entries(counts)) totals[k] = (totals[k] ?? 0) + n;
    }
    console.log('predictions checked:', JSON.stringify(totals));
    // Every common move type was actually exercised.
    for (const type of ['BUILD_ROAD', 'BUILD_SETTLEMENT', 'BUILD_CITY', 'BANK_TRADE', 'OFFER_TRADE', 'CANCEL_TRADE', 'DECLINE_TRADE', 'END_TURN', 'DISCARD', 'MOVE_ROBBER', 'PLAY_DEV_CARD']) {
      expect(totals[type] ?? 0, `${type} predictions`).toBeGreaterThan(0);
    }
  });

  it('refuses to predict anything that needs dice, hidden cards or other hands', () => {
    const pub = { status: 'playing', players: [{ id: 'p0' }], log: [], trades: [] };
    const priv = { playerId: 'p0', resources: {}, devCards: [], log: [] };
    for (const type of ['ROLL_DICE', 'BUY_DEV_CARD', 'ACCEPT_TRADE', 'FORCE_SKIP']) {
      expect(predictView(pub, priv, { type })).toBeNull();
    }
    expect(predictView(pub, priv, { type: 'PLAY_DEV_CARD', card: 'chutzpah', resource: 'wheat' })).toBeNull();
  });
});
