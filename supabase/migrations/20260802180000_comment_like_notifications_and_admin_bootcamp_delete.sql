-- Notify comment authors when someone likes their comment, and let platform
-- admins permanently remove bootcamps from the Admin Control Center.

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (type in (
    'like', 'comment_like', 'comment', 'follow', 'repost', 'mention',
    'system', 'build_tagged'
  ));

create or replace function public.handle_comment_like_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  comment_author_id uuid;
  source_post_id uuid;
  comment_excerpt text;
begin
  select comment.profile_id, comment.post_id, left(comment.content, 160)
  into comment_author_id, source_post_id, comment_excerpt
  from public.comments as comment
  where comment.id = new.comment_id;

  if comment_author_id is not null and comment_author_id <> new.profile_id then
    insert into public.notifications (
      recipient_id, actor_id, type, entity_id, comment_id, content
    ) values (
      comment_author_id, new.profile_id, 'comment_like', source_post_id,
      new.comment_id, comment_excerpt
    );
  end if;

  return new;
end;
$$;

drop trigger if exists on_comment_like_notification on public.comment_likes;
create trigger on_comment_like_notification
  after insert on public.comment_likes
  for each row execute function public.handle_comment_like_notification();

create or replace function public.remove_comment_like_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.notifications
  where type = 'comment_like'
    and actor_id = old.profile_id
    and comment_id = old.comment_id;

  return old;
end;
$$;

drop trigger if exists on_comment_unlike_notification on public.comment_likes;
create trigger on_comment_unlike_notification
  after delete on public.comment_likes
  for each row execute function public.remove_comment_like_notification();

create or replace function public.admin_delete_bootcamp(target_bootcamp_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_title text;
  target_creator_id uuid;
begin
  if not public.is_zero_club_admin() then
    raise exception 'Admin access required';
  end if;

  select title, creator_id
  into target_title, target_creator_id
  from public.bootcamps
  where id = target_bootcamp_id;

  if not found then
    raise exception 'Bootcamp not found';
  end if;

  insert into public.admin_audit_logs (
    admin_id, action, target_type, target_id, details
  ) values (
    auth.uid(), 'bootcamp_deleted', 'bootcamp', target_bootcamp_id,
    jsonb_build_object('title', target_title, 'creator_id', target_creator_id)
  );

  delete from public.bootcamps where id = target_bootcamp_id;
end;
$$;

revoke all on function public.admin_delete_bootcamp(uuid) from public;
grant execute on function public.admin_delete_bootcamp(uuid) to authenticated;

notify pgrst, 'reload schema';
