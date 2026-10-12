-- Keep existing paid subscription keys so members retain their paid periods.
begin;
update public.subscription_plans set name='Creator PRO', price_amount=3000,
 features='["Create up to 3 permanent Clubs","Club customization and member management","Moderation tools and analytics","Community insights","12 rewarded Zero Games competitions weekly, maximum 2 daily","First Club receives 6 months premium experience","Creator Rewards eligibility"]'::jsonb,
 updated_at=now() where key='creator';
update public.subscription_plans set name='Tutor Pro', price_amount=7000,
 features='["Everything in Tutor Basic","Create up to 5 permanent Clubs","Connect Bootcamps to existing Clubs","Verified badge for approved Bootcamps","8 rewarded Zero Games competitions weekly, maximum 2 daily"]'::jsonb,
 updated_at=now() where key='tutor_premium';
update public.subscription_plans set name='Tutor Max', price_amount=12000,
 features='["Everything in Tutor Pro","Create up to 10 permanent Clubs","Zero AI curriculum, assessment, and teaching assistance","Zero AI voice conversations","Advanced cohort assistance","Unlimited existing-Club connections","20 rewarded Zero Games competitions weekly, maximum 3 daily","Priority tutor support"]'::jsonb,
 updated_at=now() where key='tutor_premium_plus';
insert into public.subscription_plans(key,name,audience,price_amount,billing_interval,permanent_club_limit,features)
values ('creator_basic','Creator Basic','creator',0,'free',0,'["Join Clubs","Publish projects and posts","Upgrade to create permanent Clubs"]'::jsonb),
 ('creator_max','Creator Max','creator',5000,'month',3,'["Everything in Creator PRO","Create up to 3 permanent Clubs","Zero AI creator assistant","AI content, community, and launch planning","Zero AI voice conversations"]'::jsonb)
on conflict(key) do update set name=excluded.name,price_amount=excluded.price_amount,features=excluded.features,permanent_club_limit=excluded.permanent_club_limit,updated_at=now();

create or replace function public.membership_audience(target_profile uuid)
returns text language sql stable security definer set search_path=public as $$
 select case when lower(account_type)='institution' then 'institution'
   when lower(account_type)='tutor' then 'tutor'
   when active_mode='creator' or lower(account_type)='creator' then 'creator' else 'learner' end
 from public.profiles where id=target_profile;
$$;
revoke all on function public.membership_audience(uuid) from public,anon;
grant execute on function public.membership_audience(uuid) to authenticated;

create or replace function public.zero_club_plan_key(target_profile uuid)
returns text language plpgsql stable security definer set search_path=public as $$
declare profile_row public.profiles; active_plan text; normalized_tier text; audience text;
begin
 select * into profile_row from public.profiles where id=target_profile;
 if profile_row.id is null then return 'learner_basic'; end if;
 if coalesce(profile_row.is_admin,false) then return 'administrator'; end if;
 select plan_key into active_plan from public.subscriptions where profile_id=target_profile and status in ('active','past_due','grace_period') order by created_at desc limit 1;
 if active_plan is not null then return active_plan; end if;
 audience:=public.membership_audience(target_profile);
 normalized_tier:=lower(replace(coalesce(profile_row.tier,'basic'),' ',''));
 if audience='institution' then return 'institution'; end if;
 if normalized_tier='creatormax' then return 'creator_max'; end if;
 if normalized_tier='creator' then return 'creator'; end if;
 if audience='tutor' or coalesce(profile_row.tutor_enabled,false) then
   if normalized_tier='premium+' then return 'tutor_premium_plus'; end if;
   if normalized_tier='premium' then return 'tutor_premium'; end if;
   return 'tutor_basic';
 end if;
 if audience='creator' then return 'creator_basic'; end if;
 if normalized_tier in ('premium','premium+') then return 'learner_premium'; end if;
 return 'learner_basic';
end $$;

-- Ownership continuity follows the paid plan, not the currently selected mode.
create or replace function public.zero_club_permanent_club_limit(target_profile uuid)
returns integer language plpgsql stable security definer set search_path=public as $$
declare plan_key text; club_limit integer;
begin
 plan_key:=public.zero_club_plan_key(target_profile);
 if plan_key in ('administrator','institution') or plan_key like 'institution_%' then return null; end if;
 select permanent_club_limit into club_limit from public.subscription_plans where key=plan_key;
 return coalesce(club_limit,0);
end $$;

create or replace function public.enforce_permanent_club_capacity()
returns trigger language plpgsql security definer set search_path=public as $$
declare club_limit integer; owned_count integer; owner_row public.profiles;
begin
 select * into owner_row from public.profiles where id=new.creator_id for update;
 if not coalesce(owner_row.is_admin,false) and public.membership_audience(new.creator_id)='learner' then
   raise exception 'Learners can join clubs but cannot create them. Switch to Creator mode to create a club';
 end if;
 if new.club_type='bootcamp_cohort' then
   if new.bootcamp_id is null or not exists(select 1 from public.bootcamps where id=new.bootcamp_id and creator_id=new.creator_id) then
     raise exception 'A cohort club must belong to a bootcamp owned by its creator';
   end if;
   return new;
 end if;
 new.club_type:='permanent';
 club_limit:=public.zero_club_permanent_club_limit(new.creator_id);
 if club_limit is null then return new; end if;
 select count(*) into owned_count from public.clubs where creator_id=new.creator_id and club_type='permanent' and status<>'archived';
 if owned_count>=club_limit then raise exception '%',public.club_capacity_message(public.zero_club_plan_key(new.creator_id)); end if;
 return new;
