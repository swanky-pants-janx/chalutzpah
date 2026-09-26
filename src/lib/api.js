import { FunctionRegion } from '@supabase/supabase-js';
import { supabase } from './supabase.js';

// Run the game server in the same region as the database (measured ~100 ms
// faster per move than letting Supabase pick the nearest edge). Override with
// VITE_SUPABASE_FUNCTION_REGION if the project lives in another region.
const REGION = import.meta.env.VITE_SUPABASE_FUNCTION_REGION || FunctionRegion.EuWest1;

export class GameApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/** Call the `game` Edge Function. Resolves with its payload or throws GameApiError. */
export async function callGame(op, payload = {}) {
  const { data, error } = await supabase.functions.invoke('game', { body: { op, ...payload }, region: REGION });
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
