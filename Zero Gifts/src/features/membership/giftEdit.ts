export type GiftEditPayload = {
  p_gift: string; p_amount: number; p_quantity: number; p_expires_at: string;
  p_template: string; p_service: string; p_message: string | null;
  p_custom_purpose: string | null; p_bootcamp_ids: string[]; p_club_ids?: string[]; p_request_id: string;
};

export function giftEditError(error: unknown): string {
  const detail = error as { code?: string; name?: string; message?: string } | null;
  if (detail?.name === "TimeoutError" || detail?.name === "AbortError" || /timeout|aborted/i.test(detail?.message || ""))
    return "Saving took too long. Check your connection and try again. Your changes are still here.";
  if (detail?.code === "PGRST202" || /schema cache|could not find the function/i.test(detail?.message || ""))
    return "Gift editing is temporarily unavailable. Your changes have been kept. Please try again later.";
  return detail?.message || "The gift could not be updated. Your changes have been kept. Please try again.";
}

/** Verify the saved row before telling the creator that claims have reopened. */
export function verifyGiftEdit<T>(data: T, payload: GiftEditPayload): T {
  const saved = data as { id?: string; status?: string; amount?: number; quantity?: number; claimed_count?: number; expires_at?: string } | null;
  if (!saved || saved.id !== payload.p_gift || Number(saved.amount) !== payload.p_amount || Number(saved.quantity) !== payload.p_quantity
    || !Number.isInteger(Number(saved.claimed_count)) || Number(saved.claimed_count) < 0 || Number(saved.claimed_count) > Number(saved.quantity)
    || !["active", "claimed"].includes(saved.status || "")
    || !saved.expires_at || Math.abs(Date.parse(saved.expires_at) - Date.parse(payload.p_expires_at)) > 1000
    || !Number.isFinite(Date.parse(saved.expires_at)))
    throw new Error("The gift update could not be confirmed. Your changes have been kept. Please try again.");
  if (Number(saved.quantity) > Number(saved.claimed_count) && saved.status !== "active")
    throw new Error("The gift is still closed for claims. Your changes have been kept. Please try again.");
  return data;
}
