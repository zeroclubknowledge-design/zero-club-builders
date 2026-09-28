import { ChevronRight, Handshake, MapPin, Users } from "lucide-react";
import { money, type PayoutCurrency } from "@/lib/money";
import { GOAL_LABEL, topBonus, type Campaign } from "@/types/campaign";

/** What an ambassador earns: a share of everything their referrals pay. */
export function rewardHeadline(rate: number | null | undefined) {
  return rate != null ? `Earn ${rate}% of what your referrals pay` : "Earn commission on what your referrals pay";
}

export function CampaignCover({ campaign, className = "" }: { campaign: Pick<Campaign, "cover_url" | "title" | "partner_name">; className?: string }) {
  return (
    <div className={`relative overflow-hidden bg-[#1d1420] ${className}`}>
      {campaign.cover_url ? (
        <img src={campaign.cover_url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
      ) : (
        <div className="h-full w-full bg-[radial-gradient(120%_90%_at_10%_0%,#cc208f_0%,transparent_55%),radial-gradient(90%_80%_at_100%_100%,#6d28d9_0%,transparent_60%),linear-gradient(135deg,#1d1420,#2a1830)]" />
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/5 to-transparent" />
      <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-md">
        {campaign.partner_name ? <Handshake className="h-3 w-3" /> : <img src="/logo.png" alt="" className="h-3.5 w-3.5" />}
        {campaign.partner_name || "Zero Club"}
      </span>
    </div>
  );
}

export function CampaignCard({ campaign, currency, rate, onOpen }: { campaign: Campaign; currency: PayoutCurrency; rate?: number | null; onOpen: () => void }) {
  const bonus = topBonus(campaign.bonus_tiers);
  const ended = campaign.status === "ended";

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`zs-card zs-card-hover group flex w-full flex-col overflow-hidden text-left ${ended ? "opacity-70" : ""}`}
    >
      <CampaignCover campaign={campaign} className="h-32" />
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider">
          <span className="text-accent">{GOAL_LABEL[campaign.goal]}</span>
          {campaign.status !== "live" && <span className="text-ink-faint">· {campaign.status}</span>}
          {campaign.joined && <span className="ml-auto rounded-full bg-ok/12 px-2 py-0.5 text-[10px] normal-case tracking-normal text-ok">Joined</span>}
        </div>
        <h3 className="mt-1.5 line-clamp-2 text-[16px] font-bold leading-snug text-ink">{campaign.title}</h3>
        {campaign.summary && <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-ink-muted">{campaign.summary}</p>}

        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[11.5px] font-semibold text-accent">{rewardHeadline(rate)}</span>
          {bonus > 0 && <span className="rounded-full bg-ink/[0.05] px-2.5 py-1 text-[11.5px] font-semibold text-ink">Bonuses up to +{money(bonus, currency)}</span>}
        </div>

        <div className="mt-auto flex items-center gap-3 pt-4 text-[11.5px] text-ink-faint">
          <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {campaign.ambassadors}</span>
          {campaign.locations && (
            <span className="inline-flex min-w-0 items-center gap-1 truncate"><MapPin className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{campaign.locations}</span></span>
          )}
          <ChevronRight className="ml-auto h-4 w-4 shrink-0 transition group-hover:translate-x-0.5" />
        </div>
      </div>
    </button>
  );
}
