create table if not exists public.push_subscriptions (
  id uuid default gen_random_uuid() primary key,
  profile_id uuid references public.profiles(id) on delete cascade not null,
  endpoint text not null,
  auth_key text not null,
  p256dh_key text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(profile_id, endpoint)
);

alter table public.push_subscriptions enable row level security;

create policy "Users can insert their own subscriptions"
  on public.push_subscriptions for insert
  with check (auth.uid() = profile_id);

create policy "Users can view their own subscriptions"
  on public.push_subscriptions for select
  using (auth.uid() = profile_id);

create policy "Users can delete their own subscriptions"
  on public.push_subscriptions for delete
  using (auth.uid() = profile_id);
