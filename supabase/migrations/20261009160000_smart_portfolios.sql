-- ALREADY APPLIED to project tiyifgfsuzhcvdvntjmp via Supabase MCP (migration "smart_portfolios").
-- Kept as a record. Do not re-run.
-- Smart Portfolio: one portfolio per profile, curated items (own ships / Zero Proofs), privacy-light view counts.

create table if not exists public.portfolios (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft','published')),
  template text not null default 'minimal' check (template in ('minimal','studio')),
  headline text check (headline is null or char_length(headline) <= 140),
  about text check (about is null or char_length(about) <= 2000),
  accent text not null default 'pink' check (accent in ('pink','violet','emerald','amber','sky','mono')),
  sections jsonb not null default '[{"key":"work","visible":true},{"key":"about","visible":true},{"key":"experience","visible":true},{"key":"skills","visible":true},{"key":"learning","visible":true},{"key":"certificates","visible":true},{"key":"proofs","visible":true},{"key":"contact","visible":true}]'::jsonb,
  skills text[] not null default '{}' check (cardinality(skills) <= 30),
  show_stats boolean not null default true,
  indexable boolean not null default true,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.portfolio_items (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  kind text not null default 'project' check (kind in ('project','proof')),
  sort_order integer not null default 0,
  featured boolean not null default false,
  problem text check (problem is null or char_length(problem) <= 1500),
  outcome text check (outcome is null or char_length(outcome) <= 1500),
  created_at timestamptz not null default now(),
  unique (portfolio_id, post_id)
);

create table if not exists public.portfolio_views (
  id bigint generated always as identity primary key,
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  post_id uuid,
  referrer_host text,
  device text check (device in ('mobile','desktop')),
  viewed_at timestamptz not null default now()
);

alter table public.portfolios enable row level security;
alter table public.portfolio_items enable row level security;
alter table public.portfolio_views enable row level security;

create policy portfolios_owner_all on public.portfolios for all
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy portfolios_public_read on public.portfolios for select using (status = 'published');

create policy portfolio_items_owner_all on public.portfolio_items for all
  using (exists (select 1 from public.portfolios p where p.id = portfolio_id and p.profile_id = auth.uid()))
  with check (
    exists (select 1 from public.portfolios p where p.id = portfolio_id and p.profile_id = auth.uid())
    and exists (select 1 from public.posts po where po.id = post_id and po.author_id = auth.uid()
                and (kind = 'proof' or coalesce(po.is_build_post, false))));
create policy portfolio_items_public_read on public.portfolio_items for select
  using (exists (select 1 from public.portfolios p where p.id = portfolio_id and p.status = 'published'));

-- portfolio_views: no direct grants; written only via record_portfolio_view().

-- Functions:
--   get_public_portfolio(p_username text) returns jsonb   -- anon + authenticated; published or owner only;
--       only posts with audience 'everyone'; private bootcamps excluded.
--   record_portfolio_view(p_portfolio uuid, p_post uuid default null, p_referrer text default null, p_device text default null)
--       -- published only, skips owner, stores only referrer host.
--   my_portfolio_stats() returns jsonb {total, last_30_days, last_7_days}

create or replace function public.get_public_portfolio(p_username text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare prof public.profiles; pf public.portfolios; is_owner boolean;
begin
  select * into prof from public.profiles where lower(username) = lower(btrim(p_username)) and coalesce(account_status,'active') <> 'suspended' limit 1;
  if not found then return jsonb_build_object('found', false); end if;
  select * into pf from public.portfolios where profile_id = prof.id;
  is_owner := auth.uid() is not null and auth.uid() = prof.id;
  if not found or (pf.status <> 'published' and not is_owner) then
    return jsonb_build_object('found', false);
  end if;
  return jsonb_build_object(
    'found', true, 'is_owner', is_owner,
    'profile', jsonb_build_object(
      'id', prof.id, 'username', prof.username, 'full_name', prof.full_name, 'avatar_url', prof.avatar_url,
      'banner_url', prof.banner_url, 'bio', prof.bio, 'location', prof.location, 'website', prof.website,
      'social_links', prof.social_links, 'xp', prof.xp, 'account_type', prof.account_type, 'interests', prof.interests),
    'portfolio', to_jsonb(pf) - 'profile_id',
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'kind', i.kind, 'featured', i.featured, 'sort_order', i.sort_order,
        'problem', i.problem, 'outcome', i.outcome,
        'post', jsonb_build_object('id', po.id, 'content', po.content, 'media_urls', po.media_urls,
          'likes_count', po.likes_count, 'comments_count', po.comments_count, 'created_at', po.created_at,
          'is_build_post', po.is_build_post, 'is_verified_build', po.is_verified_build, 'version_label', po.version_label,
          'versions', (select count(*) from public.posts v where v.project_root_id = po.id and coalesce(v.audience,'everyone') = 'everyone'))
      ) order by i.featured desc, i.sort_order, i.created_at)
      from public.portfolio_items i join public.posts po on po.id = i.post_id
      where i.portfolio_id = pf.id and coalesce(po.audience, 'everyone') = 'everyone'
    ), '[]'::jsonb),
    'experiences', coalesce((select jsonb_agg(to_jsonb(e) - 'profile_id' order by e.is_current desc, e.start_date desc)
      from public.profile_experiences e where e.profile_id = prof.id), '[]'::jsonb),
    'certificates', coalesce((select jsonb_agg(to_jsonb(c) - 'profile_id' order by c.issued_on desc nulls last)
      from public.profile_certificates c where c.profile_id = prof.id), '[]'::jsonb),
    'learning', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'title', b.title, 'category', b.category,
        'banner_url', b.banner_url, 'enrolled_at', en.enrolled_at) order by en.enrolled_at desc)
      from public.enrollments en join public.bootcamps b on b.id = en.bootcamp_id
      where en.profile_id = prof.id and coalesce(b.visibility, true)), '[]'::jsonb),  -- visibility is boolean (fixed in fix_public_portfolio_bootcamp_visibility)
    'stats', jsonb_build_object(
      'ships', (select count(*) from public.posts where author_id = prof.id and is_build_post and project_root_id is null and coalesce(audience,'everyone') = 'everyone'),
      'verified', (select count(*) from public.posts where author_id = prof.id and is_build_post and is_verified_build),
      'proofs', (select count(*) from public.posts where author_id = prof.id and coalesce(audience,'everyone') = 'everyone'),
      'xp', coalesce(prof.xp, 0)));
