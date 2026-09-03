import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Check, MapPin } from "lucide-react";
import {
  getMe, listFocusAreas, listPushableBootcamps, saveAmbassador,
} from "@/lib/ambassadorApi";
import { useAuth } from "@/lib/auth";
import type { FocusArea, PushableBootcamp } from "@/types/ambassador";
import { Card, EmptyState, ErrorState, Skeleton } from "@/components/ui/primitives";

const REFUSAL: Record<string, string> = {
  location_required: "Tell us where you'll be representing Zero Club.",
  focus_required: "Pick at least one thing you'll work on.",
  not_authenticated: "Sign in first.",
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

  const load = () => {
    setLoadError(null);
    listFocusAreas().then(setAreas).catch((e) => setLoadError(e.message));
    listPushableBootcamps().then(setBootcamps).catch(() => setBootcamps([]));
    // Editing an existing signup rather than starting fresh is the common case
    // after the first visit, so the form arrives filled in.
    if (session) {
      getMe().then((me) => {
        if (!me.found) return;
        setLocation(me.location || "");
        setCountry(me.country || "");
        setBio(me.bio || "");
        setFocus(me.focus || []);
        setPicked(me.bootcamps || []);
      }).catch(() => {});
    }
  };

  useEffect(load, [session?.user?.id]);

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await saveAmbassador({
        location: location.trim(),
        country: country.trim() || undefined,
        bio: bio.trim() || undefined,
        focus,
        bootcamps: picked,
      });
      if (!result.ok) {
        setError(REFUSAL[result.reason || ""] || "Could not save that.");
        return;
      }
      navigate({ to: "/" });
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

  const valid = location.trim().length >= 2 && focus.length > 0;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-[26px] font-bold text-ink sm:text-[32px]">Represent Zero Club</h1>
      <p className="mt-2 max-w-[54ch] text-[14px] leading-relaxed text-ink-muted">
        Tell us where you are and what you want to push. Everything you do from there counts
        toward your level.
      </p>

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
        {saving ? "Saving…" : "Save and continue"}
      </button>
      {!valid && !saving && (
        <p className="mt-3 text-center text-[12px] text-ink-faint">
          {location.trim().length < 2 ? "Add where you represent." : "Pick at least one thing to work on."}
        </p>
      )}
    </div>
  );
}
