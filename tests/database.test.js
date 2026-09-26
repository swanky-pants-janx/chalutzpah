// Runs the real migration in PGlite (Postgres compiled to WASM) with a minimal
// stand-in for Supabase's roles and auth.uid(), then checks the security model.

import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';

const MIGRATIONS = new URL('../supabase/migrations/', import.meta.url);
const migrationFiles = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
const U3 = '33333333-3333-4333-8333-333333333333';
const G = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const members = [
  { user_id: U1, player_id: 'p1' },
  { user_id: U2, player_id: 'p2' },
];
const privates = [
  { player_id: 'p1', user_id: U1, data: { hand: 'U1 secret' } },
  { player_id: 'p2', user_id: U2, data: { hand: 'U2 secret' } },
];

let db;

async function run(sql, params) {
  try {
    return { rows: (await db.query(sql, params)).rows };
  } catch (err) {
    return { error: err.message, code: err.code };
  }
}

async function as(role, sub, sql, params) {
  await db.exec(`set role ${role}`);
  await db.query("select set_config('request.jwt.claims', $1, false)", [sub ? JSON.stringify({ sub, role }) : '']);
  try {
    return await run(sql, params);
  } finally {
    await db.exec('reset role');
  }
}

const commit = (expected, status, priv = privates, mem = members) =>
  as('service_role', null, 'select public.commit_game($1,$2,$3,$4,$5,$6,$7) v', [
    G,
    expected,
    { v: expected + 1 },
    { pub: expected + 1 },
    status,
    JSON.stringify(priv),
    JSON.stringify(mem),
  ]);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
    $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    create publication supabase_realtime;
  `);
  for (const file of migrationFiles) await db.exec(readFileSync(new URL(file, MIGRATIONS), 'utf8'));
  await db.exec(`insert into auth.users values ('${U1}'), ('${U2}'), ('${U3}')`);
  const created = await as('service_role', null, 'select public.create_game($1,$2,$3,$4,$5,$6) v', [
    G,
    'X7K4P',
    { v: 1 },
    { pub: 1 },
    JSON.stringify(privates),
    JSON.stringify(members),
  ]);
  expect(created.rows[0].v).toBe(1);
}, 30_000);

describe('database: atomic commits', () => {
  it('rejects a duplicate game code', async () => {
    const r = await as('service_role', null, 'select public.create_game($1,$2,$3,$4,$5,$6)', [
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'X7K4P',
      {},
      {},
      '[]',
      '[]',
    ]);
    expect(r.code).toBe('23505');
  });

  it('compare-and-swap: only a commit on the latest version succeeds', async () => {
    expect((await commit(1, 'setup')).rows[0].v).toBe(2);
    expect((await commit(1, 'setup')).rows[0].v).toBeNull();
    const { rows } = await run('select version, state from public.game_secrets');
    expect(rows[0]).toEqual({ version: 2, state: { v: 2 } });
  });
});

describe('database: row level security', () => {
  it('members read their game and only their own hand', async () => {
    expect((await as('authenticated', U1, 'select public_state from public.games')).rows).toHaveLength(1);
    const hands = await as('authenticated', U1, 'select data from public.player_private');
    expect(hands.rows).toEqual([{ data: { hand: 'U1 secret' } }]);
  });

  it('nobody but the server reads the secret state', async () => {
    expect((await as('authenticated', U1, 'select * from public.game_secrets')).error).toMatch(/permission denied/);
    expect((await as('anon', null, 'select * from public.games')).error).toMatch(/permission denied/);
  });

  it('non-members see nothing', async () => {
    expect((await as('authenticated', U3, 'select * from public.games')).rows).toHaveLength(0);
    expect((await as('authenticated', U3, 'select * from public.player_private')).rows).toHaveLength(0);
  });

  it('players cannot write anything directly', async () => {
    const attempts = [
      `update public.games set public_state = '{"vp":10}'`,
      `update public.player_private set data = '{"hand":999}'`,
      `insert into public.game_members (game_id, user_id, player_id) values ('${G}', '${U3}', 'px')`,
      `delete from public.game_members`,
      `select public.commit_game('${G}', 2, '{}', '{}', 'playing', '[]', '[]')`,
      `select public.create_game('${G}', 'ZZZZZ', '{}', '{}', '[]', '[]')`,
      `select public.sync_game_rows('${G}', 9, '[]', '[]')`,
      `select public.cleanup_stale_games()`,
    ];
    for (const sql of attempts) {
      expect((await as('authenticated', U1, sql)).error, sql).toMatch(/permission denied/);
    }
  });

  it('heartbeats only touch the caller\'s own row', async () => {
    await run("update public.game_members set last_seen = now() - interval '1 hour'");
    expect((await as('authenticated', U1, 'select public.touch_game($1)', [G])).error).toBeUndefined();
    const { rows } = await run(
      "select user_id, last_seen > now() - interval '1 minute' as fresh from public.game_members order by user_id",
    );
    expect(rows.map((r) => r.fresh)).toEqual([true, false]);
  });
});

describe('database: membership and cleanup', () => {
  it('a commit drops departed players and their hands, and they lose access', async () => {
    expect((await commit(2, 'lobby', privates.slice(0, 1), members.slice(0, 1))).rows[0].v).toBe(3);
    const { rows } = await run(
      'select (select count(*) from public.game_members)::int m, (select count(*) from public.player_private)::int p',
    );
    expect(rows[0]).toEqual({ m: 1, p: 1 });
    expect((await as('authenticated', U2, 'select * from public.games')).rows).toHaveLength(0);
  });

  it('realtime publishes only the public game row and private hands', async () => {
    const { rows } = await run("select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1");
    expect(rows.map((r) => r.tablename)).toEqual(['games', 'player_private']);
  });

  it('stale lobbies are cleaned up with everything attached', async () => {
    await run("update public.games set updated_at = now() - interval '7 hours'");
    expect((await as('service_role', null, 'select public.cleanup_stale_games() n')).rows[0].n).toBe(1);
    const { rows } = await run(
      'select (select count(*) from public.games)::int g, (select count(*) from public.game_secrets)::int s, (select count(*) from public.game_members)::int m',
    );
    expect(rows[0]).toEqual({ g: 0, s: 0, m: 0 });
  });
});

describe('database: abandoned games', () => {
  const insertGame = async (id, code, players) => {
    await as('service_role', null, 'select public.create_game($1,$2,$3,$4,$5,$6)', [
      id,
      code,
      {},
      { players },
      JSON.stringify([]),
      JSON.stringify([{ user_id: U1, player_id: 'p1' }]),
    ]);
    await run("update public.games set status = 'playing' where id = $1", [id]);
  };

  it('cleanup disbands in-progress games everyone has left, and keeps ones with someone seated', async () => {
    const empty = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const busy = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    await insertGame(empty, 'EMPTY', [{ id: 'p1', left: true }, { id: 'p2', left: true }]);
    await insertGame(busy, 'BUSYY', [{ id: 'p1', left: true }, { id: 'p2', left: false }]);
    expect((await as('service_role', null, 'select public.cleanup_stale_games() n')).rows[0].n).toBe(1);
    const { rows } = await run('select id from public.games order by id');
    expect(rows.map((r) => r.id)).toEqual([busy]);
  });
});
