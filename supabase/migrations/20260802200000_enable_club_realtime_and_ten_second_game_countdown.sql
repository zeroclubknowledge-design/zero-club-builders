-- Make club conversations live for every connected member and use a short,
-- server-authoritative countdown whenever a Zero Game host starts a race.

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'club_messages'
  ) then
    alter publication supabase_realtime add table public.club_messages;
  end if;

  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'club_message_reactions'
  ) then
    alter publication supabase_realtime add table public.club_message_reactions;
  end if;
end;
$$;

alter table public.club_messages replica identity full;
alter table public.club_message_reactions replica identity full;

create or replace function public.start_zero_game_competition(p_competition_id uuid)
returns public.zero_game_competitions
language plpgsql
security definer
set search_path = public
as $$
declare
  competition public.zero_game_competitions;
  player_count integer;
  ready_count integer;
begin
  select * into competition
  from public.zero_game_competitions
  where id = p_competition_id
  for update;

  if competition.id is null then raise exception 'Competition not found'; end if;
  if competition.creator_id <> auth.uid() then raise exception 'Only the host can start this race'; end if;
  if competition.status <> 'open' then raise exception 'This race has already started'; end if;

  select count(*), count(*) filter (where status = 'ready')
  into player_count, ready_count
  from public.zero_game_players
  where competition_id = competition.id;

  if player_count < 2 then raise exception 'At least two players are required'; end if;
  if ready_count < player_count then raise exception 'Wait until every player is ready'; end if;

  update public.zero_game_competitions
  set status = 'countdown',
      started_at = clock_timestamp() + interval '10 seconds',
      updated_at = now()
  where id = competition.id
  returning * into competition;

  update public.zero_game_players
  set status = 'playing', updated_at = now()
  where competition_id = competition.id;

  return competition;
end;
$$;

revoke all on function public.start_zero_game_competition(uuid) from public;
grant execute on function public.start_zero_game_competition(uuid) to authenticated;

notify pgrst, 'reload schema';
