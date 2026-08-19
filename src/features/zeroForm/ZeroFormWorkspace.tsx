import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BarChart3,
  Check,
  ClipboardList,
  Copy,
  Download,
  ExternalLink,
  Eye,
  Loader2,
  Mail,
  Phone,
  Plus,
  Search,
  Settings2,
  Share2,
  Trash2,
  Users,
  Wallet,
  X,
} from "@/components/icons/solar";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { formatWalletAmount } from "@/hooks/useWalletCurrency";
import {
  ZERO_FORM_TEMPLATES,
  ZERO_FORM_STATE_LABEL,
  ZERO_FORM_FIELD_TYPES,
  ZERO_FORM_UPLOAD_BUCKET,
  earlyBirdSaving,
  formatAnswer,
  formatFileSize,
  getTemplate,
  isChoiceField,
  isUploadAnswer,
  zeroFormUrl,
  type ZeroFormField,
  type ZeroFormFieldType,
  type ZeroFormUploadAnswer,
} from "@/features/zeroForm/templates";

const money = (value: number) => formatWalletAmount(Number(value) || 0);
const isMissingRpc = (error: any) =>
  error?.code === "PGRST202" || /Could not find the function|does not exist/i.test(error?.message || "");

const toLocalInput = (iso?: string | null) => (iso ? new Date(iso).toISOString().slice(0, 16) : "");

/** Someone who paid (or is on a free bootcamp they completed). */
const isPaidRow = (row: any) =>
  row.payment_status === "paid" ||
  (row.intent !== "interest" && ["confirmed", "enrolled"].includes(row.registration_status));

/** Someone who asked to be remembered but has not paid. */
const isInterestRow = (row: any) => !isPaidRow(row);

