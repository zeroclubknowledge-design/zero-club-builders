# Message actions

Direct and club chats now have a visible options button on phones, hover options
on computers, and long-press/right-click support. The shared menu contains quick
reactions, Reply, Copy, Forward, Highlight, attachment downloads, and Edit for
recent own text messages. The drawers sit above the full-screen chat and do not
turn button presses into drag-dismiss gestures.

Forwarding chooses existing direct chats. Failed recipients remain selected for
retry; successful recipients are not sent a second copy by that retry. Messages
retain the existing `forwarded` flag, rendered as “Forwarded” in direct chats.

Direct-message highlights use the existing `message_highlights` table. Apply
`supabase/migrations/20261009160000_secure_message_highlights.sql` through the
Supabase SQL Editor or your normal migration deployment before release. This
enables row security and permits users to highlight only messages they sent or
received, while hiding other people's highlights. The migration was tested in
a disposable PostgreSQL-compatible database; it has not been applied to the
live project from this workspace.

Club highlights are private to the signed-in account on this device and survive
refresh through local storage. They do not sync between devices.

Validation: `node --test scripts/message-actions.test.mjs`, TypeScript, and the
production build. The real shared drawers were also exercised in an isolated
browser fixture with mock recipients; no real messages were sent. Authenticated
database writes and physical Android long-press still require live-device QA.
