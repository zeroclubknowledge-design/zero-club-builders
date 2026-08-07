-- ============================================================================
-- Notifications: make profile_id and recipient_id interchangeable
--
-- This project grew two names for the same thing. Older code writes
--   insert into notifications (profile_id, ...)
-- and newer code writes
--   insert into notifications (recipient_id, ...)
-- but the live database only has ONE of those columns, so roughly a dozen
-- database functions fail at runtime with:
--   column "profile_id" of relation "notifications" does not exist
--
-- Those functions live across many past migration files and are already
-- installed in the database, so correcting the files would not repair what is
-- already there — every one would have to be re-run in the right order.
--
-- Instead this makes both names valid. Whichever column is missing is added,
-- backfilled from the other, and a trigger keeps the two in step from now on.
-- Every existing function starts working immediately, with nothing to re-run.
--
-- recipient_id remains the name the app reads and the one to use in new code.
-- ============================================================================

do $$
declare
  has_recipient boolean;
  has_profile   boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notifications' and column_name = 'recipient_id'
  ) into has_recipient;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notifications' and column_name = 'profile_id'
  ) into has_profile;

  if not has_recipient and not has_profile then
    raise exception 'public.notifications has neither recipient_id nor profile_id';
  end if;

  -- Add whichever name is missing, then copy the existing values across so
  -- historical rows read correctly under either name.
  --
  -- Deliberately NO foreign key on the mirrored column. Adding one would make
  -- Postgres validate every existing row, and a single notification pointing
  -- at a deleted profile would abort this whole migration. The original column
  -- keeps whatever constraints it already had; this one only shadows it.
  if has_recipient and not has_profile then
    alter table public.notifications add column profile_id uuid;
    update public.notifications set profile_id = recipient_id where profile_id is null;

  elsif has_profile and not has_recipient then
    alter table public.notifications add column recipient_id uuid;
    update public.notifications set recipient_id = profile_id where recipient_id is null;
  end if;
end $$;

-- Keep the two in step. This runs BEFORE insert, so it fills the missing side
-- ahead of any NOT NULL check on either column.
create or replace function public.notifications_sync_recipient()
returns trigger
language plpgsql
as $$
begin
  if new.recipient_id is null then
    new.recipient_id := new.profile_id;
  elsif new.profile_id is null then
    new.profile_id := new.recipient_id;
  end if;
  return new;
end;
$$;

drop trigger if exists notifications_sync_recipient_trigger on public.notifications;
create trigger notifications_sync_recipient_trigger
before insert or update on public.notifications
for each row execute function public.notifications_sync_recipient();

-- Reads and dismissals must work under either name.
create index if not exists notifications_profile_id_idx   on public.notifications(profile_id);
create index if not exists notifications_recipient_id_idx on public.notifications(recipient_id);

drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own
  on public.notifications for delete to authenticated
  using (recipient_id = auth.uid() or profile_id = auth.uid());
