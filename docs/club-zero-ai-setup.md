# Club Zero AI rollout

Apply `supabase/migrations/20261105140000_club_zero_ai_replies.sql` in the existing Supabase project, then deploy the application.

The server needs `GROQ_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`. The service-role key must be server-only (never a VITE variable). It is used only to reserve/save/delete bot reply rows. Authentication, message ownership and club membership are checked using the caller session and a membership-checking quota function first.

Any club member can tag `@ZeroAI` (or type `@Zero AI`); club assistance permits 30 requests per member per UTC day across clubs. Private Zero AI retains its existing membership and daily-limit rules. Bot replies are shared only with club members and owners, clearly labelled, and cannot be written by browsers. Deleting a question deletes its bot reply.

Per the selected privacy preference, Groq receives the directly addressed question and curated general product guidance only. No account snapshot, club history, enrolment records, credentials or other backend context is sent. Club-specific details cannot be verified by the assistant. Mention questions and bot answers are stored as part of club discussion.

Verify with two club members and an outsider: Enter club must open Discussion, @ZeroAI must create one shared answer, refresh must preserve it, and an outsider must be unable to read it or request generation. On mobile, check the keyboard, expanding input, scrolling beneath the floating composer, and safe-area spacing. No device test has been performed by the automated checks.
