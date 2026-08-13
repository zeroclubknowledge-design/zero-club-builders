# Landing

Owns the public Zero Club experience: marketing pages, pricing, blog, signup entry points, and landing-page-specific visual sections.

Current route entry points:

- `src/routes/index.tsx`
- `src/routes/signin.tsx`
- `src/routes/signup.tsx`

## Contact form email

The landing-page contact form posts to `src/routes/api.contact.ts` and delivers
messages to `admin@zeroclubs.xyz` through Resend. Production hosting needs these
server-only environment variables:

- `RESEND_API_KEY` (required)
- `CONTACT_FROM_EMAIL` (optional, defaults to `Zero Club <contact@zeroclubs.xyz>`)

The sender domain in `CONTACT_FROM_EMAIL` must be verified with Resend. The
visitor's address is set as Reply-To so the team can answer them directly.
