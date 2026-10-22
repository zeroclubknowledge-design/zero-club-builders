# Zero Form

**Registration forms that fill seats.** Stand-alone home of Zero Club's Zero Forms:
bootcamp registration, waitlists and paid sign-ups — and every respondent can
create a free Zero Club account in one step.

## Where this sits

Zero Form is a **separate app** (own Vercel project, own domain) like ZeroStart.
It shares the Zero Club Supabase project on purpose:

- **One account.** Sign-up here creates a real Zero Club account (same OTP flow,
  trusted-email and one-account-per-person rules, username, referral code).
  `signup_source: "zeroform"` is stored in the auth metadata.
- **One set of forms.** Same tables (`zero_forms`, `zero_form_fields`,
  `zero_form_registrations`) and RPCs (`save_zero_form`, `get_my_zero_forms`,
  `get_zero_form_public`, `submit_zero_form_with_gift`, …). A form made in Zero Club
  shows up here and the other way round. Public links keep the same shape:
  `/form/<slug>` (and the short `/f/<slug>`).
- **One wallet.** Paid places use Paystack (`paystack-verify` edge function),
  the Zero Club wallet, or Zero Card credit.

## What's new compared with the forms inside Zero Club

- No landing page: the site opens straight on your Zero Forms workspace (signed out, the same page asks you to sign in or create an account), with totals for live forms, responses, views and revenue.
- Sign-up / sign-in happens **inside** the form (a sheet), so paying respondents never leave the page; their answers are kept.
- After a guest submits, they're offered a free Zero Club account to track their place.
- **My registrations** (`/me`): everything you registered for. Guest sign-ups made with your
  verified email are linked to your account automatically (`claim_guest_zero_form_registrations`, applied).
- Anyone with a Zero Club account can run waitlists; bootcamp forms still need a bootcamp you own (checked by the server).

## Setup

1. Vercel → New Project → same repo, **Root Directory `Zero Form`**, framework Vite, output `dist` (see `vercel.json`).
2. Environment (`.env.example`): the same `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` as Zero Club,
   `VITE_ZERO_CLUB_URL`, and `VITE_PAYSTACK_PUBLIC_KEY`.
3. Domain: e.g. `form.zeroclubs.xyz` (CNAME to Vercel).
4. Storage: banner uploads use the same `media` bucket path as Zero Club; file-upload answers use the private `zero-form-uploads` bucket.

`npm install && npm run dev` to work locally; `npm run build` type-checks and builds.

## Known gap

Link previews (WhatsApp/X) show Zero Form's general title and description — this is a
single-page app, so it can't render each form's own preview yet. Zero Club's `/form/<slug>`
still has per-form previews.
