begin;

create table if not exists public.learning_share_links (
  code text primary key check (code ~ '^[0-9a-f]{12}$'),
  referrer_id uuid not null references public.profiles(id) on delete cascade,
  bootcamp_id uuid references public.bootcamps(id) on delete cascade,
  form_id uuid references public.zero_forms(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (bootcamp_id is not null or form_id is not null)
);
create unique index if not exists learning_share_bootcamp_owner on public.learning_share_links(referrer_id,bootcamp_id) where form_id is null;
create unique index if not exists learning_share_form_owner on public.learning_share_links(referrer_id,form_id) where form_id is not null;
alter table public.learning_share_links enable row level security;
revoke all on public.learning_share_links from public,anon,authenticated;

create or replace function public.create_learning_share_link(p_bootcamp_id uuid default null,p_form_slug text default null)
returns text language plpgsql security definer set search_path=public as $$
declare caller uuid:=auth.uid(); camp uuid:=p_bootcamp_id; form public.zero_forms; result text;
begin
 if caller is null then raise exception 'Sign in to create a referral link'; end if;
 if nullif(btrim(p_form_slug),'') is not null then
   select * into form from zero_forms where slug=p_form_slug;
   if form.id is null or (form.status<>'published' and form.owner_id<>caller) then raise exception 'Form is not available'; end if;
   if camp is not null and camp is distinct from form.bootcamp_id then raise exception 'Form does not belong to this bootcamp'; end if;
   camp:=form.bootcamp_id;
 elsif camp is null or not exists(select 1 from bootcamps where id=camp) then raise exception 'Bootcamp not found'; end if;
 -- Serialize repeat share taps for this account/destination; links stay stable.
 perform pg_advisory_xact_lock(hashtextextended(caller::text||coalesce(form.id::text,camp::text),0));
 select code into result from learning_share_links where referrer_id=caller and
   ((form.id is not null and form_id=form.id) or (form.id is null and form_id is null and bootcamp_id=camp));
 if result is not null then return result; end if;
 loop
   result:=substr(replace(gen_random_uuid()::text,'-',''),1,12);
   begin
     insert into learning_share_links(code,referrer_id,bootcamp_id,form_id) values(result,caller,camp,form.id);
     return result;
   exception when unique_violation then null;
   end;
 end loop;
end $$;

create or replace function public.resolve_learning_share_link(p_code text)
returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('code',l.code,'bootcamp_id',case when l.form_id is not null then f.bootcamp_id else l.bootcamp_id end,
   'form_slug',f.slug,'referrer_id',l.referrer_id)
 from learning_share_links l left join zero_forms f on f.id=l.form_id where l.code=lower(p_code)
$$;

alter table public.bootcamp_referral_clicks add column if not exists share_link_code text references public.learning_share_links(code) on delete set null;
create unique index if not exists learning_share_visitor_once on public.bootcamp_referral_clicks(share_link_code,visitor_id) where share_link_code is not null;

create or replace function public.record_learning_referral(p_code text,p_seen_at timestamptz default now())
returns boolean language plpgsql security definer set search_path=public as $$
declare link jsonb; camp uuid; inviter uuid; seen timestamptz:=least(coalesce(p_seen_at,now()),now());
begin
 if auth.uid() is null then raise exception 'Sign in to record a referral'; end if;
 link:=resolve_learning_share_link(p_code);camp:=(link->>'bootcamp_id')::uuid;inviter:=(link->>'referrer_id')::uuid;
 if camp is null or inviter is null or inviter=auth.uid() or seen<=now()-interval '30 days' then return false; end if;
 insert into bootcamp_referral_clicks(bootcamp_id,referrer_id,visitor_id,created_at,expires_at,share_link_code)
 values(camp,inviter,auth.uid(),seen,seen+interval '30 days',lower(p_code))
 on conflict(share_link_code,visitor_id) where share_link_code is not null do update
 set created_at=greatest(bootcamp_referral_clicks.created_at,excluded.created_at),
     expires_at=greatest(bootcamp_referral_clicks.expires_at,excluded.expires_at),bootcamp_id=excluded.bootcamp_id;
 return true;
end $$;

revoke all on function public.create_learning_share_link(uuid,text),public.resolve_learning_share_link(text),public.record_learning_referral(text,timestamptz) from public,anon;
grant execute on function public.create_learning_share_link(uuid,text),public.record_learning_referral(text,timestamptz) to authenticated;
grant execute on function public.resolve_learning_share_link(text) to authenticated,anon;

-- Some installations already route Zero Form wallet payments through the
-- shared split. Upgrade the recognized legacy v2 body without replacing its
-- later capacity, pricing, enrolment or waitlist changes.
do $$
declare body text; old_credit text; old_debit text;
begin
 if to_regprocedure('public.submit_zero_form_v2(text,jsonb,text,jsonb)') is not null then
  body:=pg_get_functiondef('public.submit_zero_form_v2(text,jsonb,text,jsonb)'::regprocedure);
  if position('settle_bootcamp_payment' in body)=0 then
   old_credit:=substring(body from 'update\s+(?:public\.)?profiles\s+set\s+coins\s*=\s*coalesce\(coins,\s*0\)\s*\+\s*payable\s+where\s+id\s*=\s*form\.owner_id\s*;');
   if old_credit is null then raise exception 'Zero Form settlement needs review: unrecognized submit_zero_form_v2 owner credit. No changes applied.'; end if;
   body:=replace(body,old_credit,'if form.bootcamp_id is not null then perform public.settle_bootcamp_payment(form.bootcamp_id,caller,form.owner_id,payable,reference,false); else '||old_credit||' end if;');
   old_debit:=substring(body from 'update\s+(?:public\.)?profiles\s+set\s+coins\s*=\s*coins\s*-\s*payable\s+where\s+id\s*=\s*caller\s*;');
   if old_debit is not null then
    body:=replace(body,old_debit,'perform public.wallet_apply(caller,''debit'',payable,''zero_form'',''Bootcamp registration'',reference||'':buyer'',jsonb_build_object(''bootcamp_id'',form.bootcamp_id,''zero_form_id'',form.id));');
   end if;
   execute body;
  end if;
 end if;
end $$;
notify pgrst,'reload schema';
commit;
