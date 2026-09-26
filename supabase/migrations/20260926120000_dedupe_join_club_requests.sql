/* Prevent duplicate join requests for clubs requiring approval. */
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
    -- Only insert if there isn't already a pending request from this caller to join this club
    if not exists (
      select 1 from public.messages
      where sender_id = caller
        and receiver_id = club.creator_id
        and content like ('CLUB_REQUEST:' || p_club_id::text || ':%:pending')
    ) then
      insert into public.messages (sender_id, receiver_id, content)
      values (caller, club.creator_id, 'CLUB_REQUEST:' || p_club_id::text || ':' || club.name || ':pending');
    end if;

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

/* One-time cleanup for existing duplicate pending club join request messages in database */
update public.messages m
set content = 'DISMISSED_CLUB_REQUEST'
where m.content like 'CLUB_REQUEST:%:pending'
  and m.id not in (
    select distinct on (sender_id, split_part(content, ':', 2)) id
    from public.messages
    where content like 'CLUB_REQUEST:%:pending'
    order by sender_id, split_part(content, ':', 2), created_at desc
  );
