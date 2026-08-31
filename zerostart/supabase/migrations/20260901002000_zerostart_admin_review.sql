-- ============================================================================
-- The missing link in the chain.
--
-- The core schema deliberately refuses to let a builder move their own MVP to
-- 'approved' or 'live' — that is an admin decision, and the RLS check enforces
-- it. But nothing yet gave an admin a way to make that decision, so an MVP
-- submitted for review could never leave the queue.
--
-- Admin is not redefined here. `is_zero_club_admin()` already exists and is
-- already carrying Zero Club's traffic; a second definition would be a second
-- thing to keep in sync, and the two would eventually disagree.
-- ============================================================================

create or replace function public.zs_review_mvp(
  p_mvp_id uuid,
  p_approve boolean,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  mvp public.zs_mvps;
begin
  if not public.is_zero_club_admin() then
    return jsonb_build_object('ok', false, 'reason', 'not_admin');
  end if;

  select * into mvp from public.zs_mvps where id = p_mvp_id for update;

  if mvp.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- Only a submission is reviewable. Re-approving something already live is a
  -- no-op worth reporting rather than performing.
  if mvp.status <> 'pending_review' then
    return jsonb_build_object('ok', false, 'reason', 'not_pending');
  end if;

  update public.zs_mvps
  set status = case when p_approve then 'approved' else 'rejected' end,
      review_note = p_note,
      updated_at = now()
  where id = p_mvp_id;

  return jsonb_build_object('ok', true, 'approved', p_approve);
end;
$$;

grant execute on function public.zs_review_mvp(uuid, boolean, text) to authenticated;

/*
 * Featuring, which is also an admin-only lever. Separate from approval on
 * purpose: an MVP can be perfectly fine without being the one on the front
 * page, and conflating the two would mean the only way to unfeature something
 * is to un-approve it.
 */
create or replace function public.zs_set_mvp_featured(p_mvp_id uuid, p_featured boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_zero_club_admin() then
    return jsonb_build_object('ok', false, 'reason', 'not_admin');
  end if;

  update public.zs_mvps
  set is_featured = p_featured, updated_at = now()
  where id = p_mvp_id and status in ('approved','live','completed');

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  return jsonb_build_object('ok', true, 'featured', p_featured);
end;
$$;

grant execute on function public.zs_set_mvp_featured(uuid, boolean) to authenticated;

/*
 * The admin queue itself.
 *
 * A plain select would be blocked by the read policy, which only exposes
 * approved-or-later MVPs and your own. Rather than widening that policy — and
 * so widening what every query can see — the queue is a function that checks
 * for admin first and returns nothing to everyone else.
 */
create or replace function public.zs_pending_mvps()
returns setof public.zs_mvps
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_zero_club_admin() then
    return;
  end if;

  return query
    select * from public.zs_mvps
    where status = 'pending_review'
    order by created_at asc;
end;
$$;

grant execute on function public.zs_pending_mvps() to authenticated;

notify pgrst, 'reload schema';
