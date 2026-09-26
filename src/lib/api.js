import { supabase } from './supabase.js';

export class GameApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/** Call the `game` Edge Function. Resolves with its payload or throws GameApiError. */
export async function callGame(op, payload = {}) {
  const { data, error } = await supabase.functions.invoke('game', { body: { op, ...payload } });
  if (error) {
    let body = null;
    try {
      body = await error.context?.json?.();
    } catch {
      // not JSON — fall through to a generic message
    }
    throw new GameApiError(
      body?.error?.code ?? 'NETWORK',
      body?.error?.message ?? 'Could not reach the game server. Check your connection and try again.',
    );
  }
  if (!data?.ok) {
    throw new GameApiError(data?.error?.code ?? 'UNKNOWN', data?.error?.message ?? 'Something went wrong.');
  }
  return data;
}
