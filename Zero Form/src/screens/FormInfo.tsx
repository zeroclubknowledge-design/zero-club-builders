import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Brand } from "@/components/Brand";
import { RichText, richTextToPlain } from "@/components/RichText";
import { ArrowLeft, ArrowRight, CalendarDays, Clock3, Loader2, Users } from "@/components/icons/glyphs";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { formatWalletAmount } from "@/hooks/useWalletCurrency";
import { ZeroFormVideoPlayer } from "./PublicForm";
import { NAV } from "./nav";

type PublicFormInfo = {
  found: boolean; state: string;
  form?: {
    title: string; description: string | null; banner_url: string | null;
    form_kind?: string; pricing_enabled?: boolean; regular_price: number | null;
    early_bird_price: number | null; registration_deadline: string | null;
    seats_left: number | null; allow_interest?: boolean;
  };
  bootcamp?: {
    id: string | null; title: string; description: string | null; category: string | null;
    starts_at: string | null; ends_at: string | null; banner_url: string | null; video_url: string | null;
  };
  owner?: { full_name: string | null; username: string | null; avatar_url: string | null; account_type: string | null };
  curriculum?: { id: string; title: string; lessons: { id: string; title: string }[] }[];
  fields?: { id: string; label: string; required: boolean }[];
  my_registration?: { registration_status: string } | null;
};

const date = (value: string) => new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const closedMessage: Record<string, string> = {
  deadline_passed: "The registration deadline has passed.", closed: "The organiser has closed registration.",
  full: "All available places have been taken.", bootcamp_started: "Registration for this bootcamp has ended.",
  draft: "This form is not open for registration.",
};

