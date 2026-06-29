import { create } from 'zustand';

interface PresenceStore {
  channels: Record<string, any>;
  presenceStates: Record<string, any>;
  setPresenceState: (channelId: string, state: any) => void;
  registerChannel: (channelId: string, channel: any) => void;
}

export const usePresenceStore = create<PresenceStore>((set) => ({
  channels: {},
  presenceStates: {},
  setPresenceState: (channelId, state) => set((prev) => ({
    presenceStates: {
      ...prev.presenceStates,
      [channelId]: state
    }
  })),
  registerChannel: (channelId, channel) => set((prev) => ({
    channels: {
      ...prev.channels,
      [channelId]: channel
    }
  }))
}));
