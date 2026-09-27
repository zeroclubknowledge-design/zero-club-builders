import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Bell, Camera, Check, Loader2 } from "@/components/icons/glyphs";
import { IconClubs, IconLearn, IconPresentation } from "@/components/icons/nav";
import { supabase } from "@/lib/supabase";
import { uploadFile } from "@/lib/storage";
import { useUser } from "@/hooks/useUser";
import { useFollow } from "@/hooks/useFollow";
import { enablePush, supportsWebPush } from "@/lib/pushSubscription";
import { vapidKeyProblem } from "@/lib/webPush";
import { INTEREST_OPTIONS, MODES, MODE_ORDER, isInstitution, switchMode, type Mode } from "@/lib/modes";

export const Route = createFileRoute("/welcome")({
  component: WelcomePage,
  head: () => ({ meta: [{ title: "Welcome - Zero Club" }] }),
});

/*
 * Onboarding. Runs once for a new member, straight after they confirm their
 * email, and sets up the app around them: which mode they start in, what
 * they're into, how they appear to others, who to follow, and whether their
 * phone should tell them when something happens. Every step after the first
 * can be skipped, and every choice can be changed later.
 */

const MODE_ICONS: Record<Mode, typeof IconLearn> = {
  learner: IconLearn,
  tutor: IconPresentation,
  creator: IconClubs,
};

type Step = "mode" | "interests" | "profile" | "people" | "notifications";

function WelcomePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: profile, isLoading } = useUser();

  const askForPush = typeof window !== "undefined" && supportsWebPush() && Notification.permission === "default" && !vapidKeyProblem();
  const steps: Step[] = ["mode", "interests", "profile", "people", ...(askForPush ? (["notifications"] as const) : [])];

  const [stepIndex, setStepIndex] = useState(0);
  const [mode, setMode] = useState<Mode>("learner");
  const [interests, setInterests] = useState<string[]>([]);
  const [fullName, setFullName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const seeded = useRef(false);

  useEffect(() => {
    if (isLoading) return;
    if (!profile) {
      navigate({ to: "/signin", replace: true });
      return;
    }
    // Organisations have their own application flow and never switch modes.
    if (isInstitution(profile)) {
      navigate({ to: "/app/institution-studio", replace: true });
      return;
    }
    if (!seeded.current) {
      seeded.current = true;
      setFullName(profile.full_name || "");
      setBio(profile.bio || "");
      setAvatarUrl(profile.avatar_url || "");
      if (Array.isArray(profile.interests)) setInterests(profile.interests);
    }
  }, [profile, isLoading, navigate]);

  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;
  const firstName = (profile?.full_name || profile?.username || "").split(" ")[0];

  const toggleInterest = (value: string) =>
    setInterests((current) => (current.includes(value) ? current.filter((item) => item !== value) : [...current, value]));

  const pickPhoto = async (file: File | undefined) => {
    if (!file || !profile) return;
    setUploading(true);
    try {
      const ext = file.type === "image/png" ? "png" : "jpg";
      const url = await uploadFile("profiles", file, `${profile.id}/avatar-${profile.id}-${Date.now()}.${ext}`);
      setAvatarUrl(url);
    } catch (error: any) {
      toast.error(error?.message || "Could not upload that photo");
    } finally {
      setUploading(false);
    }
  };

  /** Save everything and open the app in the chosen mode. */
  const finish = async (destination?: string) => {
    if (!profile || finishing) return;
    setFinishing(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName.trim() || profile.full_name,
          bio: bio.trim(),
          avatar_url: avatarUrl || profile.avatar_url,
          interests,
          onboarded_at: new Date().toISOString(),
        })
        .eq("id", profile.id);
      if (error) throw error;

      if (mode !== "learner") await switchMode(profile.id, mode);
      await queryClient.invalidateQueries({ queryKey: ["profile", "current"] });

      let after: string | null = null;
      try {
        after = sessionStorage.getItem("zc-after-onboarding");
        sessionStorage.removeItem("zc-after-onboarding");
      } catch {
        /* storage unavailable — fall through to the mode's home */
      }
      // An invite or shared link wins over the mode's home page; plain /app
      // (with or without empty search params) does not.
      const afterUrl = after ? new URL(after, window.location.origin) : null;
      const meaningful = afterUrl && (
        afterUrl.pathname.replace(/\/$/, "") !== "/app" || [...afterUrl.searchParams.values()].some(Boolean)
      );
      const target = destination || (meaningful ? after! : MODES[mode].home);
      window.location.replace(target);
    } catch (error: any) {
      toast.error(error?.message || "Could not save your setup");
      setFinishing(false);
    }
  };

  const next = () => (isLast ? void finish() : setStepIndex((index) => index + 1));
  const back = () => setStepIndex((index) => Math.max(0, index - 1));

  if (isLoading || !profile || isInstitution(profile)) {
    return (
      <div className="grid min-h-dvh place-items-center bg-canvas">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const canContinue = step !== "interests" || interests.length > 0;

  return (
    <div className="flex min-h-dvh flex-col bg-card text-foreground">
      <header className="sticky top-0 z-10 bg-card pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 w-full max-w-[520px] items-center gap-2 px-2">
          {stepIndex > 0 ? (
            <button onClick={back} aria-label="Back" className="grid h-11 w-10 place-items-center rounded-full tap hover:bg-foreground/[0.04]">
              <ArrowLeft className="h-[22px] w-[22px]" />
            </button>
          ) : (
            <img src="/logo.png" alt="" className="ml-2 h-7 w-7 object-contain" />
          )}
          <div className="flex flex-1 gap-1.5 px-2" aria-label={`Step ${stepIndex + 1} of ${steps.length}`}>
            {steps.map((item, index) => (
              <span key={item} className={`h-1 flex-1 rounded-full transition-colors ${index <= stepIndex ? "bg-[#cc208f]" : "bg-foreground/10"}`} />
            ))}
          </div>
          {stepIndex > 0 && !isLast ? (
            <button onClick={next} className="h-9 px-3 text-[14px] font-semibold text-muted-foreground hover:text-foreground">
              Skip
            </button>
          ) : (
            <span className="w-3" />
          )}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[520px] flex-1 flex-col px-5 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-4">
        {step === "mode" && (
          <>
            <h1 className="font-display text-[26px] font-semibold leading-tight tracking-[-0.02em]">
              Welcome{firstName ? `, ${firstName}` : ""}. What would you like to do first?
            </h1>
            <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
              One account does all three. Switch between them any time from the menu.
            </p>
            <div className="mt-6 grid gap-2.5">
              {MODE_ORDER.map((option) => {
                const Icon = MODE_ICONS[option];
                const selected = mode === option;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setMode(option)}
                    className={`flex items-start gap-3.5 rounded-2xl border-[1.5px] p-4 text-left transition ${
                      selected ? "border-[#cc208f] bg-[#cc208f]/[0.06]" : "border-foreground/12 hover:border-foreground/25"
                    }`}
                  >
                    <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${selected ? "bg-[#cc208f] text-white" : "bg-foreground/[0.06]"}`}>
                      <Icon active={selected} className="h-[22px] w-[22px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[16px] font-semibold">{MODES[option].verb}</span>
                      <span className="mt-0.5 block text-[14px] leading-snug text-muted-foreground">{MODES[option].blurb}</span>
                    </span>
                    <span className={`mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full border-[1.5px] ${selected ? "border-[#cc208f] bg-[#cc208f] text-white" : "border-foreground/25"}`}>
                      {selected && <Check className="h-3 w-3" />}
                    </span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => void finish("/app/premium?institution=1")}
              className="mt-5 self-start text-[14px] font-semibold text-[#a3186f]"
            >
              Setting up for a school, academy or company?
            </button>
          </>
        )}

        {step === "interests" && (
          <>
            <h1 className="font-display text-[26px] font-semibold leading-tight tracking-[-0.02em]">What are you into?</h1>
            <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
              Pick a few. We'll put matching bootcamps first in Learn.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {INTEREST_OPTIONS.map((option) => {
                const selected = interests.includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => toggleInterest(option)}
                    className={`flex h-10 items-center gap-1.5 rounded-full px-4 text-[15px] font-semibold transition ${
                      selected ? "bg-foreground text-background" : "border border-foreground/25 text-foreground hover:border-foreground/50"
                    }`}
                  >
                    {selected && <Check className="h-4 w-4" />}
                    {option}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {step === "profile" && (
          <>
            <h1 className="font-display text-[26px] font-semibold leading-tight tracking-[-0.02em]">How should people know you?</h1>
            <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">A photo and one line about you go a long way.</p>
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="relative mx-auto mt-7 grid h-28 w-28 place-items-center overflow-hidden rounded-full bg-foreground/[0.06]"
              aria-label="Add a profile photo"
            >
              {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : <Camera className="h-8 w-8 text-muted-foreground" />}
              {uploading && (
                <span className="absolute inset-0 grid place-items-center bg-black/40">
                  <Loader2 className="h-6 w-6 animate-spin text-white" />
                </span>
              )}
            </button>
            <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={(event) => void pickPhoto(event.target.files?.[0])} />
            <p className="mt-2 text-center text-[14px] font-semibold text-[#a3186f]">{avatarUrl ? "Change photo" : "Add a photo"}</p>

            <label className="mt-6 block">
              <span className="mb-1.5 block text-[13px] font-semibold text-muted-foreground">Name</span>
              <input
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Your name"
                className="h-12 w-full rounded-[10px] border border-foreground/15 bg-card px-3 text-[16px] outline-none focus:border-foreground/40"
              />
            </label>
            <label className="mt-4 block">
              <span className="mb-1.5 block text-[13px] font-semibold text-muted-foreground">About you</span>
              <textarea
                value={bio}
                onChange={(event) => setBio(event.target.value.slice(0, 160))}
                placeholder={mode === "tutor" ? "Frontend engineer teaching React to beginners" : "Learning product design, shipping in public"}
                rows={3}
                className="w-full resize-none rounded-[10px] border border-foreground/15 bg-card px-3 py-2.5 text-[16px] outline-none focus:border-foreground/40"
              />
              <span className="mt-1 block text-right text-[12px] tabular-nums text-muted-foreground">{bio.length}/160</span>
            </label>
          </>
        )}

        {step === "people" && <PeopleStep profileId={profile.id} />}

        {step === "notifications" && (
          <div className="flex flex-1 flex-col items-center pt-8 text-center">
            <span className="grid h-20 w-20 place-items-center rounded-3xl bg-[#cc208f]/10 text-[#cc208f]">
              <Bell className="h-9 w-9" />
            </span>
            <h1 className="mt-6 font-display text-[26px] font-semibold leading-tight tracking-[-0.02em]">Don't miss a message</h1>
            <p className="mt-2 max-w-[340px] text-[15px] leading-relaxed text-muted-foreground">
              Get messages, mentions, replies and live classes on your phone, even when Zero Club is closed.
            </p>
          </div>
        )}
      </main>

      <footer className="fixed inset-x-0 bottom-0 z-10 bg-card/95 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto w-full max-w-[520px] px-5">
          {step === "notifications" ? (
            <div className="grid gap-2">
              <button
                type="button"
                disabled={finishing}
                onClick={async () => {
                  try {
                    await enablePush();
                  } catch (error: any) {
                    toast.error(error?.message || "Could not turn on notifications");
                  }
                  void finish();
                }}
                className="h-12 w-full rounded-full bg-foreground text-[16px] font-semibold text-background disabled:opacity-60"
              >
                Turn on notifications
              </button>
              <button type="button" disabled={finishing} onClick={() => void finish()} className="h-11 w-full text-[15px] font-semibold text-muted-foreground">
                Not now
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={next}
              disabled={!canContinue || finishing || uploading}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground text-[16px] font-semibold text-background transition disabled:opacity-40"
            >
              {finishing && <Loader2 className="h-4 w-4 animate-spin" />}
              {isLast ? "Start using Zero Club" : "Continue"}
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}

/** A few active members to follow, so the feed isn't empty on day one. */
function PeopleStep({ profileId }: { profileId: string }) {
  const { data: people = [], isLoading } = useQuery({
    queryKey: ["onboarding-suggestions", profileId],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, username, full_name, avatar_url, bio, account_type")
        .neq("id", profileId)
        .not("username", "is", null)
        .order("xp", { ascending: false })
        .limit(8);
      return data || [];
    },
  });

  return (
    <>
      <h1 className="font-display text-[26px] font-semibold leading-tight tracking-[-0.02em]">Follow a few builders</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">Their posts and ships will fill your feed.</p>
      <div className="mt-5 -mx-5">
        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          people.map((person: any) => <PersonRow key={person.id} person={person} />)
        )}
      </div>
    </>
  );
}

function PersonRow({ person }: { person: any }) {
  const { isFollowing, loading, toggleFollow } = useFollow(person.id);
  const name = person.full_name || person.username;
  return (
    <div className="flex items-center gap-3 border-t border-border/60 px-5 py-3">
      <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-foreground/[0.06] text-[15px] font-semibold text-muted-foreground">
        {person.avatar_url ? <img src={person.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" /> : name?.[0]?.toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold">{name}</p>
        <p className="truncate text-[13px] text-muted-foreground">{person.bio || `@${person.username}`}</p>
      </div>
      <button
        type="button"
        disabled={loading}
        onClick={() => void toggleFollow().catch((error: any) => toast.error(error?.message || "Could not follow"))}
        className={`h-9 shrink-0 rounded-full px-4 text-[14px] font-semibold transition disabled:opacity-60 ${
          isFollowing ? "border-[1.5px] border-foreground/30 text-foreground" : "bg-foreground text-background"
        }`}
      >
        {isFollowing ? "Following" : "Follow"}
      </button>
    </div>
  );
}
