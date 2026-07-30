-- Zero Club platform administration, audit history, and protected operations.

alter table public.profiles
  add column if not exists account_type text not null default 'Learner';

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

alter table public.profiles
  add column if not exists account_status text not null default 'active';

alter table public.profiles drop constraint if exists profiles_account_status_check;
alter table public.profiles
  add constraint profiles_account_status_check check (account_status in ('active', 'suspended'));

-- Honour an admin role already configured in Supabase Auth app metadata.
update public.profiles as profile
set is_admin = true
from auth.users as auth_user
where auth_user.id = profile.id
  and auth_user.raw_app_meta_data ->> 'role' = 'admin';

create or replace function public.is_zero_club_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_admin = true
  );
$$;

revoke all on function public.is_zero_club_admin() from public;
grant execute on function public.is_zero_club_admin() to authenticated;

create or replace function public.can_post_gig()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and account_status = 'active'
      and (account_type = 'Institution' or is_admin = true)
  );
$$;

revoke all on function public.can_post_gig() from public;
grant execute on function public.can_post_gig() to authenticated;

drop policy if exists gigs_insert_own on public.gigs;
drop policy if exists gigs_insert_institution_or_admin on public.gigs;
create policy gigs_insert_institution_or_admin
  on public.gigs for insert to authenticated
  with check (client_id = auth.uid() and public.can_post_gig());

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_logs_created_at_idx on public.admin_audit_logs (created_at desc);

create table if not exists public.platform_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.platform_settings (key, value, description)
values
  ('registration_enabled', 'true'::jsonb, 'Allow new Zero Club account registration'),
  ('marketplace_enabled', 'true'::jsonb, 'Keep the gig marketplace available'),
  ('bootcamp_review_required', 'true'::jsonb, 'Require platform review for verified bootcamps'),
  ('maintenance_mode', 'false'::jsonb, 'Show a maintenance state to non-admin accounts')
on conflict (key) do nothing;

alter table public.admin_audit_logs enable row level security;
alter table public.platform_settings enable row level security;

drop policy if exists admin_audit_logs_select_admin on public.admin_audit_logs;
create policy admin_audit_logs_select_admin
  on public.admin_audit_logs for select to authenticated
  using (public.is_zero_club_admin());

drop policy if exists platform_settings_select_admin on public.platform_settings;
create policy platform_settings_select_admin
  on public.platform_settings for select to authenticated
  using (public.is_zero_club_admin());

-- Prevent users from granting themselves platform access or lifting a suspension.
create or replace function public.protect_profile_admin_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and (new.is_admin is distinct from old.is_admin or new.account_status is distinct from old.account_status)
     and not public.is_zero_club_admin() then
    raise exception 'Only a Zero Club admin can update protected account fields';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_admin_fields_trigger on public.profiles;
create trigger protect_profile_admin_fields_trigger
before update of is_admin, account_status on public.profiles
for each row execute function public.protect_profile_admin_fields();

