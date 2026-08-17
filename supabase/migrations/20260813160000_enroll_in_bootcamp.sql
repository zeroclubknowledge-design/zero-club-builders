-- Enrolling in a bootcamp, done properly.
--
-- The old path was a TanStack server function that inserted straight into
-- public.enrollments:
--
--   enrollUserAction({ bootcampId, profileId })  ->  insert into enrollments
--
-- Two things are wrong with that.
--
-- 1. It runs on the server using the anonymous client, with no user session
--    attached. auth.uid() is therefore NULL, and the table's policy is
--    `with check (auth.uid() = profile_id)` — so every enrolment failed with
--    "new row violates row-level security policy for table enrollments".
--
-- 2. The profile_id came from the browser. Had the policy not stopped it, one
--    member could have enrolled anybody else in anything, simply by changing
--    the id in the request.
--
-- Enrolment is now a security-definer function that always enrols the CALLER.
-- The id cannot be supplied, so it cannot be forged, and auth.uid() is real
-- because the call carries the user's own session.

create or replace function public.enroll_in_bootcamp(p_bootcamp_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  bootcamp public.bootcamps;
  price numeric;
begin
  if caller is null then raise exception 'Please sign in to enroll'; end if;

  select * into bootcamp from public.bootcamps where id = p_bootcamp_id;
  if bootcamp.id is null then raise exception 'That bootcamp does not exist'; end if;

  -- Already in: return quietly rather than raising. Someone tapping twice on a
  -- slow connection should not see an error for something that succeeded.
  if exists (
    select 1 from public.enrollments
    where bootcamp_id = p_bootcamp_id and profile_id = caller
  ) then
    return jsonb_build_object('enrolled', true, 'already', true);
  end if;

  price := coalesce(bootcamp.price, 0);

  -- Paid bootcamps are not enrolled through this route. Payment has its own
  -- flow, and that flow is what should create the enrolment — otherwise this
  -- function would be a way to take a paid course for nothing.
  if price > 0 then
    raise exception 'This bootcamp requires payment';
  end if;

  insert into public.enrollments (bootcamp_id, profile_id)
  values (p_bootcamp_id, caller);

  -- Tell the tutor somebody joined.
  insert into public.notifications (profile_id, actor_id, type, content)
  values (
    bootcamp.creator_id,
    caller,
    'system',
    coalesce((select coalesce(full_name, username) from public.profiles where id = caller), 'Someone')
    || ' enrolled in ' || bootcamp.title
  );

  return jsonb_build_object('enrolled', true, 'already', false);
end;
$$;

grant execute on function public.enroll_in_bootcamp(uuid) to authenticated;

notify pgrst, 'reload schema';
