import { useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Award,
  BarChart3,
  Building2,
  CalendarClock,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  GraduationCap,
  HelpCircle,
  Layers3,
  Loader2,
  Pencil,
  PlayCircle,
  Plus,
  Star,
  Target,
  TicketPercent,
  Trash2,
  UploadCloud,
  Users,
  Video,
  X,
} from "@/components/icons/glyphs";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { UsernamePicker } from "@/components/UsernamePicker";
import { ZeroGiftPaymentOption, zeroGiftBalanceQueryKey } from "@/components/ZeroGiftPaymentOption";
import { useWalletCurrency } from "@/hooks/useWalletCurrency";
import { supabase } from "@/lib/supabase";

import { confirmCard } from "@/components/ConfirmCard";
import { CardSelect } from "@/components/CardSelect";
import { MentionField } from "@/components/MentionField";
/* ───────────────────────── shared bits ───────────────────────── */

const rpc = async <T,>(name: string, args?: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.rpc(name as never, (args || {}) as never);
  if (error) throw error;
  return data as T;
};

const field = "h-11 w-full rounded-[10px] border border-foreground/15 bg-card px-3 text-[15px] outline-none placeholder:text-muted-foreground focus:border-foreground/40";
const area = "w-full resize-none rounded-[10px] border border-foreground/15 bg-card px-3 py-2.5 text-[15px] outline-none placeholder:text-muted-foreground focus:border-foreground/40";
const label = "mb-1.5 block text-[13px] font-semibold text-muted-foreground";
const primaryBtn = "inline-flex h-11 items-center justify-center gap-2 rounded-full bg-foreground px-5 text-[15px] font-semibold text-background transition active:scale-[0.98] disabled:opacity-50";
const outlineBtn = "inline-flex h-10 items-center justify-center gap-2 rounded-full border-[1.5px] border-foreground/80 px-4 text-[14px] font-semibold text-foreground transition active:scale-[0.98] disabled:opacity-50";
const card = "bg-card p-4 md:rounded-xl md:border md:border-border";

function Sheet({ open, onOpenChange, title, description, icon, children }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: string; icon?: ReactNode; children: ReactNode;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-h-[92dvh] max-w-2xl border-none bg-background p-0">
        <div className="overflow-y-auto px-5 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-1 sm:px-7">
          <DrawerHeader className="p-0 pb-4 text-left">
            {icon && <div className="grid h-11 w-11 place-items-center rounded-full bg-[#cc208f]/10 text-[#cc208f]">{icon}</div>}
            <DrawerTitle className="mt-3 font-display text-[20px] font-semibold leading-tight">{title}</DrawerTitle>
            {description && <DrawerDescription className="mt-1 text-[14px] leading-relaxed text-muted-foreground">{description}</DrawerDescription>}
          </DrawerHeader>
          {children}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

const LEVEL_LABEL: Record<string, string> = { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced", all: "All levels" };
export const levelLabel = (level?: string | null) => (level ? LEVEL_LABEL[level] || level : null);

const toLocalInput = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fmtDate = (iso?: string | null, withTime = true) =>
  iso ? new Date(iso).toLocaleString([], withTime ? { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" } : { day: "numeric", month: "short", year: "numeric" }) : "";

export function earlyBirdActive(bootcamp: any) {
  return bootcamp?.early_bird_price != null && bootcamp?.early_bird_ends_at && new Date(bootcamp.early_bird_ends_at) > new Date()
    && Number(bootcamp.early_bird_price) < Number(bootcamp.price || 0);
}
export function currentPrice(bootcamp: any) {
  return earlyBirdActive(bootcamp) ? Number(bootcamp.early_bird_price) : Number(bootcamp?.price || 0);
}
export function seatsLeft(bootcamp: any) {
  const limit = Number(bootcamp?.seat_limit || 0);
  if (!limit) return null;
  return Math.max(0, limit - Number(bootcamp?.learners_count || 0));
}
function daysLeft(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return null;
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  return d > 0 ? `${d}d ${h}h` : `${h}h ${Math.max(1, Math.floor((ms % 3_600_000) / 60_000))}m`;
}

/* ───────────────────────── facts strip ───────────────────────── */

export function BootcampFacts({ bootcamp }: { bootcamp: any }) {
  const left = seatsLeft(bootcamp);
  const items: { icon: ReactNode; text: string; strong?: boolean }[] = [];
  items.push({ icon: <Layers3 className="h-4 w-4" />, text: bootcamp.format === "workshop" ? "Workshop" : "Bootcamp" });
  if (levelLabel(bootcamp.level)) items.push({ icon: <BarChart3 className="h-4 w-4" />, text: levelLabel(bootcamp.level)! });
  if (bootcamp.duration_label) items.push({ icon: <Clock className="h-4 w-4" />, text: bootcamp.duration_label });
  if (bootcamp.hours_per_week) items.push({ icon: <CalendarClock className="h-4 w-4" />, text: `${bootcamp.hours_per_week} hrs/week` });
  if (bootcamp.starts_at) {
    const started = new Date(bootcamp.starts_at) <= new Date();
    items.push({ icon: <CalendarDays className="h-4 w-4" />, text: started ? `Started ${fmtDate(bootcamp.starts_at, false)}` : `Starts ${fmtDate(bootcamp.starts_at, false)}` });
  }
  if (bootcamp.certificate_enabled !== false) items.push({ icon: <Award className="h-4 w-4" />, text: "Certificate included" });
  if (left !== null) items.push({ icon: <Users className="h-4 w-4" />, text: left === 0 ? "Fully booked" : `${left} seat${left === 1 ? "" : "s"} left`, strong: left <= 5 });
  if (Number(bootcamp.rating_count) > 0) items.push({ icon: <Star className="h-4 w-4 fill-current" />, text: `${Number(bootcamp.rating_avg).toFixed(1)} (${bootcamp.rating_count})` });
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span key={item.text} className={`inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-semibold ${item.strong ? "bg-[#cc208f]/12 text-[#a3186f]" : "bg-foreground/[0.05] text-foreground/80"}`}>
          {item.icon}{item.text}
        </span>
      ))}
    </div>
  );
}

export function EarlyBirdBanner({ bootcamp }: { bootcamp: any }) {
  const { format } = useWalletCurrency();
  if (!earlyBirdActive(bootcamp)) return null;
  const save = Number(bootcamp.price) - Number(bootcamp.early_bird_price);
  return (
    <div className="mb-3 flex items-center gap-2.5 rounded-xl bg-[#cc208f]/[0.08] px-3 py-2.5">
      <TicketPercent className="h-5 w-5 shrink-0 text-[#cc208f]" />
      <p className="min-w-0 flex-1 text-[13px] leading-snug">
        <span className="font-semibold text-[#a3186f]">Early bird — save {format(save)}.</span>{" "}
        <span className="text-foreground/75">Ends in {daysLeft(bootcamp.early_bird_ends_at)}.</span>
      </p>
    </div>
  );
}

/* ───────────────────────── outcomes, prerequisites, FAQ, instructor ───────────────────────── */

