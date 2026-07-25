create table if not exists public.user_reports (
  id uuid default gen_random_uuid() primary key,
  reporter_id uuid references public.profiles(id) on delete cascade not null,
  reported_id uuid references public.profiles(id) on delete cascade not null,
  context text not null default 'direct_message',
  reason text not null,
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  check (reporter_id <> reported_id)
);

alter table public.user_reports enable row level security;

drop policy if exists "Users can submit reports" on public.user_reports;
create policy "Users can submit reports"
  on public.user_reports for insert
  with check (auth.uid() = reporter_id);

drop policy if exists "Users can view their submitted reports" on public.user_reports;
create policy "Users can view their submitted reports"
  on public.user_reports for select
  using (auth.uid() = reporter_id);

create index if not exists user_reports_reported_id_idx on public.user_reports(reported_id, created_at desc);
