-- ===========================================================================
-- Editable campaigns, and the product page's numbers.
--
-- The policies already let a builder update their own campaign — it is
-- "for all". What they do not do is protect the people who already joined it,
-- and that is the part that has to be right before editing is offered at all.
-- ===========================================================================

/*
 * A tester takes a seat on the strength of a stated reward. Letting the
 * builder lower it afterwards would mean the deal on offer is not the deal
 * being honoured, and the tester has already spent the time by then.
 *
 * This lives in a trigger rather than the form because it is a promise, not a
 * validation. A disabled input is a courtesy; a trigger is the actual rule,
 * and it holds whatever sends the request.
 */
create or replace function public.zs_guard_campaign_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  taken integer;
begin
  select count(*) into taken
  from public.zs_participations
  where campaign_id = new.id and status in ('started','submitted','approved');

  if taken = 0 then
    -- Nobody has committed anything yet, so anything may still change.
    return new;
  end if;

  if new.zp_reward < old.zp_reward then
    raise exception
      'Cannot lower the reward: % tester(s) already joined at % ZP.', taken, old.zp_reward
      using errcode = 'check_violation';
  end if;

  if new.tester_limit < taken then
    raise exception
      'Cannot set the limit below % — that many testers already hold a seat.', taken
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists zs_campaigns_guard_edit on public.zs_campaigns;
create trigger zs_campaigns_guard_edit
  before update on public.zs_campaigns
  for each row
  when (old.zp_reward is distinct from new.zp_reward
     or old.tester_limit is distinct from new.tester_limit)
  execute function public.zs_guard_campaign_edit();

/*
 * Deleting a task somebody has already ticked would silently rewrite what they
 * agreed to do, and their completed_task_ids would point at nothing. Editing
 * the wording is fine; removing the task is not.
 */
create or replace function public.zs_guard_task_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.zs_participations
    where campaign_id = old.campaign_id and old.id = any(completed_task_ids)
  ) then
    raise exception 'Cannot remove a task that testers have already completed.'
      using errcode = 'check_violation';
  end if;
  return old;
end;
$$;

drop trigger if exists zs_tasks_guard_delete on public.zs_tasks;
create trigger zs_tasks_guard_delete
  before delete on public.zs_tasks
  for each row
  execute function public.zs_guard_task_delete();

-- ------------------------------------------------------- the product page ---

/*
 * Everything the product page shows, in one call.
 *
 * The ranks are the reason this is a function rather than a query. Working out
 * "#24 of 41 in Productivity" from the client would mean fetching every live
 * MVP in the category and counting locally — fine at 41, useless at 4,100.
 *
 * Rank is by the best reward the product is currently offering. That is the
 * number a tester is choosing on, so it is the honest thing to be ranked by.
 */
create or replace function public.zs_mvp_overview(p_mvp_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  mvp public.zs_mvps;
  best integer;
  result jsonb;
begin
  select * into mvp from public.zs_mvps where id = p_mvp_id;
  if mvp.id is null then
    return jsonb_build_object('found', false);
  end if;

  select coalesce(max(zp_reward), 0) into best
  from public.zs_campaigns
  where mvp_id = p_mvp_id and status = 'live';

  with live as (
    select m.id, m.category, coalesce(max(c.zp_reward), 0) as best_zp
    from public.zs_mvps m
    left join public.zs_campaigns c on c.mvp_id = m.id and c.status = 'live'
    where m.status in ('approved','live','completed')
    group by m.id, m.category
  )
  select jsonb_build_object(
    'found', true,
    'zp_offered', best,
    'overall_rank', (select count(*) + 1 from live where best_zp > best),
    'overall_total', (select count(*) from live),
    'category_rank', (
      select count(*) + 1 from live
      where category = mvp.category and best_zp > best
    ),
    'category_total', (select count(*) from live where category = mvp.category),
    'campaigns', (
      select count(*) from public.zs_campaigns where mvp_id = p_mvp_id and status = 'live'
    ),
    'testers', (
      select count(*) from public.zs_participations p
      join public.zs_campaigns c on c.id = p.campaign_id
      where c.mvp_id = p_mvp_id
    ),
    'tests_approved', (
      select count(*) from public.zs_participations p
      join public.zs_campaigns c on c.id = p.campaign_id
      where c.mvp_id = p_mvp_id and p.status = 'approved'
    ),
    'feedback_count', (
      -- The count only. What anyone actually wrote stays between the tester
      -- and the builder.
      select count(*) from public.zs_feedback f
      join public.zs_participations p on p.id = f.participation_id
      join public.zs_campaigns c on c.id = p.campaign_id
      where c.mvp_id = p_mvp_id
    ),
    'average_rating', (
      select round(avg(f.overall_rating)::numeric, 1) from public.zs_feedback f
      join public.zs_participations p on p.id = f.participation_id
      join public.zs_campaigns c on c.id = p.campaign_id
      where c.mvp_id = p_mvp_id and p.status = 'approved'
    ),
    'zp_paid', (
      select coalesce(sum(c.zp_reward), 0) from public.zs_participations p
      join public.zs_campaigns c on c.id = p.campaign_id
      where c.mvp_id = p_mvp_id and p.status = 'approved'
    )
  ) into result;

  return result;
end;
$$;

grant execute on function public.zs_mvp_overview(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
