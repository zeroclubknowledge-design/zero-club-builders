-- ALREADY APPLIED to Supabase project tiyifgfsuzhcvdvntjmp on 2026-10-01. Kept as a record only — do not re-run.
--
-- 1. Referrals: the person who invites someone earns 100 ZP when that person
--    joins Zero Club. The new member earns no ZP just for signing up.
--    Reversed if the new account is suspended (e.g. a duplicate account)
--    within 30 days of joining.
-- 2. Balances: ZP and wallet funds (coins) can no longer be edited straight
--    from the app. Only the server's reward/payment functions change them.
--    Before this, a signed-in member could set their own ZP or wallet balance.
-- 3. referred_by can only be set once, never to yourself, and only in the
--    first 2 days of an account (so nobody can "re-refer" an old account).

-- ── 1. guard balances and referral link ──
create or replace function public.guard_profile_balances()
returns trigger
language plpgsql
as $$
begin
  -- Server functions run as the database owner; the app runs as authenticated/anon.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.zp := 0;
    new.coins := 0;
    if new.referred_by = new.id then new.referred_by := null; end if;
    return new;
  end if;

  if new.zp is distinct from old.zp or new.coins is distinct from old.coins then
    raise exception 'ZP and wallet balances can only change through Zero Club rewards and payments';
  end if;

  if new.referred_by is distinct from old.referred_by then
    if old.referred_by is not null
       or new.referred_by is null
       or new.referred_by = new.id
       or coalesce(old.created_at, now()) < now() - interval '2 days' then
      raise exception 'Referral can only be added once, when you join';
    end if;
  end if;
  return new;
end;
$$;

create trigger guard_profile_balances
before insert or update on public.profiles
for each row execute function public.guard_profile_balances();

-- ── 2. 100 ZP to the referrer ──
create or replace function public.award_referral_zp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  awarded boolean;
  who text;
begin
  if new.referred_by is null or new.referred_by = new.id then return new; end if;
  if tg_op = 'UPDATE' and old.referred_by is not distinct from new.referred_by then return new; end if;
  if coalesce(new.account_status, 'active') = 'suspended' then return new; end if;

  awarded := public.award_profile_zp(new.referred_by, 'referral', new.id::text, 100,
    jsonb_build_object('referred_profile_id', new.id));

  if awarded then
    who := coalesce(nullif(btrim(new.full_name), ''), new.username, 'Someone');
    begin
      insert into public.notifications (recipient_id, actor_id, type, content, entity_id)
      values (new.referred_by, new.id, 'system',
        who || ' joined Zero Club with your invite. You earned 100 ZP.', new.id);
    exception when others then null;
    end;
    -- New members follow the person who invited them.
    begin
      insert into public.follows (follower_id, following_id)
      select new.id, new.referred_by
      where not exists (select 1 from public.follows where follower_id = new.id and following_id = new.referred_by);
    exception when others then null;
    end;
  end if;
  return new;
end;
$$;

create trigger award_referral_zp
after insert or update of referred_by on public.profiles
for each row execute function public.award_referral_zp();

-- ── 3. reverse it if the new account is suspended within 30 days ──
create or replace function public.reverse_referral_zp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ev record;
begin
  if new.account_status is distinct from 'suspended' or old.account_status = 'suspended' then return new; end if;
  if coalesce(new.created_at, now()) < now() - interval '30 days' then return new; end if;

  select * into ev from public.zp_events
  where event_type = 'referral' and source_key = new.id::text limit 1;
  if ev.id is null then return new; end if;

  insert into public.zp_events (profile_id, event_type, source_key, amount, metadata)
  values (ev.profile_id, 'referral_reversed', new.id::text, ev.amount, jsonb_build_object('reason', 'referred account suspended'))
  on conflict (profile_id, event_type, source_key) do nothing;
  if found then
    update public.profiles set zp = greatest(0, coalesce(zp, 0) - ev.amount) where id = ev.profile_id;
  end if;
  return new;
end;
$$;

create trigger reverse_referral_zp
after update of account_status on public.profiles
for each row execute function public.reverse_referral_zp();

-- ── 4. the old "both earn 200 ZP" claim is retired ──
-- (it referenced a column that no longer exists, so it never paid out)
create or replace function public.claim_referral_reward(referrer uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Referral rewards are now automatic: the inviter earns 100 ZP when you join.';
end;
$$;

-- ── 5. pay referrers for the people they already brought in ──
select public.award_profile_zp(p.referred_by, 'referral', p.id::text, 100, jsonb_build_object('referred_profile_id', p.id, 'backfill', true))
from public.profiles p
where p.referred_by is not null and p.referred_by <> p.id and coalesce(p.account_status, 'active') <> 'suspended';
