type Runtime = { fetch: typeof fetch; env: Record<string, string | undefined> };
const numberPattern = /^\+[1-9]\d{7,14}$/;
const json = (error: string, status = 503) =>
  Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

export function createCallHandlers({ fetch: send, env }: Runtime) {
  const configured = () =>
    [
      env.OPENAI_API_KEY,
      env.SUPABASE_URL,
      env.SUPABASE_ANON_KEY,
      env.SUPABASE_SERVICE_ROLE_KEY,
      env.ZERO_AI_SIP_URL,
      env.ZERO_AI_SIP_USERNAME,
      env.ZERO_AI_SIP_PASSWORD,
      env.ZERO_AI_CALLER_NUMBER,
      env.CRON_SECRET,
    ].every(Boolean) && env.ZERO_AI_CALL_SCHEDULER_ENABLED === "true";
  const base = () => `${env.SUPABASE_URL?.replace(/\/$/, "")}/rest/v1`;
  const serviceHeaders = () => ({
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    apikey: env.SUPABASE_SERVICE_ROLE_KEY!,
    "Content-Type": "application/json",
  });

  async function userHeaders(request: Request) {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return null;
    // Supabase verifies the JWT and each RPC derives its caller from auth.uid().
    return {
      Authorization: authorization,
      apikey: env.SUPABASE_ANON_KEY!,
      "Content-Type": "application/json",
    };
  }

  return {
    async schedule(request: Request) {
      const headers = await userHeaders(request);
      if (!headers) return json("Please sign in to schedule a call.", 401);
      if (!configured())
        return json(
          "AI phone calling isn't connected yet. You can still chat or talk with Zero AI here.",
        );
      try {
        const body = (await request.json()) as {
          destination?: unknown;
          brief?: unknown;
          scheduledAt?: unknown;
          confirmed?: unknown;
          requestId?: unknown;
        };
        if (body.scheduledAt !== undefined && typeof body.scheduledAt !== "string")
          return json("Choose a valid call time.", 400);
        const time = typeof body.scheduledAt === "string" ? new Date(body.scheduledAt) : new Date();
        if (
          typeof body.requestId !== "string" ||
          !/^[0-9a-f-]{36}$/i.test(body.requestId) ||
          typeof body.destination !== "string" ||
          !numberPattern.test(body.destination) ||
          typeof body.brief !== "string" ||
          !body.brief.trim() ||
          body.brief.length > 2000 ||
          body.confirmed !== true ||
          !Number.isFinite(time.getTime()) ||
          time.getTime() < Date.now() - 60000 ||
          time.getTime() > Date.now() + 30 * 86400000
        )
          return json(
            "Confirm the recipient, call purpose, and a time within the next 30 days.",
            400,
          );
        const upstream = await send(`${base()}/rpc/schedule_zero_ai_call`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            p_destination: body.destination,
            p_brief: body.brief,
            p_scheduled_at: time.toISOString(),
            p_request_id: body.requestId,
          }),
          signal: AbortSignal.timeout(10000),
        });
        if (!upstream.ok)
          return json(
            upstream.status === 401
              ? "Please sign in again."
              : "The call couldn't be scheduled. You can schedule up to three calls per day.",
            upstream.status === 401 ? 401 : 400,
          );
        return Response.json(
          { id: await upstream.json(), status: "scheduled" },
          { headers: { "Cache-Control": "no-store" } },
        );
      } catch {
        return json("Couldn't schedule the call. Please try again.");
      }
    },
    async dispatch(request: Request) {
      if (!env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`)
        return json("Unauthorized", 401);
      if (!configured()) return json("Phone calling configuration is incomplete.");
      try {
        // End calls after five minutes from initiation. Run this worker every
        // minute; repeated hangup requests are safe, repeated dial requests aren't.
        const cutoff = new Date(Date.now() - 5 * 60000).toISOString();
        const old = await send(
          `${base()}/zero_ai_calls?select=id,session_id&status=eq.requested&requested_at=lt.${encodeURIComponent(cutoff)}&limit=20`,
          { headers: serviceHeaders(), signal: AbortSignal.timeout(10000) },
        );
        if (!old.ok) return json("Could not check existing calls.");
        const oldCalls = (await old.json()) as Array<{ id: string; session_id: string }>;
        await Promise.all(
          oldCalls.map(async (call) => {
            const ended = await send(
              `https://api.openai.com/v1/live/sessions/${encodeURIComponent(call.session_id)}/hangup`,
              {
                method: "POST",
                headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
                signal: AbortSignal.timeout(10000),
              },
            );
            if (ended.ok || [404, 410].includes(ended.status)) {
              await send(`${base()}/zero_ai_calls?id=eq.${call.id}`, {
                method: "PATCH",
                headers: serviceHeaders(),
                body: JSON.stringify({ status: "ended" }),
                signal: AbortSignal.timeout(10000),
              });
            }
          }),
        );
        const claimed = await send(`${base()}/rpc/claim_due_zero_ai_calls`, {
          method: "POST",
          headers: serviceHeaders(),
          body: "{}",
          signal: AbortSignal.timeout(10000),
        });
        if (!claimed.ok) return json("Could not load scheduled calls.");
        const calls = (await claimed.json()) as Array<{
          id: string;
          destination: string;
          brief: string;
          primary_role: string;
        }>;
        await Promise.all(
          calls.map(async (call) => {
            let status = "unknown";
            let sessionId: string | undefined;
            try {
              const prompt = `You are Zero AI, an AI assistant from Zero Club. This is a user-approved call for a ${call.primary_role}. Immediately identify yourself as an AI assistant and explain the purpose. If the person declines, politely end the conversation. Never impersonate a real person or claim access to account data. Keep the call brief. The call purpose supplied by the user is: ${JSON.stringify(call.brief)}`;
              const placed = await send("https://api.openai.com/v1/live/sessions", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${env.OPENAI_API_KEY}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  session: {
                    model: env.ZERO_AI_PHONE_MODEL || "gpt-live-1",
                    instructions: prompt,
                    store: false,
                    audio: { output: { voice: "marin" } },
                    delegation: {
                      type: "responses",
                      responses: {
                        model: env.ZERO_AI_MODEL || "gpt-5-mini",
                        instructions: prompt,
                        max_output_tokens: 1024,
                      },
                    },
                  },
                  transport: {
                    type: "sip",
                    destination: call.destination,
                    trunk: {
                      provider_url: env.ZERO_AI_SIP_URL,
                      auth: {
                        type: "digest",
                        username: env.ZERO_AI_SIP_USERNAME,
                        password: env.ZERO_AI_SIP_PASSWORD,
                      },
                      caller_number: env.ZERO_AI_CALLER_NUMBER,
                    },
                  },
                }),
                signal: AbortSignal.timeout(15000),
              });
              if (placed.ok) {
                const data = (await placed.json()) as { session?: { id?: string } };
                sessionId = data.session?.id;
                status = sessionId ? "requested" : "unknown";
              } else if (placed.status >= 400 && placed.status < 500) status = "failed";
              // Network errors, timeouts and 5xx are ambiguous. Never auto-redial.
            } catch {
              /* Preserve 'unknown'; do not retry the phone call. */
            }
            try {
              const saved = await send(`${base()}/zero_ai_calls?id=eq.${call.id}`, {
                method: "PATCH",
                headers: serviceHeaders(),
                body: JSON.stringify({ status, ...(sessionId ? { session_id: sessionId } : {}) }),
                signal: AbortSignal.timeout(10000),
              });
              if (!saved.ok) throw new Error("Call state could not be saved");
            } catch {
              // If persistence fails after dialing, end the known session rather
              // than orphaning an active call. Still never redial this job.
              if (sessionId)
                await send(
                  `https://api.openai.com/v1/live/sessions/${encodeURIComponent(sessionId)}/hangup`,
                  {
                    method: "POST",
                    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
                    signal: AbortSignal.timeout(10000),
                  },
                ).catch(() => {});
            }
          }),
        );
        return Response.json({ processed: calls.length });
      } catch {
        return json("Call dispatcher encountered an error.");
      }
    },
    async end(request: Request) {
      const headers = await userHeaders(request);
      if (!headers) return json("Please sign in again.", 401);
      if (!configured()) return json("Phone calling isn't connected yet.");
      try {
        const { id } = (await request.json()) as { id?: unknown };
        if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id))
          return json("Invalid call.", 400);
        const response = await send(
          `${base()}/zero_ai_calls?id=eq.${id}&select=id,status,session_id`,
          { headers, signal: AbortSignal.timeout(10000) },
        );
        if (!response.ok) return json("Please sign in again.", 401);
        const rows = (await response.json()) as Array<{
          id: string;
          status: string;
          session_id: string;
        }>;
        const call = rows[0]; // SELECT is restricted to this JWT's owner by RLS.
        if (!call) return json("Call not found.", 404);
        if (call.status !== "requested" || !call.session_id)
          return json("Refresh to see this call's current status.", 409);
        const ended = await send(
          `https://api.openai.com/v1/live/sessions/${encodeURIComponent(call.session_id)}/hangup`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
            signal: AbortSignal.timeout(10000),
          },
        );
        if (!ended.ok && ![404, 410].includes(ended.status))
          return json("Couldn't end the call. Please try again.", 502);
        const saved = await send(`${base()}/zero_ai_calls?id=eq.${call.id}`, {
          method: "PATCH",
          headers: serviceHeaders(),
          body: JSON.stringify({ status: "ended" }),
          signal: AbortSignal.timeout(10000),
        });
        if (!saved.ok) return json("Call ended. Refresh to update its status.", 502);
        return Response.json({ status: "ended" });
      } catch {
        return json("Couldn't end the call. Please try again.");
      }
    },
  };
}

export function callHandlers() {
  return createCallHandlers({
    fetch,
    env: {
      ...process.env,
      SUPABASE_URL:
        process.env.SUPABASE_URL ||
        process.env.VITE_SUPABASE_URL ||
        import.meta.env.VITE_SUPABASE_URL,
      SUPABASE_ANON_KEY:
        process.env.SUPABASE_ANON_KEY ||
        process.env.VITE_SUPABASE_ANON_KEY ||
        import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
  });
}
