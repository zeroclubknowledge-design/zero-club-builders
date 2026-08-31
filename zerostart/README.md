# ZeroStart

**Build. Test. Improve. Launch.**

The MVP validation layer of the Zero ecosystem. Builders list an MVP and create
testing campaigns; testers complete the tasks, submit feedback, and earn ZP once
a builder approves the work.

---

## Where this sits

```
Learn in Zero Club → Build → Publish on Zerohub → Validate on ZeroStart → Launch
```

ZeroStart is a **separate application**, not a feature inside Zero Club. It has
its own repo, its own Vercel project and its own deploys, so a ZeroStart release
can never take the main site down.

It shares two things with Zero Club, deliberately:

- **One identity.** The same Supabase `profiles` row is the same person in both
  products. Nobody signs up twice.
- **One ZP balance.** ZeroStart writes to Zero Club's existing `zp_events`
  ledger rather than keeping a second balance. Two balances that can disagree
  is the worst outcome for a rewards currency.

---

## Setup

### 1. Domain

Deploy to its own Vercel project, then point the subdomain at it:

| Type | Name | Value |
|---|---|---|
| CNAME | `zerostart` | *(the value Vercel shows for the domain)* |

Add `zerostart.zeroclubs.xyz` in Vercel → Settings → Domains.

Nothing about the app hardcodes that host. Moving to `zerostart.com` later is a
DNS change and one environment variable, not a rebuild.

### 2. Environment

```
VITE_SUPABASE_URL=          # the same project as Zero Club
VITE_SUPABASE_ANON_KEY=     # the same anon key
VITE_ZERO_CLUB_URL=https://www.zeroclubs.xyz
```

The Supabase values are the same as Zero Club's, on purpose — that is what
makes one account and one wallet real rather than aspirational.

### 3. Database

Both migrations run against the **Zero Club Supabase project**:

```
supabase/migrations/20260901000000_zerostart_core.sql   -- tables, RLS
supabase/migrations/20260901001000_zerostart_flow.sql   -- join / submit / review
```

Everything ZeroStart owns is prefixed `zs_`, so the two products' tables can
never collide and it is obvious at a glance which belongs to which.

---

## The part that has to be right

The spec's section 42 asks that approving a submission twice must not pay twice.
That is handled in two layers:

1. `zs_review_submission` locks the participation row and refuses to act on one
   that has already been reviewed, so a second click reports the decision rather
   than repeating it.
2. Underneath, it calls Zero Club's `award_profile_zp`, whose ledger is keyed on
   `(profile_id, event_type, source_key)` with the **participation id** as the
   source key. Even if both layers were raced, the second insert hits a unique
   violation and the balance is never moved.

The second layer is the real guarantee. The first only makes the message
sensible.

Two other rules are enforced in the database rather than the browser, because a
rule enforced in the browser is enforced only for people who use the browser:

- A builder cannot test or approve their own campaign.
- A campaign cannot oversell its seats. `zs_join_campaign` locks the campaign
  row before counting, so two testers arriving in the same millisecond cannot
  both take the last place.

---

## Deploying

ZeroStart lives inside the Zero Club repo but is a **separate Vercel project**.
That is the whole trick: one repo to clone, two deploys that cannot break each
other.

In the new Vercel project:

| Setting | Value |
|---|---|
| Root Directory | `zerostart` |
| Framework Preset | Vite |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Domain | `zerostart.zeroclubs.xyz` |

`zerostart/vercel.json` carries the build settings rather than the dashboard,
so they travel with the code and cannot be confused with Zero Club's. Two of
them matter:

- **`outputDirectory: "dist"`.** Zero Club is server-rendered and outputs
  `dist/client`; ZeroStart is a plain single-page app and outputs `dist`. A
  dashboard override left over from the other project is what makes Vercel
  report *No Output Directory named "client"* even though the build succeeded.
- **The rewrite to `/index.html`.** Routing happens in the browser, so the
  server has no file at `/tests` or `/campaign/<id>`. Without the rewrite those
  URLs 404 on refresh and every shared campaign link is broken — the app only
  works if you arrive via the home page. Real files still serve normally,
  because Vercel checks the filesystem before applying a rewrite.

Note that `vercel.json` is validated strictly: it rejects any property outside
its schema, including `//` keys used as comments. That is why the reasoning
lives here rather than in the file.

Zero Club's own project is untouched — its `tsconfig.json` includes only
`src/**/*`, so this folder is invisible to its build, and its `.gitignore`
already excludes `node_modules` and `dist` at any depth.

