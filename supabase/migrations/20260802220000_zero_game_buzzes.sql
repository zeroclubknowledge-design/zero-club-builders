-- Let competition participants summon an absent player back to their seat.
-- Delivery uses the existing notifications realtime and push pipeline.

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (type in (
    'like', 'comment_like', 'comment', 'follow', 'repost', 'mention',
    'system', 'build_tagged', 'game_buzz'
  ));

create table if not exists public.zero_game_buzzes (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.zero_game_competitions(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  check (sender_id <> recipient_id)
);

create index if not exists zero_game_buzzes_pair_created_idx
  on public.zero_game_buzzes (competition_id, sender_id, recipient_id, created_at desc);

create index if not exists zero_game_buzzes_recipient_created_idx
  on public.zero_game_buzzes (competition_id, recipient_id, created_at desc);

alter table public.zero_game_buzzes enable row level security;

drop policy if exists zero_game_buzzes_select_involved on public.zero_game_buzzes;
create policy zero_game_buzzes_select_involved
  on public.zero_game_buzzes for select to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid());

grant select on public.zero_game_buzzes to authenticated;

create or replace function public.buzz_zero_game_player(
  p_competition_id uuid,
  p_recipient_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  competition public.zero_game_competitions;
  recipient_last_seen timestamptz;
  pair_last_buzz timestamptz;
  recipient_last_buzz timestamptz;
begin
  if caller is null then raise exception 'You must be signed in'; end if;
  if p_recipient_id = caller then raise exception 'You cannot buzz yourself'; end if;

  select * into competition
  from public.zero_game_competitions
  where id = p_competition_id;

  if competition.id is null then raise exception 'Competition not found'; end if;
  if competition.status not in ('open', 'countdown') then
    raise exception 'Players can only be buzzed before the race begins';
  end if;
  if caller <> competition.creator_id and not exists (
    select 1 from public.zero_game_players
    where competition_id = competition.id and profile_id = caller
  ) then
    raise exception 'Only players in this competition can send a buzz';
  end if;
  if not exists (
    select 1 from public.zero_game_players
    where competition_id = competition.id and profile_id = p_recipient_id
  ) then
    raise exception 'This player no longer has a seat';
  end if;

  select last_seen_at into recipient_last_seen
  from public.zero_game_presence
  where competition_id = competition.id and profile_id = p_recipient_id;

  if recipient_last_seen is not null
    and recipient_last_seen >= clock_timestamp() - interval '20 seconds'
  then
    raise exception 'This player is already live in the game';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(competition.id::text || ':' || p_recipient_id::text, 0)
  );

  select max(created_at) into pair_last_buzz
  from public.zero_game_buzzes
  where competition_id = competition.id
    and sender_id = caller
    and recipient_id = p_recipient_id;

  if pair_last_buzz is not null
    and pair_last_buzz >= clock_timestamp() - interval '45 seconds'
  then
    raise exception 'Wait a moment before buzzing this player again';
  end if;

  select max(created_at) into recipient_last_buzz
  from public.zero_game_buzzes
  where competition_id = competition.id
    and recipient_id = p_recipient_id;

  if recipient_last_buzz is not null
    and recipient_last_buzz >= clock_timestamp() - interval '12 seconds'
  then
    raise exception 'This player was just buzzed by someone else';
  end if;

  insert into public.zero_game_buzzes (competition_id, sender_id, recipient_id)
  values (competition.id, caller, p_recipient_id);

  insert into public.notifications (recipient_id, actor_id, type, content, entity_id)
  values (
    p_recipient_id,
    caller,
    'game_buzz',
    'Your seat is waiting in ' || competition.title || '. Tap to join now.',
    competition.id
  );

  return jsonb_build_object('sent', true, 'cooldown_seconds', 45);
end;
$$;

revoke all on function public.buzz_zero_game_player(uuid, uuid) from public;
grant execute on function public.buzz_zero_game_player(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
