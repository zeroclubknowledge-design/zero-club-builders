begin;
-- Certificates can carry the issuer's own identity: logo, name and now a
-- colour. Keep the existing validator and only add the colour rule, so every
-- other requirement (signature, template, branding entitlement) is unchanged.
create or replace function public.validate_certificate_design(owner_id uuid, design jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare asset text; owner_avatar text; accent text;
begin
 if not exists(select 1 from profiles where id=owner_id and (is_admin or lower(account_type) in ('tutor','institution'))) then raise exception 'Certificates are for Tutors and organizations'; end if;
 if design is null or jsonb_typeof(design)<>'object' or octet_length(design::text)>16000 or coalesce(design->>'template','') not in ('folio','cobalt','spectrum','coral','mosaic','orbit') then raise exception 'Choose a certificate template'; end if;
 if jsonb_typeof(design->'use_brand') is distinct from 'boolean' then raise exception 'Choose a branding option'; end if;
 if nullif(btrim(design->>'signer_name'),'') is null or length(design->>'signer_name')>80 or length(coalesce(design->>'signer_title',''))>80 or length(coalesce(design->>'back_text',''))>400 then raise exception 'Add a signatory name and keep certificate text within its limits'; end if;
 if coalesce(design->>'signature_url','') !~ ('^https://[^/]+/storage/v1/object/public/certificate-assets/'||owner_id||'/signature-[a-f0-9-]+\.png$') then raise exception 'Draw or upload your transparent PNG signature'; end if;
 asset:=split_part(design->>'signature_url','/certificate-assets/',2);
 if not exists(select 1 from storage.objects where bucket_id='certificate-assets' and name=asset) then raise exception 'Signature upload not found'; end if;
 -- Optional on designs saved before brand colours existed, so those stay valid.
 accent:=nullif(btrim(coalesce(design->>'brand_accent','')),'');
 if accent is not null and accent !~* '^#[0-9a-f]{6}$' then raise exception 'Choose a valid brand colour'; end if;
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
revoke all on function public.validate_certificate_design(uuid,jsonb) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
