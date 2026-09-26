import { describe, expect, it } from 'vitest';
import { COSTS, generateBoard, legalRoadEdges, legalSettlementVertices, mulberry32 } from '../supabase/functions/_shared/engine/index.js';
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

describe('warm-instance cache', () => {
  /** Two server instances (like two Edge Function isolates) sharing one database. */
  async function twoInstances() {
    const store = createMemoryStore();
    const one = createHandler({ store, rng: mulberry32(5), now: () => 0 });
    const two = createHandler({ store, rng: mulberry32(6), now: () => 0 });
    const created = await one('host', { op: 'create', username: 'Host' });
    await one('guest-1', { op: 'join', code: created.public.code, username: 'Guest' });
    await one('host', { op: 'start', gameId: created.gameId });
    const gameId = created.gameId;
    const state = () => store.games.get(gameId).state;
    const user = (idx) => state().players[idx].userId;
    // play setup through instance one so it holds a cached copy
    while (state().status === 'setup') {
      const s = state();
      const cur = s.turn.current;
      const v = legalSettlementVertices(s, cur, { setup: true })[0];
      await one(user(cur), { op: 'action', gameId, action: { type: 'BUILD_SETTLEMENT', vertex: v } });
      const e = legalRoadEdges(state(), cur, { fromVertex: v })[0];
      await one(user(cur), { op: 'action', gameId, action: { type: 'BUILD_ROAD', edge: e } });
    }
    return { one, two, gameId, state, user };
  }

  it('a move that is illegal only against a stale cached copy still succeeds', async () => {
    const { one, two, gameId, state, user } = await twoInstances();
    const first = state().turn.current;
    // instance two advances the game; instance one's cache still says it's `first`'s roll
    await two(user(first), { op: 'action', gameId, action: { type: 'ROLL_DICE' } });
    while (state().phase !== 'main') {
      const s = state();
      if (s.phase === 'discard') {
        const i = Number(Object.keys(s.pendingDiscards)[0]);
        const hand = s.players[i].resources;
        const bundle = {};
        let left = s.pendingDiscards[i];
        for (const r of Object.keys(hand)) {
          const n = Math.min(hand[r], left);
          if (n) bundle[r] = n;
          left -= n;
        }
        await two(user(i), { op: 'action', gameId, action: { type: 'DISCARD', resources: bundle } });
      } else {
        await two(user(first), { op: 'action', gameId, action: { type: 'MOVE_ROBBER', hex: s.robber === 0 ? 1 : 0, victim: null } });
      }
    }
    await two(user(first), { op: 'action', gameId, action: { type: 'END_TURN' } });
    const second = state().turn.current;
    const res = await one(user(second), { op: 'action', gameId, action: { type: 'ROLL_DICE' } });
    expect(res.ok, JSON.stringify(res.error)).toBe(true);
    expect(res.public.turn.current).toBe(second);
  });

  it('a move that a stale cached copy would allow is still rejected', async () => {
    const { one, two, gameId, state, user } = await twoInstances();
    const first = state().turn.current;
    await two(user(first), { op: 'action', gameId, action: { type: 'ROLL_DICE' } });
    // instance one's cache still thinks nobody has rolled
    const res = await one(user(first), { op: 'action', gameId, action: { type: 'ROLL_DICE' } });
    expect(res.ok).toBe(false);
    expect(res.error.code).toBe('WRONG_PHASE');
    expect(state().log.filter((e) => e.kind === 'roll')).toHaveLength(1);
  });

  it('never answers a no-op from a stale cached copy', async () => {
    const { one, two, gameId, state, user } = await twoInstances();
    const first = state().turn.current;
    await two(user(first), { op: 'action', gameId, action: { type: 'ROLL_DICE' } });
    const code = state().code;
    // re-joining is a no-op; the reply must reflect the roll made via instance two
    const res = await one(user(first), { op: 'join', code, username: 'whatever' });
    expect(res.public.lastRoll).not.toBeNull();
  });
});

describe('map numbers', () => {
  it('new islands get a shareable number that recreates the exact map', async () => {
    const { handle } = setup();
    const created = await handle('host', { op: 'create', username: 'Host' });
    const n = created.public.board.seed;
    expect(Number.isInteger(n) && n >= 1 && n <= 999999).toBe(true);
    await handle('guest-1', { op: 'join', code: created.public.code, username: 'Guest' });
    const loaded = await handle('host', { op: 'reroll_map', gameId: created.gameId, mapNumber: '482 913' });
    expect(loaded.public.board.seed).toBe(482913);
    expect(loaded.public.board).toEqual(generateBoard(482913));
  });

  it('rejects bad map numbers and non-hosts', async () => {
    const { handle } = setup();
    const created = await handle('host', { op: 'create', username: 'Host' });
    await handle('guest-1', { op: 'join', code: created.public.code, username: 'Guest' });
    for (const bad of [0, -5, 1_000_000, 3.5, 'abc']) {
      expect((await handle('host', { op: 'reroll_map', gameId: created.gameId, mapNumber: bad })).error.code, String(bad)).toBe('BAD_MAP');
    }
    expect((await handle('guest-1', { op: 'reroll_map', gameId: created.gameId, mapNumber: 7 })).error.code).toBe('NOT_HOST');
  });
});

