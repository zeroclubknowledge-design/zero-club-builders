import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { BadgeCheck, BriefcaseBusiness, Camera, Check, Clock, Link2, MapPin, MessageCircle, Plus, Users, X, Ban as XCircle } from "../components/icons/glyphs";
import { OTHER_KINDS, SOCIALS, SOCIAL_PLACEHOLDER, parseLinks, serializeLinks, type LinkEntry, type Social } from "@/lib/socialLinks";
import {
  setPayoutFrequency,
  applyAmbassador, getMe, listFocusAreas, listPushableBootcamps, saveAmbassador,
} from "@/lib/ambassadorApi";
import { useAuth } from "@/lib/auth";
import { CURRENCIES, CURRENCY_ORDER, type PayoutCurrency } from "@/lib/money";
import type { AmbassadorApplication, FocusArea, PushableBootcamp } from "@/types/ambassador";
import { Card, EmptyState, ErrorState, Skeleton } from "@/components/ui/primitives";

const EMPTY_SOCIALS: Record<Social, string> = { WhatsApp: "", LinkedIn: "", X: "", Instagram: "", Facebook: "" };

/* Neutral glyphs on each network's own colour, so the row reads at a glance. */
const SOCIAL_META: Record<Social, { color: string; icon: typeof Link2 }> = {
  WhatsApp: { color: "#25d366", icon: MessageCircle },
  LinkedIn: { color: "#0a66c2", icon: BriefcaseBusiness },
  X: { color: "#000000", icon: X },
  Instagram: { color: "linear-gradient(45deg,#f9a825,#e1306c 55%,#833ab4)", icon: Camera },
  Facebook: { color: "#1877f2", icon: Users },
};

const REFUSAL: Record<string, string> = {
  location_required: "Tell us where you'll be representing Zero Club.",
  focus_required: "Pick at least one thing you'll work on.",
  not_authenticated: "Sign in first.",
  motivation_required: "Tell the team why you want to be an ambassador (a couple of sentences).",
  already_ambassador: "You're already a Zero Ambassador.",
  not_approved: "Your application hasn't been approved yet.",
};

/**
 * Becoming an ambassador, or changing what you signed up to do.
 *
 * The two questions that matter are *where* and *what*. Everything an
 * ambassador is measured on follows from those, so the form asks for nothing
 * else until they are answered.
 */
