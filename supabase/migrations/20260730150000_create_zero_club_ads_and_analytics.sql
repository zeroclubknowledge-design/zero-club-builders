-- Zero Club advertising campaigns and admin analytics.
-- Requires 20260729160000_create_zero_club_admin_control_center.sql (is_zero_club_admin, admin_audit_logs).

create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  media_url text,
  target_url text,
  cta_label text not null default 'Learn more',
  placement text not null default 'feed' check (placement in ('feed', 'store', 'bootcamps')),
  audience text not null default 'free_members' check (audience in ('everyone', 'free_members')),
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'ended')),
  sponsor_id uuid references public.profiles(id) on delete set null,
  starts_at timestamptz,
  ends_at timestamptz,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists promotions_status_idx on public.promotions (status, placement);

alter table public.promotions enable row level security;

-- Admins see everything; the app can read active campaigns to display them.
drop policy if exists promotions_select_admin on public.promotions;
create policy promotions_select_admin
  on public.promotions for select to authenticated
  using (public.is_zero_club_admin());

drop policy if exists promotions_select_active on public.promotions;
create policy promotions_select_active
  on public.promotions for select to authenticated
  using (
    status = 'active'
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now())
  );

-- Create or update a campaign (admin only).
create or replace function public.admin_save_promotion(
  promotion_id uuid,
  new_title text,
  new_body text,
  new_media_url text,
  new_target_url text,
  new_cta_label text,
  new_audience text,
  sponsor_username text,
  new_starts_at timestamptz,
  new_ends_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_sponsor uuid;
  saved_id uuid;
begin
  if not public.is_zero_club_admin() then raise exception 'Admin access required'; end if;
  if coalesce(trim(new_title), '') = '' then raise exception 'Campaign title is required'; end if;
  if new_audience not in ('everyone', 'free_members') then raise exception 'Invalid audience'; end if;

  if coalesce(trim(sponsor_username), '') <> '' then
    select id into resolved_sponsor from public.profiles
    where lower(username) = lower(trim(sponsor_username));
    if resolved_sponsor is null then
      raise exception 'No member found with username "%"', sponsor_username;
    end if;
  end if;

  if promotion_id is null then
    insert into public.promotions (title, body, media_url, target_url, cta_label, audience, sponsor_id, starts_at, ends_at, created_by)
    values (trim(new_title), new_body, new_media_url, new_target_url, coalesce(nullif(trim(new_cta_label), ''), 'Learn more'), new_audience, resolved_sponsor, new_starts_at, new_ends_at, auth.uid())
    returning id into saved_id;
  else
    update public.promotions
    set title = trim(new_title), body = new_body, media_url = new_media_url,
        target_url = new_target_url, cta_label = coalesce(nullif(trim(new_cta_label), ''), 'Learn more'),
        audience = new_audience, sponsor_id = resolved_sponsor,
        starts_at = new_starts_at, ends_at = new_ends_at, updated_at = now()
    where id = promotion_id
    returning id into saved_id;
    if saved_id is null then raise exception 'Campaign not found'; end if;
  end if;

  insert into public.admin_audit_logs (admin_id, action, target_type, target_id, details)
  values (auth.uid(), case when promotion_id is null then 'promotion_created' else 'promotion_updated' end, 'promotion', saved_id, jsonb_build_object('title', trim(new_title)));

  return saved_id;
end;
$$;

create or replace function public.admin_set_promotion_status(target_promotion_id uuid, new_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_zero_club_admin() then raise exception 'Admin access required'; end if;
  if new_status not in ('draft', 'active', 'paused', 'ended') then raise exception 'Invalid campaign status'; end if;

  update public.promotions set status = new_status, updated_at = now() where id = target_promotion_id;
  if not found then raise exception 'Campaign not found'; end if;

  insert into public.admin_audit_logs (admin_id, action, target_type, target_id, details)
  values (auth.uid(), 'promotion_status_changed', 'promotion', target_promotion_id, jsonb_build_object('status', new_status));
end;
$$;

create or replace function public.admin_delete_promotion(target_promotion_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_zero_club_admin() then raise exception 'Admin access required'; end if;
  delete from public.promotions where id = target_promotion_id;
  insert into public.admin_audit_logs (admin_id, action, target_type, target_id)
  values (auth.uid(), 'promotion_deleted', 'promotion', target_promotion_id);
end;
$$;

-- Campaign list for the Ads Manager (admin only).
create or replace function public.get_admin_promotions()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_zero_club_admin() then raise exception 'Admin access required'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(promotion_row)) from (
      select promo.id, promo.title, promo.body, promo.media_url, promo.target_url, promo.cta_label,
             promo.placement, promo.audience, promo.status, promo.starts_at, promo.ends_at,
             promo.impressions, promo.clicks, promo.created_at,
             sponsor.username as sponsor_username, sponsor.full_name as sponsor_name,
             sponsor.avatar_url as sponsor_avatar, sponsor.tier as sponsor_tier
      from public.promotions as promo
      left join public.profiles as sponsor on sponsor.id = promo.sponsor_id
      order by case promo.status when 'active' then 0 when 'draft' then 1 when 'paused' then 2 else 3 end,
               promo.created_at desc
    ) as promotion_row
  ), '[]'::jsonb);
