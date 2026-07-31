-- Members can dismiss their own notifications (swipe to delete).

alter table public.notifications enable row level security;

-- Older databases used profile_id; newer rows use recipient_id. Cover both so
-- the policy works regardless of which column this project has.
do $$
declare
  has_recipient boolean;
  has_profile boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notifications' and column_name = 'recipient_id'
  ) into has_recipient;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notifications' and column_name = 'profile_id'
  ) into has_profile;

  execute 'drop policy if exists notifications_delete_own on public.notifications';

  if has_recipient and has_profile then
    execute 'create policy notifications_delete_own on public.notifications for delete to authenticated using (recipient_id = auth.uid() or profile_id = auth.uid())';
  elsif has_recipient then
    execute 'create policy notifications_delete_own on public.notifications for delete to authenticated using (recipient_id = auth.uid())';
  elsif has_profile then
    execute 'create policy notifications_delete_own on public.notifications for delete to authenticated using (profile_id = auth.uid())';
  end if;
end $$;

notify pgrst, 'reload schema';
