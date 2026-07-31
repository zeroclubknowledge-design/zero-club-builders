-- Digital Hub onboarding for institutions.
--
-- Flow: an institution submits an application → a 30-day trial starts →
-- after the trial they fund their wallet and activate a plan sized to their
-- organisation. Zero Club reviews applications from the admin control center.

create table if not exists public.institution_applications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,

  -- Organisation
  institution_name text not null,
  institution_type text not null,
  registration_number text,
  website text,
  country text not null,
  city text,
  address text,

  -- Scale (drives the plan)
  organization_size text not null check (organization_size in ('small', 'large')),
  learner_count integer,
  tutor_count integer,
  programs_planned text,

  -- Primary contact
  contact_name text not null,
  contact_role text not null,
  contact_email text not null,
  contact_phone text,

  goals text,
  hear_about text,

  plan text not null check (plan in ('digital_hub_small', 'digital_hub_large')),
  status text not null default 'trial' check (status in ('trial', 'pending_review', 'active', 'expired', 'rejected')),
  trial_started_at timestamptz not null default now(),
  trial_ends_at timestamptz not null default (now() + interval '30 days'),
  activated_at timestamptz,
  active_until timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists institution_applications_profile_idx
  on public.institution_applications (profile_id);

alter table public.institution_applications enable row level security;

drop policy if exists institution_applications_select_own on public.institution_applications;
create policy institution_applications_select_own
  on public.institution_applications for select to authenticated
  using (profile_id = auth.uid() or public.is_zero_club_admin());

-- Plan pricing, in the same wallet units as memberships.
insert into public.platform_settings (key, value, description)
values
  ('digital_hub_small_price', '150000'::jsonb, 'Digital Hub price for small organisations'),
  ('digital_hub_large_price', '400000'::jsonb, 'Digital Hub price for large organisations')
on conflict (key) do nothing;

