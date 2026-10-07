import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export interface PresentationRequest {
  id: string;
  uid: string;
  expiresAt: number;
}

/** Requests belong to a call connection, so a rejoin cannot reuse an approval. */
export function usePresentationRequests({ uid, isAdmin, peers, channelRef, options }: {
  uid: string;
  isAdmin: boolean;
  peers: Array<{ uid: string; isAdmin: boolean }>;
  channelRef: { current: any };
  /** autoStarts: true when a screen is already chosen and will go live on approval. */
  options?: { autoStarts?: () => boolean };
}) {
  const [request, setRequest] = useState<(PresentationRequest & { approved: boolean }) | null>(null);
  const [incoming, setIncoming] = useState<PresentationRequest[]>([]);
  const [busy, setBusy] = useState(false);
  const current = useRef(request);
  current.current = request;
  const sending = useRef(false);

  const send = async (payload: object) => {
    if (channelRef.current?.state !== "joined") throw new Error("Not connected");
    const status = await channelRef.current.send({ type: "broadcast", event: "presentation-request", payload });
    if (status !== "ok") throw new Error("Not delivered");
  };

  const receive = (payload: any) => {
    if (!payload || typeof payload.id !== "string" || typeof payload.uid !== "string") return;
    if (payload.action === "request" && isAdmin && peers.some(p => p.uid === payload.uid && !p.isAdmin)) {
      if (!Number.isFinite(payload.expiresAt) || payload.expiresAt <= Date.now() || payload.expiresAt > Date.now() + 65000) return;
      setIncoming(items => [...items.filter(item => item.uid !== payload.uid), {
        id: payload.id, uid: payload.uid, expiresAt: payload.expiresAt,
      }]);
    }
    if (payload.action === "cancel") {
      setIncoming(items => items.filter(item => item.id !== payload.id || item.uid !== payload.uid));
    }
    if ((payload.action === "accept" || payload.action === "decline") && peers.some(p => p.uid === payload.by && p.isAdmin)) {
      setIncoming(items => items.filter(item => item.id !== payload.id));
      const pending = current.current;
      if (!pending || payload.uid !== uid || pending.id !== payload.id || pending.expiresAt <= Date.now() || pending.approved) return;
      const next = payload.action === "accept" ? { ...pending, approved: true, expiresAt: Date.now() + 60000 } : null;
      current.current = next;
      setRequest(next);
      // GlobalLiveRoom puts an already-chosen screen live straight away and says so.
      if (next && !options?.autoStarts?.()) toast.success("Your tutor approved. Click Start presenting to choose your screen.");
      else toast.info("Your tutor declined the screen-sharing request.");
    }
  };

  useEffect(() => {
    const timer = setInterval(() => {
      const pending = current.current;
      if (pending && pending.expiresAt <= Date.now()) {
        current.current = null;
        setRequest(null);
        toast.info("Your screen-sharing request expired. You can request again.");
      }
      setIncoming(items => items.some(item => item.expiresAt <= Date.now())
        ? items.filter(item => item.expiresAt > Date.now()) : items);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setIncoming(items => items.filter(item => peers.some(p => p.uid === item.uid)));
    if (!peers.some(p => p.isAdmin) && current.current) {
      current.current = null;
      setRequest(null);
    }
  }, [peers]);

  /** Sends a request, or cancels the pending one. Resolves true when a request is now waiting. */
  const askOrCancel = async (): Promise<boolean> => {
    if (sending.current) return false;
    if (!uid || !peers.some(p => p.isAdmin)) {
      toast.info("Wait for your tutor to join before requesting to present.");
      return false;
    }
    sending.current = true;
    setBusy(true);
    const previous = current.current;
    const next = previous ? null : { id: crypto.randomUUID(), uid, expiresAt: Date.now() + 60000, approved: false };
    current.current = next;
    setRequest(next);
    try {
      await send({ ...(previous || next), action: previous ? "cancel" : "request" });
      return Boolean(next);
    } catch {
      current.current = previous;
      setRequest(previous);
      toast.error("Could not send your request. Check your connection and try again.");
      return false;
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  const decide = async (item: PresentationRequest, accept: boolean) => {
    if (!isAdmin || sending.current || item.expiresAt <= Date.now()) return;
    sending.current = true;
    setBusy(true);
    try {
      await send({ ...item, by: uid, action: accept ? "accept" : "decline" });
      setIncoming(items => items.filter(p => p.id !== item.id));
    } catch {
      toast.error("Could not deliver your response. Please try again.");
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  const consume = () => { current.current = null; setRequest(null); };
  const canStart = () => !!current.current?.approved && current.current.expiresAt > Date.now();
  return { request, incoming, busy, receive, askOrCancel, decide, consume, canStart };
}
