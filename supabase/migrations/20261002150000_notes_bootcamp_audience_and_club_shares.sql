-- ALREADY APPLIED to Supabase project tiyifgfsuzhcvdvntjmp on 2026-10-02. Kept as a record only — do not re-run.
--
-- ZeroNotes audiences.
--  * A note is either public (anyone) or for selected bootcamps. A bootcamp
--    note can be read by its author, the bootcamps' managers, their enrolled
--    learners, members of each bootcamp's club, and members of any club an
--    admin has attached it to.
--  * Club admins (only) can attach their notes in a club's General chat; the
--    attachment is what lets that club's members open it.
--  * Final applied state: the chosen bootcamps live in notes.bootcamp_ids
--    (uuid[]). The note_bootcamps table below was created first and is unused.

alter table public.notes add column if not exists audience text not null default 'public';
alter table public.notes add column if not exists bootcamp_ids uuid[] not null default '{}';
do $$ begin
  alter table public.notes add constraint notes_audience_check check (audience in ('public', 'bootcamps'));
exception when duplicate_object then null; end $$;

create table if not exists public.note_bootcamps (
  note_id uuid not null references public.notes(id) on delete cascade,
  bootcamp_id uuid not null references public.bootcamps(id) on delete cascade,
  primary key (note_id, bootcamp_id)
);
create table if not exists public.note_club_shares (
  note_id uuid not null references public.notes(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  shared_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (note_id, club_id)
);
alter table public.note_bootcamps enable row level security;
alter table public.note_club_shares enable row level security;
-- No table policies: both are read and written only through the functions below.

create or replace function public.can_read_note(p_note uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.notes n
    where n.id = p_note and (
      n.author_id = auth.uid()
      or (n.is_published and n.audience = 'public')
      or (n.is_published and n.audience = 'bootcamps' and auth.uid() is not null and (
        public.is_zero_club_admin()
        or exists (
          select 1 from unnest(n.bootcamp_ids) as nb(bootcamp_id)
          where public.can_manage_bootcamp(nb.bootcamp_id)
            or exists (select 1 from public.enrollments e where e.bootcamp_id = nb.bootcamp_id and e.profile_id = auth.uid())
            or exists (select 1 from public.clubs c join public.club_members m on m.club_id = c.id
                       where c.bootcamp_id = nb.bootcamp_id and m.profile_id = auth.uid())
        )
        or exists (
          select 1 from public.note_club_shares s
          where s.note_id = n.id and (
            exists (select 1 from public.club_members m where m.club_id = s.club_id and m.profile_id = auth.uid())
            or exists (select 1 from public.clubs c where c.id = s.club_id and c.creator_id = auth.uid())
          )
        )
      ))
    )
  );
$$;
grant execute on function public.can_read_note(uuid) to anon, authenticated;

-- Readers: public notes as before, bootcamp notes only to people entitled to them.
alter policy "Notes are viewable by everyone." on public.notes
  using (is_published = true and (audience = 'public' or public.can_read_note(id)));

-- Writes stay with the author (the old insert policy accepted any author_id).
alter policy "Users can insert their own notes." on public.notes
  with check (auth.uid() = author_id);

/* Bootcamps the signed-in person can publish notes for. */
create or replace function public.my_note_bootcamps()
returns table (id uuid, title text, status text)
language sql stable security definer set search_path = public as $$
  select b.id, b.title, b.status from public.bootcamps b
  where auth.uid() is not null and public.can_manage_bootcamp(b.id)
  order by b.created_at desc;
$$;
grant execute on function public.my_note_bootcamps() to authenticated;

/* Set who a note is for. Author only; bootcamps must be ones they manage. */
create or replace function public.set_note_audience(p_note uuid, p_audience text, p_bootcamps uuid[] default '{}')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare b uuid;
begin
  if not exists (select 1 from public.notes where id = p_note and author_id = auth.uid()) then
    raise exception 'Only the author can change who a note is for';
  end if;
  if p_audience not in ('public', 'bootcamps') then raise exception 'Unknown audience'; end if;
  if p_audience = 'bootcamps' then
    if coalesce(array_length(p_bootcamps, 1), 0) = 0 then raise exception 'Choose at least one bootcamp'; end if;
    foreach b in array p_bootcamps loop
      if not public.can_manage_bootcamp(b) then raise exception 'You can only publish for bootcamps you own or manage'; end if;
    end loop;
  end if;
  update public.notes
     set audience = p_audience,
         bootcamp_ids = case when p_audience = 'bootcamps' then (select array_agg(distinct x) from unnest(p_bootcamps) x) else '{}' end
   where id = p_note;
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.set_note_audience(uuid, text, uuid[]) to authenticated;

/* For the author's editor: current audience and bootcamps. */
create or replace function public.get_note_audience(p_note uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select case when n.author_id = auth.uid() then jsonb_build_object(
    'audience', n.audience,
    'bootcamp_ids', to_jsonb(n.bootcamp_ids))
  end
  from public.notes n where n.id = p_note;
$$;
grant execute on function public.get_note_audience(uuid) to authenticated;

/* What a locked reader may be told about a note it cannot open. */
create or replace function public.note_lock_info(p_note uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select case
    when n.id is null or not n.is_published then jsonb_build_object('exists', false)
    when public.can_read_note(n.id) then jsonb_build_object('exists', true, 'locked', false)
    else jsonb_build_object('exists', true, 'locked', true, 'title', n.title,
      'bootcamps', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'title', b.title))
                             from public.bootcamps b where b.id = any(n.bootcamp_ids) and b.status = 'active'), '[]'::jsonb))
  end
  from (select 1) one left join public.notes n on n.id = p_note;
