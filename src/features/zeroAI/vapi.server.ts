import { timingSafeEqual } from "node:crypto";
import type { PublicationAttempt } from "./publication.types";

type Runtime = { fetch: typeof fetch; env: Record<string, string | undefined> };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const failure = (error: string, status = 503) => reply({ error }, status);

async function bodyOf(request: Request) {
  if (Number(request.headers.get("content-length") || 0) > 100000)
    throw new Error("Payload too large");
  const text = await request.text();
  if (text.length > 100000) throw new Error("Payload too large");
  return JSON.parse(text);
}

function sameSecret(actual: string, expected: string) {
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Only the server creates calls. The browser cannot select the assistant,
 * override its tools/prompt, or bind a different call to a publication attempt. */
export function createVapiHandlers({ fetch: send, env }: Runtime) {
  const base = () => `${env.SUPABASE_URL?.replace(/\/$/, "")}/rest/v1`;
  const userHeaders = (token: string) => ({
    Authorization: token,
    apikey: env.SUPABASE_ANON_KEY!,
    "Content-Type": "application/json",
  });
  const serviceHeaders = () => ({
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    apikey: env.SUPABASE_SERVICE_ROLE_KEY!,
    "Content-Type": "application/json",
  });
  async function rpc(name: string, body: unknown, headers: Record<string, string>) {
    const response = await send(`${base()}/rpc/${name}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("Database request failed");
    return response.json();
  }
  async function vapi(path: string, init: RequestInit = {}) {
    return send(`https://api.vapi.ai${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${env.VAPI_PRIVATE_KEY}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(20000),
    });
  }

  return {
    async session(request: Request) {
      try {
        const token = request.headers.get("authorization") || "";
        if (!token.startsWith("Bearer ") || token.length > 8192)
          return failure("Please sign in to talk to Zero AI.", 401);
        if (
          !env.VAPI_PRIVATE_KEY ||
          !env.VITE_VAPI_PUBLIC_KEY ||
          !env.SUPABASE_URL ||
          !env.SUPABASE_ANON_KEY
        )
          return failure("Voice isn't connected yet. You can still use text chat.");
        const body = await bodyOf(request);
        const verification = body.purpose === "verification";
        if (!verification && body.purpose !== "conversation")
          return failure("Invalid voice request.", 400);
        if (verification && !uuid.test(body.verificationId || ""))
          return failure("Invalid confirmation.", 400);
        const assistantId = verification
          ? env.VAPI_VERIFICATION_ASSISTANT_ID
          : env.VAPI_ASSISTANT_ID;
        if (
          !assistantId ||
          (verification &&
            (!env.SUPABASE_SERVICE_ROLE_KEY ||
              !env.VAPI_WEBHOOK_SECRET ||
              !env.VAPI_VERIFICATION_TOOL_ID ||
              !env.APP_PUBLIC_URL))
        )
          return failure("Voice isn't connected yet. Use text confirmation instead.");
        const userResponse = await send(`${env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1/user`, {
          headers: userHeaders(token),
          signal: AbortSignal.timeout(10000),
        });
        if (!userResponse.ok) return failure("Your session expired. Sign in again.", 401);
        const user = await userResponse.json();
        if (!uuid.test(user.id || "")) return failure("Please sign in again.", 401);
        const quota = await rpc("claim_zero_ai_request", { p_kind: "voice" }, userHeaders(token));
        if (!quota)
          return failure("You have used today's voice sessions. Text is still available.", 429);
        const assistantResponse = await vapi(`/assistant/${encodeURIComponent(assistantId)}`);
        if (!assistantResponse.ok)
          return failure("Couldn't connect to Zero AI voice. Try text instead.");
        const assistant = await assistantResponse.json();
        if (assistant.model?.provider !== "openai" || !/^gpt-/.test(assistant.model?.model || ""))
          return failure("Zero AI voice needs its GPT assistant configured.");
        let variables: Record<string, string>;
        let attempt: PublicationAttempt | undefined;
        if (verification) {
          const webhookUrl = `${env.APP_PUBLIC_URL!.replace(/\/$/, "")}/api/zero-ai/vapi/webhook`;
          // Credential-bearing URLs must be saved in Vapi, not supplied in call overrides.
          if (
            assistant.server?.url !== webhookUrl ||
            !assistant.server?.credentialId ||
            !assistant.model?.toolIds?.includes(env.VAPI_VERIFICATION_TOOL_ID)
          )
            return failure(
              "Voice confirmation needs its secure webhook configured. Use text instead.",
            );
          const toolResponse = await vapi(
            `/tool/${encodeURIComponent(env.VAPI_VERIFICATION_TOOL_ID!)}`,
          );
          if (!toolResponse.ok)
            return failure("Voice confirmation is unavailable. Use text instead.");
          const tool = await toolResponse.json();
          if (
            tool.function?.name !== "record_shipment_confirmation" ||
            tool.server?.url !== webhookUrl ||
            !tool.server?.credentialId ||
            tool.async === true
          )
            return failure(
              "Voice confirmation needs its secure tool configured. Use text instead.",
            );
          attempt = await rpc(
            "reserve_project_voice_confirmation",
            { p_id: body.verificationId },
            userHeaders(token),
          );
          variables = {
            project_name: attempt!.project_name,
            project_action: attempt!.target_id ? "update" : "publish",
            project_version: attempt!.payload.version_label,
            project_visibility:
              attempt!.payload.audience === "club" ? "bootcamp club only" : "public",
            project_license: attempt!.payload.available_for_use
              ? `${attempt!.payload.license_type} at ${attempt!.payload.license_price} ZP`
              : "not offered for reuse",
            verification_id: attempt!.id,
          };
        } else {
          const profileResponse = await send(
            `${base()}/profiles?id=eq.${user.id}&select=account_type,active_mode`,
            { headers: userHeaders(token), signal: AbortSignal.timeout(10000) },
          );
          if (!profileResponse.ok) return failure("Couldn't load your account. Please try again.");
          const profile = (await profileResponse.json())[0];
          const account = String(profile?.account_type || "learner").toLowerCase();
          variables = {
            account_role:
              account === "institution"
                ? "institution"
                : account === "tutor"
                  ? "tutor"
                  : profile?.active_mode === "creator"
                    ? "creator"
                    : "learner",
          };
        }
        const created = await vapi("/call/web", {
          method: "POST",
          body: JSON.stringify({
            assistantId,
            assistantOverrides: {
              variableValues: variables,
              maxDurationSeconds: verification ? 120 : 600,
            },
            roomDeleteOnUserLeaveEnabled: true,
          }),
        });
        if (!created.ok) return failure("Couldn't start voice. Please use text or try again.", 502);
        const call = await created.json();
        let joinUrl: URL;
        try {
          joinUrl = new URL(call.webCallUrl);
        } catch {
          return failure("Couldn't connect to voice.", 502);
        }
        if (
          !uuid.test(call.id || "") ||
          joinUrl.protocol !== "https:" ||
          !joinUrl.hostname.endsWith(".daily.co")
        )
          return failure("Couldn't connect to voice.", 502);
        if (attempt) {
          const bound = await rpc(
            "bind_project_voice_call",
            { p_id: attempt.id, p_call_id: call.id },
            serviceHeaders(),
          );
          if (bound !== true) return failure("This confirmation ended. Start a new attempt.", 409);
        }
        // Do not return private provider credentials, controls, or the full call record.
        return reply({
          publicKey: env.VITE_VAPI_PUBLIC_KEY,
          call: { id: call.id, webCallUrl: call.webCallUrl },
          maxDurationSeconds: verification ? 120 : 600,
        });
      } catch {
        return failure("Couldn't connect to voice. You can use text instead.");
      }
    },

    async webhook(request: Request) {
      if (!env.VAPI_WEBHOOK_SECRET || !env.SUPABASE_SERVICE_ROLE_KEY || !env.SUPABASE_URL)
        return failure("Webhook is not configured.");
      if (
        !sameSecret(request.headers.get("authorization") || "", `Bearer ${env.VAPI_WEBHOOK_SECRET}`)
      )
        return failure("Unauthorized webhook.", 401);
      try {
        const { message } = await bodyOf(request);
        const call = message?.call;
        if (!uuid.test(call?.id || "") || call?.assistantId !== env.VAPI_VERIFICATION_ASSISTANT_ID)
          return failure("Unrecognized verification call.", 400);
        if (message.type === "tool-calls") {
          if (!Array.isArray(message.toolCallList) || message.toolCallList.length > 10)
            return failure("Invalid tool request.", 400);
          const results = [];
          for (const tool of message.toolCallList) {
            try {
              const args =
                typeof tool.function?.arguments === "string"
                  ? JSON.parse(tool.function.arguments)
                  : tool.function?.arguments;
              if (
                tool.function?.name !== "record_shipment_confirmation" ||
                !["approved", "denied"].includes(args?.decision)
              )
                throw new Error("Invalid decision");
              const status = await rpc(
                "record_project_voice_decision",
                { p_call_id: call.id, p_decision: args.decision },
                serviceHeaders(),
              );
              results.push({
                toolCallId: tool.id,
                result: JSON.stringify({
                  status,
                  message:
                    status === "approved"
                      ? "Confirmation recorded. The user can publish the reviewed project."
                      : "Project remains unpublished.",
                }),
              });
            } catch {
              results.push({
                toolCallId: tool.id,
                error:
                  "Confirmation couldn't be recorded. The project remains locked; use the app's text confirmation.",
              });
            }
          }
          return reply({ results });
        }
        if (
          message.type === "end-of-call-report" ||
          (message.type === "status-update" && message.status === "ended")
        ) {
          await rpc(
            "record_project_voice_decision",
            { p_call_id: call.id, p_decision: "cancelled" },
            serviceHeaders(),
          );
        }
        return reply({ received: true });
      } catch {
        return failure("Couldn't process verification event.", 502);
      }
    },
  };
}

export function vapiHandlers() {
  return createVapiHandlers({
    fetch,
    env: {
      ...process.env,
      VITE_VAPI_PUBLIC_KEY:
        process.env.VITE_VAPI_PUBLIC_KEY || import.meta.env.VITE_VAPI_PUBLIC_KEY,
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
