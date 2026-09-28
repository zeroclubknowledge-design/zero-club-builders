import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import webPush from "npm:web-push@3.6.4";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createECDH } from "node:crypto";
import { Buffer } from "node:buffer";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Only the database trigger (and other server code) may call this function.
 *
 * It used to compare the bearer token to SUPABASE_SERVICE_ROLE_KEY as a plain
 * string. Supabase now injects a different service key into Edge Functions
 * than the legacy service_role JWT stored in the Vault for the trigger, so
 * every call was answered 401 and no phone ever got a push.
 *
 * verify_jwt stays on for this function, so the gateway has already checked
 * the token's signature before we run. Here we only check that the verified
 * token belongs to the service role (not a signed-in user), or that it is
 * exactly the key this function was given.
 */
function isTrustedCaller(authorization: string | null, serviceKey: string) {
  const token = authorization?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;
  if (token === serviceKey) return true;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)));
    return claims?.role === "service_role";
  } catch {
    return false;
  }
}

/** The public key the private key actually belongs to (base64url). */
function publicKeyForPrivate(privateKey: string) {
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(Buffer.from(privateKey.replace(/-/g, "+").replace(/_/g, "/"), "base64"));
  return ecdh.getPublicKey("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const clip = (text: string, max = 120) => (text.length > max ? text.substring(0, max).trimEnd() + "…" : text);

/**
 * Chat content is stored with markers for media, cards and requests. Turn it
 * into the line a person would expect to read on their lock screen.
 */
function readableChat(raw: string) {
  const content = (raw || "").trim();
  if (content.startsWith("::ZEROCLUB_CARD::")) {
    try {
      const card = JSON.parse(content.slice("::ZEROCLUB_CARD::".length));
      const kind = card?.type === "announcement" ? "📣" : "📌";
      return `${kind} ${card?.title || "New update"}${card?.body ? ` — ${card.body}` : ""}`;
    } catch {
      return "📌 Shared an update";
    }
  }
  if (content.includes("$$MEDIA$$")) {
    const text = content.split("$$MEDIA$$")[0].trim();
    if (text) return text;
    const media = (content.split("$$MEDIA$$")[1] || "").toLowerCase();
    if (media.startsWith("image") || /\.(jpe?g|png|gif|webp)/.test(media)) return "📷 Photo";
    if (media.startsWith("video") || /\.(mp4|webm|mov)/.test(media)) return "🎥 Video";
    if (media.startsWith("audio") || /\.(mp3|m4a|wav|ogg|aac)/.test(media)) return "🎤 Voice note";
    return "📎 Attachment";
  }
  if (content.startsWith("FUND_LINK:")) return "💸 Sent a wallet fund link";
  return content.replace(/\s+/g, " ");
}

type Push = {
  receivers: string[];
  title: string;
  body: string;
  url: string;
  icon?: string;
  tag?: string;
  type: string;
  urgent?: boolean;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    // Require VAPID keys to be set in Edge Function secrets
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    const vapidSubject = "mailto:hello@zeroclub.com";

    if (!supabaseUrl || !supabaseKey || !vapidPublicKey || !vapidPrivateKey) {
      throw new Error("Missing environment variables.");
    }

    if (!isTrustedCaller(req.headers.get("Authorization"), supabaseKey)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    // Sign with the public key that really belongs to the private key. The
    // VAPID_PUBLIC_KEY secret was found holding a key from a different pair,
    // which made Google reject every push with "invalid JWT provided".
    webPush.setVapidDetails(vapidSubject, publicKeyForPrivate(vapidPrivateKey), vapidPrivateKey);
    const supabase = createClient(supabaseUrl, supabaseKey);

    const payload = await req.json();

    // Health check for the key pair.
    if (payload.diagnose) {
      const derived = publicKeyForPrivate(vapidPrivateKey);
      return new Response(JSON.stringify({
        vapidPublicKey,
        derivedFromPrivate: derived,
        pairMatches: derived === vapidPublicKey.trim(),
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
    }

    const profileOf = async (id?: string | null) => {
      if (!id) return null;
      const { data } = await supabase.from("profiles").select("full_name, username, avatar_url").eq("id", id).maybeSingle();
      return data as { full_name?: string | null; username?: string | null; avatar_url?: string | null } | null;
    };
    const nameOf = (p: { full_name?: string | null; username?: string | null } | null, fallback = "Someone") =>
      p?.full_name || p?.username || fallback;

    const record = payload.record || {};
    let push: Push | null = null;

    if (payload.profile_id) {
      // A ready-made push from server code (database triggers, other functions).
      push = {
        receivers: [payload.profile_id],
        title: payload.title || "Zero Club",
        body: payload.body || "You have a new notification.",
        url: payload.url || "/app/notifications",
        icon: payload.icon || undefined,
        tag: payload.tag || undefined,
        type: payload.kind || "notification",
      };
    } else if (payload.table === "club_messages") {
      // A message in a club: everyone in the club except the sender.
      const clubId = record.club_id;
      const senderId = record.profile_id;
      const [{ data: club }, sender, { data: members }] = await Promise.all([
        supabase.from("clubs").select("name, logo_url, creator_id").eq("id", clubId).maybeSingle(),
        profileOf(senderId),
        supabase.from("club_members").select("profile_id").eq("club_id", clubId).eq("status", "active"),
      ]);
      const receivers = new Set<string>((members || []).map((m: { profile_id: string }) => m.profile_id));
      if (club?.creator_id) receivers.add(club.creator_id);
      receivers.delete(senderId);

      const room = record.room_id && record.room_id !== "general" ? ` · #${record.room_id}` : "";
      const line = readableChat(record.content || "");
      push = {
        receivers: [...receivers],
        title: `${club?.name?.trim() || "Your club"}${room}`,
        body: clip(`${nameOf(sender)}: ${line}`, 140),
        url: `/app/clubs/chat?clubId=${clubId}`,
        icon: club?.logo_url || sender?.avatar_url || undefined,
        // One notification per club that updates as messages arrive.
        tag: `club:${clubId}`,
        type: "club_message",
        urgent: true,
      };
    } else if (payload.table === "notifications" || record.recipient_id) {
      const actorId = record.actor_id;
      const notificationType = record.type || "notification";
      const actor = await profileOf(actorId);
      const actorName = nameOf(actor);

      const actions: Record<string, string> = {
        like: "liked your post",
        comment_like: "liked your comment",
        comment: "commented on your post",
        follow: "started following you",
        repost: "reposted your post",
        mention: "mentioned you",
        club_mention: "tagged you in a club chat",
        build_tagged: "tagged your work for verification",
        game_buzz: "buzzed you into a Zero Game",
        system: "sent you an account update",
      };

      push = {
        receivers: [record.recipient_id],
        title: notificationType === "system"
          ? "Zero Club update"
          : notificationType === "game_buzz"
            ? `${actorName} is buzzing you`
            : actorName,
        body: record.content || actions[notificationType] || "You have a new notification.",
        url: notificationType === "follow"
          ? `/app/profile/${actorId}`
          : notificationType === "game_buzz" && record.entity_id
            ? `/app/games/${record.entity_id}`
            : notificationType === "club_mention" && record.entity_id
              ? `/app/clubs/chat?clubId=${record.entity_id}`
              : record.entity_id && ["like", "comment_like", "comment", "repost", "mention", "build_tagged"].includes(notificationType)
                ? `/app/post/${record.entity_id}`
                : "/app/notifications",
        icon: actor?.avatar_url || undefined,
        type: notificationType,
        urgent: notificationType === "game_buzz",
      };
    } else if (record.content) {
      // Direct messages (messages table).
      const content: string = record.content;
      const senderId = record.sender_id;
      const sender = await profileOf(senderId);

      if (content.startsWith("CLUB_REQUEST:")) {
        // CLUB_REQUEST:<clubId>:<clubName>:<status>
        const parts = content.split(":");
        if (parts[parts.length - 1] !== "pending") {
          return new Response(JSON.stringify({ message: "Not a new request" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          });
        }
        const clubName = parts.slice(2, -1).join(":").trim() || "your club";
        push = {
          receivers: [record.receiver_id],
          title: "New request to join",
          body: `${nameOf(sender)} wants to join ${clubName}`,
          url: "/app/clubs",
          icon: sender?.avatar_url || undefined,
          tag: `club-request:${parts[1]}:${senderId}`,
          type: "club_request",
          urgent: true,
        };
      } else if (content === "DISMISSED_CLUB_REQUEST") {
        push = null;
      } else {
        push = {
          receivers: [record.receiver_id],
          title: nameOf(sender, "New message"),
          body: clip(readableChat(content)),
          url: `/app/chat/${senderId}`,
          icon: sender?.avatar_url || undefined,
          tag: `chat:${senderId}`,
          type: "message",
          urgent: true,
        };
      }
    }

    if (!push || push.receivers.filter(Boolean).length === 0) {
      return new Response(JSON.stringify({ message: "Nothing to send" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Every device of every receiver, in one query.
    const { data: subscriptions, error } = await supabase
      .from("push_subscriptions")
      .select("*")
      .in("profile_id", push.receivers.filter(Boolean));

    if (error) throw error;

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ message: "No subscriptions found for user" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const pushPayload = JSON.stringify({
      title: push.title,
      body: push.body,
      url: push.url,
      type: push.type,
      icon: push.icon,
      tag: push.tag,
    });
    const pushOptions = push.type === "game_buzz"
      ? { urgency: "high" as const, TTL: 60 }
      : push.urgent
        // Chats and requests: delivered straight away even when the phone is
        // dozing, the way chat apps are, and kept for a day if it is offline.
        ? { urgency: "high" as const, TTL: 86400 }
        : undefined;

    const results = await Promise.all(subscriptions.map((sub) =>
      webPush.sendNotification(
        { endpoint: sub.endpoint, keys: { auth: sub.auth_key, p256dh: sub.p256dh_key } },
        pushPayload,
        pushOptions,
      ).then(() => true).catch(async (err) => {
        console.error("Error sending push notification:", err?.statusCode, err?.body || err);
        // If the subscription is no longer valid, delete it
        if (err.statusCode === 410 || err.statusCode === 404) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        }
        return false;
      })
    ));

    const sent = results.filter(Boolean).length;
    return new Response(JSON.stringify({ message: `Sent push to ${sent} of ${subscriptions.length} devices`, type: push.type }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
