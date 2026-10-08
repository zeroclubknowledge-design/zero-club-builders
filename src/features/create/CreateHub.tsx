import { useSyncExternalStore } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  ChevronRight,
  Loader2,
  NotebookPen,
  PenLine,
  Radio,
  Rocket,
} from "@/components/icons/glyphs";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/hooks/useUser";

/**
 * The "Create something" sheet and the "Go live" picker.
 *
 * They live in the app shell, not on the Home feed. The Post tab used to
 * navigate to the feed and let the feed open the sheet, so tapping Post on
 * any other page meant loading and drawing the whole feed first — the lag
 * people felt. Now the tab flips a flag and the sheet opens on the same tap,
 * wherever you are.
 */

type HubState = { create: boolean; live: boolean };
let state: HubState = { create: false, live: false };
const listeners = new Set<() => void>();
const setState = (next: Partial<HubState>) => {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const openCreateSheet = () => setState({ create: true, live: false });
export const openLivePicker = () => setState({ create: false, live: true });

type LiveClub = {
  id: string;
  name?: string;
  banner_url?: string | null;
  creator_id?: string;
  member_role?: string;
};

/** Clubs you own or belong to. The feed's live section shares this cache. */
export function useLiveClubs(profileId?: string) {
  return useQuery({
    queryKey: ["feed_live_clubs", profileId],
    enabled: Boolean(profileId),
    staleTime: 1000 * 60 * 3,
    queryFn: async (): Promise<LiveClub[]> => {
      const [ownedResult, membershipsResult] = await Promise.all([
        supabase.from("clubs").select("*").eq("creator_id", profileId!),
        supabase.from("club_members").select("role, clubs(*)").eq("profile_id", profileId!),
      ]);
      const clubsById = new Map<string, LiveClub>();
      (ownedResult.data || []).forEach((club: LiveClub) =>
        clubsById.set(club.id, { ...club, member_role: "Administrator" }),
      );
      for (const membership of (membershipsResult.data || []) as unknown as {
        role?: string;
        clubs?: LiveClub | null;
      }[]) {
        if (membership.clubs)
          clubsById.set(membership.clubs.id, { ...membership.clubs, member_role: membership.role });
      }
      return Array.from(clubsById.values());
    },
  });
}

const OPTIONS = [
  {
    to: "/app/compose",
    Icon: PenLine,
    label: "Post",
    copy: "Start a conversation",
    tint: "bg-foreground/[0.06] text-foreground",
  },
  {
    to: "/app/ship",
    Icon: Rocket,
    label: "Ship",
    copy: "Share proof of work",
    tint: "bg-[#cc208f]/10 text-[#cc208f]",
  },
  {
    to: "/app/notes/create",
    Icon: NotebookPen,
    label: "Note",
    copy: "Write something longer",
    tint: "bg-[#1a7f4b]/10 text-[#1a7f4b]",
  },
] as const;

const ROW =
  "flex w-full items-center gap-3.5 px-4 py-3 text-left transition-colors hover:bg-foreground/[0.04] active:bg-foreground/[0.06]";

export function CreateHub() {
  const { create, live } = useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
  const router = useRouter();
  const { data: profile } = useUser();
  const { data: liveClubs = [], isLoading } = useLiveClubs(profile?.id);
  const hostClubs = liveClubs.filter(
    (club) =>
      club.creator_id === profile?.id ||
      ["administrator", "admin", "moderator"].includes((club.member_role || "").toLowerCase()),
  );

  const openLiveRoom = (clubId: string) => {
    setState({ live: false });
    router.navigate({ to: "/app/live/$classId", params: { classId: clubId } });
  };

  return (
    <>
      <Drawer
        open={create}
        // The rows below preload their screens as soon as the sheet renders,
        // so the next tap opens the editor straight away.
        onOpenChange={(open) => setState({ create: open })}
      >
        <DrawerContent className="mx-auto max-h-[72dvh] w-full max-w-[520px] overflow-hidden rounded-t-lg border border-border bg-background p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] focus:ring-0">
          <div className="pb-2 pt-1">
            <DrawerTitle className="font-display text-[20px] font-semibold leading-tight text-foreground">
              Create something
            </DrawerTitle>
            <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">
              Choose a format and get straight to work.
            </p>
          </div>

          <div className="-mx-4 flex flex-col">
            {OPTIONS.map(({ to, Icon, label, copy, tint }) => (
              <Link
                key={label}
                to={to}
                preload="render"
                onClick={() => setState({ create: false })}
                className={ROW}
              >
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${tint}`}>
                  <Icon className="h-[22px] w-[22px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-medium text-foreground">{label}</span>
                  <span className="mt-0.5 block text-[13px] text-muted-foreground">{copy}</span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
              </Link>
            ))}
            <button
              type="button"
              onClick={() => {
                setState({ create: false });
                window.setTimeout(() => setState({ live: true }), 180);
              }}
              className={ROW}
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#e0245e]/10 text-[#e0245e]">
                <Radio className="h-[22px] w-[22px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-medium text-foreground">Go live</span>
                <span className="mt-0.5 block text-[13px] text-muted-foreground">
                  Open a community room
                </span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
            </button>
          </div>
        </DrawerContent>
      </Drawer>

      <Drawer open={live} onOpenChange={(open) => setState({ live: open })}>
        <DrawerContent className="mx-auto max-h-[76dvh] w-full max-w-[520px] overflow-hidden rounded-t-lg border border-border bg-background p-0 focus:ring-0">
          <div className="px-5 pb-3 pt-1">
            <DrawerTitle className="font-display text-[20px] font-semibold leading-tight">
              Go live
            </DrawerTitle>
            <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">
              Choose the community that will host this session.
            </p>
          </div>
          <div className="max-h-[55dvh] overflow-y-auto overscroll-contain px-5 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            {isLoading ? (
              <div className="grid min-h-32 place-items-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : hostClubs.length > 0 ? (
              <>
                <p className="pb-1 text-[13px] font-semibold text-muted-foreground">
                  Clubs you host
                </p>
                {hostClubs.map((club) => (
                  <button
                    key={club.id}
                    onClick={() => openLiveRoom(club.id)}
                    className="-mx-5 flex w-[calc(100%+2.5rem)] items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-foreground/[0.04]"
                  >
                    <div className="h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-foreground/[0.06]">
                      {club.banner_url ? (
                        <img
                          src={club.banner_url}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <div className="grid h-full w-full place-items-center">
                          <Radio className="h-5 w-5 text-[#e0245e]" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold">{club.name}</p>
                      <p className="mt-0.5 text-[13px] text-muted-foreground">
                        Start an instant session
                      </p>
                    </div>
                    <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                  </button>
                ))}
              </>
            ) : (
              <div className="flex flex-col items-center py-8 text-center">
                <div className="grid h-12 w-12 place-items-center rounded-full bg-foreground/[0.05] text-muted-foreground">
                  <Radio className="h-6 w-6" />
                </div>
                <h3 className="mt-4 text-[16px] font-semibold">No community to host yet</h3>
                <p className="mx-auto mt-1 max-w-xs text-[14px] leading-relaxed text-muted-foreground">
                  Create a club or ask an administrator to make you an admin before starting a live
                  room.
                </p>
                <Link
                  to="/app/clubs"
                  onClick={() => setState({ live: false })}
                  className="mt-5 inline-flex h-10 items-center rounded-full bg-foreground px-5 text-[15px] font-semibold text-background"
                >
                  Open Clubs
                </Link>
              </div>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
