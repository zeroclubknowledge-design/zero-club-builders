# Zero Space quantities and flight controls

Apply `supabase/migrations/20261107120000_space_supply_quantities.sql` after the existing marketplace and fuel-enhancer migrations, then deploy the application. This preserves inventory and transactions. Existing clients still buy/use one item through the original RPC signature; the new four-argument version atomically buys the requested quantity, charges server-owned prices, enforces the 999-item stock cap and rejects reuse of a request ID with a different quantity. Activation still consumes exactly one item.

Solo, tournament and co-op flights use the same rounded arena and pause controls. Pause freezes fuel, timers, hazards and active boosts. Supplies can be activated while paused and the player explicitly resumes. Opening/closing the marketplace does not override a manual pause. In co-op, pausing affects your flight; your wingmate continues. Countdown and background-tab suspension keep their existing behavior.

The post editor no longer treats a bootcamp tag as a shipped project. Ordinary posts retain their bootcamp tag with `is_build_post=false`; true project edits go through Ship and retain database-enforced confirmation. No publishing permission or confirmation trigger was weakened. This post repair needs no SQL migration.

Live rollout and physical-device checks are still needed: verify multiple quantities/total ZP, pause → use several tools → resume, pause → shop → return still paused, portrait/landscape resizing, and tagging a bootcamp on a regular post. Do not rerun historical migrations out of order.

## Thumbstick and navigation update

A fixed-base analogue thumbstick below the arena now controls flight in all modes. It supports proportional movement, a centre dead zone, single-pointer capture, and stopping on release/cancellation/window blur. WASD/arrows and arena dragging remain available. Pausing, activating supplies and opening the shop reset held steering.

The Zero Games catalogue shows only Zero Space and Zero Draught. Zero Space's entry screen offers solo play and multiplayer; existing team invite links and solo tournaments keep their routes.

Zero Club, ZeroStart, Zero Form and Zero Gifts all apply the composer-style blur below the bottom taskbar. The strip spans the viewport and safe-area gap, ignores pointer events, stays behind the tabs, and follows the taskbar's existing visibility. This update requires no new SQL beyond the quantity migration already listed above. Check the thumbstick and bottom-edge effect on a physical phone before declaring device validation complete.

Thumbstick movement now updates the craft directly rather than feeding the drag input's trailing target. Direction changes apply on the next frame, centre/release removes residual velocity, and a smaller 4% dead zone responds to short thumb movements. Full deflection moves at 360 pixels per second; diagonals remain capped. Keyboard and arena drag controls retain their existing movement. Automated checks cover first-frame movement, reversal, stopping, arena limits, and frame-rate-independent travel; physical-phone responsiveness still needs a device check.
