begin;

create table public.zero_ai_daily_usage (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  request_day date not null default (now() at time zone 'UTC')::date,
  kind text not null check (kind in ('chat', 'voice')),
  requests integer not null default 0 check (requests >= 0),
  primary key (profile_id, request_day, kind)
);
alter table public.zero_ai_daily_usage enable row level security;
revoke all on public.zero_ai_daily_usage from public, anon, authenticated;

create or replace function public.claim_zero_ai_request(p_kind text)
returns boolean language plpgsql security definer set search_path = public
as $$
declare
  caller uuid := auth.uid();
  daily_limit integer;
  claimed integer;
begin
  if caller is null then raise exception 'Not authenticated'; end if;
  if p_kind not in ('chat', 'voice') or p_kind is null then raise exception 'Invalid request type'; end if;
  daily_limit := case when p_kind = 'voice' then 5 else 100 end;
  insert into public.zero_ai_daily_usage (profile_id, request_day, kind, requests)
  values (caller, (now() at time zone 'UTC')::date, p_kind, 1)
  on conflict (profile_id, request_day, kind) do update
    set requests = zero_ai_daily_usage.requests + 1
    where zero_ai_daily_usage.requests < daily_limit
  returning requests into claimed;
  return claimed is not null;
end;
$$;
revoke all on function public.claim_zero_ai_request(text) from public, anon;
grant execute on function public.claim_zero_ai_request(text) to authenticated;

-- RLS still controls which member rows the caller can count. Only totals
-- leave the database, rather than thousands of individual member records.
create or replace function public.club_directory_counts(p_club_ids uuid[])
returns table (club_id uuid, member_count bigint)
language sql stable security invoker set search_path = public
as $$
  select membership.club_id, count(*)
  from public.club_members membership
  where membership.club_id = any(p_club_ids[1:200])
  group by membership.club_id;
$$;
revoke all on function public.club_directory_counts(uuid[]) from public, anon;
grant execute on function public.club_directory_counts(uuid[]) to authenticated;

notify pgrst, 'reload schema';
commit;
