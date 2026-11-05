begin;

-- Keep the installed membership policy as the source of access decisions.
do $$
begin
  if to_regprocedure('public.can_use_zero_ai()') is null
    or to_regprocedure('public.is_zero_club_admin()') is null then
    raise exception 'Apply the existing Zero AI membership migrations before this usage repair';
  end if;
end;
$$;

create table if not exists public.zero_ai_daily_usage (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  request_day date not null default (now() at time zone 'UTC')::date,
  kind text not null check (kind in ('chat', 'voice')),
  requests integer not null default 0 check (requests >= 0),
  primary key (profile_id, request_day, kind)
);
alter table public.zero_ai_daily_usage enable row level security;
revoke all on public.zero_ai_daily_usage from public, anon, authenticated;

create or replace function public.claim_zero_ai_request(p_kind text)
returns boolean language plpgsql security definer set search_path=public as $$
declare
  caller uuid := auth.uid();
  stored_kind text;
  daily_limit integer;
  claimed integer;
begin
  if caller is null then raise exception 'Not authenticated'; end if;
  if p_kind is null or p_kind not in ('chat','voice','verification') then raise exception 'Invalid request type'; end if;
  if public.is_zero_club_admin() then return true; end if;
  if p_kind <> 'verification' and not public.can_use_zero_ai() then raise exception 'ZERO_AI_MAX_REQUIRED'; end if;
  stored_kind := case when p_kind='verification' then 'voice' else p_kind end;
  daily_limit := case when stored_kind='voice' then 5 else 100 end;
  insert into public.zero_ai_daily_usage(profile_id, request_day, kind, requests)
  values(caller, (now() at time zone 'UTC')::date, stored_kind, 1)
  on conflict(profile_id,request_day,kind) do update
    set requests=zero_ai_daily_usage.requests+1
    where zero_ai_daily_usage.requests<daily_limit
  returning requests into claimed;
  return claimed is not null;
end;
$$;
revoke all on function public.claim_zero_ai_request(text) from public, anon;
grant execute on function public.claim_zero_ai_request(text) to authenticated;
notify pgrst,'reload schema';
commit;
