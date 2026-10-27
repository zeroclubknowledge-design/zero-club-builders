type Claim = { parent_gift_id?: string | null; my_claim_id?: string | null; expires_at?: string | null; claim_deadline_at?: string | null; my_claim_expires_at?: string | null; claim_released_at?: string | null; my_claim_expired?: boolean; my_claim_released?: boolean };
export function giftClaimDeadline(card: Claim | null | undefined): string | null {
  if (!card) return null;
  if (card.my_claim_id) return card.my_claim_expires_at || card.expires_at || null;
  return card.parent_gift_id || card.claim_deadline_at ? card.expires_at || card.claim_deadline_at || null : null;
}
export function giftClaimExpired(card: Claim | null | undefined, now = Date.now()) {
  const deadline = giftClaimDeadline(card);
  return !!(card?.my_claim_expired || card?.my_claim_released || card?.claim_released_at || (deadline && Date.parse(deadline) <= now));
}
export function giftTimeLeft(deadline: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.ceil((Date.parse(deadline) - now) / 60000));
  if (!Number.isFinite(minutes) || minutes === 0) return "Expired";
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return hours ? `${hours}h${rest ? ` ${rest}m` : ""}` : `${rest}m`;
}
export function giftClaimNotice(card: Claim | null | undefined) {
  const deadline = giftClaimDeadline(card);
  return deadline ? `Use within ${giftTimeLeft(deadline)} — before ${new Date(deadline).toLocaleString()}. A completely unused claim returns to the available places.` : "Eligible credit pays first; your wallet covers the rest.";
}
export function giftClaimRefreshInterval(card: Claim | undefined) {
  const future = [card?.expires_at, giftClaimDeadline(card)].filter((value): value is string => !!value && Date.parse(value) > Date.now()).map(value => Date.parse(value));
  return future.length ? Math.max(500, Math.min(10000, Math.min(...future) - Date.now() + 50)) : 10000;
}
