-- ===========================================================================
-- Ambassadors propose their own work.
--
-- The task list is what Zero Club asks for. This is the other direction: an
-- ambassador who can see an opportunity in their own place — a brand worth
-- partnering with, a course worth pushing, a room full of people worth
-- inviting — commits to it here.
--
-- One review, not two. They commit and do the work, then submit what happened
-- and an admin sets the reward against what was actually achieved. A greenlight
-- step in the middle would put every idea behind a queue, which is exactly the
-- friction that stops people bothering.
-- ===========================================================================

create table if not exists public.zs_initiatives (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.zs_ambassadors(profile_id) on delete cascade,

  -- Which growth lever this belongs to, so it can be counted with the rest.
  focus_slug text not null references public.zs_focus_areas(slug),

  -- What shape of thing it is. Free-ish, but a fixed set keeps the admin
  -- queue readable and lets Zero Club see what ambassadors actually reach for.
  kind text not null default 'project'
    check (kind in ('project','market_course','invite','partnership','event','content','chapter','other')),

  title text not null check (length(btrim(title)) between 4 and 120),
  description text not null check (length(btrim(description)) between 15 and 2000),

  /* An optional number they are aiming at — people invited, signups, seats
     filled. Optional because "partner with a brand" has no count. */
  target_count integer check (target_count is null or target_count between 1 and 1000000),
  target_label text,

  status text not null default 'active'
    check (status in ('active','submitted','completed','rejected','abandoned')),

  -- Filled in when they submit.
  result_summary text,
  result_count integer,
  evidence_url text,

  zp_awarded integer not null default 0,
  reviewed_by uuid references public.profiles(id),
  review_note text,

  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  reviewed_at timestamptz
);

create index if not exists zs_initiatives_mine_idx
  on public.zs_initiatives (profile_id, created_at desc);
create index if not exists zs_initiatives_queue_idx
  on public.zs_initiatives (status, submitted_at);

alter table public.zs_initiatives enable row level security;

/* Visible to the ambassador who owns it and to admins. Not public: a plan that
   has not happened yet is not something to broadcast. */
drop policy if exists zs_initiatives_read on public.zs_initiatives;
create policy zs_initiatives_read on public.zs_initiatives for select to authenticated
  using (profile_id = auth.uid() or public.is_zero_club_admin());

/* They create their own, always starting active — the status column is not
   theirs to set, or an initiative could be born 'completed'. */
drop policy if exists zs_initiatives_create on public.zs_initiatives;
create policy zs_initiatives_create on public.zs_initiatives for insert to authenticated
  with check (profile_id = auth.uid() and status = 'active' and zp_awarded = 0);

/* They may edit or abandon their own, up until it is submitted. */
drop policy if exists zs_initiatives_own_update on public.zs_initiatives;
create policy zs_initiatives_own_update on public.zs_initiatives for update to authenticated
  using (profile_id = auth.uid() and status in ('active'))
  with check (profile_id = auth.uid() and status in ('active','abandoned') and zp_awarded = 0);

-- ------------------------------------------------------------ submitting ---
/*
 * Handing it in.
 *
 * A function rather than a policy-permitted update, because moving to
 * 'submitted' has to be one-way: an ambassador editing their own row back out
 * of the review queue after an admin has started reading it is not a state
 * anyone wants to reason about.
 */
create or replace function public.zs_submit_initiative(
  p_id uuid,
  p_summary text,
  p_count integer default null,
  p_evidence_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  row public.zs_initiatives;
begin
  if caller is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if length(btrim(coalesce(p_summary, ''))) < 15 then
    return jsonb_build_object('ok', false, 'reason', 'summary_required');
  end if;

  select * into row from public.zs_initiatives where id = p_id for update;
  if row.id is null or row.profile_id <> caller then
    return jsonb_build_object('ok', false, 'reason', 'not_yours');
  end if;
  if row.status <> 'active' then
    return jsonb_build_object('ok', false, 'reason', 'already_submitted');
  end if;

  update public.zs_initiatives
  set status = 'submitted',
      result_summary = btrim(p_summary),
      result_count = p_count,
      evidence_url = nullif(btrim(coalesce(p_evidence_url, '')), ''),
      submitted_at = now()
  where id = p_id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.zs_submit_initiative(uuid, text, integer, text) to authenticated;

-- -------------------------------------------------------------- reviewing ---
/*
 * The sign-off, and the only place an initiative pays.
 *
 * The reward is set here rather than when the initiative was created, because
 * the admin is judging what actually happened. "Invite 50 people" that brought
 * 12 is worth something, but not what 50 would have been — and deciding that
 * up front means either paying for the promise or renegotiating afterwards.
 */
create or replace function public.zs_review_initiative(
  p_id uuid,
  p_approve boolean,
  p_amount integer default 0,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  reviewer uuid := auth.uid();
  row public.zs_initiatives;
  amount integer := greatest(0, least(coalesce(p_amount, 0), 100000));
  paid boolean := false;
begin
  if not public.is_zero_club_admin() then
    return jsonb_build_object('ok', false, 'reason', 'not_admin');
  end if;

  select * into row from public.zs_initiatives where id = p_id for update;
  if row.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if row.status <> 'submitted' then
    return jsonb_build_object('ok', false, 'reason',
      case row.status when 'completed' then 'already_completed'
                      when 'rejected'  then 'already_rejected'
                      else 'not_submitted' end);
  end if;

  if p_approve and amount > 0 then
    -- Same ledger as everything else, keyed on the initiative id, so a second
    -- click cannot pay a second time.
    paid := public.award_profile_zp(
      row.profile_id, 'ambassador_initiative', p_id::text, amount,
      jsonb_build_object('initiative_id', p_id, 'focus', row.focus_slug,
                         'kind', row.kind, 'reviewed_by', reviewer, 'source', 'ZeroStart')
    );
  end if;

  update public.zs_initiatives
  set status = case when p_approve then 'completed' else 'rejected' end,
      zp_awarded = case when paid then amount else 0 end,
      review_note = p_note,
      reviewed_by = reviewer,
      reviewed_at = now()
  where id = p_id;

  return jsonb_build_object('ok', true, 'approved', p_approve,
                            'zp_awarded', case when paid then amount else 0 end);
end;
$$;

grant execute on function public.zs_review_initiative(uuid, boolean, integer, text) to authenticated;

/* The admin queue. */
create or replace function public.zs_pending_initiatives()
returns table (
  id uuid,
  profile_id uuid,
  ambassador_name text,
  ambassador_username text,
  ambassador_avatar text,
  location text,
  focus_slug text,
  focus_label text,
  kind text,
  title text,
  description text,
  target_count integer,
  target_label text,
  result_summary text,
  result_count integer,
  evidence_url text,
  submitted_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_zero_club_admin() then return; end if;

  return query
    select i.id, i.profile_id,
           coalesce(nullif(btrim(pr.full_name), ''), pr.username, 'An ambassador'),
           pr.username, pr.avatar_url, a.location,
           i.focus_slug, f.label, i.kind, i.title, i.description,
           i.target_count, i.target_label, i.result_summary, i.result_count,
           i.evidence_url, i.submitted_at
    from public.zs_initiatives i
    join public.zs_ambassadors a on a.profile_id = i.profile_id
    join public.profiles pr on pr.id = i.profile_id
    join public.zs_focus_areas f on f.slug = i.focus_slug
    where i.status = 'submitted'
    order by i.submitted_at asc;
end;
$$;

grant execute on function public.zs_pending_initiatives() to authenticated;

notify pgrst, 'reload schema';
