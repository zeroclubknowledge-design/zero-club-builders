type Uid = string | number;
type Client = {
  connectionState: string;
  uid?: Uid;
  channelName?: string;
  join: (appId: string, channel: string, token: string, uid?: Uid | null) => Promise<Uid>;
  renewToken: (token: string) => Promise<void>;
  leave: () => Promise<void>;
  on: (name: any, listener: any) => any;
  off: (name: any, listener: any) => any;
};

export function callConnectionMessage(error: unknown): string {
  const text = String((error as { message?: unknown })?.message || error || "");
  if (/CAN_NOT_GET_GATEWAY_SERVER|CAN_NOT_GET_PROXY_SERVER/i.test(text)) {
    return "The video service could not connect this call. Try reconnecting or switching networks. If it continues, Zero Club needs to check its Agora service settings.";
  }
  if (/TOKEN|INVALID_VENDOR|INVALID_APP|certificate|vendor key/i.test(text)) {
    return "The call service could not authorize this connection. Reconnect to request a new access token. If it continues, Zero Club needs to check its Agora credentials.";
  }
  if (/UID_BANNED|IP_BANNED|CHANNEL_BANNED|LICENSE_/i.test(text)) {
    return "The video service is not allowing this call. Zero Club needs to check its Agora project status and service access.";
  }
  return "The call connection was interrupted. Check your internet connection and try reconnecting.";
}

function terminal(error: unknown) {
  return /UID_BANNED|IP_BANNED|CHANNEL_BANNED|LICENSE_|INVALID_APP_ID|invalid vendor key|invalid token|dynamic use static key/i.test(String((error as any)?.message || error));
}

export type RtcRecoveryState = { state: string; message: string | null; retrying: boolean };

/** Repairs a failed connection without closing the participant's capture tracks. */
export function createRtcRecovery({ client, appId, channel, uid, loadToken, restoreMedia, isLeaving, onChange, delays = [1500, 3000, 6000] }: {
  client: Client;
  appId: string;
  channel: string;
  uid?: Uid;
  loadToken: (uid: Uid | undefined, signal: AbortSignal) => Promise<string>;
  restoreMedia?: () => Promise<void>;
  isLeaving: () => boolean;
  onChange: (state: RtcRecoveryState) => void;
  delays?: number[];
}) {
  let disposed = false;
  let attempt = 0;
  let lastUid = uid || client.uid;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: Promise<void> | null = null;
  let request: AbortController | null = null;
  let message: string | null = null;
  let connectedBefore = client.connectionState === "CONNECTED";
  const active = () => !disposed && !isLeaving();
  const report = () => { if (active()) onChange({ state: client.connectionState, message, retrying: !!pending || timer !== undefined }); };
  const clearTimer = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined; };
  const schedule = () => {
    if (!active() || timer !== undefined || attempt >= delays.length) return;
    timer = setTimeout(() => { timer = undefined; attempt++; void recover(); }, delays[attempt]);
    report();
  };
  const failed = (error: unknown) => {
    if (!active()) return;
    message = callConnectionMessage(error);
    if (terminal(error)) { attempt = delays.length; clearTimer(); }
    else schedule();
    report();
  };
  const recover = (): Promise<void> => {
    if (pending) return pending;
    if (!active() || client.connectionState === "CONNECTING") return Promise.resolve();
    clearTimer();
    request = new AbortController();
    const timeout = setTimeout(() => request?.abort(), 15000);
    const run = async () => {
      try {
        const token = await loadToken(lastUid, request!.signal);
        if (!active()) return;
        if (client.connectionState === "DISCONNECTED") {
          const restorePublishedTracks = connectedBefore;
          const joinedUid = await client.join(appId, channel, token, lastUid || null);
          lastUid = joinedUid;
          if (!active()) { if (!client.channelName || client.channelName === channel) await client.leave(); return; }
          if (restorePublishedTracks) await restoreMedia?.();
        } else if (client.connectionState === "CONNECTED" || client.connectionState === "RECONNECTING") {
          await client.renewToken(token);
        }
        if (active()) message = null;
      } catch (error) { failed(error); }
      finally { clearTimeout(timeout); request = null; }
    };
    pending = run().finally(() => { pending = null; report(); });
    report();
    return pending;
  };
  const onState = (state: string, _previous: string, reason?: string) => {
    if (!active()) return;
    if (state === "CONNECTED") {
      connectedBefore = true;
      lastUid = uid || client.uid || lastUid;
      attempt = 0; message = null; clearTimer();
    } else if (state === "DISCONNECTED" && reason !== "LEAVE" && !pending) {
      failed(reason || "Connection interrupted");
    }
    report();
  };
  const onExpiry = () => { void recover(); };
  client.on("connection-state-change", onState);
  client.on("token-privilege-will-expire", onExpiry);
  client.on("token-privilege-did-expire", onExpiry);
  report();
  return {
    failed,
    retry: () => { attempt = 0; return recover(); },
    resume: () => { if (client.connectionState === "DISCONNECTED" && attempt < delays.length) schedule(); },
    dispose: () => {
      disposed = true; clearTimer(); request?.abort();
      client.off("connection-state-change", onState);
      client.off("token-privilege-will-expire", onExpiry);
      client.off("token-privilege-did-expire", onExpiry);
    },
  };
}
