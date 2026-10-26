-- Applied to the live project on 2026-10-26 (welcome email sent once to new members).
alter table public.profiles add column if not exists welcome_email_sent_at timestamptz;
update public.profiles set welcome_email_sent_at = now() where welcome_email_sent_at is null;
-- claim_welcome_email() / release_welcome_email(): see the live database for the full definitions.
