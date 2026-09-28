import { useState } from "react";
import { CalendarClock, Check, CircleAlert, Copy, ExternalLink, Gift, Hourglass, MapPin, Pencil, Send, Share2, Square } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { campaignLink, endMyCampaign, submitProof } from "@/lib/campaignApi";
import { externalUrl } from "@/lib/links";
import { money, type PayoutCurrency } from "@/lib/money";
import { daysLeft, type MyCampaign } from "@/types/campaign";
import { CampaignCover, PhasePill } from "./CampaignCard";

const REFUSAL: Record<string, string> = {
  not_live: "This campaign has already been checked, so it can't take new reports.",
  not_joined: "This campaign isn't yours.",
  bad_quantity: "Enter how many results you're reporting.",
  evidence_required: "Describe what happened — at least a sentence.",
  not_editable: "This campaign has already ended.",
};

const fmt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/** Everything about one of your campaigns: the link, the numbers, the check. */
export function CampaignSheet({
  campaign,
  currency,
  rate,
  onClose,
  onChanged,
  onEdit,
}: {
  campaign: MyCampaign;
  currency: PayoutCurrency;
  rate?: number | null;
  onClose: () => void;
  onChanged: () => void;
  onEdit: () => void;
}) {
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [ending, setEnding] = useState(false);
  const [proofOpen, setProofOpen] = useState(false);
  const [qty, setQty] = useState("");
  const [evidence, setEvidence] = useState("");
  const [url, setUrl] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const code = campaign.my_code;
  const link = campaignLink(code);
  const partnerUrl = externalUrl(campaign.partner_url);
  const running = campaign.status === "live" || campaign.status === "paused";
  const awaiting = !running && campaign.status !== "removed" && campaign.review_status === "pending";
  const canReport = running || awaiting;
  const left = running ? daysLeft(campaign.ends_at) : null;
  const unpaid = Math.max(0, Number(campaign.commission) - Number(campaign.commission_paid));

  const copy = async (what: "link" | "code") => {
    await navigator.clipboard.writeText(what === "link" ? link : code);
    setCopied(what);
    setTimeout(() => setCopied(null), 1600);
  };

  const shareText = campaign.summary || "Join me on Zero Club — learn in live bootcamps, ship real work and grow with builders.";
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: campaign.title, text: shareText, url: link });
        return;
      } catch {
        /* dismissed */
      }
    }
    copy("link");
  };

  const end = async () => {
    setEnding(true);
    setError(null);
    try {
      const res = await endMyCampaign(campaign.id);
      if (!res.ok) setError(REFUSAL[res.reason || ""] || "Couldn't end the campaign.");
      else {
        setConfirmEnd(false);
        onChanged();
        onClose();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setEnding(false);
    }
  };

  const sendProof = async () => {
    setSending(true);
    setError(null);
    try {
      const res = await submitProof({ campaignId: campaign.id, quantity: Number(qty), evidence: evidence.trim(), url: url.trim() });
      if (!res.ok) setError(REFUSAL[res.reason || ""] || "Couldn't send that.");
      else {
        setSent(true);
        setProofOpen(false);
        setQty("");
        setEvidence("");
        setUrl("");
        onChanged();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet onClose={onClose} wide>
      <CampaignCover campaign={campaign} className="-mx-5 -mt-2 h-40 sm:-mx-6 sm:mt-0 sm:rounded-2xl" />

      <div className="mt-4 flex items-center gap-2">
        <PhasePill campaign={campaign} />
        {left != null && (
          <span className="inline-flex items-center gap-1 text-[12px] text-ink-muted">
            <CalendarClock className="h-3.5 w-3.5" /> {left === 0 ? "Ends today" : `${left} day${left === 1 ? "" : "s"} left`}
          </span>
        )}
      </div>
      <h2 className="mt-2 text-[22px] font-bold leading-tight text-ink">{campaign.title}</h2>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-muted">
        <span>{fmt(campaign.starts_at)} – {fmt(campaign.ended_at || campaign.ends_at || campaign.starts_at)}</span>
        {campaign.locations && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {campaign.locations}</span>}
        {partnerUrl && (
          <a href={partnerUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-accent">
            {campaign.partner_name || "Partner"} <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      {/* ── Where it stands ── */}
      {awaiting && (
        <Notice icon={<Hourglass className="h-4 w-4" />} tone="accent" title="Waiting for the Zero Club check">
          The team is reviewing your results. Once approved, {money(unpaid, currency)} in commission — plus any bonus — lands in your wallet.
        </Notice>
      )}
      {campaign.review_status === "approved" && (
        <Notice icon={<Check className="h-4 w-4" />} tone="ok" title="Approved and paid">
          {money(campaign.commission_paid, currency)} commission
          {Number(campaign.bonus_awarded) > 0 && <> + <b>{money(campaign.bonus_awarded || 0, currency)} bonus</b></>} went to your wallet.
          Anyone who joined through this campaign keeps earning you commission, paid in the regular payouts.
          {campaign.review_note && <span className="mt-1 block italic">“{campaign.review_note}”</span>}
        </Notice>
      )}
      {(campaign.review_status === "rejected" || campaign.status === "removed") && (
        <Notice icon={<CircleAlert className="h-4 w-4" />} tone="bad" title={campaign.status === "removed" ? "Taken down by Zero Club" : "Not approved for payout"}>
          {campaign.review_note || "Reach out to the Zero Club team if you think this is a mistake."}
        </Notice>
      )}
      {campaign.status === "paused" && (
        <Notice icon={<CircleAlert className="h-4 w-4" />} tone="accent" title="Paused by Zero Club">
          New sign-ups through your link aren't counted while it's paused.{campaign.review_note ? ` ${campaign.review_note}` : ""}
        </Notice>
      )}

      {/* ── Your link ── */}
      {running && (
        <section className="zs-hero mt-5 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">Your campaign link</p>
          <p className="mt-2 break-all font-display text-[15px] font-semibold text-white">{link.replace(/^https?:\/\//, "")}</p>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <button onClick={() => copy("link")} className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-white/10 text-[12.5px] font-semibold text-white ring-1 ring-white/15 transition hover:bg-white/15">
              {copied === "link" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied === "link" ? "Copied" : "Copy"}
            </button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`${shareText} ${link}`)}`}
              target="_blank"
              rel="noreferrer"
              className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-[#25d366] text-[12.5px] font-semibold text-white transition hover:opacity-90"
            >
              <Send className="h-4 w-4" /> WhatsApp
            </a>
            <button onClick={share} className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-white text-[12.5px] font-semibold text-ink transition hover:opacity-90">
              <Share2 className="h-4 w-4" /> Share
            </button>
          </div>
          <button onClick={() => copy("code")} className="mt-3 text-[12px] text-white/60">
            Code <span className="font-mono font-semibold tracking-wider text-white">{code}</span> · {copied === "code" ? "copied" : "tap to copy"}
          </button>
        </section>
      )}

      {/* ── Numbers ── */}
      <section className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Joined" value={String(campaign.new_members)} />
        <Stat label="Paying" value={String(campaign.paying_members)} />
        <Stat label="Their payments" value={money(campaign.sales, currency, true)} />
        <Stat label={`You earn (${rate ?? "—"}%)`} value={money(campaign.commission, currency, true)} accent />
      </section>
      {(Number(campaign.reported_results) > 0 || Number(campaign.my_pending_results) > 0) && (
        <p className="mt-2 text-[12px] text-ink-muted">
          {campaign.reported_results} offline result{Number(campaign.reported_results) === 1 ? "" : "s"} reported — the team weighs these for your bonus.
        </p>
      )}

      {campaign.description && (
        <section className="mt-5">
          <h3 className="text-[12px] font-bold uppercase tracking-wider text-ink-faint">Your plan</h3>
          <p className="mt-2 whitespace-pre-line text-[14px] leading-relaxed text-ink/85">{campaign.description}</p>
        </section>
      )}

      {/* ── How it pays ── */}
      <section className="zs-inset mt-5 rounded-2xl p-4">
        <p className="flex items-center gap-2 text-[13px] font-semibold text-ink"><Gift className="h-4 w-4 text-accent" /> How this campaign pays</p>
        <ol className="mt-2 space-y-1.5 text-[12.5px] leading-relaxed text-ink-muted">
          <li>1. People join Zero Club through your link.</li>
          <li>2. Whenever they pay — bootcamps, memberships, store, clubs — you earn {rate ?? "your"}%.</li>
          <li>3. When the campaign ends, Zero Club checks it and pays everything to your wallet, with a bonus for strong results.</li>
        </ol>
      </section>

      {/* ── Offline results ── */}
      {canReport && (
        <section className="mt-5">
          {sent && !proofOpen && (
            <p className="mb-3 rounded-xl bg-ok/10 px-3.5 py-2.5 text-[12.5px] font-semibold text-ok">Added — the team will see it when they check your campaign.</p>
          )}
          {!proofOpen ? (
            <button onClick={() => { setProofOpen(true); setSent(false); }} className="flex h-11 w-full items-center justify-center rounded-full bg-ink/[0.06] text-[13.5px] font-semibold text-ink transition hover:bg-ink/[0.1]">
              Report offline results (events, flyers, talks)
            </button>
          ) : (
            <div className="zs-inset rounded-2xl p-4">
              <label className="zs-label">How many people did you reach?</label>
              <input className="zs-input" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} placeholder="e.g. 25" />
              <label className="zs-label mt-3">What happened?</label>
              <textarea className="zs-input" rows={3} value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="Where, when, who — the details the team needs to check it." />
              <label className="zs-label mt-3">Proof link (photos, sheet, post)</label>
              <input className="zs-input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
              <div className="mt-4 flex gap-2">
                <button
                  onClick={sendProof}
                  disabled={sending || !Number(qty) || evidence.trim().length < 15}
                  className="h-11 flex-1 rounded-full bg-accent text-[13.5px] font-semibold text-accent-ink transition hover:opacity-90 disabled:opacity-40"
                >
                  {sending ? "Sending…" : "Add to my campaign"}
                </button>
                <button onClick={() => setProofOpen(false)} className="h-11 rounded-full bg-ink/[0.06] px-5 text-[13.5px] font-semibold text-ink-muted">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── Manage ── */}
      {running && (
        <section className="mt-5 flex flex-wrap gap-2">
          <button onClick={onEdit} className="inline-flex h-11 items-center gap-2 rounded-full bg-ink px-5 text-[13.5px] font-semibold text-white transition hover:opacity-90">
            <Pencil className="h-4 w-4" /> Edit
          </button>
          {!confirmEnd ? (
            <button onClick={() => setConfirmEnd(true)} className="inline-flex h-11 items-center gap-2 rounded-full bg-bad/10 px-5 text-[13.5px] font-semibold text-bad">
              <Square className="h-4 w-4" /> End now & send for check
            </button>
          ) : (
            <div className="flex w-full flex-wrap items-center gap-2 rounded-2xl bg-bad/[0.06] p-3">
              <span className="flex-1 text-[12.5px] text-ink">End it now? Your link stops counting new members and the team reviews it for payout.</span>
              <button onClick={end} disabled={ending} className="h-10 rounded-full bg-bad px-4 text-[13px] font-semibold text-white disabled:opacity-50">{ending ? "Ending…" : "Yes, end it"}</button>
              <button onClick={() => setConfirmEnd(false)} className="h-10 rounded-full bg-ink/[0.06] px-4 text-[13px] font-semibold text-ink-muted">Keep running</button>
            </div>
          )}
        </section>
      )}

      {error && <p className="mt-4 rounded-xl bg-bad/10 px-3.5 py-2.5 text-[12.5px] font-medium text-bad">{error}</p>}
    </Sheet>
  );
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="zs-inset rounded-xl p-3">
      <p className={`truncate font-display text-[18px] font-bold ${accent ? "text-accent" : "text-ink"}`}>{value}</p>
      <p className="truncate text-[10.5px] font-semibold uppercase tracking-wider text-ink-faint">{label}</p>
    </div>
  );
}

function Notice({ icon, tone, title, children }: { icon: React.ReactNode; tone: "accent" | "ok" | "bad"; title: string; children: React.ReactNode }) {
  const cls = tone === "ok" ? "bg-ok/10 text-ok" : tone === "bad" ? "bg-bad/10 text-bad" : "bg-accent-soft text-accent";
  return (
    <div className={`mt-4 flex gap-3 rounded-2xl px-4 py-3 ${cls}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold">{title}</p>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink/80">{children}</p>
      </div>
    </div>
  );
}
