-- Admin gig review and creation.
-- Requires 20260729110000_create_gig_marketplace.sql and
-- 20260729160000_create_zero_club_admin_control_center.sql.

-- Full detail for one gig, including its proposals, for admin review.
create or replace function public.get_admin_gig_detail(target_gig_id uuid)
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
    'gig', (
      select to_jsonb(gig_row) from (
        select gig.id, gig.title, gig.description, gig.category, gig.skills,
               gig.budget_type, gig.budget_min, gig.budget_max, gig.experience_level,
               gig.location_type, gig.deadline, gig.status, gig.applications_count,
               gig.created_at, gig.updated_at, gig.client_id,
               profile.username as client_username, profile.full_name as client_name,
               profile.avatar_url as client_avatar, profile.account_type as client_type,
               profile.account_status as client_status
        from public.gigs as gig
        left join public.profiles as profile on profile.id = gig.client_id
        where gig.id = target_gig_id
      ) as gig_row
    ),
    'applications', coalesce((
      select jsonb_agg(to_jsonb(app_row) order by app_row.created_at desc) from (
        select app.id, app.cover_note, app.proposed_amount, app.delivery_days,
               app.portfolio_url, app.status, app.created_at,
               profile.username as applicant_username, profile.full_name as applicant_name,
               profile.avatar_url as applicant_avatar, profile.xp as applicant_xp
        from public.gig_applications as app
        left join public.profiles as profile on profile.id = app.applicant_id
        where app.gig_id = target_gig_id
      ) as app_row
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

-- Admins can publish a gig on behalf of an institution, or as the platform.
create or replace function public.admin_create_gig(
  new_title text,
  new_description text,
  new_category text,
  new_skills text[],
  new_budget_type text,
  new_budget_min numeric,
  new_budget_max numeric,
  new_experience_level text,
  new_location_type text,
  new_deadline date,
  client_username text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_client uuid;
  created_id uuid;
begin
  if not public.is_zero_club_admin() then raise exception 'Admin access required'; end if;

  if coalesce(trim(client_username), '') = '' then
    resolved_client := auth.uid();
  else
    select id into resolved_client from public.profiles
    where lower(username) = lower(trim(client_username));
    if resolved_client is null then
      raise exception 'No member found with username "%"', client_username;
    end if;
  end if;

  insert into public.gigs (
    client_id, title, description, category, skills, budget_type,
    budget_min, budget_max, experience_level, location_type, deadline, status
  ) values (
    resolved_client, trim(new_title), trim(new_description), new_category,
    coalesce(new_skills, '{}'), coalesce(new_budget_type, 'fixed'),
    new_budget_min, new_budget_max, coalesce(new_experience_level, 'Intermediate'),
    coalesce(new_location_type, 'Remote'), new_deadline, 'open'
  )
  returning id into created_id;

  insert into public.admin_audit_logs (admin_id, action, target_type, target_id, details)
  values (auth.uid(), 'gig_created', 'gig', created_id,
          jsonb_build_object('title', trim(new_title), 'on_behalf_of', client_username));

  return created_id;
end;
$$;

create or replace function public.admin_delete_gig(target_gig_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_zero_club_admin() then raise exception 'Admin access required'; end if;
  delete from public.gigs where id = target_gig_id;
  insert into public.admin_audit_logs (admin_id, action, target_type, target_id)
  values (auth.uid(), 'gig_deleted', 'gig', target_gig_id);
end;
$$;

revoke all on function public.get_admin_gig_detail(uuid) from public;
revoke all on function public.admin_create_gig(text, text, text, text[], text, numeric, numeric, text, text, date, text) from public;
revoke all on function public.admin_delete_gig(uuid) from public;

grant execute on function public.get_admin_gig_detail(uuid) to authenticated;
grant execute on function public.admin_create_gig(text, text, text, text[], text, numeric, numeric, text, text, date, text) to authenticated;
grant execute on function public.admin_delete_gig(uuid) to authenticated;

notify pgrst, 'reload schema';
