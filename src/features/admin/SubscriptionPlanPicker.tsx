import { useEffect, useMemo, useState } from "react";
import { BookOpen, Building2, Check, Crown, GraduationCap, Sparkles } from "@/components/icons/glyphs";
import type { GiftRecipient } from "@/features/membership/giftCatalog";
import { formatNaira } from "@/features/membership/plans";

export type GiftablePlan = {
  key: string;
  name: string;
  audience: string;
  price_amount: number | string | null;
  billing_interval: string;
  features: string[] | null;
};

type Audience = "learner" | "creator" | "tutor" | "institution";

const AUDIENCES: { id: Audience; label: string; blurb: string; Icon: typeof BookOpen }[] = [
  { id: "learner", label: "Learner", blurb: "Learners & builders", Icon: BookOpen },
  { id: "creator", label: "Creator", blurb: "Creator mode — runs clubs", Icon: Sparkles },
  { id: "tutor", label: "Tutor", blurb: "Teaches on Zero Club", Icon: GraduationCap },
  { id: "institution", label: "Institution", blurb: "Schools & organisations", Icon: Building2 },
];

/** Which subscription families suit this account. Mirrors admin_gift_membership on the server. */
export function audienceAllowed(audience: Audience, recipient?: GiftRecipient | null) {
  if (!recipient) return true;
  if (recipient.is_admin) return false;
  // Members switch between Learner, Creator and Tutor, so any of those plans
  // can be gifted to any personal account. Institution plans are for institutions.
  const institution = String(recipient.account_type || "").toLowerCase() === "institution";
  return audience === "institution" ? institution : !institution;
}

function naturalAudience(recipient?: GiftRecipient | null): Audience {
  const account = String(recipient?.account_type || "learner").toLowerCase();
  if (account === "institution") return "institution";
  if (account === "tutor") return "tutor";
  if (account === "creator") return "creator";
  return "learner";
}

const tierBadge = (plan: GiftablePlan) => {
  const n = plan.name.toLowerCase();
  if (n.includes("max") || n.includes("large")) return { label: "Top tier", tone: "bg-amber-500/12 text-amber-600 dark:text-amber-400" };
  if (n.includes("pro") || n.includes("premium") || n.includes("small")) return { label: "Popular", tone: "bg-[#cc208f]/10 text-[#cc208f]" };
  return null;
};

const accountLabel = (r: GiftRecipient) =>
  r.is_admin ? "an administrator" : `a ${String(r.account_type || "Learner").toLowerCase()} account${r.tutor_enabled && String(r.account_type).toLowerCase() !== "tutor" ? " with tutor mode" : ""}`;

/**
 * Step one: the kind of account the plan is for (Learner, Creator, Tutor,
 * Institution). Step two: the exact plan in that family — Creator PRO or Max,
 * Tutor Pro or Max, and so on. Families that don't suit the chosen member are
 * shown but locked, with the reason.
 */