/** Download the visible registrations so the tutor can work offline. */
function exportCsv(rows: any[], bootcampTitle?: string) {
  const extraKeys = Array.from(
    new Set(rows.flatMap((row) => Object.keys(row.registration_data || {}))),
  );
  const header = ["Name", "Email", "Phone", "Type", "Status", "Amount", "Registered", ...extraKeys];

  const escape = (value: unknown) => {
    // formatAnswer turns a checkbox array into "Design, Marketing" rather than
    // String(array) giving "Design,Marketing" with no space, or a raw JSON
    // array. The quoting below then protects the commas inside the cell.
    const text = formatAnswer(value);
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };

  const lines = rows.map((row) => {
    const data = row.registration_data || {};
    return [
      row.full_name || row.guest_name || row.username || "",
      row.guest_email || data.email || "",
      row.guest_phone || data.phone || "",
      isInterestRow(row) ? "Interested" : "Paid",
      row.registration_status || "",
      row.amount || 0,
      row.registered_at ? new Date(row.registered_at).toISOString() : "",
      ...extraKeys.map((key) => data[key] ?? ""),
    ].map(escape).join(",");
  });

  const csv = [header.map(escape).join(","), ...lines].join("\n");
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${(bootcampTitle || "zero-form").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-registrations.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Zero Forms workspace, shared by the Tutor Studio and the Institution Digital Hub.
 * Both roles get identical capability; only the surrounding chrome differs.
 */
export function ZeroFormWorkspace({ ownerLabel = "Tutor Studio" }: { ownerLabel?: string }) {
  const queryClient = useQueryClient();
  const [openFormId, setOpenFormId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const forms = useQuery({
    queryKey: ["zero-forms"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_zero_forms");
      if (error) throw error;
      return (data || []) as any[];
    },
    retry: false,
  });

  if (forms.isLoading) return <Centered><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></Centered>;

  if (forms.error) {
    if (isMissingRpc(forms.error)) return <SetupNotice />;
    return <Empty title="Zero Forms could not load" detail={(forms.error as any).message} />;
  }

  if (openFormId) {
    return <ZeroFormDetail formId={openFormId} onBack={() => setOpenFormId(null)} />;
  }

  if (creating) {
    return (
      <ZeroFormBuilder
        onCancel={() => setCreating(false)}
        onSaved={(id) => {
          setCreating(false);
          queryClient.invalidateQueries({ queryKey: ["zero-forms"] });
          setOpenFormId(id);
        }}
      />
    );
  }

  const list = forms.data || [];

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">{ownerLabel}</p>
          <h2 className="mt-1 font-display text-[22px] font-semibold tracking-tight">Zero Forms</h2>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Collect registrations and early-bird payments before your bootcamp starts.
          </p>
        </div>
        <button onClick={() => setCreating(true)} className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-5 text-[13px] font-semibold text-primary-foreground">
          <Plus className="h-4 w-4" /> New Zero Form
        </button>
      </div>

      {list.length === 0 ? (
        <Empty
          title="No Zero Forms yet"
          detail="Create one for an upcoming bootcamp to start collecting learners before day one."
          action={
            <button onClick={() => setCreating(true)} className="inline-flex h-11 items-center gap-2 rounded-lg bg-foreground px-5 text-[13px] font-semibold text-background">
              <Plus className="h-4 w-4" /> Create a Zero Form
            </button>
          }
        />
      ) : (
        <div className="grid gap-3">
          {list.map((form) => (
            <article key={form.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold">{form.bootcamp_title}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {form.category || "Bootcamp"}
                    {form.starts_at && ` · starts ${new Date(form.starts_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}
                  </p>
                </div>
                <StateBadge state={form.state} />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-4">
                <Stat label="Registrations" value={form.total_registrations} />
                <Stat label="Paid" value={form.confirmed_registrations} />
                <Stat label="Interested" value={form.interested_registrations ?? 0} />
                <Stat label="Revenue" value={money(form.revenue)} isText />
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                <button onClick={() => setOpenFormId(form.id)} className="rounded-lg bg-foreground px-4 py-2 text-[11.5px] font-semibold text-background">
                  Manage
                </button>
                <ShareButtons slug={form.slug} status={form.status} state={form.state} bootcampId={form.bootcamp_id} />
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Builder ─────────────────────────────────────────────────────────────── */

function ZeroFormBuilder({ onCancel, onSaved, existing }: { onCancel: () => void; onSaved: (id: string) => void; existing?: any }) {
  const [bootcampId, setBootcampId] = useState<string>(existing?.form?.bootcamp_id || "");
  const [templateId, setTemplateId] = useState(existing?.form?.template_id || "standard");
  const [fields, setFields] = useState<ZeroFormField[]>(existing?.fields || getTemplate("standard").fields);
  const [title, setTitle] = useState(existing?.form?.title || "");
  const [description, setDescription] = useState(existing?.form?.description || "");
  const [regular, setRegular] = useState(String(existing?.form?.regular_price ?? ""));
  const [early, setEarly] = useState(String(existing?.form?.early_bird_price ?? ""));
  const [startsAt, setStartsAt] = useState(toLocalInput(existing?.bootcamp?.starts_at));
  const [deadline, setDeadline] = useState(toLocalInput(existing?.form?.registration_deadline));
  const [seatLimit, setSeatLimit] = useState(String(existing?.form?.seat_limit ?? ""));

  const bootcamps = useQuery({
    queryKey: ["my-bootcamps-for-zero-form"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return [];
      const { data, error } = await supabase
        .from("bootcamps")
        .select("id, title, price, category, starts_at, banner_url")
        .eq("creator_id", session.user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !existing,
  });

  // Selecting a bootcamp seeds the pricing and title from it.
  useEffect(() => {
    if (existing || !bootcampId) return;
    const picked = (bootcamps.data || []).find((b: any) => b.id === bootcampId);
    if (!picked) return;
    setTitle((current) => current || `${picked.title} — early registration`);
    setRegular((current) => current || String(picked.price ?? ""));
    if (picked.starts_at) setStartsAt((current) => current || toLocalInput(picked.starts_at));
  }, [bootcampId, bootcamps.data, existing]);

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    setFields(getTemplate(id).fields);
  };

  const save = useMutation({
    mutationFn: async (status: "draft" | "published") => {
      const { data, error } = await supabase.rpc("save_zero_form", {
        payload: {
          bootcamp_id: bootcampId,
          template_id: templateId,
          title,
          description,
          regular_price: Number(regular) || 0,
          early_bird_price: Number(early) || 0,
          starts_at: startsAt ? new Date(startsAt).toISOString() : null,
          registration_deadline: deadline ? new Date(deadline).toISOString() : null,
          seat_limit: seatLimit || null,
          status,
          fields: fields.map((f, index) => ({ ...f, position: index })),
        },
      });
      if (error) throw error;
      return data as any;
    },
    onSuccess: (data, status) => {
      toast.success(status === "published" ? "Zero Form published" : "Draft saved");
      onSaved(data?.form?.id);
    },
    onError: (error: any) => toast.error(error.message || "Could not save this Zero Form"),
  });

  const saving = earlyBirdSaving(Number(regular), Number(early));
  const input = "h-11 w-full rounded-lg border border-border bg-background px-3 text-[13px] outline-none focus:border-primary/50";
  const label = "text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground";

  return (
    <div>
      <button onClick={onCancel} className="mb-4 inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Zero Forms
      </button>

      <h2 className="font-display text-[22px] font-semibold tracking-tight">
        {existing ? "Edit Zero Form" : "New Zero Form"}
      </h2>
      <p className="mt-1 text-[12px] text-muted-foreground">
        Every Zero Form belongs to one bootcamp and inherits its details.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          {!existing && (
            <Section title="Bootcamp" detail="Which bootcamp is this form collecting learners for?">
              {bootcamps.isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (bootcamps.data || []).length === 0 ? (
                <p className="text-[12px] text-muted-foreground">
                  You have no bootcamps yet. Create one first, then come back to build its Zero Form.
                </p>
              ) : (
                <select value={bootcampId} onChange={(e) => setBootcampId(e.target.value)} className={input}>
                  <option value="">Select a bootcamp</option>
                  {(bootcamps.data || []).map((b: any) => <option key={b.id} value={b.id}>{b.title}</option>)}
                </select>
              )}
            </Section>
          )}

          <Section title="Template" detail="Start from a ready-made set of questions.">
            <div className="grid gap-2 sm:grid-cols-2">
              {ZERO_FORM_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => applyTemplate(template.id)}
                  className={`rounded-lg border p-3.5 text-left transition ${templateId === template.id ? "border-primary bg-primary/[0.05]" : "border-border hover:bg-muted/60"}`}
                >
                  <p className="text-[12.5px] font-semibold">{template.name}</p>
                  <p className="mt-1 text-[10.5px] leading-4 text-muted-foreground">{template.description}</p>
                </button>
              ))}
            </div>
          </Section>

          <Section title="Questions" detail="Keep it short — long forms lose registrations.">
            <div className="space-y-2">
              {fields.map((field, index) => {
                const updateField = (patch: Partial<typeof field>) =>
                  setFields((current) => current.map((f, i) => (i === index ? { ...f, ...patch } : f)));

                const options: string[] = Array.isArray(field.options) ? field.options : [];

                return (
                  <div key={field.field_key} className="rounded-lg border border-border bg-background p-2.5">
                    <div className="flex items-center gap-2">
                      <input
                        value={field.label}
                        onChange={(e) => updateField({ label: e.target.value })}
                        className="min-w-0 flex-1 bg-transparent text-[12.5px] font-semibold outline-none"
                      />
                      <label className="flex shrink-0 items-center gap-1.5 text-[10.5px] text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={field.required}
                          onChange={(e) => updateField({ required: e.target.checked })}
                          className="h-3.5 w-3.5"
                        />
                        Required
                      </label>
                      <button
                        onClick={() => setFields((current) => current.filter((_, i) => i !== index))}
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <select
                        value={field.field_type}
                        onChange={(e) => {
                          const nextType = e.target.value as ZeroFormFieldType;
                          // Seed two blank options when switching to a choice
                          // type, so the builder has something to type into
                          // rather than an empty area with no affordance.
                          const needsOptions = isChoiceField(nextType) && options.length === 0;
                          updateField({
                            field_type: nextType,
                            options: needsOptions ? ["", ""] : field.options,
                          });
                        }}
                        className="h-8 rounded-lg border border-border bg-background px-2 text-[11px] font-semibold outline-none"
                      >
                        {ZERO_FORM_FIELD_TYPES.map((type) => (
                          <option key={type.value} value={type.value}>{type.label}</option>
                        ))}
                      </select>
                      <p className="text-[10px] text-muted-foreground">
                        {ZERO_FORM_FIELD_TYPES.find((t) => t.value === field.field_type)?.hint}
                      </p>
                    </div>

                    {isChoiceField(field.field_type) && (
                      <div className="mt-2 space-y-1.5 border-t border-border/60 pt-2">
                        {options.map((option, optionIndex) => (
                          <div key={optionIndex} className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground">{optionIndex + 1}.</span>
                            <input
                              value={option}
                              placeholder="Option text"
                              onChange={(e) =>
                                updateField({
                                  options: options.map((o, i) => (i === optionIndex ? e.target.value : o)),
                                })
                              }
                              className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-[11.5px] outline-none"
                            />
                            <button
                              onClick={() =>
                                updateField({ options: options.filter((_, i) => i !== optionIndex) })
                              }
                              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted-foreground hover:text-destructive"
                              aria-label="Remove option"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => updateField({ options: [...options, ""] })}
                          className="inline-flex items-center gap-1 rounded-lg px-1 py-1 text-[10.5px] font-semibold text-muted-foreground hover:text-foreground"
                        >
                          <Plus className="h-3 w-3" /> Add option
                        </button>
                        {options.filter((o) => o.trim()).length < 2 && (
                          <p className="text-[10px] text-amber-600">
                            Add at least two options so people have a choice.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <button
              onClick={() => setFields((current) => [...current, {
                field_key: `question_${current.length + 1}_${Date.now().toString(36)}`,
                field_type: "text", label: "New question", required: false, position: current.length,
              }])}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[11.5px] font-semibold hover:bg-muted"
            >
              <Plus className="h-3.5 w-3.5" /> Add question
            </button>
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="Form details">
            <div className="space-y-3">
              <div><p className={label}>Title</p><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Frontend Bootcamp — early registration" className={`${input} mt-1.5`} /></div>
              <div><p className={label}>Description</p><textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className={`${input} h-auto resize-none py-2.5 mt-1.5`} /></div>
            </div>
          </Section>

          <Section title="Pricing and dates">
            <div className="space-y-3">
              <div><p className={label}>Regular price</p><input type="number" value={regular} onChange={(e) => setRegular(e.target.value)} placeholder="20000" className={`${input} mt-1.5`} /></div>
              <div>
                <p className={label}>Early-bird price</p>
                <input type="number" value={early} onChange={(e) => setEarly(e.target.value)} placeholder="15000" className={`${input} mt-1.5`} />
                {saving > 0 && <p className="mt-1.5 text-[10.5px] font-semibold text-primary">Learners save {saving}%</p>}
                {Number(early) > Number(regular) && <p className="mt-1.5 text-[10.5px] font-semibold text-destructive">Early-bird cannot exceed the regular price</p>}
              </div>
              <div><p className={label}>Bootcamp starts</p><input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={`${input} mt-1.5`} /></div>
              <div>
                <p className={label}>Registration deadline</p>
                <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={`${input} mt-1.5`} />
                {deadline && startsAt && new Date(deadline) > new Date(startsAt) && (
                  <p className="mt-1.5 text-[10.5px] font-semibold text-destructive">The deadline must be before the bootcamp starts</p>
                )}
              </div>
              <div><p className={label}>Seat limit (optional)</p><input type="number" value={seatLimit} onChange={(e) => setSeatLimit(e.target.value)} placeholder="100" className={`${input} mt-1.5`} /></div>
            </div>
          </Section>

          <div className="space-y-2">
            <button
              onClick={() => save.mutate("published")}
              disabled={save.isPending || (!existing && !bootcampId) || !startsAt}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary text-[13px] font-semibold text-primary-foreground disabled:opacity-50"
            >
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Publish Zero Form
            </button>
            <button
              onClick={() => save.mutate("draft")}
              disabled={save.isPending || (!existing && !bootcampId) || !startsAt}
              className="h-11 w-full rounded-lg border border-border text-[12.5px] font-semibold disabled:opacity-50"
            >
              Save as draft
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Detail ──────────────────────────────────────────────────────────────── */

function ZeroFormDetail({ formId, onBack }: { formId: string; onBack: () => void }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"overview" | "responses" | "payments" | "settings">("overview");
  const [search, setSearch] = useState("");
  const [audience, setAudience] = useState<"all" | "paid" | "interest">("all");

  const detail = useQuery({
    queryKey: ["zero-form-detail", formId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_zero_form_detail", { target_form_id: formId });
      if (error) throw error;
      return data as any;
    },
    retry: false,
  });

  if (detail.isLoading) return <Centered><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></Centered>;
  if (detail.error) return <Empty title="Could not load this Zero Form" detail={(detail.error as any).message} />;

  const { form, bootcamp, metrics, registrations = [], state, seats_taken } = detail.data || {};

  const rows = (registrations as any[]).filter((row) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const haystack = [
      JSON.stringify(row.registration_data || {}),
      row.full_name, row.username, row.guest_name, row.guest_email, row.guest_phone,
    ].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(q);
  });

  const visibleRows = rows.filter((row) =>
    audience === "all" ? true : audience === "paid" ? isPaidRow(row) : isInterestRow(row),
  );

  if (tab === "settings") {
    return (
      <ZeroFormBuilder
        existing={detail.data}
        onCancel={() => setTab("overview")}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ["zero-form-detail", formId] });
          queryClient.invalidateQueries({ queryKey: ["zero-forms"] });
          setTab("overview");
        }}
      />
    );
  }

  return (
    <div>
      <button onClick={onBack} className="mb-4 inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> All Zero Forms
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-[22px] font-semibold tracking-tight">{bootcamp?.title}</h2>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {form?.title}
            {bootcamp?.starts_at && ` · starts ${new Date(bootcamp.starts_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`}
          </p>
        </div>
        <StateBadge state={state} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <ShareButtons slug={form?.slug} status={form?.status} state={state} bootcampId={bootcamp?.id} />
      </div>

      <div className="mt-6 flex gap-1 border-b border-border">
        {(["overview", "responses", "payments", "settings"] as const).map((key) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`relative h-10 px-3 text-[12px] font-semibold capitalize ${tab === key ? "text-foreground" : "text-muted-foreground"}`}
          >
            {key}
            {tab === key && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" />}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === "overview" && (
          <div>
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <MetricCard Icon={Users} label="Registrations" value={metrics?.total ?? 0} detail={`${metrics?.confirmed ?? 0} paid · ${metrics?.interested ?? 0} interested`} />
              <MetricCard Icon={Wallet} label="Revenue" value={money(metrics?.revenue)} detail={`${metrics?.pending_payments ?? 0} awaiting payment`} isText />
              <MetricCard Icon={Eye} label="Form views" value={metrics?.views ?? 0} detail={`${metrics?.conversion ?? 0}% conversion`} />
              <MetricCard
                Icon={ClipboardList}
                label="Seats"
                value={form?.seat_limit ? `${seats_taken}/${form.seat_limit}` : String(seats_taken ?? 0)}
                detail={form?.seat_limit ? `${Math.max(0, form.seat_limit - (seats_taken || 0))} left` : "No seat limit"}
                isText
              />
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <InfoCard title="Early-bird price" value={money(form?.early_bird_price)} sub={`Regular ${money(form?.regular_price)}`} />
              <InfoCard
                title="Registration deadline"
                value={form?.registration_deadline ? new Date(form.registration_deadline).toLocaleDateString(undefined, { month: "long", day: "numeric" }) : "No deadline"}
                sub={bootcamp?.starts_at ? `Bootcamp starts ${new Date(bootcamp.starts_at).toLocaleDateString(undefined, { month: "long", day: "numeric" })}` : ""}
              />
            </div>
          </div>
        )}

        {tab === "responses" && (
          <div>
            {/* Split by what the person actually did: paid, or asked to be
                remembered. Both groups keep their full contact details. */}
            <div className="mb-3 flex flex-wrap gap-1.5">
              {([
                ["all", "Everyone", rows.length],
                ["paid", "Paid", rows.filter(isPaidRow).length],
                ["interest", "Interested", rows.filter(isInterestRow).length],
              ] as const).map(([key, label, count]) => (
                <button
                  key={key}
                  onClick={() => setAudience(key as any)}
                  className={`h-9 rounded-lg border px-3 text-[11.5px] font-semibold transition ${audience === key ? "border-foreground bg-foreground text-background" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}
                >
                  {label} <span className="tabular-nums opacity-70">{count}</span>
                </button>
              ))}
              <button
                onClick={() => exportCsv(visibleRows, bootcamp?.title)}
                disabled={visibleRows.length === 0}
                className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[11.5px] font-semibold hover:bg-muted disabled:opacity-40"
              >
                <Download className="h-3.5 w-3.5" /> Export CSV
              </button>
            </div>

            <label className="mb-3 flex h-10 items-center rounded-lg border border-border bg-card">
              <Search className="ml-3 h-4 w-4 text-muted-foreground" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, email or answer" className="flex-1 bg-transparent px-3 text-[12px] outline-none" />
            </label>

            {visibleRows.length === 0 ? (
              <Empty
                title={audience === "interest" ? "Nobody has registered interest yet" : audience === "paid" ? "No paid registrations yet" : "No responses yet"}
                detail="Share your Zero Form link to start collecting registrations."
              />
            ) : (
              <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
                {visibleRows.map((row) => {
                  const name = row.full_name || row.guest_name || row.username || "Learner";
                  const email = row.guest_email || (row.registration_data || {}).email;
                  const phone = row.guest_phone || (row.registration_data || {}).phone;
                  const interest = isInterestRow(row);
                  return (
                    <div key={row.id} className="p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold">{name}</p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {row.user_id ? `@${row.username}` : "Guest"}
                            {row.amount > 0 && ` · ${money(row.amount)}`}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <span className={`rounded-full px-2 py-0.5 text-[9.5px] font-semibold ${interest ? "bg-primary/10 text-primary" : "bg-emerald-500/10 text-emerald-600"}`}>
                            {interest ? "Interested" : "Paid"}
                          </span>
                          <StatusPill status={row.registration_status} />
                        </div>
                      </div>

                      {/* Contact details first — this is what the tutor needs. */}
                      {(email || phone) && (
                        <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1">
                          {email && (
                            <a href={`mailto:${email}`} className="flex items-center gap-1.5 text-[11.5px] font-medium text-foreground hover:text-primary">
                              <Mail className="h-3.5 w-3.5 text-muted-foreground" /> {String(email)}
                            </a>
                          )}
                          {phone && (
                            <a href={`tel:${phone}`} className="flex items-center gap-1.5 text-[11.5px] font-medium text-foreground hover:text-primary">
                              <Phone className="h-3.5 w-3.5 text-muted-foreground" /> {String(phone)}
                            </a>
                          )}
                        </div>
                      )}

                      {Object.keys(row.registration_data || {}).length > 0 && (
                        <div className="mt-2.5 grid gap-x-6 gap-y-1 border-t border-border pt-2.5 sm:grid-cols-2">
                          {Object.entries(row.registration_data || {}).map(([key, value]) => (
                            <p key={key} className="text-[11px] text-muted-foreground">
                              <span className="capitalize">{key.replaceAll("_", " ")}:</span>{" "}
                              {isUploadAnswer(value)
                                ? <AttachmentLink answer={value} />
                                : <span className="text-foreground">{formatAnswer(value)}</span>}
                            </p>
                          ))}
                        </div>
                      )}

                      <p className="mt-2.5 text-[10px] text-muted-foreground">
                        {interest ? "Registered interest" : "Paid"} {new Date(row.registered_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === "payments" && (
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
            {(registrations as any[]).length === 0 ? (
              <Empty title="No payments yet" detail="Payments appear here as learners complete registration." />
            ) : (
              (registrations as any[]).map((row) => (
                <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate text-[12.5px] font-semibold">{row.full_name || row.username || "Learner"}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {row.payment_reference ? `Ref ${row.payment_reference.slice(0, 18)}…` : "No reference"}
                      {row.confirmed_at && ` · ${new Date(row.confirmed_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[12.5px] font-semibold tabular-nums">{money(row.amount)}</span>
                    <StatusPill status={row.payment_status} />
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Shared pieces ───────────────────────────────────────────────────────── */

/**
 * Sharing is state aware (spec section 20): before the bootcamp starts the
 * primary action is the Zero Form link; once it is live it becomes the
 * bootcamp link. The creator never switches this manually.
 */
function ShareButtons({ slug, status, state, bootcampId }: { slug?: string; status?: string; state?: string; bootcampId?: string }) {
  const live = state === "bootcamp_started";
  const url = live
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/app/bootcamps/${bootcampId}`
    : zeroFormUrl(slug || "");
  const shareLabel = live ? "Share bootcamp" : "Share Zero Form";

  const copy = async () => {
    await navigator.clipboard.writeText(url);
    toast.success(live ? "Bootcamp link copied" : "Zero Form link copied");
  };

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: shareLabel, url });
        return;
      } catch { /* user dismissed */ }
    }
    copy();
  };

  if (status === "draft" && !live) {
    return <span className="rounded-lg bg-muted px-3 py-2 text-[11px] font-medium text-muted-foreground">Publish to get a shareable link</span>;
  }

  return (
    <>
      <button onClick={share} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[11.5px] font-semibold hover:bg-muted">
        <Share2 className="h-3.5 w-3.5" /> {shareLabel}
      </button>
      <button onClick={copy} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[11.5px] font-semibold hover:bg-muted">
        <Copy className="h-3.5 w-3.5" /> Copy link
      </button>
      {!live && slug && (
        <a href={`/form/${slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[11.5px] font-semibold hover:bg-muted">
          <ExternalLink className="h-3.5 w-3.5" /> Preview
        </a>
      )}
    </>
  );
}

/**
 * Opens a registrant's attachment.
 *
 * The bucket is private, so there is no permanent URL to link to. A signed URL
 * is minted only when the tutor actually clicks, and expires after a minute -
 * long enough to open, short enough that a copied link is not a lasting leak.
 * Generating links up front for every row would also mean one request per
 * attachment on page load, most of which nobody opens.
 */
function AttachmentLink({ answer }: { answer: ZeroFormUploadAnswer }) {
  const [opening, setOpening] = useState(false);

  const open = async () => {
    setOpening(true);
    try {
      const { data, error } = await supabase.storage
        .from(ZERO_FORM_UPLOAD_BUCKET)
        .createSignedUrl(answer.path, 60);

      if (error) throw error;
      if (!data?.signedUrl) throw new Error("No link was returned.");
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      toast.error(err?.message || "Could not open that file.");
    } finally {
      setOpening(false);
    }
  };

  return (
    <button
      onClick={open}
      disabled={opening}
      className="inline-flex max-w-full items-center gap-1 text-left text-primary underline-offset-2 hover:underline disabled:opacity-60"
    >
      {opening ? <Loader2 className="h-3 w-3 shrink-0 animate-spin" /> : <Download className="h-3 w-3 shrink-0" />}
      <span className="truncate">{answer.name}</span>
      {answer.size > 0 && <span className="shrink-0 text-muted-foreground">({formatFileSize(answer.size)})</span>}
    </button>
  );
}

function StateBadge({ state }: { state?: string }) {
  const tone = state === "open" ? "bg-emerald-500/10 text-emerald-600"
    : state === "draft" ? "bg-muted text-muted-foreground"
    : state === "bootcamp_started" ? "bg-primary/10 text-primary"
    : "bg-amber-500/10 text-amber-600";
  return <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${tone}`}>{ZERO_FORM_STATE_LABEL[state || ""] || "Unknown"}</span>;
}

function StatusPill({ status }: { status?: string }) {
  const good = ["confirmed", "enrolled", "paid", "not_required"].includes(status || "");
  const warn = ["pending", "payment_pending"].includes(status || "");
  const tone = good ? "bg-emerald-500/10 text-emerald-600" : warn ? "bg-amber-500/10 text-amber-600" : "bg-rose-500/10 text-rose-600";
  return <span className={`rounded-full px-2 py-0.5 text-[9.5px] font-semibold capitalize ${tone}`}>{(status || "unknown").replaceAll("_", " ")}</span>;
}

function Section({ title, detail, children }: { title: string; detail?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-[13px] font-semibold">{title}</h3>
      {detail && <p className="mt-0.5 text-[11px] text-muted-foreground">{detail}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Stat({ label, value, isText }: { label: string; value: any; isText?: boolean }) {
  return (
    <div>
      <p className={`text-[16px] font-semibold ${isText ? "" : "tabular-nums"}`}>{value ?? 0}</p>
      <p className="mt-0.5 text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

function MetricCard({ Icon, label, value, detail, isText }: any) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4" /></div>
      <p className={`mt-4 text-[20px] font-semibold tracking-tight ${isText ? "" : "tabular-nums"}`}>{value}</p>
      <p className="mt-1 text-[10px] font-semibold">{label}</p>
      <p className="mt-0.5 text-[9.5px] text-muted-foreground">{detail}</p>
    </div>
  );
}

function InfoCard({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{title}</p>
      <p className="mt-2 text-[18px] font-semibold tracking-tight">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-[280px] items-center justify-center">{children}</div>;
}

function Empty({ title, detail, action }: { title: string; detail?: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card px-5 py-14 text-center">
      <ClipboardList className="mx-auto h-6 w-6 text-muted-foreground" />
      <h3 className="mt-3 text-[14px] font-semibold">{title}</h3>
      {detail && <p className="mx-auto mt-1 max-w-sm text-[11.5px] leading-5 text-muted-foreground">{detail}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

function SetupNotice() {
  return (
    <div className="rounded-lg border border-border bg-card px-5 py-14 text-center">
      <Settings2 className="mx-auto h-6 w-6 text-muted-foreground" />
      <h3 className="mt-3 text-[14px] font-semibold">Zero Form setup required</h3>
      <p className="mx-auto mt-1 max-w-sm text-[11.5px] leading-5 text-muted-foreground">
        Run the migration below in the Supabase SQL Editor, then reload this page.
      </p>
      <div className="mx-auto mt-4 max-w-md rounded-lg bg-muted/70 px-4 py-3 ring-1 ring-border">
        <code className="block break-all text-[11px] font-semibold">20260805090000_create_zero_form.sql</code>
      </div>
    </div>
  );
}
