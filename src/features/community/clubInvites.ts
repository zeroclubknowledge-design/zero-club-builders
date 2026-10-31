import { supabase } from "@/lib/supabase";

/**
 * Club invite credit.
 *
 * A member's club link carries `?ref=<their profile id>`. Whoever opens it has
 * the ref remembered on this device (it survives signing up), and once they
 * are a member of that club the app tells the server, which credits the
 * inviter on the club's Contributors page. The server only accepts it for
 * someone who joined in the last 7 days, once per person per club, and only
 * when the inviter belongs to the club (record_club_invite).
 */

const KEY = "zc_club_ref:";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_AGE = 30 * 24 * 3600 * 1000;

/** The link a member shares: the public club page, carrying who invited. */
export async function clubInviteLink(clubId: string, _inviterId?: string | null) {
  const { data, error } = await supabase.rpc("club_invite_path", { p_club: clubId });
  if (error || !data) throw new Error("Couldn't create the invite link. Please try again.");
  return `${window.location.origin}${data}`;
}

/** Called on the public club page: remember who sent this link. */
export function rememberClubInvite(clubId: string, inviter: string | null | undefined) {
  if (!inviter || !UUID.test(inviter)) return;
  try {
    // The first person to send it gets the credit; opening someone else's link later doesn't override it.
    if (localStorage.getItem(KEY + clubId)) return;
    localStorage.setItem(KEY + clubId, JSON.stringify({ inviter, at: Date.now() }));
  } catch {
    /* storage unavailable: no credit, nothing breaks */
  }
}

let running = false;

/** Try to credit every remembered invite. Safe to call often; the server decides. */
export async function claimClubInvites(onlyClubId?: string) {
  if (running) return;
  running = true;
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(KEY) && (!onlyClubId || k === KEY + onlyClubId)) keys.push(k);
    }
    for (const k of keys) {
      const clubId = k.slice(KEY.length);
      let entry: { inviter?: string; at?: number } = {};
      try { entry = JSON.parse(localStorage.getItem(k) || "{}"); } catch { /* corrupt */ }
      if (!entry.inviter || !entry.at || Date.now() - entry.at > MAX_AGE) { localStorage.removeItem(k); continue; }
      const { data, error } = await supabase.rpc("record_club_invite" as never, { p_club: clubId, p_inviter: entry.inviter } as never);
      // Credited: done. Not yet a member: keep it and try again later.
      if (!error && data === true) localStorage.removeItem(k);
    }
  } catch {
    /* storage or network unavailable; try again next time */
  } finally {
    running = false;
  }
}
