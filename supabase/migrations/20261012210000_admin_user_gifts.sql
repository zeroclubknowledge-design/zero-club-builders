-- Recipient-bound gifts from Zero Club. No personal admin wallet is charged.
begin;
create table public.admin_user_gifts (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.profiles(id) on delete set null,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  request_id uuid not null,
  kind text not null check(kind in ('support','custom','zp','bootcamps','membership','zero-ai','tutor-session','zero-store')),
  amount bigint not null check(amount > 0),
  message text not null default '',
  claim_deadline timestamptz not null,
  status text not null default 'pending' check(status in ('pending','claimed','expired')),
  claimed_at timestamptz,
  gift_card_id uuid references public.gift_cards(id),
  created_at timestamptz not null default now(),
  unique(admin_id,request_id)
);
create index admin_user_gifts_recipient_idx on public.admin_user_gifts(recipient_id,created_at desc);
alter table public.admin_user_gifts enable row level security;
revoke all on public.admin_user_gifts from anon,authenticated;
grant select on public.admin_user_gifts to authenticated;
create policy admin_user_gifts_read on public.admin_user_gifts for select to authenticated
using(recipient_id=auth.uid() or public.is_zero_club_admin());
alter table public.notifications add column admin_gift_id uuid references public.admin_user_gifts(id) on delete cascade;

create function public.admin_gift_recipient(p_username text)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare recipient public.profiles;
begin
  if not coalesce(public.is_zero_club_admin(),false) then raise exception 'Only Zero Club admins can look up gift recipients'; end if;
  select * into recipient from public.profiles where lower(username)=lower(ltrim(btrim(p_username),'@')) and account_status='active';
  if recipient.id is null then return null; end if;
  return jsonb_build_object('id',recipient.id,'username',recipient.username,'full_name',recipient.full_name,'avatar_url',recipient.avatar_url,'account_type',recipient.account_type,'tutor_enabled',recipient.tutor_enabled,'is_admin',recipient.is_admin);
end $$;
revoke all on function public.admin_gift_recipient(text) from public,anon;
grant execute on function public.admin_gift_recipient(text) to authenticated;

create function public.admin_send_user_gift(p_username text,p_kind text,p_amount bigint,p_message text,p_claim_deadline timestamptz,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare recipient public.profiles; gift public.admin_user_gifts; clean_message text:=btrim(coalesce(p_message,''));
begin
  if not coalesce(public.is_zero_club_admin(),false) then raise exception 'Only Zero Club admins can send gifts'; end if;
  if p_request_id is null then raise exception 'A gift request ID is required'; end if;
  if p_kind is null or p_kind not in ('support','custom','zp','bootcamps','membership','zero-ai','tutor-session','zero-store') then raise exception 'Choose an available gift type'; end if;
  if p_amount is null or p_amount<1 or p_amount>(case when p_kind='zp' then 50000000 else 5000000 end) then raise exception 'Enter an amount within the gift limit'; end if;
  if p_kind='zp' and (p_amount<10 or p_amount%10<>0) then raise exception 'Zero Points must be in steps of 10'; end if;
  if length(clean_message)>500 then raise exception 'Keep your message within 500 characters'; end if;
  if p_kind='custom' and length(clean_message)<3 then raise exception 'Describe what this custom gift is for'; end if;
  select * into recipient from public.profiles where lower(username)=lower(ltrim(btrim(p_username),'@'));
  if recipient.id is null then raise exception 'No user has that username'; end if;
  if recipient.account_status <> 'active' then raise exception 'This account is not active'; end if;
  -- Replays are safe even after the original claim deadline has passed.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || p_request_id::text,0));
  select * into gift from public.admin_user_gifts where admin_id=auth.uid() and request_id=p_request_id;
  if gift.id is not null then
    if gift.recipient_id<>recipient.id or gift.kind<>p_kind or gift.amount<>p_amount or gift.message<>clean_message or gift.claim_deadline<>p_claim_deadline then raise exception 'This request was already used for another gift'; end if;
    return to_jsonb(gift)||jsonb_build_object('username',recipient.username);
  end if;
  if p_claim_deadline is null or p_claim_deadline<=now() or p_claim_deadline>now()+interval '1 year' then raise exception 'Choose a future claim deadline within one year'; end if;
  insert into public.admin_user_gifts(admin_id,recipient_id,request_id,kind,amount,message,claim_deadline)
  values(auth.uid(),recipient.id,p_request_id,p_kind,p_amount,clean_message,p_claim_deadline) returning * into gift;
  insert into public.notifications(recipient_id,actor_id,type,entity_id,content,admin_gift_id)
  values(recipient.id,auth.uid(),'system',gift.id,'Zero Club sent you a gift. Open Gifts to claim it before the deadline.',gift.id);
  insert into public.admin_audit_logs(admin_id,action,target_type,target_id,details)
  values(auth.uid(),'send_user_gift','admin_user_gift',gift.id,to_jsonb(gift));
  return to_jsonb(gift)||jsonb_build_object('username',recipient.username);
