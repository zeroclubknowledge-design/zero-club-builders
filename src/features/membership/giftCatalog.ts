export const ADMIN_GIFT_TYPES = [
  { id: "subscription", label: "Subscription", description: "Give a plan with all its features. Access starts when claimed." },
  { id: "support", label: "Wallet funds", description: "Spendable funds added to the recipient’s wallet when claimed." },
  { id: "zp", label: "Zero Points", description: "Add Zero Points to the recipient’s balance. Send in steps of 10." },
  { id: "bootcamps", label: "Bootcamp credit", description: "Credit the member can apply to eligible bootcamp enrolments." },
  { id: "zero-store", label: "Zero Store credit", description: "Credit for purchases in the Zero Store." },
  { id: "membership", label: "Membership credit", description: "Credit toward a membership purchase. Choose Subscription above to gift a plan directly." },
  { id: "zero-ai", label: "Zero AI credit", description: "Saved credit for eligible paid AI services when available. To unlock Max features now, gift a Max subscription." },
  { id: "tutor-session", label: "Tutor session credit", description: "Saved credit for paid tutor bookings when available. This does not book a session." },
  { id: "custom", label: "Custom support gift", description: "Wallet funds with your own purpose or personal message." },
] as const;
export type AdminGiftKind = typeof ADMIN_GIFT_TYPES[number]["id"];
export type GiftRecipient = { id: string; username: string; full_name?: string; avatar_url?: string; account_type: string; tutor_enabled?: boolean; is_admin?: boolean };
export type GiftPlan = { key: string; name: string; audience: string };
export type AdminUserGift = { id: string; kind: AdminGiftKind; amount: number; message: string; claim_deadline: string; status: "pending" | "claimed" | "expired"; claimed_at?: string; created_at: string; recipient?: { username: string } };
export const giftType = (kind: string) => ADMIN_GIFT_TYPES.find(type => type.id === kind);
export const giftStatus = (gift: Pick<AdminUserGift, "status" | "claim_deadline">, now = Date.now()) => gift.status === "pending" && new Date(gift.claim_deadline).getTime() <= now ? "expired" : gift.status;
export function eligibleGiftPlans(plans: GiftPlan[], recipient?: GiftRecipient | null) {
  if (!recipient || recipient.is_admin) return [];
  const account = recipient.account_type.toLowerCase();
  return plans.filter(plan => plan.audience === "institution" ? account === "institution" : plan.audience === "tutor" ? account === "tutor" || recipient.tutor_enabled : ["learner", "builder", "user", "creator"].includes(account));
}
