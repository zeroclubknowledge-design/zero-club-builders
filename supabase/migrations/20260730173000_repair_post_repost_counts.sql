-- Restore the persisted repost counter expected by feeds, metrics, and Admin.

alter table public.posts
  add column if not exists reposts_count integer not null default 0;

update public.posts as post
set reposts_count = coalesce((
  select count(*)::integer
  from public.reposts as repost
  where repost.post_id = post.id
), 0);

create or replace function public.update_post_reposts_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts
    set reposts_count = coalesce(reposts_count, 0) + 1
    where id = new.post_id;
  elsif tg_op = 'DELETE' then
    update public.posts
    set reposts_count = greatest(coalesce(reposts_count, 0) - 1, 0)
    where id = old.post_id;
  end if;
  return null;
end;
$$;

drop trigger if exists on_repost_change on public.reposts;
create trigger on_repost_change
after insert or delete on public.reposts
for each row execute function public.update_post_reposts_count();

notify pgrst, 'reload schema';
