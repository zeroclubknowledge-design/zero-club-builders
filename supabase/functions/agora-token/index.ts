import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { RtcTokenBuilder, RtcRole } from "npm:agora-token";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { channelName, uid } = await req.json();

    if (!channelName) {
      return new Response(
        JSON.stringify({ error: 'channelName is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const appID = Deno.env.get('AGORA_APP_ID') || 'bfd9392ddcbc425e8946e8011ac2820b';
    const appCertificate = Deno.env.get('AGORA_APP_CERTIFICATE');

    if (!appCertificate) {
      return new Response(
        JSON.stringify({ error: 'AGORA_APP_CERTIFICATE is not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const role = RtcRole.PUBLISHER;
    // Token expires in 2 hours
    const expirationTimeInSeconds = 3600 * 2;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

    // Use string type for UID in token builder if UID is a string, else use 0 for string UIDs
    // Usually user.id (UUID) is a string, so we map it to an integer UID or use the string token builder
    let numericUid = 0;
    if (uid && typeof uid === 'number') {
      numericUid = uid;
    }

    const token = RtcTokenBuilder.buildTokenWithUid(
      appID,
      appCertificate,
      channelName,
      numericUid,
      role,
      expirationTimeInSeconds,
      privilegeExpiredTs
    );

    return new Response(
      JSON.stringify({ token }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
