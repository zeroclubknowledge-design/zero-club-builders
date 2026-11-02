begin;
create table if not exists public.zs_campaign_visits (
  code text not null references public.zs_campaign_members(code) on delete cascade,
  visitor uuid not null,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key(code,visitor)
);
alter table public.zs_campaign_visits enable row level security;
revoke all on public.zs_campaign_visits from public,anon,authenticated;

create or replace function public.zs_record_campaign_visit(p_code text,p_visitor uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare code_value text:=upper(btrim(p_code));
begin
  if p_visitor is null or not exists(select 1 from zs_campaign_members m join zs_amb_campaigns c on c.id=m.campaign_id where m.code=code_value and c.status='live') then return false; end if;
  insert into zs_campaign_visits(code,visitor) values(code_value,p_visitor)
  on conflict(code,visitor) do update set last_seen=now();
  return true;
end $$;

-- Signup attribution survives a closed tab: use the campaign saved in auth metadata.
create or replace function public.zs_attribute_profile_campaign()
returns trigger language plpgsql security definer set search_path=public as $$
declare campaign_code text;
begin
  select upper(btrim(raw_user_meta_data->>'zs_campaign_code')) into campaign_code from auth.users where id=new.id and email_confirmed_at is not null;
  if campaign_code is null or not exists(select 1 from profiles where id=new.id) then return new; end if;
  insert into zs_campaign_results(campaign_id,ambassador_id,kind,referred_profile_id,status,reviewed_at)
  select c.id,m.profile_id,'signup',new.id,'verified',now()
  from zs_campaign_members m join zs_amb_campaigns c on c.id=m.campaign_id
  where m.code=campaign_code and m.profile_id<>new.id and c.status='live' and c.tracking<>'proof'
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists zs_profile_campaign_attribution on public.profiles;
create trigger zs_profile_campaign_attribution after insert on public.profiles for each row execute function public.zs_attribute_profile_campaign();

-- Email OTP creates the auth row before verification. Count only after confirmation.
drop trigger if exists zs_confirmed_campaign_attribution on auth.users;
create trigger zs_confirmed_campaign_attribution after update of email_confirmed_at on auth.users
for each row when (new.email_confirmed_at is not null and old.email_confirmed_at is null)
execute function public.zs_attribute_profile_campaign();

create or replace function public.zs_my_referral_tracking(p_campaign uuid default null)
returns jsonb language sql stable security definer set search_path=public as $$
select jsonb_build_object(
 'campaigns',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'title',c.title,'code',m.code,
   'visitors',(select count(*) from zs_campaign_visits v where v.code=m.code),
   'last_visit',(select max(last_seen) from zs_campaign_visits v where v.code=m.code),
   'signups',(select count(*) from zs_campaign_results r where r.campaign_id=c.id and r.ambassador_id=auth.uid() and r.kind='signup' and r.status='verified'),
   'activations',(select count(*) from zs_campaign_results r where r.campaign_id=c.id and r.ambassador_id=auth.uid() and r.kind='activation' and r.status='verified')) order by c.created_at desc)
   from zs_campaign_members m join zs_amb_campaigns c on c.id=m.campaign_id
   where m.profile_id=auth.uid() and (p_campaign is null or c.id=p_campaign)),'[]'::jsonb),
 'referrals',coalesce((select jsonb_agg(to_jsonb(recent)) from (
   select r.id,c.title as campaign,p.username,p.full_name,r.created_at as joined_at,
   exists(select 1 from zs_campaign_results a where a.referred_profile_id=r.referred_profile_id and a.ambassador_id=auth.uid() and a.kind='activation' and a.status='verified') as activated
   from zs_campaign_results r join zs_amb_campaigns c on c.id=r.campaign_id join profiles p on p.id=r.referred_profile_id
   where r.ambassador_id=auth.uid() and r.kind='signup' and r.status='verified' and (p_campaign is null or r.campaign_id=p_campaign)
   order by r.created_at desc limit 100) recent),'[]'::jsonb));
$$;
revoke all on function public.zs_record_campaign_visit(text,uuid),public.zs_my_referral_tracking(uuid),public.zs_attribute_profile_campaign() from public;
grant execute on function public.zs_record_campaign_visit(text,uuid) to anon,authenticated;
grant execute on function public.zs_my_referral_tracking(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
