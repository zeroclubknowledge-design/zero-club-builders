-- Administrator access is permanent and independent of paid memberships.
begin;

-- Preserve the current payment implementations for every other account.
do $$
declare signature text; definition text; guard text;
begin
  foreach signature in array array[
    'public.activate_membership(text,boolean,boolean)',
    'public.activate_membership(text,boolean)',
    'public.renew_my_membership(boolean)',
    'public.renew_my_membership()',
    'public.activate_digital_hub(boolean)',
    'public.refresh_my_subscription_lifecycle()',
    'public.get_my_subscription_dashboard()'
  ] loop
    if to_regprocedure(signature) is null then continue; end if;
    definition := pg_get_functiondef(signature::regprocedure);
    guard := E'begin\n  if public.is_zero_club_admin() then\n'
      || 'update public.subscriptions set auto_renew=false, updated_at=now() where profile_id=auth.uid() and auto_renew;'
      || E'\nperform public.refresh_owned_club_continuity(auth.uid());\n'
      || 'return jsonb_build_object(''status'',''administrator'',''plan_key'',''administrator'',''unlimited'',true,''amount'',0,''wallet_charged'',0,''subscription'',null,''club_capacity'',public.get_my_club_capacity());'
      || E'\nend if;\n';
    if definition !~ E'begin\r?\n' then raise exception 'Missing function entry: %', signature; end if;
    definition := regexp_replace(definition, E'begin\r?\n', guard);
    execute definition;
  end loop;
end $$;

-- No renewed billing can be enabled, even through an older client.
create or replace function public.admin_membership_no_renewal()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if exists(select 1 from public.profiles where id=new.profile_id and is_admin=true) then
    new.auto_renew := false;
  end if;
  return new;
end $$;
revoke all on function public.admin_membership_no_renewal() from public,anon,authenticated;
create trigger admin_membership_no_renewal before insert or update on public.subscriptions
for each row execute function public.admin_membership_no_renewal();
update public.subscriptions set auto_renew=false,updated_at=now()
where auto_renew and profile_id in(select id from public.profiles where is_admin=true);

do $$
declare definition text;
begin
  definition := pg_get_functiondef('public.claim_zero_ai_request(text)'::regprocedure);
  definition := replace(definition,
    '-- Security confirmations are available independently of conversational AI.',
    'if public.is_zero_club_admin() then return true; end if; -- Security confirmations are available independently of conversational AI.');
  execute definition;

  definition := pg_get_functiondef('public.get_zero_game_reward_allowance(uuid)'::regprocedure);
  definition := regexp_replace(definition, E'begin\r?\n', E'begin\n'
    || 'if exists(select 1 from public.profiles where id=target_profile and is_admin=true) then '
    || 'return jsonb_build_object(''plan_key'',''administrator'',''weekly_limit'',null,''weekly_used'',0,''weekly_remaining'',null,''daily_limit'',null,''daily_used'',0,''daily_remaining'',null,''can_create'',true,''unlimited'',true,''resets_at'',null); end if;'
    || E'\n');
  execute definition;

  definition := pg_get_functiondef('public.enforce_zero_game_reward_allowance()'::regprocedure);
  definition := regexp_replace(definition, E'begin\r?\n', E'begin\n'
    || 'if exists(select 1 from public.profiles where id=new.creator_id and is_admin=true) then return new; end if;'
    || E'\n');
  execute definition;

  -- Free administrative bootcamp seats never credit a tutor with unpaid money.
  definition := pg_get_functiondef('public.enroll_in_bootcamp(uuid,text,boolean)'::regprocedure);
  definition := replace(definition, 'payment_reference :=',
    'if public.is_zero_club_admin() then payable:=0; end if; payment_reference :=');
  execute definition;
end $$;

notify pgrst, 'reload schema';
commit;
