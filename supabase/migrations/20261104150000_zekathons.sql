begin;

create table public.zekathons (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  deadline timestamptz not null,
  created_at timestamptz not null default now()
);
create table public.zekathon_products (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.zekathons(id),
  owner_id uuid not null references public.profiles(id),
  title text not null,
  description text not null,
  created_at timestamptz not null default now()
);
create table public.zekathon_members (
  product_id uuid references public.zekathon_products(id),
  profile_id uuid references public.profiles(id),
  role text not null,
  accepted boolean not null default false,
  primary key (product_id, profile_id)
);
create table public.zekathon_releases (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.zekathon_products(id),
  author_id uuid not null references public.profiles(id),
  version text not null,
  notes text not null,
  demo_url text not null,
  created_at timestamptz not null default now(),
  unique (product_id, version),
  unique (product_id, id)
);
create table public.zekathon_submissions (
  product_id uuid primary key references public.zekathon_products(id),
  release_id uuid not null,
  submitted_at timestamptz not null default now(),
  score integer check (score between 0 and 100),
  review text,
  foreign key (product_id, release_id) references public.zekathon_releases(product_id, id)
);
create table public.zekathon_feedback (
  release_id uuid references public.zekathon_releases(id),
  profile_id uuid references public.profiles(id),
  worked text not null,
  friction text not null,
  created_at timestamptz not null default now(),
  primary key (release_id, profile_id)
);

alter table public.zekathons enable row level security;
alter table public.zekathon_products enable row level security;
alter table public.zekathon_members enable row level security;
alter table public.zekathon_releases enable row level security;
alter table public.zekathon_submissions enable row level security;
alter table public.zekathon_feedback enable row level security;
create policy zekathon_read on public.zekathons for select using (true);
create policy zekathon_product_read on public.zekathon_products for select using (true);
create policy zekathon_member_read on public.zekathon_members for select using (accepted or profile_id=auth.uid());
create policy zekathon_release_read on public.zekathon_releases for select using (true);
create policy zekathon_submission_read on public.zekathon_submissions for select using (true);
create policy zekathon_feedback_read on public.zekathon_feedback for select using (true);
revoke all on public.zekathons,public.zekathon_products,public.zekathon_members,public.zekathon_releases,public.zekathon_submissions,public.zekathon_feedback from anon,authenticated;
grant select on public.zekathons,public.zekathon_products,public.zekathon_members,public.zekathon_releases,public.zekathon_submissions,public.zekathon_feedback to anon,authenticated;
create index zekathon_products_event on public.zekathon_products(event_id);
create index zekathon_members_profile on public.zekathon_members(profile_id) where accepted;
create index zekathon_releases_timeline on public.zekathon_releases(product_id,created_at desc);