export function JoinAmbassador() {
  const navigate = useNavigate();
  const { session, loading: authLoading } = useAuth();

  const [areas, setAreas] = useState<FocusArea[] | null>(null);
  const [bootcamps, setBootcamps] = useState<PushableBootcamp[]>([]);
  const [location, setLocation] = useState("");
  const [country, setCountry] = useState("");
  const [bio, setBio] = useState("");
  const [focus, setFocus] = useState<string[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Applying vs. editing an approved profile.
  const [isAmbassador, setIsAmbassador] = useState<boolean | null>(null);
  const [rate, setRate] = useState<number | null>(null);
  const [application, setApplication] = useState<AmbassadorApplication | null>(null);
  const [editingApplication, setEditingApplication] = useState(false);
  const [motivation, setMotivation] = useState("");
  const [socials, setSocials] = useState<Record<Social, string>>(EMPTY_SOCIALS);
  const [others, setOthers] = useState<LinkEntry[]>([]);
  const [currency, setCurrency] = useState<PayoutCurrency>("NGN");
  const [frequency, setFrequency] = useState<"weekly" | "monthly">("weekly");

  const load = () => {
    setLoadError(null);
    listFocusAreas().then(setAreas).catch((e) => setLoadError(e.message));
    listPushableBootcamps().then(setBootcamps).catch(() => setBootcamps([]));
    // Editing an existing signup rather than starting fresh is the common case
    // after the first visit, so the form arrives filled in.
    if (session) {
      getMe().then((me) => {
        setIsAmbassador(Boolean(me.found));
        if (!me.found) {
          const app = me.application && me.application.status !== "none" ? me.application : null;
          setApplication(app);
          setRate(me.default_rate ?? null);
          if (app) {
            setLocation(app.location || "");
            setCountry(app.country || "");
            setBio(app.bio || "");
            setFocus(app.focus || []);
            setPicked(app.bootcamps || []);
            setMotivation(app.motivation || "");
            const parsed = parseLinks(app.links);
            const nextSocials = { ...EMPTY_SOCIALS };
            const rest: LinkEntry[] = [];
            for (const entry of parsed) {
              const social = SOCIALS.find((n) => n.toLowerCase() === entry.label.toLowerCase());
              if (social && !nextSocials[social]) nextSocials[social] = entry.value;
              else rest.push(entry);
            }
            setSocials(nextSocials);
            setOthers(rest);
            if (app.payout_currency) setCurrency(app.payout_currency);
            if (app.payout_frequency === "monthly" || app.payout_frequency === "weekly") setFrequency(app.payout_frequency);
          }
          return;
        }
        setRate(me.commission_rate ?? null);
        setLocation(me.location || "");
        setCountry(me.country || "");
        setBio(me.bio || "");
        setFocus(me.focus || []);
        setPicked(me.bootcamps || []);
      }).catch(() => setIsAmbassador(false));
    }
  };

  useEffect(load, [session?.user?.id]);

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = isAmbassador
        ? await saveAmbassador({
            location: location.trim(),
            country: country.trim() || undefined,
            bio: bio.trim() || undefined,
            focus,
            bootcamps: picked,
          })
        : await applyAmbassador({
            location: location.trim(),
            country: country.trim() || undefined,
            bio: bio.trim() || undefined,
            motivation: motivation.trim(),
            links: serializeLinks([
              ...SOCIALS.map((name) => ({ label: name, value: socials[name] })),
              ...others,
            ]) || undefined,
            focus,
            bootcamps: picked,
            currency,
          });
      if (!result.ok) {
        setError(REFUSAL[result.reason || ""] || "Could not save that.");
        return;
      }
      if (!isAmbassador) await setPayoutFrequency(frequency).catch(() => undefined);
      if (isAmbassador) navigate({ to: "/" });
      else {
        setApplication({ ...(application || {}), status: "pending", created_at: application?.created_at || new Date().toISOString() });
        setEditingApplication(false);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (authLoading) return <Skeleton className="h-[520px] rounded-[20px]" />;
  if (!session) {
    return (
      <EmptyState
        title="Sign in to become an ambassador"
        body="Ambassadors use the same Zero account as everything else."
      />
    );
  }
  if (loadError) return <ErrorState message={loadError} onRetry={load} />;

  const valid =
    location.trim().length >= 2 && focus.length > 0 && (isAmbassador || motivation.trim().length >= 20);

  if (isAmbassador === null) return <Skeleton className="h-[520px] rounded-[20px]" />;

  // An application is waiting (or was decided) and they are not editing it.
  if (!isAmbassador && application && !editingApplication && application.status !== "approved") {
    const pending = application.status === "pending";
    return (
      <div className="zs-rise mx-auto max-w-2xl">
        <Card className="p-7 text-center">
          <span className={`mx-auto grid h-14 w-14 place-items-center rounded-2xl ${pending ? "bg-warn/12 text-warn" : "bg-bad/10 text-bad"}`}>
            {pending ? <Clock className="h-6 w-6" /> : <XCircle className="h-6 w-6" />}
          </span>
          <h1 className="mt-4 text-[22px] font-bold text-ink">
            {pending ? "Your application is under review" : "Your application wasn't approved"}
          </h1>
          <p className="mx-auto mt-2 max-w-[44ch] text-[13.5px] leading-relaxed text-ink-muted">
            {pending
              ? "The Zero Club team reviews every application. You'll get a notification as soon as there's a decision — and once approved, the Zero Club Ambassador badge appears on your profile."
              : application.review_note || "You're welcome to strengthen your application and apply again."}
          </p>
          {application.created_at && (
            <p className="mt-3 text-[12px] text-ink-faint">Submitted {new Date(application.created_at).toLocaleDateString(undefined, { month: "long", day: "numeric" })}</p>
          )}
          <button
            onClick={() => setEditingApplication(true)}
            className="mt-6 h-11 rounded-full bg-ink px-6 text-[13.5px] font-semibold text-bg"
          >
            {pending ? "Edit my application" : "Apply again"}
          </button>
        </Card>
      </div>
    );
  }

  return (
    <div className="zs-rise mx-auto max-w-2xl">
      {!isAmbassador && (
        <div className="relative mb-7 overflow-hidden rounded-[24px] shadow-[0_24px_60px_-30px_rgba(204,32,143,0.55)] ring-1 ring-black/5">
          <img
            src="/ambassador-banner.jpg"
            alt="Zero Club — The Student Ambassador Program, for the top 1,000 Nigerian students"
            width={1600}
            height={1066}
            className="block aspect-[3/2] w-full object-cover"
          />
        </div>
      )}
      <h1 className="text-[26px] font-bold text-ink sm:text-[32px]">
        {isAmbassador ? "Your ambassador profile" : "Apply to be a Zero Ambassador"}
      </h1>
      <p className="mt-2 max-w-[54ch] text-[14px] leading-relaxed text-ink-muted">
        {isAmbassador
          ? "Where you represent and what you push. Keep it current so the team knows where you represent Zero Club."
          : "Ambassadors are approved by the Zero Club team. Approved ambassadors earn commission on what the members they bring in pay, withdraw weekly or monthly, and wear the Zero Club Ambassador badge."}
      </p>

      {rate !== null && (
        <Card className="mt-6 flex items-center gap-4 p-5">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-accent text-white">
            <BadgeCheck className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <p className="font-display text-[20px] font-bold text-ink">{rate}% commission</p>
            <p className="text-[12.5px] text-ink-muted">
              {isAmbassador
                ? "Your locked-in rate on every payment made by members who joined through your links."
                : "The current rate for newly approved ambassadors, locked in when you're approved."}
            </p>
          </div>
        </Card>
      )}

      <Card className="mt-6 p-6 sm:p-7">
        <label className="block">
          <span className="text-[13px] font-medium text-ink">Where do you represent?</span>
          <span className="relative mt-2 block">
            <MapPin className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Yaba, Lagos"
              className="h-12 w-full rounded-xl border border-line bg-surface pl-10 pr-3.5 text-[13.5px] text-ink outline-none transition placeholder:text-ink-faint focus:border-accent/50"
            />
          </span>
          <span className="mt-1.5 block text-[11.5px] text-ink-faint">
            A campus, a city, a neighbourhood — whatever you actually cover.
          </span>
        </label>

        <label className="mt-5 block">
          <span className="text-[13px] font-medium text-ink">Country</span>
          <input
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            placeholder="Nigeria"
            className="mt-2 h-12 w-full rounded-xl border border-line bg-surface px-3.5 text-[13.5px] text-ink outline-none transition placeholder:text-ink-faint focus:border-accent/50"
          />
        </label>

        <label className="mt-5 block">
          <span className="text-[13px] font-medium text-ink">A line about you</span>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            placeholder="Who you can reach, and why they'd listen to you."
            className="mt-2 w-full resize-y rounded-xl border border-line bg-surface px-3.5 py-3 text-[13.5px] leading-relaxed text-ink outline-none transition placeholder:text-ink-faint focus:border-accent/50"
          />
        </label>

        {!isAmbassador && (
          <>
            <label className="mt-5 block">
              <span className="text-[13px] font-medium text-ink">Why do you want to be a Zero Ambassador?</span>
              <textarea
                value={motivation}
                onChange={(e) => setMotivation(e.target.value)}
                rows={4}
                placeholder="Who can you reach, what have you organised before, and how would you grow Zero Club where you are?"
                className="mt-2 w-full resize-y rounded-xl border border-line bg-surface px-3.5 py-3 text-[13.5px] leading-relaxed text-ink outline-none transition placeholder:text-ink-faint focus:border-accent/50"
              />
              <span className="mt-1.5 block text-[11.5px] text-ink-faint">A few sentences — at least 20 characters.</span>
            </label>

            <div className="mt-5">
              <span className="text-[13px] font-medium text-ink">Your socials</span>
              <span className="mt-0.5 block text-[11.5px] text-ink-faint">Add the ones you use — leave the rest empty.</span>
              <div className="mt-2.5 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
                {SOCIALS.map((name) => {
                  const meta = SOCIAL_META[name];
                  const Icon = meta.icon;
                  return (
                    <label key={name} className="flex items-center gap-3 px-3.5 py-2">
                      <span className="flex w-[108px] shrink-0 items-center gap-2.5">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white" style={{ background: meta.color }}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="text-[13px] font-semibold text-ink">{name}</span>
                      </span>
                      <input
                        value={socials[name]}
                        onChange={(e) => setSocials((prev) => ({ ...prev, [name]: e.target.value }))}
                        placeholder={SOCIAL_PLACEHOLDER[name]}
                        inputMode="url"
                        autoCapitalize="off"
                        autoCorrect="off"
                        className="h-11 min-w-0 flex-1 rounded-xl bg-bg px-3 text-[13px] text-ink outline-none transition placeholder:text-ink-faint focus:ring-2 focus:ring-accent/30"
                      />
                    </label>
                  );
                })}
              </div>

              <span className="mt-5 block text-[13px] font-medium text-ink">Other links</span>
              <span className="mt-0.5 block text-[11.5px] text-ink-faint">Communities you run, your portfolio, a website…</span>
              {others.length > 0 && (
                <div className="mt-2.5 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
                  {others.map((entry, i) => (
                    <div key={i} className="flex items-center gap-2 px-3.5 py-2">
                      <span className="relative w-[108px] shrink-0">
                        <select
                          value={(OTHER_KINDS as readonly string[]).includes(entry.label) ? entry.label : "Other"}
                          onChange={(e) => setOthers((prev) => prev.map((o, j) => (j === i ? { ...o, label: e.target.value } : o)))}
                          aria-label="Link type"
                          className="h-11 w-full appearance-none rounded-xl bg-ink/[0.05] pl-3 pr-6 text-[13px] font-semibold text-ink outline-none"
                        >
                          {OTHER_KINDS.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
                        </select>
                        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-ink-faint">▾</span>
                      </span>
                      <input
                        value={entry.value}
                        onChange={(e) => setOthers((prev) => prev.map((o, j) => (j === i ? { ...o, value: e.target.value } : o)))}
                        placeholder="Paste the link"
                        inputMode="url"
                        autoCapitalize="off"
                        autoCorrect="off"
                        className="h-11 min-w-0 flex-1 rounded-xl bg-bg px-3 text-[13px] text-ink outline-none transition placeholder:text-ink-faint focus:ring-2 focus:ring-accent/30"
                      />
                      <button
                        type="button"
                        onClick={() => setOthers((prev) => prev.filter((_, j) => j !== i))}
                        aria-label="Remove link"
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-faint transition hover:bg-ink/[0.05] hover:text-ink"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => setOthers((prev) => [...prev, { label: prev.length === 0 ? "Community" : "Portfolio", value: "" }])}
                disabled={others.length >= 8}
                className="mt-2.5 inline-flex h-10 items-center gap-2 rounded-full border border-dashed border-ink/20 px-4 text-[13px] font-semibold text-ink transition hover:border-ink/40 disabled:opacity-40"
              >
                <Plus className="h-4 w-4" /> Add another link
              </button>
            </div>

            <div className="mt-5">
              <span className="text-[13px] font-medium text-ink">Get paid in</span>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {CURRENCY_ORDER.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCurrency(c)}
                    className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-left transition ${currency === c ? "bg-ink text-bg" : "zs-inset text-ink"}`}
                  >
                    <img src={CURRENCIES[c].flag} alt="" className="h-4 w-6 rounded-[3px] object-cover" />
                    <span className="text-[13px] font-bold">{c}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5">
              <span className="text-[13px] font-medium text-ink">How often do you want to withdraw?</span>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {([
                  ["weekly", "Weekly", "Withdraw your approved earnings every week"],
                  ["monthly", "Monthly", "Let it build up and withdraw once a month"],
                ] as const).map(([value, name, hint]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFrequency(value)}
                    aria-pressed={frequency === value}
                    className={`rounded-xl px-3.5 py-3 text-left transition ${frequency === value ? "bg-ink text-bg" : "zs-inset text-ink"}`}
                  >
                    <span className="block text-[13.5px] font-bold">{name}</span>
                    <span className={`mt-0.5 block text-[11.5px] leading-snug ${frequency === value ? "text-bg/70" : "text-ink-faint"}`}>{hint}</span>
                  </button>
                ))}
              </div>
              <span className="mt-1.5 block text-[11.5px] text-ink-faint">You can change this later in your profile settings — up to 4 times a month.</span>
            </div>
          </>
        )}
      </Card>

      <div className="mt-8">
        <h2 className="text-[12px] font-bold uppercase tracking-wider text-ink-faint">
          What will you work on?
        </h2>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">
          Pick everything you're willing to do. These are the levers that actually move Zero
          Club, and your tasks come from what you choose.
        </p>

        {!areas ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[92px] rounded-[16px]" />)}
          </div>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {areas.map((area) => {
              const on = focus.includes(area.slug);
              return (
                <button
                  key={area.slug}
                  type="button"
                  onClick={() => setFocus((f) => toggle(f, area.slug))}
                  className={`rounded-[16px] p-4 text-left transition ${
                    on
                      ? "zs-glow-card is-featured bg-accent-soft"
                      : "zs-card hover:bg-ink/[0.02]"
                  }`}
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="text-[13.5px] font-semibold text-ink">{area.label}</span>
                    <span
                      className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md transition ${
                        on ? "bg-accent text-accent-ink" : "bg-ink/[0.06]"
                      }`}
                    >
                      {on && <Check className="h-3 w-3" strokeWidth={3} />}
                    </span>
                  </span>
                  <span className="mt-1.5 block text-[12px] leading-relaxed text-ink-muted">
                    {area.description}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Only asked once "fill bootcamps" is one of the levers — otherwise it
          is a question about work they have not signed up for. */}
      {focus.includes("bootcamps") && bootcamps.length > 0 && (
        <div className="mt-8">
          <h2 className="text-[12px] font-bold uppercase tracking-wider text-ink-faint">
            Which bootcamps will you push?
          </h2>
          <div className="mt-4 space-y-2">
            {bootcamps.map((b) => {
              const on = picked.includes(b.id);
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setPicked((p) => toggle(p, b.id))}
                  className={`flex w-full items-center gap-3 rounded-xl p-3.5 text-left transition ${
                    on ? "zs-card ring-1 ring-accent/40" : "zs-inset hover:bg-ink/[0.04]"
                  }`}
                >
                  <span
                    className={`grid h-5 w-5 shrink-0 place-items-center rounded-md ${
                      on ? "bg-accent text-accent-ink" : "bg-ink/[0.06]"
                    }`}
                  >
                    {on && <Check className="h-3 w-3" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-ink">{b.title}</span>
                    {b.category && (
                      <span className="block truncate text-[11.5px] text-ink-faint">{b.category}</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {error && (
        <p className="mt-6 rounded-xl bg-bad/12 px-4 py-3 text-[13px] font-medium text-bad">{error}</p>
      )}

      <button
        onClick={save}
        disabled={!valid || saving}
        className="zs-glow mt-7 h-12 w-full rounded-full bg-accent text-[14px] font-semibold text-accent-ink transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {saving ? "Saving…" : isAmbassador ? "Save changes" : application?.status === "pending" ? "Update application" : "Submit application"}
      </button>
      {!valid && !saving && (
        <p className="mt-3 text-center text-[12px] text-ink-faint">
          {location.trim().length < 2
            ? "Add where you represent."
            : focus.length === 0
              ? "Pick at least one thing to work on."
              : "Tell the team why you want to be an ambassador."}
        </p>
      )}
    </div>
  );
}
