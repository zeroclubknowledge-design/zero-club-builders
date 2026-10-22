-- APPLIED 2026-10-22 (migration name: portfolio_rate_card). The applied version adds the
-- constraint and trigger only when missing ("if not exists" blocks) instead of re-creating them;
-- the result is the same on this database.
--
-- Portfolio rate card:
-- 1. portfolios.rate_card jsonb — { currency, note, tiers: [{ id, name, price, unit, from, custom,
--    summary, features[], turnaround, highlight }] }, max 4 tiers, ~20 KB.
-- 2. trigger portfolios_rate_card_guard: more than one tier needs portfolio_premium_allowed();
--    a lapsed member may still edit tier 1 as long as tiers 2+ are unchanged.
-- 3. get_public_portfolio: visitors of a non-PRO portfolio get tier 1 only (no "highlight");
--    the owner always gets the full stored card back.

alter table public.portfolios add column if not exists rate_card jsonb;

alter table public.portfolios drop constraint if exists portfolios_rate_card_check;
alter table public.portfolios add constraint portfolios_rate_card_check check (
  rate_card is null or (
    jsonb_typeof(rate_card) = 'object'
    and jsonb_typeof(coalesce(rate_card->'tiers', '[]'::jsonb)) = 'array'
    and jsonb_array_length(coalesce(rate_card->'tiers', '[]'::jsonb)) <= 4
    and pg_column_size(rate_card) <= 20000
  )
);

create or replace function public.guard_portfolio_rate_card()
returns trigger language plpgsql set search_path to 'public' as $function$
declare new_tiers jsonb := coalesce(new.rate_card->'tiers', '[]'::jsonb);
        old_tiers jsonb;
begin
  if current_user <> 'authenticated' or jsonb_array_length(new_tiers) <= 1 then
    return new;
  end if;
  old_tiers := case when tg_op = 'UPDATE' then coalesce(old.rate_card->'tiers', '[]'::jsonb) else '[]'::jsonb end;
  if (new_tiers - 0) is distinct from (old_tiers - 0)
     and not public.portfolio_premium_allowed(new.profile_id) then
    raise exception 'PREMIUM_RATE_CARD_REQUIRED'
      using hint = 'More than one rate on a rate card needs an active Zero Club membership.';
  end if;
  return new;
end $function$;

drop trigger if exists portfolios_rate_card_guard on public.portfolios;
create trigger portfolios_rate_card_guard before insert or update of rate_card on public.portfolios
  for each row execute function public.guard_portfolio_rate_card();

create or replace function public.get_public_portfolio(p_username text)
 returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare prof public.profiles; pf public.portfolios; is_owner boolean; premium boolean; rc jsonb;
