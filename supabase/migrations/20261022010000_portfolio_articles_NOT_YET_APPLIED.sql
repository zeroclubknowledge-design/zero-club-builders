-- NOT YET APPLIED (the Supabase confirmation was cancelled on 2026-10-22).
-- Portfolio: Articles replace Highlights.
--
-- A portfolio shows the owner's shipped projects (Selected work) and, in the
-- section that used to hold highlighted posts, their published Articles
-- (Zero Notes with audience 'public'). Ordinary posts no longer appear.
--
-- portfolio_items gains note_id and the kind 'article'. Existing 'proof'
-- rows are kept untouched (nothing is deleted) but are no longer returned by
-- get_public_portfolio, and no new 'proof' rows can be added.

alter table public.portfolio_items alter column post_id drop not null;
alter table public.portfolio_items add column if not exists note_id uuid references public.notes(id) on delete cascade;

alter table public.portfolio_items drop constraint if exists portfolio_items_kind_check;
alter table public.portfolio_items add constraint portfolio_items_kind_check
  check (kind = any (array['project','proof','article']));
alter table public.portfolio_items drop constraint if exists portfolio_items_source_check;
alter table public.portfolio_items add constraint portfolio_items_source_check
  check ((kind = 'article' and note_id is not null and post_id is null)
      or (kind <> 'article' and post_id is not null and note_id is null));
create unique index if not exists portfolio_items_portfolio_note on public.portfolio_items(portfolio_id, note_id) where note_id is not null;

-- Owners add their own build posts as projects, or their own public articles.
drop policy if exists portfolio_items_owner_all on public.portfolio_items;
create policy portfolio_items_owner_all on public.portfolio_items for all to authenticated
  using (exists (select 1 from public.portfolios p where p.id = portfolio_items.portfolio_id and p.profile_id = auth.uid()))
  with check (
    exists (select 1 from public.portfolios p where p.id = portfolio_items.portfolio_id and p.profile_id = auth.uid())
    and (
      (kind = 'project' and exists (select 1 from public.posts po where po.id = portfolio_items.post_id
         and po.author_id = auth.uid() and coalesce(po.is_build_post, false)))
      or (kind = 'article' and exists (select 1 from public.notes n where n.id = portfolio_items.note_id
         and n.author_id = auth.uid() and n.is_published and coalesce(n.audience, 'public') = 'public'))
    )
  );

-- Covers: a post card uses one of the post's images; an article uses its own cover.
create or replace function public.guard_portfolio_item_cover()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if new.note_id is not null then
    new.cover_url := null;
  elsif new.cover_url is not null and not exists (
    select 1 from public.posts p where p.id = new.post_id and new.cover_url = any(coalesce(p.media_urls, '{}'))
  ) then
    raise exception 'The cover must be one of this post''s own images';
  end if;
  new.display_title := nullif(btrim(new.display_title), '');
  new.display_summary := nullif(btrim(new.display_summary), '');
  return new;
end $function$;

-- Plain text of an article, for excerpts and reading time.
create or replace function public.note_plain_text(p_blocks jsonb)
returns text language sql immutable set search_path to 'public' as $$
  select btrim(regexp_replace(regexp_replace(coalesce(string_agg(coalesce(b->>'content', b->>'text', ''), ' '), ''),
    '<[^>]+>', ' ', 'g'), '\s+', ' ', 'g'))
  from jsonb_array_elements(case when jsonb_typeof(p_blocks) = 'array' then p_blocks else '[]'::jsonb end) b
$$;

-- The owner's public articles, for the builder's picker.
create or replace function public.portfolio_article_candidates()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'title', n.title, 'slug', n.slug, 'cover_url', n.cover_url,
      'created_at', n.created_at, 'excerpt', left(public.note_plain_text(n.blocks), 220),
      'minutes', greatest(1, ceil(array_length(regexp_split_to_array(public.note_plain_text(n.blocks), '\s+'), 1) / 220.0)::int))
    order by n.created_at desc), '[]'::jsonb)
  from public.notes n
  where n.author_id = auth.uid() and n.is_published and coalesce(n.audience, 'public') = 'public'
$$;
revoke all on function public.portfolio_article_candidates() from public, anon;
grant execute on function public.portfolio_article_candidates() to authenticated;

create or replace function public.get_public_portfolio(p_username text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare prof public.profiles; pf public.portfolios; is_owner boolean; premium boolean; rc jsonb;
begin
  select * into prof from public.profiles where lower(username) = lower(btrim(p_username)) and coalesce(account_status,'active') <> 'suspended' limit 1;
  if not found then return jsonb_build_object('found', false); end if;
  select * into pf from public.portfolios where profile_id = prof.id;
  is_owner := auth.uid() is not null and auth.uid() = prof.id;
  if not found or (pf.status <> 'published' and not is_owner) then
    return jsonb_build_object('found', false);
  end if;
  -- Rate card (applied 2026-10-22): visitors of a non-PRO portfolio see tier 1 only.
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
                        and not public.portfolio_premium_allowed(prof.id) then 'minimal' else pf.template end,
      'stored_template', pf.template,
      'premium_active', public.portfolio_premium_allowed(prof.id),
      'show_branding', not (coalesce(pf.hide_branding, false) and public.portfolio_premium_allowed(prof.id)),
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
    -- Selected work only: ordinary highlighted posts are no longer shown.
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
      where i.portfolio_id = pf.id and i.kind = 'project' and coalesce(po.audience, 'everyone') = 'everyone'
    ), '[]'::jsonb),
    'articles', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'note_id', n.id, 'featured', i.featured, 'sort_order', i.sort_order,
        'title', coalesce(i.display_title, n.title), 'slug', n.slug, 'cover_url', n.cover_url, 'created_at', n.created_at,
        'excerpt', coalesce(i.display_summary, left(public.note_plain_text(n.blocks), 240)),
        'minutes', greatest(1, ceil(array_length(regexp_split_to_array(public.note_plain_text(n.blocks), '\s+'), 1) / 220.0)::int)
      ) order by i.featured desc, i.sort_order, i.created_at)
      from public.portfolio_items i join public.notes n on n.id = i.note_id
      where i.portfolio_id = pf.id and i.kind = 'article' and n.is_published and coalesce(n.audience, 'public') = 'public'
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
      'proofs', 0,
      'articles', (select count(*) from public.notes where author_id = prof.id and is_published and coalesce(audience, 'public') = 'public'),
      'xp', coalesce(prof.xp, 0)));
end;
$function$;

notify pgrst, 'reload schema';
