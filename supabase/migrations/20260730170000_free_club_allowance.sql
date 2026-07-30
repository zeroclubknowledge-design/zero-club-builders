-- Free-tier club allowance, enforced in the database.
--
-- Rules:
--   * A free (Basic) account may create one club, and only one.
--   * Accounts that already created a club must upgrade to create another.
--   * Free creation stops once the platform-wide free allowance is exhausted.
--     The original allowance was 20 slots; this raises it to 50 (+30).
--   * Premium, Premium+, and admins are unaffected.

insert into public.platform_settings (key, value, description)
values ('free_club_limit', '50'::jsonb, 'Platform-wide number of clubs free accounts may create')
on conflict (key) do update set value = '50'::jsonb;

create or replace function public.enforce_free_club_allowance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  creator_tier text;
  creator_is_admin boolean := false;
  clubs_by_creator integer;
  free_clubs_total integer;
  free_limit integer;
begin
  -- Server-side calls (SQL editor, service role) are not restricted.
  if auth.uid() is null then
    return new;
  end if;

  select tier, coalesce(is_admin, false)
  into creator_tier, creator_is_admin
  from public.profiles
  where id = new.creator_id;

  if creator_is_admin or coalesce(creator_tier, 'Basic') in ('Premium', 'Premium+') then
    return new;
  end if;

  -- Bootcamp-backed clubs are created as part of course delivery, not by hand.
  if coalesce(new.category, '') = 'Bootcamp' then
    return new;
  end if;

  select count(*) into clubs_by_creator
  from public.clubs
  where creator_id = new.creator_id and coalesce(category, '') <> 'Bootcamp';

  if clubs_by_creator > 0 then
    raise exception 'Free accounts can create one club. Upgrade to Premium to create more.';
  end if;

  select coalesce((value #>> '{}')::integer, 50) into free_limit
  from public.platform_settings where key = 'free_club_limit';

  select count(*) into free_clubs_total
  from public.clubs as club
  join public.profiles as owner on owner.id = club.creator_id
  where coalesce(club.category, '') <> 'Bootcamp'
    and coalesce(owner.tier, 'Basic') not in ('Premium', 'Premium+');

  if free_clubs_total >= coalesce(free_limit, 50) then
    raise exception 'All free club slots have been claimed. Upgrade to Premium to create a club.';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_free_club_allowance_trigger on public.clubs;
create trigger enforce_free_club_allowance_trigger
before insert on public.clubs
for each row execute function public.enforce_free_club_allowance();

-- Lets the app show remaining slots and the correct upgrade prompt.
create or replace function public.get_free_club_allowance()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  free_limit integer;
  used integer;
  mine integer := 0;
begin
  select coalesce((value #>> '{}')::integer, 50) into free_limit
  from public.platform_settings where key = 'free_club_limit';

  select count(*) into used
  from public.clubs as club
  join public.profiles as owner on owner.id = club.creator_id
  where coalesce(club.category, '') <> 'Bootcamp'
    and coalesce(owner.tier, 'Basic') not in ('Premium', 'Premium+');

  if auth.uid() is not null then
    select count(*) into mine from public.clubs
    where creator_id = auth.uid() and coalesce(category, '') <> 'Bootcamp';
  end if;

  return jsonb_build_object(
    'limit', coalesce(free_limit, 50),
    'used', used,
    'remaining', greatest(0, coalesce(free_limit, 50) - used),
    'clubs_created_by_me', mine
  );
end;
$$;

grant execute on function public.get_free_club_allowance() to authenticated;

notify pgrst, 'reload schema';