export function SubscriptionPlanPicker({
  plans,
  recipient,
  value,
  onChange,
}: {
  plans: GiftablePlan[];
  recipient: GiftRecipient | null;
  value: string;
  onChange: (key: string) => void;
}) {
  const isInstitution = String(recipient?.account_type || "").toLowerCase() === "institution";
  const present = AUDIENCES.filter((a) => plans.some((p) => p.audience === a.id) && (a.id === "institution" ? !recipient || isInstitution : !isInstitution));
  const [audience, setAudience] = useState<Audience>(() => (plans.find((p) => p.key === value)?.audience as Audience) || naturalAudience(recipient));

  // A new recipient: jump to the family that suits them, and pick its first plan
  // if the current choice doesn't fit.
  useEffect(() => {
    if (!recipient) return;
    const current = plans.find((p) => p.key === value);
    if (current && audienceAllowed(current.audience as Audience, recipient)) {
      setAudience(current.audience as Audience);
      return;
    }
    const next = audienceAllowed(naturalAudience(recipient), recipient) ? naturalAudience(recipient) : present.find((a) => audienceAllowed(a.id, recipient))?.id;
    if (next) {
      setAudience(next);
      const first = plans.filter((p) => p.audience === next).sort(byPrice)[0];
      if (first) onChange(first.key);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipient?.id]);

  const family = useMemo(() => plans.filter((p) => p.audience === audience).sort(byPrice), [plans, audience]);
  const allowed = audienceAllowed(audience, recipient);

  return (
    <div>
      <p className="text-sm font-medium" id="gift-family-label">Which account is this for?</p>
      <p className="mt-0.5 text-xs text-muted-foreground">Members switch between Learner, Creator and Tutor — the plan applies when they use that account.</p>
      <div role="radiogroup" aria-labelledby="gift-family-label" className={`mt-2 grid gap-2 ${present.length >= 4 ? "grid-cols-2 sm:grid-cols-4" : present.length === 1 ? "grid-cols-1" : "grid-cols-3"}`}>
        {present.map(({ id, label, blurb, Icon }) => {
          const on = audience === id;
          const ok = audienceAllowed(id, recipient);
          const count = plans.filter((p) => p.audience === id).length;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => {
                setAudience(id);
                const first = plans.filter((p) => p.audience === id).sort(byPrice)[0];
                if (first && ok) onChange(first.key);
              }}
              className={`relative flex flex-col items-start rounded-2xl border p-3 text-left transition ${
                on ? "border-primary bg-primary/[0.07] ring-2 ring-primary/20" : "border-border bg-background hover:bg-muted/60"
              } ${ok ? "" : "opacity-55"}`}
            >
              <span className={`grid h-8 w-8 place-items-center rounded-xl ${on ? "bg-primary text-primary-foreground" : "bg-muted text-foreground/70"}`}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="mt-2 text-[14px] font-semibold">{label}</span>
              <span className="text-[11.5px] leading-snug text-muted-foreground">{blurb}</span>
              <span className="mt-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                {ok ? `${count} ${count === 1 ? "plan" : "plans"}` : "Not for this member"}
              </span>
              {on && <Check className="absolute right-2.5 top-2.5 h-4 w-4 text-primary" />}
            </button>
          );
        })}
      </div>

      <p className="mt-4 text-sm font-medium" id="gift-plan-label">
        {AUDIENCES.find((a) => a.id === audience)?.label} plan
      </p>
      {recipient && !allowed ? (
        <div className="mt-2 rounded-2xl border border-dashed border-border bg-background px-4 py-4 text-[13px] leading-relaxed text-muted-foreground">
          @{recipient.username} is {accountLabel(recipient)}, so {AUDIENCES.find((a) => a.id === audience)?.label.toLowerCase()} plans can't be gifted to them.
          {audience === "tutor" && " They can apply to become a tutor first."}
          {audience === "institution" && " Institution plans are only for registered institutions."}
        </div>
      ) : (
        <div role="radiogroup" aria-labelledby="gift-plan-label" className="mt-2 grid gap-2.5 sm:grid-cols-2">
          {family.map((plan) => {
            const on = value === plan.key;
            const badge = tierBadge(plan);
            const price = Number(plan.price_amount || 0);
            return (
              <button
                key={plan.key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onChange(plan.key)}
                className={`relative flex flex-col rounded-2xl border p-4 text-left transition ${
                  on ? "border-primary bg-primary/[0.06] ring-2 ring-primary/25" : "border-border bg-background hover:border-foreground/25"
                }`}
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-[15px] font-semibold">
                    {badge?.label === "Top tier" && <Crown className="h-4 w-4 text-amber-500" />}
                    {plan.name}
                  </span>
                  <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${on ? "bg-primary text-primary-foreground" : "ring-2 ring-border"}`}>
                    {on && <Check className="h-3 w-3" strokeWidth={3} />}
                  </span>
                </span>
                <span className="mt-1 text-[13px] text-muted-foreground">
                  <span className="font-semibold text-foreground">{formatNaira(price)}</span> / {plan.billing_interval === "year" ? "year" : "month"} value
                </span>
                {badge && <span className={`mt-2 w-fit rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider ${badge.tone}`}>{badge.label}</span>}
                {Array.isArray(plan.features) && plan.features.length > 0 && (
                  <ul className="mt-2.5 space-y-1">
                    {plan.features.slice(0, 3).map((f) => (
                      <li key={f} className="flex gap-1.5 text-[12px] leading-snug text-muted-foreground">
                        <Check className="mt-0.5 h-3 w-3 shrink-0 text-primary" /> <span>{f}</span>
                      </li>
                    ))}
                    {plan.features.length > 3 && <li className="pl-[18px] text-[11.5px] text-muted-foreground">+{plan.features.length - 3} more</li>}
                  </ul>
                )}
              </button>
            );
          })}
        </div>
      )}
      {!recipient && <p className="mt-2 text-xs text-muted-foreground">Choose the recipient above to see which plans suit their account.</p>}
      {recipient?.is_admin && <p className="mt-2 text-sm text-muted-foreground">This administrator already has every feature for free.</p>}
    </div>
  );
}

const byPrice = (a: GiftablePlan, b: GiftablePlan) => Number(a.price_amount || 0) - Number(b.price_amount || 0);
