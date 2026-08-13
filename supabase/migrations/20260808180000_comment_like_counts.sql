-- Comment likes: keep a count, so a like is visible to everyone.
--
-- Liking a comment already fired a notification, so the author was told about
-- it - but the like itself never appeared on the comment. Two reasons:
--
--   1. comment_likes had triggers for notifications only. Nothing maintained a
--      count, unlike post likes which have had update_post_likes_count since
--      the original schema.
--   2. comments has no likes_count column at all. The drawer reads
--      `comment.likes_count || 0`, so a missing column reads as zero and the
--      failure is silent rather than an error.
--
-- The person who clicked saw their own like because the UI updates optimistically.
-- Nobody else ever did, and a refresh made it vanish for them too.
--
-- Written defensively: note comments are referenced by the app but defined in
-- no migration, so every step here checks the table exists first.

-- ------------------------------------------------------------- the column ---

alter table public.comments
  add column if not exists likes_count integer not null default 0;

do $$
begin
  if to_regclass('public.note_comments') is not null then
    alter table public.note_comments
      add column if not exists likes_count integer not null default 0;
  end if;
end $$;

-- -------------------------------------------------------------- the count ---

create or replace function public.update_comment_likes_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.comments
    set likes_count = coalesce(likes_count, 0) + 1
    where id = new.comment_id;
  elsif tg_op = 'DELETE' then
    -- greatest(...) so a double delete, or a count that has drifted, can never
    -- leave a negative number on screen.
    update public.comments
    set likes_count = greatest(coalesce(likes_count, 0) - 1, 0)
    where id = old.comment_id;
  end if;
  return null;
end;
$$;

drop trigger if exists on_comment_like_count on public.comment_likes;
create trigger on_comment_like_count
  after insert or delete on public.comment_likes
  for each row execute function public.update_comment_likes_count();

-- Same again for note comments, if that table exists.
do $$
begin
  if to_regclass('public.note_comment_likes') is not null
     and to_regclass('public.note_comments') is not null then

    execute $fn$
      create or replace function public.update_note_comment_likes_count()
      returns trigger
      language plpgsql
      security definer
      set search_path = public
      as $inner$
      begin
        if tg_op = 'INSERT' then
          update public.note_comments
          set likes_count = coalesce(likes_count, 0) + 1
          where id = new.comment_id;
        elsif tg_op = 'DELETE' then
          update public.note_comments
          set likes_count = greatest(coalesce(likes_count, 0) - 1, 0)
          where id = old.comment_id;
        end if;
        return null;
      end;
      $inner$;
    $fn$;

    execute 'drop trigger if exists on_note_comment_like_count on public.note_comment_likes';
    execute 'create trigger on_note_comment_like_count
             after insert or delete on public.note_comment_likes
             for each row execute function public.update_note_comment_likes_count()';
  end if;
end $$;

-- --------------------------------------------------------------- backfill ---

-- Every like given before this migration was never counted. Recompute from the
-- like rows themselves, which are the real record.
update public.comments c
set likes_count = coalesce(actual.total, 0)
from (
  select id from public.comments
) target
left join lateral (
  select count(*)::integer as total
  from public.comment_likes l
  where l.comment_id = target.id
) actual on true
where c.id = target.id
  and c.likes_count is distinct from coalesce(actual.total, 0);

do $$
begin
  if to_regclass('public.note_comment_likes') is not null
     and to_regclass('public.note_comments') is not null then
    execute $sql$
      update public.note_comments c
      set likes_count = coalesce(actual.total, 0)
      from (select id from public.note_comments) target
      left join lateral (
        select count(*)::integer as total
        from public.note_comment_likes l
        where l.comment_id = target.id
      ) actual on true
      where c.id = target.id
        and c.likes_count is distinct from coalesce(actual.total, 0);
    $sql$;
  end if;
end $$;

comment on column public.comments.likes_count is
  'Maintained by the on_comment_like_count trigger. Never write it directly.';

notify pgrst, 'reload schema';