create or replace function public.digital_hub_price(plan_key text)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((value #>> '{}')::numeric,
                  case when plan_key = 'digital_hub_large' then 400000 else 150000 end)
  from public.platform_settings
  where key = case when plan_key = 'digital_hub_large'
                   then 'digital_hub_large_price' else 'digital_hub_small_price' end;
$$;

-- Submit or update an application. Starts the 30-day trial on first submit
-- and switches the account to an Institution account.
create or replace function public.submit_institution_application(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  chosen_size text;
  chosen_plan text;
  existing public.institution_applications;
  saved public.institution_applications;
begin
  if caller is null then raise exception 'Not authenticated'; end if;

  chosen_size := lower(coalesce(payload ->> 'organization_size', 'small'));
  if chosen_size not in ('small', 'large') then raise exception 'Select your organisation size'; end if;
  chosen_plan := case when chosen_size = 'large' then 'digital_hub_large' else 'digital_hub_small' end;

  if coalesce(trim(payload ->> 'institution_name'), '') = '' then raise exception 'Institution name is required'; end if;
  if coalesce(trim(payload ->> 'contact_name'), '') = '' then raise exception 'Contact name is required'; end if;
  if coalesce(trim(payload ->> 'contact_email'), '') = '' then raise exception 'Contact email is required'; end if;
  if coalesce(trim(payload ->> 'country'), '') = '' then raise exception 'Country is required'; end if;

  select * into existing from public.institution_applications where profile_id = caller;

  insert into public.institution_applications as app (
    profile_id, institution_name, institution_type, registration_number, website,
    country, city, address, organization_size, learner_count, tutor_count,
    programs_planned, contact_name, contact_role, contact_email, contact_phone,
    goals, hear_about, plan
  ) values (
    caller,
    trim(payload ->> 'institution_name'),
    coalesce(nullif(trim(payload ->> 'institution_type'), ''), 'Other'),
    nullif(trim(payload ->> 'registration_number'), ''),
    nullif(trim(payload ->> 'website'), ''),
    trim(payload ->> 'country'),
    nullif(trim(payload ->> 'city'), ''),
    nullif(trim(payload ->> 'address'), ''),
    chosen_size,
    nullif(payload ->> 'learner_count', '')::integer,
    nullif(payload ->> 'tutor_count', '')::integer,
    nullif(trim(payload ->> 'programs_planned'), ''),
    trim(payload ->> 'contact_name'),
    coalesce(nullif(trim(payload ->> 'contact_role'), ''), 'Administrator'),
    trim(payload ->> 'contact_email'),
    nullif(trim(payload ->> 'contact_phone'), ''),
    nullif(trim(payload ->> 'goals'), ''),
    nullif(trim(payload ->> 'hear_about'), ''),
    chosen_plan
  )
  on conflict (profile_id) do update set
    institution_name = excluded.institution_name,
    institution_type = excluded.institution_type,
    registration_number = excluded.registration_number,
    website = excluded.website,
    country = excluded.country,
    city = excluded.city,
    address = excluded.address,
    organization_size = excluded.organization_size,
    learner_count = excluded.learner_count,
    tutor_count = excluded.tutor_count,
    programs_planned = excluded.programs_planned,
    contact_name = excluded.contact_name,
    contact_role = excluded.contact_role,
    contact_email = excluded.contact_email,
    contact_phone = excluded.contact_phone,
    goals = excluded.goals,
    hear_about = excluded.hear_about,
    plan = excluded.plan,
    updated_at = now()
  returning * into saved;

  -- Give the account the Institution workspace for the trial.
  update public.profiles set account_type = 'Institution' where id = caller;

  return jsonb_build_object(
    'application', to_jsonb(saved),
    'price', public.digital_hub_price(saved.plan),
    'is_new', existing.id is null
  );
end;
$$;

-- Current state for the signed-in institution: trial days left, price, status.
create or replace function public.get_my_institution_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  app public.institution_applications;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into app from public.institution_applications where profile_id = auth.uid();
  if app.id is null then
    return jsonb_build_object('has_application', false);
  end if;

  return jsonb_build_object(
    'has_application', true,
    'application', to_jsonb(app),
    'price', public.digital_hub_price(app.plan),
    'trial_days_left', greatest(0, ceil(extract(epoch from (app.trial_ends_at - now())) / 86400)::integer),
    'trial_active', app.status = 'trial' and app.trial_ends_at > now(),
    'is_active', app.status = 'active' and coalesce(app.active_until, now() + interval '1 day') > now()
  );
end;
$$;

-- Pay for the Digital Hub from the wallet and activate for 12 months.
create or replace function public.activate_digital_hub()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  app public.institution_applications;
  price numeric;
  balance numeric;
begin
  if caller is null then raise exception 'Not authenticated'; end if;

  select * into app from public.institution_applications where profile_id = caller;
  if app.id is null then raise exception 'Complete the Digital Hub form first'; end if;

  price := public.digital_hub_price(app.plan);
  select coalesce(coins, 0) into balance from public.profiles where id = caller;

  if balance < price then
    raise exception 'Fund your wallet with % more to activate the Digital Hub', (price - balance);
  end if;

  update public.profiles set coins = coins - price where id = caller;

  update public.institution_applications
  set status = 'active',
      activated_at = now(),
      active_until = greatest(coalesce(active_until, now()), now()) + interval '12 months',
      updated_at = now()
  where profile_id = caller
  returning * into app;

  insert into public.notifications (profile_id, actor_id, type, content)
  values (caller, caller, 'system', 'Digital Hub activated for 12 months');

  return jsonb_build_object('activated', true, 'active_until', app.active_until, 'charged', price);
end;
$$;

-- Admin review list.
create or replace function public.get_admin_institution_applications()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_zero_club_admin() then raise exception 'Admin access required'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(row) order by row.created_at desc) from (
      select app.*, profile.username, profile.full_name, profile.avatar_url,
             profile.coins as wallet_balance,
             public.digital_hub_price(app.plan) as price
      from public.institution_applications as app
      left join public.profiles as profile on profile.id = app.profile_id
    ) as row
  ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_set_institution_status(target_application_id uuid, new_status text, note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_zero_club_admin() then raise exception 'Admin access required'; end if;
  if new_status not in ('trial', 'pending_review', 'active', 'expired', 'rejected') then
    raise exception 'Invalid application status';
  end if;

  update public.institution_applications
  set status = new_status, review_note = note, reviewed_by = auth.uid(), updated_at = now(),
      active_until = case when new_status = 'active'
                          then greatest(coalesce(active_until, now()), now()) + interval '12 months'
                          else active_until end,
      activated_at = case when new_status = 'active' then coalesce(activated_at, now()) else activated_at end
  where id = target_application_id;

  insert into public.admin_audit_logs (admin_id, action, target_type, target_id, details)
  values (auth.uid(), 'institution_status_changed', 'institution_application', target_application_id,
          jsonb_build_object('status', new_status, 'note', note));
end;
$$;

grant execute on function public.submit_institution_application(jsonb) to authenticated;
grant execute on function public.get_my_institution_status() to authenticated;
grant execute on function public.activate_digital_hub() to authenticated;
grant execute on function public.digital_hub_price(text) to authenticated;
grant execute on function public.get_admin_institution_applications() to authenticated;
grant execute on function public.admin_set_institution_status(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