---

## Status

**The core loop runs end to end:**

list an MVP (live immediately) → builder opens a campaign → tester discovers it
→ takes a seat → completes tasks → submits feedback → builder approves → ZP
paid once.

| | |
|---|---|
| Schema + RLS | `20260901000000_zerostart_core.sql` |
| Join / submit / review | `20260901001000_zerostart_flow.sql` |
| Admin functions | `20260901002000_zerostart_admin_review.sql` |
| Open listing + media | `20260901003000_zerostart_open_listing.sql` |
| Board stats, activity, leaderboard | `20260901004000_zerostart_board.sql` |
| Editing guards + product page data | `20260901005000_zerostart_editing.sql` |
| Everything joined, to paste into Supabase | `supabase/RUN_THIS_IN_SUPABASE.sql` |

### Why listings are not approved first

A builder who has just shipped something wants testers today, and a queue only
one person can clear stalls the moment they are busy. Nothing was being bought
by the delay: the decision that moves ZP is the builder approving a submission,
and that still has a human on it.

So moderation is reactive. `zs_take_down_mvp` removes a listing and cancels its
live campaigns in the same step — leaving those recruiting would let testers
keep joining work on a product that had just been pulled, and they would rightly
expect to be paid for it. `zs_restore_mvp` undoes it, so a takedown is not a
one-way door.

A builder can set their own listing to `draft`, `live`, `paused` or `completed`,
but not `rejected`. Letting them clear their own takedown would make the
takedown pointless.

### Media

`zs_mvps.media_urls` holds screenshots and clips in display order; the first is
the cover. Files live in the public `zerostart-media` bucket under
`<builder_id>/<uuid>.<ext>`, and the storage policies key off that first folder
segment, so nobody can write into anyone else's folder.

Photos are compressed in the browser before upload, reusing Zero Club's
approach. Video is not — re-encoding client-side is slow and lossy — so the
50MB limit is enforced and the person is told plainly when a file is too big.

### The board

Discover is a ranked list, not a grid. Rank gives a reason to read the top of
the page and a reason to keep scrolling, and it lets one row carry the reward,
the seats and the action without them competing for the same corner of a tile.
Campaigns sort featured-first, then by ZP — the honest answer to "why read this
one first", since that is the number the tester is deciding on.

The stats pill, activity feed and leaderboard each load independently of the
campaigns and never block them; if one of those functions is missing the board
still appears, because the campaigns are why anyone came.

`zs_board_stats`, `zs_recent_activity` and `zs_leaderboard` are SECURITY
DEFINER because the honest policies hide what they need — a participation is
readable only by its tester and the campaign's builder. Rather than widen that
policy and expose everyone's submissions, each function returns exactly the
aggregate the board shows. Feedback text, bug reports and review notes are
never exposed, and the feed announces joins and approvals only: a submission is
private between tester and builder until the builder has acted on it.

### Editing a campaign

The policies already allowed it — `zs_campaigns_builder_write` is `for all`.
What was missing was protection for the people who had already joined, so two
triggers do that:

- The reward cannot be lowered, and the seat limit cannot drop below the seats
  already taken, once anyone holds a seat. A tester commits their time on the
  strength of a stated reward; letting it be cut afterwards means the deal on
  offer is not the deal being honoured.
- A task that someone has already ticked cannot be deleted. Rewording is fine;
  removing it would silently rewrite what they agreed to do and leave their
  `completed_task_ids` pointing at nothing.

These are triggers rather than form validation because they are promises, not
validations. A disabled input is a courtesy; a trigger is the rule, and it
holds whatever sends the request.

Create and edit share one `CampaignForm`. They were going to be two screens
with the same nine fields — two places to add a field and one place to forget.

### The product page

`/product/$id` — what the product is, how it ranks, and what it is offering.
Reachable from the board, from any campaign, and from the builder's own list.

Rank comes from `zs_mvp_overview`, which returns everything the page shows in
one call. It is a function rather than a query because working out "#24 of 41
in Productivity" client-side would mean fetching every live MVP in the category
and counting locally — fine at 41, useless at 4,100. Ranking is by the best
reward currently on offer, since that is the number a tester is choosing on.

The page shows feedback *counts* and an average rating. It never shows what
anyone wrote — that goes to the builder, not the board.

**Not built yet:** the bug-report form (table and policies exist, nothing writes
to it), tester leaderboards, notifications, and campaign editing after creation.