begin
  select * into prof from public.profiles where lower(username) = lower(btrim(p_username)) and coalesce(account_status,'active') <> 'suspended' limit 1;
  if not found then return jsonb_build_object('found', false); end if;
  select * into pf from public.portfolios where profile_id = prof.id;
  is_owner := auth.uid() is not null and auth.uid() = prof.id;
  if not found or (pf.status <> 'published' and not is_owner) then
    return jsonb_build_object('found', false);
  end if;
  premium := public.portfolio_premium_allowed(prof.id);
  rc := pf.rate_card;
  if rc is not null and not premium and jsonb_array_length(coalesce(rc->'tiers','[]'::jsonb)) > 0 then
    rc := jsonb_set(rc, '{tiers}', jsonb_build_array((rc->'tiers'->0) - 'highlight'));
  end if;
  return jsonb_build_object(
    'found', true, 'is_owner', is_owner,
    'profile', jsonb_build_object(
      'id', prof.id, 'username', prof.username, 'full_name', prof.full_name, 'avatar_url', prof.avatar_url,
      'banner_url', prof.banner_url, 'bio', prof.bio, 'location', prof.location, 'website', prof.website,
      'social_links', prof.social_links, 'xp', prof.xp, 'account_type', prof.account_type, 'interests', prof.interests),
    'portfolio', (to_jsonb(pf) - 'profile_id') || jsonb_build_object(
      'template', case when pf.template in ('signal','spotlight','statement','bright','gallery')
                        and not premium then 'minimal' else pf.template end,
      'stored_template', pf.template,
      'premium_active', premium,
      'show_branding', not (coalesce(pf.hide_branding, false) and premium),
      'rate_card', case when is_owner then pf.rate_card else rc end),
    'shipped', coalesce((
      select jsonb_agg(jsonb_build_object('id', po.id, 'content', po.content, 'media_urls', po.media_urls,
          'likes_count', po.likes_count, 'comments_count', po.comments_count, 'created_at', po.created_at,
          'is_build_post', po.is_build_post, 'is_verified_build', po.is_verified_build, 'version_label', po.version_label,
          'versions', (select count(*) from public.posts v where v.project_root_id = po.id and coalesce(v.audience,'everyone') = 'everyone'))
        order by po.created_at desc)
      from (select * from public.portfolio_projects(prof.id) p2 order by p2.created_at desc limit 60) po
    ), '[]'::jsonb),
    'achievements', coalesce((
      select jsonb_agg(a order by a->>'at' desc) from (
        select jsonb_build_object('kind', 'challenge', 'title', c.title, 'place', e.place,
          'label', case e.place when 1 then 'Won' when 2 then '2nd place' else '3rd place' end,
          'at', coalesce(c.completed_at, c.finalized_at, c.updated_at), 'ref', c.id) as a
        from public.challenge_entries e join public.challenges c on c.id = e.challenge_id
        where e.entrant_id = prof.id and e.status = 'winner' and c.status = 'completed'
        union all
        select jsonb_build_object('kind', 'zero_games', 'title', t.title, 'place', w.place,
          'label', coalesce(nullif(w.label, ''), case w.place when 1 then '1st place' when 2 then '2nd place' when 3 then '3rd place' else 'Top ' || w.place end),
          'at', w.created_at, 'ref', t.id) as a
        from public.zero_tournament_awards w join public.zero_tournaments t on t.id = w.tournament_id
        where w.profile_id = prof.id and t.visibility = 'public'
        limit 24
      ) s), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'kind', i.kind, 'featured', i.featured, 'sort_order', i.sort_order,
        'problem', i.problem, 'outcome', i.outcome,
        'display_title', i.display_title, 'display_summary', i.display_summary, 'cover_url', i.cover_url,
        'post', jsonb_build_object('id', po.id, 'content', po.content, 'media_urls', po.media_urls,
          'likes_count', po.likes_count, 'comments_count', po.comments_count, 'created_at', po.created_at,
          'is_build_post', po.is_build_post, 'is_verified_build', po.is_verified_build, 'version_label', po.version_label,
          'versions', (select count(*) from public.posts v where v.project_root_id = po.id and coalesce(v.audience,'everyone') = 'everyone'))
      ) order by i.featured desc, i.sort_order, i.created_at)
      from public.portfolio_items i join public.posts po on po.id = i.post_id
      where i.portfolio_id = pf.id and coalesce(po.audience, 'everyone') = 'everyone'
    ), '[]'::jsonb),
    'experiences', coalesce((select jsonb_agg(to_jsonb(e) - 'profile_id' order by e.is_current desc, e.start_date desc)
      from public.profile_experiences e where e.profile_id = prof.id), '[]'::jsonb),
    'certificates', coalesce((select jsonb_agg(to_jsonb(c) - 'profile_id' order by c.issued_on desc nulls last)
      from public.profile_certificates c where c.profile_id = prof.id), '[]'::jsonb),
    'learning', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'title', b.title, 'category', b.category,
        'banner_url', b.banner_url, 'enrolled_at', en.enrolled_at) order by en.enrolled_at desc)
      from public.enrollments en join public.bootcamps b on b.id = en.bootcamp_id
      where en.profile_id = prof.id and coalesce(b.visibility, true)), '[]'::jsonb),
    'stats', jsonb_build_object(
      'ships', (select count(*) from public.portfolio_projects(prof.id)),
      'verified', (select count(*) from public.posts where author_id = prof.id and is_build_post and is_verified_build),
      'proofs', (select count(*) from public.posts where author_id = prof.id and coalesce(audience,'everyone') = 'everyone'),
      'xp', coalesce(prof.xp, 0)));
end;
$function$;
