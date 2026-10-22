-- APPLIED to project tiyifgfsuzhcvdvntjmp as zero_words_v2 (2026-10-22). Record only.
-- Zero Words v2: learn your field's vocabulary from your own material.
--
-- A member pastes text from their field. Zero AI (server route
-- /api/zero-words/extract) picks ~8 key terms with a plain meaning and the
-- sentence each came from, saved as a word pack. A round has three stages
-- (Find in a letter grid → Match meaning to term → Recall the term in its
-- sentence). Results feed the member's Word Bank, a Leitner box per term:
--   wrong → box 0, due tomorrow;  right → up one box.
--   Due after: box1 1 day, box2 3 days, box3 7 days, box4 14 days, box5 30 days.
--   Box 4+ counts as "mastered".
-- Pastes cost AI calls: free members get 3 a day, PRO (portfolio_premium_allowed) unlimited.

create table if not exists public.word_packs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  field text not null check (char_length(btrim(field)) between 1 and 60),
  source_excerpt text check (source_excerpt is null or char_length(source_excerpt) <= 600),
  terms jsonb not null check (jsonb_typeof(terms) = 'array' and jsonb_array_length(terms) between 3 and 12),
  ai boolean not null default true,
  visibility text not null default 'private' check (visibility in ('private','club','public')),
  club_id uuid,
  plays integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists word_packs_owner on public.word_packs(owner_id, created_at desc);
create index if not exists word_packs_club on public.word_packs(club_id, created_at desc) where club_id is not null;
alter table public.word_packs enable row level security;
revoke all on public.word_packs from public, anon, authenticated;

create table if not exists public.word_bank (
  profile_id uuid not null references public.profiles(id),
  term_key text not null,
  term text not null,
  meaning text,
  context text,
  field text,
  pack_id uuid,
  box integer not null default 0 check (box between 0 and 5),
  due_at timestamptz not null default now(),
  seen integer not null default 0,
  correct integer not null default 0,
  last_result boolean,
  last_seen timestamptz,
  created_at timestamptz not null default now(),
  primary key (profile_id, term_key)
);
create index if not exists word_bank_due on public.word_bank(profile_id, due_at);
alter table public.word_bank enable row level security;
revoke all on public.word_bank from public, anon, authenticated;

create table if not exists public.word_pack_quota (
  profile_id uuid not null references public.profiles(id),
  day date not null,
  used integer not null default 0,
  primary key (profile_id, day)
);
alter table public.word_pack_quota enable row level security;
revoke all on public.word_pack_quota from public, anon, authenticated;

create table if not exists public.word_activity (
  profile_id uuid not null references public.profiles(id),
  day date not null,
  answered integer not null default 0,
  primary key (profile_id, day)
);
alter table public.word_activity enable row level security;
revoke all on public.word_activity from public, anon, authenticated;

create or replace function public.word_today() returns date language sql stable as $$
  select (now() at time zone 'Africa/Lagos')::date
$$;

create or replace function public.word_box_interval(p_box integer) returns interval language sql immutable as $$
  select case p_box when 0 then interval '1 day' when 1 then interval '1 day' when 2 then interval '3 days'
    when 3 then interval '7 days' when 4 then interval '14 days' else interval '30 days' end
$$;

-- Daily paste allowance. Claimed before the AI call; released if it fails.
create or replace function public.claim_word_pack_quota()
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); premium boolean; used_now integer;
begin
  if me is null then raise exception 'Sign in to create word packs'; end if;
  premium := coalesce(public.portfolio_premium_allowed(me), false);
  insert into word_pack_quota (profile_id, day, used) values (me, word_today(), 0)
  on conflict (profile_id, day) do nothing;
  select used into used_now from word_pack_quota where profile_id = me and day = word_today() for update;
  if not premium and used_now >= 3 then
    return jsonb_build_object('ok', false, 'used', used_now, 'limit', 3, 'premium', false);
  end if;
  update word_pack_quota set used = used + 1 where profile_id = me and day = word_today();
  return jsonb_build_object('ok', true, 'used', used_now + 1, 'limit', case when premium then null else 3 end, 'premium', premium);
end $$;

create or replace function public.release_word_pack_quota()
returns void language sql security definer set search_path = public as $$
  update word_pack_quota set used = greatest(0, used - 1) where profile_id = auth.uid() and day = word_today()
$$;

create or replace function public.word_pack_quota_status()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); premium boolean; used_now integer;
begin
  if me is null then return jsonb_build_object('used', 0, 'limit', 3, 'premium', false); end if;
  premium := coalesce(public.portfolio_premium_allowed(me), false);
  select used into used_now from word_pack_quota where profile_id = me and day = word_today();
  return jsonb_build_object('used', coalesce(used_now, 0), 'limit', case when premium then null else 3 end, 'premium', premium);
end $$;

