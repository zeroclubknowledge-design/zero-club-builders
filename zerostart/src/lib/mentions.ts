import { supabase } from "@/lib/supabase";

/**
 * Tell people they were tagged (@username) in something written on ZeroStart.
 * Uses Zero Club's own notifications, so the tag shows up in their Zero Club
 * alerts (and as a push), linking back to the ZeroStart page it came from.
 * Best effort: a failed notification never blocks what was being saved.
 */
export async function notifyTagged(text: string, where: string, path: string) {
  try {
    const handles = [...new Set((text.match(/(?:^|[^A-Za-z0-9_@])@([A-Za-z0-9_-]{1,40})/g) || []).map((m) => m.replace(/^[^@]*@/, "")))]
      .filter((u) => !/^(everyone|all)$/i.test(u));
    if (!handles.length) return;
    const { data: auth } = await supabase.auth.getUser();
    const me = auth.user?.id;
    if (!me) return;
    const { data: people } = await supabase.from("profiles").select("id, username").in("username", handles);
    const rows = (people || [])
      .filter((p) => p.id !== me)
      .map((p) => ({
        recipient_id: p.id,
        actor_id: me,
        type: "mention",
        content: `tagged you in ${where}`,
        link: `${window.location.origin}${path}`,
      }));
    if (rows.length) await supabase.from("notifications").insert(rows);
  } catch (error) {
    console.warn("Tag notifications could not be sent", error);
  }
}