end $$;

create function public.claim_admin_user_gift(p_gift_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare caller uuid:=auth.uid(); recipient public.profiles; gift public.admin_user_gifts; card_id uuid; cost bigint;
begin
  if caller is null then raise exception 'Please sign in to claim your gift'; end if;
  select * into recipient from public.profiles where id=caller for update;
  if recipient.id is null or recipient.account_status<>'active' then raise exception 'This account is not active'; end if;
  select * into gift from public.admin_user_gifts where id=p_gift_id and recipient_id=caller for update;
  if gift.id is null then raise exception 'Gift not found for this account'; end if;
  if gift.status='claimed' then return jsonb_build_object('status','already_claimed'); end if;
  if gift.status='expired' or gift.claim_deadline<=now() then
    update public.admin_user_gifts set status='expired' where id=gift.id;
    return jsonb_build_object('status','expired');
  end if;
  if gift.kind='zp' then
    perform public.award_profile_zp(caller,'admin_reward',gift.id::text,gift.amount::integer,jsonb_build_object('admin_gift_id',gift.id,'admin_id',gift.admin_id));
    cost:=gift.amount/public.zp_per_naira();
  elsif gift.kind in ('support','custom') then
    perform public.wallet_apply(caller,'credit',gift.amount,'gift','Gift from Zero Club','admin_gift_'||gift.id,
      jsonb_build_object('admin_gift_id',gift.id,'purpose',gift.message));
    cost:=gift.amount;
  else
    insert into public.gift_cards(code,creator_id,amount,template_id,service,message,status,claimed_by,claimed_at,remaining_amount)
    values('ZC-'||upper(replace(gift.id::text,'-','')),coalesce(gift.admin_id,caller),gift.amount,'signature',gift.kind,gift.message,'claimed',caller,now(),gift.amount)
    returning id into card_id;
    cost:=gift.amount;
  end if;
  -- Keep platform-sponsored value in the same ledger as existing admin rewards.
  insert into public.platform_rewards(id,kind,reward_type,admin_id,recipient_id,amount,zp,naira_cost,reason)
  values(gift.id,'direct_reward',case when gift.kind='zp' then 'zp' else 'funds' end,gift.admin_id,caller,
    case when gift.kind='zp' then 0 else gift.amount end,case when gift.kind='zp' then gift.amount else 0 end,cost,
    left('Claimed gift: '||gift.kind||case when gift.message='' then '' else ' · '||gift.message end,300));
  update public.admin_user_gifts set status='claimed',claimed_at=now(),gift_card_id=card_id where id=gift.id;
  insert into public.admin_audit_logs(admin_id,action,target_type,target_id,details)
  values(gift.admin_id,'claim_user_gift','admin_user_gift',gift.id,jsonb_build_object('recipient_id',caller,'kind',gift.kind,'amount',gift.amount));
  return jsonb_build_object('status','claimed','kind',gift.kind,'amount',gift.amount,'gift_card_id',card_id);
end $$;
revoke all on function public.admin_send_user_gift(text,text,bigint,text,timestamptz,uuid) from public,anon;
revoke all on function public.claim_admin_user_gift(uuid) from public,anon;
grant execute on function public.admin_send_user_gift(text,text,bigint,text,timestamptz,uuid) to authenticated;
grant execute on function public.claim_admin_user_gift(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
