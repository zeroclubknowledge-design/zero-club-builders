import { createContext, useContext, useState, useCallback, useMemo } from "react";

interface LiveSessionState {
  isActive: boolean;
  isMinimized: boolean;
  channelId: string | null;
  userName: string | null;
  userAvatar: string | null;
  micOn: boolean;
}

interface LiveSessionContextValue extends LiveSessionState {
  /** Mark that a live session is active (called when entering the live room) */
  startSession: (channelId: string, userName: string, userAvatar: string | null) => void;
  /** Minimize the live view – user navigates elsewhere but session indicator stays */
  minimize: () => void;
  /** Restore the full live view */
  restore: () => void;
  /** Fully end the session */
  endSession: () => void;
  /** Update mic state so the mini player reflects it */
  setMicState: (on: boolean) => void;
}

const LiveSessionContext = createContext<LiveSessionContextValue | null>(null);

export function useLiveSession() {
  const ctx = useContext(LiveSessionContext);
  if (!ctx) throw new Error("useLiveSession must be used within LiveSessionProvider");
  return ctx;
}

export function LiveSessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<LiveSessionState>({
    isActive: false,
    isMinimized: false,
    channelId: null,
    userName: null,
    userAvatar: null,
    micOn: true,
  });

  const startSession = useCallback((channelId: string, userName: string, userAvatar: string | null) => {
    setState({
      isActive: true,
      isMinimized: false,
      channelId,
      userName,
      userAvatar,
      micOn: true,
    });
  }, []);

  const minimize = useCallback(() => {
    setState((s) => ({ ...s, isMinimized: true }));
  }, []);

  const restore = useCallback(() => {
    setState((s) => ({ ...s, isMinimized: false }));
  }, []);

  const endSession = useCallback(() => {
    setState({
      isActive: false,
      isMinimized: false,
      channelId: null,
      userName: null,
      userAvatar: null,
      micOn: true,
    });
  }, []);

  const setMicState = useCallback((on: boolean) => {
    setState((s) => ({ ...s, micOn: on }));
  }, []);

  /* Memoised so the value only changes when the session actually changes.
     Spreading a fresh object on every render made every consumer's effects
     re-run constantly, which is how pressing Leave once could immediately
     restart the call. */
  const value = useMemo(
    () => ({ ...state, startSession, minimize, restore, endSession, setMicState }),
    [state, startSession, minimize, restore, endSession, setMicState],
  );

  return (
    <LiveSessionContext.Provider value={value}>
      {children}
    </LiveSessionContext.Provider>
  );
}
