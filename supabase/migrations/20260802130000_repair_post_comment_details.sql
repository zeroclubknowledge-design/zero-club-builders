-- Make Post and Ship detail comments consistently readable. Both experiences
-- use public.posts and public.comments; Ship is represented by is_build_post.

alter table public.comments enable row level security;

do $$
declare existing_policy record;
begin
  for existing_policy in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'comments' and cmd = 'SELECT'
  loop
    execute format('drop policy if exists %I on public.comments', existing_policy.policyname);
  end loop;
end;
$$;

create policy comments_select_public
  on public.comments
  for select
  to anon, authenticated
  using (true);

create or replace function public.get_post_comments(target_post_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      to_jsonb(comment_row) || jsonb_build_object(
        'profiles', case
          when profile_row.id is null then null
          else jsonb_build_object(
            'id', profile_row.id,
            'username', profile_row.username,
            'full_name', profile_row.full_name,
            'avatar_url', profile_row.avatar_url
          )
        end
      )
      order by comment_row.created_at asc
    ),
    '[]'::jsonb
  )
  from public.comments as comment_row
  left join public.profiles as profile_row on profile_row.id = comment_row.profile_id
  where comment_row.post_id = target_post_id;
$$;

revoke all on function public.get_post_comments(uuid) from public;
grant execute on function public.get_post_comments(uuid) to anon, authenticated;

create index if not exists idx_comments_post_created_at
  on public.comments (post_id, created_at asc);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'comments'
  ) then
    alter publication supabase_realtime add table public.comments;
  end if;
end;
$$;

notify pgrst, 'reload schema';
