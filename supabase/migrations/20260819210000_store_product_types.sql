-- A second, narrower word for what a listing actually is.
--
-- `category` held one of seven flat words, which could not tell a prompt pack
-- from a Figma file. Rather than overload that column, listings now carry the
-- broad group in `category` and the specific type beside it, so a card can say
-- "Prompt pack" while the browse row still says "Templates".
--
-- Nullable on purpose. Every listing published before today keeps working and
-- simply has no type yet; the app falls back to the group when the type is
-- missing rather than showing a gap.

alter table public.store_items
  add column if not exists product_type text;

-- Browsing is by group, and the storefront is sorted newest first.
create index if not exists store_items_category_created_idx
  on public.store_items (category, created_at desc);

create index if not exists store_items_seller_idx
  on public.store_items (seller_id, created_at desc);

analyze public.store_items;

notify pgrst, 'reload schema';
