import { useState } from "react";
import { ArrowLeft, Check, X } from "lucide-react";
import { createInitiative } from "@/lib/ambassadorApi";
import { INITIATIVE_KINDS, type FocusArea, type InitiativeKind } from "@/types/ambassador";

/**
 * Starting something.
 *
 * Three steps, because asking all of it at once is a form and asking it in
 * order is a decision: what area, what shape of thing, then the detail. The
 * first two are taps, so most of the work is over before any typing starts.
 *
 * Only the ambassador's own chosen focus areas are offered. Committing to
 * something outside what they signed up for is not a thing to design for — if
 * they want to, the answer is to add that lever to their profile first.
 */
export function NewInitiativeSheet({
  profileId,
  areas,
  myFocus,
  onClose,
  onCreated,
}: {
  profileId: string;
  areas: FocusArea[];
  myFocus: string[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [focus, setFocus] = useState<string | null>(null);
  const [kind, setKind] = useState<InitiativeKind | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [target, setTarget] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mine = areas.filter((a) => myFocus.includes(a.slug));
  const offered = mine.length > 0 ? mine : areas;
  const chosenKind = INITIATIVE_KINDS.find((k) => k.value === kind);

  const valid =
    focus &&
    kind &&
    title.trim().length >= 4 &&
    description.trim().length >= 15 &&
    (!chosenKind?.needsTarget || Number(target) > 0);

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    setError(null);
    try {
      await createInitiative({
        profileId,
        focus: focus!,
        kind: kind!,
        title,
        description,
        targetCount: chosenKind?.needsTarget ? Number(target) : null,
        targetLabel: chosenKind?.targetLabel ?? null,
      });
      onCreated();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      {/* The scrim closes it. A sheet with no way out but a small X is the
          commonest way these trap people on a phone. */}
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
      />

      <div className="zs-card relative z-10 max-h-[92dvh] w-full overflow-y-auto rounded-t-[24px] p-5 sm:max-w-[560px] sm:rounded-[24px] sm:p-7">
        <div className="flex items-center gap-3">
          {step > 1 ? (
            <button
              onClick={() => setStep((s) => (s === 3 ? 2 : 1))}
              className="grid h-9 w-9 place-items-center rounded-full bg-ink/[0.06] text-ink-muted transition hover:text-ink"
              aria-label="Back"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          ) : (
            <span className="grid h-9 w-9 place-items-center rounded-full bg-accent-soft text-[12px] font-bold text-accent">
              1
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] font-semibold text-ink">
              {step === 1 ? "Pick an area" : step === 2 ? "What will you do?" : "The details"}
            </h2>
            <p className="text-[11.5px] text-ink-faint">Step {step} of 3</p>
          </div>
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full bg-ink/[0.06] text-ink-muted transition hover:text-ink"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {step === 1 && (
          <div className="mt-5 grid gap-2.5">
            {offered.map((area) => (
              <button
                key={area.slug}
                onClick={() => { setFocus(area.slug); setStep(2); }}
                className={`rounded-[16px] p-4 text-left transition ${
                  focus === area.slug ? "zs-glow-card is-featured bg-accent-soft" : "zs-inset hover:bg-ink/[0.04]"
                }`}
              >
                <span className="block text-[13.5px] font-semibold text-ink">{area.label}</span>
                <span className="mt-1 block text-[12px] leading-relaxed text-ink-muted">
                  {area.description}
                </span>
              </button>
            ))}
            {mine.length === 0 && (
              <p className="mt-1 text-[11.5px] leading-relaxed text-ink-faint">
                These are all the areas. Pick the ones you want on your profile and they'll be the
                only ones offered here.
              </p>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="mt-5 grid gap-2.5">
            {INITIATIVE_KINDS.map((k) => (
              <button
                key={k.value}
                onClick={() => { setKind(k.value); setStep(3); }}
                className={`flex items-start gap-3 rounded-[16px] p-4 text-left transition ${
                  kind === k.value ? "zs-glow-card is-featured bg-accent-soft" : "zs-inset hover:bg-ink/[0.04]"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-semibold text-ink">{k.label}</span>
                  <span className="mt-1 block text-[12px] leading-relaxed text-ink-muted">{k.blurb}</span>
                </span>
                {kind === k.value && <Check className="mt-1 h-4 w-4 shrink-0 text-accent" />}
              </button>
            ))}
          </div>
        )}

        {step === 3 && (
          <div className="mt-5">
            <label className="block">
              <span className="text-[13px] font-medium text-ink">Name it</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Zero Club table at the UNILAG tech fair"
                className="mt-2 h-12 w-full rounded-lg border border-line bg-bg px-3.5 text-[13.5px] text-ink outline-none transition placeholder:text-ink-faint focus:border-accent/50"
              />
            </label>

            <label className="mt-5 block">
              <span className="text-[13px] font-medium text-ink">What's the plan?</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder="What you'll do, who it reaches, and what it should get Zero Club."
                className="mt-2 w-full resize-y rounded-lg border border-line bg-bg px-3.5 py-3 text-[13.5px] leading-relaxed text-ink outline-none transition placeholder:text-ink-faint focus:border-accent/50"
              />
            </label>

            {chosenKind?.needsTarget && (
              <label className="mt-5 block">
                <span className="text-[13px] font-medium text-ink">
                  How many {chosenKind.targetLabel} are you aiming for?
                </span>
                <input
                  type="number"
                  min={1}
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  placeholder="50"
                  className="mt-2 h-12 w-full rounded-lg border border-line bg-bg px-3.5 text-[13.5px] text-ink outline-none transition placeholder:text-ink-faint focus:border-accent/50"
                />
                <span className="mt-1.5 block text-[11.5px] text-ink-faint">
                  A number you actually think you can hit. You'll report what happened either way.
                </span>
              </label>
            )}

            {error && (
              <p className="mt-4 rounded-lg bg-bad/12 px-3.5 py-2.5 text-[12.5px] font-medium text-bad">{error}</p>
            )}

            <button
              onClick={save}
              disabled={!valid || saving}
              className="zs-glow mt-6 h-12 w-full rounded-full bg-accent text-[14px] font-semibold text-accent-ink transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? "Starting…" : "Start it"}
            </button>
            <p className="mt-3 text-center text-[11.5px] leading-relaxed text-ink-faint">
              Go and do it, then come back and say what happened. The team sets the ZP against
              what you achieved.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
