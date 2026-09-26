// In-memory store with the same contract as supabase-store.js. Used by tests
// (including race-condition tests: `delay` yields between load and commit so
// concurrent requests interleave like they would against a real database).

export function createMemoryStore({ delay = 0 } = {}) {
  const games = new Map(); // gameId → { code, state, version, public, privates, members }
  const seen = new Map(); // `${gameId}:${userId}` → ms

  const pause = () => (delay > 0 ? new Promise((r) => setTimeout(r, delay)) : Promise.resolve());
  const copy = (value) => structuredClone(value);

  return {
    games,
    async create(gameId, code, snap) {
      await pause();
      if ([...games.values()].some((g) => g.code === code)) return null;
      games.set(gameId, { code, version: 1, ...copy(snap) });
      return 1;
    },
    async load(gameId) {
      await pause();
      const game = games.get(gameId);
      return game ? { state: copy(game.state), version: game.version } : null;
    },
    async commit(gameId, expectedVersion, snap) {
      await pause();
      const game = games.get(gameId);
      if (!game || game.version !== expectedVersion) return null;
      Object.assign(game, copy(snap));
      game.version += 1;
      return game.version;
    },
    async findByCode(code) {
      for (const [id, game] of games) if (game.code === code) return { id };
      return null;
    },
    async remove(gameId) {
      games.delete(gameId);
    },
    async lastSeen(gameId) {
      const out = {};
      for (const [key, ms] of seen) {
        const [gid, userId] = key.split(':');
        if (gid === gameId) out[userId] = ms;
      }
      return out;
    },
    touch(gameId, userId, ms) {
      seen.set(`${gameId}:${userId}`, ms);
    },
  };
}
