-- Apply after the existing campaign and learning referral migrations.
-- Run this entire file in Supabase SQL Editor, then deploy Zero Club and Zero Start.
begin;
alter table public.zs_amb_campaigns add column if not exists partner_bootcamp_id uuid references public.bootcamps(id);
alter table public.zs_amb_campaigns add column if not exists partner_share_code text references public.learning_share_links(code);

create or replace function public.zs_partner_bootcamps()
returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'title',b.title,'referral_percent',b.referral_percent) order by b.title),'[]'::jsonb)
 from bootcamps b where b.referral_percent>0 and b.status='active' and exists(select 1 from zs_ambassadors where profile_id=auth.uid() and status='active');
$$;

create or replace function public.zs_validate_bootcamp_partner()
returns trigger language plpgsql security definer set search_path=public as $$
declare target_path text; code_value text; link public.learning_share_links; camp public.bootcamps;
begin
 new.partner_share_code:=null; new.partner_bootcamp_id:=null;
 if nullif(btrim(new.partner_url),'') is null then return new; end if;
 if new.partner_url !~ '^https://(www\.)?zeroclubs\.xyz/' then raise exception 'Use a Zero Club bootcamp affiliate share link'; end if;
 target_path:=regexp_replace(new.partner_url,'^https://(www\.)?zeroclubs\.xyz','');
 if target_path like '/share/%' then
   select destination into target_path from named_share_links where named_share_links.path=split_part(target_path,'?',1);
 end if;
 if target_path ~ '^/s/[0-9a-f]{12}([?#].*)?$' then code_value:=substring(target_path from '^/s/([0-9a-f]{12})');
 elsif target_path ~ '[?&]via=[0-9a-f]{12}(&|$)' then code_value:=substring(target_path from '[?&]via=([0-9a-f]{12})');
 else raise exception 'Paste your bootcamp affiliate share link, or generate one here'; end if;
 select * into link from learning_share_links where code=code_value;
 if link.referrer_id is distinct from new.owner_id then raise exception 'This affiliate link must belong to the campaign owner'; end if;
 select * into camp from bootcamps where id=link.bootcamp_id;
 if camp.id is null or camp.status<>'active' or coalesce(camp.referral_percent,0)<=0 then raise exception 'This bootcamp does not offer affiliate commission'; end if;
 if new.partner_name is not null and new.partner_name<>camp.title then raise exception 'The affiliate link does not match the selected Partner Bootcamp'; end if;
 new.partner_name:=camp.title; new.partner_bootcamp_id:=camp.id; new.partner_share_code:=link.code;
 return new;
end $$;
drop trigger if exists zs_validate_bootcamp_partner on public.zs_amb_campaigns;
create trigger zs_validate_bootcamp_partner before insert or update of partner_url,partner_name,partner_share_code,partner_bootcamp_id on public.zs_amb_campaigns for each row execute function public.zs_validate_bootcamp_partner();

-- Keep the existing campaign ownership, date and status checks when adding editable fields.
do $$ declare body text; needle text:='    updated_at = now()'; begin
 body:=pg_get_functiondef('public.zs_update_my_campaign(uuid,jsonb)'::regprocedure);
 if position('partner_url = case' in body)=0 then
   if position(needle in body)=0 then raise exception 'Campaign edit function needs review; no changes applied'; end if;
   body:=replace(body,needle,$patch$    partner_name = case when p ? 'partner_name' then nullif(btrim(p->>'partner_name'),'') else partner_name end,
    partner_url = case when p ? 'partner_url' then nullif(btrim(p->>'partner_url'),'') else partner_url end,
    updated_at = now()$patch$);
   execute body;
 end if;
end $$;

-- A verified campaign signup also binds the bootcamp affiliate before any purchase.
create or replace function public.zs_credit_campaign_bootcamp()
returns trigger language plpgsql security definer set search_path=public as $$
declare code_value text; camp uuid;
begin
 if new.kind<>'signup' or new.status<>'verified' then return new; end if;
 select partner_share_code,partner_bootcamp_id into code_value,camp from zs_amb_campaigns where id=new.campaign_id and owner_id=new.ambassador_id;
 if code_value is null or new.referred_profile_id=new.ambassador_id then return new; end if;
 insert into bootcamp_referral_clicks(bootcamp_id,referrer_id,visitor_id,share_link_code)
 values(camp,new.ambassador_id,new.referred_profile_id,code_value)
 on conflict(share_link_code,visitor_id) where share_link_code is not null do nothing;
 return new;
end $$;
drop trigger if exists zs_credit_campaign_bootcamp on public.zs_campaign_results;
create trigger zs_credit_campaign_bootcamp after insert or update of status on public.zs_campaign_results for each row execute function public.zs_credit_campaign_bootcamp();

-- Adding a link to an existing campaign covers its recent referrals' future
-- purchases, without extending the 30-day window or rewriting settled sales.
create or replace function public.zs_attach_campaign_bootcamp()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.partner_share_code is null or new.partner_share_code is not distinct from old.partner_share_code then return new; end if;
 insert into bootcamp_referral_clicks(bootcamp_id,referrer_id,visitor_id,share_link_code,created_at,expires_at)
 select new.partner_bootcamp_id,new.owner_id,r.referred_profile_id,new.partner_share_code,r.created_at,r.created_at+interval '30 days'
 from zs_campaign_results r where r.campaign_id=new.id and r.ambassador_id=new.owner_id
 and r.kind='signup' and r.status='verified' and r.referred_profile_id is not null
 and r.referred_profile_id<>new.owner_id and r.created_at>now()-interval '30 days'
 on conflict(share_link_code,visitor_id) where share_link_code is not null do nothing;
 return new;
end $$;
drop trigger if exists zs_attach_campaign_bootcamp on public.zs_amb_campaigns;
create trigger zs_attach_campaign_bootcamp after update on public.zs_amb_campaigns for each row execute function public.zs_attach_campaign_bootcamp();

-- Add the validated destination to the existing public campaign preview.
create or replace function public.zs_campaign_link_preview(p_code text)
returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce((select jsonb_build_object('found',true,'title',c.title,'summary',c.summary,
   'description',c.description,'cover_url',c.cover_url,'referral_code',p.referral_code,
   'partner_name',c.partner_name,'partner_share_code',c.partner_share_code)
 from zs_campaign_members m join zs_amb_campaigns c on c.id=m.campaign_id join profiles p on p.id=m.profile_id
 where m.code=upper(btrim(p_code)) and c.status in ('live','ended') limit 1),jsonb_build_object('found',false));
$$;
revoke all on function public.zs_partner_bootcamps(),public.zs_validate_bootcamp_partner(),public.zs_credit_campaign_bootcamp(),public.zs_attach_campaign_bootcamp() from public;
grant execute on function public.zs_partner_bootcamps() to authenticated;
notify pgrst,'reload schema';
commit;
