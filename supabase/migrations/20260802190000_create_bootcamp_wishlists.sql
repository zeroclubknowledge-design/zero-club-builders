-- Persistent, private Bootcamp wishlists for signed-in members.

create table if not exists public.bootcamp_wishlists (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  bootcamp_id uuid not null references public.bootcamps(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (profile_id, bootcamp_id)
);

create index if not exists bootcamp_wishlists_profile_created_idx
  on public.bootcamp_wishlists (profile_id, created_at desc);

create index if not exists bootcamp_wishlists_bootcamp_idx
  on public.bootcamp_wishlists (bootcamp_id);

alter table public.bootcamp_wishlists enable row level security;

drop policy if exists bootcamp_wishlists_select_own on public.bootcamp_wishlists;
create policy bootcamp_wishlists_select_own
  on public.bootcamp_wishlists for select to authenticated
  using (profile_id = auth.uid());

drop policy if exists bootcamp_wishlists_insert_own on public.bootcamp_wishlists;
create policy bootcamp_wishlists_insert_own
  on public.bootcamp_wishlists for insert to authenticated
  with check (profile_id = auth.uid());

drop policy if exists bootcamp_wishlists_delete_own on public.bootcamp_wishlists;
create policy bootcamp_wishlists_delete_own
  on public.bootcamp_wishlists for delete to authenticated
  using (profile_id = auth.uid());

notify pgrst, 'reload schema';
