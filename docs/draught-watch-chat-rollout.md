# Zero Draught: watching and match chat

Run `supabase/migrations/20261022020000_draught_watch_chat.sql` in the existing
project's Supabase SQL Editor. It requires the base Zero Draught migration
(`20261019170000_zero_draught.sql`) and can safely be rerun.

This repair enables watching and commenting independently of the older
`20261021230000_draught_watch_and_stakes_NOT_YET_APPLIED.sql` file. That broader
file also changes ZP financial flows; it is not required for this rollout.
When applying migrations in bulk, preserve timestamp order.

The repair adds watchable matches, a live match list, comments, access rules,
and realtime comment publication where available. It reloads the API schema.
Spectators can watch active/finished public matches and chat; moves and game
actions remain restricted to the players. Unstarted invitations stay private.
Invite codes and repetition history are excluded from spectator snapshots
and direct table column access.

Deploy the app changes for clear retry states, polling when realtime is
interrupted, and the newest 200 chat messages displayed in conversation order.
The server repair is compatible with the existing client.

After applying, start a friendly match with two accounts. With a third
signed-in account, open Watch a match, check that moves update, send a chat
message, and confirm both players can see it. Confirm the watcher cannot move
pieces or resign for a player. Private waiting invites must remain unavailable.

Local verification:

```text
node --test scripts/draught-watch-chat.test.mjs scripts/zero-draught.test.mjs
```

These tests run the real PostgreSQL migrations, including repeated application
of the repair without any stakes schema installed. A live three-account check
is still needed after deployment.
