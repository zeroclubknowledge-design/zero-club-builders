import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

/*
 * The group call lives above the router, like the club live room, so it keeps
 * running while you minimise it and use the rest of Zero Club. Only this tiny
 * context is loaded up front; the Agora call screen downloads when a call starts.
 */

export type GroupCallSession = { groupId: string; video: boolean; key: number };

type Ctx = {
  session: GroupCallSession | null;
  minimized: boolean;
  start: (groupId: string, video: boolean) => void;
  minimize: () => void;
  restore: () => void;
  end: () => void;
};

const GroupCallContext = createContext<Ctx | null>(null);

export function GroupCallProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<GroupCallSession | null>(null);
  const [minimized, setMinimized] = useState(false);
  const currentSession = useRef(session);
  currentSession.current = session;

  const start = useCallback((groupId: string, video: boolean) => {
    if (currentSession.current && currentSession.current.groupId !== groupId) {
      toast.message("You're already in a call", { description: "Leave your current call before joining another group." });
      setMinimized(false);
      return;
    }
    setSession((current) => (current && current.groupId === groupId ? current : { groupId, video, key: Date.now() }));
    setMinimized(false);
  }, []);
  const minimize = useCallback(() => setMinimized(true), []);
  const restore = useCallback(() => setMinimized(false), []);
  const end = useCallback(() => {
    setSession(null);
    setMinimized(false);
  }, []);

  const value = useMemo(() => ({ session, minimized, start, minimize, restore, end }), [session, minimized, start, minimize, restore, end]);
  return <GroupCallContext.Provider value={value}>{children}</GroupCallContext.Provider>;
}

export function useGroupCall() {
  const ctx = useContext(GroupCallContext);
  if (!ctx) throw new Error("useGroupCall must be used inside GroupCallProvider");
  return ctx;
}
