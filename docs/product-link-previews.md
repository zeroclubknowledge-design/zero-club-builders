# Product link preview images

Social apps read the initial HTML and do not run React. Zero Form and Zero Gifts previously returned their static application shell at every URL, so their public content had no attached-image metadata.

- Standalone Form public `/form/:slug`, `/info`, `/register` and `/f/:slug` URLs now rewrite known social crawler requests to the main public edge metadata endpoint. Ordinary visitors keep the original standalone app and route.
- Standalone Gifts `/gift/:code` and legacy `/app/gifts/:code` do the same, using the generated Zero Card preview.
- Zero Start campaign share links still point to `/signup?c=CODE`, preserving attribution. Signup now loads safe public campaign copy before rendering metadata. The campaign cover is rendered as a social-sized PNG.
- Bootcamps use their own attached banner, falling back to a linked published Form banner. Forms prefer their own banner. Photo variants, including bootcamps, campaigns, products and clubs, render their actual image without the default branded frame.
- All three standalone landing pages include a default image when there is no attached content image. Missing images keep the existing generated fallback.

The endpoint uses only public fields and escapes all user text. The campaign RPC does not expose ambassador identity, commissions, evidence or review notes, and does not publish draft, paused or removed campaigns. No payment/referral logic changes.

## Deploy

1. Apply `supabase/migrations/20261029160000_campaign_link_previews.sql` to the shared Supabase project. The existing Zero Start campaign tables must already be installed.
2. Deploy the main Zero Club app (including `api/link-preview.ts` and `api/og.ts`).
3. Deploy Zero Form, Zero Gifts and Zero Start. Keep the standalone Vercel rewrite files; preview requests depend on the main deployment.
4. Share fresh public links and inspect the initial response using social crawler user agents. Check Form info/register/short routes, Gifts legacy/new routes, campaign signup links, and short bootcamp referral redirects.

Social platforms control their own preview caches. Already shared messages may retain their old image; a new share or the platform's preview refresh tool may be needed. This work has local automated coverage, not a claim that every third-party platform has fetched a deployed version.