-- Saves a pack. Terms are cleaned and checked here, whatever the caller sent.
create or replace function public.create_word_pack(p_title text, p_field text, p_excerpt text, p_terms jsonb, p_ai boolean default true)
returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); clean jsonb := '[]'::jsonb; t jsonb; term text; seen text[] := '{}'; new_id uuid;
begin
  if me is null then raise exception 'Sign in to create word packs'; end if;
  if jsonb_typeof(p_terms) <> 'array' then raise exception 'Invalid terms'; end if;
  for t in select * from jsonb_array_elements(p_terms) loop
    term := btrim(regexp_replace(coalesce(t->>'term', ''), '\s+', ' ', 'g'));
    if char_length(term) between 2 and 40 and not (lower(term) = any(seen)) then
      seen := seen || lower(term);
      clean := clean || jsonb_build_array(jsonb_build_object(
        'term', term,
        'meaning', nullif(left(btrim(coalesce(t->>'meaning', '')), 220), ''),
        'context', nullif(left(btrim(coalesce(t->>'context', '')), 320), '')));
    end if;
    exit when jsonb_array_length(clean) >= 12;
  end loop;
  if jsonb_array_length(clean) < 3 then raise exception 'We could not find enough key terms in that text. Try a longer passage.'; end if;
  insert into word_packs (owner_id, title, field, source_excerpt, terms, ai)
  values (me, left(coalesce(nullif(btrim(p_title), ''), btrim(p_field) || ' words'), 120), left(btrim(p_field), 60),
          nullif(left(btrim(coalesce(p_excerpt, '')), 600), ''), clean, coalesce(p_ai, true))
  returning id into new_id;
  return new_id;
end $$;

create or replace function public.word_pack_visible(p public.word_packs, me uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p.owner_id = me or p.visibility = 'public'
    or (p.visibility = 'club' and p.club_id is not null and exists (
      select 1 from club_members cm join clubs c on c.id = cm.club_id
      where cm.profile_id = me and (cm.club_id = p.club_id or c.parent_club_id = p.club_id)))
    or (p.visibility = 'club' and exists (select 1 from clubs c where c.id = p.club_id and c.creator_id = me))
$$;

create or replace function public.word_pack_json(p public.word_packs, me uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', p.id, 'title', p.title, 'field', p.field, 'terms', p.terms, 'ai', p.ai,
    'visibility', p.visibility, 'club_id', p.club_id, 'plays', p.plays, 'created_at', p.created_at,
    'mine', p.owner_id = me,
    'owner', (select jsonb_build_object('id', pr.id, 'name', coalesce(nullif(btrim(pr.full_name), ''), pr.username, 'Member'), 'avatar_url', pr.avatar_url)
              from profiles pr where pr.id = p.owner_id),
    'club_name', (select name from clubs where id = p.club_id),
    'mastered', (select count(*) from word_bank b where b.profile_id = me and b.pack_id = p.id and b.box >= 4))
$$;

create or replace function public.get_word_pack(p_pack uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare p public.word_packs; me uuid := auth.uid();
begin
  if me is null then raise exception 'Sign in to play'; end if;
  select * into p from word_packs where id = p_pack;
  if not found or not word_pack_visible(p, me) then raise exception 'This word pack is private or no longer exists'; end if;
  return word_pack_json(p, me);
end $$;

create or replace function public.list_word_packs(p_scope text default 'mine', p_club uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(word_pack_json(p, me) order by p.created_at desc) from (
    select * from word_packs p
    where case p_scope
      when 'mine' then p.owner_id = me
      when 'club' then p.visibility = 'club' and p.club_id = p_club and word_pack_visible(p, me)
      when 'shared' then p.owner_id <> me and word_pack_visible(p, me) and p.visibility <> 'private'
      else false end
    order by p.created_at desc limit 60) p), '[]'::jsonb);
end $$;

create or replace function public.share_word_pack(p_pack uuid, p_visibility text, p_club uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); p public.word_packs;
begin
  select * into p from word_packs where id = p_pack and owner_id = me for update;
  if not found then raise exception 'Only the person who made this pack can share it'; end if;
  if p_visibility not in ('private','club','public') then raise exception 'Choose who can see this pack'; end if;
  if p_visibility = 'club' and not exists (
      select 1 from club_members where club_id = p_club and profile_id = me
      union all select 1 from clubs where id = p_club and creator_id = me) then
    raise exception 'You can only share to a club you belong to';
  end if;
  update word_packs set visibility = p_visibility, club_id = case when p_visibility = 'club' then p_club else null end
  where id = p_pack returning * into p;
  return word_pack_json(p, me);
end $$;

-- Results of a pack round or a review. Each item: { term, correct, ms }.
-- Meaning/context come from the pack (or the bank), never from the caller.
create or replace function public.record_word_results(p_pack uuid, p_results jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); p public.word_packs; r jsonb; key text; term_row jsonb; ok boolean; fast boolean;
  promoted integer := 0; answered integer := 0; b public.word_bank;
begin
  if me is null then raise exception 'Sign in to save your progress'; end if;
  if jsonb_typeof(p_results) <> 'array' or jsonb_array_length(p_results) > 40 then raise exception 'Invalid results'; end if;
  if p_pack is not null then
    select * into p from word_packs where id = p_pack;
    if not found or not word_pack_visible(p, me) then raise exception 'This word pack is not available'; end if;
    update word_packs set plays = plays + 1 where id = p_pack;
  end if;
  for r in select * from jsonb_array_elements(p_results) loop
    key := lower(btrim(coalesce(r->>'term', '')));
    if key = '' then continue; end if;
    ok := coalesce((r->>'correct')::boolean, false);
    fast := coalesce((r->>'ms')::integer, 99999) < 8000;
    term_row := null;
    if p_pack is not null then
      select value into term_row from jsonb_array_elements(p.terms) where lower(value->>'term') = key limit 1;
      if term_row is null then continue; end if;
      insert into word_bank (profile_id, term_key, term, meaning, context, field, pack_id)
      values (me, key, term_row->>'term', term_row->>'meaning', term_row->>'context', p.field, p.id)
      on conflict (profile_id, term_key) do nothing;
    end if;
    select * into b from word_bank where profile_id = me and term_key = key for update;
    if not found then continue; end if;
    answered := answered + 1;
    if ok then
      -- A first correct answer starts the climb; after that, only a quick answer moves a term up.
      if b.box = 0 then b.box := 1; elsif fast then b.box := least(5, b.box + 1); end if;
      promoted := promoted + 1;
    else
      b.box := 0;
    end if;
    update word_bank set box = b.box, due_at = now() + word_box_interval(b.box), seen = seen + 1,
      correct = correct + case when ok then 1 else 0 end, last_result = ok, last_seen = now()
    where profile_id = me and term_key = key;
  end loop;
  if answered > 0 then
    insert into word_activity (profile_id, day, answered) values (me, word_today(), answered)
    on conflict (profile_id, day) do update set answered = word_activity.answered + excluded.answered;
  end if;
  return word_bank_summary();
end $$;

create or replace function public.word_bank_summary()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); streak integer := 0; d date;
begin
  if me is null then return '{}'::jsonb; end if;
  d := word_today();
  if not exists (select 1 from word_activity where profile_id = me and day = d) then d := d - 1; end if;
  while exists (select 1 from word_activity where profile_id = me and day = d) loop
    streak := streak + 1; d := d - 1;
  end loop;
  return jsonb_build_object(
    'total', (select count(*) from word_bank where profile_id = me),
    'due', (select count(*) from word_bank where profile_id = me and due_at <= now()),
    'mastered', (select count(*) from word_bank where profile_id = me and box >= 4),
    'learning', (select count(*) from word_bank where profile_id = me and box between 1 and 3),
    'struggling', (select count(*) from word_bank where profile_id = me and box = 0 and seen > 0),
    'streak', streak,
    'reviewed_today', exists (select 1 from word_activity where profile_id = me and day = word_today()),
    'next_due', (select min(due_at) from word_bank where profile_id = me and due_at > now()));
