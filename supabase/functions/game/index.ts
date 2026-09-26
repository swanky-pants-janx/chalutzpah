// The only writer of game data. Verifies the caller's (anonymous) session,
// then hands the request to the shared, engine-backed handler.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { createHandler } from '../_shared/server/handler.js';
import { createSupabaseStore } from '../_shared/server/supabase-store.js';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const handle = createHandler({ store: createSupabaseStore(admin) });

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-region',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: { code: 'BAD_REQUEST', message: 'POST only.' } }, 405);

  // Verify the session token locally against the project's published signing
  // key (cached after the first request) instead of a round trip to the Auth
  // server on every move. Expired or forged tokens are rejected; the anon key
  // itself has no user and role 'anon', so it can't act as a player.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data, error } = token ? await admin.auth.getClaims(token) : { data: null, error: true };
  const userId = data?.claims?.sub;
  if (error || !userId || data.claims.role !== 'authenticated') {
    return json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Your session expired — refresh the page.' } }, 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: { code: 'BAD_REQUEST', message: 'Malformed request.' } }, 400);
  }

  try {
    return json(await handle(userId, body));
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: { code: 'SERVER', message: 'Something went wrong on the server.' } }, 500);
  }
});
