import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { getCachedSession } from "@/lib/auth";
import { isBootcampCohortClub } from "@/features/membership/plans";

/**
 * Everything the Clubs tab shows, in one query.
 *
 * Opening Clubs used to wait on the network every time, showing empty lists
 * until four rounds of requests finished. Now:
 *  - the last result is kept on the device and painted at once, then quietly
 *    refreshed (readClubsSnapshot / saveClubsSnapshot);
 *  - the app fetches it in the background once idle (prefetchClubsData), so
 *    the first tap usually finds it ready;
 *  - Discover is fetched alongside everything else rather than after.
 */
export const CLUBS_DATA_KEY = ["clubs_data"] as const;
const SNAPSHOT_KEY = "zc_clubs_snapshot_v1";

export async function fetchClubsData(): Promise<any> {
  const { data: { session } } = await getCachedSession();
  if (!session) {
    window.location.href = "/signin";
    return null;
  }

  const [
    { data: profile },
    { data: userCreatedClubs },
    { data: joinedClubs },
    { data: featuredClubData },
    { data: sentRequests },
    { data: incomingRequestsData },
    { data: outgoingRequestsData },
    { data: capacityData },
    { data: newestClubs }
  ] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', session.user.id).single(),
    supabase.from('clubs').select('*, bootcamps(ends_at)').eq('creator_id', session.user.id),
    supabase.from('club_members').select('club_id, clubs(*, bootcamps(ends_at))').eq('profile_id', session.user.id),
    supabase.from('clubs').select('*').eq('name', 'Zero K Bootcamp').maybeSingle(),
    supabase.from('messages').select('content').eq('sender_id', session.user.id).like('content', 'CLUB_REQUEST:%'),
    supabase.from('messages').select('*, sender:sender_id(id, username, full_name, avatar_url)').eq('receiver_id', session.user.id).like('content', 'CLUB_REQUEST:%:pending'),
    supabase.from('messages').select('*, receiver:receiver_id(id, username, full_name, avatar_url)').eq('sender_id', session.user.id).like('content', 'CLUB_REQUEST:%'),
    supabase.rpc('get_my_club_capacity'),
    // Enough to fill Discover after removing the clubs already joined.
    supabase.from('clubs').select('*').order('created_at', { ascending: false }).limit(120)
  ]);

  let joinedIds = joinedClubs?.map(jc => jc.club_id) || [];
  // Fetched alongside everything else (see newestClubs above) and filtered
  // here, instead of waiting for the joined list before asking.
  const joinedSet = new Set(joinedIds);
  const discoverClubs = (newestClubs || []).filter((c: any) => !joinedSet.has(c.id)).slice(0, 50);

  let discoverClubsCombined = discoverClubs || [];
  if (featuredClubData && !discoverClubsCombined.some(c => c.id === featuredClubData.id)) {
    discoverClubsCombined = [featuredClubData, ...discoverClubsCombined];
  }

  const requestedClubIds = sentRequests
    ?.map(m => {
      const parts = m.content.split(':');
      return { clubId: parts[1], status: parts[3] };
    })
    .filter(r => r.clubId && (r.status === 'pending' || r.status === 'accepted'))
    .map(r => r.clubId) || [];

  const allRelevantClubIds = [
    ...joinedIds,
    ...discoverClubsCombined.map(c => c.id),
    ...(userCreatedClubs?.map(c => c.id) || [])
  ];
  const uniqueClubIds = [...new Set(allRelevantClubIds)];
  
  let membersCountMap: Record<string, number> = {};
  let onlineCountMap: Record<string, number> = {};
  let uniqueOnlineProfiles = new Set<string>();

  if (uniqueClubIds.length > 0) {
    const batches = await Promise.all(Array.from({ length: Math.ceil(uniqueClubIds.length / 200) }, (_, index) =>
      supabase.rpc('club_directory_counts', { p_club_ids: uniqueClubIds.slice(index * 200, (index + 1) * 200) })
    ));
    if (batches.every((result) => !result.error)) {
      batches.flatMap((result) => result.data || []).forEach((row: any) => { membersCountMap[row.club_id] = Number(row.member_count); });
    } else {
      // Older databases stay usable until the migration is applied.
      const { data: memberRows } = await supabase.from('club_members').select('club_id').in('club_id', uniqueClubIds);
      memberRows?.forEach(row => {
        membersCountMap[row.club_id] = (membersCountMap[row.club_id] || 0) + 1;
      });
    }
  }

  const enrich = (clubsArray: any[]) => clubsArray.map(c => ({ 
    ...c, 
    members_count: membersCountMap[c.id] || 0,
    online_count: onlineCountMap[c.id] || 0
  }));

  // Cohort clubs are filtered out of My Clubs and Discover above, because
  // they are temporary and belong to a bootcamp rather than being joinable
  // communities. That left them with nowhere to appear at all, so they get
  // their own section. Joined and created are merged: a tutor sees the club
  // for a bootcamp they run even before anyone joins it.
  const cohortClubs = [
    ...(joinedClubs?.map(jc => jc.clubs as any) || []),
    ...(userCreatedClubs || []),
  ].filter(c => c && isBootcampCohortClub(c));

  const bootClubs = enrich(
    Array.from(new Map(cohortClubs.map(c => [c.id, c])).values())
  );

  return {
    bootClubs,
    myClubs: enrich(joinedClubs?.map(jc => jc.clubs as any).filter(c => c && !isBootcampCohortClub(c)) || []),
    discover: enrich(discoverClubsCombined.filter(c => c && !isBootcampCohortClub(c))),
    profile,
    userCreatedClubs: enrich(userCreatedClubs?.filter(c => c && !isBootcampCohortClub(c)) || []),
    capacityData,
    requestedClubIds,
    initialIncomingRequests: incomingRequestsData || [],
    outgoingAccepted: (outgoingRequestsData || []).filter(m => m.content.split(':')[3] === 'accepted'),
    totalOnlineBuilders: uniqueOnlineProfiles.size,
  };
}

export function prefetchClubsData(queryClient: QueryClient) {
  return queryClient.prefetchQuery({ queryKey: CLUBS_DATA_KEY, queryFn: fetchClubsData, staleTime: 1000 * 60 * 3 });
}

type Snapshot = { userId: string; savedAt: number; data: any };

/** The last Clubs result saved on this device for this person, if any. */
export function readClubsSnapshot(userId?: string | null): Snapshot | null {
  if (typeof window === "undefined" || !userId) return null;
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw) as Snapshot;
    // Another account on this device, or too old to be useful.
    if (snap.userId !== userId || Date.now() - snap.savedAt > 1000 * 60 * 60 * 24 * 7) return null;
    return snap;
  } catch {
    return null;
  }
}

export function saveClubsSnapshot(data: any) {
  if (typeof window === "undefined" || !data?.profile?.id) return;
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ userId: data.profile.id, savedAt: Date.now(), data }));
  } catch {
    // Storage full or blocked: the screen still works, just not instantly.
  }
}

export function clearClubsSnapshot() {
  try {
    localStorage.removeItem(SNAPSHOT_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * The signed-in user's id, read synchronously from Supabase's stored session.
 * Used only to match the device snapshot to the right person before any
 * network call; the real data that replaces it is fetched with the session.
 */
export function storedSessionUserId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("sb-") && key.endsWith("-auth-token")) {
        const parsed = JSON.parse(localStorage.getItem(key) || "null");
        const id = parsed?.user?.id || parsed?.currentSession?.user?.id;
        if (id) return id;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}
