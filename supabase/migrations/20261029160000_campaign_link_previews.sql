begin;

-- Share only the public campaign artwork and copy. Never expose members,
-- commissions, proof, review notes or the ambassador's private account data.
create or replace function public.zs_campaign_link_preview(p_code text)
returns jsonb language sql stable security definer set search_path = public
as $$
  select coalesce((
    select jsonb_build_object('found',true,'title',c.title,'summary',c.summary,
      'description',c.description,'cover_url',c.cover_url)
    from public.zs_campaign_members m
    join public.zs_amb_campaigns c on c.id=m.campaign_id
    where m.code=upper(btrim(p_code)) and c.status in ('live','ended')
    limit 1
  ),jsonb_build_object('found',false));
$$;
revoke all on function public.zs_campaign_link_preview(text) from public;
grant execute on function public.zs_campaign_link_preview(text) to anon, authenticated;
notify pgrst,'reload schema';
commit;