/** Public information only: reuse the existing safe RPC, never query private responses. */
export function FormInfoPage({ slug }: { slug: string }) {
  const { session } = useAuth();
  const query = useQuery({
    queryKey: ["zero-form-info", slug, session?.user.id ?? null],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_zero_form_public", { form_slug: slug });
      if (error) throw error;
      return data as unknown as PublicFormInfo;
    },
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
  const data = query.data;
  const title = data?.form?.title || data?.bootcamp?.title;
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title ? `${title} — Zero Form` : "Form details — Zero Form";
    return () => { document.title = previousTitle; };
  }, [title]);
  useEffect(() => {
    if (data?.found) void supabase.rpc("record_zero_form_view", { form_slug: slug });
  }, [data?.found, slug]);

  const back = <Link to="/" className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-semibold text-muted-foreground transition hover:bg-foreground/[0.05] hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Back to Browse</Link>;
  if (query.isPending) return <AppShell brand={<Brand />} nav={NAV}>{back}<div role="status" className="grid min-h-[50vh] place-items-center"><span className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading form details…</span></div></AppShell>;
  if (query.isError || !data?.found || !data.form) return <AppShell brand={<Brand />} nav={NAV}>{back}<section className="my-8 rounded-[24px] border border-border bg-card p-8 text-center"><h1 className="text-xl font-semibold">{query.isError ? "Couldn't load this form" : "This form is unavailable"}</h1><p className="mt-2 text-sm text-muted-foreground">{query.isError ? "Please try again to see the organiser's details." : "It may have been removed or unpublished by its organiser."}</p>{query.isError && <button type="button" onClick={() => void query.refetch()} className="mt-5 h-11 rounded-full bg-foreground px-6 text-sm font-semibold text-background">Try again</button>}</section></AppShell>;

  const { form, bootcamp, owner } = data;
  const waitlist = form.form_kind === "waitlist" || !bootcamp?.id;
  const dataOnly = form.pricing_enabled === false || waitlist;
  // Match the registration checkout's price, including a deliberately free offer.
  const price = dataOnly ? 0 : Number(form.early_bird_price || 0);
  const regular = Number(form.regular_price || 0);
  const flyer = form.banner_url || bootcamp?.banner_url;
  const modules = data.curriculum || [];
  const lessons = modules.reduce((sum, module) => sum + module.lessons.length, 0);
  const registered = ["confirmed", "enrolled", "interested"].includes(data.my_registration?.registration_status || "");
  const deadlinePassed = !dataOnly && !!form.registration_deadline && Date.parse(form.registration_deadline) <= Date.now();
  const open = data.state === "open" && !deadlinePassed;
  const description = waitlist ? form.description : bootcamp?.description || form.description;
  const normalise = (text: string | null | undefined) => richTextToPlain(text || "").replace(/\s+/g, " ").trim().toLowerCase();
  const extraNote = !waitlist && form.description && normalise(form.description) !== normalise(description) && !normalise(description).includes(normalise(form.description));
  const person = owner?.full_name || owner?.username || "Zero Club organiser";
  const status = open ? waitlist ? "Waitlist open" : "Registration open" : "Registration closed";

  return (
    <AppShell brand={<Brand />} nav={NAV}>
      {back}
      <article className="mt-3 min-w-0 overflow-hidden rounded-[24px] border border-border bg-card shadow-[0_24px_70px_-48px_rgba(195,33,126,0.4)] sm:rounded-[32px]">
        {flyer ? <img src={flyer} alt={`${title} cover`} className="max-h-[520px] w-full bg-foreground/[0.03] object-contain" decoding="async" />
          : bootcamp?.video_url ? <ZeroFormVideoPlayer src={bootcamp.video_url} />
          : <div aria-hidden="true" className="h-2 bg-gradient-to-r from-[#c3217e] via-[#e64aa4] to-violet-500" />}
        <div className="p-5 sm:p-8 lg:p-10">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em]">
            <span className="rounded-full bg-[#c3217e]/10 px-3 py-1.5 text-[#c3217e]">{waitlist ? "Waitlist" : bootcamp?.category || "Bootcamp"}</span>
            <span className={`rounded-full px-3 py-1.5 ${open ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-foreground/[0.05] text-muted-foreground"}`}>{status}</span>
          </div>
          <h1 className="mt-5 max-w-[820px] break-words font-display text-[28px] font-bold leading-[1.15] tracking-tight sm:text-[40px] lg:text-[46px]">{title}</h1>
          <div className="mt-6 flex items-center gap-3">
            {owner?.avatar_url ? <img src={owner.avatar_url} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" /> : <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#c3217e]/10 font-bold text-[#c3217e]">{person.charAt(0)}</span>}
            <div className="min-w-0"><p className="text-xs text-muted-foreground">Organised by</p><p className="break-words text-sm font-semibold">{person}</p>{owner?.username && <p className="break-words text-xs text-muted-foreground">@{owner.username.replace(/^@/, "")}{owner.account_type ? ` · ${owner.account_type}` : ""}</p>}</div>
          </div>
          <div className="mt-8 grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-12">
            <div className="min-w-0 space-y-8">
              <section><SectionTitle eyebrow="The overview" title={waitlist ? "About this form" : "About this bootcamp"} />{description ? <RichText content={description} className="mt-4 break-words text-[15px] leading-[1.85] text-foreground/85 [&_a]:break-all" /> : <p className="mt-3 text-sm text-muted-foreground">The organiser hasn't added a description yet.</p>}
                {extraNote && <div className="mt-6 border-t border-border pt-5"><h3 className="mb-3 text-sm font-semibold">A note from the organiser</h3><RichText content={form.description!} className="break-words text-sm leading-relaxed text-muted-foreground [&_a]:break-all" /></div>}
              </section>
              {!waitlist && <section><SectionTitle eyebrow="Your learning journey" title="Course content" />{modules.length ? <><p className="mb-4 mt-2 text-xs text-muted-foreground">{modules.length} {modules.length === 1 ? "module" : "modules"} · {lessons} {lessons === 1 ? "lesson" : "lessons"}</p><div className="divide-y divide-border overflow-hidden rounded-2xl border border-border">{modules.map((module, index) => <details key={module.id} open={index === 0} className="group p-4"><summary className="cursor-pointer break-words text-sm font-semibold">{String(index + 1).padStart(2, "0")} · {module.title}<span className="ml-2 text-xs font-normal text-muted-foreground">({module.lessons.length} {module.lessons.length === 1 ? "lesson" : "lessons"})</span></summary><ol className="mt-4 space-y-2 pl-5 text-sm text-muted-foreground">{module.lessons.map(lesson => <li key={lesson.id} className="list-disc break-words">{lesson.title}</li>)}</ol></details>)}</div></> : <p className="mt-3 text-sm text-muted-foreground">The organiser will share the curriculum when it is ready.</p>}</section>}
              {!!data.fields?.length && <section><SectionTitle eyebrow="Before you register" title="What you'll be asked" /><ul className="mt-4 flex flex-wrap gap-2">{data.fields.map(field => <li key={field.id} className="max-w-full break-words rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground">{field.label}{field.required ? " · Required" : " · Optional"}</li>)}</ul></section>}
            </div>
            <aside className="min-w-0 self-start rounded-[22px] border border-border bg-foreground/[0.025] p-5 sm:p-6">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{dataOnly ? "Participation" : "Registration fee"}</p>
              <p className="mt-3 break-words text-3xl font-bold tracking-tight tabular-nums">{price > 0 ? formatWalletAmount(price) : "Free"}</p>
              {!dataOnly && price > 0 && regular > price && <p className="mt-2 text-sm text-muted-foreground"><span className="line-through">{formatWalletAmount(regular)}</span> <span className="ml-2 font-semibold text-[#c3217e]">Early-bird price</span></p>}
              <dl className="mt-6 space-y-5 border-t border-border pt-5">
                {bootcamp?.starts_at && <Fact icon={<CalendarDays className="h-4 w-4" />} label="Starts" value={date(bootcamp.starts_at)} />}
                {bootcamp?.ends_at && <Fact icon={<CalendarDays className="h-4 w-4" />} label="Ends" value={date(bootcamp.ends_at)} />}
                {form.registration_deadline && <Fact icon={<Clock3 className="h-4 w-4" />} label="Registration deadline" value={date(form.registration_deadline)} />}
                {form.seats_left != null && <Fact icon={<Users className="h-4 w-4" />} label="Availability" value={`${form.seats_left} ${form.seats_left === 1 ? "place" : "places"} remaining`} />}
                <Fact icon={<Users className="h-4 w-4" />} label="Hosted by" value={person} />
              </dl>
            </aside>
          </div>
          <footer className="mt-10 border-t border-border pt-7 lg:flex lg:items-center lg:justify-between lg:gap-6">
            <div><h2 className="text-xl font-semibold tracking-tight">{registered ? "You're already on the list" : open ? waitlist ? "Be part of what's next" : "Ready to take the next step?" : "Registration is closed"}</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{registered ? "Open your registration to review your details and next steps." : open ? "Continue to the form to enter your details. Nothing is submitted until you confirm." : closedMessage[deadlinePassed ? "deadline_passed" : data.state] || "This form is not accepting registrations right now."}</p></div>
            <div className="mt-5 flex shrink-0 flex-wrap gap-3 lg:mt-0">
              <Link to="/" className="inline-flex h-11 items-center justify-center rounded-full border border-border px-6 text-sm font-semibold transition hover:bg-foreground/[0.05]">Ignore</Link>
              {open || registered ? <Link to="/form/$slug/register" params={{ slug }} className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#c3217e] px-6 text-sm font-semibold text-white transition hover:bg-[#ac1c6e]">{registered ? "View registration" : "Register"}<ArrowRight className="h-4 w-4" /></Link> : <button type="button" disabled className="h-11 rounded-full bg-foreground/10 px-6 text-sm font-semibold text-muted-foreground">Registration closed</button>}
            </div>
          </footer>
        </div>
      </article>
    </AppShell>
  );
}

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return <><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#c3217e]">{eyebrow}</p><h2 className="mt-2 text-xl font-semibold tracking-tight">{title}</h2></>;
}
function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="flex min-w-0 items-start gap-3"><span className="mt-0.5 shrink-0 text-[#c3217e]">{icon}</span><div className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words text-sm font-medium leading-relaxed">{value}</dd></div></div>;
}

