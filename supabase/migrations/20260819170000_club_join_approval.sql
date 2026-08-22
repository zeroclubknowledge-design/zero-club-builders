-- Public, but not necessarily open.
--
-- A club had two settings and they were welded together: private meant "ask
-- the admin", public meant "anyone walks in". There is an obvious third case —
-- findable by anyone, joined only with a nod — and owners were choosing
-- between being invisible and being unable to say no.
--
-- So visibility and admission are separated. is_private still decides who can
-- see the club; requires_approval decides who gets in.

alter table public.clubs
  add column if not exists requires_approval boolean not null default false;

/* Private clubs have always worked by request, so they keep that behaviour
   whatever the new flag says. Public clubs opt in. */
create or replace function public.club_needs_approval(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(c.is_private, false) or coalesce(c.requires_approval, false)
  from public.clubs c
  where c.id = p_club_id
$$;

grant execute on function public.club_needs_approval(uuid) to authenticated, anon;

create or replace function public.set_club_admission(
  p_club_id uuid,
  p_requires_approval boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  owner_id uuid;
begin
  if caller is null then raise exception 'Not authenticated'; end if;

  select creator_id into owner_id from public.clubs where id = p_club_id;
  if owner_id is null then raise exception 'Club not found'; end if;
  if owner_id <> caller then raise exception 'Only the club owner can change this'; end if;

  update public.clubs
  set requires_approval = coalesce(p_requires_approval, false)
  where id = p_club_id;

  return jsonb_build_object('requires_approval', coalesce(p_requires_approval, false));
end;
$$;

grant execute on function public.set_club_admission(uuid, boolean) to authenticated;

/* join_club learns the new rule.
 *
 * A club that wants approval sends a request instead of admitting anyone, and
 * says so in the return value rather than raising — asking to join is a normal
 * outcome, not a failure. The paid path is untouched: money is taken only when
 * somebody is actually being let in. */
create or replace function public.join_club(p_club_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  club public.clubs;
  fee numeric;
  balance numeric;
  reference text;
  joiner_name text;
begin
  if caller is null then raise exception 'Not authenticated'; end if;

  select * into club from public.clubs where id = p_club_id;
  if club.id is null then raise exception 'Club not found'; end if;

  if exists (select 1 from public.club_members where club_id = p_club_id and profile_id = caller) then
    return jsonb_build_object('status', 'already_member', 'paid', 0);
  end if;

  select coalesce(full_name, username) into joiner_name from public.profiles where id = caller;

  if public.club_needs_approval(p_club_id) then
    -- The existing request convention: a message the admin's inbox understands.
    insert into public.messages (sender_id, receiver_id, content)
    values (caller, club.creator_id, 'CLUB_REQUEST:' || p_club_id::text || ':' || club.name || ':pending');

    return jsonb_build_object('status', 'requested', 'paid', 0);
  end if;

  fee := public.club_entry_fee(p_club_id);

  if fee > 0 then
    select coalesce(coins, 0) into balance from public.profiles where id = caller;
    if balance < fee then
      return jsonb_build_object('status', 'insufficient_funds', 'fee', fee, 'shortfall', fee - balance);
    end if;

    reference := 'club:' || p_club_id::text || ':' || caller::text;

    perform public.wallet_apply(
      caller, 'debit', fee, 'club',
      'Subscription to ' || club.name,
      reference || ':out',
      jsonb_build_object('club_id', p_club_id)
    );

    perform public.wallet_apply(
      club.creator_id, 'credit', fee, 'club',
      coalesce(joiner_name, 'Someone') || ' subscribed to ' || club.name,
      reference || ':in',
      jsonb_build_object('club_id', p_club_id, 'member_id', caller)
    );

    insert into public.club_subscriptions (club_id, profile_id, amount, reference)
    values (p_club_id, caller, fee, reference)
    on conflict (club_id, profile_id) do nothing;
  end if;

  insert into public.club_members (club_id, profile_id, role)
  values (p_club_id, caller, 'Member')
  on conflict do nothing;

  return jsonb_build_object('status', 'joined', 'paid', fee);
end;
$$;

grant execute on function public.join_club(uuid) to authenticated;

/* The row-level rule follows the same logic: a club that wants approval is not
   one you can add yourself to, whatever it costs. */
drop policy if exists club_members_join_free on public.club_members;
create policy club_members_join_free
  on public.club_members for insert to authenticated
  with check (
    (
      profile_id = auth.uid()
      and not public.club_needs_approval(club_id)
      and public.club_entry_fee(club_id) = 0
    )
    or public.is_club_admin(club_id)
  );

notify pgrst, 'reload schema';