create function public.zekathon_action(p_action text,p_data jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare
  caller uuid:=auth.uid(); product uuid; release uuid; event uuid; teammate uuid;
  name text:=nullif(btrim(p_data->>'title'),'');
  description text:=nullif(btrim(p_data->>'description'),'');
  version text:=nullif(btrim(p_data->>'version'),'');
  notes text:=nullif(btrim(p_data->>'notes'),'');
  demo text:=nullif(btrim(p_data->>'demo_url'),'');
  cutoff timestamptz;
begin
  if caller is null then raise exception 'Sign in to participate'; end if;
  if p_action in ('event','product') and (name is null or length(name)>120 or description is null or length(description)>4000) then
    raise exception 'Enter a title and a description';
  end if;
  if p_action='event' then
    if not public.is_zero_club_admin() then raise exception 'Only organizers can create events'; end if;
    cutoff:=(p_data->>'deadline')::timestamptz;
    if cutoff is null or cutoff<=now() then raise exception 'Pick a future deadline'; end if;
    insert into zekathons(title,description,deadline) values(name,description,cutoff) returning id into event;
    return event;
  end if;
  if p_action='product' then
    event:=(p_data->>'event_id')::uuid;
    select deadline into cutoff from zekathons where id=event;
    if cutoff is null or cutoff<=now() then raise exception 'This event has closed'; end if;
    insert into zekathon_products(event_id,owner_id,title,description) values(event,caller,name,description) returning id into product;
    insert into zekathon_members values(product,caller,'Builder',true);
    return product;
  end if;

  product:=(p_data->>'product_id')::uuid;
  select z.deadline into cutoff from zekathon_products p join zekathons z on z.id=p.event_id where p.id=product for update of p;
  if not found then raise exception 'Product unavailable'; end if;
  if p_action='accept' then
    update zekathon_members set accepted=true where product_id=product and profile_id=caller;
    if not found then raise exception 'You do not have an invitation'; end if;
  elsif p_action='invite' then
    if not exists(select 1 from zekathon_products where id=product and owner_id=caller) then raise exception 'Only the product owner can invite teammates'; end if;
    select id into teammate from profiles where lower(username)=lower(ltrim(btrim(p_data->>'username'),'@')) limit 1;
    if teammate is null then raise exception 'Username not found'; end if;
    if exists(select 1 from zekathon_members where product_id=product and profile_id=teammate) then return product; end if;
    if (select count(*) from zekathon_members where product_id=product)>=4 then raise exception 'Teams can have up to four builders'; end if;
    insert into zekathon_members values(product,teammate,left(coalesce(nullif(btrim(p_data->>'role'),''),'Builder'),80),false);
  elsif p_action='release' then
    if not exists(select 1 from zekathon_members where product_id=product and profile_id=caller and accepted) then raise exception 'Join the product team first'; end if;
    if version is null or length(version)>48 or notes is null or length(notes)>6000 or demo is null or length(demo)>2048 or demo !~ '^https://[^[:space:]]+$' then
      raise exception 'Enter a version, release notes and an HTTPS demo link';
    end if;
    insert into zekathon_releases(product_id,author_id,version,notes,demo_url) values(product,caller,version,notes,demo);
  elsif p_action='submit' then
    if cutoff<=now() then raise exception 'Submissions are closed'; end if;
    if not exists(select 1 from zekathon_products where id=product and owner_id=caller) then raise exception 'Only the product owner can submit a release'; end if;
    insert into zekathon_submissions(product_id,release_id) values(product,(p_data->>'release_id')::uuid)
    on conflict(product_id) do update set release_id=excluded.release_id,submitted_at=now();
  elsif p_action='judge' then
    if not public.is_zero_club_admin() or cutoff>now() then raise exception 'Judging opens for organizers after the deadline'; end if;
    if nullif(btrim(p_data->>'review'),'') is null or length(p_data->>'review')>4000 or p_data->>'score' is null then raise exception 'Enter a score and judging notes'; end if;
    update zekathon_submissions set score=(p_data->>'score')::integer,review=btrim(p_data->>'review') where product_id=product;
    if not found then raise exception 'No release was submitted'; end if;
  elsif p_action='feedback' then
    release:=(p_data->>'release_id')::uuid;
    if not exists(select 1 from zekathon_releases where id=release and product_id=product) then raise exception 'Release unavailable'; end if;
    if exists(select 1 from zekathon_members where product_id=product and profile_id=caller and accepted) then raise exception 'Feedback is for people testing other teams’ products'; end if;
    if nullif(btrim(p_data->>'worked'),'') is null or nullif(btrim(p_data->>'friction'),'') is null or length(p_data->>'worked')>2000 or length(p_data->>'friction')>2000 then
      raise exception 'Share what worked and where you got stuck';
    end if;
    insert into zekathon_feedback values(release,caller,btrim(p_data->>'worked'),btrim(p_data->>'friction'),now())
    on conflict(release_id,profile_id) do update set worked=excluded.worked,friction=excluded.friction;
  else raise exception 'Unknown action';
  end if;
  return product;
end;
$$;

revoke all on function public.zekathon_action(text,jsonb) from public,anon;
grant execute on function public.zekathon_action(text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
