create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

create table if not exists public.push_subscriptions (
  id uuid default gen_random_uuid() primary key,
  profile_id uuid references public.profiles(id) on delete cascade not null,
  endpoint text not null,
  auth_key text not null,
  p256dh_key text not null,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  unique(profile_id, endpoint)
);

alter table public.push_subscriptions enable row level security;

drop policy if exists "Users can insert their own subscriptions" on public.push_subscriptions;
create policy "Users can insert their own subscriptions"
  on public.push_subscriptions for insert
  with check (auth.uid() = profile_id);

drop policy if exists "Users can view their own subscriptions" on public.push_subscriptions;
create policy "Users can view their own subscriptions"
  on public.push_subscriptions for select
  using (auth.uid() = profile_id);

drop policy if exists "Users can delete their own subscriptions" on public.push_subscriptions;
create policy "Users can delete their own subscriptions"
  on public.push_subscriptions for delete
  using (auth.uid() = profile_id);

drop policy if exists "Users can update their own subscriptions" on public.push_subscriptions;
create policy "Users can update their own subscriptions"
  on public.push_subscriptions for update
  using (auth.uid() = profile_id)
  with check (auth.uid() = profile_id);

create or replace function public.handle_new_message_push()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  edge_function_url text;
  edge_function_key text;
begin
  select decrypted_secret
    into edge_function_url
    from vault.decrypted_secrets
    where name = 'zero_club_edge_function_url'
    limit 1;

  select decrypted_secret
    into edge_function_key
    from vault.decrypted_secrets
    where name = 'zero_club_edge_function_key'
    limit 1;

  if nullif(trim(edge_function_url), '') is not null
    and nullif(trim(edge_function_key), '') is not null
  then
    perform net.http_post(
      url := rtrim(edge_function_url, '/') || '/send-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || edge_function_key
      ),
      body := jsonb_build_object(
        'type', 'INSERT',
        'table', TG_TABLE_NAME,
        'record', row_to_json(new)
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists on_message_inserted_send_push on public.messages;
create trigger on_message_inserted_send_push
  after insert on public.messages
  for each row execute function public.handle_new_message_push();

drop trigger if exists on_notification_inserted_send_push on public.notifications;
create trigger on_notification_inserted_send_push
  after insert on public.notifications
  for each row execute function public.handle_new_message_push();

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;
