import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, Copy, ExternalLink, LoaderCircle, MapPin, Send, Share2, Users } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { campaignLink, joinCampaign, submitProof } from "@/lib/campaignApi";
import { externalUrl } from "@/lib/links";
import { money, type PayoutCurrency } from "@/lib/money";
import { nextTier, type Campaign } from "@/types/campaign";
import { CampaignCover } from "./CampaignCard";

const REFUSAL: Record<string, string> = {
  not_an_ambassador: "Set up your ambassador profile first.",
  not_live: "This campaign isn't taking new ambassadors right now.",
  ended: "This campaign has ended.",
  full: "This campaign already has all the ambassadors it needs.",
  not_joined: "Join the campaign first.",
  link_only: "This campaign counts signups through your link automatically.",
  bad_quantity: "Enter how many results you're reporting.",
  evidence_required: "Describe what happened — at least a sentence.",
};

export function CampaignSheet({
  campaign,
  currency,
  rate,
  isAmbassador,
  onClose,
  onChanged,
}: {
  campaign: Campaign;
  currency: PayoutCurrency;
  rate?: number | null;
  isAmbassador: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [code, setCode] = useState(campaign.my_code);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  const [proofOpen, setProofOpen] = useState(false);
  const [qty, setQty] = useState("");
  const [evidence, setEvidence] = useState("");
  const [url, setUrl] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const link = code ? campaignLink(code) : null;
  const partnerUrl = externalUrl(campaign.partner_url);
  const tiers = [...(campaign.bonus_tiers || [])].sort((a, b) => a.min - b.min);
  const upcoming = nextTier(tiers, campaign.my_week_results);
  const usesLink = campaign.tracking !== "proof";
  const usesProof = campaign.tracking !== "link";

  const join = async () => {
    setJoining(true);
    setError(null);
    try {
      const res = await joinCampaign(campaign.id);
      if (!res.ok) setError(REFUSAL[res.reason || ""] || "Could not join this campaign.");
      else {
        setCode(res.code || null);
        onChanged();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setJoining(false);
    }
  };

  const copy = async (what: "link" | "code") => {
    const text = what === "link" ? link : code;
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(what);
    setTimeout(() => setCopied(null), 1600);
  };

  const shareText = "Join me on Zero Club — learn in live bootcamps, ship real work and grow with builders.";
  const share = async () => {
    if (!link) return;
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

  const sendProof = async () => {
    setSending(true);
    setError(null);
    try {
      const res = await submitProof({ campaignId: campaign.id, quantity: Number(qty), evidence: evidence.trim(), url: url.trim() });
      if (!res.ok) setError(REFUSAL[res.reason || ""] || "Could not send that.");
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

  const joined = Boolean(code);
  const canJoin = campaign.status === "live";

  return (
    <Sheet
      onClose={onClose}
      wide
      footer={
        !joined ? (
          isAmbassador ? (
            <button
              onClick={join}
              disabled={!canJoin || joining}
              className="zs-glow flex h-12 w-full items-center justify-center gap-2 rounded-full bg-accent text-[14.5px] font-semibold text-accent-ink transition hover:opacity-90 disabled:opacity-40"
            >
              {joining ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
              {canJoin ? "Join campaign & get my link" : "Not open right now"}
            </button>
          ) : (
            <Link to="/join" className="zs-glow flex h-12 w-full items-center justify-center rounded-full bg-accent text-[14.5px] font-semibold text-accent-ink">
              Become an ambassador to join
            </Link>
          )
        ) : undefined
      }
    >
      <CampaignCover campaign={campaign} className="-mx-5 -mt-2 h-44 sm:-mx-6 sm:mt-0 sm:rounded-2xl" />

      <h2 className="mt-4 text-[22px] font-bold leading-tight text-ink">{campaign.title}</h2>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-muted">
        <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {campaign.ambassadors} ambassador{campaign.ambassadors === 1 ? "" : "s"}</span>
        {campaign.locations && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {campaign.locations}</span>}
        {campaign.ends_at && <span>Ends {new Date(campaign.ends_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>}
        {partnerUrl && (
          <a href={partnerUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-accent">
            {campaign.partner_name || "Partner"} <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      {campaign.description && <p className="mt-4 whitespace-pre-line text-[14px] leading-relaxed text-ink/85">{campaign.description}</p>}

      {/* ── Your link ── */}
      {joined && link && (
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

      {/* ── How you earn ── */}
      <section className="mt-6">
        <h3 className="text-[12px] font-bold uppercase tracking-wider text-ink-faint">How you earn</h3>
        <div className="zs-inset mt-2 overflow-hidden rounded-2xl p-4">
          <div className="flex items-center justify-between gap-4">
            <span className="text-[13px] leading-relaxed text-ink-muted">
              {usesLink
                ? "Commission on every payment made by the people who join Zero Club through your link — bootcamps, memberships, store purchases and club fees."
                : "This campaign is about reach; your reported results count toward the bonuses below."}
            </span>
            {usesLink && <span className="shrink-0 font-display text-[26px] font-bold text-accent">{rate ?? "—"}%</span>}
          </div>
          {usesLink && rate != null && (
            <p className="mt-3 border-t border-line pt-3 text-[12.5px] text-ink-muted">
              Example: someone you referred pays {money(25000, currency)} for a bootcamp → you earn{" "}
              <span className="font-semibold text-ink">{money((25000 * rate) / 100, currency)}</span>.
            </p>
          )}
        </div>
      </section>

      {tiers.length > 0 && (
        <section className="mt-5">
          <h3 className="text-[12px] font-bold uppercase tracking-wider text-ink-faint">Weekly bonuses (set by Zero Club)</h3>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {tiers.map((t) => {
              const reached = campaign.my_week_results >= t.min;
              return (
                <div key={t.min} className={`flex items-center justify-between rounded-xl px-3.5 py-3 ${reached ? "bg-ok/10" : "zs-inset"}`}>
                  <span className="text-[13px] text-ink-muted">
                    <span className="font-semibold text-ink">{t.min}+</span> results in a week
                  </span>
                  <span className={`text-[13.5px] font-bold ${reached ? "text-ok" : "text-accent"}`}>
                    {reached && <Check className="mr-1 inline h-3.5 w-3.5" />}+{money(t.bonus, currency)}
                  </span>
                </div>
              );
            })}
          </div>
          {joined && upcoming && (
            <p className="mt-2 text-[12.5px] text-ink-muted">
              <span className="font-semibold text-ink">{upcoming.min - campaign.my_week_results} more</span> this week unlocks +{money(upcoming.bonus, currency)}.
            </p>
          )}
        </section>
      )}

      {joined && (
        <section className="mt-5 grid grid-cols-3 gap-2">
          <MiniStat label="This week" value={campaign.my_week_results} />
          <MiniStat label="All time" value={campaign.my_total_results} />
          <MiniStat label="In review" value={campaign.my_pending_results} />
        </section>
      )}

      {/* ── Proof of offline results ── */}
      {joined && usesProof && (
        <section className="mt-5">
          {sent && !proofOpen && (
            <p className="mb-3 rounded-xl bg-ok/10 px-3.5 py-2.5 text-[12.5px] font-semibold text-ok">Sent — the Zero Club team will verify it.</p>
          )}
          {!proofOpen ? (
            <button onClick={() => { setProofOpen(true); setSent(false); }} className="flex h-11 w-full items-center justify-center rounded-full bg-ink text-[13.5px] font-semibold text-white transition hover:opacity-90">
              Report offline results
            </button>
          ) : (
            <div className="zs-inset rounded-2xl p-4">
              <label className="zs-label">How many {campaign.proof_unit_label}s?</label>
              <input className="zs-input" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} placeholder="e.g. 25" />
              <label className="zs-label mt-3">What happened?</label>
              <textarea className="zs-input" rows={3} value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="Where, when, who — the details the team needs to verify it." />
              <label className="zs-label mt-3">Proof link (photos, sheet, post)</label>
              <input className="zs-input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
              <div className="mt-4 flex gap-2">
                <button
                  onClick={sendProof}
                  disabled={sending || !Number(qty) || evidence.trim().length < 15}
                  className="h-11 flex-1 rounded-full bg-accent text-[13.5px] font-semibold text-accent-ink transition hover:opacity-90 disabled:opacity-40"
                >
                  {sending ? "Sending…" : "Send for review"}
                </button>
                <button onClick={() => setProofOpen(false)} className="h-11 rounded-full bg-ink/[0.06] px-5 text-[13.5px] font-semibold text-ink-muted">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {error && <p className="mt-4 rounded-xl bg-bad/10 px-3.5 py-2.5 text-[12.5px] font-medium text-bad">{error}</p>}
    </Sheet>
  );
}

function EarnRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5">
      <span className="text-[13px] text-ink-muted">{label}</span>
      <span className="shrink-0 font-display text-[15px] font-bold text-ink">{value}</span>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="zs-inset rounded-xl p-3 text-center">
      <p className="font-display text-[18px] font-bold text-ink">{value}</p>
      <p className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-faint">{label}</p>
    </div>
  );
}
