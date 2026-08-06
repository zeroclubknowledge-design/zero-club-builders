import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Loader2,
  PlayCircle,
  Users,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { formatWalletAmount } from "@/hooks/useWalletCurrency";
import { earlyBirdSaving, formatCountdown } from "@/features/zeroForm/templates";
import { openPaystackCheckout, buildReference, paystackKeyProblem } from "@/lib/paystack";
import { RichText, richTextToPlain } from "@/components/RichText";

export const Route = createFileRoute("/form/$slug")({ component: ZeroFormPublicPage });

const money = (value: number) => formatWalletAmount(Number(value) || 0);

type Tab = "details" | "content" | "register";

function ZeroFormPublicPage() {
  const { slug } = Route.useParams();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<Tab>("details");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [guest, setGuest] = useState({ name: "", email: "", phone: "" });
  const [intent, setIntent] = useState<"interest" | "pay">("pay");
  const [session, setSession] = useState<any>(null);
  const [checkedSession, setCheckedSession] = useState(false);
  const [done, setDone] = useState<null | "confirmed" | "interested">(null);
  const [shortfall, setShortfall] = useState<number | null>(null);
  const registerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setCheckedSession(true);
    });
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

  const form = data?.form;
  const bootcamp = data?.bootcamp;
  const owner = data?.owner;
  const state = data?.state as string | undefined;
  const fields = (data?.fields || []) as any[];
  const curriculum = (data?.curriculum || []) as any[];

  const price = Number(form?.early_bird_price || 0);
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

  const missingRequired = useMemo(
    () => fields.filter((f) => f.required && !String(answers[f.field_key] || "").trim()),
    [fields, answers],
  );

  const goRegister = () => {
    setTab("register");
    setTimeout(() => registerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };

  const submit = useMutation({
    mutationFn: async () => {
      const { data: result, error } = await supabase.rpc("submit_zero_form_v2", {
        form_slug: slug,
        answers,
        intent,
        guest: session ? null : { name: guest.name, email: guest.email, phone: guest.phone },
      });
      if (error) throw error;
      return result as any;
    },
    onSuccess: async (result) => {
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
      setDone(result?.status === "interested" ? "interested" : "confirmed");
      queryClient.invalidateQueries({ queryKey: ["zero-form-public", slug] });
      queryClient.invalidateQueries({ queryKey: ["profile", "current"] });
    },
    onError: (error: any) => toast.error(error.message || "We could not complete your registration"),
  });

  const handleSubmit = () => {
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
          action={<Link to="/" className="rounded-full bg-foreground px-6 py-3 text-[13px] font-semibold text-background">Go to Zero Club</Link>} />
      </Shell>
    );
  }

  // ── Success ──────────────────────────────────────────────────────────────
  const alreadyIn = ["confirmed", "enrolled", "interested"].includes(data?.my_registration?.registration_status);
  if (done || alreadyIn) {
    const interested = done === "interested" || data?.my_registration?.registration_status === "interested";
    return (
      <Shell>
        <div className="mx-auto max-w-[560px] px-5 py-16 text-center">
          <div className={`mx-auto grid h-14 w-14 place-items-center rounded-full ${interested ? "bg-primary/10 text-primary" : "bg-emerald-500/10 text-emerald-600"}`}>
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <h1 className="mt-6 font-display text-[30px] font-semibold tracking-tight">
            {interested ? "You're on the list" : "You're registered"}
          </h1>
          <p className="mt-3 text-[15px] leading-7 text-muted-foreground">
            {interested
              ? <>We've saved your details for <span className="font-semibold text-foreground">{bootcamp?.title}</span>. The organiser will contact you before it starts.</>
              : <>You have successfully registered for <span className="font-semibold text-foreground">{bootcamp?.title}</span>.</>}
          </p>
          <div className="mt-8 rounded-lg border border-border bg-card p-5 text-left">
            <Row label="Bootcamp" value={bootcamp?.title} />
            {bootcamp?.starts_at && <Row label="Starts" value={new Date(bootcamp.starts_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} />}
            <Row label={interested ? "Amount" : "Amount paid"} value={interested ? "Not paid yet" : isPaid ? money(price) : "Free"} />
            <Row label="Status" value={interested ? "Interest registered" : "Confirmed"} />
          </div>
          <p className="mt-6 text-[13px] leading-6 text-muted-foreground">
            {interested
              ? "Nothing else to do for now — you'll hear from the organiser."
              : "You'll get full access automatically when the bootcamp starts."}
          </p>
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
      <Shell>
        <Notice title={info.title} detail={info.detail}
          action={<Link to="/app/bootcamps" className="rounded-full bg-foreground px-6 py-3 text-[13px] font-semibold text-background">Browse bootcamps</Link>} />
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
    <Shell>
      <div className="mx-auto max-w-[720px] px-5 pb-24 pt-6">
        {/* ── One piece of media, at its own natural proportions ──────────────
            The video always wins when there is one. The flyer is the fallback,
            and nothing is shown at all when neither has been uploaded. */}
        {bootcamp?.video_url ? (
          /* Keeping a playing video inside rounded corners requires hardware compositing
             defences across Chrome, Safari, Edge, and Firefox:
               1. `clip-path: inset(0 round 1rem)` on BOTH wrapper and video — applied
                  at composite time, ensuring the wrapper container box clips the video
                  and native shadow DOM media controls during GPU hardware playback.
               2. `mask-image: linear-gradient(white, white)` and `-webkit-mask-image` —
                  forces WebKit/Blink to enforce the rounded mask on GPU layers.
               3. `transform: translateZ(0)` — promotes the wrapper onto its own GPU
                  compositing layer so the rounded clip remains active during playback. */
          <div
            className="isolate mb-6 overflow-hidden rounded-2xl border border-border bg-black transform-gpu will-change-transform"
            style={{
              clipPath: "inset(0 round 1rem)",
              WebkitClipPath: "inset(0 round 1rem)",
              WebkitMaskImage: "-webkit-linear-gradient(white, white)",
              maskImage: "linear-gradient(white, white)",
              transform: "translateZ(0)",
              WebkitTransform: "translateZ(0)",
            }}
          >
            <video
              src={bootcamp.video_url}
              controls
              playsInline
              preload="metadata"
              poster={flyer || undefined}
              className="block w-full rounded-2xl"
              style={{
                clipPath: "inset(0 round 1rem)",
                WebkitClipPath: "inset(0 round 1rem)",
              }}
            />
          </div>
        ) : flyer ? (
          <div className="mb-6 overflow-hidden rounded-2xl border border-border bg-card">
            <img
              src={flyer}
              alt={`${bootcamp?.title} flyer`}
              className="block w-full rounded-2xl object-contain [clip-path:inset(0_round_1rem)]"
            />
          </div>
        ) : null}

        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
          {bootcamp?.category || "Bootcamp"} · Early registration
        </p>
        <h1 className="mt-3 font-display text-[30px] font-semibold leading-[1.12] tracking-[-0.02em] sm:text-[36px]">
          {bootcamp?.title}
        </h1>

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-muted-foreground">
          {owner && (
            <span className="flex items-center gap-2">
              {owner.avatar_url
                ? <img src={owner.avatar_url} alt="" className="h-6 w-6 rounded-full object-cover" />
                : <span className="grid h-6 w-6 place-items-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">{(owner.full_name || owner.username || "Z").charAt(0).toUpperCase()}</span>}
              {owner.full_name || owner.username}
              {owner.account_type === "Institution" && <BadgeCheck className="h-3.5 w-3.5 text-primary" />}
            </span>
          )}
          {bootcamp?.starts_at && (
            <span className="flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              Starts {new Date(bootcamp.starts_at).toLocaleDateString(undefined, { month: "long", day: "numeric" })}
              {countdown && ` · in ${countdown}`}
            </span>
          )}
          {form?.seats_left !== null && form?.seats_left !== undefined && (
            <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />{form.seats_left} seats left</span>
          )}
        </div>

        {/* ── Price and primary action ────────────────────────────────────── */}
        <div className="mt-6 border-b border-border pb-6">
          <div className="flex flex-wrap items-baseline gap-3">
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
          {form?.registration_deadline && (
            <p className="mt-3 flex items-center gap-2 text-[12.5px] text-muted-foreground">
              <Clock3 className="h-3.5 w-3.5 shrink-0" />
              Register before {new Date(form.registration_deadline).toLocaleDateString(undefined, { month: "long", day: "numeric" })} to secure this price.
            </p>
          )}
          <button onClick={goRegister} className="mt-5 inline-flex h-12 items-center gap-2 rounded-full bg-foreground px-8 text-[14.5px] font-semibold text-background transition hover:opacity-90">
            {isPaid ? "Register now" : "Register free"} <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        {/* ── Three sections ──────────────────────────────────────────────── */}
        <div className="mt-6 flex gap-1 border-b border-border">
          {([["details", "Details"], ["content", "Course content"], ["register", "Register"]] as const).map(([key, label]) => (
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
              {bootcamp?.description
                ? <RichText content={bootcamp.description} className="text-[15px] leading-[1.85] text-foreground/90" />
                : <Empty text="The organiser has not added a description yet." />}
              {showFormNote && (
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

              {/* Guests do not need an account */}
              {checkedSession && !session && (
                <div className="mb-5 space-y-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Your contact details</p>
                  <Field label="Full name" required value={guest.name} placeholder="Ada Obi"
                    onChange={(v) => setGuest((g) => ({ ...g, name: v }))} />
                  <Field label="Email" required type="email" value={guest.email} placeholder="you@email.com"
                    onChange={(v) => setGuest((g) => ({ ...g, email: v }))} />
                  <Field label="Phone number" type="tel" value={guest.phone} placeholder="+234 800 000 0000"
                    onChange={(v) => setGuest((g) => ({ ...g, phone: v }))} />
                  <p className="text-[11.5px] leading-5 text-muted-foreground">
                    No account needed. Already on Zero Club?{" "}
                    <Link to="/signin" className="font-semibold text-foreground underline">Sign in</Link> to use your wallet.
                  </p>
                </div>
              )}

              {fields.length > 0 && (
                <div className="space-y-4">
                  {checkedSession && !session && <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">A few questions</p>}
                  {fields.map((f) => (
                    <FormField key={f.field_key} field={f} value={answers[f.field_key] || ""}
                      onChange={(value) => setAnswers((current) => ({ ...current, [f.field_key]: value }))} />
                  ))}
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
                  <Link to="/app/wallet/add-money" className="mt-3 inline-flex h-10 items-center rounded-lg bg-foreground px-4 text-[12.5px] font-semibold text-background">Add money</Link>
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={submit.isPending}
                className="mt-7 flex h-13 w-full items-center justify-center gap-2 rounded-full bg-foreground py-4 text-[15px] font-semibold text-background transition hover:opacity-90 disabled:opacity-50"
              >
                {submit.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {!isPaid ? "Register free"
                  : intent === "interest" ? "Save my details"
                  : `Pay ${money(price)} and register`}
              </button>

              <p className="mt-4 text-center text-[11.5px] leading-5 text-muted-foreground">
                {intent === "interest"
                  ? "Your details go straight to the organiser. No payment is taken."
                  : session
                    ? "Paid securely from your Zero Club wallet."
                    : "Paid securely by card. You keep this price even after it rises."}
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

function FormField({ field, value, onChange }: { field: any; value: string; onChange: (value: string) => void }) {
  const label = (
    <label className="mb-1.5 block text-[12.5px] font-semibold">
      {field.label}{field.required && <span className="ml-1 text-primary">*</span>}
    </label>
  );

  if (field.field_type === "textarea") {
    return <div>{label}<textarea rows={3} value={value} placeholder={field.placeholder || ""} onChange={(e) => onChange(e.target.value)} className={`${inputBase} resize-none py-2.5`} /></div>;
  }

  if (field.field_type === "select") {
    const options: string[] = Array.isArray(field.options) ? field.options : [];
    return (
      <div>{label}
        <select value={value} onChange={(e) => onChange(e.target.value)} className={`${inputBase} h-12`}>
          <option value="">Select an option</option>
          {options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </div>
    );
  }

  const inputType = field.field_type === "email" ? "email" : field.field_type === "number" ? "number" : field.field_type === "phone" ? "tel" : "text";
  return <div>{label}<input type={inputType} value={value} placeholder={field.placeholder || ""} onChange={(e) => onChange(e.target.value)} className={`${inputBase} h-12`} /></div>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f8f7f5] text-foreground dark:bg-background">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/95 backdrop-blur-xl">
        <div className="mx-auto flex h-[62px] max-w-[720px] items-center justify-between px-5">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/logo.png" alt="" className="h-7 w-7 object-contain" />
            <span className="font-display text-[16px] font-semibold tracking-tight">Zero <span className="text-primary">Club</span></span>
          </Link>
          {/* Zero Form's own mark sits beside its name so visitors arriving
              from a shared link can see what they have opened. This is the
              compact cut of the logo — fewer, thicker elements, because the
              full version turns to mush at 26px. The SVG stays crisp on every
              screen; the PNG covers the rare browser that refuses SVG here. */}
          <span className="flex items-center gap-2">
            <img
              src="/brand/zero-form/zero-form-icon-compact.svg"
              onError={(e) => { (e.currentTarget as HTMLImageElement).src = "/brand/zero-form/zero-form-icon-compact-128.png"; }}
              alt=""
              className="h-[26px] w-[26px] shrink-0"
            />
            <span className="font-display text-[14.5px] font-semibold tracking-tight">Zero Form</span>
          </span>
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