end;
$$;

-- Delivery counters: any signed-in member's app may record views and clicks.
create or replace function public.record_promotion_impression(target_promotion_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.promotions set impressions = impressions + 1
  where id = target_promotion_id and status = 'active';
$$;

create or replace function public.record_promotion_click(target_promotion_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.promotions set clicks = clicks + 1
  where id = target_promotion_id and status = 'active';
$$;

-- Analytics snapshot: 30-day trends, membership mix, engagement, top performers.
create or replace function public.get_admin_analytics()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.is_zero_club_admin() then raise exception 'Admin access required'; end if;

  select jsonb_build_object(
    'signups_daily', (
      select coalesce(jsonb_agg(jsonb_build_object('day', to_char(d.day, 'Mon DD'), 'value', coalesce(c.cnt, 0)) order by d.day), '[]'::jsonb)
      from (select generate_series(current_date - 29, current_date, interval '1 day')::date as day) d
      left join (
        select created_at::date as day, count(*) as cnt from public.profiles
        where created_at >= current_date - 29 group by 1
      ) c on c.day = d.day
    ),
    'posts_daily', (
      select coalesce(jsonb_agg(jsonb_build_object('day', to_char(d.day, 'Mon DD'), 'value', coalesce(c.cnt, 0)) order by d.day), '[]'::jsonb)
      from (select generate_series(current_date - 29, current_date, interval '1 day')::date as day) d
      left join (
        select created_at::date as day, count(*) as cnt from public.posts
        where created_at >= current_date - 29 group by 1
      ) c on c.day = d.day
    ),
    'enrollments_daily', (
      select coalesce(jsonb_agg(jsonb_build_object('day', to_char(d.day, 'Mon DD'), 'value', coalesce(c.cnt, 0)) order by d.day), '[]'::jsonb)
      from (select generate_series(current_date - 29, current_date, interval '1 day')::date as day) d
      left join (
        select enrolled_at::date as day, count(*) as cnt from public.enrollments
        where enrolled_at >= current_date - 29 group by 1
      ) c on c.day = d.day
    ),
    'membership', jsonb_build_object(
      'learners', (select count(*) from public.profiles where coalesce(account_type, 'Learner') = 'Learner'),
      'tutors', (select count(*) from public.profiles where account_type = 'Tutor'),
      'institutions', (select count(*) from public.profiles where account_type = 'Institution'),
      'premium', (select count(*) from public.profiles where tier = 'Premium'),
      'premium_plus', (select count(*) from public.profiles where tier = 'Premium+'),
      'free', (select count(*) from public.profiles where tier is null or tier not in ('Premium', 'Premium+'))
    ),
    'engagement', jsonb_build_object(
      'total_likes', (select coalesce(sum(likes_count), 0) from public.posts),
      'total_comments', (select coalesce(sum(comments_count), 0) from public.posts),
      'total_reposts', (select coalesce(sum(reposts_count), 0) from public.posts),
      'posts_30d', (select count(*) from public.posts where created_at >= current_date - 29),
      'active_promotions', (select count(*) from public.promotions where status = 'active'),
      'promo_impressions', (select coalesce(sum(impressions), 0) from public.promotions),
      'promo_clicks', (select coalesce(sum(clicks), 0) from public.promotions)
    ),
    'top_bootcamps', coalesce((
      select jsonb_agg(to_jsonb(row)) from (
        select bootcamp.id, bootcamp.title, bootcamp.price,
               profile.username as creator_username,
               (select count(*) from public.enrollments where bootcamp_id = bootcamp.id) as learners
        from public.bootcamps as bootcamp
        left join public.profiles as profile on profile.id = bootcamp.creator_id
        order by (select count(*) from public.enrollments where bootcamp_id = bootcamp.id) desc
        limit 6
      ) as row
    ), '[]'::jsonb),
    'top_posts', coalesce((
      select jsonb_agg(to_jsonb(row)) from (
        select post.id, left(post.content, 140) as content, post.likes_count, post.comments_count,
               post.created_at, profile.username as author_username
        from public.posts as post
        left join public.profiles as profile on profile.id = post.author_id
        order by coalesce(post.likes_count, 0) desc
        limit 6
      ) as row
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.admin_save_promotion(uuid, text, text, text, text, text, text, text, timestamptz, timestamptz) from public;
revoke all on function public.admin_set_promotion_status(uuid, text) from public;
revoke all on function public.admin_delete_promotion(uuid) from public;
revoke all on function public.get_admin_promotions() from public;
revoke all on function public.get_admin_analytics() from public;
revoke all on function public.record_promotion_impression(uuid) from public;
revoke all on function public.record_promotion_click(uuid) from public;

grant execute on function public.admin_save_promotion(uuid, text, text, text, text, text, text, text, timestamptz, timestamptz) to authenticated;
grant execute on function public.admin_set_promotion_status(uuid, text) to authenticated;
grant execute on function public.admin_delete_promotion(uuid) to authenticated;
grant execute on function public.get_admin_promotions() to authenticated;
grant execute on function public.get_admin_analytics() to authenticated;
grant execute on function public.record_promotion_impression(uuid) to authenticated;
grant execute on function public.record_promotion_click(uuid) to authenticated;

notify pgrst, 'reload schema';
