-- Harden profiles: own-row updates only, protected is_admin, server-side XP transfers.
--
-- BEFORE RUNNING: list your existing policies with
--   select policyname, cmd from pg_policies where tablename = 'profiles';
-- and drop any UPDATE policy that is broader than "own row" (policies are OR'd,
-- so a leftover permissive policy would defeat the one below), e.g.
--   drop policy "<name>" on public.profiles;

alter table public.profiles enable row level security;

-- Everyone can read profiles (feed, search, public pages rely on this).
drop policy if exists profiles_select_all on public.profiles;
create policy profiles_select_all
  on public.profiles for select
  using (true);

-- Users may only update their own row.
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Belt and braces: even on their own row, users cannot change is_admin.
-- auth.uid() is null for the SQL editor / service role, so admins can still
-- grant access from the dashboard.
create or replace function public.prevent_admin_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_admin is distinct from old.is_admin and auth.uid() is not null then
    raise exception 'is_admin can only be changed by a database administrator';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_is_admin on public.profiles;
create trigger protect_is_admin
  before update on public.profiles
  for each row execute function public.prevent_admin_escalation();

-- Server-side XP transfer, replacing the client-side update of other users' rows
-- (which own-row RLS now forbids). Atomic: balance check and both updates run in
-- one transaction.
create or replace function public.transfer_xp(recipient uuid, amount integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  sender uuid := auth.uid();
begin
  if sender is null then
    raise exception 'Not authenticated';
  end if;
  if amount is null or amount <= 0 then
    raise exception 'Invalid amount';
  end if;
  if recipient = sender then
    raise exception 'Cannot send XP to yourself';
  end if;

  update profiles set xp = xp - amount
  where id = sender and xp >= amount;
  if not found then
    raise exception 'Insufficient XP balance';
  end if;

  update profiles set xp = xp + amount
  where id = recipient;
  if not found then
    raise exception 'Recipient not found';
  end if;
end;
$$;

grant execute on function public.transfer_xp(uuid, integer) to authenticated;

-- Referral reward claim: both sides get 200 XP, validated server-side.
-- Replaces the client-side update of the referrer's row.
create or replace function public.claim_referral_reward(referrer uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'Not authenticated';
  end if;
  if referrer = caller then
    raise exception 'Invalid referrer';
  end if;

  update profiles set xp = xp + 200, referral_code_used = null
  where id = caller
    and referral_code_used is not null
    and referral_code_used = (select referral_code from profiles where id = referrer);
  if not found then
    raise exception 'No referral reward to claim';
  end if;

  update profiles set xp = xp + 200 where id = referrer;
end;
$$;

grant execute on function public.claim_referral_reward(uuid) to authenticated;

-- Tutor verifies a build post; the author is awarded 50 XP.
-- Authorization (caller must be the bootcamp creator) is enforced here,
-- not in the browser.
create or replace function public.verify_build_post(post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  v_author uuid;
begin
  if caller is null then
    raise exception 'Not authenticated';
  end if;

  select p.author_id into v_author
  from posts p
  join bootcamps b on b.id = p.bootcamp_id
  where p.id = post_id
    and coalesce(p.is_build_post, false)
    and not coalesce(p.is_verified_build, false)
    and b.creator_id = caller;

  if v_author is null then
    raise exception 'Not authorized to verify this post';
  end if;

  update posts set is_verified_build = true where id = post_id;
  update profiles set xp = xp + 50 where id = v_author;
end;
$$;

grant execute on function public.verify_build_post(uuid) to authenticated;