end $$;

-- Terms due for review, oldest first, each with up to 3 other meanings to choose from.
create or replace function public.word_review_due(p_limit integer default 12)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'term', b.term, 'meaning', b.meaning, 'context', b.context, 'field', b.field, 'box', b.box,
      'others', (select coalesce(jsonb_agg(o.term), '[]'::jsonb) from (
          select x.term from word_bank x where x.profile_id = me and x.term_key <> b.term_key order by random() limit 3) o))
      order by b.due_at)
    from (select * from word_bank where profile_id = me and due_at <= now() order by due_at limit greatest(1, least(p_limit, 30))) b), '[]'::jsonb);
end $$;

create or replace function public.word_bank_list(p_limit integer default 200)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('term', term, 'meaning', meaning, 'context', context, 'field', field,
      'box', box, 'due_at', due_at, 'seen', seen, 'correct', correct) order by box asc, due_at asc), '[]'::jsonb)
  from (select * from word_bank where profile_id = auth.uid() order by box asc, due_at asc limit least(p_limit, 500)) w
$$;

revoke all on function public.claim_word_pack_quota(), public.release_word_pack_quota(), public.word_pack_quota_status(),
  public.create_word_pack(text, text, text, jsonb, boolean), public.get_word_pack(uuid), public.list_word_packs(text, uuid),
  public.share_word_pack(uuid, text, uuid), public.record_word_results(uuid, jsonb), public.word_bank_summary(),
  public.word_review_due(integer), public.word_bank_list(integer) from public, anon;
grant execute on function public.claim_word_pack_quota(), public.release_word_pack_quota(), public.word_pack_quota_status(),
  public.create_word_pack(text, text, text, jsonb, boolean), public.get_word_pack(uuid), public.list_word_packs(text, uuid),
  public.share_word_pack(uuid, text, uuid), public.record_word_results(uuid, jsonb), public.word_bank_summary(),
  public.word_review_due(integer), public.word_bank_list(integer) to authenticated;
revoke all on function public.word_pack_visible(public.word_packs, uuid), public.word_pack_json(public.word_packs, uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';
