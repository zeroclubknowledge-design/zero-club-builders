-- Why messages took so long to appear.
--
-- Two problems, both on the same table.
--
-- First, `messages` had no index on sender_id or receiver_id. Every time the
-- app opened a chat, Postgres read the entire table to find the handful of rows
-- for that conversation. That is fine with a thousand messages and painful with
-- a hundred thousand, which is exactly the shape of a table that only grows.
--
-- Second, the conversation list was built in the browser: download the last 500
-- messages with both profiles joined onto every single row, sort them, then
-- throw nearly all of them away to keep the newest one per person. The work was
-- real but the answer was small — a few dozen rows at most.
--
-- So: give the table the indexes it always needed, and let the database do the
-- deduplication it is good at.

/* Both directions. A conversation is symmetric but an index is not, and the
   lookup asks "messages I sent them OR messages they sent me" — which is two
   separate index scans, so both orderings have to exist. */
create index if not exists messages_sender_receiver_idx
  on public.messages (sender_id, receiver_id, created_at desc);

create index if not exists messages_receiver_sender_idx
  on public.messages (receiver_id, sender_id, created_at desc);

/* The unread badge asks a much narrower question, and a partial index keeps it
   small enough to stay in memory: only the rows that are actually unread. */
create index if not exists messages_unread_idx
  on public.messages (receiver_id, created_at desc)
  where is_read = false;

analyze public.messages;

/*
 * One row per conversation, decided in the database.
 *
 * distinct on gives the newest message per counterpart directly, so the client
 * receives what it displays instead of five hundred rows it will discard. The
 * profile join happens once per conversation rather than once per message.
 *
 * Club requests are excluded here rather than in the browser. They live in this
 * table but they are not chat, and filtering them after the fact meant a list
 * could come back looking empty because every row it fetched was a request.
 */
create or replace function public.conversation_list(p_limit int default 60)
returns table (
  other_id uuid,
  username text,
  full_name text,
  avatar_url text,
  other_updated_at timestamptz,
  last_message text,
  last_sender_id uuid,
  last_created_at timestamptz,
  unread_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with visible as (
    select
      m.*,
      case when m.sender_id = auth.uid() then m.receiver_id else m.sender_id end as counterpart
    from public.messages m
    where (m.sender_id = auth.uid() or m.receiver_id = auth.uid())
      and m.content is not null
      and m.content not like 'CLUB_REQUEST:%'
      and m.content <> 'DISMISSED_CLUB_REQUEST'
  ),
  newest as (
    select distinct on (counterpart)
      counterpart, content, sender_id, created_at
    from visible
    order by counterpart, created_at desc
  ),
  unread as (
    select counterpart, count(*) as n
    from visible
    where receiver_id = auth.uid() and is_read = false
    group by counterpart
  )
  select
    n.counterpart,
    p.username,
    p.full_name,
    p.avatar_url,
    p.updated_at,
    n.content,
    n.sender_id,
    n.created_at,
    coalesce(u.n, 0)
  from newest n
  join public.profiles p on p.id = n.counterpart
  left join unread u on u.counterpart = n.counterpart
  order by n.created_at desc
  limit greatest(1, least(coalesce(p_limit, 60), 200));
$$;

/* security invoker on purpose: the caller's own row-level permissions still
   apply, so this cannot show anybody a conversation they could not already
   read. auth.uid() inside the query is what scopes it to them. */
grant execute on function public.conversation_list(int) to authenticated;

/*
 * The badge counts, in one round trip.
 *
 * The app polls for these every half minute on every screen. It was doing so
 * with six separate requests plus three writes — a fixed background tax on a
 * connection the person is also trying to scroll a feed over. All six answers
 * come from the same two tables, so they can be one query and one trip.
 *
 * Presence is folded in as well: the profiles row is touched here rather than
 * in its own request, because that write was only ever there to say "still
 * here" alongside the read that follows it.
 */
create or replace function public.unread_summary()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  pm_count bigint := 0;
  notif_count bigint := 0;
  club_count bigint := 0;
begin
  if caller is null then
    return jsonb_build_object('messages', 0, 'notifications', 0, 'club_messages', 0);
  end if;

  update public.profiles set updated_at = now() where id = caller;

  select count(*) into pm_count
  from public.messages
  where receiver_id = caller
    and is_read = false
    and content not like 'CLUB_REQUEST:%';

  begin
    select count(*) into notif_count
    from public.notifications
    where recipient_id = caller and is_read = false;
  exception when undefined_table or undefined_column then
    notif_count := 0;
  end;

  /* Club unread is still finished on the client, which holds the per-club
     "last read" marks in local storage. This returns the day's traffic in the
     caller's clubs so that judgement has something to work from without a
     second round trip. */
  begin
    select count(*) into club_count
    from public.club_messages cm
    join public.club_members me
      on me.club_id = cm.club_id and me.profile_id = caller
    where cm.created_at > now() - interval '24 hours'
      and cm.profile_id <> caller;
  exception when undefined_table or undefined_column then
    club_count := 0;
  end;

  return jsonb_build_object(
    'messages', pm_count,
    'notifications', notif_count,
    'club_messages', club_count
  );
end;
$$;

grant execute on function public.unread_summary() to authenticated;

notify pgrst, 'reload schema';
