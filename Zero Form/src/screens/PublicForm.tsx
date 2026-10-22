import { Link } from "@tanstack/react-router";
import { config, zc } from "@/lib/config";
import { AuthSheet } from "@/components/auth/AuthSheet";
import { AccountChip } from "@/components/AccountChip";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Loader2,
  Maximize,
  Paperclip,
  Pause,
  Play,
  PlayCircle,
  Users,
  Volume2,
  VolumeX,
  Wallet,
} from "@/components/icons/glyphs";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { formatWalletAmount } from "@/hooks/useWalletCurrency";
import { ZeroGiftPaymentOption } from "@/components/ZeroGiftPaymentOption";
import {
  ZERO_FORM_ALLOWED_UPLOAD_TYPES,
  ZERO_FORM_MAX_UPLOAD_BYTES,
  ZERO_FORM_UPLOAD_ACCEPT,
  ZERO_FORM_UPLOAD_BUCKET,
  earlyBirdSaving,
  formatCountdown,
  formatFileSize,
  isUploadAnswer,
  isZeroFormFieldVisible,
} from "@/features/zeroForm/templates";
import { openPaystackCheckout, buildReference, paystackKeyProblem } from "@/lib/paystack";
import { RichText, richTextToPlain } from "@/components/RichText";
import { CardSelect } from "@/components/CardSelect";

const money = (value: number) => formatWalletAmount(Number(value) || 0);

type Tab = "details" | "content" | "register";

