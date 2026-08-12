-- Notifications: entity_id must be optional.
--
-- notifications.entity_id is declared NOT NULL. That fits the notification
-- types it was designed for - a like, comment or repost all point at a post,
-- so entity_id is that post's id.
--
-- It does not fit 'system' notifications, which have no entity: "your
-- registration is confirmed", "you earned a referral bonus", "a new learner
-- registered". Nine separate migration files insert notifications of that kind
-- without an entity_id, and every one fails with:
--
--   null value in column "entity_id" violates not-null constraint
--
-- Making the column nullable is the correct fix rather than inventing a
-- placeholder id: the honest answer for these rows is that there is no entity.
-- Notifications that do have one are unaffected, and nothing that reads
-- entity_id changes - the app and the push function already handle it being
-- absent, because they check for it before building a link.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'notifications'
      and column_name = 'entity_id'
      and is_nullable = 'NO'
  ) then
    alter table public.notifications alter column entity_id drop not null;
  end if;
end $$;

comment on column public.notifications.entity_id is
  'What the notification points at - a post for like/comment/repost, a game '
  'for game_buzz. Null for system notifications, which have no entity.';

-- Let PostgREST see the change straight away rather than serving a stale
-- schema for the next minute.
notify pgrst, 'reload schema';
