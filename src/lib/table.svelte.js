// Client-side connection to one game table.
//
// Reads come straight from Postgres (RLS limits them to your own game and your
// own hand); writes go through the `game` Edge Function. Realtime pushes every
// committed change, and each update carries a version so late or duplicate
// messages are ignored.

import { mergeView } from '$engine';
import { callGame } from './api.js';
import { load, save } from './storage.js';
import { supabase } from './supabase.js';

const LAST_GAME_KEY = 'chalutzpah:lastGame';
const HEARTBEAT_MS = 20_000;

class TableSession {
  gameId = $state(null);
  pub = $state.raw(null);
  priv = $state.raw(null);
  /** Player ids currently connected (Realtime Presence). */
  online = $state.raw(new Set());
  /** 'idle' | 'connecting' | 'live' | 'offline' */
  connection = $state('idle');
  /** Set when we discover we're no longer seated (kicked / game deleted). */
  removed = $state(false);

  view = $derived(mergeView(this.pub, this.priv));

  #channel = null;
  #heartbeat = null;
  #pubVersion = 0;
  #privVersion = 0;
  #onVisible = () => {
    if (document.visibilityState === 'visible' && this.gameId) {
      this.refresh();
      this.#touch();
    }
  };

  get lastGameId() {
    return load(LAST_GAME_KEY);
  }

  /** Enter a table from a create/join response. */
  async enter(response) {
    this.#reset();
    this.gameId = response.gameId;
    this.applyResponse(response);
    save(LAST_GAME_KEY, response.gameId);
    this.#connect();
  }

  /**
   * Reconnect to a table after a refresh. Resolves false if we're no longer
   * seated there; throws if the server can't be reached (so we don't forget
   * the table just because the network blipped).
   */
  async resume(gameId) {
    this.#reset();
    this.gameId = gameId;
    const found = await this.refresh();
    if (!found) {
      const unreachable = this.connection === 'offline';
      this.#reset();
      if (unreachable) throw new Error('Could not reach the game server. Check your connection and try again.');
      save(LAST_GAME_KEY, null);
      return false;
    }
    save(LAST_GAME_KEY, gameId);
    // A returning player who had left the game re-takes their seat.
    const me = this.view?.players[this.view.me];
    if (me?.left) await this.send('join', { code: this.pub.code, username: me.name }).catch(() => {});
    this.#connect();
    return true;
  }

  applyResponse(res) {
    if (res.public) this.#applyPublic(res.public, res.version);
    if (res.private) this.#applyPrivate(res.private, res.version);
  }

  /** Call the server for this table and apply the fresh state it returns. */
  async send(op, payload = {}) {
    const res = await callGame(op, { gameId: this.gameId, ...payload });
    if (res.gameId === this.gameId) this.applyResponse(res);
    return res;
  }

  /** Submit a game action. Each gets a unique id so a retried request can't apply twice. */
  act(action) {
    return this.send('action', { action: { ...action, id: globalThis.crypto.randomUUID() } });
  }

  /** Pull the latest rows (used on connect, reconnect and tab focus). */
  async refresh() {
    const id = this.gameId;
    if (!id) return false;
    const [game, mine] = await Promise.all([
      supabase.from('games').select('public_state, version').eq('id', id).maybeSingle(),
      supabase.from('player_private').select('data, version').eq('game_id', id).maybeSingle(),
    ]);
    if (id !== this.gameId) return false;
    if (game.error) {
      this.connection = 'offline';
      return Boolean(this.pub);
    }
    if (!game.data) {
      if (this.pub) this.removed = true;
      return false;
    }
    this.#applyPublic(game.data.public_state, game.data.version);
    if (mine.data) this.#applyPrivate(mine.data.data, mine.data.version);
    return true;
  }

  /** Ask everyone at the table to re-sync (e.g. after the host removes someone). */
  nudge() {
    this.#channel?.send({ type: 'broadcast', event: 'nudge', payload: {} });
  }

  async leave() {
    try {
      await this.send('leave');
    } finally {
      this.close();
    }
  }

  close() {
    save(LAST_GAME_KEY, null);
    this.#reset();
  }

  #applyPublic(pub, version) {
    if (!pub || version < this.#pubVersion) return;
    this.#pubVersion = version;
    this.pub = pub;
  }

  #applyPrivate(priv, version) {
    if (!priv || version < this.#privVersion) return;
    this.#privVersion = version;
    this.priv = priv;
  }

  #connect() {
    const gameId = this.gameId;
    const playerId = this.priv?.playerId ?? 'spectator';
    this.connection = 'connecting';

    const channel = supabase.channel(`table:${gameId}`, { config: { presence: { key: playerId } } });
    channel
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` }, ({ new: row }) => {
        if (row?.public_state) this.#applyPublic(row.public_state, row.version);
        else this.refresh();
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'player_private', filter: `game_id=eq.${gameId}` },
        ({ new: row }) => {
          if (row?.data) this.#applyPrivate(row.data, row.version);
        },
      )
      .on('presence', { event: 'sync' }, () => {
        this.online = new Set(Object.keys(channel.presenceState()));
      })
      .on('broadcast', { event: 'nudge' }, () => this.refresh())
      .subscribe((status) => {
        if (channel !== this.#channel) return;
        if (status === 'SUBSCRIBED') {
          this.connection = 'live';
          channel.track({ since: Date.now() });
          // Catch anything committed between the snapshot and the subscription.
          this.refresh();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          this.connection = 'offline';
        }
      });
    this.#channel = channel;

    this.#touch();
    this.#heartbeat = setInterval(() => this.#touch(), HEARTBEAT_MS);
    document.addEventListener('visibilitychange', this.#onVisible);
  }

  #touch() {
    if (this.gameId) supabase.rpc('touch_game', { p_game_id: this.gameId }).then(() => {}, () => {});
  }

  #reset() {
    if (this.#channel) supabase.removeChannel(this.#channel);
    this.#channel = null;
    clearInterval(this.#heartbeat);
    this.#heartbeat = null;
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.#onVisible);
    this.gameId = null;
    this.pub = null;
    this.priv = null;
    this.online = new Set();
    this.connection = 'idle';
    this.removed = false;
    this.#pubVersion = 0;
    this.#privVersion = 0;
  }
}

export const table = new TableSession();

/** Unfinished games this browser is seated at (for "continue" on the home screen). */
export async function myOpenGames() {
  const { data, error } = await supabase
    .from('game_members')
    .select('game_id, games ( code, status, updated_at )')
    .order('joined_at', { ascending: false })
    .limit(5);
  if (error || !data) return [];
  return data
    .filter((row) => row.games && row.games.status !== 'finished')
    .map((row) => ({ gameId: row.game_id, code: row.games.code, status: row.games.status, updatedAt: row.games.updated_at }));
}
