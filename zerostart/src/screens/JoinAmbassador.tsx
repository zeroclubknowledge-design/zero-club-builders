import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { BadgeCheck, Check, Clock, MapPin, XCircle } from "lucide-react";
import {
  applyAmbassador, getMe, listFocusAreas, listPushableBootcamps, saveAmbassador,
} from "@/lib/ambassadorApi";
import { useAuth } from "@/lib/auth";
import { CURRENCIES, CURRENCY_ORDER, type PayoutCurrency } from "@/lib/money";
import type { AmbassadorApplication, FocusArea, PushableBootcamp } from "@/types/ambassador";
import { Card, EmptyState, ErrorState, Skeleton } from "@/components/ui/primitives";

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
  const [links, setLinks] = useState("");
  const [currency, setCurrency] = useState<PayoutCurrency>("NGN");

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
            setLinks(app.links || "");
            if (app.payout_currency) setCurrency(app.payout_currency);
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
            links: links.trim() || undefined,
            focus,
            bootcamps: picked,
            currency,
          });
      if (!result.ok) {
        setError(REFUSAL[result.reason || ""] || "Could not save that.");
        return;
      }
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

  if (authLoading) return <Skeleton className="h-[520px] rounded-[18px]" />;
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

  if (isAmbassador === null) return <Skeleton className="h-[520px] rounded-[18px]" />;

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
            className="mt-6 h-11 rounded-full bg-ink px-6 text-[13.5px] font-semibold text-white"
          >
            {pending ? "Edit my application" : "Apply again"}
          </button>
        </Card>
      </div>
    );
  }

  return (
    <div className="zs-rise mx-auto max-w-2xl">
      <h1 className="text-[26px] font-bold text-ink sm:text-[32px]">
        {isAmbassador ? "Your ambassador profile" : "Apply to be a Zero Ambassador"}
      </h1>
      <p className="mt-2 max-w-[54ch] text-[14px] leading-relaxed text-ink-muted">
        {isAmbassador
          ? "Where you represent and what you push. Keep it current so the team knows where you represent Zero Club."
          : "Ambassadors are approved by the Zero Club team. Approved ambassadors earn commission on what the members they bring in pay, get weekly payouts, and wear the Zero Club Ambassador badge."}
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
              className="h-12 w-full rounded-lg border border-line bg-bg pl-10 pr-3.5 text-[13.5px] text-ink outline-none transition placeholder:text-ink-faint focus:border-accent/50"
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
            className="mt-2 h-12 w-full rounded-lg border border-line bg-bg px-3.5 text-[13.5px] text-ink outline-none transition placeholder:text-ink-faint focus:border-accent/50"
          />
        </label>

        <label className="mt-5 block">
          <span className="text-[13px] font-medium text-ink">A line about you</span>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            placeholder="Who you can reach, and why they'd listen to you."
            className="mt-2 w-full resize-y rounded-lg border border-line bg-bg px-3.5 py-3 text-[13.5px] leading-relaxed text-ink outline-none transition placeholder:text-ink-faint focus:border-accent/50"
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
                className="mt-2 w-full resize-y rounded-lg border border-line bg-bg px-3.5 py-3 text-[13.5px] leading-relaxed text-ink outline-none transition placeholder:text-ink-faint focus:border-accent/50"
              />
              <span className="mt-1.5 block text-[11.5px] text-ink-faint">A few sentences — at least 20 characters.</span>
            </label>

            <label className="mt-5 block">
              <span className="text-[13px] font-medium text-ink">Links (socials, communities, portfolio)</span>
              <input
                value={links}
                onChange={(e) => setLinks(e.target.value)}
                placeholder="x.com/you, instagram.com/you, your WhatsApp community…"
                className="mt-2 h-12 w-full rounded-lg border border-line bg-bg px-3.5 text-[13.5px] text-ink outline-none transition placeholder:text-ink-faint focus:border-accent/50"
              />
            </label>

            <div className="mt-5">
              <span className="text-[13px] font-medium text-ink">Get paid in</span>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {CURRENCY_ORDER.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCurrency(c)}
                    className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-left transition ${currency === c ? "bg-ink text-white" : "zs-inset text-ink"}`}
                  >
                    <img src={CURRENCIES[c].flag} alt="" className="h-4 w-6 rounded-[3px] object-cover" />
                    <span className="text-[13px] font-bold">{c}</span>
                  </button>
                ))}
              </div>
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
