begin;

do $$ begin
  if not exists(select 1 from information_schema.columns where table_schema='public'
    and table_name='gift_cards' and column_name='claim_deadline_at') then
    raise exception 'Apply 20261027090000_gift_claim_use_window.sql before installing gift reminders';
  end if;
end $$;

alter table public.notifications add column if not exists link text;

-- A private delivery ledger makes minute sweeps, retries and concurrent workers
-- safe. It is deliberately not readable by clients or public Browse RPCs.
create table if not exists public.zero_gift_claim_reminders (
  gift_card_id uuid not null references public.gift_cards(id) on delete cascade,
  reminder_number smallint not null check(reminder_number between 1 and 3),
  sent_at timestamptz not null default now(),
  claim_expires_at timestamptz not null,
  primary key(gift_card_id, reminder_number)
);
alter table public.zero_gift_claim_reminders enable row level security;
revoke all on public.zero_gift_claim_reminders from public, anon, authenticated;
grant select on public.zero_gift_claim_reminders to service_role;

-- Full six-hour claims: 3 hours, 1 hour and 15 minutes remaining.
-- Short claims: cap these lead times at half, a third and a quarter of the
-- actual use window, keeping three distinct reminders before the real expiry.
create or replace function public.zero_gift_claim_reminder_schedule(
  p_claimed_at timestamptz, p_expires_at timestamptz
) returns table(reminder_number smallint, remind_at timestamptz)
language sql immutable set search_path=public as $$
  select stage, p_expires_at-least((p_expires_at-p_claimed_at)/divisor,lead_time)
  from (values
    (1::smallint,2::double precision,interval '3 hours'),
    (2::smallint,3::double precision,interval '1 hour'),
    (3::smallint,4::double precision,interval '15 minutes')
  ) points(stage,divisor,lead_time)
  where p_claimed_at is not null and p_expires_at>p_claimed_at;
$$;
revoke all on function public.zero_gift_claim_reminder_schedule(timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.zero_gift_claim_reminder_schedule(timestamptz,timestamptz) to service_role;

create or replace function public.send_zero_gift_claim_reminders(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path=public as $$
declare
  receipt record; reminder record; inserted_id uuid; campaign_code text;
  minutes_left integer; time_left text; sent integer:=0;
begin
  if p_now is null then raise exception 'A reminder sweep needs a valid time'; end if;
  for receipt in
    select g.* from public.gift_cards g
    where g.parent_gift_id is not null and g.claimed_by is not null
      and g.claim_deadline_at is not null and g.claim_released_at is null
      and g.status='claimed' and g.remaining_amount>0 and g.expires_at>p_now
      and exists(select 1 from public.zero_gift_claim_reminder_schedule(g.claimed_at,g.expires_at) s
        where s.remind_at<=p_now and not exists(select 1 from public.zero_gift_claim_reminders r
          where r.gift_card_id=g.id and r.reminder_number=s.reminder_number))
    order by g.expires_at,g.id limit 500 for update of g skip locked
  loop
    select code into campaign_code from public.gift_cards where id=receipt.parent_gift_id;
    for reminder in
      select * from public.zero_gift_claim_reminder_schedule(receipt.claimed_at,receipt.expires_at)
      where remind_at<=p_now order by reminder_number
    loop
      inserted_id:=null;
      insert into public.zero_gift_claim_reminders(gift_card_id,reminder_number,sent_at,claim_expires_at)
        values(receipt.id,reminder.reminder_number,p_now,receipt.expires_at)
        on conflict do nothing returning gift_card_id into inserted_id;
      if inserted_id is not null then
        minutes_left:=greatest(1,ceil(extract(epoch from(receipt.expires_at-p_now))/60))::integer;
        time_left:=case when minutes_left%60=0 then (minutes_left/60)||case when minutes_left=60 then ' hour' else ' hours' end
          else minutes_left||case when minutes_left=1 then ' minute' else ' minutes' end end;
        -- Uses the existing notification/realtime/push pipeline. The ledger and
        -- notification commit together, so a failed delivery insert is retryable.
        insert into public.notifications(profile_id,actor_id,type,content,link)
        values(receipt.claimed_by,receipt.creator_id,'system',
          'Gift reminder '||reminder.reminder_number||' of 3: your claimed Zero Gift has '||time_left||
          ' left. Use your remaining gift credit before '||to_char(receipt.expires_at at time zone 'UTC','YYYY-MM-DD HH24:MI')||
          ' UTC. Completely unused credit expires and its place becomes available to another member.',
          '/app/gifts/'||campaign_code);
        sent:=sent+1;
      end if;
    end loop;
  end loop;
  return sent;
end;
$$;
-- Only the scheduler/server can send reminders; callers cannot spoof sweep time.
revoke all on function public.send_zero_gift_claim_reminders(timestamptz) from public,anon,authenticated;
grant execute on function public.send_zero_gift_claim_reminders(timestamptz) to service_role;

do $$ begin
  if exists(select 1 from pg_available_extensions where name='pg_cron') then
    execute 'create extension if not exists pg_cron with schema pg_catalog';
  end if;
  if to_regprocedure('cron.schedule(text,text,text)') is not null then
    perform cron.schedule('zero-gift-claim-reminders','* * * * *','select public.send_zero_gift_claim_reminders();');
  else
    raise warning 'Background gift reminders need a scheduler: run send_zero_gift_claim_reminders() every minute with a trusted server connection';
  end if;
end $$;

notify pgrst,'reload schema';
commit;