$$;
grant execute on function public.note_lock_info(uuid) to anon, authenticated;

/* Club admins: their published notes, to attach in General. */
create or replace function public.club_attachable_notes(p_club uuid)
returns table (id uuid, slug text, title text, cover_url text, audience text, bootcamps text[], created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_club_admin(p_club, auth.uid()) then raise exception 'Only club admins can attach notes'; end if;
  return query
    select n.id, n.slug, n.title, n.cover_url, n.audience,
      coalesce((select array_agg(b.title order by b.title) from public.bootcamps b where b.id = any(n.bootcamp_ids)), '{}'),
      n.created_at
    from public.notes n
    where n.author_id = auth.uid() and n.is_published
    order by n.created_at desc
    limit 100;
end; $$;
grant execute on function public.club_attachable_notes(uuid) to authenticated;

/* Attach: records the share (which lets this club's members read it). */
create or replace function public.share_note_to_club(p_note uuid, p_club uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare n public.notes;
begin
  if not public.is_club_admin(p_club, auth.uid()) then raise exception 'Only club admins can attach notes'; end if;
  select * into n from public.notes where id = p_note;
  if n.id is null or n.author_id <> auth.uid() or not n.is_published then raise exception 'You can only attach notes you have published'; end if;
  insert into public.note_club_shares (note_id, club_id, shared_by) values (p_note, p_club, auth.uid())
  on conflict (note_id, club_id) do nothing;
  return jsonb_build_object('ok', true, 'id', n.id, 'slug', n.slug, 'title', n.title, 'cover_url', n.cover_url, 'audience', n.audience);
end; $$;
grant execute on function public.share_note_to_club(uuid, uuid) to authenticated;

/* Only club admins can post a note card in a club. */
create or replace function public.guard_club_note_cards()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.content like '::ZEROCLUB_NOTE::%' and not public.is_club_admin(new.club_id, new.profile_id) then
    raise exception 'Only club admins can attach notes';
  end if;
  return new;
end; $$;
create trigger guard_club_note_cards before insert or update of content on public.club_messages
for each row execute function public.guard_club_note_cards();
