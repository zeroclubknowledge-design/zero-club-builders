begin;

-- A bot reply is distinct from a member message; clients cannot impersonate it.
create table if not exists public.club_ai_replies (
  message_id uuid primary key references public.club_messages(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  content text check (length(content) <= 24000),
  created_at timestamptz not null default now()
);
create index if not exists club_ai_replies_club_idx on public.club_ai_replies(club_id, created_at);
alter table public.club_ai_replies enable row level security;
revoke all on public.club_ai_replies from public, anon, authenticated;
grant select on public.club_ai_replies to authenticated;
grant all on public.club_ai_replies to service_role;
drop policy if exists club_ai_replies_member_read on public.club_ai_replies;
create policy club_ai_replies_member_read on public.club_ai_replies for select to authenticated using (
  exists (select 1 from public.clubs c where c.id=club_ai_replies.club_id and c.creator_id=auth.uid())
  or exists (select 1 from public.club_members m where m.club_id=club_ai_replies.club_id and m.profile_id=auth.uid())
);

-- Club assistance is available to every club member, independently of personal Max chat.
create table if not exists public.zero_ai_club_daily_usage (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  request_day date not null,
  requests integer not null check (requests > 0),
  primary key(profile_id, request_day)
);
alter table public.zero_ai_club_daily_usage enable row level security;
revoke all on public.zero_ai_club_daily_usage from public, anon, authenticated;
create or replace function public.claim_club_zero_ai_request(p_club_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare caller uuid := auth.uid(); claimed integer;
begin
  if caller is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.clubs where id=p_club_id and creator_id=caller)
    and not exists (select 1 from public.club_members where club_id=p_club_id and profile_id=caller)
  then raise exception 'ZERO_AI_CLUB_MEMBERS_ONLY'; end if;
  insert into public.zero_ai_club_daily_usage(profile_id,request_day,requests)
  values(caller,(now() at time zone 'UTC')::date,1)
  on conflict(profile_id,request_day) do update set requests=zero_ai_club_daily_usage.requests+1
    where zero_ai_club_daily_usage.requests<30
  returning requests into claimed;
  return claimed is not null;
end;
$$;
revoke all on function public.claim_club_zero_ai_request(uuid) from public, anon;
grant execute on function public.claim_club_zero_ai_request(uuid) to authenticated;
do $$ begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime')
    and not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='club_ai_replies') then
    alter publication supabase_realtime add table public.club_ai_replies;
  end if;
end $$;
notify pgrst,'reload schema';
commit;
