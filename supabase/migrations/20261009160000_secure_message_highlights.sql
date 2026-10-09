-- Preserve existing policies, while requiring ownership for every operation.
-- Restrictive rules also constrain any older permissive policies.
begin;
alter table public.message_highlights enable row level security;
revoke all on public.message_highlights from anon;
grant select, insert, delete on public.message_highlights to authenticated;
drop policy if exists message_highlights_private_guard on public.message_highlights;
create policy message_highlights_private_guard on public.message_highlights
  as restrictive for all to authenticated
  using (profile_id = auth.uid())
  with check (
    profile_id = auth.uid() and exists (
      select 1 from public.messages m where m.id = message_id
        and (m.sender_id = auth.uid() or m.receiver_id = auth.uid())
    )
  );
drop policy if exists message_highlights_own_select on public.message_highlights;
create policy message_highlights_own_select on public.message_highlights
  for select to authenticated using (profile_id = auth.uid());
drop policy if exists message_highlights_own_insert on public.message_highlights;
create policy message_highlights_own_insert on public.message_highlights
  for insert to authenticated with check (profile_id = auth.uid());
drop policy if exists message_highlights_own_delete on public.message_highlights;
create policy message_highlights_own_delete on public.message_highlights
  for delete to authenticated using (profile_id = auth.uid());
notify pgrst, 'reload schema';
commit;
