// Persistence adapter backed by Postgres through supabase-js (service role).
// All multi-row writes go through SECURITY DEFINER SQL functions so that the
// secret state, public state, private hands and membership change atomically.

const UNIQUE_VIOLATION = '23505';

export function createSupabaseStore(db) {
  const fail = (error) => {
    throw new Error(`Database error: ${error.message ?? error}`);
  };

  return {
    async create(gameId, code, snap) {
      const { data, error } = await db.rpc('create_game', {
        p_game_id: gameId,
        p_code: code,
        p_state: snap.state,
        p_public: snap.public,
        p_privates: snap.privates,
        p_members: snap.members,
      });
      if (error) {
        if (error.code === UNIQUE_VIOLATION) return null;
        fail(error);
      }
      return data;
    },

    async load(gameId) {
      const { data, error } = await db
        .from('game_secrets')
        .select('state, version')
        .eq('game_id', gameId)
        .maybeSingle();
      if (error) fail(error);
      return data ?? null;
    },

    async commit(gameId, expectedVersion, snap) {
      const { data, error } = await db.rpc('commit_game', {
        p_game_id: gameId,
        p_expected: expectedVersion,
        p_state: snap.state,
        p_public: snap.public,
        p_status: snap.status,
        p_privates: snap.privates,
        p_members: snap.members,
      });
      if (error) fail(error);
      return data ?? null;
    },

    async findByCode(code) {
      const { data, error } = await db.from('games').select('id').eq('code', code).maybeSingle();
      if (error) fail(error);
      return data ?? null;
    },

    async remove(gameId) {
      const { error } = await db.from('games').delete().eq('id', gameId);
      if (error) fail(error);
    },

    async lastSeen(gameId) {
      const { data, error } = await db.from('game_members').select('user_id, last_seen').eq('game_id', gameId);
      if (error) fail(error);
      return Object.fromEntries((data ?? []).map((row) => [row.user_id, Date.parse(row.last_seen)]));
    },

    async cleanup() {
      const { error } = await db.rpc('cleanup_stale_games');
      if (error) fail(error);
    },
  };
}
