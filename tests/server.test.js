import { describe, expect, it } from 'vitest';
import { COSTS, legalRoadEdges, legalSettlementVertices, mulberry32 } from '../supabase/functions/_shared/engine/index.js';
import { createHandler, normalizeCode } from '../supabase/functions/_shared/server/handler.js';
import { createMemoryStore } from '../supabase/functions/_shared/server/memory-store.js';

function setup({ delay = 0, clock = 1_000_000 } = {}) {
  const store = createMemoryStore({ delay });
  const time = { now: clock };
  const handle = createHandler({ store, rng: mulberry32(99), now: () => time.now });
  return { store, handle, time };
}

async function hostAndJoin(handle, n = 3) {
  const created = await handle('host', { op: 'create', username: 'Hostess', settings: { maxPlayers: 4 } });
  expect(created.ok).toBe(true);
  const code = created.public.code;
  for (let i = 1; i < n; i++) {
    const joined = await handle(`guest-${i}`, { op: 'join', code, username: `Guest ${i}` });
    expect(joined.ok).toBe(true);
  }
  return { gameId: created.gameId, code };
}

describe('creating and joining', () => {
  it('creates a lobby with a short code and returns only the caller\'s private view', async () => {
    const { handle } = setup();
    const res = await handle('host', { op: 'create', username: 'Hostess' });
    expect(res.ok).toBe(true);
    expect(res.public.code).toMatch(/^[2-9A-HJ-NP-Z]{5}$/);
    expect(res.public.status).toBe('lobby');
    expect(res.private.playerId).toBe(res.public.hostId);
    expect(JSON.stringify(res.public)).not.toMatch(/host"|userId/);
  });

  it('validates the code, the game and the name', async () => {
    const { handle } = setup();
    const { code } = await hostAndJoin(handle, 1);
    expect((await handle('x', { op: 'join', code: '!!', username: 'X' })).error.code).toBe('BAD_CODE');
    expect((await handle('x', { op: 'join', code: 'ZZZZZ', username: 'X' })).error.code).toBe('NOT_FOUND');
    expect((await handle('x', { op: 'join', code, username: '' })).error.code).toBe('BAD_NAME');
    expect((await handle('x', { op: 'join', code, username: 'hostess' })).error.code).toBe('NAME_TAKEN');
    expect((await handle('x', { op: 'join', code: ` ${code.toLowerCase()} `, username: 'X' })).ok).toBe(true);
  });

  it('refuses joins to full and started games', async () => {
    const { handle } = setup();
    const { gameId, code } = await hostAndJoin(handle, 4);
    expect((await handle('late', { op: 'join', code, username: 'Late' })).error.code).toBe('TABLE_FULL');
    await handle('guest-3', { op: 'leave', gameId });
    expect((await handle('host', { op: 'start', gameId })).ok).toBe(true);
    expect((await handle('late', { op: 'join', code, username: 'Late' })).error.code).toBe('ALREADY_STARTED');
  });

  it('reconnects a returning player to the same seat instead of adding a new one', async () => {
    const { handle } = setup();
    const { gameId, code } = await hostAndJoin(handle, 2);
    await handle('host', { op: 'start', gameId });
    const again = await handle('guest-1', { op: 'join', code, username: 'Anything' });
    expect(again.ok).toBe(true);
    expect(again.public.players).toHaveLength(2);
    expect(again.private.playerId).toBe(again.public.players.find((p) => p.name === 'Guest 1').id);
    const synced = await handle('guest-1', { op: 'sync', gameId });
    expect(synced.private.playerId).toBe(again.private.playerId);
  });

  it('normalizes codes typed with spaces or lowercase', () => {
    expect(normalizeCode(' ab-7kq ')).toBe('AB7KQ');
  });
});

describe('leaving and hosting', () => {
  it('migrates the host and deletes an empty lobby', async () => {
    const { handle, store } = setup();
    const { gameId } = await hostAndJoin(handle, 2);
    const left = await handle('host', { op: 'leave', gameId });
    expect(left.public.players).toHaveLength(1);
    expect(left.public.hostId).toBe(left.public.players[0].id);
    const gone = await handle('guest-1', { op: 'leave', gameId });
    expect(gone.gameId).toBeNull();
    expect(store.games.size).toBe(0);
  });

  it('only allows claiming host once the host has gone quiet', async () => {
    const { handle, store, time } = setup();
    const { gameId } = await hostAndJoin(handle, 2);
    store.touch(gameId, 'host', time.now);
    store.touch(gameId, 'guest-1', time.now);
    expect((await handle('guest-1', { op: 'claim_host', gameId })).error.code).toBe('HOST_PRESENT');
    time.now += 60_000;
    store.touch(gameId, 'guest-1', time.now);
    const claimed = await handle('guest-1', { op: 'claim_host', gameId });
    expect(claimed.ok).toBe(true);
    expect(claimed.public.hostId).toBe(claimed.private.playerId);
  });

  it('lets only the host reroll the map', async () => {
    const { handle } = setup();
    const { gameId } = await hostAndJoin(handle, 2);
    expect((await handle('guest-1', { op: 'reroll_map', gameId })).error.code).toBe('NOT_HOST');
    const before = (await handle('host', { op: 'sync', gameId })).public.board.seed;
    const after = await handle('host', { op: 'reroll_map', gameId });
    expect(after.public.board.seed).not.toBe(before);
    expect(after.public.mapRolls).toBe(2);
  });
});

describe('server authority', () => {
  it('rejects strangers, unknown ops and bad ids', async () => {
    const { handle } = setup();
    const { gameId } = await hostAndJoin(handle, 2);
    expect((await handle('stranger', { op: 'action', gameId, action: { type: 'ROLL_DICE' } })).error.code).toBe('NOT_A_PLAYER');
    expect((await handle('stranger', { op: 'sync', gameId })).error.code).toBe('NOT_FOUND');
    expect((await handle('host', { op: 'give_me_points' })).error.code).toBe('BAD_REQUEST');
    expect((await handle('host', { op: 'action', gameId: 'nope', action: { type: 'ROLL_DICE' } })).error.code).toBe('BAD_REQUEST');
    expect((await handle(null, { op: 'create', username: 'x' })).error.code).toBe('UNAUTHORIZED');
  });

  it('ignores client attempts to smuggle state into an action', async () => {
    const { handle, store } = setup();
    const { gameId } = await hostAndJoin(handle, 2);
    await handle('host', { op: 'start', gameId });
    const first = store.games.get(gameId).state.turn.current;
    const userOf = (idx) => store.games.get(gameId).state.players[idx].userId;
    const res = await handle(userOf(first), {
      op: 'action',
      gameId,
      action: { type: 'BUILD_SETTLEMENT', vertex: 0, resources: { stone: 99 }, victoryPoints: 10, owner: 1 },
    });
    expect(res.ok).toBe(true);
    const state = store.games.get(gameId).state;
    expect(state.players[first].resources.stone).toBe(0);
    expect(state.buildings[0]).toEqual({ owner: first, kind: 'settlement' });
  });
});

describe('concurrency', () => {
  async function playingGame(delay) {
    const env = setup({ delay });
    const { gameId } = await hostAndJoin(env.handle, 3);
    await env.handle('host', { op: 'start', gameId });
    // play setup with first legal spots
    for (;;) {
      const s = env.store.games.get(gameId).state;
      if (s.status !== 'setup') break;
      const cur = s.turn.current;
      const user = s.players[cur].userId;
      const v = legalSettlementVertices(s, cur, { setup: true })[0];
      await env.handle(user, { op: 'action', gameId, action: { type: 'BUILD_SETTLEMENT', vertex: v } });
      const s2 = env.store.games.get(gameId).state;
      const e = legalRoadEdges(s2, cur, { fromVertex: v })[0];
      await env.handle(user, { op: 'action', gameId, action: { type: 'BUILD_ROAD', edge: e } });
    }
    return { ...env, gameId };
  }

  it('two simultaneous rolls: exactly one succeeds', async () => {
    const { handle, store, gameId } = await playingGame(2);
    const s = store.games.get(gameId).state;
    const user = s.players[s.turn.current].userId;
    const results = await Promise.all([
      handle(user, { op: 'action', gameId, action: { type: 'ROLL_DICE' } }),
      handle(user, { op: 'action', gameId, action: { type: 'ROLL_DICE' } }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok).error.code).toBe('WRONG_PHASE');
    expect(store.games.get(gameId).state.log.filter((e) => e.kind === 'roll')).toHaveLength(1);
  });

  it('two players accepting the same trade at once: exactly one gets it', async () => {
    const { handle, store, gameId } = await playingGame(2);
    const s = store.games.get(gameId).state;
    // arrange a main-phase turn with an open offer (direct setup for the test)
    s.phase = 'main';
    s.turn.rolled = true;
    const cur = s.turn.current;
    const others = [0, 1, 2].filter((i) => i !== cur);
    const hand = (extra) => ({ timber: 0, clay: 0, fleece: 0, wheat: 0, stone: 0, ...extra });
    s.players[cur].resources = hand({ timber: 2 });
    for (const i of others) s.players[i].resources = hand({ wheat: 1 });
    s.trades = [{ id: 1, from: cur, give: { timber: 2 }, want: { wheat: 1 }, declined: [] }];
    s.nextTradeId = 2;

    const results = await Promise.all(
      others.map((i) => handle(s.players[i].userId, { op: 'action', gameId, action: { type: 'ACCEPT_TRADE', tradeId: 1 } })),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok).error.code).toBe('TRADE_GONE');
    const after = store.games.get(gameId).state;
    expect(after.players[cur].resources.timber).toBe(0);
    expect(after.players[cur].resources.wheat).toBe(1);
    expect(others.map((i) => after.players[i].resources.timber).sort()).toEqual([0, 2]);
  });

  it('a retried request with the same action id is applied once', async () => {
    const { handle, store, gameId } = await playingGame(0);
    const s = store.games.get(gameId).state;
    s.phase = 'main';
    const cur = s.turn.current;
    s.players[cur].resources = { timber: 8, clay: 0, fleece: 0, wheat: 0, stone: 0 };
    const user = s.players[cur].userId;
    const action = { type: 'BANK_TRADE', give: 'timber', get: 'stone', id: 'req-123' };
    const a = await handle(user, { op: 'action', gameId, action });
    const b = await handle(user, { op: 'action', gameId, action });
    expect(a.ok && b.ok).toBe(true);
    expect(b.private.resources).toMatchObject({ timber: 4, stone: 1 });
  });

  it('many concurrent purchases never overspend a hand', async () => {
    const { handle, store, gameId } = await playingGame(1);
    const s = store.games.get(gameId).state;
    s.phase = 'main';
    const cur = s.turn.current;
    s.players[cur].resources = { timber: 0, clay: 0, fleece: 2, wheat: 2, stone: 2 }; // exactly 2 cards' worth
    const user = s.players[cur].userId;
    const results = await Promise.all(
      Array.from({ length: 5 }, () => handle(user, { op: 'action', gameId, action: { type: 'BUY_DEV_CARD' } })),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(2);
    const after = store.games.get(gameId).state.players[cur];
    expect(after.devCards).toHaveLength(2);
    expect(Object.values(after.resources).every((n) => n >= 0)).toBe(true);
    expect(COSTS.devCard).toBeDefined();
  });
});

describe('skipping absent players', () => {
  it('uses server heartbeats, not the client, to decide who is away', async () => {
    const { handle, store, time } = setup();
    const { gameId } = await hostAndJoin(handle, 2);
    await handle('host', { op: 'start', gameId });
    const s = store.games.get(gameId).state;
    const current = s.players[s.turn.current].userId;
    const other = s.players.find((p) => p.userId !== current).userId;

    store.touch(gameId, current, time.now);
    store.touch(gameId, other, time.now);
    expect((await handle(other, { op: 'action', gameId, action: { type: 'FORCE_SKIP' } })).error.code).toBe('NOTHING_TO_SKIP');

    time.now += 120_000;
    store.touch(gameId, other, time.now);
    const skipped = await handle(other, { op: 'action', gameId, action: { type: 'FORCE_SKIP' } });
    expect(skipped.ok).toBe(true);
    expect(skipped.public.turn.current).not.toBe(s.turn.current);
  });
});
