import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Loader2,
  Lock,
  Users,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { formatWalletAmount } from "@/hooks/useWalletCurrency";
import { earlyBirdSaving, formatCountdown } from "@/features/zeroForm/templates";

export const Route = createFileRoute("/form/$slug")({ component: ZeroFormPublicPage });

const money = (value: number) => formatWalletAmount(Number(value) || 0);

function ZeroFormPublicPage() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [confirmed, setConfirmed] = useState<any>(null);
  const [shortfall, setShortfall] = useState<number | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
  }, []);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["zero-form-public", slug],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_zero_form_public", { form_slug: slug });
      if (error) throw error;
      return data as any;
    },
    retry: false,
  });

  // Count the view once per visit, without blocking the render.
  useEffect(() => {
    if (data?.found) supabase.rpc("record_zero_form_view", { form_slug: slug }).then(() => {});
  }, [data?.found, slug]);

  const fields = (data?.fields || []) as any[];

  // Prefill any answers already submitted so a returning learner sees them.
  useEffect(() => {
    const existing = data?.my_registration?.registration_data;
    if (existing && typeof existing === "object") setAnswers(existing);
  }, [data?.my_registration]);

  const submit = useMutation({
    mutationFn: async () => {
      const { data: result, error } = await supabase.rpc("submit_zero_form", {
        form_slug: slug,
        answers,
      });
      if (error) throw error;
      return result as any;
    },
    onSuccess: (result) => {
      if (result?.status === "insufficient_funds") {
        setShortfall(Number(result.shortfall) || 0);
        return;
      }
      setShortfall(null);
      setConfirmed(result?.registration || true);
      queryClient.invalidateQueries({ queryKey: ["zero-form-public", slug] });
      queryClient.invalidateQueries({ queryKey: ["profile", "current"] });
      toast.success(result?.status === "already_registered" ? "You are already registered" : "Registration confirmed");
    },
    onError: (error: any) => toast.error(error.message || "We could not complete your registration"),
  });

  const form = data?.form;
  const bootcamp = data?.bootcamp;
  const owner = data?.owner;
  const state = data?.state as string | undefined;
  const isPaid = Number(form?.early_bird_price || 0) > 0;
  const saving = earlyBirdSaving(form?.regular_price, form?.early_bird_price);
  const countdown = formatCountdown(bootcamp?.starts_at);

  const missingRequired = useMemo(
    () => fields.filter((f) => f.required && !String(answers[f.field_key] || "").trim()),
    [fields, answers],
  );

  if (isLoading) {
    return (
      <Shell>
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </Shell>
    );
  }

  if (error || !data?.found) {
    return (
      <Shell>
        <Notice
          title="This registration link is not available"
          detail="The link may be mistyped, or the form may have been removed by its creator."
          action={<Link to="/" className="rounded-full bg-foreground px-6 py-3 text-[13px] font-semibold text-background">Go to Zero Club</Link>}
        />
      </Shell>
    );
  }

  // ── Success ──────────────────────────────────────────────────────────────
  if (confirmed || ["confirmed", "enrolled"].includes(data?.my_registration?.registration_status)) {
    return (
      <Shell>
        <div className="mx-auto max-w-[560px] px-5 py-16 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-500/10 text-emerald-600">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <h1 className="mt-6 font-display text-[30px] font-semibold tracking-tight">You're registered</h1>
          <p className="mt-3 text-[15px] leading-7 text-muted-foreground">
            You have successfully registered for <span className="font-semibold text-foreground">{bootcamp?.title}</span>.
          </p>

          <div className="mt-8 rounded-lg border border-border bg-card p-5 text-left">
            <Row label="Bootcamp" value={bootcamp?.title} />
            {bootcamp?.starts_at && <Row label="Starts" value={new Date(bootcamp.starts_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} />}
            <Row label="Amount paid" value={isPaid ? money(form?.early_bird_price) : "Free"} />
            <Row label="Status" value="Confirmed" />
          </div>

          <p className="mt-6 text-[13px] leading-6 text-muted-foreground">
            You will get full access automatically when the bootcamp starts — no further action needed.
          </p>
          <Link to="/app/bootcamps" className="mt-7 inline-flex h-12 items-center gap-2 rounded-full bg-foreground px-7 text-[14px] font-semibold text-background">
            Go to my bootcamps <ArrowRight className="h-4 w-4" />
          </Link>
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
        <Notice
          title={info.title}
          detail={info.detail}
          action={
            state === "bootcamp_started" ? (
              <Link to="/app/bootcamps/$id" params={{ id: bootcamp?.id }} className="rounded-full bg-foreground px-6 py-3 text-[13px] font-semibold text-background">
                Open the bootcamp
              </Link>
            ) : (
              <Link to="/app/bootcamps" className="rounded-full bg-foreground px-6 py-3 text-[13px] font-semibold text-background">
                Browse bootcamps
              </Link>
            )
          }
        />
      </Shell>
    );
  }

  // ── Open: the registration experience ────────────────────────────────────
  return (
    <Shell>
      {(form?.banner_url || bootcamp?.banner_url) && (
        <div className="h-[180px] w-full overflow-hidden bg-muted sm:h-[240px]">
          <img src={form?.banner_url || bootcamp?.banner_url} alt="" className="h-full w-full object-cover" />
        </div>
      )}

      <div className="mx-auto max-w-[640px] px-5 pb-24 pt-9">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
          {bootcamp?.category || "Bootcamp"} · Early registration
        </p>
        <h1 className="mt-3 font-display text-[32px] font-semibold leading-[1.1] tracking-[-0.02em] sm:text-[38px]">
          {bootcamp?.title}
        </h1>
        {bootcamp?.description && (
          <p className="mt-4 text-[15px] leading-7 text-muted-foreground">{bootcamp.description}</p>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-muted-foreground">
          {owner && (
            <span className="flex items-center gap-2">
              {owner.avatar_url ? (
                <img src={owner.avatar_url} alt="" className="h-6 w-6 rounded-full object-cover" />
              ) : (
                <span className="grid h-6 w-6 place-items-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                  {(owner.full_name || owner.username || "Z").charAt(0).toUpperCase()}
                </span>
              )}
              Hosted by <span className="font-semibold text-foreground">{owner.full_name || owner.username}</span>
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
            <span className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              {form.seats_left} of {form.seat_limit} seats left
            </span>
          )}
        </div>

        {/* Pricing */}
        <section className="mt-8 rounded-lg border-t-2 border-[#cc208f] bg-[#141117] p-6 text-white sm:p-7">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-white/50">
            {isPaid ? "Early bird price" : "Free registration"}
          </p>
          <div className="mt-3 flex flex-wrap items-baseline gap-3">
            <span className="text-[38px] font-semibold leading-none tracking-tight tabular-nums">
              {isPaid ? money(form.early_bird_price) : "Free"}
            </span>
            {isPaid && Number(form.regular_price) > Number(form.early_bird_price) && (
              <>
                <span className="text-[17px] text-white/45 line-through tabular-nums">{money(form.regular_price)}</span>
                {saving > 0 && (
                  <span className="rounded-full bg-[#cc208f]/20 px-2.5 py-1 text-[11px] font-semibold text-[#f28fd0] ring-1 ring-[#cc208f]/30">
                    Save {saving}%
                  </span>
                )}
              </>
            )}
          </div>
          <p className="mt-4 flex items-center gap-2 text-[12.5px] leading-6 text-white/60">
            <Clock3 className="h-3.5 w-3.5 shrink-0" />
            {form?.registration_deadline
              ? `Register before ${new Date(form.registration_deadline).toLocaleDateString(undefined, { month: "long", day: "numeric" })} to secure this price.`
              : "Register early to secure your seat before the bootcamp starts."}
          </p>
        </section>

        {/* Form */}
        <section className="mt-8">
          <h2 className="text-[17px] font-semibold tracking-tight">Your details</h2>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            {fields.length} quick question{fields.length === 1 ? "" : "s"} — this takes under a minute.
          </p>

          <div className="mt-5 space-y-4">
            {fields.map((f) => (
              <FormField
                key={f.field_key}
                field={f}
                value={answers[f.field_key] || ""}
                onChange={(value) => setAnswers((current) => ({ ...current, [f.field_key]: value }))}
              />
            ))}
          </div>

          {shortfall !== null && (
            <div className="mt-5 rounded-lg bg-amber-500/[0.08] p-4 ring-1 ring-amber-500/20">
              <p className="flex items-center gap-2 text-[13px] font-semibold text-amber-700">
                <Wallet className="h-4 w-4" /> Add {money(shortfall)} to your wallet
              </p>
              <p className="mt-1.5 text-[12px] leading-5 text-muted-foreground">
                Registration is paid from your Zero Club wallet. Top up, then submit again — your answers are saved.
              </p>
              <Link to="/app/wallet/add-money" className="mt-3 inline-flex h-10 items-center rounded-lg bg-foreground px-4 text-[12.5px] font-semibold text-background">
                Add money
              </Link>
            </div>
          )}

          {signedIn === false ? (
            <div className="mt-7 rounded-lg border border-border bg-card p-5 text-center">
              <Lock className="mx-auto h-5 w-5 text-muted-foreground" />
              <p className="mt-3 text-[13.5px] font-semibold">Sign in to complete your registration</p>
              <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
                Your registration is linked to your Zero Club account so your bootcamp appears automatically when it starts.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Link to="/signup" className="inline-flex h-11 items-center rounded-full bg-foreground px-6 text-[13px] font-semibold text-background">
                  Create a free account
                </Link>
                <Link to="/signin" className="inline-flex h-11 items-center rounded-full px-6 text-[13px] font-semibold text-foreground ring-1 ring-border">
                  Sign in
                </Link>
              </div>
            </div>
          ) : (
            <button
              onClick={() => {
                if (missingRequired.length) {
                  toast.error(`Please fill in: ${missingRequired.map((f) => f.label).join(", ")}`);
                  return;
                }
                submit.mutate();
              }}
              disabled={submit.isPending}
              className="mt-7 flex h-13 w-full items-center justify-center gap-2 rounded-full bg-foreground py-4 text-[15px] font-semibold text-background transition hover:opacity-90 disabled:opacity-50"
            >
              {submit.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {isPaid ? `Pay ${money(form.early_bird_price)} and register` : "Register now"}
            </button>
          )}

          <p className="mt-4 text-center text-[11.5px] leading-5 text-muted-foreground">
            {isPaid
              ? "Paid securely from your Zero Club wallet. You keep your seat at this price even after it rises."
              : "No payment needed. Your seat is confirmed as soon as you register."}
          </p>
        </section>
      </div>
    </Shell>
  );
}

function FormField({ field, value, onChange }: { field: any; value: string; onChange: (value: string) => void }) {
  const base =
    "w-full rounded-lg border border-border bg-background px-3.5 text-[14px] outline-none transition focus:border-primary/50";
  const label = (
    <label className="mb-1.5 block text-[12.5px] font-semibold">
      {field.label}
      {field.required && <span className="ml-1 text-primary">*</span>}
    </label>
  );

  if (field.field_type === "textarea") {
    return (
      <div>
        {label}
        <textarea rows={3} value={value} placeholder={field.placeholder || ""} onChange={(e) => onChange(e.target.value)} className={`${base} resize-none py-2.5`} />
      </div>
    );
  }

  if (field.field_type === "select") {
    const options: string[] = Array.isArray(field.options) ? field.options : [];
    return (
      <div>
        {label}
        <select value={value} onChange={(e) => onChange(e.target.value)} className={`${base} h-12`}>
          <option value="">Select an option</option>
          {options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </div>
    );
  }

  const inputType = field.field_type === "email" ? "email" : field.field_type === "number" ? "number" : field.field_type === "phone" ? "tel" : "text";
  return (
    <div>
      {label}
      <input type={inputType} value={value} placeholder={field.placeholder || ""} onChange={(e) => onChange(e.target.value)} className={`${base} h-12`} />
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f8f7f5] text-foreground dark:bg-background">
      <header className="border-b border-border/60 bg-background/95 backdrop-blur-xl">
        <div className="mx-auto flex h-[62px] max-w-[640px] items-center justify-between px-5">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/logo.png" alt="" className="h-7 w-7 object-contain" />
            <span className="font-display text-[16px] font-semibold tracking-tight">
              Zero <span className="text-primary">Club</span>
            </span>
          </Link>
          <span className="rounded-full bg-primary/[0.08] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
            Zero Form
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

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-2.5 last:border-b-0">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <span className="text-[12.5px] font-semibold">{value || "—"}</span>
    </div>
  );
}