end;
$function$;

create or replace function public.record_portfolio_view(p_portfolio uuid, p_post uuid default null, p_referrer text default null, p_device text default null)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare owner_id uuid;
begin
  select profile_id into owner_id from public.portfolios where id = p_portfolio and status = 'published';
  if owner_id is null or owner_id = auth.uid() then return; end if;
  insert into public.portfolio_views (portfolio_id, post_id, referrer_host, device)
  values (p_portfolio, p_post,
    nullif(left(lower(regexp_replace(coalesce(p_referrer,''), '^https?://([^/:]+).*$', '\1')), 120), ''),
    case when p_device in ('mobile','desktop') then p_device else null end);
end;
$function$;

create or replace function public.my_portfolio_stats()
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  select jsonb_build_object(
    'total', count(v.id),
    'last_30_days', count(v.id) filter (where v.viewed_at > now() - interval '30 days'),
    'last_7_days', count(v.id) filter (where v.viewed_at > now() - interval '7 days'))
  from public.portfolios p left join public.portfolio_views v on v.portfolio_id = p.id and v.post_id is null
  where p.profile_id = auth.uid();
$function$;

grant execute on function public.get_public_portfolio(text) to anon, authenticated;
grant execute on function public.record_portfolio_view(uuid, uuid, text, text) to anon, authenticated;
grant execute on function public.my_portfolio_stats() to authenticated;