function ZeroFormVideoPlayer({ src, poster }: { src: string; poster?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const hideControlsTimeout = useRef<any>(null);
  useEffect(() => () => { if (hideControlsTimeout.current) clearTimeout(hideControlsTimeout.current); }, []);

  /* The container is given the video's own shape as soon as we know it. This
     is what stops the video escaping its box: the frame below is pinned to
     this container's edges, so it can never resize itself when playback
     starts. 16/9 is only the placeholder until the real dimensions arrive. */
  const [ratio, setRatio] = useState(16 / 9);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play().catch(() => {});
    }
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!videoRef.current) return;
    const nextMuted = !isMuted;
    videoRef.current.muted = nextMuted;
    setIsMuted(nextMuted);
  };

  const toggleFullscreen = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      containerRef.current.requestFullscreen().catch(() => {});
    }
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const cur = videoRef.current.currentTime;
    const dur = Number.isFinite(videoRef.current.duration) ? videoRef.current.duration : 0;
    setCurrentTime(cur);
    setDuration(dur);
    setProgress(dur > 0 ? (cur / dur) * 100 : 0);
  };

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (video?.videoWidth && video.videoHeight) {
      setRatio(video.videoWidth / video.videoHeight);
    }
    handleTimeUpdate();
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!videoRef.current) return;
    const newTime = (Number(e.target.value) / 100) * duration;
    videoRef.current.currentTime = newTime;
    setProgress(Number(e.target.value));
  };

  const handleMouseMove = () => {
    setShowControls(true);
    if (hideControlsTimeout.current) clearTimeout(hideControlsTimeout.current);
    if (isPlaying) {
      hideControlsTimeout.current = setTimeout(() => {
        setShowControls(false);
      }, 2500);
    }
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds <= 0) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      /* This box holds the video's exact shape, so the frame inside can be
         pinned to its edges and never resize itself mid-playback.
         It stays SQUARE on purpose: the rounded corners are painted over the
         top by the mask below, and rounding here would clip that paint away. */
      className="group relative mx-auto mb-6 overflow-hidden bg-black shadow-md"
      style={{
        aspectRatio: String(ratio),
        // A portrait video would otherwise run taller than the screen. Capping
        // the WIDTH keeps the true shape intact; capping height would not.
        maxWidth: ratio < 1 ? `calc(72vh * ${ratio})` : undefined,
      }}
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        autoPlay
        loop
        muted={isMuted}
        playsInline
        preload="metadata"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => {
          setIsPlaying(false);
          setShowControls(true);
        }}
        onClick={togglePlay}
        /* Pinned to the container's edges rather than sized by the video's own
           dimensions — this is what stops it resizing when playback starts.

           object-contain, never object-cover. `cover` asks the browser to CROP
           the frame, and cropping cannot happen on the hardware overlay path,
           so the browser draws the whole frame instead and it spills past the
           box. `contain` only ever shrinks to fit, so it cannot overflow. And
           because the container now carries the video's exact shape, contain
           has nothing to letterbox — no black bars either. */
        className="absolute inset-0 h-full w-full cursor-pointer bg-black object-contain"
      />

      {/* ── The rounded corners ──────────────────────────────────────────────
          A rounded rectangle whose box-shadow spreads OUTWARD in the page
          colour. Everything outside the rounded shape — precisely the four
          corner wedges — gets painted over, and the parent's overflow-hidden
          stops the spread from bleeding across the page. The inset shadow
          draws the hairline border on top so it stays rounded too.
          It sits above everything — video, play button and the controls bar —
          so all three get rounded together; pointer-events-none means clicks
          still reach the controls underneath. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-30"
        style={{
          borderRadius: "1rem",
          boxShadow:
            "0 0 0 120px var(--zc-media-surface), inset 0 0 0 1px var(--border)",
        }}
      />

      <button type="button" onClick={toggleMute} aria-label={isMuted ? "Turn sound on" : "Turn sound off"} className="absolute right-3 top-3 z-20 inline-flex min-h-11 items-center gap-2 rounded-full bg-black/65 px-4 text-xs font-semibold text-white backdrop-blur">{isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}{isMuted ? "Sound on" : "Sound off"}</button>

      {/* Center Play Button when Paused */}
      {!isPlaying && (
        <button
          type="button"
          onClick={togglePlay}
          className="absolute inset-0 z-10 grid place-items-center bg-black/30 transition-all hover:bg-black/20"
          aria-label="Play video"
        >
          <div className="grid h-16 w-16 place-items-center rounded-full bg-primary text-primary-foreground shadow-2xl backdrop-blur-md transition-transform duration-200 hover:scale-110 active:scale-95">
            <Play className="h-7 w-7 translate-x-0.5 fill-current" />
          </div>
        </button>
      )}

      {/* Floating Modern Controls Bar */}
      <div
        className={`absolute bottom-0 left-0 right-0 z-20 flex flex-col gap-2 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-3.5 transition-opacity duration-300 ${
          showControls || !isPlaying ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      >
        <div className="relative flex items-center w-full">
          <input
            type="range"
            min="0"
            max="100"
            value={progress || 0}
            onChange={handleSeek}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-white/25 accent-primary focus:outline-none"
          />
        </div>

        <div className="flex items-center justify-between text-white text-xs font-medium pt-1">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={togglePlay}
              className="grid h-8 w-8 place-items-center rounded-full bg-white/10 hover:bg-white/20 transition text-white"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current translate-x-0.5" />}
            </button>
            <button
              type="button"
              onClick={toggleMute}
              className="grid h-8 w-8 place-items-center rounded-full bg-white/10 hover:bg-white/20 transition text-white"
              aria-label={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            <span className="text-[12px] font-mono text-white/80">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          <button
            type="button"
            onClick={toggleFullscreen}
            className="grid h-8 w-8 place-items-center rounded-full bg-white/10 hover:bg-white/20 transition text-white"
            aria-label="Toggle Fullscreen"
          >
            <Maximize className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function ZeroFormPublicPage({ slug }: { slug: string }) {
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<Tab>("details");
  // Checkbox questions hold several values, so an answer is a string or an
  // array of strings. The answers column is jsonb, so both store as they are.
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [guest, setGuest] = useState({ name: "", email: "", phone: "" });
  const [intent, setIntent] = useState<"interest" | "pay">("pay");
  const [session, setSession] = useState<any>(null);
  const [checkedSession, setCheckedSession] = useState(false);
  const [done, setDone] = useState<null | "confirmed" | "interested" | "submitted">(null);
  /* Pay without an account: answers are saved, sign-up opens, and once signed
     in they come back here with everything filled in, ready to pay. */
  const resumeKey = `zf-resume:${slug}`;
  const [resumed, setResumed] = useState(false);
  const [enrolledBootcamp, setEnrolledBootcamp] = useState<string | null>(null);
  const [shortfall, setShortfall] = useState<number | null>(null);
  const [applyGift, setApplyGift] = useState(false);
  const registerRef = useRef<HTMLDivElement>(null);
  /* Sign-up / sign-in opens over the form instead of sending people to another site. */
  const [authMode, setAuthMode] = useState<null | "signup" | "signin">(null);
  const afterAuth = async () => {
    const { data: next } = await supabase.auth.getSession();
    setSession(next.session);
    // A guest sign-up made with this email becomes theirs.
    await supabase.rpc("claim_guest_zero_form_registrations" as never).then(() => undefined, () => undefined);
    setResumed(false);
    void queryClient.invalidateQueries({ queryKey: ["zero-form-public", slug] });
  };
  const authSheet = (
    <AuthSheet
      open={!!authMode}
      initialMode={authMode || "signup"}
      initialEmail={guest.email}
      initialName={guest.name}
      heading={authMode === "signin" ? undefined : "Create your free Zero Club account"}
      subheading={authMode === "signin" ? undefined : "Your answers are saved. One account tracks your place here, on Zero Club and in every Zero product."}
      onClose={() => setAuthMode(null)}
      onDone={() => void afterAuth()}
    />
  );

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setCheckedSession(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, next) => setSession(next));
    return () => sub.subscription.unsubscribe();
  }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: ["zero-form-public", slug],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_zero_form_public", { form_slug: slug });
      if (error) throw error;
      return data as any;
    },
    retry: false,
  });

  useEffect(() => {
    if (data?.found) supabase.rpc("record_zero_form_view", { form_slug: slug }).then(() => {});
  }, [data?.found, slug]);

  /* The tab shows the form's own name. */
  useEffect(() => {
    const t = data?.form?.title || data?.bootcamp?.title;
    if (t) document.title = `${t} — ${config.appName}`;
  }, [data?.form?.title, data?.bootcamp?.title]);

  const form = data?.form;
  const bootcamp = data?.bootcamp;
  const owner = data?.owner;
  const state = data?.state as string | undefined;
  const fields = (data?.fields || []) as any[];
  const curriculum = (data?.curriculum || []) as any[];

  // Pricing switched off: the form only collects details.
  const isWaitlist = form?.form_kind === "waitlist" || (!bootcamp?.id && !!form);
  const dataOnly = form?.pricing_enabled === false || isWaitlist;
  const price = dataOnly ? 0 : Number(form?.early_bird_price || 0);
  const isPaid = price > 0;
  const saving = earlyBirdSaving(form?.regular_price, form?.early_bird_price);
  const countdown = formatCountdown(bootcamp?.starts_at);
  const allowInterest = form?.allow_interest !== false;

  // Free bootcamps only have one path.
  useEffect(() => { if (!isPaid) setIntent("interest"); }, [isPaid]);

  useEffect(() => {
    const existing = data?.my_registration?.registration_data;
    if (existing && typeof existing === "object") setAnswers(existing);
  }, [data?.my_registration]);

  // Back from signing up / in: restore the saved answers and pick up at payment.
  useEffect(() => {
    if (!checkedSession || !session || !data?.found || resumed) return;
    let saved: { answers?: Record<string, string | string[]>; intent?: "pay" | "interest" } | null = null;
    try {
      saved = JSON.parse(localStorage.getItem(resumeKey) || "null");
    } catch {
      saved = null;
    }
    const asked = new URLSearchParams(window.location.search).get("resume") === "1";
    if (!saved && !asked) return;
    setResumed(true);
    if (saved?.answers) setAnswers((current) => ({ ...saved!.answers, ...current }));
    if (saved?.intent) setIntent(saved.intent);
    setTab("register");
    setTimeout(() => registerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
  }, [checkedSession, session, data?.found, resumed, resumeKey]);

  const sendToSignUp = (where: "/signup" | "/signin" = "/signup") => {
    try {
      localStorage.setItem(resumeKey, JSON.stringify({ answers, intent: dataOnly ? "interest" : intent, at: Date.now() }));
    } catch {
      /* without storage they re-enter their answers */
    }
    setAuthMode(where === "/signup" ? "signup" : "signin");
  };

  // Conditional follow-ups only count (and only show) when their answer matches.
  const visibleFields = useMemo(
    () => fields.filter((f) => isZeroFormFieldVisible(f, fields, answers)),
    [fields, answers],
  );
  const missingRequired = useMemo(
    () =>
      visibleFields.filter((f) => {
        if (!f.required) return false;
        const answer = answers[f.field_key];
        // An empty array is an unanswered checkbox question. String(answer)
        // alone would turn [] into "" and a one-item array into its contents,
        // so arrays are checked on length instead.
        if (Array.isArray(answer)) return answer.length === 0;
        // A file answer is an object; it counts as answered once uploaded.
        if (isUploadAnswer(answer)) return false;
        return !String(answer ?? "").trim();
      }),
    [visibleFields, answers],
  );

  const goRegister = () => {
    setTab("register");
    setTimeout(() => registerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };

  const submit = useMutation({
    mutationFn: async () => {
      const { data: result, error } = await supabase.rpc("submit_zero_form_with_gift", {
        form_slug: slug,
        // Answers to follow-ups that ended up hidden are not sent.
        answers: Object.fromEntries(Object.entries(answers).filter(([key]) => visibleFields.some((f) => f.field_key === key))),
        intent: dataOnly ? "interest" : intent,
        guest: session ? null : { name: guest.name, email: guest.email, phone: guest.phone },
        p_apply_gift: !!session && applyGift && !dataOnly && intent === "pay",
      });
      if (error) throw error;
      return result as any;
    },
    onSuccess: async (result) => {
      // Paying needs an account so the place can be given automatically.
      if (result?.status === "sign_in_required") {
        sendToSignUp("/signup");
        return;
      }
      if (result?.status === "already_enrolled") {
        setEnrolledBootcamp(result.bootcamp_id || bootcamp?.id || null);
        setDone("confirmed");
        return;
      }
      if (result?.status === "insufficient_funds") {
        setShortfall(Number(result.shortfall) || 0);
        return;
      }

      // Guests pay by card; the server confirms the row once verified.
      if (result?.status === "payment_required") {
        const keyProblem = paystackKeyProblem();
        if (keyProblem) {
          toast.error("Card payment is not available yet", {
            description: `${keyProblem} Choose "Register interest" instead for now.`,
          });
          return;
        }
        try {
          const reference = buildReference(result.registration_id);
          await openPaystackCheckout({
            email: result.email || guest.email,
            amount: Number(result.amount),
            currency: "NGN",
            reference,
            profileId: result.registration_id,
            displayName: guest.name,
          });
          const { data: verified, error: verifyError } = await supabase.functions.invoke("paystack-verify", {
            body: { reference, zero_form_registration_id: result.registration_id },
          });
          if (verifyError) throw new Error(verifyError.message);
          if ((verified as any)?.error) throw new Error((verified as any).error);
          setDone("confirmed");
        } catch (paymentError: any) {
          toast.error(paymentError?.message === "Payment cancelled"
            ? "Payment cancelled — your details were saved, you can pay again."
            : paymentError?.message || "Payment could not be completed");
        }
        return;
      }

      setShortfall(null);
      try {
        localStorage.removeItem(resumeKey);
      } catch {
        /* nothing saved */
      }
      if (["enrolled", "confirmed", "already_registered"].includes(result?.status) && (result?.bootcamp_id || bootcamp?.id)) {
        setEnrolledBootcamp(result.bootcamp_id || bootcamp?.id);
      }
      setDone(
        result?.status === "submitted" ? "submitted" : result?.status === "interested" ? "interested" : "confirmed",
      );
      queryClient.invalidateQueries({ queryKey: ["zero-form-public", slug] });
      queryClient.invalidateQueries({ queryKey: ["profile", "current"] });
      queryClient.invalidateQueries({ queryKey: ["zero-gift-balance"] });
      queryClient.invalidateQueries({ queryKey: ["available-restricted-zero-gifts"] });
    },
    onError: (error: any) => toast.error(error.message || "We could not complete your registration"),
  });

  const handleSubmit = () => {
    if (missingRequired.length) {
      return toast.error(`Please fill in: ${missingRequired.map((f) => f.label).join(", ")}`);
    }
    // Paying for a bootcamp: create an account first, then pay here.
    if (!session && !dataOnly && intent === "pay") {
      sendToSignUp("/signup");
      return;
    }
    if (!session) {
      if (!guest.name.trim()) return toast.error("Please enter your name");
      if (!guest.email.trim()) return toast.error("Please enter your email");
    }
    if (missingRequired.length) {
      return toast.error(`Please fill in: ${missingRequired.map((f) => f.label).join(", ")}`);
    }
    submit.mutate();
  };

  if (isLoading) {
    return <Shell><div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div></Shell>;
  }

  if (error || !data?.found) {
    return (
      <Shell>
        <Notice title="This registration link is not available"
          detail="The link may be mistyped, or the form may have been removed by its creator."
          action={<Link to="/" className="rounded-full bg-foreground px-6 py-3 text-[13px] font-semibold text-background">Go to Zero Form</Link>} />
      </Shell>
    );
  }

  // ── Success ──────────────────────────────────────────────────────────────
  const myStatus = data?.my_registration?.registration_status;
  // Interested people who come back (or are sent back) to pay get the form, not the success page.
  const alreadyIn = ["confirmed", "enrolled"].includes(myStatus) || (myStatus === "interested" && !resumed && !(isPaid && intent === "pay" && tab === "register"));
  if (done || alreadyIn) {
    const kind: "submitted" | "interested" | "confirmed" =
      done === "submitted" || (dataOnly && alreadyIn)
        ? "submitted"
        : done === "interested" || data?.my_registration?.registration_status === "interested"
          ? "interested"
          : "confirmed";
    const formTitle = form?.title || bootcamp?.title || "this Zero Form";
    const confirmed = kind === "confirmed";
    const cancelled = data?.my_registration?.registration_status === "cancelled";
    const inBootcamp = confirmed && (!!enrolledBootcamp || data?.my_registration?.registration_status === "enrolled");
    const startLabel = bootcamp?.starts_at
      ? new Date(bootcamp.starts_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
      : null;
    const paidLabel = kind === "interested" ? "Not paid yet" : isPaid ? money(price) : "Free";
    const heading =
      kind === "submitted"
        ? "Your details are in"
        : kind === "interested"
          ? "You're on the list"
          : cancelled
            ? "Your place was cancelled"
            : confirmed
              ? "You're in — welcome aboard"
              : "You're signed up";
    const lead =
      kind === "submitted"
        ? "The organiser has everything you shared and will reach out if there's anything next."
        : kind === "interested"
          ? "Nothing to pay now. You'll hear from the organiser before it starts."
          : cancelled
            ? "Your registration was cancelled by the organiser. Reach out to them if this looks wrong."
            : inBootcamp
              ? "Your place is secured and the bootcamp is already waiting in your Zero Club."
              : "Your place is secured. Full access opens when the bootcamp starts.";

    return (
      <Shell>{authSheet}
        <div className="zf-success mx-auto w-full max-w-[560px] px-4 pb-14 pt-5 sm:px-5 sm:pt-8">
          <div className="zf-card relative overflow-hidden rounded-[30px] border border-white/10 bg-[#141016] text-white shadow-[0_40px_90px_-40px_rgba(0,0,0,0.75)]">

            {/* ── Hero: contained celebration ──────────────────────────── */}
            <div className="relative isolate h-[210px] overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(130%_150%_at_18%_0%,#e94fb0_0%,#b62ba4_38%,#6d3ad6_72%,#3b1d86_100%)]" />
              <div className="zf-glow absolute -left-16 top-4 h-48 w-48 rounded-full bg-[#ff7ad9]/45 blur-3xl" />
              <div className="zf-glow absolute -right-12 bottom-0 h-44 w-44 rounded-full bg-[#7c8bff]/40 blur-3xl" />
              {/* Grain keeps the gradient from banding on phone screens. */}
              <div className="absolute inset-0 opacity-[0.18] [background-image:radial-gradient(rgba(255,255,255,0.5)_0.5px,transparent_0.5px)] [background-size:5px_5px]" />

              {/* Confetti lives inside this clipped layer, so nothing escapes
                  onto the page around the card. */}
              <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
                {[
                  [6, 18, 7, "#ffd76a", 0], [15, 62, 5, "#ffffff", 420], [24, 26, 6, "#8ff0cf", 180],
                  [33, 74, 4, "#ffd76a", 620], [42, 14, 5, "#ffffff", 260], [51, 56, 7, "#ff9ecb", 90],
                  [60, 22, 4, "#ffd76a", 700], [68, 68, 6, "#ffffff", 330], [77, 30, 5, "#8ff0cf", 140],
                  [85, 66, 7, "#ffd76a", 520], [92, 20, 4, "#ffffff", 60], [96, 54, 5, "#ff9ecb", 780],
                  [11, 86, 4, "#ffffff", 380], [47, 88, 5, "#8ff0cf", 560], [72, 84, 4, "#ffffff", 240],
                  [89, 88, 5, "#ffd76a", 880], [29, 10, 4, "#ffd76a", 480], [57, 96, 4, "#ff9ecb", 660],
                ].map(([left, top, size, colour, delay], i) => (
                  <span
                    key={i}
                    className="zf-flake absolute block"
                    style={{
                      left: `${left}%`,
                      top: `${top}%`,
                      width: `${size}px`,
                      height: `${Number(size) * 1.55}px`,
                      background: colour as string,
                      borderRadius: i % 3 === 0 ? "1px" : "999px",
                      animationDelay: `${delay}ms`,
                      animationDuration: `${(5.4 + (i % 5) * 0.6).toFixed(1)}s`,
                    }}
                  />
                ))}
              </div>

              <p className="zf-rise absolute left-6 top-6 text-[10px] font-semibold uppercase tracking-[0.34em] text-white/85" style={{ animationDelay: "120ms" }}>
                {confirmed ? "Registration confirmed" : kind === "interested" ? "Interest registered" : "Details received"}
              </p>

              {/* Emblem: the ring draws itself, then the tick lands. */}
              <div className="absolute left-1/2 top-[54%] -translate-x-1/2 -translate-y-1/2">
                <div className="zf-emblem relative grid h-[88px] w-[88px] place-items-center rounded-full bg-white/12 shadow-[0_18px_40px_-16px_rgba(0,0,0,0.6)] backdrop-blur-md ring-1 ring-white/30">
                  <svg viewBox="0 0 96 96" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden>
                    <circle cx="48" cy="48" r="42" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="3" />
                    <circle
                      className="zf-ring"
                      cx="48" cy="48" r="42" fill="none"
                      stroke="#8ff0cf" strokeWidth="3" strokeLinecap="round"
                      strokeDasharray="264" strokeDashoffset="264"
                    />
                  </svg>
                  <svg viewBox="0 0 24 24" className="zf-tick relative h-9 w-9 text-[#0f6b52]" fill="none" aria-hidden>
                    <path d="M5 12.6l4.4 4.4L19 7.4" stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </div>
            </div>

            {/* ── Copy ─────────────────────────────────────────────────── */}
            <div className="relative px-5 pb-6 pt-1 text-center sm:px-8">
              <p className="zf-rise text-[11px] font-semibold uppercase tracking-[0.3em] text-[#ff9ecb]" style={{ animationDelay: "260ms" }}>
                {confirmed ? "Congratulations" : kind === "interested" ? "You're on the list" : "Received"}
              </p>
              <h1 className="zf-rise mt-2.5 font-display text-[26px] font-semibold leading-[1.15] tracking-[-0.02em] text-white sm:text-[30px]" style={{ animationDelay: "340ms" }}>
                {heading}
              </h1>
              <p className="zf-rise mx-auto mt-2.5 max-w-[400px] text-[14px] leading-6 text-white/65" style={{ animationDelay: "420ms" }}>
                {formTitle}
              </p>
              <p className="zf-rise mx-auto mt-3 max-w-[420px] text-[13.5px] leading-6 text-white/55" style={{ animationDelay: "500ms" }}>
                {lead}
              </p>

              {/* ── Ticket receipt ────────────────────────────────────── */}
              <div className="zf-rise relative mt-7 text-left" style={{ animationDelay: "580ms" }}>
                <div className="relative overflow-hidden rounded-2xl bg-white/[0.055] ring-1 ring-white/10">
                  <div className="px-4 pb-3.5 pt-4">
                    {!dataOnly && bootcamp?.title && (
                      <TicketRow label="Bootcamp" value={bootcamp.title} />
                    )}
                    {!dataOnly && startLabel && (
                      <TicketRow label="Starts" value={startLabel} strong />
                    )}
                    {!dataOnly && <TicketRow label="Amount paid" value={paidLabel} />}
                    <TicketRow
                      label="Status"
                      value={kind === "submitted" ? "Details received" : kind === "interested" ? "Interest registered" : cancelled ? "Cancelled" : "Confirmed"}
                      last
                    />
                  </div>
                  {/* Perforation with punched-out notches, so it reads as a ticket. */}
                  <div className="relative h-6">
                    <span className="absolute left-[-9px] top-1/2 h-[18px] w-[18px] -translate-y-1/2 rounded-full bg-[#141016]" />
                    <span className="absolute right-[-9px] top-1/2 h-[18px] w-[18px] -translate-y-1/2 rounded-full bg-[#141016]" />
                    <div className="absolute inset-x-4 top-1/2 border-t border-dashed border-white/15" />
                  </div>
                  <div className="flex items-center justify-between gap-3 px-4 pb-4">
                    <span className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-white/45">
                      <BadgeCheck className="h-3.5 w-3.5 text-[#8ff0cf]" /> Secured by Zero Club
                    </span>
                    {confirmed && !cancelled && (
                      <span className="rounded-full bg-[#8ff0cf]/12 px-2.5 py-1 text-[10.5px] font-semibold text-[#8ff0cf]">
                        Place held
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Actions ──────────────────────────────────────────── */}
              <div className="zf-rise mt-6 flex flex-col gap-2.5" style={{ animationDelay: "660ms" }}>
                {confirmed && (enrolledBootcamp || bootcamp?.id) && session ? (
                  <>
                    <a
                      href={zc(`/app/bootcamps/${enrolledBootcamp || bootcamp?.id}`)}
                      className="zf-cta group relative inline-flex h-[52px] items-center justify-center gap-2 overflow-hidden rounded-full bg-[linear-gradient(100deg,#e94fb0,#b62ba4_55%,#7c3aed)] px-7 text-[15px] font-semibold text-white shadow-[0_16px_34px_-14px_rgba(233,79,176,0.85)] transition active:scale-[0.985]"
                    >
                      <span className="pointer-events-none absolute inset-0 -translate-x-full bg-[linear-gradient(100deg,transparent,rgba(255,255,255,0.32),transparent)] transition-transform duration-700 group-hover:translate-x-full" />
                      <span className="relative flex items-center gap-2">
                        Go to your bootcamp <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </a>
                    <Link
                      to="/me"
                      className="inline-flex h-[48px] items-center justify-center rounded-full border border-white/15 text-[14px] font-semibold text-white/85 transition hover:bg-white/[0.06]"
                    >
                      See all my registrations
                    </Link>
                  </>
                ) : kind === "interested" && isPaid && session ? (
                  <button
                    type="button"
                    onClick={() => { setDone(null); setIntent("pay"); setTab("register"); }}
                    className="zf-cta relative inline-flex h-[52px] items-center justify-center gap-2 overflow-hidden rounded-full bg-[linear-gradient(100deg,#e94fb0,#b62ba4_55%,#7c3aed)] px-7 text-[15px] font-semibold text-white shadow-[0_16px_34px_-14px_rgba(233,79,176,0.85)] transition active:scale-[0.985]"
                  >
                    Pay {money(price)} now and hold your place
                  </button>
                ) : confirmed && !session ? (
                  <button
                    type="button"
                    onClick={() => setAuthMode("signup")}
                    className="zf-cta relative inline-flex h-[52px] items-center justify-center gap-2 overflow-hidden rounded-full bg-[linear-gradient(100deg,#e94fb0,#b62ba4_55%,#7c3aed)] px-7 text-[15px] font-semibold text-white shadow-[0_16px_34px_-14px_rgba(233,79,176,0.85)] transition active:scale-[0.985]"
                  >
                    Create your account to claim this place <ArrowRight className="h-4 w-4" />
                  </button>
                ) : !session ? (
                  <>
                    {/* Guests leave with an account: the submission is linked to it by email. */}
                    <button
                      type="button"
                      onClick={() => setAuthMode("signup")}
                      className="zf-cta relative inline-flex h-[52px] items-center justify-center gap-2 overflow-hidden rounded-full bg-[linear-gradient(100deg,#e94fb0,#b62ba4_55%,#7c3aed)] px-7 text-[15px] font-semibold text-white shadow-[0_16px_34px_-14px_rgba(233,79,176,0.85)] transition active:scale-[0.985]"
                    >
                      Track this with a free Zero Club account <ArrowRight className="h-4 w-4" />
                    </button>
                    <p className="text-[12px] leading-5 text-white/50">One account for Zero Form, Zero Club and every Zero product. Takes 30 seconds.</p>
                  </>
                ) : (
                  <Link
                    to="/me"
                    className="inline-flex h-[48px] items-center justify-center rounded-full border border-white/15 text-[14px] font-semibold text-white/85 transition hover:bg-white/[0.06]"
                  >
                    See all my registrations
                  </Link>
                )}
              </div>
            </div>
          </div>

          <style>{`
            @keyframes zf-flake-drift {
              0%   { transform: translate3d(0, -16px, 0) rotate(0deg); opacity: 0; }
              12%  { opacity: 0.9; }
              50%  { transform: translate3d(10px, 70px, 0) rotate(180deg); opacity: 0.85; }
              100% { transform: translate3d(-6px, 150px, 0) rotate(360deg); opacity: 0; }
            }
            @keyframes zf-rise {
              from { opacity: 0; transform: translateY(14px); }
              to   { opacity: 1; transform: translateY(0); }
            }
            @keyframes zf-ring-draw {
              from { stroke-dashoffset: 264; }
              to   { stroke-dashoffset: 0; }
            }
            @keyframes zf-tick-in {
              0%, 45% { opacity: 0; transform: scale(0.6); }
              100%    { opacity: 1; transform: scale(1); }
            }
            @keyframes zf-emblem-in {
              from { opacity: 0; transform: scale(0.82); }
              to   { opacity: 1; transform: scale(1); }
            }
            @keyframes zf-glow {
              0%, 100% { opacity: 0.55; transform: scale(1); }
              50%      { opacity: 0.9; transform: scale(1.08); }
            }
            .zf-flake { animation-name: zf-flake-drift; animation-timing-function: cubic-bezier(.4,0,.6,1); animation-iteration-count: infinite; }
            .zf-rise { animation: zf-rise 620ms cubic-bezier(.16,1,.3,1) both; }
            .zf-emblem { animation: zf-emblem-in 700ms cubic-bezier(.34,1.4,.64,1) both; }
            .zf-ring { animation: zf-ring-draw 1.1s cubic-bezier(.16,1,.3,1) 180ms both; }
            .zf-tick { animation: zf-tick-in 700ms cubic-bezier(.34,1.3,.64,1) 620ms both; }
            .zf-glow { animation: zf-glow 6s ease-in-out infinite; }
            @media (prefers-reduced-motion: reduce) {
              .zf-flake, .zf-rise, .zf-emblem, .zf-ring, .zf-tick, .zf-glow { animation: none !important; }
              .zf-flake { opacity: 0.6; }
              .zf-ring { stroke-dashoffset: 0; }
            }
          `}</style>
        </div>
      </Shell>
    );
  }

  // ── Closed states ────────────────────────────────────────────────────────
  if (state && state !== "open") {
    const copy: Record<string, { title: string; detail: string }> = {
      draft: { title: "This form is not published yet", detail: "The creator is still setting it up. Check back shortly." },
      deadline_passed: { title: "Registration closed", detail: "The early registration deadline for this bootcamp has passed." },
      closed: { title: "Registration closed", detail: "Registration for this bootcamp is no longer available through Zero Form." },
      full: { title: "All seats taken", detail: "This bootcamp reached its registration limit." },
      bootcamp_started: { title: "This bootcamp has started", detail: "Early registration has ended, but you can still join through the bootcamp page." },
    };
    const info = copy[state] || copy.closed;
    return (
      <Shell>{authSheet}
        <Notice title={info.title} detail={info.detail}
          action={<a href={zc("/app/bootcamps")} className="rounded-full bg-foreground px-6 py-3 text-[13px] font-semibold text-background">Browse bootcamps on Zero Club</a>} />
      </Shell>
    );
  }

  const flyer = form?.banner_url || bootcamp?.banner_url;

  /* ── Never print the same words twice ────────────────────────────────────
     The Details tab can show two blocks of writing: the bootcamp's own
     description, and the extra note typed on the form. Creators very often
     paste the same text into both, which made the page repeat itself. We
     only show the form note when it genuinely says something new.

     Comparing the two is fussier than it looks: one side is rich text and the
     other is usually the plain-text original, so spacing, punctuation and
     smart quotes never line up. We reduce both to letters and digits only,
     which makes the comparison immune to all of that. */
  const normalise = (value?: string | null) =>
    richTextToPlain(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");

  // Deliberately a plain calculation, not a useMemo: this sits after the early
  // returns above, and a hook here would run on some renders but not others,
  // which React rejects outright.
  const showFormNote = (() => {
    const note = normalise(form?.description);
    if (!note) return false;
    const main = normalise(bootcamp?.description);
    if (!main) return true;
    if (main.includes(note) || note.includes(main)) return false;
    // Also catch the near-copies: a note that merely repeats the opening of
    // the description, or was lightly edited after being pasted in.
    const head = (a: string, b: string) => a.slice(0, Math.min(160, b.length));
    return !main.includes(head(note, main)) && !note.includes(head(main, note));
  })();

  return (
    <Shell>{authSheet}
      <div className="mx-auto max-w-[720px] px-5 pb-24 pt-6">
        {/* A chosen image takes precedence; otherwise the video loops inline. */}
        {flyer ? (
          <div className="mb-6 overflow-hidden rounded-2xl border border-border bg-card">
            <img
              src={flyer}
              alt={`${bootcamp?.title} flyer`}
              className="block w-full rounded-2xl object-contain"
            loading="lazy" decoding="async" />
          </div>
        ) : bootcamp?.video_url ? (
          <ZeroFormVideoPlayer key={bootcamp.video_url} src={bootcamp.video_url} />
        ) : null}

        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
          {isWaitlist ? "Waitlist" : `${bootcamp?.category || "Bootcamp"} · ${dataOnly ? "Sign up" : "Early registration"}`}
        </p>
        <h1 className="mt-3 font-display text-[30px] font-semibold leading-[1.12] tracking-[-0.02em] sm:text-[36px]">
          {isWaitlist ? form?.title : bootcamp?.title || form?.title}
        </h1>

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-muted-foreground">
          {owner && (
            <span className="flex items-center gap-2">
              {owner.avatar_url
                ? <img src={owner.avatar_url} alt="" className="h-6 w-6 rounded-full object-cover" loading="lazy" decoding="async" />
                : <span className="grid h-6 w-6 place-items-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">{(owner.full_name || owner.username || "Z").charAt(0).toUpperCase()}</span>}
              {owner.full_name || owner.username}
              {owner.account_type === "Institution" && <BadgeCheck className="h-3.5 w-3.5 text-primary" />}
            </span>
          )}
          {!dataOnly && bootcamp?.starts_at && (
            <span className="flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              Starts {new Date(bootcamp.starts_at).toLocaleDateString(undefined, { month: "long", day: "numeric" })}
              {countdown && ` · in ${countdown}`}
            </span>
          )}
          {!dataOnly && form?.seats_left !== null && form?.seats_left !== undefined && (
            <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />{form.seats_left} seats left</span>
          )}
        </div>

        {/* ── Price and primary action ────────────────────────────────────── */}
        <div className="mt-6 border-b border-border pb-6">
          {/* Sign-up-only forms have no price, so the button alone does the job. */}
          {!dataOnly && (
          <div className="mb-5 flex flex-wrap items-baseline gap-3">
            <span className="text-[34px] font-semibold leading-none tracking-tight tabular-nums">
              {isPaid ? money(price) : "Free"}
            </span>
            {isPaid && Number(form.regular_price) > price && (
              <>
                <span className="text-[19px] text-muted-foreground line-through tabular-nums">{money(form.regular_price)}</span>
                {saving > 0 && <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">Save {saving}%</span>}
              </>
            )}
          </div>
          )}
          {!dataOnly && form?.registration_deadline && (
            <p className="-mt-2 mb-5 flex items-center gap-2 text-[12.5px] text-muted-foreground">
              <Clock3 className="h-3.5 w-3.5 shrink-0" />
              Register before {new Date(form.registration_deadline).toLocaleDateString(undefined, { month: "long", day: "numeric" })} to secure this price.
            </p>
          )}
          <button onClick={goRegister} className="inline-flex h-12 items-center gap-2 rounded-full bg-foreground px-8 text-[14.5px] font-semibold text-background transition hover:opacity-90">
            {dataOnly ? "Sign up" : isPaid ? "Register now" : "Register free"} <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        {/* ── Three sections ──────────────────────────────────────────────── */}
        <div className="mt-6 flex gap-1 border-b border-border">
          {(isWaitlist
            ? ([["details", "Details"], ["register", "Join the waitlist"]] as const)
            : ([["details", "Details"], ["content", "Course content"], ["register", "Register"]] as const)
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`relative h-11 px-4 text-[13.5px] font-semibold transition-colors ${tab === key ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {label}
              {tab === key && <span className="absolute inset-x-3 bottom-0 h-[2.5px] rounded-full bg-foreground" />}
            </button>
          ))}
        </div>

        <div className="pt-6">
          {tab === "details" && (
            <section>
              {/* whitespace-pre-line keeps the paragraphs and line breaks the
                  creator typed when they built the bootcamp. */}
              {isWaitlist
                ? form?.description
                  ? <RichText content={form.description} className="text-[15px] leading-[1.85] text-foreground/90" />
                  : <Empty text="Join the waitlist to hear first when it opens." />
                : bootcamp?.description
                  ? <RichText content={bootcamp.description} className="text-[15px] leading-[1.85] text-foreground/90" />
                  : <Empty text="The organiser has not added a description yet." />}
              {!isWaitlist && showFormNote && (
                <div className="mt-6 border-t border-border pt-6">
                  <RichText content={form.description} className="text-[14px] leading-[1.85] text-muted-foreground" />
                </div>
              )}
            </section>
          )}

          {tab === "content" && (
            <section>
              {curriculum.length === 0 ? (
                <Empty text="The curriculum will be shared before the bootcamp starts." />
              ) : (
                <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
                  {curriculum.map((module: any, index: number) => (
                    <ModuleRow key={module.id} module={module} defaultOpen={index === 0} />
                  ))}
                </div>
              )}
            </section>
          )}

          {tab === "register" && (
            <section ref={registerRef}>
              {/* Choose how to register */}
              {isPaid && allowInterest && (
                <div className="mb-6 grid gap-2.5 sm:grid-cols-2">
                  <IntentCard
                    active={intent === "pay"}
                    onClick={() => setIntent("pay")}
                    title="Pay now"
                    detail={`Secure your seat at ${money(price)} today.`}
                  />
                  <IntentCard
                    active={intent === "interest"}
                    onClick={() => setIntent("interest")}
                    title="Register interest"
                    detail="Leave your details and pay later. No payment now."
                  />
                </div>
              )}

              {session && !dataOnly && intent === "pay" && price > 0 && <div className="mb-5"><ZeroGiftPaymentOption service="bootcamps" bootcampId={bootcamp?.id} amount={price} applied={applyGift} onAppliedChange={value => { setApplyGift(value); setShortfall(null); }} formatAmount={money} /></div>}
              {/* Welcome back after signing up: everything's saved. */}
              {resumed && session && !dataOnly && intent === "pay" && (
                <div className="mb-5 flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.07] p-4">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                  <div>
                    <p className="text-[14px] font-semibold">You're signed in — your answers are saved</p>
                    <p className="mt-0.5 text-[12.5px] leading-5 text-muted-foreground">Confirm your {money(price)} payment below. Eligible gift credit is used first when selected, and your wallet covers the rest.</p>
                  </div>
                </div>
              )}

              {/* Paying needs a Zero Club account, so the place can be given automatically. */}
              {checkedSession && !session && !dataOnly && intent === "pay" && (
                <div className="mb-5 rounded-2xl border border-border bg-background/60 p-4">
                  <p className="text-[14px] font-semibold">Pay with a free Zero Club account</p>
                  <p className="mt-1 text-[12.5px] leading-5 text-muted-foreground">
                    Fill in the questions, then create your account in a minute. You'll come straight back here to pay, and you're added to the bootcamp the moment it goes through.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => (missingRequired.length ? toast.error(`Please fill in: ${missingRequired.map((f) => f.label).join(", ")}`) : sendToSignUp("/signup"))} className="inline-flex h-10 items-center rounded-full bg-foreground px-4 text-[13px] font-semibold text-background">
                      Create account
                    </button>
                    <button type="button" onClick={() => sendToSignUp("/signin")} className="inline-flex h-10 items-center rounded-full border border-border px-4 text-[13px] font-semibold">
                      I have an account
                    </button>
                  </div>
                </div>
              )}

              {/* Guests can leave details or register interest without an account */}
              {checkedSession && !session && (dataOnly || intent === "interest") && (
                <div className="mb-5 space-y-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Your contact details</p>
                  <Field label="Full name" required value={guest.name} placeholder="Ada Obi"
                    onChange={(v: string) => setGuest((g) => ({ ...g, name: v }))} />
                  <Field label="Email" required type="email" value={guest.email} placeholder="you@email.com"
                    onChange={(v: string) => setGuest((g) => ({ ...g, email: v }))} />
                  <Field label="Phone number" type="tel" value={guest.phone} placeholder="+234 800 000 0000"
                    onChange={(v: string) => setGuest((g) => ({ ...g, phone: v }))} />
                  <p className="text-[11.5px] leading-5 text-muted-foreground">
                    No account needed. Already on Zero Club?{" "}
                    <button type="button" onClick={() => setAuthMode("signin")} className="font-semibold text-foreground underline">Sign in</button> to use your wallet.
                  </p>
                </div>
              )}

              {fields.length > 0 && (
                <div className="space-y-4">
                  {checkedSession && !session && <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">A few questions</p>}
                  {visibleFields.map((f) => {
                    const control = (
                      <FormField key={f.field_key} field={f} formId={form?.id} value={answers[f.field_key] ?? (f.field_type === "checkboxes" ? [] : "")}
                        onChange={(value) => setAnswers((current) => ({ ...current, [f.field_key]: value }))} />
                    );
                    // A follow-up slides in, tucked under the answer that revealed it.
                    return f.show_if?.field_key ? (
                      <div key={f.field_key} className="zf-followup -mt-1 rounded-xl border-l-[3px] border-primary/60 bg-primary/[0.035] py-3 pl-3.5 pr-3">
                        {control}
                      </div>
                    ) : (
                      control
                    );
                  })}
                </div>
              )}

              {shortfall !== null && (
                <div className="mt-5 rounded-lg bg-amber-500/[0.08] p-4 ring-1 ring-amber-500/20">
                  <p className="flex items-center gap-2 text-[13px] font-semibold text-amber-700">
                    <Wallet className="h-4 w-4" /> Add {money(shortfall)} to your wallet
                  </p>
                  <p className="mt-1.5 text-[12px] leading-5 text-muted-foreground">
                    Top up, then submit again — your answers are saved. Or choose "Register interest" and pay later.
                  </p>
                  <a
                    href={zc("/app/wallet/add-money")}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => {
                      try {
                        localStorage.setItem(resumeKey, JSON.stringify({ answers, intent: "pay", at: Date.now() }));
                      } catch {
                        /* answers are also kept on the registration */
                      }
                    }}
                    className="mt-3 inline-flex h-10 items-center rounded-lg bg-foreground px-4 text-[12.5px] font-semibold text-background"
                  >
                    Add money on Zero Club
                  </a>
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={submit.isPending}
                className="mt-7 flex h-13 w-full items-center justify-center gap-2 rounded-full bg-foreground py-4 text-[15px] font-semibold text-background transition hover:opacity-90 disabled:opacity-50"
              >
                {submit.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {dataOnly ? "Submit my details"
                  : !isPaid ? (session ? "Join free" : "Continue — create your account")
                  : intent === "interest" ? "Save my details"
                  : session ? `Pay ${money(price)} and join` : "Continue — create your account to pay"}
              </button>

              <p className="mt-4 text-center text-[11.5px] leading-5 text-muted-foreground">
                {dataOnly || intent === "interest"
                  ? "Your details go straight to the organiser. No payment is taken."
                  : session
                    ? "Eligible gifts and your wallet pay securely together. You're added to the bootcamp instantly."
                    : "You'll pay from your Zero Club wallet right after signing up. You keep this price even after it rises."}
              </p>
            </section>
          )}
        </div>
      </div>
    </Shell>
  );
}

