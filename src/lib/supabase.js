import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isConfigured = Boolean(url && key);

export const supabase = isConfigured
  ? createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'chalutzpah-auth' },
      realtime: { params: { eventsPerSecond: 20 } },
    })
  : null;

/**
 * Every browser gets a silent anonymous identity (no email, no password).
 * It persists in localStorage, which is what lets a refresh reconnect you
 * to your seat.
 */
export async function ensureSession() {
  const { data } = await supabase.auth.getSession();
  let session = data.session;
  if (!session) {
    const { data: signedIn, error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
    session = signedIn.session;
  }
  supabase.realtime.setAuth(session.access_token);
  return session;
}
