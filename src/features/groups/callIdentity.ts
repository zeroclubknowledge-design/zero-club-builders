/** Stable legacy numeric IDs, plus direct profile UUIDs used by older clients. */
export function agoraUidFor(profileId: string) {
  const n = parseInt(profileId.replace(/-/g, "").slice(0, 8), 16) % 2_000_000_000;
  return n > 0 ? n : 1;
}
export type CallPerson = { profile_id: string; uid: string; name: string; avatar: string | null };
export function callPeopleByUid(people: CallPerson[], members: { profile_id: string; profile: { full_name?: string | null; username?: string | null; avatar_url?: string | null } | null }[]) {
  const map = new Map<string, CallPerson>();
  for (const member of members) {
    const p = member.profile;
    const person = { profile_id: member.profile_id, uid: String(agoraUidFor(member.profile_id)), name: p?.full_name?.trim() || p?.username || "Member", avatar: p?.avatar_url || null };
    map.set(person.uid, person); map.set(member.profile_id, person);
  }
  for (const person of people) map.set(String(person.uid), person);
  return map;
}
