-- Subscribing to someone's ZeroNotes.
--
-- Deliberately not the same thing as following. Following a builder is about
-- their feed; subscribing is about their writing. Plenty of people want one
-- without the other — you can follow someone whose posts you enjoy without
-- wanting every long-form note they publish, and you can want somebody's
-- notes without following them at all.
--
-- Reusing public.follows for this would have collapsed the two into one
-- switch, so a separate, much smaller table.

create table if not exists public.note_subscriptions (
  id uuid primary key default gen_random_uuid(),
  subscriber_id uuid not null references public.profiles(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),

  -- Subscribing to yourself is meaningless, and the UI hides the button on
  -- your own notes, but the rule belongs here too.
  constraint note_subscriptions_not_self check (subscriber_id <> author_id)
);

create unique index if not exists note_subscriptions_unique
  on public.note_subscriptions (subscriber_id, author_id);

create index if not exists note_subscriptions_author_idx
  on public.note_subscriptions (author_id);

alter table public.note_subscriptions enable row level security;

-- You can see your own subscriptions, and an author can see who subscribes to
-- them — the same shape as follows.
drop policy if exists note_subscriptions_select on public.note_subscriptions;
create policy note_subscriptions_select
  on public.note_subscriptions for select to authenticated
  using (subscriber_id = auth.uid() or author_id = auth.uid());

drop policy if exists note_subscriptions_insert_own on public.note_subscriptions;
create policy note_subscriptions_insert_own
  on public.note_subscriptions for insert to authenticated
  with check (subscriber_id = auth.uid());

drop policy if exists note_subscriptions_delete_own on public.note_subscriptions;
create policy note_subscriptions_delete_own
  on public.note_subscriptions for delete to authenticated
  using (subscriber_id = auth.uid());

-- One call rather than the client deciding whether to insert or delete, so a
-- double tap cannot leave the button and the database disagreeing.
create or replace function public.toggle_note_subscription(p_author_id uuid)
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
  if caller = p_author_id then raise exception 'You cannot subscribe to your own notes'; end if;

  select id into existing
  from public.note_subscriptions
  where subscriber_id = caller and author_id = p_author_id;

  if existing is not null then
    delete from public.note_subscriptions where id = existing;
    return jsonb_build_object('subscribed', false);
  end if;

  insert into public.note_subscriptions (subscriber_id, author_id)
  values (caller, p_author_id)
  on conflict (subscriber_id, author_id) do nothing;

  insert into public.notifications (profile_id, actor_id, type, content)
  values (
    p_author_id,
    caller,
    'system',
    coalesce(
      (select coalesce(full_name, username) from public.profiles where id = caller),
      'Someone'
    ) || ' subscribed to your ZeroNotes'
  );

  return jsonb_build_object('subscribed', true);
end;
$$;

grant execute on function public.toggle_note_subscription(uuid) to authenticated;

notify pgrst, 'reload schema';
