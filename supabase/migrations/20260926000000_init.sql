-- Chalutzpah schema
--
-- Security model
--   * Players authenticate with Supabase *anonymous* sign-in (no email/password;
--     the session lives in localStorage). auth.uid() identifies a browser.
--   * Clients can only SELECT. Every write goes through the `game` Edge Function
--     (service role), which validates moves with the rules engine and calls the
--     SECURITY DEFINER functions below.
--   * game_secrets (full state incl. every hand and the card deck) is unreadable by clients.
--   * games.public_state is readable by seated players only.
--   * player_private rows are readable only by their owner — Realtime honours
--     RLS, so nobody else's hand is ever sent to your browser.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.games (
  id           uuid primary key,
  code         text not null unique check (code ~ '^[2-9A-HJ-NP-Z]{5}$'),
  status       text not null default 'lobby' check (status in ('lobby', 'setup', 'playing', 'finished')),
  public_state jsonb not null,
  version      integer not null default 1,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.game_secrets (
  game_id uuid primary key references public.games (id) on delete cascade,
  state   jsonb not null,
  version integer not null default 1
);

create table public.game_members (
  game_id   uuid not null references public.games (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  player_id text not null,
  joined_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (game_id, user_id)
);
create index game_members_user_idx on public.game_members (user_id);

create table public.player_private (
  game_id   uuid not null references public.games (id) on delete cascade,
  player_id text not null,
  user_id   uuid not null references auth.users (id) on delete cascade,
  data      jsonb not null,
  version   integer not null,
  primary key (game_id, player_id)
);
create index player_private_user_idx on public.player_private (user_id);

create index games_updated_idx on public.games (updated_at);

-- ---------------------------------------------------------------------------
-- Row Level Security (read-only for clients)
-- ---------------------------------------------------------------------------

alter table public.games          enable row level security;
alter table public.game_secrets   enable row level security;
alter table public.game_members   enable row level security;
alter table public.player_private enable row level security;

-- Membership test that bypasses RLS on game_members (avoids policy recursion).
create or replace function public.is_game_member(p_game_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.game_members m
    where m.game_id = p_game_id and m.user_id = auth.uid()
  );
$$;

create policy "Seated players can read their game"
  on public.games for select to authenticated
  using (public.is_game_member(id));

create policy "Players can read their own memberships"
  on public.game_members for select to authenticated
  using (user_id = auth.uid());

create policy "Players can read only their own hand"
  on public.player_private for select to authenticated
  using (user_id = auth.uid());

-- game_secrets: RLS enabled with no policies ⇒ no client access at all.

-- Defence in depth: clients never write directly.
revoke all on public.game_secrets from anon, authenticated;
revoke insert, update, delete, truncate on public.games, public.game_members, public.player_private from anon, authenticated;
revoke all on public.games, public.game_members, public.player_private from anon;

-- ---------------------------------------------------------------------------
-- Heartbeat (clients call this every ~20s while at a table)
-- ---------------------------------------------------------------------------

create or replace function public.touch_game(p_game_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.game_members
     set last_seen = now()
   where game_id = p_game_id and user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Server-only write functions (called by the Edge Function with the service role)
-- ---------------------------------------------------------------------------

create or replace function public.sync_game_rows(p_game_id uuid, p_version integer, p_privates jsonb, p_members jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.game_members m
   where m.game_id = p_game_id
     and not exists (
       select 1 from jsonb_array_elements(p_members) e where (e ->> 'user_id')::uuid = m.user_id
     );

  insert into public.game_members (game_id, user_id, player_id)
  select p_game_id, (e ->> 'user_id')::uuid, e ->> 'player_id'
    from jsonb_array_elements(p_members) e
  on conflict (game_id, user_id) do update set player_id = excluded.player_id;

  delete from public.player_private pp
   where pp.game_id = p_game_id
     and not exists (
       select 1 from jsonb_array_elements(p_privates) e where e ->> 'player_id' = pp.player_id
     );

  -- Only touch rows whose content changed, so Realtime only notifies affected players.
  insert into public.player_private (game_id, player_id, user_id, data, version)
  select p_game_id, e ->> 'player_id', (e ->> 'user_id')::uuid, e -> 'data', p_version
    from jsonb_array_elements(p_privates) e
  on conflict (game_id, player_id) do update
     set data = excluded.data, user_id = excluded.user_id, version = excluded.version
   where public.player_private.data is distinct from excluded.data
      or public.player_private.user_id is distinct from excluded.user_id;
end;
$$;

create or replace function public.create_game(
  p_game_id uuid, p_code text, p_state jsonb, p_public jsonb, p_privates jsonb, p_members jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.games (id, code, status, public_state, version)
  values (p_game_id, p_code, 'lobby', p_public, 1);
  insert into public.game_secrets (game_id, state, version) values (p_game_id, p_state, 1);
  perform public.sync_game_rows(p_game_id, 1, p_privates, p_members);
  return 1;
end;
$$;

-- Compare-and-swap commit: succeeds only if nobody else committed since the
-- caller loaded `p_expected`. Returns the new version, or NULL on conflict.
create or replace function public.commit_game(
  p_game_id uuid, p_expected integer, p_state jsonb, p_public jsonb, p_status text, p_privates jsonb, p_members jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new integer;
begin
  update public.game_secrets
     set state = p_state, version = version + 1
   where game_id = p_game_id and version = p_expected
  returning version into v_new;

  if v_new is null then
    return null;
  end if;

  perform public.sync_game_rows(p_game_id, v_new, p_privates, p_members);

  update public.games
     set public_state = p_public, status = p_status, version = v_new, updated_at = now()
   where id = p_game_id;

  return v_new;
end;
$$;

-- Abandoned lobbies vanish after 6 hours, everything else after 3 days idle.
create or replace function public.cleanup_stale_games()
returns integer
language sql
security definer
set search_path = ''
as $$
  with gone as (
    delete from public.games
     where (status = 'lobby' and updated_at < now() - interval '6 hours')
        or updated_at < now() - interval '3 days'
    returning 1
  )
  select count(*)::integer from gone;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------

revoke execute on function public.sync_game_rows(uuid, integer, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.create_game(uuid, text, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.commit_game(uuid, integer, jsonb, jsonb, text, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.cleanup_stale_games() from public, anon, authenticated;
grant execute on function public.sync_game_rows(uuid, integer, jsonb, jsonb) to service_role;
grant execute on function public.create_game(uuid, text, jsonb, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.commit_game(uuid, integer, jsonb, jsonb, text, jsonb, jsonb) to service_role;
grant execute on function public.cleanup_stale_games() to service_role;

revoke execute on function public.touch_game(uuid) from public, anon;
grant execute on function public.touch_game(uuid) to authenticated;
revoke execute on function public.is_game_member(uuid) from public, anon;
grant execute on function public.is_game_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: clients subscribe to their game row and their own private row.
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.games, public.player_private;