/* ── Pieces ──────────────────────────────────────────────────────────────── */

function ModuleRow({ module, defaultOpen }: { module: any; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const lessons = module.lessons || [];
  return (
    <div>
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 p-4 text-left">
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "" : "-rotate-90"}`} />
        <span className="flex-1 text-[14px] font-semibold">{module.title}</span>
        <span className="shrink-0 text-[12px] text-muted-foreground">{lessons.length} {lessons.length === 1 ? "lesson" : "lessons"}</span>
      </button>
      {open && lessons.length > 0 && (
        <div className="space-y-1 px-4 pb-4 pl-11">
          {lessons.map((lesson: any) => (
            <div key={lesson.id} className="flex items-center gap-2.5 text-[13px] text-muted-foreground">
              <PlayCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{lesson.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function IntentCard({ active, onClick, title, detail }: { active: boolean; onClick: () => void; title: string; detail: string }) {
  return (
    <button type="button" onClick={onClick}
      className={`rounded-lg border p-4 text-left transition ${active ? "border-foreground bg-foreground/[0.03]" : "border-border hover:bg-muted/50"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13.5px] font-semibold">{title}</span>
        <span className={`grid h-4.5 w-4.5 shrink-0 place-items-center rounded-full border ${active ? "border-foreground bg-foreground" : "border-border"}`}
          style={{ height: 18, width: 18 }}>
          {active && <Check className="h-3 w-3 text-background" strokeWidth={3} />}
        </span>
      </div>
      <p className="mt-1.5 text-[11.5px] leading-5 text-muted-foreground">{detail}</p>
    </button>
  );
}

