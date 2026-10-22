# Zero Gifts

**Send someone a head start.** Stand-alone home of Zero Cards: gift credit for
bootcamps, Premium membership, Zero AI, the Zero Store or any payment on Zero Club —
to one person or a whole class, with one link anyone can claim.

## Where this sits

Zero Gifts is a **separate app** (own Vercel project, own domain) like ZeroStart.
It shares the Zero Club Supabase project on purpose:

- **One account.** Sign-up here creates a real Zero Club account (same OTP flow and
  rules). `signup_source: "zerogifts"` is stored in the auth metadata.
- **One set of gifts.** Same tables (`gift_cards`, `gift_redemptions`, …) and RPCs
  (`create_gift_campaign`, `update_gift_campaign`, `close_gift_campaign`,
  `get_gift_card_public`, `get_gift_card_v2`, `claim_gift_card`). Gift links keep the
  same shape: `/gift/<code>`.
- **One wallet.** Gifts are funded from the Zero Club wallet; credit is spent on Zero Club.

## What's new compared with gifts inside Zero Club

- No landing page: the site opens straight on the gift builder, like Zero Club's Gifts page. Signed out, you can design a card and are asked to sign in or create an account when you create it.
- **Claim without leaving the link**: someone signed out sees the card, creates a free
  Zero Club account inline, and the gift is claimed the moment their code is verified.
- **Sent** (`/sent`): every gift you've made — collecting and past — with copy/share,
  edit (amount, claims, date, design, purpose) and close-and-refund.
- **Received** (`/received`): Zero Card credit you can still spend (with where to use it),
  membership and Zero Club gifts waiting to be claimed, and a box for gift codes.

## Setup

1. Vercel → New Project → same repo, **Root Directory `Zero Gifts`**, framework Vite, output `dist`.
2. Environment (`.env.example`): the same `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` as Zero Club,
   `VITE_ZERO_CLUB_URL`, `VITE_PAYSTACK_PUBLIC_KEY`.
3. Domain: e.g. `gifts.zeroclubs.xyz`.

## Known gap

Link previews show Zero Gifts' general card, not each gift's own image (single-page app).
Zero Club's `/gift/<code>` still renders per-gift previews; a small edge function can add them here later.
