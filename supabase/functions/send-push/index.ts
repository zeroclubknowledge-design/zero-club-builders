import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import webPush from "npm:web-push@3.6.4";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

    webPush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Read payload from the trigger/webhook or client request
    const payload = await req.json();
    
    let receiverId = payload.record?.receiver_id; // from database webhook (messages table)
    let title = "Zero Club";
    let body = "You have a new message.";
    let url = "/app/chat";

    // If payload is sent from the client directly
    if (payload.profile_id) {
      receiverId = payload.profile_id;
      title = payload.title || title;
      body = payload.body || body;
      url = payload.url || url;
    } else if (payload.record?.content) {
      // Auto-extract content from messages table trigger
      const content = payload.record.content;
      if (content.startsWith("CLUB_REQUEST:")) {
        const parts = content.split(":");
        title = "Club Request";
        body = `Request to join ${parts[2] || "Club"}`;
        url = "/app/notifications";
      } else {
        title = "New Message";
        body = content.length > 50 ? content.substring(0, 50) + "..." : content;
        url = `/app/chat/${payload.record.sender_id}`;
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

    const pushPayload = JSON.stringify({ title, body, url });
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
        webPush.sendNotification(pushSubscription, pushPayload).catch(async (err) => {
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
