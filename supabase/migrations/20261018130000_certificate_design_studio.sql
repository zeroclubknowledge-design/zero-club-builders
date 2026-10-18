begin;
alter table public.bootcamps add column if not exists certificate_design jsonb;
alter table public.bootcamp_certificates add column if not exists design_snapshot jsonb;
create table if not exists public.certificate_design_defaults (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  design jsonb not null, updated_at timestamptz not null default now()
);
alter table public.certificate_design_defaults enable row level security;
revoke all on public.certificate_design_defaults from public,anon,authenticated;

create or replace function public.certificate_can_brand(owner_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select coalesce((select is_admin or lower(account_type)='institution' or
   (lower(account_type)='tutor' and public.zero_club_plan_key(id) in ('tutor_premium','tutor_premium_plus'))
   from profiles where id=owner_id),false)
$$;
create or replace function public.validate_certificate_design(owner_id uuid, design jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare asset text; owner_avatar text;
begin
 if not exists(select 1 from profiles where id=owner_id and (is_admin or lower(account_type) in ('tutor','institution'))) then raise exception 'Certificates are for Tutors and organizations'; end if;
 if design is null or jsonb_typeof(design)<>'object' or octet_length(design::text)>16000 or coalesce(design->>'template','') not in ('folio','cobalt','spectrum','coral','mosaic','orbit') then raise exception 'Choose a certificate template'; end if;
 if jsonb_typeof(design->'use_brand') is distinct from 'boolean' then raise exception 'Choose a branding option'; end if;
 if nullif(btrim(design->>'signer_name'),'') is null or length(design->>'signer_name')>80 or length(coalesce(design->>'signer_title',''))>80 or length(coalesce(design->>'back_text',''))>400 then raise exception 'Add a signatory name and keep certificate text within its limits'; end if;
 if coalesce(design->>'signature_url','') !~ ('^https://[^/]+/storage/v1/object/public/certificate-assets/'||owner_id||'/signature-[a-f0-9-]+\.png$') then raise exception 'Draw or upload your transparent PNG signature'; end if;
 asset:=split_part(design->>'signature_url','/certificate-assets/',2);
 if not exists(select 1 from storage.objects where bucket_id='certificate-assets' and name=asset) then raise exception 'Signature upload not found'; end if;
 if (design->>'use_brand')::boolean then
   if auth.uid()=owner_id then perform public.refresh_my_subscription_lifecycle(); end if;
   if not public.certificate_can_brand(owner_id) then raise exception 'Custom branding requires an organization account, Tutor Pro or Tutor Max'; end if;
   if nullif(btrim(design->>'brand_name'),'') is null or length(design->>'brand_name')>80 then raise exception 'Add your brand name'; end if;
   select avatar_url into owner_avatar from profiles where id=owner_id;
   if nullif(design->>'brand_logo','') is null then raise exception 'Upload your brand logo'; end if;
   if design->>'brand_logo' is distinct from owner_avatar then
     if design->>'brand_logo' !~ ('^https://[^/]+/storage/v1/object/public/certificate-assets/'||owner_id||'/logo-[a-f0-9-]+\.(png|jpg|webp)$') then raise exception 'Choose your own uploaded brand logo'; end if;
     asset:=split_part(design->>'brand_logo','/certificate-assets/',2);
     if not exists(select 1 from storage.objects where bucket_id='certificate-assets' and name=asset) then raise exception 'Brand logo upload not found'; end if;
   end if;
 end if;
end $$;

create or replace function public.get_my_certificate_studio() returns jsonb
language plpgsql security definer set search_path=public as $$
declare p public.profiles; design jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in to open Certifications'; end if;
 perform public.refresh_my_subscription_lifecycle();
 select * into p from profiles where id=auth.uid();
 select d.design into design from certificate_design_defaults d where profile_id=auth.uid();
 return jsonb_build_object('can_manage',coalesce(p.is_admin or lower(p.account_type) in ('tutor','institution'),false),'account_type',p.account_type,'can_brand',public.certificate_can_brand(auth.uid()),'defaults',design,'issuer_name',coalesce(nullif(p.full_name,''),p.username,'Instructor'),'logo',p.avatar_url);
end $$;
create or replace function public.save_certificate_defaults(p_design jsonb) returns void
language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'Sign in to save your certificate design'; end if;
 perform public.validate_certificate_design(auth.uid(),p_design);
 insert into certificate_design_defaults(profile_id,design) values(auth.uid(),p_design)
 on conflict(profile_id) do update set design=excluded.design,updated_at=now();
end $$;

create or replace function public.enforce_bootcamp_certificate_design() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if tg_op='UPDATE' then
   if new.certificate_design is not distinct from old.certificate_design and not (new.certificate_enabled is not false and old.certificate_enabled=false) then return new; end if;
   if auth.uid() is distinct from old.creator_id then raise exception 'Only the bootcamp creator can change its certificate design'; end if;
   if old.certificate_design is not null and new.certificate_design is null and new.certificate_enabled is not false then raise exception 'Choose a certificate template and signature before removing the current design'; end if;
 end if;
 if new.certificate_design is not null or (new.certificate_enabled is not false and (tg_op='INSERT' or old.certificate_enabled=false)) then
   if auth.uid() is distinct from new.creator_id then raise exception 'Only the bootcamp creator can choose its certificate design'; end if;
   perform public.validate_certificate_design(new.creator_id,new.certificate_design);
 end if;
 return new;
end $$;
drop trigger if exists bootcamp_certificate_design_guard on public.bootcamps;
create trigger bootcamp_certificate_design_guard before insert or update on public.bootcamps for each row execute function public.enforce_bootcamp_certificate_design();

create or replace function public.snapshot_bootcamp_certificate_design() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if tg_op='UPDATE' then
   if new.design_snapshot is distinct from old.design_snapshot then raise exception 'Issued certificate designs cannot be changed'; end if;
 else
   select certificate_design into new.design_snapshot from bootcamps where id=new.bootcamp_id;
 end if;
 return new;
end $$;
drop trigger if exists certificate_design_snapshot on public.bootcamp_certificates;
create trigger certificate_design_snapshot before insert or update on public.bootcamp_certificates for each row execute function public.snapshot_bootcamp_certificate_design();

-- Keep the native public verification rules and its existing response fields.
create or replace function public.get_bootcamp_certificate_v2(p_code text) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare result jsonb; design jsonb;
begin
 result:=to_jsonb(public.get_bootcamp_certificate(p_code));
 if result is null then return null; end if;
 select design_snapshot into design from bootcamp_certificates where upper(code)=upper(btrim(p_code));
 return result||jsonb_build_object('design',design);
end $$;
revoke all on function public.certificate_can_brand(uuid),public.validate_certificate_design(uuid,jsonb),public.enforce_bootcamp_certificate_design(),public.snapshot_bootcamp_certificate_design() from public,anon,authenticated;
revoke all on function public.get_my_certificate_studio(),public.save_certificate_defaults(jsonb) from public,anon;
grant execute on function public.get_my_certificate_studio(),public.save_certificate_defaults(jsonb) to authenticated;
revoke all on function public.get_bootcamp_certificate_v2(text) from public;
grant execute on function public.get_bootcamp_certificate_v2(text) to anon,authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('certificate-assets','certificate-assets',true,2097152,array['image/png','image/jpeg','image/webp']) on conflict(id) do nothing;
drop policy if exists certificate_assets_insert_own on storage.objects;
create policy certificate_assets_insert_own on storage.objects for insert to authenticated with check(bucket_id='certificate-assets' and (storage.foldername(name))[1]=auth.uid()::text and exists(select 1 from profiles where id=auth.uid() and (is_admin or lower(account_type) in ('tutor','institution'))));
-- Restrictive policies also protect this bucket from older broad storage rules.
drop policy if exists certificate_assets_insert_guard on storage.objects;
create policy certificate_assets_insert_guard on storage.objects as restrictive for insert to authenticated with check(bucket_id<>'certificate-assets' or ((storage.foldername(name))[1]=auth.uid()::text and exists(select 1 from profiles where id=auth.uid() and (is_admin or lower(account_type) in ('tutor','institution')))));
drop policy if exists certificate_assets_no_update on storage.objects;
create policy certificate_assets_no_update on storage.objects as restrictive for update to authenticated using(bucket_id<>'certificate-assets') with check(bucket_id<>'certificate-assets');
drop policy if exists certificate_assets_no_delete on storage.objects;
create policy certificate_assets_no_delete on storage.objects as restrictive for delete to authenticated using(bucket_id<>'certificate-assets');
notify pgrst,'reload schema';
commit;