end $$;

create or replace function public.can_use_zero_ai()
returns boolean language plpgsql stable security definer set search_path=public as $$
declare audience text; plan_key text; current_sub public.subscriptions;
begin
 if auth.uid() is null then return false; end if;
 if public.is_zero_club_admin() then return true; end if;
 audience:=public.membership_audience(auth.uid());
 plan_key:=public.zero_club_plan_key(auth.uid());
 if audience in ('creator','tutor') then
   select * into current_sub from public.subscriptions where profile_id=auth.uid() and status in ('active','past_due','grace_period') order by created_at desc limit 1;
   if current_sub.id is not null and current_sub.current_period_end is not null and current_sub.current_period_end<=now()
     and not (current_sub.status='grace_period' and coalesce(current_sub.grace_period_end>now(),false)) then return false; end if;
 end if;
 if audience='creator' then return plan_key='creator_max'; end if;
 if audience='tutor' then return plan_key='tutor_premium_plus'; end if;
 return audience in ('learner','institution');
end $$;
revoke all on function public.can_use_zero_ai() from public,anon;
grant execute on function public.can_use_zero_ai() to authenticated;

create or replace function public.claim_zero_ai_request(p_kind text)
returns boolean language plpgsql security definer set search_path=public as $$
declare caller uuid:=auth.uid(); daily_limit integer; claimed integer; stored_kind text;
begin
 if caller is null then raise exception 'Not authenticated'; end if;
 if p_kind is null or p_kind not in ('chat','voice','verification') then raise exception 'Invalid request type'; end if;
 -- Security confirmations are available independently of conversational AI.
 if p_kind<>'verification' and not public.can_use_zero_ai() then raise exception 'ZERO_AI_MAX_REQUIRED'; end if;
 stored_kind:=case when p_kind='verification' then 'voice' else p_kind end;
 daily_limit:=case when stored_kind='voice' then 5 else 100 end;
 insert into public.zero_ai_daily_usage(profile_id,request_day,kind,requests)
 values(caller,(now() at time zone 'UTC')::date,stored_kind,1)
 on conflict(profile_id,request_day,kind) do update set requests=zero_ai_daily_usage.requests+1 where zero_ai_daily_usage.requests<daily_limit returning requests into claimed;
 return claimed is not null;
end $$;

-- Preserve the latest wallet/gift-funded payment functions. Changes below only
-- add the new tier mapping and enforce the chosen account's purchase audience.
do $$
declare definition text; function_signature text;
begin
 foreach function_signature in array array['public.activate_membership(text,boolean,boolean)','public.claim_membership_gift(uuid)'] loop
   definition:=pg_get_functiondef(function_signature::regprocedure);
   definition:=replace(definition,'when ''creator'' then ''Creator''','when ''creator_max'' then ''CreatorMax'' when ''creator'' then ''Creator''');
   if function_signature like '%activate_membership%' then
     definition:=replace(definition,'if plan_row.key is null then',
       'if plan_row.audience <> public.membership_audience(caller) then raise exception ''Choose a membership for your current account mode''; end if; if plan_row.key is null then');
   end if;
   execute definition;
 end loop;
end $$;

-- Replace legacy labels without removing subscription records or changing
-- already-paid end dates. Creator Max keeps the existing 3-club allowance.
do $$
declare definition text; signature text;
begin
 foreach signature in array array['public.club_capacity_message(text)','public.apply_creator_first_club_benefit()','public.get_my_club_capacity()','public.get_zero_game_reward_allowance(uuid)'] loop
   definition:=pg_get_functiondef(signature::regprocedure);
   definition:=replace(replace(replace(definition,'Tutor Premium+','Tutor Max'),'Tutor Premium','Tutor Pro'),'Creator plan','Creator PRO plan');
   if signature like '%club_capacity_message%' then
     definition:=replace(definition,'when ''creator'' then','when ''creator_max'' then ''You''''ve reached your Creator Max limit of 3 Clubs.'' when ''creator'' then');
   elsif signature like '%apply_creator_first%' then
     definition:=replace(definition,'<> ''creator''','not in (''creator'', ''creator_max'')');
   elsif signature like '%get_my_club_capacity%' then
     definition:=replace(definition,'club_limit := public.zero_club_permanent_club_limit(caller);',
       'club_limit := public.zero_club_permanent_club_limit(caller); if public.membership_audience(caller) = ''learner'' and not public.is_zero_club_admin() then club_limit := 0; end if;');
   elsif signature like '%get_zero_game_reward%' then
     definition:=replace(replace(definition,'when ''creator'' then 12','when ''creator_max'' then 12 when ''creator'' then 12'),'when ''creator'' then 2','when ''creator_max'' then 2 when ''creator'' then 2');
   end if;
   execute definition;
 end loop;
end $$;
commit;
