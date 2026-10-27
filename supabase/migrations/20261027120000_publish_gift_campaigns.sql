-- Campaigns from both apps must be visible without a separate publishing call.
-- Keep the existing browse_gift_cards RPC, its safe projection and RLS intact.
begin;

alter table public.gift_cards add column if not exists is_public boolean not null default false;

create or replace function public.publish_zero_gift_campaign()
returns trigger language plpgsql set search_path = public as $$
begin
  -- A finite expiry identifies quantity-based campaigns. A personal gift or a
  -- claim receipt must never be made discoverable, even if copied from a parent.
  new.is_public := new.parent_gift_id is null
    and new.claimed_by is null and new.expires_at is not null;
  return new;
end;
$$;

drop trigger if exists publish_zero_gift_campaign on public.gift_cards;
create trigger publish_zero_gift_campaign
before insert or update on public.gift_cards
for each row execute function public.publish_zero_gift_campaign();

-- Correct existing campaigns too, including expired ones that may be reactivated.
-- The browse RPC continues to exclude expired/cancelled/exhausted campaigns.
update public.gift_cards
set is_public = (parent_gift_id is null and claimed_by is null and expires_at is not null)
where is_public is distinct from
  (parent_gift_id is null and claimed_by is null and expires_at is not null);

create index if not exists zero_gift_public_campaigns_idx
on public.gift_cards(created_at desc)
where is_public and parent_gift_id is null;

notify pgrst, 'reload schema';
commit;
