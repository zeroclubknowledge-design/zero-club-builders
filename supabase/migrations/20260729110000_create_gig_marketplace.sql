-- Persistent gig marketplace and proposals.

create table if not exists public.gigs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 5 and 100),
  description text not null check (char_length(description) between 20 and 4000),
  category text not null,
  skills text[] not null default '{}',
  budget_type text not null default 'fixed' check (budget_type in ('fixed', 'hourly')),
  budget_min numeric not null check (budget_min > 0),
  budget_max numeric not null check (budget_max >= budget_min),
  experience_level text not null default 'Intermediate' check (experience_level in ('Entry', 'Intermediate', 'Expert')),
  location_type text not null default 'Remote' check (location_type in ('Remote', 'Hybrid', 'On-site')),
  deadline date,
  status text not null default 'open' check (status in ('open', 'paused', 'closed')),
  applications_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gig_applications (
  id uuid primary key default gen_random_uuid(),
  gig_id uuid not null references public.gigs(id) on delete cascade,
  applicant_id uuid not null references public.profiles(id) on delete cascade,
  cover_note text not null check (char_length(cover_note) between 40 and 2000),
  proposed_amount numeric not null check (proposed_amount > 0),
  delivery_days integer not null check (delivery_days > 0),
  portfolio_url text,
  status text not null default 'submitted' check (status in ('submitted', 'shortlisted', 'accepted', 'rejected', 'withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (gig_id, applicant_id)
);

create index if not exists gigs_status_created_at_idx on public.gigs (status, created_at desc);
create index if not exists gigs_client_id_idx on public.gigs (client_id);
create index if not exists gig_applications_gig_id_idx on public.gig_applications (gig_id);
create index if not exists gig_applications_applicant_id_idx on public.gig_applications (applicant_id);

alter table public.gigs enable row level security;
alter table public.gig_applications enable row level security;

create or replace function public.can_view_gig(p_gig_id uuid, p_client_id uuid, p_status text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_status = 'open'
    or p_client_id = auth.uid()
    or exists (
      select 1
      from public.gig_applications as application
      where application.gig_id = p_gig_id
        and application.applicant_id = auth.uid()
    );
$$;

revoke all on function public.can_view_gig(uuid, uuid, text) from public;
grant execute on function public.can_view_gig(uuid, uuid, text) to authenticated;

drop policy if exists gigs_select_marketplace on public.gigs;
create policy gigs_select_marketplace
  on public.gigs for select
  using (public.can_view_gig(id, client_id, status));

drop policy if exists gigs_insert_own on public.gigs;
create policy gigs_insert_own
  on public.gigs for insert to authenticated
  with check (client_id = auth.uid());

drop policy if exists gigs_update_own on public.gigs;
create policy gigs_update_own
  on public.gigs for update to authenticated
  using (client_id = auth.uid())
  with check (client_id = auth.uid());

drop policy if exists gigs_delete_own on public.gigs;
create policy gigs_delete_own
  on public.gigs for delete to authenticated
  using (client_id = auth.uid());

drop policy if exists gig_applications_select_participants on public.gig_applications;
create policy gig_applications_select_participants
  on public.gig_applications for select to authenticated
  using (
    applicant_id = auth.uid()
    or exists (
      select 1 from public.gigs as gig
      where gig.id = gig_applications.gig_id and gig.client_id = auth.uid()
    )
  );

drop policy if exists gig_applications_insert_own on public.gig_applications;
create policy gig_applications_insert_own
  on public.gig_applications for insert to authenticated
  with check (
    applicant_id = auth.uid()
    and exists (
      select 1 from public.gigs as gig
      where gig.id = gig_applications.gig_id
        and gig.status = 'open'
        and gig.client_id <> auth.uid()
    )
  );

drop policy if exists gig_applications_update_participants on public.gig_applications;
drop policy if exists gig_applications_withdraw_own on public.gig_applications;
create policy gig_applications_withdraw_own
  on public.gig_applications for update to authenticated
  using (applicant_id = auth.uid())
  with check (applicant_id = auth.uid() and status = 'withdrawn');

drop policy if exists gig_applications_manage_client on public.gig_applications;
create policy gig_applications_manage_client
  on public.gig_applications for update to authenticated
  using (
    exists (
      select 1 from public.gigs as gig
      where gig.id = gig_applications.gig_id and gig.client_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.gigs as gig
      where gig.id = gig_applications.gig_id and gig.client_id = auth.uid()
    )
  );

create or replace function public.update_gig_application_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.gigs set applications_count = applications_count + 1, updated_at = now() where id = new.gig_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.gigs set applications_count = greatest(applications_count - 1, 0), updated_at = now() where id = old.gig_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists gig_application_count_trigger on public.gig_applications;
create trigger gig_application_count_trigger
after insert or delete on public.gig_applications
for each row execute function public.update_gig_application_count();