export function BootcampOutcomes({ bootcamp }: { bootcamp: any }) {
  const outcomes: string[] = (bootcamp.outcomes || []).filter(Boolean);
  const prereqs: string[] = (bootcamp.prerequisites || []).filter(Boolean);
  if (!outcomes.length && !prereqs.length) return null;
  return (
    <section className={card}>
      {outcomes.length > 0 && (
        <>
          <h2 className="flex items-center gap-2 font-display text-[18px] font-semibold"><Target className="h-5 w-5 text-[#cc208f]" /> What you'll be able to do</h2>
          <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
            {outcomes.map((o) => (
              <li key={o} className="flex items-start gap-2.5 text-[14px] leading-snug"><Check className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#1a7f4b]" />{o}</li>
            ))}
          </ul>
        </>
      )}
      {prereqs.length > 0 && (
        <div className={outcomes.length ? "mt-5 border-t border-border pt-4" : ""}>
          <h3 className="text-[15px] font-semibold">Before you start</h3>
          <ul className="mt-2 grid gap-1.5">
            {prereqs.map((p) => <li key={p} className="flex items-start gap-2 text-[14px] text-foreground/80"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/40" />{p}</li>)}
          </ul>
        </div>
      )}
    </section>
  );
}

export function BootcampInstructor({ bootcamp }: { bootcamp: any }) {
  const p = bootcamp.profiles;
  if (!p || !bootcamp.instructor_bio) return null;
  const name = p.full_name || p.username || "Instructor";
  return (
    <section className={card}>
      <h2 className="font-display text-[18px] font-semibold">Your instructor</h2>
      <div className="mt-3 flex items-center gap-3">
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-muted">
          {p.avatar_url ? <img src={p.avatar_url} alt="" className="h-full w-full object-cover" /> : <span className="grid h-full w-full place-items-center text-[18px] font-semibold text-muted-foreground">{name.charAt(0)}</span>}
        </div>
        <div className="min-w-0">
          <Link to="/app/profile/$id" params={{ id: p.username || p.id }} className="block truncate text-[16px] font-semibold hover:underline">{name}</Link>
          {p.username && <p className="truncate text-[13px] text-muted-foreground">@{p.username}</p>}
        </div>
      </div>
      <p className="mt-3 whitespace-pre-line text-[14px] leading-relaxed text-foreground/85">{bootcamp.instructor_bio}</p>
    </section>
  );
}

export function BootcampFaq({ bootcamp }: { bootcamp: any }) {
  const faqs: { q: string; a: string }[] = Array.isArray(bootcamp.faqs) ? bootcamp.faqs.filter((f: any) => f?.q && f?.a) : [];
  if (!faqs.length) return null;
  return (
    <section className={card}>
      <h2 className="flex items-center gap-2 font-display text-[18px] font-semibold"><HelpCircle className="h-5 w-5 text-[#cc208f]" /> Questions</h2>
      <Accordion type="single" collapsible className="mt-2">
        {faqs.map((f, i) => (
          <AccordionItem key={i} value={`faq-${i}`} className="border-foreground/10">
            <AccordionTrigger className="py-3 text-left text-[14.5px] font-semibold hover:no-underline">{f.q}</AccordionTrigger>
            <AccordionContent className="whitespace-pre-line pb-3 text-[14px] leading-relaxed text-foreground/80">{f.a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}

/* ───────────────────────── course details editor (managers) ───────────────────────── */

export function BootcampDetailsEditor({ bootcamp, onSaved }: { bootcamp: any; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [formatKind, setFormatKind] = useState<string>(bootcamp.format || "bootcamp");
  const [level, setLevel] = useState<string>(bootcamp.level || "");
  const [duration, setDuration] = useState<string>(bootcamp.duration_label || "");
  const [hours, setHours] = useState<string>(bootcamp.hours_per_week ? String(bootcamp.hours_per_week) : "");
  const [startsAt, setStartsAt] = useState(toLocalInput(bootcamp.starts_at));
  const [endsAt, setEndsAt] = useState(toLocalInput(bootcamp.ends_at));
  const [seatLimit, setSeatLimit] = useState(bootcamp.seat_limit ? String(bootcamp.seat_limit) : "");
  const [outcomes, setOutcomes] = useState<string>((bootcamp.outcomes || []).join("\n"));
  const [prereqs, setPrereqs] = useState<string>((bootcamp.prerequisites || []).join("\n"));
  const [bio, setBio] = useState<string>(bootcamp.instructor_bio || "");
  const [faqs, setFaqs] = useState<{ q: string; a: string }[]>(Array.isArray(bootcamp.faqs) && bootcamp.faqs.length ? bootcamp.faqs : []);
  const [certificate, setCertificate] = useState<boolean>(bootcamp.certificate_enabled !== false);
  const [earlyPrice, setEarlyPrice] = useState(bootcamp.early_bird_price != null ? String(bootcamp.early_bird_price) : "");
  const [earlyEnds, setEarlyEnds] = useState(toLocalInput(bootcamp.early_bird_ends_at));
  const [groupMin, setGroupMin] = useState(String(bootcamp.group_min_seats || 3));
  const [groupDisc, setGroupDisc] = useState(String(bootcamp.group_discount_percent || 0));
  const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 12);

  const save = useMutation({
    mutationFn: async () => {
      const ep = earlyPrice.trim() === "" ? null : Math.max(0, Math.floor(Number(earlyPrice) || 0));
      if (ep !== null && !earlyEnds) throw new Error("Pick when the early-bird price ends");
      if (ep !== null && ep >= Number(bootcamp.price || 0)) throw new Error("The early-bird price must be lower than the regular price");
      const { error } = await supabase.from("bootcamps").update({
        format: formatKind,
        level: level || null,
        duration_label: duration.trim() || null,
        hours_per_week: hours ? Math.max(1, Math.floor(Number(hours))) : null,
        starts_at: startsAt ? new Date(startsAt).toISOString() : null,
        ends_at: endsAt ? new Date(endsAt).toISOString() : null,
        seat_limit: seatLimit ? Math.max(1, Math.floor(Number(seatLimit))) : null,
        outcomes: lines(outcomes),
        prerequisites: lines(prereqs),
        instructor_bio: bio.trim() || null,
        faqs: faqs.filter((f) => f.q.trim() && f.a.trim()).map((f) => ({ q: f.q.trim(), a: f.a.trim() })).slice(0, 15),
        certificate_enabled: certificate,
        early_bird_price: ep,
        early_bird_ends_at: ep !== null && earlyEnds ? new Date(earlyEnds).toISOString() : null,
        group_min_seats: Math.min(500, Math.max(2, Math.floor(Number(groupMin) || 3))),
        group_discount_percent: Math.min(90, Math.max(0, Math.floor(Number(groupDisc) || 0))),
      } as never).eq("id", bootcamp.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Course details saved"); setOpen(false); onSaved(); },
    onError: (e: any) => toast.error(e?.message || "Could not save"),
  });

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`${outlineBtn} mt-2 w-full`}><Pencil className="h-4 w-4" /> Course details, pricing & FAQ</button>
      <Sheet open={open} onOpenChange={setOpen} title="Course details" description="What learners see before they enrol: format, level, schedule, outcomes, FAQs and offers." icon={<GraduationCap className="h-5 w-5" />}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className={label}>Format</span>
              <div className="grid grid-cols-2 gap-1 rounded-full bg-foreground/[0.05] p-1">
                {["bootcamp", "workshop"].map((f) => (
                  <button key={f} type="button" onClick={() => setFormatKind(f)} className={`h-9 rounded-full text-[13px] font-semibold capitalize ${formatKind === f ? "bg-card shadow-sm" : "text-muted-foreground"}`}>{f}</button>
                ))}
              </div>
            </div>
            <div>
              <span className={label}>Level</span>
              <CardSelect value={level} onChange={(e) => setLevel(e.target.value)} className={field}>
                <option value="">Not set</option>
                {Object.entries(LEVEL_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </CardSelect>
            </div>
            <div><span className={label}>Duration</span><input value={duration} onChange={(e) => setDuration(e.target.value)} maxLength={40} placeholder={formatKind === "workshop" ? "e.g. 2 days" : "e.g. 12 weeks"} className={field} /></div>
            <div><span className={label}>Hours per week</span><input value={hours} onChange={(e) => setHours(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="e.g. 6" className={field} /></div>
            <div><span className={label}>Starts</span><input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={field} /></div>
            <div><span className={label}>Ends</span><input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className={field} /></div>
            <div><span className={label}>Seat limit</span><input value={seatLimit} onChange={(e) => setSeatLimit(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="No limit" className={field} /></div>
            <label className="flex items-end gap-2 pb-3 text-[14px] font-semibold"><input type="checkbox" checked={certificate} onChange={(e) => setCertificate(e.target.checked)} className="h-5 w-5 accent-[#cc208f]" /> Certificate of completion</label>
          </div>

          <div><span className={label}>What learners will be able to do (one per line)</span><textarea value={outcomes} onChange={(e) => setOutcomes(e.target.value)} rows={4} placeholder={"Build and deploy a full web app\nWork with APIs and databases"} className={area} /></div>
          <div><span className={label}>Prerequisites (one per line)</span><textarea value={prereqs} onChange={(e) => setPrereqs(e.target.value)} rows={3} placeholder={"A laptop\nBasic HTML (helpful, not required)"} className={area} /></div>
          <div><span className={label}>About you, the instructor</span><textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} maxLength={800} placeholder="Your experience and what you've built" className={area} /></div>

          <div className="rounded-2xl border border-border p-3.5">
            <p className="text-[14px] font-semibold">Offers</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div><span className={label}>Early-bird price</span><input value={earlyPrice} onChange={(e) => setEarlyPrice(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder={`Below ${Number(bootcamp.price || 0)}`} className={field} /></div>
              <div><span className={label}>Early bird ends</span><input type="datetime-local" value={earlyEnds} onChange={(e) => setEarlyEnds(e.target.value)} className={field} /></div>
              <div><span className={label}>Group discount from (seats)</span><input value={groupMin} onChange={(e) => setGroupMin(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className={field} /></div>
              <div><span className={label}>Group discount %</span><input value={groupDisc} onChange={(e) => setGroupDisc(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className={field} /></div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between"><span className={label}>FAQ</span>
              <button type="button" onClick={() => setFaqs((f) => [...f, { q: "", a: "" }])} className="text-[13px] font-semibold text-[#cc208f]">+ Add question</button>
            </div>
            <div className="space-y-2">
              {faqs.map((f, i) => (
                <div key={i} className="rounded-xl border border-border p-2.5">
                  <div className="flex gap-2">
                    <input value={f.q} onChange={(e) => setFaqs((all) => all.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)))} placeholder="Question" className={`${field} h-10`} />
                    <button type="button" aria-label="Remove question" onClick={() => setFaqs((all) => all.filter((_, j) => j !== i))} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-foreground/[0.05]"><X className="h-4 w-4" /></button>
                  </div>
                  <textarea value={f.a} onChange={(e) => setFaqs((all) => all.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))} rows={2} placeholder="Answer" className={`${area} mt-2`} />
                </div>
              ))}
              {faqs.length === 0 && <p className="text-[13px] text-muted-foreground">Answer the questions people ask before paying — time commitment, support, refunds.</p>}
            </div>
          </div>

          <button type="button" disabled={save.isPending} onClick={() => save.mutate()} className={`${primaryBtn} w-full`}>{save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Save details</button>
        </div>
      </Sheet>
    </>
  );
}

/* ───────────────────────── live class schedule ───────────────────────── */

type Session = { id: string; title: string; description?: string; kind: string; starts_at: string; ends_at?: string; status: string; has_link: boolean; meeting_url?: string | null; my_attendance?: string | null; present_count?: number | null };
const KIND_LABEL: Record<string, string> = { live: "Live class", workshop: "Workshop", office_hours: "Office hours", review: "Project review" };

export function BootcampSchedule({ bootcampId, canManage, isEnrolled }: { bootcampId: string; canManage: boolean; isEnrolled: boolean }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const [rosterFor, setRosterFor] = useState<Session | null>(null);
  const [showPast, setShowPast] = useState(false);
  const key = ["bootcamp-sessions", bootcampId];
  const sessions = useQuery({ queryKey: key, queryFn: () => rpc<Session[]>("get_bootcamp_sessions", { p_bootcamp: bootcampId }) });
  const refresh = () => { void queryClient.invalidateQueries({ queryKey: key }); void queryClient.invalidateQueries({ queryKey: ["bootcamp-progress", bootcampId] }); };

  const join = useMutation({
    mutationFn: (s: Session) => rpc<{ meeting_url?: string | null }>("join_bootcamp_session", { p_session: s.id }),
    onSuccess: (res) => {
      refresh();
      if (res?.meeting_url) window.open(res.meeting_url, "_blank", "noopener");
      else void navigate({ to: "/app/live/$classId", params: { classId: bootcampId } });
    },
    onError: (e: any) => toast.error(e?.message || "Could not join"),
  });
  const cancel = useMutation({
    mutationFn: async (s: Session) => {
      const { error } = await supabase.from("bootcamp_sessions" as never).update({ status: s.status === "cancelled" ? "scheduled" : "cancelled" } as never).eq("id", s.id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e: any) => toast.error(e?.message || "Could not update"),
  });
  const remove = useMutation({
    mutationFn: (s: Session) => rpc("remove_bootcamp_item", { p_kind: "session", p_id: s.id }),
    onSuccess: () => { toast.success("Class removed"); refresh(); },
    onError: (e: any) => toast.error(e?.message || "Could not remove"),
  });

  const all = sessions.data || [];
  const now = Date.now();
  const endOf = (s: Session) => new Date(s.ends_at || new Date(new Date(s.starts_at).getTime() + 3_600_000).toISOString()).getTime();
  const upcoming = all.filter((s) => endOf(s) >= now);
  const past = all.filter((s) => endOf(s) < now).reverse();
  if (!sessions.isLoading && all.length === 0 && !canManage) return null;

  const row = (s: Session) => {
    const start = new Date(s.starts_at).getTime();
    const live = start - 30 * 60_000 <= now && now <= endOf(s) && s.status !== "cancelled";
    const isPast = endOf(s) < now;
    return (
      <div key={s.id} className="flex items-start gap-3 border-t border-border py-3 first:border-t-0">
        <div className="w-12 shrink-0 rounded-xl bg-foreground/[0.05] py-1.5 text-center">
          <p className="text-[11px] font-semibold uppercase text-muted-foreground">{new Date(s.starts_at).toLocaleDateString([], { month: "short" })}</p>
          <p className="text-[18px] font-bold leading-none">{new Date(s.starts_at).getDate()}</p>
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-[14.5px] font-semibold leading-snug ${s.status === "cancelled" ? "text-muted-foreground line-through" : ""}`}>{s.title}</p>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            {KIND_LABEL[s.kind] || "Class"} · {new Date(s.starts_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            {s.ends_at ? `–${new Date(s.ends_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}
            {s.status === "cancelled" && " · Cancelled"}
            {isPast && s.my_attendance && ` · ${s.my_attendance === "absent" ? "Missed" : "Attended"}`}
            {canManage && s.present_count != null && ` · ${s.present_count} attended`}
          </p>
          {s.description && <p className="mt-1 line-clamp-2 text-[13px] text-foreground/75">{s.description}</p>}
          {canManage && (
            <div className="mt-2 flex flex-wrap gap-3 text-[12.5px] font-semibold">
              <button type="button" onClick={() => setRosterFor(s)} className="text-[#cc208f]">Attendance</button>
              {!isPast && <button type="button" onClick={() => cancel.mutate(s)} className="text-muted-foreground">{s.status === "cancelled" ? "Restore" : "Cancel class"}</button>}
              <button type="button" onClick={async () => (await confirmCard("Remove this class from the schedule?")) && remove.mutate(s)} className="text-muted-foreground">Remove</button>
            </div>
          )}
        </div>
        {(isEnrolled || canManage) && live && (
          <button type="button" disabled={join.isPending} onClick={() => join.mutate(s)} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-[#cc208f] px-3.5 text-[13px] font-semibold text-white">
            {join.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Video className="h-3.5 w-3.5" />} Join
          </button>
        )}
      </div>
    );
  };

  return (
    <section className={card}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-[18px] font-semibold"><CalendarDays className="h-5 w-5 text-[#cc208f]" /> Class schedule</h2>
        {canManage && <button type="button" onClick={() => setAdding(true)} className="inline-flex h-9 items-center gap-1 rounded-full bg-foreground px-3.5 text-[13px] font-semibold text-background"><Plus className="h-4 w-4" /> Add class</button>}
      </div>
      {!isEnrolled && !canManage && all.length > 0 && <p className="mt-1 text-[13px] text-muted-foreground">Enrol to get the join links and attendance on your record.</p>}
      {sessions.isLoading ? (
        <Loader2 className="mx-auto my-5 h-5 w-5 animate-spin text-muted-foreground" />
      ) : (
        <div className="mt-2">
          {upcoming.length ? upcoming.map(row) : <p className="py-3 text-[14px] text-muted-foreground">{canManage ? "No upcoming classes. Add your first one — learners are notified." : "New classes will appear here."}</p>}
          {past.length > 0 && (
            <>
              <button type="button" onClick={() => setShowPast((v) => !v)} className="mt-1 text-[13px] font-semibold text-muted-foreground">{showPast ? "Hide" : "Show"} past classes ({past.length})</button>
              {showPast && <div className="mt-1">{past.map(row)}</div>}
            </>
          )}
        </div>
      )}
      {canManage && <AddSessionSheet open={adding} onOpenChange={setAdding} bootcampId={bootcampId} onSaved={refresh} />}
      {canManage && rosterFor && <RosterSheet session={rosterFor} onClose={() => { setRosterFor(null); refresh(); }} />}
    </section>
  );
}

function AddSessionSheet({ open, onOpenChange, bootcampId, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; bootcampId: string; onSaved: () => void }) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("live");
  const [startsAt, setStartsAt] = useState("");
  const [minutes, setMinutes] = useState("90");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [repeat, setRepeat] = useState("1");
  const save = useMutation({
    mutationFn: async () => {
      if (title.trim().length < 2) throw new Error("Give the class a title");
      if (!startsAt) throw new Error("Pick a date and time");
      if (url && !/^https?:\/\//i.test(url.trim())) throw new Error("The meeting link must start with https://");
      const { data: { session } } = await supabase.auth.getSession();
      const weeks = Math.min(24, Math.max(1, Math.floor(Number(repeat) || 1)));
      const base = new Date(startsAt).getTime();
      const len = Math.max(15, Math.floor(Number(minutes) || 60)) * 60_000;
      const rows = Array.from({ length: weeks }, (_, i) => ({
        bootcamp_id: bootcampId,
        title: weeks > 1 ? `${title.trim()} · Week ${i + 1}` : title.trim(),
        kind,
        description: description.trim() || null,
        starts_at: new Date(base + i * 7 * 86_400_000).toISOString(),
        ends_at: new Date(base + i * 7 * 86_400_000 + len).toISOString(),
        meeting_url: url.trim() || null,
        created_by: session?.user.id,
      }));
      const { error } = await supabase.from("bootcamp_sessions" as never).insert(rows as never);
      if (error) throw error;
      return weeks;
    },
    onSuccess: (n) => {
      toast.success(n > 1 ? `${n} weekly classes added` : "Class added", { description: "Enrolled learners have been notified." });
      setTitle(""); setStartsAt(""); setUrl(""); setDescription(""); setRepeat("1");
      onOpenChange(false); onSaved();
    },
    onError: (e: any) => toast.error(e?.message || "Could not add the class"),
  });
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Add a class" description="Learners see it on the schedule and get a Join button 30 minutes before it starts. Joining records their attendance." icon={<CalendarClock className="h-5 w-5" />}>
      <div className="space-y-3">
        <div><span className={label}>Title</span><input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="e.g. Intro to APIs" className={field} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><span className={label}>Type</span><CardSelect value={kind} onChange={(e) => setKind(e.target.value)} className={field}>{Object.entries(KIND_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</CardSelect></div>
          <div><span className={label}>Length (minutes)</span><input value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className={field} /></div>
          <div><span className={label}>Date and time</span><input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={field} /></div>
          <div><span className={label}>Repeat weekly for</span><CardSelect value={repeat} onChange={(e) => setRepeat(e.target.value)} className={field}>{[1, 2, 4, 6, 8, 10, 12, 16, 24].map((n) => <option key={n} value={n}>{n === 1 ? "Just once" : `${n} weeks`}</option>)}</CardSelect></div>
        </div>
        <div><span className={label}>Meeting link (optional)</span><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Leave empty to use Zero Club live class" className={field} /></div>
        <div><span className={label}>What's covered (optional)</span><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={area} /></div>
        <button type="button" disabled={save.isPending} onClick={() => save.mutate()} className={`${primaryBtn} w-full`}>{save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Add to schedule</button>
      </div>
    </Sheet>
  );
}

function RosterSheet({ session, onClose }: { session: Session; onClose: () => void }) {
  const queryClient = useQueryClient();
  const key = ["bootcamp-roster", session.id];
  const roster = useQuery({ queryKey: key, queryFn: () => rpc<any[]>("bootcamp_session_roster", { p_session: session.id }) });
  const mark = useMutation({
    mutationFn: ({ profile, status }: { profile: string; status: string }) => rpc("mark_bootcamp_attendance", { p_session: session.id, p_profile: profile, p_status: status }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: key }),
    onError: (e: any) => toast.error(e?.message || "Could not update"),
  });
  const statuses = [["present", "Present"], ["late", "Late"], ["absent", "Absent"], ["excused", "Excused"]];
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title="Attendance" description={`${session.title} · ${fmtDate(session.starts_at)}. Learners who join are marked automatically; adjust anyone here.`} icon={<ClipboardIcon />}>
      {roster.isLoading ? <Loader2 className="mx-auto my-6 h-5 w-5 animate-spin" /> : !(roster.data || []).length ? (
        <p className="py-6 text-center text-[14px] text-muted-foreground">No learners enrolled yet.</p>
      ) : (
        <div className="divide-y divide-border">
          {(roster.data || []).map((p: any) => (
            <div key={p.profile_id} className="py-2.5">
              <div className="flex items-center gap-2.5">
                <Avatar url={p.avatar_url} name={p.full_name || p.username} />
                <p className="min-w-0 flex-1 truncate text-[14px] font-semibold">{p.full_name || p.username}</p>
              </div>
              <div className="mt-2 grid grid-cols-4 gap-1">
                {statuses.map(([v, l]) => (
                  <button key={v} type="button" onClick={() => mark.mutate({ profile: p.profile_id, status: v })}
                    className={`h-8 rounded-full text-[12px] font-semibold ${p.status === v ? (v === "absent" ? "bg-foreground/80 text-background" : "bg-[#1a7f4b] text-white") : "bg-foreground/[0.05] text-foreground/70"}`}>{l}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}

function ClipboardIcon() { return <CheckCircle2 className="h-5 w-5" />; }
function Avatar({ url, name, size = 36 }: { url?: string | null; name?: string | null; size?: number }) {
  return url
    ? <img src={url} alt="" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
    : <span className="grid shrink-0 place-items-center rounded-full bg-foreground/[0.07] text-[13px] font-semibold text-muted-foreground" style={{ width: size, height: size }}>{(name || "?").charAt(0).toUpperCase()}</span>;
}

/* ───────────────────────── replays ───────────────────────── */

const youTubeId = (url: string) => url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/)?.[1] || null;

export function BootcampReplays({ bootcampId, canManage, isEnrolled }: { bootcampId: string; canManage: boolean; isEnrolled: boolean }) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [playing, setPlaying] = useState<{ title: string; src: string; embed?: boolean } | null>(null);
  const key = ["bootcamp-replays", bootcampId];
  const replays = useQuery({
    queryKey: key,
    enabled: isEnrolled || canManage,
    queryFn: async () => {
      const { data, error } = await supabase.from("bootcamp_replays" as never).select("*").eq("bootcamp_id", bootcampId).order("created_at", { ascending: false });
      if (error) throw error;
      const { data: { session } } = await supabase.auth.getSession();
      const { data: views } = await supabase.from("bootcamp_replay_views" as never).select("replay_id").eq("profile_id", session?.user.id || "");
      const seen = new Set(((views || []) as any[]).map((v) => v.replay_id));
      return ((data || []) as any[]).map((r) => ({ ...r, watched: seen.has(r.id) }));
    },
  });
  const remove = useMutation({
    mutationFn: async (r: any) => {
      await rpc("remove_bootcamp_item", { p_kind: "replay", p_id: r.id });
      if (r.storage_path) await supabase.storage.from("bootcamp-replays").remove([r.storage_path]);
    },
    onSuccess: () => { toast.success("Replay removed"); void queryClient.invalidateQueries({ queryKey: key }); },
    onError: (e: any) => toast.error(e?.message || "Could not remove"),
  });

  if (!isEnrolled && !canManage) return null;
  const open = async (r: any) => {
    try {
      let src = r.video_url as string | null;
      if (r.storage_path) {
        const { data, error } = await supabase.storage.from("bootcamp-replays").createSignedUrl(r.storage_path, 60 * 60 * 3);
        if (error) throw error;
        src = data.signedUrl;
      }
      if (!src) return;
      const yt = youTubeId(src);
      if (!r.storage_path && !yt && !/\.(mp4|webm|mov|m4v)(\?|$)/i.test(src)) window.open(src, "_blank", "noopener");
      else setPlaying({ title: r.title, src: yt ? `https://www.youtube-nocookie.com/embed/${yt}?autoplay=1` : src, embed: !!yt });
      if (isEnrolled && !r.watched) {
        const { data: { session } } = await supabase.auth.getSession();
        await supabase.from("bootcamp_replay_views" as never).insert({ replay_id: r.id, profile_id: session?.user.id } as never);
        void queryClient.invalidateQueries({ queryKey: key });
        void queryClient.invalidateQueries({ queryKey: ["bootcamp-progress", bootcampId] });
      }
    } catch (e: any) {
      toast.error(e?.message || "Could not open the replay");
    }
  };

  const list = replays.data || [];
  return (
    <section className={card}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-[18px] font-semibold"><PlayCircle className="h-5 w-5 text-[#cc208f]" /> Replays</h2>
        {canManage && <button type="button" onClick={() => setAdding(true)} className="inline-flex h-9 items-center gap-1 rounded-full bg-foreground px-3.5 text-[13px] font-semibold text-background"><Plus className="h-4 w-4" /> Add replay</button>}
      </div>
      <p className="mt-1 text-[13px] text-muted-foreground">Missed a class or need a refresher? Watch it again here.</p>
      {replays.isLoading ? <Loader2 className="mx-auto my-5 h-5 w-5 animate-spin text-muted-foreground" /> : list.length === 0 ? (
        <p className="py-3 text-[14px] text-muted-foreground">{canManage ? "Upload a recording or paste a video link after each class." : "Recordings appear here after each class."}</p>
      ) : (
        <div className="mt-2 divide-y divide-border">
          {list.map((r: any) => (
            <div key={r.id} className="flex items-center gap-3 py-2.5">
              <button type="button" onClick={() => void open(r)} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-foreground text-background"><PlayCircle className="h-5 w-5" /></button>
              <button type="button" onClick={() => void open(r)} className="min-w-0 flex-1 text-left">
                <p className="truncate text-[14.5px] font-semibold">{r.title}</p>
                <p className="text-[12.5px] text-muted-foreground">{fmtDate(r.created_at, false)}{r.watched ? " · Watched" : ""}</p>
              </button>
              {r.watched && <CheckCircle2 className="h-4 w-4 shrink-0 text-[#1a7f4b]" />}
              {canManage && <button type="button" aria-label="Remove replay" onClick={async () => (await confirmCard("Remove this replay?")) && remove.mutate(r)} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-foreground/[0.05]"><Trash2 className="h-4 w-4" /></button>}
            </div>
          ))}
        </div>
      )}
      {canManage && <AddReplaySheet open={adding} onOpenChange={setAdding} bootcampId={bootcampId} onSaved={() => void queryClient.invalidateQueries({ queryKey: key })} />}
      {playing && (
        <div className="fixed inset-0 z-[10150] flex flex-col bg-black/90 p-3 pt-[calc(env(safe-area-inset-top)+12px)]" onClick={() => setPlaying(null)}>
          <div className="flex items-center gap-2 text-white">
            <p className="min-w-0 flex-1 truncate text-[15px] font-semibold">{playing.title}</p>
            <button type="button" aria-label="Close" className="grid h-10 w-10 place-items-center rounded-full bg-white/10"><X className="h-5 w-5" /></button>
          </div>
          <div className="flex flex-1 items-center justify-center" onClick={(e) => e.stopPropagation()}>
            {playing.embed
              ? <iframe src={playing.src} title={playing.title} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen className="aspect-video w-full max-w-4xl rounded-xl" />
              : <video src={playing.src} controls autoPlay playsInline controlsList="nodownload" className="max-h-full w-full max-w-4xl rounded-xl" />}
          </div>
        </div>
      )}
    </section>
  );
}

function AddReplaySheet({ open, onOpenChange, bootcampId, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; bootcampId: string; onSaved: () => void }) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const save = useMutation({
    mutationFn: async () => {
      if (title.trim().length < 2) throw new Error("Give the replay a title");
      if (!file && !/^https?:\/\//i.test(url.trim())) throw new Error("Upload a video or paste a link that starts with https://");
      const { data: { session } } = await supabase.auth.getSession();
      let storage_path: string | null = null;
      if (file) {
        setProgress("Uploading…");
        const ext = (file.name.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "");
        storage_path = `${bootcampId}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from("bootcamp-replays").upload(storage_path, file, { contentType: file.type || "video/mp4", upsert: false });
        if (error) throw new Error(/size|large|payload/i.test(error.message) ? "That video is too large to upload. Upload it to YouTube (unlisted) or Google Drive and paste the link instead." : error.message);
      }
      const { error } = await supabase.from("bootcamp_replays" as never).insert({
        bootcamp_id: bootcampId, title: title.trim(), video_url: file ? null : url.trim(), storage_path, created_by: session?.user.id,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Replay added", { description: "Learners have been notified." }); setTitle(""); setUrl(""); setFile(null); onOpenChange(false); onSaved(); },
    onError: (e: any) => toast.error(e?.message || "Could not add the replay"),
    onSettled: () => setProgress(null),
  });
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Add a replay" description="Only enrolled learners can watch it. Uploads stay private to this bootcamp." icon={<UploadCloud className="h-5 w-5" />}>
      <div className="space-y-3">
        <div><span className={label}>Title</span><input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} placeholder="e.g. Week 2 — Databases" className={field} /></div>
        <input ref={input} type="file" accept="video/*" className="hidden" onChange={(e) => { setFile(e.target.files?.[0] || null); if (e.target.files?.[0]) setUrl(""); }} />
        <button type="button" onClick={() => input.current?.click()} className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-foreground/25 p-4 text-left">
          <UploadCloud className="h-6 w-6 shrink-0 text-[#cc208f]" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-semibold">{file ? file.name : "Upload a recording"}</span>
            <span className="block text-[12.5px] text-muted-foreground">{file ? `${(file.size / 1_048_576).toFixed(1)} MB` : "MP4 or WebM from your device"}</span>
          </span>
        </button>
        <p className="text-center text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">or</p>
        <div><span className={label}>Video link</span><input value={url} onChange={(e) => { setUrl(e.target.value); if (e.target.value) setFile(null); }} placeholder="YouTube (unlisted), Google Drive, Vimeo…" className={field} /></div>
        <button type="button" disabled={save.isPending} onClick={() => save.mutate()} className={`${primaryBtn} w-full`}>{save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} {progress || "Add replay"}</button>
      </div>
    </Sheet>
  );
}

/* ───────────────────────── learner progress + certificate ───────────────────────── */

export function linkedInCertificateUrl(cert: { code: string; bootcamp_title: string; issued_at: string }) {
  const d = new Date(cert.issued_at);
  const params = new URLSearchParams({
    startTask: "CERTIFICATION_NAME",
    name: cert.bootcamp_title,
    organizationName: "Zero Club",
    issueYear: String(d.getFullYear()),
    issueMonth: String(d.getMonth() + 1),
    certUrl: `${window.location.origin}/certificate/${cert.code}`,
    certId: cert.code,
  });
  return `https://www.linkedin.com/profile/add?${params.toString()}`;
}

export function BootcampProgressCard({ bootcampId, bootcampTitle }: { bootcampId: string; bootcampTitle: string }) {
  const progress = useQuery({ queryKey: ["bootcamp-progress", bootcampId], queryFn: () => rpc<any>("my_bootcamp_progress", { p_bootcamp: bootcampId }) });
  const p = progress.data;
  if (!p) return null;
  const pct = Number(p.percent || 0);
  return (
    <div className="mt-4 rounded-2xl border border-border p-3.5">
      <div className="flex items-center justify-between">
        <p className="text-[14px] font-semibold">Your progress</p>
        <p className="text-[14px] font-bold text-[#cc208f]">{pct}%</p>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-foreground/[0.07]"><div className="h-full rounded-full bg-[#cc208f] transition-all" style={{ width: `${pct}%` }} /></div>
      <p className="mt-2 text-[12.5px] text-muted-foreground">
        {p.sessions_past > 0 ? `${Math.min(p.attended, p.sessions_past)} of ${p.sessions_past} classes attended` : "No classes yet"}
        {p.replays > 0 ? ` · ${p.watched} of ${p.replays} replays watched` : ""}
      </p>
      {p.certificate_code && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
          <a href={`/certificate/${p.certificate_code}`} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground px-3.5 text-[13px] font-semibold text-background"><Award className="h-4 w-4" /> View certificate</a>
          <a href={linkedInCertificateUrl({ code: p.certificate_code, bootcamp_title: bootcampTitle, issued_at: p.certificate_issued_at })} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#0a66c2] px-3.5 text-[13px] font-semibold text-[#0a66c2]">Add to LinkedIn <ExternalLink className="h-3.5 w-3.5" /></a>
        </div>
      )}
    </div>
  );
}

export function CertificatesManager({ bootcamp }: { bootcamp: any }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [minAttendance, setMinAttendance] = useState("70");
  const key = ["bootcamp-learners-progress", bootcamp.id];
  const learners = useQuery({ queryKey: key, enabled: open, queryFn: () => rpc<any[]>("bootcamp_learners_progress", { p_bootcamp: bootcamp.id }) });
  const issue = useMutation({
    mutationFn: (profiles: string[] | null) => rpc<number>("issue_bootcamp_certificates", { p_bootcamp: bootcamp.id, p_profiles: profiles, p_min_attendance: Number(minAttendance) || 0 }),
    onSuccess: (n) => { toast.success(n ? `${n} certificate${n === 1 ? "" : "s"} issued` : "Everyone eligible already has a certificate"); void queryClient.invalidateQueries({ queryKey: key }); },
    onError: (e: any) => toast.error(e?.message || "Could not issue"),
  });
  if (bootcamp.certificate_enabled === false) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`${outlineBtn} mt-2 w-full`}><Award className="h-4 w-4" /> Learner progress & certificates</button>
      <Sheet open={open} onOpenChange={setOpen} title="Progress & certificates" description="Progress comes from classes attended and replays watched. Certificates get a public check link learners can add to LinkedIn." icon={<Award className="h-5 w-5" />}>
        <div className="flex items-end gap-2 rounded-2xl bg-foreground/[0.04] p-3">
          <div className="flex-1"><span className={label}>Minimum attendance</span>
            <CardSelect value={minAttendance} onChange={(e) => setMinAttendance(e.target.value)} className={field}>{[0, 50, 60, 70, 80, 90].map((n) => <option key={n} value={n}>{n === 0 ? "No minimum" : `${n}%`}</option>)}</CardSelect>
          </div>
          <button type="button" disabled={issue.isPending} onClick={() => issue.mutate(null)} className={primaryBtn}>{issue.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Issue to all eligible</button>
        </div>
        {learners.isLoading ? <Loader2 className="mx-auto my-6 h-5 w-5 animate-spin" /> : (
          <div className="mt-3 divide-y divide-border">
            {(learners.data || []).map((l: any) => (
              <div key={l.profile_id} className="flex items-center gap-2.5 py-2.5">
                <Avatar url={l.avatar_url} name={l.full_name || l.username} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold">{l.full_name || l.username}</p>
                  <p className="text-[12px] text-muted-foreground">{l.progress?.percent ?? 0}% · {l.progress?.attendance_rate != null ? `${l.progress.attendance_rate}% attendance` : "no classes yet"}</p>
                </div>
                {l.progress?.certificate_code ? (
                  <a href={`/certificate/${l.progress.certificate_code}`} className="inline-flex h-8 items-center gap-1 rounded-full bg-[#1a7f4b]/10 px-3 text-[12px] font-semibold text-[#1a7f4b]"><Check className="h-3.5 w-3.5" /> Issued</a>
                ) : (
                  <button type="button" disabled={issue.isPending} onClick={() => issue.mutate([l.profile_id])} className="h-8 rounded-full border border-foreground/30 px-3 text-[12px] font-semibold">Issue</button>
                )}
              </div>
            ))}
            {!(learners.data || []).length && <p className="py-6 text-center text-[14px] text-muted-foreground">No learners yet.</p>}
          </div>
        )}
      </Sheet>
    </>
  );
}

/* ───────────────────────── reviews ───────────────────────── */

function Stars({ value, size = 16, onPick }: { value: number; size?: number; onPick?: (n: number) => void }) {
  return (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" disabled={!onPick} onClick={() => onPick?.(n)} aria-label={`${n} star${n > 1 ? "s" : ""}`} className={onPick ? "" : "cursor-default"}>
          <Star className={n <= value ? "fill-[#f5a524] text-[#f5a524]" : "text-foreground/20"} style={{ width: size, height: size }} />
        </button>
      ))}
    </span>
  );
}

export function BootcampReviews({ bootcamp, isEnrolled, viewerId }: { bootcamp: any; isEnrolled: boolean; viewerId: string | null }) {
  const queryClient = useQueryClient();
  const key = ["bootcamp-reviews", bootcamp.id];
  const reviews = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase.from("bootcamp_reviews" as never).select("id, rating, body, created_at, profile_id, profiles:profile_id(username, full_name, avatar_url)").eq("bootcamp_id", bootcamp.id).order("created_at", { ascending: false }).limit(30);
      if (error) throw error;
      return (data || []) as any[];
    },
  });
  const mine = (reviews.data || []).find((r) => r.profile_id === viewerId);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [editing, setEditing] = useState(false);
  const save = useMutation({
    mutationFn: async () => {
      if (!rating) throw new Error("Pick a star rating");
      const row = { bootcamp_id: bootcamp.id, profile_id: viewerId, rating, body: body.trim() || null };
      const { error } = mine
        ? await supabase.from("bootcamp_reviews" as never).update({ rating, body: row.body } as never).eq("id", mine.id)
        : await supabase.from("bootcamp_reviews" as never).insert(row as never);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Thanks for your review"); setEditing(false); void queryClient.invalidateQueries({ queryKey: key }); void queryClient.invalidateQueries({ queryKey: ["bootcamp", bootcamp.id] }); },
    onError: (e: any) => toast.error(e?.message || "Could not save your review"),
  });
  const list = reviews.data || [];
  const avg = list.length ? list.reduce((s, r) => s + r.rating, 0) / list.length : 0;
  if (!list.length && !isEnrolled) return null;
  const showForm = isEnrolled && (!mine || editing);
  return (
    <section className={card}>
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-[18px] font-semibold">Learner reviews</h2>
        {list.length > 0 && <span className="flex items-center gap-1.5 text-[14px] font-semibold"><Stars value={Math.round(avg)} size={14} /> {avg.toFixed(1)} · {list.length}</span>}
      </div>
      {showForm && (
        <div className="mt-3 rounded-2xl bg-foreground/[0.04] p-3">
          <p className="text-[13.5px] font-semibold">{mine ? "Update your review" : "How is this bootcamp going?"}</p>
          <div className="mt-2"><Stars value={rating} size={26} onPick={setRating} /></div>
          <MentionField wrapperClassName="relative w-full" menuPlacement="bottom" value={body} onChange={(e) => setBody(e.target.value)} rows={2} maxLength={1200} placeholder="What did you like? What could be better?" className={`${area} mt-2`} />
          <button type="button" disabled={save.isPending} onClick={() => save.mutate()} className={`${primaryBtn} mt-2 h-10`}>{save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Post review</button>
        </div>
      )}
      <div className="mt-2 divide-y divide-border">
        {list.map((r) => (
          <div key={r.id} className="py-3">
            <div className="flex items-center gap-2.5">
              <Avatar url={r.profiles?.avatar_url} name={r.profiles?.full_name || r.profiles?.username} size={32} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold">{r.profiles?.full_name || r.profiles?.username || "Learner"}</p>
                <Stars value={r.rating} size={12} />
              </div>
              {r.profile_id === viewerId && !editing && <button type="button" onClick={() => { setEditing(true); setRating(r.rating); setBody(r.body || ""); }} className="text-[12.5px] font-semibold text-muted-foreground">Edit</button>}
            </div>
            {r.body && <p className="mt-1.5 whitespace-pre-line text-[14px] leading-relaxed text-foreground/85">{r.body}</p>}
          </div>
        ))}
        {!list.length && !showForm && <p className="py-3 text-[14px] text-muted-foreground">No reviews yet.</p>}
      </div>
    </section>
  );
}

/* ───────────────────────── group seats ───────────────────────── */

export function GroupSeatsButton({ bootcamp }: { bootcamp: any }) {
  const { format } = useWalletCurrency();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [seats, setSeats] = useState(String(Math.max(2, Number(bootcamp.group_min_seats || 3))));
  const [takeOne, setTakeOne] = useState(true);
  const [gift, setGift] = useState(false);
  const [done, setDone] = useState<any>(null);
  const n = Math.min(500, Math.max(2, Math.floor(Number(seats) || 2)));
  const unit = currentPrice(bootcamp);
  const disc = n >= Number(bootcamp.group_min_seats || 3) ? Number(bootcamp.group_discount_percent || 0) : 0;
  const total = Math.round(unit * n * (100 - disc) / 100);
  const buy = useMutation({
    mutationFn: () => rpc<any>("buy_bootcamp_seats", { p_bootcamp: bootcamp.id, p_seats: n, p_take_one: takeOne, p_apply_gift: gift }),
    onSuccess: (res) => {
      if (res?.status === "insufficient_funds") { toast.error(`Add ${format(Math.max(0, Number(res.shortfall) || 0))} to your wallet to buy these seats.`); return; }
      setDone(res);
      void queryClient.invalidateQueries({ queryKey: zeroGiftBalanceQueryKey("bootcamps") });
      void queryClient.invalidateQueries({ queryKey: ["my-seat-packs"] });
    },
    onError: (e: any) => toast.error(e?.message || "Could not buy seats"),
  });
  if (unit <= 0) return null;
  return (
    <>
      <button type="button" onClick={() => { setDone(null); setOpen(true); }} className="flex h-10 items-center justify-center gap-2 rounded-full text-[14px] font-semibold text-muted-foreground transition hover:bg-foreground/[0.04] hover:text-foreground">
        <Users className="h-4 w-4" /> Buy for a group{Number(bootcamp.group_discount_percent) > 0 ? ` · save ${bootcamp.group_discount_percent}%` : ""}
      </button>
      <Sheet open={open} onOpenChange={setOpen} title="Buy seats for your group" description={Number(bootcamp.group_discount_percent) > 0 ? `${bootcamp.group_discount_percent}% off when you buy ${bootcamp.group_min_seats} or more seats. You get a code to share, or assign seats by username.` : "Pay once for your team or friends. You get a code to share, or assign seats by username."} icon={<Users className="h-5 w-5" />}>
        {done ? (
          <div className="text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-[#1a7f4b]" />
            <p className="mt-3 font-display text-[18px] font-semibold">{done.seats} seats are yours</p>
            <p className="mt-1 text-[14px] text-muted-foreground">Share this code. Each person enters it on Bootcamps to take a seat.</p>
            <button type="button" onClick={() => { void navigator.clipboard.writeText(done.code); toast.success("Code copied"); }} className="mx-auto mt-4 flex h-12 items-center gap-2 rounded-2xl border-2 border-dashed border-[#cc208f]/50 px-5 font-mono text-[18px] font-bold tracking-wider">{done.code} <Copy className="h-4 w-4" /></button>
            <Link to="/app/bootcamps/requests" className={`${outlineBtn} mt-4`}>Manage your seats</Link>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setSeats(String(Math.max(2, n - 1)))} className="grid h-11 w-11 place-items-center rounded-full border border-border text-[20px]">−</button>
              <input value={seats} onChange={(e) => setSeats(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className={`${field} text-center text-[18px] font-bold`} />
              <button type="button" onClick={() => setSeats(String(Math.min(500, n + 1)))} className="grid h-11 w-11 place-items-center rounded-full border border-border text-[20px]">+</button>
            </div>
            <div className="rounded-2xl bg-foreground/[0.04] p-3 text-[14px]">
              <div className="flex justify-between"><span className="text-muted-foreground">{n} × {format(unit)}</span><span>{format(unit * n)}</span></div>
              {disc > 0 && <div className="mt-1 flex justify-between text-[#1a7f4b]"><span>Group discount ({disc}%)</span><span>−{format(unit * n - total)}</span></div>}
              <div className="mt-2 flex justify-between border-t border-border pt-2 text-[16px] font-bold"><span>Total</span><span>{format(total)}</span></div>
            </div>
            <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={takeOne} onChange={(e) => setTakeOne(e.target.checked)} className="h-5 w-5 accent-[#cc208f]" /> Keep one seat for me</label>
            <ZeroGiftPaymentOption service="bootcamps" bootcampId={bootcamp.id} amount={total} applied={gift} onAppliedChange={setGift} formatAmount={format} />
            <button type="button" disabled={buy.isPending} onClick={() => buy.mutate()} className={`${primaryBtn} w-full`}>{buy.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Pay {format(total)}</button>
          </div>
        )}
      </Sheet>
    </>
  );
}

export function ClaimSeatBox() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const claim = useMutation({
    mutationFn: () => rpc<any>("claim_bootcamp_seat", { p_code: code }),
    onSuccess: (res) => {
      toast.success(res?.status === "already_enrolled" ? "You're already in this bootcamp" : "Seat claimed — you're in!");
      if (res?.bootcamp_id) void navigate({ to: "/app/bootcamps/$id", params: { id: res.bootcamp_id } });
    },
    onError: (e: any) => toast.error(e?.message || "Could not use that code"),
  });
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (code.trim()) claim.mutate(); }} className="flex gap-2">
      <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="SEAT-XXXXXXXX" className={`${field} h-10 font-mono`} />
      <button type="submit" disabled={!code.trim() || claim.isPending} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-foreground px-4 text-[14px] font-semibold text-background disabled:opacity-50">{claim.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Use code</button>
    </form>
  );
}

export function MySeatPacks() {
  const queryClient = useQueryClient();
  const packs = useQuery({ queryKey: ["my-seat-packs"], queryFn: () => rpc<any[]>("my_bootcamp_seat_packs") });
  const [giveTo, setGiveTo] = useState<Record<string, string>>({});
  const give = useMutation({
    mutationFn: ({ pack, username }: { pack: string; username: string }) => rpc<any>("give_bootcamp_seat", { p_pack: pack, p_username: username }),
    onSuccess: (_r, v) => { toast.success("Seat given — they've been enrolled"); setGiveTo((g) => ({ ...g, [v.pack]: "" })); void queryClient.invalidateQueries({ queryKey: ["my-seat-packs"] }); },
    onError: (e: any) => toast.error(e?.message || "Could not give the seat"),
  });
  const list = packs.data || [];
  if (!list.length) return null;
  return (
    <section className="mt-6">
      <p className="px-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Group seats you bought</p>
      <div className="mt-2 space-y-3">
        {list.map((p) => {
          const used = (p.claims || []).length;
          return (
            <div key={p.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <Link to="/app/bootcamps/$id" params={{ id: p.bootcamp_id }} className="block truncate text-[15px] font-semibold hover:underline">{p.bootcamp_title}</Link>
                  <p className="text-[12.5px] text-muted-foreground">{used} of {p.seats} seats used</p>
                </div>
                <button type="button" onClick={() => { void navigator.clipboard.writeText(p.code); toast.success("Code copied"); }} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-dashed border-[#cc208f]/50 px-3 font-mono text-[12.5px] font-bold">{p.code} <Copy className="h-3.5 w-3.5" /></button>
              </div>
              {used > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {p.claims.map((c: any) => <span key={c.profile_id} className="inline-flex h-7 items-center gap-1.5 rounded-full bg-foreground/[0.05] pl-1 pr-2.5 text-[12.5px] font-semibold"><Avatar url={c.avatar_url} name={c.full_name || c.username} size={20} />{c.full_name || c.username}</span>)}
                </div>
              )}
              {used < p.seats && (
                <div className="mt-3 flex gap-2">
                  <UsernamePicker value={giveTo[p.id] || ""} onChange={(v) => setGiveTo((g) => ({ ...g, [p.id]: v }))} placeholder="Give a seat to @username" wrapperClassName="relative min-w-0 flex-1" className={`${field} h-10`} />
                  <button type="button" disabled={!giveTo[p.id]?.trim() || give.isPending} onClick={() => give.mutate({ pack: p.id, username: giveTo[p.id] })} className="h-10 shrink-0 rounded-full bg-foreground px-4 text-[13px] font-semibold text-background disabled:opacity-50">Give seat</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ───────────────────────── private bootcamp for teams ───────────────────────── */

export function PrivateBootcampButton({ bootcampId, ownerId, compact }: { bootcampId?: string | null; ownerId?: string | null; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [org, setOrg] = useState("");
  const [size, setSize] = useState("10");
  const [topic, setTopic] = useState("");
  const [start, setStart] = useState("");
  const [budget, setBudget] = useState("");
  const [message, setMessage] = useState("");
  const send = useMutation({
    mutationFn: () => rpc("submit_private_bootcamp_request", {
      p_bootcamp: bootcampId || null, p_owner: ownerId || null, p_organization: org, p_team_size: Math.max(2, Number(size) || 2),
      p_topic: topic, p_preferred_start: start || null, p_budget: budget || null, p_message: message || null,
    }),
    onSuccess: () => { toast.success("Request sent", { description: "You'll get a notification when they reply." }); setOpen(false); setOrg(""); setTopic(""); setMessage(""); },
    onError: (e: any) => toast.error(e?.message || "Could not send the request"),
  });
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={compact ? "flex h-10 items-center justify-center gap-2 rounded-full text-[14px] font-semibold text-muted-foreground transition hover:bg-foreground/[0.04] hover:text-foreground" : outlineBtn}>
        <Building2 className="h-4 w-4" /> Private bootcamp for your team
      </button>
      <Sheet open={open} onOpenChange={setOpen} title="Request a private bootcamp" description="A custom live programme for your company, school or community — your schedule, your goals." icon={<Building2 className="h-5 w-5" />}>
        <div className="space-y-3">
          <div><span className={label}>Organisation</span><input value={org} onChange={(e) => setOrg(e.target.value)} maxLength={140} placeholder="Company or school name" className={field} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><span className={label}>Team size</span><input value={size} onChange={(e) => setSize(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className={field} /></div>
            <div><span className={label}>Preferred start</span><input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={field} /></div>
          </div>
          <div><span className={label}>What should the team learn?</span><input value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={200} placeholder="e.g. Data analysis with Python" className={field} /></div>
          <div><span className={label}>Budget (optional)</span><input value={budget} onChange={(e) => setBudget(e.target.value)} maxLength={60} placeholder="e.g. ₦2,000,000" className={field} /></div>
          <div><span className={label}>Anything else (optional)</span><textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} maxLength={2000} className={area} /></div>
          <button type="button" disabled={send.isPending || org.trim().length < 2 || topic.trim().length < 2} onClick={() => send.mutate()} className={`${primaryBtn} w-full`}>{send.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Send request</button>
        </div>
      </Sheet>
    </>
  );
}

export function PrivateRequestsList() {
  const queryClient = useQueryClient();
  const requests = useQuery({ queryKey: ["private-bootcamp-requests"], queryFn: () => rpc<any[]>("my_private_bootcamp_requests") });
  const respond = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => rpc("respond_private_bootcamp_request", { p_request: id, p_status: status }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["private-bootcamp-requests"] }),
    onError: (e: any) => toast.error(e?.message || "Could not update"),
  });
  const list = requests.data || [];
  const statusTone: Record<string, string> = { new: "bg-[#cc208f]/12 text-[#a3186f]", contacted: "bg-foreground/[0.07] text-foreground/80", accepted: "bg-[#1a7f4b]/12 text-[#1a7f4b]", declined: "bg-foreground/[0.07] text-muted-foreground" };
  return (
    <section className="mt-6">
      <p className="px-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Private bootcamp requests</p>
      {requests.isLoading ? <Loader2 className="mx-auto my-6 h-5 w-5 animate-spin" /> : !list.length ? (
        <p className="mt-2 rounded-2xl border border-dashed border-border px-4 py-8 text-center text-[14px] text-muted-foreground">No requests yet.</p>
      ) : (
        <div className="mt-2 space-y-3">
          {list.map((r) => {
            const other = r.incoming ? r.requester : r.owner;
            return (
              <div key={r.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-start gap-3">
                  <Avatar url={other?.avatar_url} name={other?.full_name || other?.username || "Zero Club"} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold">{r.organization} · {r.team_size} people</p>
                    <p className="text-[12.5px] text-muted-foreground">{r.incoming ? `From ${other?.full_name || other?.username}` : `To ${other?.full_name || other?.username || "Zero Club"}`} · {fmtDate(r.created_at, false)}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-semibold capitalize ${statusTone[r.status] || ""}`}>{r.status}</span>
                </div>
                <p className="mt-2 text-[14px]"><span className="font-semibold">Topic:</span> {r.topic}{r.bootcamp_title ? ` (based on "${r.bootcamp_title}")` : ""}</p>
                {(r.preferred_start || r.budget) && <p className="mt-1 text-[13px] text-muted-foreground">{r.preferred_start ? `Start ${fmtDate(r.preferred_start, false)}` : ""}{r.preferred_start && r.budget ? " · " : ""}{r.budget ? `Budget ${r.budget}` : ""}</p>}
                {r.message && <p className="mt-2 whitespace-pre-line text-[13.5px] text-foreground/80">{r.message}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  {other?.id && <Link to="/app/chat/$id" params={{ id: other.id }} className="inline-flex h-9 items-center rounded-full bg-foreground px-4 text-[13px] font-semibold text-background">Message</Link>}
                  {r.incoming && r.status !== "accepted" && <button type="button" onClick={() => respond.mutate({ id: r.id, status: "accepted" })} className="h-9 rounded-full border border-[#1a7f4b]/50 px-4 text-[13px] font-semibold text-[#1a7f4b]">Accept</button>}
                  {r.incoming && r.status === "new" && <button type="button" onClick={() => respond.mutate({ id: r.id, status: "contacted" })} className="h-9 rounded-full border border-border px-4 text-[13px] font-semibold">Mark contacted</button>}
                  {r.incoming && r.status !== "declined" && r.status !== "accepted" && <button type="button" onClick={() => respond.mutate({ id: r.id, status: "declined" })} className="h-9 rounded-full px-3 text-[13px] font-semibold text-muted-foreground">Decline</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ───────────────────────── All-Access pass ───────────────────────── */

export function AllAccessPass({ ownerId, ownerName, bootcampId, isEnrolled, onEnrolled }: { ownerId: string; ownerName: string; bootcampId: string; isEnrolled: boolean; onEnrolled: () => void }) {
  const { format } = useWalletCurrency();
  const queryClient = useQueryClient();
  const [gift, setGift] = useState(false);
  const [open, setOpen] = useState(false);
  const key = ["bootcamp-pass", ownerId];
  const pass = useQuery({ queryKey: key, queryFn: () => rpc<any>("get_bootcamp_pass", { p_owner: ownerId }) });
  const buy = useMutation({
    mutationFn: () => rpc<any>("buy_bootcamp_pass", { p_pass: pass.data.id, p_apply_gift: gift }),
    onSuccess: async (res) => {
      if (res?.status === "insufficient_funds") { toast.error(`Add ${format(Math.max(0, Number(res.shortfall) || 0))} to your wallet to get the pass.`); return; }
      toast.success("All-Access pass active");
      await queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({ queryKey: zeroGiftBalanceQueryKey("bootcamps") });
      setOpen(false);
      if (!isEnrolled) enrol.mutate();
    },
    onError: (e: any) => toast.error(e?.message || "Could not buy the pass"),
  });
  const enrol = useMutation({
    mutationFn: () => rpc<any>("enroll_with_bootcamp_pass", { p_bootcamp: bootcampId }),
    onSuccess: () => { toast.success("Enrolled with your All-Access pass"); onEnrolled(); },
    onError: (e: any) => toast.error(e?.message || "Could not enrol"),
  });
  const p = pass.data;
  if (!p || !p.active) return null;
  const holds = !!p.my_expires_at;
  if (isEnrolled && holds) return null;
  return (
    <div className="mt-3 rounded-2xl border border-[#cc208f]/25 bg-[#cc208f]/[0.04] p-3.5">
      <div className="flex items-start gap-2.5">
        <TicketPercent className="mt-0.5 h-5 w-5 shrink-0 text-[#cc208f]" />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold">{p.title}</p>
          <p className="mt-0.5 text-[12.5px] leading-snug text-muted-foreground">
            {holds ? `Your pass covers every bootcamp from ${ownerName} until ${fmtDate(p.my_expires_at, false)}.` : `${format(Number(p.price))} for ${Math.round(p.duration_days / 30) >= 12 ? `${Math.round(p.duration_days / 365)} year` : `${Math.round(p.duration_days / 30)} months`} of every bootcamp from ${ownerName} (${p.bootcamps} now), plus new ones.`}
          </p>
        </div>
      </div>
      {holds ? (
        !isEnrolled && <button type="button" disabled={enrol.isPending} onClick={() => enrol.mutate()} className={`${primaryBtn} mt-3 h-10 w-full`}>{enrol.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Enrol with your pass</button>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className={`${outlineBtn} mt-3 h-10 w-full`}>Get the All-Access pass</button>
      )}
      <Sheet open={open} onOpenChange={setOpen} title={p.title} description={p.description || `Stack your skills: join any bootcamp from ${ownerName} at no extra cost while your pass is active.`} icon={<TicketPercent className="h-5 w-5" />}>
        <div className="space-y-3">
          <div className="rounded-2xl bg-foreground/[0.04] p-3 text-[14px]">
            <div className="flex justify-between"><span className="text-muted-foreground">Covers</span><span className="font-semibold">{p.bootcamps} bootcamps + new ones</span></div>
            <div className="mt-1 flex justify-between"><span className="text-muted-foreground">Valid for</span><span className="font-semibold">{p.duration_days} days</span></div>
            <div className="mt-2 flex justify-between border-t border-border pt-2 text-[16px] font-bold"><span>Price</span><span>{format(Number(p.price))}</span></div>
          </div>
          <ZeroGiftPaymentOption service="bootcamps" amount={Number(p.price)} applied={gift} onAppliedChange={setGift} formatAmount={format} />
          <button type="button" disabled={buy.isPending} onClick={() => buy.mutate()} className={`${primaryBtn} w-full`}>{buy.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Pay {format(Number(p.price))}</button>
        </div>
      </Sheet>
    </div>
  );
}

export function PassEditor({ ownerId }: { ownerId: string }) {
  const { format } = useWalletCurrency();
  const queryClient = useQueryClient();
  const key = ["bootcamp-pass", ownerId];
  const pass = useQuery({ queryKey: key, queryFn: () => rpc<any>("get_bootcamp_pass", { p_owner: ownerId }) });
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [days, setDays] = useState("365");
  const [description, setDescription] = useState("");
  const [active, setActive] = useState(true);
  const start = () => {
    const p = pass.data;
    setTitle(p?.title || "All-Access pass");
    setPrice(p ? String(Number(p.price)) : "");
    setDays(String(p?.duration_days || 365));
    setDescription(p?.description || "");
    setActive(p ? !!p.active : true);
    setOpen(true);
  };
  const save = useMutation({
    mutationFn: () => rpc("save_bootcamp_pass", { p_title: title, p_price: Math.max(0, Math.floor(Number(price) || 0)), p_duration_days: Number(days), p_description: description || null, p_active: active }),
    onSuccess: () => { toast.success("Pass saved"); setOpen(false); void queryClient.invalidateQueries({ queryKey: key }); },
    onError: (e: any) => toast.error(e?.message || "Could not save the pass"),
  });
  return (
    <>
      <button type="button" onClick={start} className={`${outlineBtn} mt-2 w-full`}>
        <TicketPercent className="h-4 w-4" /> {pass.data ? `All-Access pass · ${pass.data.active ? format(Number(pass.data.price)) : "off"}${pass.data.holders ? ` · ${pass.data.holders} holders` : ""}` : "Offer an All-Access pass"}
      </button>
      <Sheet open={open} onOpenChange={setOpen} title="All-Access pass" description="One price for every bootcamp you run, for a set time. Holders can join any of your bootcamps without paying again." icon={<TicketPercent className="h-5 w-5" />}>
        <div className="space-y-3">
          <div><span className={label}>Name</span><input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} className={field} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><span className={label}>Price</span><input value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className={field} /></div>
            <div><span className={label}>Valid for</span><CardSelect value={days} onChange={(e) => setDays(e.target.value)} className={field}>{[[30, "1 month"], [90, "3 months"], [180, "6 months"], [365, "1 year"], [730, "2 years"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</CardSelect></div>
          </div>
          <div><span className={label}>Description (optional)</span><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={area} /></div>
          <label className="flex items-center gap-2 text-[14px] font-semibold"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-5 w-5 accent-[#cc208f]" /> On sale</label>
          <button type="button" disabled={save.isPending || title.trim().length < 2 || !price} onClick={() => save.mutate()} className={`${primaryBtn} w-full`}>{save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Save pass</button>
        </div>
      </Sheet>
    </>
  );
}

/* ───────────────────────── catalogue helpers ───────────────────────── */

export function useNextCohortLabel(bootcamp: any) {
  return useMemo(() => {
    if (!bootcamp?.starts_at) return null;
    const d = new Date(bootcamp.starts_at);
    if (d <= new Date()) return null;
    return `Starts ${d.toLocaleDateString([], { day: "numeric", month: "short" })}`;
  }, [bootcamp?.starts_at]);
}
