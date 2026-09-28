import { CalendarClock, ChevronRight, Handshake, Users, Wallet } from "lucide-react";
import { money, type PayoutCurrency } from "@/lib/money";
import { GOAL_LABEL, PHASE_CLASS, campaignPhase, daysLeft, type CampaignBase, type MyCampaign } from "@/types/campaign";

/** What an ambassador earns: a share of everything their referrals pay. */
export function rewardHeadline(rate: number | null | undefined) {
  return rate != null ? `Earn ${rate}% of what your referrals pay` : "Earn commission on what your referrals pay";
}

export function CampaignCover({ campaign, className = "" }: { campaign: Pick<CampaignBase, "cover_url" | "title" | "partner_name">; className?: string }) {
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

export function PhasePill({ campaign }: { campaign: Pick<CampaignBase, "status" | "review_status"> }) {
  const phase = campaignPhase(campaign);
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${PHASE_CLASS[phase.tone]}`}>
      {phase.tone === "live" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
      {phase.label}
    </span>
  );
}

/** A campaign the ambassador runs: its state and its money at a glance. */
export function MyCampaignCard({ campaign, currency, onOpen }: { campaign: MyCampaign; currency: PayoutCurrency; onOpen: () => void }) {
  const running = campaign.status === "live" || campaign.status === "paused";
  const left = running ? daysLeft(campaign.ends_at) : null;

  return (
    <button type="button" onClick={onOpen} className="zs-card zs-card-hover group flex w-full flex-col overflow-hidden text-left">
      <CampaignCover campaign={campaign} className="h-28" />
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-center gap-2">
          <PhasePill campaign={campaign} />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">{GOAL_LABEL[campaign.goal]}</span>
        </div>
        <h3 className="mt-2 line-clamp-2 text-[16px] font-bold leading-snug text-ink">{campaign.title}</h3>

        <div className="mt-3 grid grid-cols-3 gap-1.5">
          <Mini icon={<Users className="h-3.5 w-3.5" />} value={String(campaign.new_members)} label="joined" />
          <Mini icon={<Wallet className="h-3.5 w-3.5" />} value={money(campaign.sales, currency, true)} label="sales" />
          <Mini value={money(campaign.commission, currency, true)} label="earned" strong />
        </div>

        <div className="mt-auto flex items-center gap-2 pt-4 text-[11.5px] text-ink-faint">
          {left != null ? (
            <span className="inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" /> {left === 0 ? "Ends today" : `${left} day${left === 1 ? "" : "s"} left`}</span>
          ) : (
            <span>{campaign.review_status === "pending" ? "Waiting for the Zero Club check" : "Finished"}</span>
          )}
          <ChevronRight className="ml-auto h-4 w-4 shrink-0 transition group-hover:translate-x-0.5" />
        </div>
      </div>
    </button>
  );
}

function Mini({ icon, value, label, strong = false }: { icon?: React.ReactNode; value: string; label: string; strong?: boolean }) {
  return (
    <div className="zs-inset rounded-xl px-2.5 py-2">
      <p className={`flex items-center gap-1 truncate font-display text-[14px] font-bold ${strong ? "text-accent" : "text-ink"}`}>
        {icon}
        {value}
      </p>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">{label}</p>
    </div>
  );
}
