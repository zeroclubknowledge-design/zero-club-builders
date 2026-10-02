-- ALREADY APPLIED to Supabase project tiyifgfsuzhcvdvntjmp on 2026-10-02. Kept as a record only — do not re-run.
--
-- zero_tournament_preview: signed-out summary for link previews (private
--   tournaments reveal only their game without the invite code).
-- update_zero_tournament: the host edits name, description, start (while
--   upcoming), end, player limit (never below players already in), access and
--   eligibility. Game, reward type and prizes are not editable — the prize is held.

create or replace function public.zero_tournament_preview(p_id uuid, p_code text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare t public.zero_tournaments;
begin
  select * into t from public.zero_tournaments where id = p_id;
  if t.id is null then return jsonb_build_object('found', false); end if;
  if t.visibility = 'private' and upper(coalesce(p_code, '')) <> t.share_code then
    return jsonb_build_object('found', true, 'locked', true, 'game_type', t.game_type);
  end if;
  return jsonb_build_object(
    'found', true, 'locked', false,
    'title', t.title, 'description', t.description, 'game_type', t.game_type,
    'status', public.zt_status(t), 'starts_at', t.starts_at, 'ends_at', t.ends_at,
    'players', (select count(*) from public.zero_tournament_players p where p.tournament_id = t.id),
    'max_players', t.max_players, 'eligibility', t.eligibility, 'visibility', t.visibility,
    'reward_type', t.reward_type, 'prizes', t.prizes, 'sponsored', t.sponsored,
    'host_name', (select coalesce(nullif(btrim(full_name), ''), username) from public.profiles where id = t.creator_id));
end; $$;
grant execute on function public.zero_tournament_preview(uuid, text) to anon, authenticated;

create or replace function public.update_zero_tournament(p_id uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid(); t public.zero_tournaments;
  new_start timestamptz; new_end timestamptz; new_max int; joined int;
begin
  select * into t from public.zero_tournaments where id = p_id for update;
  if t.id is null then raise exception 'Tournament not found'; end if;
  if t.creator_id is distinct from caller then raise exception 'Only the host can edit this tournament'; end if;
  if public.zt_status(t) = 'ended' then raise exception 'This tournament has ended and can no longer be edited'; end if;
  new_start := t.starts_at;
  if p ? 'starts_at' and public.zt_status(t) = 'upcoming' then
    new_start := greatest(coalesce(nullif(p->>'starts_at', '')::timestamptz, now()), now());
  end if;
  new_end := coalesce(nullif(p->>'ends_at', '')::timestamptz, t.ends_at);
  if new_end < now() + interval '10 minutes' then raise exception 'The end time must be at least 10 minutes from now'; end if;
  if new_end < new_start + interval '10 minutes' then raise exception 'A tournament must run for at least 10 minutes'; end if;
  if new_end > new_start + interval '365 days' then raise exception 'A tournament can run for up to 365 days'; end if;
  select count(*) into joined from public.zero_tournament_players where tournament_id = t.id;
  new_max := case when p ? 'max_players' then nullif(p->>'max_players', '')::int else t.max_players end;
  if new_max is not null and new_max < greatest(2, joined) then
    raise exception 'The player limit cannot be below the % players already in', greatest(2, joined);
  end if;
  if p ? 'title' and length(btrim(p->>'title')) not between 3 and 80 then raise exception 'Give the tournament a name (3–80 characters)'; end if;
  update public.zero_tournaments set
    title = case when p ? 'title' then btrim(p->>'title') else title end,
    description = case when p ? 'description' then nullif(left(btrim(coalesce(p->>'description', '')), 600), '') else description end,
    starts_at = new_start, ends_at = new_end, max_players = new_max,
    visibility = case when p->>'visibility' in ('public', 'private') then p->>'visibility' else visibility end,
    eligibility = case when p->>'eligibility' in ('everyone', 'subscribers') then p->>'eligibility' else eligibility end
  where id = t.id;
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.update_zero_tournament(uuid, jsonb) to authenticated;