describe('rematch', () => {
  async function finishedGame(n = 3) {
    const env = setup();
    const { gameId } = await hostAndJoin(env.handle, n);
    await env.handle('host', { op: 'update_settings', gameId, settings: { closeNeighbours: true, vpTarget: 8 } });
    await env.handle('host', { op: 'start', gameId });
    return { ...env, gameId, finish: () => (env.store.games.get(gameId).state.status = 'finished') };
  }

  it('only works once the game is over', async () => {
    const { handle, gameId } = await finishedGame();
    expect((await handle('guest-1', { op: 'rematch', gameId })).error.code).toBe('NOT_FINISHED');
  });

  it('opens one new lobby with the same settings, names and colours for everyone', async () => {
    const { handle, store, gameId, finish } = await finishedGame();
    finish();
    const old = store.games.get(gameId).state;
    const colorOf = (user) => old.players.find((p) => p.userId === user).color;

    const first = await handle('guest-1', { op: 'rematch', gameId });
    expect(first.ok).toBe(true);
    expect(first.gameId).not.toBe(gameId);
    expect(first.public.status).toBe('lobby');
    expect(first.public.settings).toMatchObject({ closeNeighbours: true, vpTarget: 8 });
    expect(first.public.players[0]).toMatchObject({ name: 'Guest 1', color: colorOf('guest-1') });
    expect(store.games.get(gameId).state.rematch.gameId).toBe(first.gameId);

    const second = await handle('host', { op: 'rematch', gameId });
    expect(second.gameId).toBe(first.gameId);
    const host = second.public.players.find((p) => p.name === 'Hostess');
    expect(host.color).toBe(colorOf('host'));
    expect(second.public.hostId).toBe(first.public.hostId);
  });

  it('two players pressing rematch at once end up at the same table', async () => {
    const { handle, store, gameId, finish } = await finishedGame();
    finish();
    const [a, b] = await Promise.all([handle('host', { op: 'rematch', gameId }), handle('guest-2', { op: 'rematch', gameId })]);
    expect(a.gameId).toBe(b.gameId);
    const lobbies = [...store.games.values()].filter((g) => g.state.status === 'lobby');
    expect(lobbies).toHaveLength(1);
    expect(lobbies[0].state.players).toHaveLength(2);
  });

  it('replaces a rematch lobby that has since disappeared', async () => {
    const { handle, store, gameId, finish } = await finishedGame();
    finish();
    const first = await handle('host', { op: 'rematch', gameId });
    await handle('host', { op: 'leave', gameId: first.gameId }); // empty lobby is deleted
    const again = await handle('guest-1', { op: 'rematch', gameId });
    expect(again.ok).toBe(true);
    expect(again.gameId).not.toBe(first.gameId);
    expect(store.games.get(gameId).state.rematch.gameId).toBe(again.gameId);
  });
});

describe('invite previews', () => {
  it('are public, by code, and reveal nothing private', async () => {
    const { handle } = setup();
    const { gameId, code } = await hostAndJoin(handle, 3);
    await handle('host', { op: 'start', gameId });
    const res = await handle(null, { op: 'preview', code: code.toLowerCase() });
    expect(res.ok).toBe(true);
    expect(res.preview).toMatchObject({ code, status: 'setup', host: 'Hostess' });
    expect(res.preview.board.layout).toBe('classic');
    expect(res.preview.players.map((p) => p.name).sort()).toEqual(['Guest 1', 'Guest 2', 'Hostess']);
    const text = JSON.stringify(res.preview);
    for (const secret of ['userId', 'resources', 'devCards', 'devDeck', ':"host"', 'guest-1', 'privateLog']) {
      expect(text).not.toContain(secret);
    }
    expect((await handle(null, { op: 'preview', code: 'ZZZZZ' })).error.code).toBe('NOT_FOUND');
    // everything else still needs a session
    expect((await handle(null, { op: 'sync', gameId })).error.code).toBe('UNAUTHORIZED');
  });
});

describe('abandoned games', () => {
  async function playing(n = 3) {
    const env = setup();
    const { gameId, code } = await hostAndJoin(env.handle, n);
    await env.handle('host', { op: 'start', gameId });
    return { ...env, gameId, code };
  }

  it('are deleted the moment the last player leaves', async () => {
    const { handle, store, gameId, code } = await playing(3);
    await handle('guest-1', { op: 'leave', gameId });
    await handle('guest-2', { op: 'leave', gameId });
    expect(store.games.has(gameId)).toBe(true); // the host is still there
    const last = await handle('host', { op: 'leave', gameId });
    expect(last).toMatchObject({ ok: true, gameId: null, disbanded: true });
    expect(store.games.has(gameId)).toBe(false);
    expect((await handle('host', { op: 'join', code, username: 'Hostess' })).error.code).toBe('NOT_FOUND');
    expect((await handle(null, { op: 'preview', code })).error.code).toBe('NOT_FOUND');
  });

  it('a player who left can still come back while someone else is playing', async () => {
    const { handle, gameId, code } = await playing(2);
    await handle('guest-1', { op: 'leave', gameId });
    const back = await handle('guest-1', { op: 'join', code, username: 'Guest 1' });
    expect(back.ok).toBe(true);
    expect(back.public.players.every((p) => !p.left)).toBe(true);
  });

  it('an already-abandoned game is disbanded instead of revived', async () => {
    const { handle, store, gameId, code } = await playing(2);
    const record = store.games.get(gameId);
    for (const p of record.state.players) p.left = true; // e.g. left over from before this fix
    record.version += 1;
    const res = await handle('host', { op: 'join', code, username: 'Hostess' });
    expect(res.error.code).toBe('DISBANDED');
    expect(store.games.has(gameId)).toBe(false);
  });

  it('finished games are not treated as abandoned', async () => {
    const { handle, store, gameId } = await playing(2);
    const record = store.games.get(gameId);
    record.state.status = 'finished';
    record.version += 1; // as a real commit would
    await handle('guest-1', { op: 'leave', gameId });
    await handle('host', { op: 'leave', gameId });
    expect(store.games.has(gameId)).toBe(true);
  });
});