create or replace function public.get_admin_dashboard_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.is_zero_club_admin() then
    raise exception 'Admin access required';
  end if;

  select jsonb_build_object(
    'metrics', jsonb_build_object(
      'users', (select count(*) from public.profiles),
      'new_users_30d', (select count(*) from public.profiles where created_at >= now() - interval '30 days'),
      'tutors', (select count(*) from public.profiles where account_type = 'Tutor'),
      'institutions', (select count(*) from public.profiles where account_type = 'Institution'),
      'suspended_users', (select count(*) from public.profiles where account_status = 'suspended'),
      'posts', (select count(*) from public.posts),
      'posts_7d', (select count(*) from public.posts where created_at >= now() - interval '7 days'),
      'clubs', (select count(*) from public.clubs),
      'bootcamps', (select count(*) from public.bootcamps),
      'enrollments', (select count(*) from public.enrollments),
      'open_gigs', (select count(*) from public.gigs where status = 'open'),
      'gig_applications', (select count(*) from public.gig_applications),
      'open_reports', (select count(*) from public.user_reports where status in ('open', 'reviewing')),
      'store_items', (select count(*) from public.store_items),
      'gift_cards', (select count(*) from public.gift_cards),
      'gift_value', (select coalesce(sum(amount), 0) from public.gift_cards),
      'licences', (select count(*) from public.project_licenses),
      'push_devices', (select count(*) from public.push_subscriptions),
      'notifications_24h', (select count(*) from public.notifications where created_at >= now() - interval '24 hours'),
      'wallet_balance', (select coalesce(sum(coins), 0) from public.profiles)
    ),
    'users', coalesce((
      select jsonb_agg(to_jsonb(user_row)) from (
        select id, username, full_name, avatar_url, account_type, tier, xp, coins,
               is_admin, account_status, created_at
        from public.profiles
        order by created_at desc
        limit 120
      ) as user_row
    ), '[]'::jsonb),
    'reports', coalesce((
      select jsonb_agg(to_jsonb(report_row)) from (
        select report.id, report.context, report.reason, report.status, report.created_at,
               report.reporter_id, reporter.username as reporter_username,
               report.reported_id, reported.username as reported_username,
               reported.full_name as reported_name, reported.avatar_url as reported_avatar
        from public.user_reports as report
        left join public.profiles as reporter on reporter.id = report.reporter_id
        left join public.profiles as reported on reported.id = report.reported_id
        order by case report.status when 'open' then 0 when 'reviewing' then 1 else 2 end, report.created_at desc
        limit 100
      ) as report_row
    ), '[]'::jsonb),
    'bootcamps', coalesce((
      select jsonb_agg(to_jsonb(bootcamp_row)) from (
        select bootcamp.id, bootcamp.title, bootcamp.status, bootcamp.category, bootcamp.price,
               bootcamp.created_at, bootcamp.creator_id,
               profile.username as creator_username, profile.account_type as creator_type,
               (select count(*) from public.enrollments where bootcamp_id = bootcamp.id) as learners
        from public.bootcamps as bootcamp
        left join public.profiles as profile on profile.id = bootcamp.creator_id
        order by bootcamp.created_at desc
        limit 80
      ) as bootcamp_row
    ), '[]'::jsonb),
    'clubs', coalesce((
      select jsonb_agg(to_jsonb(club_row)) from (
        select club.id, club.name, club.category, club.is_private, club.created_at, club.creator_id,
               profile.username as creator_username,
               (select count(*) from public.club_members where club_id = club.id) as members
        from public.clubs as club
        left join public.profiles as profile on profile.id = club.creator_id
        order by club.created_at desc
        limit 60
      ) as club_row
    ), '[]'::jsonb),
    'posts', coalesce((
      select jsonb_agg(to_jsonb(post_row)) from (
        select post.id, post.content, post.likes_count, post.comments_count, post.reposts_count,
               post.created_at, post.author_id, profile.username as author_username
        from public.posts as post
        left join public.profiles as profile on profile.id = post.author_id
        order by post.created_at desc
        limit 60
      ) as post_row
    ), '[]'::jsonb),
    'gigs', coalesce((
      select jsonb_agg(to_jsonb(gig_row)) from (
        select gig.id, gig.title, gig.category, gig.status, gig.budget_min, gig.budget_max,
               gig.location_type, gig.applications_count, gig.created_at, gig.client_id,
               profile.username as client_username, profile.full_name as client_name
        from public.gigs as gig
        left join public.profiles as profile on profile.id = gig.client_id
        order by gig.created_at desc
        limit 80
      ) as gig_row
    ), '[]'::jsonb),
    'store_items', coalesce((
      select jsonb_agg(to_jsonb(item_row)) from (
        select item.id, item.name, item.category, item.price, item.price_type, item.created_at,
               profile.username as seller_username
        from public.store_items as item
        left join public.profiles as profile on profile.id = item.seller_id
        order by item.created_at desc
        limit 40
      ) as item_row
    ), '[]'::jsonb),
    'settings', coalesce((
      select jsonb_agg(to_jsonb(setting_row)) from (
        select key, value, description, updated_at from public.platform_settings order by key
      ) as setting_row
    ), '[]'::jsonb),
    'audit_logs', coalesce((
      select jsonb_agg(to_jsonb(log_row)) from (
        select log.id, log.action, log.target_type, log.target_id, log.details, log.created_at,
               profile.username as admin_username
        from public.admin_audit_logs as log
        left join public.profiles as profile on profile.id = log.admin_id
        order by log.created_at desc
        limit 80
      ) as log_row
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_admin_dashboard_snapshot() from public;
grant execute on function public.get_admin_dashboard_snapshot() to authenticated;

create or replace function public.admin_set_user_status(target_user_id uuid, new_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_zero_club_admin() then raise exception 'Admin access required'; end if;
  if target_user_id = auth.uid() then raise exception 'You cannot suspend your own admin account'; end if;
  if new_status not in ('active', 'suspended') then raise exception 'Invalid account status'; end if;

  update public.profiles set account_status = new_status, updated_at = now() where id = target_user_id;
  insert into public.admin_audit_logs (admin_id, action, target_type, target_id, details)
  values (auth.uid(), 'user_status_changed', 'profile', target_user_id, jsonb_build_object('status', new_status));
end;
$$;

create or replace function public.admin_set_admin_access(target_user_id uuid, enabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_zero_club_admin() then raise exception 'Admin access required'; end if;
  if target_user_id = auth.uid() and enabled = false then raise exception 'You cannot remove your own admin access'; end if;

  update public.profiles set is_admin = enabled, updated_at = now() where id = target_user_id;
  insert into public.admin_audit_logs (admin_id, action, target_type, target_id, details)
  values (auth.uid(), 'admin_access_changed', 'profile', target_user_id, jsonb_build_object('enabled', enabled));
end;
$$;

create or replace function public.admin_update_report(target_report_id uuid, new_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_zero_club_admin() then raise exception 'Admin access required'; end if;
  if new_status not in ('open', 'reviewing', 'resolved', 'dismissed') then raise exception 'Invalid report status'; end if;

  update public.user_reports set status = new_status where id = target_report_id;
  insert into public.admin_audit_logs (admin_id, action, target_type, target_id, details)
  values (auth.uid(), 'report_status_changed', 'user_report', target_report_id, jsonb_build_object('status', new_status));
end;
$$;

create or replace function public.admin_update_gig_status(target_gig_id uuid, new_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_zero_club_admin() then raise exception 'Admin access required'; end if;
  if new_status not in ('open', 'paused', 'closed') then raise exception 'Invalid gig status'; end if;

  update public.gigs set status = new_status, updated_at = now() where id = target_gig_id;
  insert into public.admin_audit_logs (admin_id, action, target_type, target_id, details)
  values (auth.uid(), 'gig_status_changed', 'gig', target_gig_id, jsonb_build_object('status', new_status));
end;
$$;

create or replace function public.admin_update_bootcamp_status(target_bootcamp_id uuid, new_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_zero_club_admin() then raise exception 'Admin access required'; end if;
  if new_status not in ('draft', 'active', 'completed') then raise exception 'Invalid bootcamp status'; end if;

  update public.bootcamps set status = new_status where id = target_bootcamp_id;
  insert into public.admin_audit_logs (admin_id, action, target_type, target_id, details)
  values (auth.uid(), 'bootcamp_status_changed', 'bootcamp', target_bootcamp_id, jsonb_build_object('status', new_status));
end;
$$;

create or replace function public.admin_update_platform_setting(setting_key text, setting_value jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_zero_club_admin() then raise exception 'Admin access required'; end if;

  update public.platform_settings
  set value = setting_value, updated_by = auth.uid(), updated_at = now()
  where key = setting_key;

  insert into public.admin_audit_logs (admin_id, action, target_type, details)
  values (auth.uid(), 'platform_setting_changed', 'platform_setting', jsonb_build_object('key', setting_key, 'value', setting_value));
end;
$$;

revoke all on function public.admin_set_user_status(uuid, text) from public;
revoke all on function public.admin_set_admin_access(uuid, boolean) from public;
revoke all on function public.admin_update_report(uuid, text) from public;
revoke all on function public.admin_update_gig_status(uuid, text) from public;
revoke all on function public.admin_update_bootcamp_status(uuid, text) from public;
revoke all on function public.admin_update_platform_setting(text, jsonb) from public;

grant execute on function public.admin_set_user_status(uuid, text) to authenticated;
grant execute on function public.admin_set_admin_access(uuid, boolean) to authenticated;
grant execute on function public.admin_update_report(uuid, text) to authenticated;
grant execute on function public.admin_update_gig_status(uuid, text) to authenticated;
grant execute on function public.admin_update_bootcamp_status(uuid, text) to authenticated;
grant execute on function public.admin_update_platform_setting(text, jsonb) to authenticated;
