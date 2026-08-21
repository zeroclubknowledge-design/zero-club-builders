-- Published Zero Notes are link-readable without requiring a Zero Club account.
-- Drafts remain visible only to their author.

alter table public.notes enable row level security;

drop policy if exists notes_read_published_or_own on public.notes;
create policy notes_read_published_or_own
  on public.notes
  for select
  to anon, authenticated
  using (coalesce(is_published, false) or auth.uid() = author_id);

grant select on table public.notes to anon, authenticated;
