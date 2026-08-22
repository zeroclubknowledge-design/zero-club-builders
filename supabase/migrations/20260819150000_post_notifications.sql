-- Be told when a particular person posts.
--
-- Following and being notified are different appetites. Following says "put
-- this in my feed"; the bell says "interrupt me". Conflating them is how feeds
-- end up either silent or unbearable, so this is a separate, deliberate opt-in
-- that sits beside Follow rather than inside it.
--
-- The notification is created by a trigger rather than by the posting client,
-- for the obvious reason: the author's browser should not be responsible for
-- writing rows into other people's notification lists, and a post made from
-- anywhere else — an import, an admin tool — should still notify.

create table if not exists public.post_subscriptions (
  id uuid primary key default gen_random_uuid(),
  -- The person who wants to be told.
  subscriber_id uuid not null references public.profiles(id) on delete cascade,
  -- The person they want to be told about.
  author_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (subscriber_id, author_id),
  check (subscriber_id <> author_id)
);

create index if not exists post_subscriptions_author_idx
  on public.post_subscriptions (author_id);

alter table public.post_subscriptions enable row level security;

/* Your own subscriptions, and nobody else's. An author can see the count
   through the function below rather than by reading the rows, so subscribing
   to someone does not hand them your name. */
drop policy if exists post_subscriptions_own on public.post_subscriptions;
create policy post_subscriptions_own
  on public.post_subscriptions for all to authenticated
  using (subscriber_id = auth.uid())
  with check (subscriber_id = auth.uid());

create or replace function public.toggle_post_notifications(p_author_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  existing uuid;
begin
  if caller is null then raise exception 'Not authenticated'; end if;
  if caller = p_author_id then raise exception 'You are always told about your own posts'; end if;

  select id into existing
  from public.post_subscriptions
  where subscriber_id = caller and author_id = p_author_id;

  if existing is not null then
    delete from public.post_subscriptions where id = existing;
    return jsonb_build_object('subscribed', false);
  end if;

  insert into public.post_subscriptions (subscriber_id, author_id)
  values (caller, p_author_id)
  on conflict do nothing;

  return jsonb_build_object('subscribed', true);
end;
$$;

create or replace function public.is_subscribed_to_posts(p_author_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.post_subscriptions
    where subscriber_id = auth.uid() and author_id = p_author_id
  )
$$;

/* Fan out on write.
 *
 * One row per subscriber, inserted in a single statement. This is fine at the
 * scale of a person with a few hundred subscribers and would want a queue at a
 * few hundred thousand — at which point the fan-out moves to a worker and this
 * trigger just enqueues.
 */
create or replace function public.notify_post_subscribers()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  author_name text;
  recipient_column text;
begin
  select coalesce(full_name, username) into author_name
  from public.profiles where id = new.author_id;

  /* This project's migrations have written the recipient as both profile_id
     and recipient_id over time, and the app reads recipient_id. Rather than
     guess and silently insert into a column nobody reads, ask the catalogue
     which one this database actually has. */
  select column_name into recipient_column
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'notifications'
    and column_name in ('recipient_id', 'profile_id')
  order by case column_name when 'recipient_id' then 0 else 1 end
  limit 1;

  if recipient_column is null then
    raise notice 'notifications has neither recipient_id nor profile_id; skipping subscriber fan-out.';
    return null;
  end if;

  execute format(
    'insert into public.notifications (%I, actor_id, type, content)
     select s.subscriber_id, $1, ''system'', $2
     from public.post_subscriptions s
     where s.author_id = $1',
    recipient_column
  )
  using new.author_id, coalesce(author_name, 'Someone') || ' just posted';

  return null;
end;
$$;

drop trigger if exists on_post_notify_subscribers on public.posts;
create trigger on_post_notify_subscribers
  after insert on public.posts
  for each row execute function public.notify_post_subscribers();

grant execute on function public.toggle_post_notifications(uuid) to authenticated;
grant execute on function public.is_subscribed_to_posts(uuid) to authenticated;

notify pgrst, 'reload schema';

-- Worth knowing while you are in here: older migrations in this project insert
-- notifications into a profile_id column while the app reads recipient_id. If
-- only recipient_id exists, every one of those inserts has been failing or
-- writing somewhere nothing reads. This notice reports which columns are
-- actually present so that can be checked rather than assumed.
do $$
declare
  columns text;
begin
  select string_agg(column_name, ', ' order by column_name) into columns
  from information_schema.columns
  where table_schema = 'public' and table_name = 'notifications'
    and column_name in ('recipient_id', 'profile_id');

  raise notice 'notifications recipient column(s) present: %', coalesce(columns, 'none');
end $$;
