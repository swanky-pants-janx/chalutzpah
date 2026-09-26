// Server-authoritative request handling, independent of Supabase so it can be
// unit-tested with an in-memory store.
//
//   client ──op──▶ handle(userId, body)
//                    load state + version
//                    run engine (validates, throws GameError on illegal moves)
//                    commit if version unchanged (compare-and-swap), else retry
//                  ◀── fresh public + private view
//
// Store interface (see supabase-store.js / memory-store.js):
//   create(gameId, code, snapshot) → version | null (code taken)
//   load(gameId)                   → { state, version } | null
//   commit(gameId, version, snapshot) → newVersion | null (lost the race)
//   findByCode(code)               → { id } | null
//   remove(gameId)
//   lastSeen(gameId)               → { [userId]: epochMs }
//   cleanup()                      (optional) delete abandoned games

import * as engine from '../engine/index.js';

const { GameError } = engine;

const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const CODE_LENGTH = 5;
const CODE_PATTERN = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_COMMIT_ATTEMPTS = 7;

export function makeGameCode(rng) {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[engine.randomInt(rng, CODE_ALPHABET.length)];
  return code;
}

export function normalizeCode(raw) {
  return String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function makePlayerId(rng) {
  return `p_${Math.floor(rng() * 36 ** 8).toString(36).padStart(8, '0')}`;
}

/**
 * @param {object} deps
 * @param {object} deps.store         persistence adapter
 * @param {() => number} [deps.rng]   randomness for dice, shuffles and codes
 * @param {() => number} [deps.now]   clock (ms)
 * @param {number} [deps.idleMs]      no heartbeat for this long ⇒ may be skipped
 * @param {number} [deps.hostIdleMs]  no heartbeat for this long ⇒ host can be replaced
 */
export function createHandler({ store, rng = engine.cryptoRng(), now = () => Date.now(), idleMs = 90_000, hostIdleMs = 45_000 }) {
  async function respond(state, userId, version) {
    const idx = engine.playerIndexByUser(state, userId);
    return {
      ok: true,
      serverTime: now(),
      gameId: state.id,
      version,
      public: engine.publicView(state),
      private: idx >= 0 ? engine.privateView(state, idx) : null,
    };
  }

  // Warm-instance cache of the last state this instance saw per game. It only
  // ever saves the initial database read: a cached state is trusted solely when
  // the compare-and-swap commit proves it was current. Anything that would be
  // answered from the cache without a commit (a rejection, a no-op, a replayed
  // action) is re-checked against a fresh read first.
  const cache = new Map(); // gameId → { state, version }
  const CACHE_LIMIT = 200;

  function remember(gameId, record) {
    cache.delete(gameId);
    cache.set(gameId, record);
    if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
  }

  /** Load → transform → compare-and-swap commit, retrying on concurrent writes. */
  async function mutate(gameId, userId, transform, { duplicateOk = false } = {}) {
    if (typeof gameId !== 'string' || !UUID_PATTERN.test(gameId)) {
      throw new GameError('BAD_REQUEST', 'Missing or invalid game id.');
    }
    for (let attempt = 0; attempt < MAX_COMMIT_ATTEMPTS; attempt++) {
      const cached = attempt === 0 ? cache.get(gameId) : undefined;
      const record = cached ?? (await store.load(gameId));
      if (!record) {
        cache.delete(gameId);
        throw new GameError('NOT_FOUND', 'That game no longer exists.');
      }
      if (!cached) remember(gameId, record);

      let next;
      try {
        next = await transform(record.state);
      } catch (err) {
        if (cached) {
          cache.delete(gameId);
          continue; // might only be illegal against a stale copy
        }
        if (duplicateOk && err instanceof GameError && err.code === 'DUPLICATE') {
          return respond(record.state, userId, record.version);
        }
        throw err;
      }

      if (next === record.state) {
        if (cached) {
          cache.delete(gameId);
          continue; // never answer from an unverified copy
        }
        return respond(record.state, userId, record.version);
      }
      if (next.players.length === 0) {
        cache.delete(gameId);
        await store.remove(gameId);
        return { ok: true, gameId: null, version: null, public: null, private: null };
      }
      const version = await store.commit(gameId, record.version, engine.snapshot(next));
      if (version != null) {
        remember(gameId, { state: next, version });
        return respond(next, userId, version);
      }
      // Someone else committed first (or the cached copy was stale): re-read and re-validate.
      cache.delete(gameId);
    }
    throw new GameError('BUSY', 'The table is busy — please try that again.');
  }

  async function idleUserIds(gameId, state, thresholdMs) {
    const seen = await store.lastSeen(gameId);
    const t = now();
    return state.players.map((p) => p.userId).filter((userId) => t - (seen[userId] ?? 0) > thresholdMs);
  }

  const ops = {
    async create(userId, { username, settings, color }) {
      const name = engine.validateName(username);
      if (store.cleanup) await store.cleanup().catch(() => {});
      for (let attempt = 0; attempt < 8; attempt++) {
        const gameId = globalThis.crypto.randomUUID();
        const code = makeGameCode(rng);
        const state = engine.createGame({
          gameId,
          code,
          settings: settings ?? {},
          seed: engine.randomMapNumber(rng),
          host: { playerId: makePlayerId(rng), userId, name, color },
          now: now(),
        });
        const version = await store.create(gameId, code, engine.snapshot(state));
        if (version != null) return respond(state, userId, version);
      }
      throw new GameError('TRY_AGAIN', 'Could not reserve a game code. Please try again.');
    },

    async join(userId, { code, username, color }) {
      const clean = normalizeCode(code);
      if (!CODE_PATTERN.test(clean)) throw new GameError('BAD_CODE', 'Game codes are 5 letters and numbers.');
      const game = await store.findByCode(clean);
      if (!game) throw new GameError('NOT_FOUND', 'No game uses that code.');
      return mutate(game.id, userId, (state) =>
        engine.joinGame(state, { userId, name: username, playerId: makePlayerId(rng), color }),
      );
    },

    leave: (userId, { gameId }) => mutate(gameId, userId, (state) => engine.leaveGame(state, userId, { rng, now: now() })),

    reroll_map: (userId, { gameId, mapNumber }) => {
      const seed = mapNumber == null ? engine.randomMapNumber(rng) : engine.parseMapNumber(mapNumber);
      return mutate(gameId, userId, (state) => engine.rerollMap(state, userId, seed));
    },

    start: (userId, { gameId }) => mutate(gameId, userId, (state) => engine.startGame(state, userId, { rng, now: now() })),

    update_settings: (userId, { gameId, settings }) =>
      mutate(gameId, userId, (state) => engine.updateSettings(state, userId, settings)),

    update_profile: (userId, { gameId, name, color }) =>
      mutate(gameId, userId, (state) => engine.updateProfile(state, userId, { name, color })),

    kick: (userId, { gameId, playerId }) => mutate(gameId, userId, (state) => engine.kickPlayer(state, userId, playerId)),

    claim_host: (userId, { gameId }) =>
      mutate(gameId, userId, async (state) => {
        const host = state.players.find((p) => p.id === state.hostId);
        const idle = host ? (await idleUserIds(gameId, state, hostIdleMs)).includes(host.userId) : true;
        return engine.claimHost(state, userId, { hostIdle: idle });
      }),

    action: (userId, { gameId, action }) =>
      mutate(
        gameId,
        userId,
        async (state) => {
          const idle = action?.type === 'FORCE_SKIP' ? await idleUserIds(gameId, state, idleMs) : [];
          return engine.applyAction(state, userId, action, { rng, now: now(), idle });
        },
        { duplicateOk: true },
      ),

    /** Start (or join) the rematch of a finished game: same settings, same names and colours. */
    async rematch(userId, { gameId }) {
      if (typeof gameId !== 'string' || !UUID_PATTERN.test(gameId)) throw new GameError('BAD_REQUEST', 'Missing game id.');
      const record = await store.load(gameId);
      const idx = record ? engine.playerIndexByUser(record.state, userId) : -1;
      if (idx < 0) throw new GameError('NOT_FOUND', 'That game no longer exists.');
      const old = record.state;
      if (old.status !== 'finished') throw new GameError('NOT_FINISHED', 'Finish this game first.');
      const me = old.players[idx];
      const follow = (pointer) => ops.join(userId, { code: pointer.code, username: me.name, color: me.color });

      const existing = old.rematch;
      if (existing && (await store.load(existing.gameId))) return follow(existing);

      const created = await ops.create(userId, { username: me.name, settings: old.settings, color: me.color });
      const linked = await mutate(gameId, userId, (state) =>
        engine.setRematch(state, userId, { gameId: created.gameId, code: created.public.code }, { replacing: existing?.gameId ?? null }),
      );
      const pointer = linked.public.rematch;
      if (pointer.gameId === created.gameId) return created;
      // Someone else opened the rematch at the same moment: use theirs.
      await store.remove(created.gameId);
      return follow(pointer);
    },

    /**
     * Public, read-only summary of a table for invite-link previews (Discord
     * unfurls). Anyone holding the code could join it anyway; this shows the
     * island, names and settings — never hands, cards or who holds what.
     */
    async preview(_userId, { code }) {
      const clean = normalizeCode(code);
      if (!CODE_PATTERN.test(clean)) throw new GameError('BAD_CODE', 'Game codes are 5 letters and numbers.');
      const game = await store.findByCode(clean);
      const record = game ? await store.load(game.id) : null;
      if (!record) throw new GameError('NOT_FOUND', 'No game uses that code.');
      const s = record.state;
      const host = s.players.find((p) => p.id === s.hostId) ?? s.players[0];
      return {
        ok: true,
        preview: {
          code: s.code,
          status: s.status,
          host: host?.name ?? null,
          players: s.players.map((p) => ({ name: p.name, color: p.color })),
          settings: s.settings,
          mapNumber: s.board.seed,
          board: { layout: s.board.layout ?? 'classic', hexes: s.board.hexes, harbors: s.board.harbors },
          winner: s.winner != null ? s.players[s.winner]?.name ?? null : null,
        },
      };
    },

    async sync(userId, { gameId }) {
      if (typeof gameId !== 'string' || !UUID_PATTERN.test(gameId)) throw new GameError('BAD_REQUEST', 'Missing game id.');
      const record = await store.load(gameId);
      if (!record || engine.playerIndexByUser(record.state, userId) < 0) {
        throw new GameError('NOT_FOUND', 'That game no longer exists.');
      }
      return respond(record.state, userId, record.version);
    },
  };

  /** Returns { ok: true, ... } or { ok: false, error: { code, message } }. */
  return async function handle(userId, body) {
    const op = body?.op;
    if (!userId && op !== 'preview') return { ok: false, error: { code: 'UNAUTHORIZED', message: 'No session.' } };
    if (typeof op !== 'string' || !Object.hasOwn(ops, op)) {
      return { ok: false, error: { code: 'BAD_REQUEST', message: 'Unknown request.' } };
    }
    try {
      return await ops[op](userId, body);
    } catch (err) {
      if (err instanceof GameError) return { ok: false, error: { code: err.code, message: err.message } };
      throw err;
    }
  };
}
