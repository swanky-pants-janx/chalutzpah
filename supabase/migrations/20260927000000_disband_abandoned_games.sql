-- Disband games that every player has left.
--
-- The game server now deletes an in-progress game the moment its last player
-- leaves. This extends the periodic cleanup to sweep up any such game that is
-- still around (e.g. from before that change), and runs it once now.

create or replace function public.cleanup_stale_games()
returns integer
language sql
security definer
set search_path = ''
as $$
  with gone as (
    delete from public.games g
     where (g.status = 'lobby' and g.updated_at < now() - interval '6 hours')
        or g.updated_at < now() - interval '3 days'
        or (
          g.status in ('setup', 'playing')
          and not exists (
            select 1
              from jsonb_array_elements(g.public_state -> 'players') p
             where coalesce((p ->> 'left')::boolean, false) = false
          )
        )
    returning 1
  )
  select count(*)::integer from gone;
$$;

revoke execute on function public.cleanup_stale_games() from public, anon, authenticated;
grant execute on function public.cleanup_stale_games() to service_role;

-- Sweep up any abandoned games right away.
select public.cleanup_stale_games();