const inputBase = "w-full rounded-lg border border-border bg-background px-3.5 text-[14px] outline-none transition focus:border-primary/50";

function Field({ label, value, onChange, placeholder, type = "text", required }: any) {
  return (
    <div>
      <label className="mb-1.5 block text-[12.5px] font-semibold">
        {label}{required && <span className="ml-1 text-primary">*</span>}
      </label>
      <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={`${inputBase} h-12`} />
    </div>
  );
}

/**
 * Renders one question.
 *
 * `value` is a string for every type except checkboxes, which holds an array
 * because a registrant can tick several boxes. The parent stores whatever comes
 * back from onChange, and the answers column is jsonb, so both shapes persist
 * without a schema change.
 */
function FormField({
  field,
  value,
  onChange,
  formId,
}: {
  field: any;
  value: any;
  onChange: (value: any) => void;
  formId?: string;
}) {
  const label = (
    <label className="mb-1.5 block text-[12.5px] font-semibold">
      {field.label}{field.required && <span className="ml-1 text-primary">*</span>}
    </label>
  );

  const options: string[] = Array.isArray(field.options)
    ? field.options.filter((option: string) => String(option).trim())
    : [];

  const text = typeof value === "string" ? value : "";

  if (field.field_type === "textarea") {
    return <div>{label}<textarea rows={3} value={text} placeholder={field.placeholder || ""} onChange={(e) => onChange(e.target.value)} className={`${inputBase} resize-none py-2.5`} /></div>;
  }

  if (field.field_type === "select") {
    return (
      <div>{label}
        <CardSelect value={text} onChange={(e) => onChange(e.target.value)} className={`${inputBase} h-12`}>
          <option value="">Select an option</option>
          {options.map((option) => <option key={option} value={option}>{option}</option>)}
        </CardSelect>
      </div>
    );
  }

  // Pick exactly one, with every choice visible.
  if (field.field_type === "multiple_choice" || field.field_type === "yes_no") {
    const choices = field.field_type === "yes_no" ? ["Yes", "No"] : options;
    return (
      <div>{label}
        <div className="space-y-1.5">
          {choices.map((option) => {
            const selected = text === option;
            return (
              <label
                key={option}
                className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-[13.5px] transition ${
                  selected ? "border-primary bg-primary/[0.06]" : "border-border hover:bg-muted/60"
                }`}
              >
                <input
                  type="radio"
                  name={field.field_key}
                  checked={selected}
                  onChange={() => onChange(option)}
                  className="h-3.5 w-3.5 accent-[#cc208f]"
                />
                {option}
              </label>
            );
          })}
        </div>
      </div>
    );
  }

  // Pick any number. Stored as an array, so order follows the option list
  // rather than the order they were ticked - steadier for reading later.
  if (field.field_type === "checkboxes") {
    const selected: string[] = Array.isArray(value) ? value : [];
    const toggle = (option: string) =>
      onChange(
        selected.includes(option)
          ? selected.filter((item) => item !== option)
          : options.filter((item) => item === option || selected.includes(item)),
      );

    return (
      <div>{label}
        <div className="space-y-1.5">
          {options.map((option) => {
            const checked = selected.includes(option);
            return (
              <label
                key={option}
                className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-[13.5px] transition ${
                  checked ? "border-primary bg-primary/[0.06]" : "border-border hover:bg-muted/60"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(option)}
                  className="h-3.5 w-3.5 accent-[#cc208f]"
                />
                {option}
              </label>
            );
          })}
        </div>
      </div>
    );
  }

  if (field.field_type === "file_upload") {
    return <div>{label}<FileUploadField field={field} value={value} onChange={onChange} formId={formId} /></div>;
  }

  const inputType = field.field_type === "email" ? "email" : field.field_type === "number" ? "number" : field.field_type === "phone" ? "tel" : "text";
  return <div>{label}<input type={inputType} value={text} placeholder={field.placeholder || ""} onChange={(e) => onChange(e.target.value)} className={`${inputBase} h-12`} /></div>;
}

/**
 * Uploads straight to the private bucket, then stores a reference.
 *
 * The file goes up before the form is submitted, so a large attachment does not
 * sit in memory and the registrant sees progress. The answer holds the storage
 * path, the original filename and the size - not the file itself, and not a
 * URL, since the bucket is private and links are minted on demand.
 *
 * Size and type are checked here as a courtesy: the bucket enforces both
 * server-side, but a rejection after a slow upload is a poor experience.
 */
function FileUploadField({
  field,
  value,
  onChange,
  formId,
}: {
  field: any;
  value: unknown;
  onChange: (value: any) => void;
  formId?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const existing = isUploadAnswer(value) ? value : null;

  const handleFile = async (file: File | undefined) => {
    if (!file) return;

    if (file.size > ZERO_FORM_MAX_UPLOAD_BYTES) {
      toast.error(`That file is ${formatFileSize(file.size)}. The limit is 10 MB.`);
      return;
    }
    if (file.type && !ZERO_FORM_ALLOWED_UPLOAD_TYPES.includes(file.type)) {
      toast.error("Please upload a PDF, Word document or image.");
      return;
    }
    if (!formId) {
      toast.error("This form is still loading. Try again in a moment.");
      return;
    }

    setUploading(true);
    try {
      // Keep the original name readable in the path but strip anything that
      // could confuse a storage key or a later download.
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-80);
      const path = `${formId}/${crypto.randomUUID()}-${safeName}`;

      const { error } = await supabase.storage
        .from(ZERO_FORM_UPLOAD_BUCKET)
        .upload(path, file, { upsert: false, contentType: file.type || undefined });

      if (error) throw error;
      onChange({ path, name: file.name, size: file.size });
    } catch (err: any) {
      toast.error(err?.message || "Could not upload that file.");
    } finally {
      setUploading(false);
    }
  };

  if (existing) {
    return (
      <div className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/40 px-3.5 py-2.5">
        <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-[13px]">{existing.name}</span>
        <span className="shrink-0 text-[11px] text-muted-foreground">{formatFileSize(existing.size)}</span>
        <button
          type="button"
          onClick={() => onChange("")}
          className="shrink-0 text-[11px] font-semibold text-muted-foreground hover:text-destructive"
        >
          Remove
        </button>
      </div>
    );
  }

  return (
    <label
      className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border px-3.5 py-4 text-[13px] text-muted-foreground transition hover:bg-muted/50 ${
        uploading ? "pointer-events-none opacity-60" : ""
      }`}
    >
      {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
      {uploading ? "Uploading…" : "Choose a file — PDF, Word or image, up to 10 MB"}
      <input
        type="file"
        accept={ZERO_FORM_UPLOAD_ACCEPT}
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </label>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  /*
   * Can we go back, and where to?
   *
   * document.referrer tells us whether this form was reached from inside Zero
   * Club or opened cold from a shared link. Only the first case gets a back
   * button — for a stranger arriving from WhatsApp, "back" would leave the
   * form entirely, which is not a kindness.
   *
   * Resolved once on mount because referrer is empty on later client-side
   * navigations, and history.length cannot be read during SSR.
   */
  const [cameFromApp, setCameFromApp] = useState(false);

  useEffect(() => {
    try {
      const sameOrigin = document.referrer && new URL(document.referrer).origin === window.location.origin;
      setCameFromApp(Boolean(sameOrigin) || window.history.length > 1);
    } catch {
      setCameFromApp(window.history.length > 1);
    }
  }, []);

  const goBack = () => {
    // Returns to the exact screen they left, which a hardcoded link cannot do.
    if (window.history.length > 1) window.history.back();
    else window.location.href = "/";
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/95 backdrop-blur-xl">
        <div className="mx-auto flex h-[62px] max-w-[720px] items-center justify-between px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            {/* A form opened from inside the app is a dead end without this.
                /form/$slug sits outside the /app layout, so it has no bottom
                nav and no sidebar — in the installed Android app that means no
                way back at all short of killing the app and reopening it.

                Prefers history.back() so it returns to whatever you were
                actually looking at, and falls back to the app for anyone who
                arrived cold from a shared link. */}
            {cameFromApp && (
              <button
                type="button"
                onClick={goBack}
                aria-label="Back"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border bg-card text-foreground transition hover:bg-accent/40 active:scale-95"
              >
                <ArrowLeft className="h-[18px] w-[18px]" />
              </button>
            )}
            <Link to="/" className="flex min-w-0 items-center gap-2.5">
              <img src="/brand/zero-form/zero-form-icon-compact.svg" alt="" className="h-7 w-7 shrink-0" />
              <span className="truncate font-display text-[16px] font-semibold tracking-tight">Zero <span className="text-primary">Form</span></span>
            </Link>
          </div>
          <AccountChip />
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}

function Notice({ title, detail, action }: { title: string; detail: string; action?: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[520px] px-5 py-24 text-center">
      <h1 className="font-display text-[26px] font-semibold tracking-tight">{title}</h1>
      <p className="mt-3 text-[14px] leading-7 text-muted-foreground">{detail}</p>
      {action && <div className="mt-7">{action}</div>}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-lg border border-dashed border-border py-10 text-center text-[13px] text-muted-foreground">{text}</p>;
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-2.5 last:border-b-0">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <span className="text-[12.5px] font-semibold">{value || "—"}</span>
    </div>
  );
}

/** A receipt line for the dark success card: quiet label, confident value. */
function TicketRow({ label, value, strong, last }: { label: string; value?: string; strong?: boolean; last?: boolean }) {
  return (
    <div className={`flex items-start justify-between gap-4 py-2.5 ${last ? "" : "border-b border-white/[0.07]"}`}>
      <span className="shrink-0 text-[11.5px] font-medium uppercase tracking-[0.1em] text-white/40">{label}</span>
      <span className={`min-w-0 text-right text-[13px] leading-5 ${strong ? "font-semibold text-white" : "font-medium text-white/80"}`}>
        {value || "—"}
      </span>
    </div>
  );
}
