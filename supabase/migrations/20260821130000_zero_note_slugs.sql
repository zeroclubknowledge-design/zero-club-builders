-- Human-readable public Zero Note URLs. The short UUID suffix prevents two
-- notes with the same title from fighting over a slug, while the full UUID
-- remains the internal relationship key.

alter table public.notes
  add column if not exists slug text;

create or replace function public.make_zero_note_slug(note_title text, note_id uuid)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  base text;
begin
  base := regexp_replace(lower(coalesce(note_title, '')), '[^a-z0-9]+', '-', 'g');
  base := trim(both '-' from left(base, 56));
  if base = '' then base := 'note'; end if;
  return base || '-' || left(replace(note_id::text, '-', ''), 8);
end;
$$;

update public.notes
set slug = public.make_zero_note_slug(title, id)
where slug is null or btrim(slug) = '';

create unique index if not exists notes_slug_unique_idx
  on public.notes (slug);

alter table public.notes
  alter column slug set not null;

create or replace function public.assign_zero_note_slug()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.slug is not null then
    -- Public links are permanent even when the author later changes the title.
    new.slug := old.slug;
  elsif new.slug is null or btrim(new.slug) = '' then
    new.slug := public.make_zero_note_slug(new.title, new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists assign_zero_note_slug on public.notes;
create trigger assign_zero_note_slug
  before insert or update of title, slug on public.notes
  for each row execute function public.assign_zero_note_slug();
