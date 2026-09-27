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

    // Read payload from the trigger/webhook or client request
    const payload = await req.json();

    // Health check for the key pair. Push services reject every message with
    // "invalid JWT" when the VAPID keys here differ from the public key the
    // app subscribed phones with (VITE_VAPID_PUBLIC_KEY), so make it visible.
    if (payload.diagnose) {
      const derived = publicKeyForPrivate(vapidPrivateKey);
      return new Response(JSON.stringify({
        vapidPublicKey,
        derivedFromPrivate: derived,
        pairMatches: derived === vapidPublicKey.trim(),
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
    }
    
    let receiverId = payload.record?.receiver_id || payload.record?.recipient_id;
    let title = "Zero Club";
    let body = "You have a new notification.";
    let url = "/app/notifications";
    // The sender's photo, and a tag so one conversation stays one notification.
    let icon: string | undefined;
    let tag: string | undefined;

    // If payload is sent from the client directly
    if (payload.profile_id) {
      receiverId = payload.profile_id;
      title = payload.title || title;
      body = payload.body || body;
      url = payload.url || url;
    } else if (payload.table === "notifications" || payload.record?.recipient_id) {
      const actorId = payload.record?.actor_id;
      const notificationType = payload.record?.type || "notification";
      let actorName = "Someone";

      if (actorId) {
        const { data: actor } = await supabase
          .from("profiles")
          .select("full_name, username, avatar_url")
          .eq("id", actorId)
          .maybeSingle();
        actorName = actor?.full_name || actor?.username || actorName;
        icon = actor?.avatar_url || undefined;
      }

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

      title = notificationType === "system"
        ? "Zero Club update"
        : notificationType === "game_buzz"
          ? `${actorName} is buzzing you`
          : actorName;
      body = payload.record?.content || actions[notificationType] || "You have a new notification.";
      url = notificationType === "follow"
        ? `/app/profile/${actorId}`
        : notificationType === "game_buzz" && payload.record?.entity_id
          ? `/app/games/${payload.record.entity_id}`
        : notificationType === "club_mention" && payload.record?.entity_id
          ? `/app/clubs/chat?clubId=${payload.record.entity_id}`
        : payload.record?.entity_id && ["like", "comment_like", "comment", "repost", "mention", "build_tagged"].includes(notificationType)
          ? `/app/post/${payload.record.entity_id}`
          : "/app/notifications";
    } else if (payload.record?.content) {
      // Auto-extract content from messages table trigger
      const content = payload.record.content;
      if (content.startsWith("CLUB_REQUEST:")) {
        const parts = content.split(":");
        title = "Club Request";
        body = `Request to join ${parts[2] || "Club"}`;
        url = "/app/notifications";
      } else if (content.startsWith("FUND_LINK:")) {
        const parts = content.split(":");
        title = "Wallet fund link";
        body = `${parts.slice(2).join(":") || "A Zero Club member"} sent you a wallet fund link`;
        url = `/app/chat/${payload.record.sender_id}`;
      } else {
        const senderId = payload.record.sender_id;
        const { data: sender } = senderId ? await supabase.from("profiles").select("full_name, username, avatar_url").eq("id", senderId).maybeSingle() : { data: null };
        title = sender?.full_name || sender?.username || "New message";
        body = content.length > 120 ? content.substring(0, 120) + "…" : content;
        url = `/app/chat/${senderId}`;
        icon = sender?.avatar_url || undefined;
        tag = `chat:${senderId}`;
      }
    }

    if (!receiverId) {
      throw new Error("Missing receiver_id");
    }

    // Get the user's push subscriptions
    const { data: subscriptions, error } = await supabase
      .from("push_subscriptions")
      .select("*")
      .eq("profile_id", receiverId);

    if (error) {
      throw error;
    }

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ message: "No subscriptions found for user" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const notificationType = payload.record?.type || payload.type || "notification";
    const pushPayload = JSON.stringify({ title, body, url, type: notificationType, icon, tag });
    const pushOptions = notificationType === "game_buzz"
      ? { urgency: "high" as const, TTL: 60 }
      : tag
        // Direct messages: delivered straight away even when the phone is
        // dozing, the way chat apps are, and kept for a day if it is offline.
        ? { urgency: "high" as const, TTL: 86400 }
        : undefined;
    const promises = [];

    // Send push notification to all of the user's devices
    for (const sub of subscriptions) {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          auth: sub.auth_key,
          p256dh: sub.p256dh_key,
        },
      };

      promises.push(
        webPush.sendNotification(pushSubscription, pushPayload, pushOptions).catch(async (err) => {
          console.error("Error sending push notification:", err);
          // If the subscription is no longer valid, delete it
          if (err.statusCode === 410 || err.statusCode === 404) {
            await supabase.from("push_subscriptions").delete().eq("id", sub.id);
          }
        })
      );
    }

    await Promise.all(promises);

    return new Response(JSON.stringify({ message: `Sent push to ${subscriptions.length} devices` }), {
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
