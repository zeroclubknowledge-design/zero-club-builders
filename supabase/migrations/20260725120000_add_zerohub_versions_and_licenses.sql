alter table public.posts
  add column if not exists project_root_id uuid references public.posts(id) on delete cascade,
  add column if not exists version_label text default '1.0.0',
  add column if not exists release_notes text,
  add column if not exists available_for_use boolean default false,
  add column if not exists license_type text default 'standard',
  add column if not exists license_price numeric default 0;

alter table public.posts drop constraint if exists posts_license_type_check;
alter table public.posts
  add constraint posts_license_type_check
  check (license_type in ('standard', 'commercial', 'full_ownership'));

alter table public.posts drop constraint if exists posts_license_price_check;
alter table public.posts
  add constraint posts_license_price_check check (license_price >= 0);

create index if not exists posts_project_root_id_idx on public.posts(project_root_id);

create table if not exists public.project_licenses (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references public.posts(id) on delete cascade not null,
  buyer_id uuid references public.profiles(id) on delete cascade not null,
  seller_id uuid references public.profiles(id) on delete cascade not null,
  license_type text not null check (license_type in ('standard', 'commercial', 'full_ownership')),
  price_paid numeric not null default 0 check (price_paid >= 0),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(project_id, buyer_id)
);

alter table public.project_licenses enable row level security;

drop policy if exists "Project licences are visible to participants" on public.project_licenses;
create policy "Project licences are visible to participants"
  on public.project_licenses for select
  using (auth.uid() = buyer_id or auth.uid() = seller_id);

create or replace function public.acquire_project_license(p_project_id uuid)
returns public.project_licenses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project public.posts%rowtype;
  v_buyer public.profiles%rowtype;
  v_license public.project_licenses%rowtype;
begin
  select * into v_project
  from public.posts
  where id = p_project_id and is_build_post = true
  for update;

  if not found then
    raise exception 'Project not found';
  end if;

  if auth.uid() is null or auth.uid() = v_project.author_id then
    raise exception 'Choose a project created by another builder';
  end if;

  select * into v_license
  from public.project_licenses
  where project_id = v_project.id and buyer_id = auth.uid();

  if found then
    return v_license;
  end if;

  if not coalesce(v_project.available_for_use, false) then
    raise exception 'This project is not available for use';
  end if;

  select * into v_buyer from public.profiles where id = auth.uid() for update;
  if coalesce(v_buyer.coins, 0) < coalesce(v_project.license_price, 0) then
    raise exception 'Not enough Coins';
  end if;

  if coalesce(v_project.license_price, 0) > 0 then
    update public.profiles
      set coins = coalesce(coins, 0) - v_project.license_price
      where id = v_buyer.id;
    update public.profiles
      set coins = coalesce(coins, 0) + v_project.license_price
      where id = v_project.author_id;
  end if;

  insert into public.project_licenses (
    project_id, buyer_id, seller_id, license_type, price_paid
  ) values (
    v_project.id,
    v_buyer.id,
    v_project.author_id,
    coalesce(v_project.license_type, 'standard'),
    coalesce(v_project.license_price, 0)
  )
  on conflict (project_id, buyer_id) do update
    set license_type = excluded.license_type
  returning * into v_license;

  if v_project.license_type = 'full_ownership' then
    update public.posts set available_for_use = false where id = v_project.id;
  end if;

  return v_license;
end;
$$;

grant execute on function public.acquire_project_license(uuid) to authenticated;
