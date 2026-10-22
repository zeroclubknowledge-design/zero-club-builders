import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Loader2, Minus, Plus, ShieldCheck } from "@/components/icons/glyphs";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { GiftCardVisual, giftServices, giftTemplates } from "@/components/GiftCardVisual";
import { GiftBootcampPicker } from "@/features/membership/GiftBootcampPicker";
import { useWalletCurrency } from "@/hooks/useWalletCurrency";
import { supabase } from "@/lib/supabase";

export type EditableGift = {
  id: string;
  code: string;
  amount: number;
  service: string;
  template_id: string;
  message: string | null;
  custom_purpose: string | null;
  quantity: number;
  claimed_count: number;
  expires_at: string | null;
  funding_source: string;
  bootcamp_ids?: string[] | null;
};

/** ISO → the value a datetime-local input wants, in local time. */
function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Edit a Zero Card after it has been sent.
 *
 * Everything can change except going down in value: the amount per person and
 * the number of claims only go up; the design, message, purpose and claim-by
 * date can be anything valid. People who already claimed keep what they got.
 * The cost of the change is shown before saving and charged once.
 */
export function GiftEditSheet({
  card,
  open,
  onOpenChange,
}: {
  card: EditableGift;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const client = useQueryClient();
  const { details: currency, format, toBaseAmount, fromBaseAmount } = useWalletCurrency();
  const sponsored = card.funding_source === "platform";

  const [amount, setAmount] = useState("");
  const [quantity, setQuantity] = useState("");
  const [expires, setExpires] = useState("");
  const [templateId, setTemplateId] = useState(card.template_id);
  const [service, setService] = useState(card.service);
  const [limited, setLimited] = useState(false);
  const [bootcampIds, setBootcampIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [customPurpose, setCustomPurpose] = useState("");
  const request = useRef<{ signature: string; id: string } | null>(null);

  // Start from the card as it is, every time the sheet opens.
  useEffect(() => {
    if (!open) return;
    setAmount(String(fromBaseAmount(Number(card.amount))));
    setQuantity(String(card.quantity || 1));
    // An expired gift opens with a fresh date already set (a week from now), so
    // reopening it is one tap: Save brings it back to Collecting.
    const isExpired = !!card.expires_at && Date.parse(card.expires_at) <= Date.now();
    setExpires(isExpired ? toLocalInput(new Date(Date.now() + 7 * 86400000).toISOString()) : toLocalInput(card.expires_at));
    setTemplateId(card.template_id || "signature");
    setService(card.service === "support" ? "universal" : card.service);
    setLimited(Boolean(card.bootcamp_ids?.length));
    setBootcampIds(card.bootcamp_ids || []);
    setMessage(card.message || "");
    setCustomPurpose(card.custom_purpose || "");
    request.current = null;
    // Only when the sheet opens (or another gift is chosen): a background refresh
    // of the list must not wipe what's being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, card.id]);

  const { data: wallet } = useQuery({
    queryKey: ["gift-edit-wallet"],
    enabled: open && !sponsored,
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return 0;
      const { data } = await supabase.from("profiles").select("coins").eq("id", auth.user.id).single();
      return Number(data?.coins || 0);
    },
  });

  const oldAmount = Number(card.amount) || 0;
  const oldQuantity = Number(card.quantity) || 1;
  const claimed = Number(card.claimed_count) || 0;
  const waiting = Math.max(0, oldQuantity - claimed);

  const newAmount = Math.round(toBaseAmount(Number(amount) || 0));
  const newQuantity = Math.floor(Number(quantity) || 0);
  const amountTooLow = newAmount < oldAmount;
  const quantityTooLow = newQuantity < oldQuantity;
  const addedPlaces = Math.max(0, newQuantity - oldQuantity);
  const topUp = Math.max(0, newAmount - oldAmount) * waiting;
  const newPlacesCost = newAmount * addedPlaces;
  const cost = topUp + newPlacesCost;
  const expiry = new Date(expires).getTime();
  const now = Date.now();
  const wasExpired = !!card.expires_at && Date.parse(card.expires_at) <= now;
  const setExpiryIn = (days: number) => setExpires(toLocalInput(new Date(Date.now() + days * 86400000).toISOString()));

  const problem = useMemo(() => {
    if (!newAmount || newAmount > 5000000) return `Amount per person must be between ${format(1)} and ${format(5000000)}.`;
    if (amountTooLow) return `The amount can only go up — it's ${format(oldAmount)} now.`;
    if (!Number.isInteger(newQuantity) || newQuantity > 10000) return "Choose up to 10,000 people.";
    if (quantityTooLow) return `Claims can only go up — it's ${oldQuantity.toLocaleString()} now.`;
    if (!Number.isFinite(expiry) || expiry <= now) return "Choose a claim-by date in the future.";
    if (expiry > now + 366 * 86400000) return "Choose a claim-by date within one year.";
    if (service === "custom" && !customPurpose.trim()) return "Say what this custom gift is for.";
    if (service === "bootcamps" && limited && !bootcampIds.length) return "Select at least one eligible bootcamp.";
    if (!sponsored && cost > 0 && wallet !== undefined && cost > wallet) return `Add ${format(cost - wallet)} to your wallet to save these changes.`;
    return null;
  }, [newAmount, amountTooLow, newQuantity, quantityTooLow, expiry, now, service, customPurpose, limited, bootcampIds, sponsored, cost, wallet, format, oldAmount, oldQuantity]);

  const changed =
    newAmount !== oldAmount ||
    newQuantity !== oldQuantity ||
    toLocalInput(card.expires_at) !== expires ||
    templateId !== card.template_id ||
    service !== card.service ||
    message.trim() !== (card.message || "") ||
    customPurpose.trim() !== (card.custom_purpose || "") ||
    JSON.stringify(service === "bootcamps" && limited ? [...bootcampIds].sort() : []) !== JSON.stringify([...(card.bootcamp_ids || [])].sort());

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        p_gift: card.id,
        p_amount: newAmount,
        p_quantity: newQuantity,
        p_expires_at: new Date(expires).toISOString(),
        p_template: templateId,
        p_service: service,
        p_message: message.trim() || null,
        p_custom_purpose: service === "custom" ? customPurpose.trim() : null,
        p_bootcamp_ids: service === "bootcamps" && limited ? bootcampIds : [],
      };
      // Same edit retried = same request id, so it can never be charged twice.
      const signature = JSON.stringify(payload);
      if (request.current?.signature !== signature) request.current = { signature, id: crypto.randomUUID() };
      const { data, error } = await supabase.rpc("update_gift_campaign" as never, { ...payload, p_request_id: request.current.id } as never);
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success(
        wasExpired
          ? `Gift reactivated · collecting claims until ${new Date(expires).toLocaleString()}`
          : cost > 0 && !sponsored ? `Gift updated · ${format(cost)} from your wallet` : "Gift updated",
      );
      for (const key of ["unclaimed-gifts", "unclaimed-gift-count", "profile", "gift-card-profile", "wallet", "wallet-balance", "gift-edit-wallet"])
        void client.invalidateQueries({ queryKey: [key] });
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const step = (setter: (v: string) => void, value: number, min: number, max: number) => setter(String(Math.max(min, Math.min(max, value))));

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-h-[94dvh] max-w-[560px]">
        <DrawerHeader className="text-left">
          <DrawerTitle>{wasExpired ? "Edit and reactivate gift" : "Edit gift"}</DrawerTitle>
          <DrawerDescription>
            Change anything about this Zero Card. The amount and number of claims can only go up. People who already
            claimed keep what they got.
          </DrawerDescription>
        </DrawerHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-4">
          {/* Live preview + design */}
          <div>
            <GiftCardVisual amount={newAmount || oldAmount} service={service} templateId={templateId} code={card.code} message={message} />
            <div className="no-scrollbar -mx-1 mt-3 flex gap-2.5 overflow-x-auto p-1">
              {giftTemplates.map((template) => {
                const selected = templateId === template.id;
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => setTemplateId(template.id)}
                    aria-label={`${template.name} design`}
                    aria-pressed={selected}
                    className={`relative grid h-10 min-w-[52px] flex-1 place-items-center rounded-[10px] border border-foreground/10 transition active:scale-95 ${template.shell} ${selected ? "ring-2 ring-foreground ring-offset-2 ring-offset-background" : ""}`}
                  >
                    {selected && (
                      <span className="grid h-5 w-5 place-items-center rounded-full bg-background/90 text-foreground shadow-sm">
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Amount — up only */}
          <div>
            <span className={LABEL}>Amount per person</span>
            <div className={`flex items-baseline gap-1.5 border-b pb-2 ${amountTooLow ? "border-rose-500" : "border-foreground/15 focus-within:border-foreground/40"}`}>
              <span className="font-display text-[22px] font-semibold text-muted-foreground">{currency.symbol}</span>
              <input
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                inputMode="decimal"
                type="number"
                aria-label="Amount per person"
                className="min-w-0 flex-1 bg-transparent font-display text-[30px] font-semibold tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
            </div>
            <p className={`mt-1.5 text-[12px] ${amountTooLow ? "font-semibold text-rose-600" : "text-muted-foreground"}`}>
              Now {format(oldAmount)} · can only go up
              {waiting > 0 && newAmount > oldAmount && ` · the ${waiting.toLocaleString()} unclaimed place${waiting === 1 ? "" : "s"} get the new amount`}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Claims — up only */}
            <div>
              <span className={LABEL}>Number of people</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Fewer claims"
                  onClick={() => step(setQuantity, newQuantity - 1, oldQuantity, 10000)}
                  disabled={newQuantity <= oldQuantity}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-[10px] border border-foreground/15 disabled:opacity-35"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <input
                  inputMode="numeric"
                  value={quantity}
                  aria-label="Number of people"
                  onChange={(event) => setQuantity(event.target.value.replace(/[^\d]/g, ""))}
                  className={`${FIELD} text-center font-semibold tabular-nums ${quantityTooLow ? "border-rose-500" : ""}`}
                />
                <button
                  type="button"
                  aria-label="More claims"
                  onClick={() => step(setQuantity, newQuantity + 1, oldQuantity, 10000)}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-[10px] border border-foreground/15"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <p className={`mt-1.5 text-[12px] ${quantityTooLow ? "font-semibold text-rose-600" : "text-muted-foreground"}`}>
                {claimed.toLocaleString()} of {oldQuantity.toLocaleString()} claimed · can only go up
              </p>
            </div>

            {/* Date — editable */}
            <label className="block">
              <span className={LABEL}>Claim and use before</span>
              {/* Quick dates: some phone pickers only commit a datetime once both
                  date and time are chosen, which left Save disabled. */}
              <span className="mb-2 flex flex-wrap gap-1.5">
                {[[1, "Tomorrow"], [7, "1 week"], [14, "2 weeks"], [30, "1 month"]].map(([days, label]) => (
                  <button key={label} type="button" onClick={() => setExpiryIn(days as number)} className="h-8 rounded-full border border-foreground/15 px-3 text-[12.5px] font-semibold text-foreground transition hover:border-foreground/40 active:scale-95">
                    {label}
                  </button>
                ))}
              </span>
              <input type="datetime-local" value={expires} onChange={(event) => setExpires(event.target.value)} onInput={(event) => setExpires((event.target as HTMLInputElement).value)} className={`${FIELD} min-w-0 max-w-full`} />
              <span className="mt-1.5 block text-[12px] text-muted-foreground">
                {wasExpired ? "This gift expired. Saving with a new date reopens it for claims." : "New claims close at this time. Gifts already claimed keep their own date."}
              </span>
            </label>
          </div>

          {/* Purpose — editable */}
          <div>
            <span className={LABEL}>Can be used for</span>
            <div className="flex flex-wrap gap-2">
              {giftServices.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setService(item.id)}
                  aria-pressed={service === item.id}
                  className={`flex h-9 items-center gap-1 rounded-full px-3.5 text-[14px] font-semibold transition ${service === item.id ? "border-[1.5px] border-foreground text-foreground" : "border border-foreground/20 text-muted-foreground hover:border-foreground/40"}`}
                >
                  {service === item.id && <Check className="h-3.5 w-3.5" />}
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {service === "bootcamps" && (
            <div>
              <span className={LABEL}>Eligible bootcamps</span>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" aria-pressed={!limited} onClick={() => setLimited(false)} className={`rounded-full border px-4 py-2 text-sm ${!limited ? "border-foreground font-semibold" : "border-border text-muted-foreground"}`}>All bootcamps</button>
                <button type="button" aria-pressed={limited} onClick={() => setLimited(true)} className={`rounded-full border px-4 py-2 text-sm ${limited ? "border-foreground font-semibold" : "border-border text-muted-foreground"}`}>Choose bootcamps</button>
              </div>
              {limited && <GiftBootcampPicker selected={bootcampIds} onChange={setBootcampIds} />}
            </div>
          )}

          {service === "custom" && (
            <label className="block">
              <span className={LABEL}>What's it for?</span>
              <input value={customPurpose} onChange={(event) => setCustomPurpose(event.target.value.slice(0, 60))} placeholder="e.g. Data for your bootcamp week" className={FIELD} />
            </label>
          )}

          {/* Message — editable */}
          <label className="block">
            <span className={LABEL}>Message <span className="font-normal">(optional)</span></span>
            <textarea value={message} onChange={(event) => setMessage(event.target.value.slice(0, 140))} rows={2} placeholder="Add a short note" className={`${FIELD} h-auto resize-none py-2.5`} />
            <span className="mt-1 block text-right text-[12px] text-muted-foreground">{message.length}/140</span>
          </label>

          {/* What saving costs */}
          <div className="space-y-1.5 rounded-xl bg-muted/50 p-3 text-[13px]">
            {topUp > 0 && (
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">
                  Top up {waiting.toLocaleString()} unclaimed × {format(newAmount - oldAmount)}
                </span>
                <span className="tabular-nums">{format(topUp)}</span>
              </div>
            )}
            {addedPlaces > 0 && (
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">
                  {addedPlaces.toLocaleString()} new place{addedPlaces === 1 ? "" : "s"} × {format(newAmount)}
                </span>
                <span className="tabular-nums">{format(newPlacesCost)}</span>
              </div>
            )}
            <div className="flex items-baseline justify-between gap-3 border-t border-border/70 pt-1.5">
              <span className="font-semibold">{sponsored ? "Sponsored by Zero Club" : cost > 0 ? "From your wallet" : "Cost"}</span>
              <strong className="text-[15px] tabular-nums">{sponsored ? "No charge" : cost > 0 ? format(cost) : "Free"}</strong>
            </div>
            {!sponsored && wallet !== undefined && cost > 0 && (
              <p className="text-[11.5px] text-muted-foreground">{format(wallet)} available</p>
            )}
          </div>
          <p className="flex items-start gap-2 text-[12px] leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            To bring the value down instead, close the gift (unclaimed value returns to your wallet) and create a new one.
          </p>
        </div>

        <div className="border-t border-border bg-background px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3">
          {problem && (changed || wasExpired) && <p className="mb-2 text-[12.5px] font-medium text-rose-600">{problem}</p>}
          <button
            type="button"
            disabled={!changed || !!problem || save.isPending}
            onClick={() => save.mutate()}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#cc208f] text-[15px] font-semibold text-white transition hover:bg-[#b41c7e] disabled:opacity-40"
          >
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" strokeWidth={2.5} />}
            {!changed ? "No changes yet" : cost > 0 && !sponsored ? `${wasExpired ? "Reactivate" : "Save"} · ${format(cost)}` : wasExpired ? "Save and reactivate" : "Save changes"}
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

const LABEL = "mb-1.5 block text-[13px] font-semibold text-muted-foreground";
const FIELD =
  "h-11 w-full rounded-[10px] border border-foreground/15 bg-card px-3 text-[15px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-foreground/40";
