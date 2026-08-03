-- Track whether joined players still have a competition open, and allow only
-- the host to remove an absent player before the race starts.

create table if not exists public.zero_game_presence (
  competition_id uuid not null,
  profile_id uuid not null,
  last_seen_at timestamptz not null default clock_timestamp(),
  primary key (competition_id, profile_id),
  foreign key (competition_id, profile_id)
    references public.zero_game_players (competition_id, profile_id)
    on delete cascade
);

create index if not exists zero_game_presence_last_seen_idx
  on public.zero_game_presence (competition_id, last_seen_at desc);

alter table public.zero_game_presence enable row level security;

drop policy if exists zero_game_presence_select_participants on public.zero_game_presence;
create policy zero_game_presence_select_participants
  on public.zero_game_presence for select to authenticated
  using (
    exists (
      select 1
      from public.zero_game_competitions as competition
      where competition.id = zero_game_presence.competition_id
        and (
          competition.creator_id = auth.uid()
          or exists (
            select 1
            from public.zero_game_players as viewer
            where viewer.competition_id = competition.id
              and viewer.profile_id = auth.uid()
          )
        )
    )
  );

create or replace function public.initialize_zero_game_presence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.zero_game_presence (competition_id, profile_id, last_seen_at)
  values (new.competition_id, new.profile_id, clock_timestamp())
  on conflict (competition_id, profile_id)
  do update set last_seen_at = excluded.last_seen_at;
  return new;
end;
$$;

drop trigger if exists on_zero_game_player_presence on public.zero_game_players;
create trigger on_zero_game_player_presence
  after insert on public.zero_game_players
  for each row execute function public.initialize_zero_game_presence();

insert into public.zero_game_presence (competition_id, profile_id, last_seen_at)
select player.competition_id, player.profile_id, clock_timestamp()
from public.zero_game_players as player
on conflict (competition_id, profile_id) do nothing;

create or replace function public.heartbeat_zero_game_player(p_competition_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'You must be signed in'; end if;
  if not exists (
    select 1 from public.zero_game_players
    where competition_id = p_competition_id and profile_id = auth.uid()
  ) then raise exception 'Join this competition first'; end if;

  insert into public.zero_game_presence (competition_id, profile_id, last_seen_at)
  values (p_competition_id, auth.uid(), clock_timestamp())
  on conflict (competition_id, profile_id)
  do update set last_seen_at = excluded.last_seen_at;
end;
$$;

create or replace function public.remove_absent_zero_game_player(
  p_competition_id uuid,
  p_profile_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  competition public.zero_game_competitions;
  last_seen timestamptz;
begin
  select * into competition
  from public.zero_game_competitions
  where id = p_competition_id
  for update;

  if competition.id is null then raise exception 'Competition not found'; end if;
  if competition.creator_id <> auth.uid() then raise exception 'Only the host can remove a player'; end if;
  if competition.status <> 'open' then raise exception 'Players cannot be removed after the race starts'; end if;
  if p_profile_id = competition.creator_id then raise exception 'The host cannot be removed'; end if;
  if not exists (
    select 1 from public.zero_game_players
    where competition_id = p_competition_id and profile_id = p_profile_id
  ) then raise exception 'Player is no longer in this competition'; end if;

  select last_seen_at into last_seen
  from public.zero_game_presence
  where competition_id = p_competition_id and profile_id = p_profile_id;

  if last_seen is not null and last_seen >= clock_timestamp() - interval '20 seconds' then
    raise exception 'This player is still live in the game';
  end if;

  delete from public.zero_game_players
  where competition_id = p_competition_id and profile_id = p_profile_id;
end;
$$;

revoke all on function public.heartbeat_zero_game_player(uuid) from public;
revoke all on function public.remove_absent_zero_game_player(uuid, uuid) from public;
grant execute on function public.heartbeat_zero_game_player(uuid) to authenticated;
grant execute on function public.remove_absent_zero_game_player(uuid, uuid) to authenticated;
grant select on public.zero_game_presence to authenticated;

notify pgrst, 'reload schema';
