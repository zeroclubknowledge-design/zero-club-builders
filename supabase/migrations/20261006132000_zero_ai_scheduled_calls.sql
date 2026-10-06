begin;

create table public.zero_ai_calls (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  request_id uuid not null,
  destination text not null check (destination ~ '^\+[1-9][0-9]{7,14}$'),
  brief text not null check (length(brief) between 1 and 2000),
  scheduled_at timestamptz not null,
  created_at timestamptz not null default now(),
  requested_at timestamptz,
  session_id text,
  status text not null default 'scheduled' check (status in ('scheduled', 'dispatching', 'requested', 'failed', 'unknown', 'cancelled', 'ended')),
  primary_role text not null check (primary_role in ('learner', 'tutor', 'creator', 'institution')),
  unique (profile_id, request_id)
);
create index zero_ai_calls_due_idx on public.zero_ai_calls(scheduled_at) where status = 'scheduled';
create index zero_ai_calls_owner_idx on public.zero_ai_calls(profile_id, created_at desc);
alter table public.zero_ai_calls enable row level security;
revoke all on public.zero_ai_calls from public, anon, authenticated;
grant select on public.zero_ai_calls to authenticated;
grant all on public.zero_ai_calls to service_role;
create policy zero_ai_calls_read_own on public.zero_ai_calls for select to authenticated using (profile_id = auth.uid());

create or replace function public.schedule_zero_ai_call(p_destination text, p_brief text, p_scheduled_at timestamptz, p_request_id uuid)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  caller uuid := auth.uid();
  user_profile public.profiles;
  call_id uuid;
begin
  if caller is null then raise exception 'Not authenticated'; end if;
  if p_request_id is null then raise exception 'Request identifier required'; end if;
  if p_destination is null or p_destination !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'Enter an international phone number'; end if;
  if p_brief is null or length(trim(p_brief)) not between 1 and 2000 then raise exception 'Add a call purpose'; end if;
  if p_scheduled_at is null or p_scheduled_at < now() - interval '1 minute' or p_scheduled_at > now() + interval '30 days' then raise exception 'Choose a time within the next 30 days'; end if;
  -- Lock the account so concurrent requests cannot exceed the call quota.
  select * into user_profile from public.profiles where id = caller for update;
  if not found then raise exception 'Profile not found'; end if;
  select id into call_id from public.zero_ai_calls where profile_id = caller and request_id = p_request_id;
  if call_id is not null then return call_id; end if;
  if (select count(*) from public.zero_ai_calls where profile_id = caller and created_at >= (date_trunc('day', now() at time zone 'UTC') at time zone 'UTC')) >= 3 then
    raise exception 'You can schedule up to three AI calls per day';
  end if;
  insert into public.zero_ai_calls (profile_id, request_id, destination, brief, scheduled_at, primary_role)
  values (caller, p_request_id, p_destination, trim(p_brief), greatest(now(), p_scheduled_at),
    case when lower(user_profile.account_type) = 'institution' then 'institution'
      when lower(user_profile.account_type) = 'tutor' then 'tutor'
      when user_profile.active_mode = 'creator' then 'creator' else 'learner' end)
  returning id into call_id;
  return call_id;
end;
$$;
revoke all on function public.schedule_zero_ai_call(text, text, timestamptz, uuid) from public, anon;
grant execute on function public.schedule_zero_ai_call(text, text, timestamptz, uuid) to authenticated;

create or replace function public.cancel_zero_ai_call(p_id uuid)
returns boolean language plpgsql security definer set search_path = public
as $$
begin
  update public.zero_ai_calls set status = 'cancelled'
  where id = p_id and profile_id = auth.uid() and status = 'scheduled';
  return found;
end;
$$;
revoke all on function public.cancel_zero_ai_call(uuid) from public, anon;
grant execute on function public.cancel_zero_ai_call(uuid) to authenticated;

create or replace function public.claim_due_zero_ai_calls()
returns setof public.zero_ai_calls language plpgsql security definer set search_path = public
as $$
begin
  -- A crashed/ambiguous attempt is never retried, avoiding duplicate calls.
  update public.zero_ai_calls set status = 'unknown'
  where status = 'dispatching' and requested_at < now() - interval '5 minutes';
  return query
    update public.zero_ai_calls set status = 'dispatching', requested_at = now()
    where id in (
      select id from public.zero_ai_calls
      where status = 'scheduled' and scheduled_at <= now()
      order by scheduled_at limit 5 for update skip locked
    ) returning *;
end;
$$;
revoke all on function public.claim_due_zero_ai_calls() from public, anon, authenticated;
grant execute on function public.claim_due_zero_ai_calls() to service_role;

notify pgrst, 'reload schema';
commit;
