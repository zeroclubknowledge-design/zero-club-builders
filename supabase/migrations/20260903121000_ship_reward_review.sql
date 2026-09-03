-- ===========================================================================
-- Shipped projects are reviewed by a person, then rewarded.
--
-- This is the replacement for the automatic 50 ZP, and it is meant to be
-- temporary: when Zero AI can look at a build post and judge whether something
-- was genuinely shipped, this queue becomes its input rather than a human's.
-- Until then the decision has a name attached to it.
-- ===========================================================================

/*
 * One row per decision, approved or not.
 *
 * A rejected post has to be recorded rather than simply left unapproved, or it
 * comes back to the top of the queue forever and every reviewer re-reads it.
 */
create table if not exists public.ship_reward_reviews (
  post_id uuid primary key references public.posts(id) on delete cascade,
  reviewed_by uuid not null references public.profiles(id),
  approved boolean not null,
  note text,
  zp_awarded integer not null default 0,
  reviewed_at timestamptz not null default now()
);

alter table public.ship_reward_reviews enable row level security;

/* Authors can see the decision on their own post; admins see everything.
   Nobody writes to this table directly — the functions below do. */
drop policy if exists ship_reward_reviews_read on public.ship_reward_reviews;
create policy ship_reward_reviews_read on public.ship_reward_reviews for select to authenticated
  using (
    public.is_zero_club_admin()
    or exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid())
  );

create index if not exists ship_reward_reviews_reviewed_idx
  on public.ship_reward_reviews (reviewed_at desc);

/*
 * The queue: build posts nobody has ruled on yet.
 *
 * A function rather than a view with a policy, because the posts themselves
 * are readable by everyone — it is the *review status* that is admin-only, and
 * that distinction is easier to keep right in one place than spread across
 * policies on two tables.
 */
create or replace function public.zc_pending_ship_rewards(p_limit integer default 50)
returns table (
  post_id uuid,
  author_id uuid,
  author_name text,
  author_username text,
  author_avatar text,
  content text,
  created_at timestamptz
)
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
    select p.id, p.author_id,
           coalesce(nullif(btrim(pr.full_name), ''), pr.username, 'A builder'),
           pr.username, pr.avatar_url, p.content, p.created_at
    from public.posts p
    join public.profiles pr on pr.id = p.author_id
    where coalesce(p.is_build_post, false)
      and not exists (select 1 from public.ship_reward_reviews r where r.post_id = p.id)
    order by p.created_at asc
    limit greatest(1, least(coalesce(p_limit, 50), 200));
end;
$$;

grant execute on function public.zc_pending_ship_rewards(integer) to authenticated;

/*
 * The decision.
 *
 * Pays through award_profile_zp like everything else, keyed on the post id, so
 * a double click cannot pay twice even if the review row were somehow missing.
 * The reward amount is a parameter with a 50 default rather than a constant, so
 * changing what a ship is worth does not need a migration.
 */
create or replace function public.zc_review_ship_reward(
  p_post_id uuid,
  p_approve boolean,
  p_note text default null,
  p_amount integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  reviewer uuid := auth.uid();
  post public.posts%rowtype;
  paid boolean := false;
  amount integer := greatest(0, least(coalesce(p_amount, 50), 100000));
begin
  if not public.is_zero_club_admin() then
    return jsonb_build_object('ok', false, 'reason', 'not_admin');
  end if;

  select * into post from public.posts where id = p_post_id for update;
  if post.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if not coalesce(post.is_build_post, false) then
    return jsonb_build_object('ok', false, 'reason', 'not_a_build_post');
  end if;

  -- Already ruled on. Report the decision rather than repeat it.
  if exists (select 1 from public.ship_reward_reviews where post_id = p_post_id) then
    return jsonb_build_object('ok', false, 'reason', 'already_reviewed');
  end if;

  if p_approve then
    paid := public.award_profile_zp(
      post.author_id, 'ship_reward', p_post_id::text, amount,
      jsonb_build_object('post_id', p_post_id, 'reviewed_by', reviewer)
    );
  end if;

  insert into public.ship_reward_reviews (post_id, reviewed_by, approved, note, zp_awarded)
  values (p_post_id, reviewer, p_approve, p_note, case when paid then amount else 0 end);

  return jsonb_build_object(
    'ok', true,
    'approved', p_approve,
    'zp_awarded', case when paid then amount else 0 end
  );
end;
$$;

grant execute on function public.zc_review_ship_reward(uuid, boolean, text, integer) to authenticated;

notify pgrst, 'reload schema';
