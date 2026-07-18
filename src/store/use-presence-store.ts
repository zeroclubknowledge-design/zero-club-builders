import { useSyncExternalStore } from 'react';

interface PresenceStore {
  channels: Record<string, any>;
  presenceStates: Record<string, any>;
  setPresenceState: (channelId: string, state: any) => void;
  registerChannel: (channelId: string, channel: any) => void;
}

type PresenceStoreHook = {
  (): PresenceStore;
  setState: (updater: Partial<PresenceStore> | ((state: PresenceStore) => Partial<PresenceStore>)) => void;
  getState: () => PresenceStore;
  subscribe: (listener: () => void) => () => boolean;
};

const store: PresenceStore = {
  channels: {},
  presenceStates: {},
  setPresenceState: (channelId: string, state: any) => {
    store.presenceStates = {
      ...store.presenceStates,
      [channelId]: state,
    };
    emitChange();
  },
  registerChannel: (channelId: string, channel: any) => {
    store.channels = {
      ...store.channels,
      [channelId]: channel,
    };
    emitChange();
  },
};

const listeners = new Set<() => void>();

function emitChange() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return store;
}

function usePresenceStoreHook(): PresenceStore {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export const usePresenceStore = usePresenceStoreHook as PresenceStoreHook;

usePresenceStore.setState = (updater) => {
  const next = typeof updater === 'function' ? updater(store) : updater;
  Object.assign(store, next);
  emitChange();
};

usePresenceStore.getState = () => store;

usePresenceStore.subscribe = subscribe;
