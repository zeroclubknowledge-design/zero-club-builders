# Zero Draught, game avatars and fuel enhancers

## Deployment

After the existing Zero Space marketplace and Zero Quest migrations, apply these in order:

1. `supabase/migrations/20261019160000_space_fuel_enhancers.sql`
2. `supabase/migrations/20261019170000_zero_draught.sql`
3. `supabase/migrations/20261020120000_flying_draught_kings.sql`
4. `supabase/migrations/20261020130000_draught_backward_captures.sql`

Deploy the updated application. No new external service or API key is required. The Draught migration adds its table to the existing Supabase realtime publication when available; a three-second refresh also keeps matches synchronized if realtime is unavailable.

## Zero Space

The toolbar sits in the header, above the score and fuel display. It contains Shield, Focus, Magnet, Fuel Cell, three enhancers and the marketplace. Empty supplies open the shop. Opening the shop pauses the current run and closing it resumes the same run.

Enhancer 2× costs 40 ZP, Enhancer 3× costs 65 ZP and Enhancer 5× costs 100 ZP. Each reduces fuel consumption for the remainder of the current run, including after a Fuel Cell refill or orb pickup. They do not refill fuel themselves. Enhancers do not stack, and activating an equal or weaker enhancer is blocked before consuming inventory. Zero Club administrators continue to receive supplies without a ZP charge. Purchased supplies are available in both practice and tournament runs. The header is shown on both entry paths, including games opened from a featured live tournament.

## Zero Draught

Open **Zero Games → Zero Draught** or `/app/games/draught`.

- Solo: play Zero Bot at Easy, Balanced or Challenging strength. The board is saved per account on the same device and resumes across reloads.
- Multiplayer: create an invitation or join a 12-character code. The match starts when the second player joins. Red moves first; each player has a ten-minute clock. Clocks continue when the page is closed. Returning to the match does not resign or restart it.
- Rules: 8×8 draughts with flying kings, ordinary pieces capturing forwards or backwards while moving forward normally, compulsory captures, continued jumps with the same piece, kings moving any distance along clear diagonals, and promotion ending the turn. A king captures by crossing one opposing piece and landing on any clear square beyond it; friendly pieces and a second occupied square block the path. Capture chains can change diagonal direction. Threefold repetition or forty full moves without a capture or a man moving result in a draw. Players can also offer a draw or resign.
- Multiplayer moves, turn ownership, captures, promotion, clocks and final results are checked on the server. Request identifiers prevent a retried move from running twice. Casual Draught matches do not issue XP, ZP or wallet funds; Zero Quest's existing win rewards are unchanged.

## Avatars and retired game

Draught player cards and pieces, plus Quest rosters and chat, use profile pictures. Missing or broken pictures fall back to locally generated faces seeded by profile ID, so a player's random avatar stays recognizable across rooms and devices.

The Sudoku board, generator dependency, practice controls and catalogue entry are removed. Old solo links open Draught; Words solo links still open Words. Retired tournaments are hidden from the active catalogue and new retired-game competitions or runs are blocked. Historical matches, scores, prize records and existing runs remain stored for settlement and audit purposes.

## Validation

Run `node --test scripts/zero-draught.test.mjs scripts/space-market.test.mjs scripts/zero-quest.test.mjs`.

The tests cover client/server rule agreement, forced and chained captures, promotion, draw rules, timeouts, resignations, privacy, move retries, enhancer spending and fuel duration, and Quest reward limits. Local browser checks also cover solo saves, two-player synchronized play, avatars, and buying or activating supplies from the Space header.
