-- ===========================================================================
-- Start ZeroStart's data over — YOUR listings only.
--
-- Run this ONLY if you want to throw away the test campaigns you made. It is
-- not needed to get the Edit button; that was a display bug, now fixed.
--
-- Everything here is scoped to one account by email, so it cannot touch
-- another builder's work even by accident. The email is looked up in
-- auth.users, which is where Supabase actually keeps it.
--
-- Run it in three steps, in order. Read the output of step 1 before running
-- step 2.
-- ===========================================================================

-- >>> Put your email between the quotes, in all three steps. <<<


-- ---------------------------------------------------------------------------
-- STEP 1 — LOOK FIRST. Deletes nothing.
--
-- Run this on its own and read the result. It shows exactly what step 2 would
-- remove, including whether any tester has already been paid.
-- ---------------------------------------------------------------------------

select
  m.name                                   as product,
  m.status                                 as product_status,
  c.name                                   as campaign,
  c.status                                 as campaign_status,
  c.zp_reward,
  count(p.id)                              as testers_joined,
  count(p.id) filter (where p.status = 'approved') as already_paid
from public.zs_mvps m
left join public.zs_campaigns c on c.mvp_id = m.id
left join public.zs_participations p on p.campaign_id = c.id
where m.builder_id = (
  select id from auth.users where email = 'YOUR-EMAIL-HERE'
)
group by m.name, m.status, c.name, c.status, c.zp_reward
order by m.name, c.name;

/*
  If "already_paid" is 0 everywhere, deleting costs nothing.

  If it is not 0, note this before you continue: deleting a campaign does NOT
  claw back ZP that was already awarded. Those testers keep what they earned,
  which is correct — they did the work. But the record of WHY they earned it
  goes away with the campaign, so their balance will no longer be explainable
  from ZeroStart.
*/


-- ---------------------------------------------------------------------------
-- STEP 2 — Delete the campaigns.
--
-- Tasks, participations and feedback belong to a campaign and are removed with
-- it automatically (on delete cascade). The products themselves are kept, so
-- you can open a fresh campaign on them straight away.
-- ---------------------------------------------------------------------------

delete from public.zs_campaigns
where builder_id = (
  select id from auth.users where email = 'YOUR-EMAIL-HERE'
);


-- ---------------------------------------------------------------------------
-- STEP 3 — OPTIONAL. Only if you also want the products gone.
--
-- Leave this commented out unless you really mean it. Deleting a product
-- removes its listing, its media references and anything still hanging off it.
-- Uploaded files stay in storage; they are just no longer pointed at.
-- ---------------------------------------------------------------------------

-- delete from public.zs_mvps
-- where builder_id = (
--   select id from auth.users where email = 'YOUR-EMAIL-HERE'
-- );


-- ---------------------------------------------------------------------------
-- STEP 4 — OPTIONAL. Reset your own tester counters.
--
-- Only relevant if you tested someone else's product and want that history
-- cleared too. Your ZP balance is NOT touched — that lives in Zero Club's
-- ledger and is deliberately out of reach of a cleanup script.
-- ---------------------------------------------------------------------------

-- delete from public.zs_tester_stats
-- where profile_id = (
--   select id from auth.users where email = 'YOUR-EMAIL-HERE'
-- );
