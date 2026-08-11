-- Many coupon codes per bootcamp.
--
-- A bootcamp carried a single coupon as two columns, coupon_code and
-- coupon_discount_percent. Creators want a code per partner or package, each
-- with its own discount, so this moves them into their own table.
--
-- The old columns are deliberately LEFT IN PLACE and kept in step with the
-- first active code. Several screens still read them, and a bootcamp page
-- served from a stale cache would otherwise show no discount at all. They can
-- be dropped once nothing references them.

create table if not exists public.bootcamp_coupons (
  id uuid primary key default gen_random_uuid(),
  bootcamp_id uuid not null references public.bootcamps(id) on delete cascade,

  -- Stored upper-case so lookups are exact. The unique index below is what
  -- actually stops two codes colliding on one bootcamp.
  code text not null,
  discount_percent numeric not null default 0
    check (discount_percent >= 0 and discount_percent <= 100),

  -- Optional: a name for the package this code belongs to, so a creator can
  -- tell "PARTNER20" from "EARLYBIRD20" at a glance.
  label text,

  -- Optional limits. Null means unlimited or never expires.
  max_uses integer check (max_uses is null or max_uses > 0),
  expires_at timestamptz,

  times_used integer not null default 0 check (times_used >= 0),
  active boolean not null default true,

  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

-- One code per bootcamp, case-insensitively. Two codes differing only in case
-- would be indistinguishable to anyone typing one in.
create unique index if not exists bootcamp_coupons_code_unique
  on public.bootcamp_coupons (bootcamp_id, upper(code));

create index if not exists bootcamp_coupons_bootcamp_idx
  on public.bootcamp_coupons (bootcamp_id, active);

-- ------------------------------------------------------------ backfill ---
-- Carry across the single coupon each bootcamp already had, so nothing is
-- lost the moment this ships. Safe to run twice: the unique index makes the
-- second run a no-op.
insert into public.bootcamp_coupons (bootcamp_id, code, discount_percent, label, created_by)
select
  b.id,
  upper(trim(b.coupon_code)),
  coalesce(b.coupon_discount_percent, 0),
  'Original coupon',
  b.creator_id
from public.bootcamps b
where b.coupon_code is not null
  and trim(b.coupon_code) <> ''
on conflict do nothing;

-- ---------------------------------------------------------------- rls ---
alter table public.bootcamp_coupons enable row level security;

-- Read: anyone may read active codes, because the checkout page has to
-- validate what a buyer types. Discount codes are not secrets - they are
-- handed out - and hiding them would mean routing validation through a
-- function for no security gain.
drop policy if exists bootcamp_coupons_select on public.bootcamp_coupons;
create policy bootcamp_coupons_select
  on public.bootcamp_coupons for select
  using (true);

-- Write: only whoever can manage the bootcamp. can_manage_bootcamp already
-- covers creator, assigned tutor and the owning institution.
drop policy if exists bootcamp_coupons_write on public.bootcamp_coupons;
create policy bootcamp_coupons_write
  on public.bootcamp_coupons for all to authenticated
  using (public.can_manage_bootcamp(bootcamp_id))
  with check (public.can_manage_bootcamp(bootcamp_id));

-- ------------------------------------------------------------ helpers ---

-- Validates a code and returns what it is worth. Returns no row when the code
-- is unknown, switched off, expired or used up, so the caller cannot
-- accidentally treat an exhausted coupon as valid.
create or replace function public.validate_bootcamp_coupon(
  p_bootcamp_id uuid,
  p_code text
)
returns table (id uuid, code text, discount_percent numeric, label text)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.code, c.discount_percent, c.label
  from public.bootcamp_coupons c
  where c.bootcamp_id = p_bootcamp_id
    and upper(c.code) = upper(trim(p_code))
    and c.active
    and (c.expires_at is null or c.expires_at > now())
    and (c.max_uses is null or c.times_used < c.max_uses)
  limit 1;
$$;

-- Records a redemption. Increments under a row lock so two people paying at
-- the same moment cannot both take the last use of a limited code.
create or replace function public.redeem_bootcamp_coupon(p_coupon_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  updated integer;
begin
  update public.bootcamp_coupons
  set times_used = times_used + 1
  where id = p_coupon_id
    and active
    and (expires_at is null or expires_at > now())
    and (max_uses is null or times_used < max_uses);

  get diagnostics updated = row_count;
  return updated > 0;
end;
$$;

-- Keeps the legacy columns pointing at the first active code, so screens that
-- have not moved over yet still show a discount.
create or replace function public.sync_legacy_bootcamp_coupon()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := coalesce(new.bootcamp_id, old.bootcamp_id);
  first_code record;
begin
  select code, discount_percent into first_code
  from public.bootcamp_coupons
  where bootcamp_id = target
    and active
    and (expires_at is null or expires_at > now())
  order by created_at
  limit 1;

  update public.bootcamps
  set coupon_code = first_code.code,
      coupon_discount_percent = coalesce(first_code.discount_percent, 0)
  where id = target;

  return null;
end;
$$;

drop trigger if exists sync_legacy_bootcamp_coupon_trigger on public.bootcamp_coupons;
create trigger sync_legacy_bootcamp_coupon_trigger
after insert or update or delete on public.bootcamp_coupons
for each row execute function public.sync_legacy_bootcamp_coupon();

comment on table public.bootcamp_coupons is
  'Discount codes for a bootcamp. bootcamps.coupon_code mirrors the first '
  'active code for screens that have not moved to this table yet.';
