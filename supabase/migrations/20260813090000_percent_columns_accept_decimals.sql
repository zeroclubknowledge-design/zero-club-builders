-- Percentages must be able to hold a fraction.
--
-- A seller wanting "two thirds off" needs 66.67%, not 66%. On a 30,000 item
-- that difference is 200 - small per sale, wrong every sale.
--
-- The client was throwing the decimals away with parseInt; that is fixed in
-- the app. This migration covers the other half of the problem: if any of
-- these columns is an integer type in the live database, Postgres silently
-- rounds 66.67 to 67 on the way in and the app fix achieves nothing.
--
-- The original migrations all declare these as numeric, so on a database that
-- is fully up to date this changes nothing at all. It exists because this
-- schema has drifted before, and a silent rounding bug is expensive to find.

do $$
declare
  target record;
begin
  for target in
    select c.table_name, c.column_name
    from information_schema.columns c
    where c.table_schema = 'public'
      and (c.table_name, c.column_name) in (
        ('store_items', 'discount_percent'),
        ('store_items', 'coupon_discount_percent'),
        ('bootcamps', 'coupon_discount_percent'),
        ('bootcamps', 'referral_percent'),
        ('bootcamp_coupons', 'discount_percent')
      )
      -- Only touch columns that cannot hold a fraction today.
      and c.data_type in ('integer', 'smallint', 'bigint')
  loop
    execute format(
      'alter table public.%I alter column %I type numeric using %I::numeric',
      target.table_name, target.column_name, target.column_name
    );
    raise notice 'widened %.% to numeric', target.table_name, target.column_name;
  end loop;
end $$;

-- The range checks are re-stated rather than assumed: an integer column may
-- have carried a constraint written against integers.
do $$
begin
  if to_regclass('public.store_items') is not null then
    alter table public.store_items drop constraint if exists store_items_discount_percent_check;
    alter table public.store_items add constraint store_items_discount_percent_check
      check (discount_percent >= 0 and discount_percent <= 90);

    alter table public.store_items drop constraint if exists store_items_coupon_discount_percent_check;
    alter table public.store_items add constraint store_items_coupon_discount_percent_check
      check (coupon_discount_percent >= 0 and coupon_discount_percent <= 90);
  end if;
end $$;

comment on column public.store_items.discount_percent is
  'Sale discount, 0-90. Fractional values are allowed: 66.67 means two thirds off.';

notify pgrst, 'reload schema';
