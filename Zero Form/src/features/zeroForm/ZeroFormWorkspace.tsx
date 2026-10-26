import { hasShareSheet, openShareSheet } from "@/components/ShareSheet";
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
  Type,
  FileText,
  CheckCircle2,
  ListChecks,
  ChevronDown,
  ThumbsUp,
  Globe,
  Hash,
  UploadCloud,
  GitBranch,
  type LucideIcon,
} from "@/components/icons/glyphs";
import { toast } from "sonner";
import { SortableList } from "@/components/SortableList";
import { Switch } from "@/components/ui/switch";
import { uploadMedia } from "@/lib/storage";
import { COVER_IMAGE } from "@/lib/imageCompression";
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
  conditionOpsFor,
  conditionChoicesFor,
  describeCondition,
  type ZeroFormCondition,
  type ZeroFormField,
  type ZeroFormFieldType,
  type ZeroFormUploadAnswer,
} from "@/features/zeroForm/templates";
import { CardSelect } from "@/components/CardSelect";
import { zc } from "@/lib/config";
import { CategoryPicker } from "@/components/CategoryPicker";

const money = (value: number) => formatWalletAmount(Number(value) || 0);
const isMissingRpc = (error: any) =>
  error?.code === "PGRST202" ||
  /Could not find the function|does not exist/i.test(error?.message || "");

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
    ]
      .map(escape)
      .join(",");
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

  if (forms.isLoading)
    return (
      <Centered>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </Centered>
    );

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
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
            {ownerLabel}
          </p>
          <h2 className="mt-1 font-display text-[22px] font-semibold tracking-tight">Zero Forms</h2>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Register learners for a bootcamp, or run a waitlist for anything you're launching.
          </p>
        </div>
      </div>

      {list.length === 0 ? (
        <Empty
          title="No Zero Forms yet"
          detail="Create one for an upcoming bootcamp to start collecting learners before day one."
          action={
            <button
              onClick={() => setCreating(true)}
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-foreground px-5 text-[13px] font-semibold text-background"
            >
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
                  <p className="truncate text-[14px] font-semibold">
                    {form.form_kind === "waitlist" ? form.title : form.bootcamp_title || form.title}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {form.form_kind === "waitlist"
                      ? "Waitlist"
                      : form.bootcamp_id
                        ? form.category || "Bootcamp"
                        : "Bootcamp form · no bootcamp chosen yet"}
                    {form.starts_at &&
                      ` · starts ${new Date(form.starts_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}
                  </p>
                </div>
                <StateBadge state={form.state} />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-4">
                {form.form_kind === "waitlist" || form.pricing_enabled === false ? (
                  <>
                    <Stat label="Sign-ups" value={form.total_registrations} />
                    <Stat label="Views" value={form.views ?? 0} />
                  </>
                ) : (
                  <>
                    <Stat label="Registrations" value={form.total_registrations} />
                    <Stat label="Paid" value={form.confirmed_registrations} />
                    <Stat label="Interested" value={form.interested_registrations ?? 0} />
                    <Stat label="Revenue" value={money(form.revenue)} isText />
                  </>
                )}
              </div>

              <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
                <button
                  onClick={() => setOpenFormId(form.id)}
                  className="h-9 shrink-0 rounded-lg bg-foreground px-4 text-[11.5px] font-semibold text-background"
                >
                  Manage
                </button>
                <ShareButtons
                  slug={form.slug}
                  status={form.status}
                  state={form.state}
                  bootcampId={form.bootcamp_id}
                />
              </div>
            </article>
          ))}
          <button onClick={() => setCreating(true)} className="inline-flex h-11 items-center justify-center gap-2 justify-self-start rounded-full bg-foreground px-5 text-[13px] font-semibold text-background">
            <Plus className="h-4 w-4" /> Create another Zero Form
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Builder ─────────────────────────────────────────────────────────────── */

function ZeroFormBuilder({
  onCancel,
  onSaved,
  existing,
}: {
  onCancel: () => void;
  onSaved: (id: string) => void;
  existing?: any;
}) {
  const [bootcampId, setBootcampId] = useState<string>(existing?.form?.bootcamp_id || "");
  /* Bootcamp: registers learners for one bootcamp (needs it to publish).
     Waitlist: collects sign-ups, no bootcamp needed, never takes payment. */
  const [formKind, setFormKind] = useState<"bootcamp" | "waitlist">(
    existing?.form?.form_kind === "waitlist" ? "waitlist" : "bootcamp",
  );
  const isWaitlist = formKind === "waitlist";
  const lockedBootcamp = Boolean(existing?.form?.bootcamp_id);
  const [templateId, setTemplateId] = useState(existing?.form?.template_id || "standard");
  const [fields, setFields] = useState<ZeroFormField[]>(
    existing?.fields || getTemplate("standard").fields,
  );
  const [title, setTitle] = useState(existing?.form?.title || "");
  const [description, setDescription] = useState(existing?.form?.description || "");
  const [bannerUrl, setBannerUrl] = useState<string>(existing?.form?.banner_url || "");
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const uploadBanner = async (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Choose an image (JPG, PNG or WebP).");
    setUploadingBanner(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Please sign in again.");
      const [url] = await uploadMedia([file], session.user.id, COVER_IMAGE);
      setBannerUrl(url);
    } catch (error: any) {
      toast.error(error?.message || "Could not upload that image");
    } finally {
      setUploadingBanner(false);
    }
  };
  const [regular, setRegular] = useState(String(existing?.form?.regular_price ?? ""));
  const [early, setEarly] = useState(String(existing?.form?.early_bird_price ?? ""));
  const [startsAt, setStartsAt] = useState(toLocalInput(existing?.bootcamp?.starts_at));
  const [deadline, setDeadline] = useState(toLocalInput(existing?.form?.registration_deadline));
  const [seatLimit, setSeatLimit] = useState(String(existing?.form?.seat_limit ?? ""));
  // Off = the form only collects details: no price, dates, deadline or seats.
  const [pricingEnabled, setPricingEnabled] = useState<boolean>(
    existing?.form?.pricing_enabled !== false,
  );

  const bootcamps = useQuery({
    queryKey: ["my-bootcamps-for-zero-form"],
    queryFn: async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return [];
      const { data, error } = await supabase
        .from("bootcamps")
        .select("id, title, price, category, starts_at, banner_url")
        .eq("creator_id", session.user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !lockedBootcamp,
  });

  /* Create the bootcamp right here: paying through this form then puts the
     learner straight into it. Who may create one is checked by the server. */
  const zfQueryClient = useQueryClient();
  const [newCampOpen, setNewCampOpen] = useState(false);
  const [newCampTitle, setNewCampTitle] = useState("");
  const [newCampCategory, setNewCampCategory] = useState("Development");
  const [newCampPrice, setNewCampPrice] = useState("");
  const createCamp = useMutation({
    mutationFn: async () => {
      const price = Math.max(0, Math.floor(Number(newCampPrice || regular || 0) || 0));
      const { data, error } = await supabase.rpc(
        "create_zero_form_bootcamp" as never,
        {
          p_title: newCampTitle.trim(),
          p_category: newCampCategory.trim() || null,
          p_description: description || null,
          p_price: price,
          p_starts_at: startsAt ? new Date(startsAt).toISOString() : null,
          p_ends_at: null,
          p_seat_limit: seatLimit ? Math.floor(Number(seatLimit)) || null : null,
          p_banner_url: bannerUrl || null,
        } as never,
      );
      if (error) throw error;
      const made = data as { id?: string } | null;
      if (!made?.id) throw new Error("The bootcamp could not be created");
      return { id: String(made.id), price };
    },
    onSuccess: async ({ id, price }) => {
      await zfQueryClient.invalidateQueries({ queryKey: ["my-bootcamps-for-zero-form"] });
      setBootcampId(id);
      if (!regular && price) setRegular(String(price));
      setTitle((current: string) => current || `${newCampTitle.trim()} — registration`);
      setNewCampOpen(false);
      setNewCampTitle("");
      setNewCampCategory("Development");
      setNewCampPrice("");
      toast.success("Bootcamp created", {
        description: "Anyone who pays through this form is enrolled in it automatically.",
      });
    },
    onError: (e: any) => toast.error(e?.message || "Could not create the bootcamp"),
  });

  // Selecting a bootcamp seeds the pricing and title from it.
  useEffect(() => {
    if (lockedBootcamp || !bootcampId) return;
    const picked = (bootcamps.data || []).find((b: any) => b.id === bootcampId);
    if (!picked) return;
    setTitle((current: string) => current || `${picked.title} — early registration`);
    setRegular((current: string) => current || String(picked.price ?? ""));
    if (picked.starts_at)
      setStartsAt((current: string) => current || toLocalInput(picked.starts_at));
  }, [bootcampId, bootcamps.data, existing]);

  /* Insert a question of a chosen type at a position, then focus it. */
  const [insertAt, setInsertAt] = useState<number | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [conditionKey, setConditionKey] = useState<string | null>(null);
  const insertQuestion = (
    index: number,
    type: ZeroFormFieldType,
    condition?: ZeroFormCondition,
  ) => {
    const key = `question_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const next: ZeroFormField = {
      field_key: key,
      field_type: type,
      label: QUESTION_STARTERS[type] || "New question",
      required: false,
      position: index,
      ...(isChoiceField(type) ? { options: ["Option 1", "Option 2"] } : {}),
      ...(condition ? { show_if: condition } : {}),
    } as ZeroFormField;
    setFields((current) => [...current.slice(0, index), next, ...current.slice(index)]);
    setInsertAt(null);
    setFocusKey(key);
  };

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    setFields(getTemplate(id).fields);
  };

  const [createdId, setCreatedId] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: async (status: "draft" | "published") => {
      const { data, error } = await supabase.rpc("save_zero_form", {
        payload: {
          form_id: existing?.form?.id || createdId || null,
          form_kind: formKind,
          bootcamp_id: bootcampId || null,
          template_id: templateId,
          title,
          description,
          banner_url: bannerUrl || null,
          regular_price: pricingEnabled ? Number(regular) || 0 : 0,
          early_bird_price: pricingEnabled ? Number(early) || 0 : 0,
          starts_at: pricingEnabled && startsAt ? new Date(startsAt).toISOString() : null,
          registration_deadline:
            pricingEnabled && deadline ? new Date(deadline).toISOString() : null,
          seat_limit: pricingEnabled ? seatLimit || null : null,
          pricing_enabled: pricingEnabled && !isWaitlist,
          status,
          fields: fields.map((f, index) => ({ ...f, position: index })),
        },
      });
      if (error) throw error;
      return data as any;
    },
    onSuccess: (data, status) => {
      if (data?.form?.id) setCreatedId(data.form.id);
      toast.success(status === "published" ? "Zero Form published" : "Draft saved");
      onSaved(data?.form?.id);
    },
    onError: (error: any) => toast.error(error.message || "Could not save this Zero Form"),
  });

  /* Why saving would fail, in plain words — checked on click instead of
     silently greying the button out, so it is never a mystery. */
  const [showBlockers, setShowBlockers] = useState(false);
  const blockersFor = (status: "draft" | "published") => {
    const list: string[] = [];
    const publishing = status === "published";
    if (publishing && !isWaitlist && !bootcampId)
      list.push(
        "Choose the bootcamp this form is for — or make it a waitlist, which doesn't need one.",
      );
    if (publishing && !fields.length) list.push("Add at least one question.");
    if (publishing && !title.trim() && isWaitlist) list.push("Give your waitlist a title.");
    if (pricingEnabled && !isWaitlist) {
      if (publishing && !startsAt)
        list.push(
          "Set when the bootcamp starts — or switch Pricing and dates off to just collect details.",
        );
      if (Number(early) > Number(regular))
        list.push("The early-bird price can't be higher than the regular price.");
      if (deadline && startsAt && new Date(deadline) > new Date(startsAt))
        list.push("The registration deadline must be before the bootcamp starts.");
    }
    return list;
  };
  const blockers = blockersFor("published");
  const attemptSave = (status: "draft" | "published") => {
    const problems = blockersFor(status);
    if (problems.length) {
      setShowBlockers(true);
      toast.error(problems[0]);
      return;
    }
    setShowBlockers(false);
    save.mutate(status);
  };

  const saving = earlyBirdSaving(Number(regular), Number(early));
  const input =
    "h-11 w-full rounded-lg border border-border bg-background px-3 text-[13px] outline-none focus:border-primary/50";
  const label = "text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground";

  return (
    <div>
      <button
        onClick={onCancel}
        className="mb-4 inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Zero Forms
      </button>

      <h2 className="font-display text-[22px] font-semibold tracking-tight">
        {existing
          ? isWaitlist
            ? "Edit waitlist"
            : "Edit Zero Form"
          : isWaitlist
            ? "New waitlist"
            : "New Zero Form"}
      </h2>
      <p className="mt-1 text-[12px] text-muted-foreground">
        {isWaitlist
          ? "A waitlist collects sign-ups. No bootcamp or payment needed."
          : "A bootcamp form registers learners for one of your bootcamps. Drafts can be saved before you pick it."}
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <Section title="What is this form for?">
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  [
                    "bootcamp",
                    "Bootcamp registration",
                    "Register learners for one of your bootcamps, with optional pricing and dates. Needs a bootcamp to publish.",
                  ],
                  [
                    "waitlist",
                    "Waitlist",
                    "Collect sign-ups for anything — a launch, a class, an event. No bootcamp needed, no payment.",
                  ],
                ] as const
              ).map(([value, name, hint]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFormKind(value)}
                  aria-pressed={formKind === value}
                  className={`rounded-lg border p-3.5 text-left transition ${formKind === value ? "border-primary bg-primary/[0.05] ring-2 ring-primary/15" : "border-border hover:bg-muted/60"}`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-[12.5px] font-semibold">{name}</span>
                    {formKind === value && <Check className="h-4 w-4 text-primary" />}
                  </span>
                  <span className="mt-1 block text-[10.5px] leading-4 text-muted-foreground">
                    {hint}
                  </span>
                </button>
              ))}
            </div>
          </Section>

          {!isWaitlist && !lockedBootcamp && (
            <Section
              title="Bootcamp"
              detail="Which bootcamp is this form collecting learners for? You can save a draft without one."
            >
              {bootcamps.isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (bootcamps.data || []).length === 0 && !newCampOpen ? (
                <p className="text-[12px] text-muted-foreground">
                  You have no bootcamps yet. Create one below — learners who pay through this form
                  go straight into it.
                </p>
              ) : (bootcamps.data || []).length > 0 ? (
                <CardSelect
                  value={bootcampId}
                  onChange={(e) => setBootcampId(e.target.value)}
                  className={input}
                >
                  <option value="">Select a bootcamp</option>
                  {(bootcamps.data || []).map((b: any) => (
                    <option key={b.id} value={b.id}>
                      {b.title}
                    </option>
                  ))}
                </CardSelect>
              ) : null}
              {!bootcamps.isLoading &&
                (newCampOpen ? (
                  <div className="mt-3 space-y-2 rounded-lg border border-primary/30 bg-primary/[0.03] p-3">
                    <p className="text-[12.5px] font-semibold">New bootcamp</p>
                    <input
                      value={newCampTitle}
                      onChange={(e) => setNewCampTitle(e.target.value)}
                      maxLength={120}
                      placeholder="Bootcamp name, e.g. Product Design Bootcamp 3"
                      className={input}
                    />
                    <div className="grid gap-2 sm:grid-cols-2">
                      <CategoryPicker
                        value={newCampCategory}
                        onChange={setNewCampCategory}
                        className={input}
                      />
                      <input
                        value={newCampPrice}
                        onChange={(e) => setNewCampPrice(e.target.value.replace(/[^0-9]/g, ""))}
                        inputMode="numeric"
                        placeholder={regular ? `Price (₦) — ${regular}` : "Price (₦), 0 for free"}
                        className={input}
                      />
                    </div>
                    <p className="text-[10.5px] leading-4 text-muted-foreground">
                      Uses this form's description, start date, seat limit and banner. You can edit
                      the bootcamp later.
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={newCampTitle.trim().length < 3 || createCamp.isPending}
                        onClick={() => createCamp.mutate()}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[12.5px] font-semibold text-primary-foreground disabled:opacity-50"
                      >
                        {createCamp.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )}{" "}
                        Create and select
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewCampOpen(false)}
                        className="h-9 rounded-lg border border-border px-3.5 text-[12.5px] font-semibold"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setNewCampOpen(true);
                      setNewCampTitle((t) => t || title.replace(/\s+—.*$/, ""));
                    }}
                    className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-primary"
                  >
                    <Plus className="h-3.5 w-3.5" /> Create a new bootcamp
                  </button>
                ))}
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
                  <p className="mt-1 text-[10.5px] leading-4 text-muted-foreground">
                    {template.description}
                  </p>
                </button>
              ))}
            </div>
          </Section>

          <Section title="Questions" detail="Keep it short — long forms lose registrations.">
            <SortableList
              items={fields}
              getKey={(field) => field.field_key}
              onChange={setFields}
              className="space-y-2"
              renderItem={(field, tools) => {
                const updateField = (patch: Partial<typeof field>) =>
                  setFields((current) =>
                    current.map((f) => (f.field_key === field.field_key ? { ...f, ...patch } : f)),
                  );

                const options: string[] = Array.isArray(field.options) ? field.options : [];

                return (
                  <div>
                    <InsertQuestion
                      open={insertAt === tools.index}
                      onOpen={() => setInsertAt(tools.index)}
                      onClose={() => setInsertAt(null)}
                      earlier={fields.slice(0, tools.index)}
                      onPick={(type, condition) => insertQuestion(tools.index, type, condition)}
                    />
                    <div
                      className={`rounded-lg border bg-background p-2.5 transition-shadow ${field.show_if ? "ml-4 border-l-[3px] border-l-primary/60" : ""} ${focusKey === field.field_key ? "border-primary/50 ring-2 ring-primary/15" : "border-border"}`}
                    >
                      {(() => {
                        const rule = field.show_if;
                        const sourceIndex = rule
                          ? fields.findIndex((f) => f.field_key === rule.field_key)
                          : -1;
                        const source = sourceIndex >= 0 ? fields[sourceIndex] : null;
                        if (conditionKey === field.field_key) {
                          return (
                            <div className="mb-2.5">
                              <ConditionEditor
                                sources={fields.slice(0, tools.index)}
                                initial={rule || null}
                                onCancel={() => setConditionKey(null)}
                                onSave={(next) => {
                                  updateField({ show_if: next });
                                  setConditionKey(null);
                                }}
                              />
                            </div>
                          );
                        }
                        if (!rule) return null;
                        return (
                          <div className="mb-2 flex flex-wrap items-center gap-1.5 rounded-md bg-primary/[0.06] px-2 py-1.5">
                            <GitBranch className="h-3.5 w-3.5 shrink-0 text-primary" />
                            <span className="min-w-0 flex-1 text-[10.5px] font-semibold leading-4 text-primary">
                              {describeCondition(rule, source)}
                            </span>
                            <button
                              type="button"
                              onClick={() => setConditionKey(field.field_key)}
                              className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-foreground hover:bg-background"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => updateField({ show_if: null })}
                              className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground hover:bg-background hover:text-destructive"
                            >
                              Always show
                            </button>
                            {(!source || sourceIndex > tools.index) && (
                              <p className="w-full text-[10px] text-amber-600">
                                {source
                                  ? `Move this question below “${source.label}” — it depends on that answer.`
                                  : "The question this depended on was removed. Pick another or set it to always show."}
                              </p>
                            )}
                          </div>
                        );
                      })()}
                      <div className="flex items-center gap-2">
                        <div className="-ml-1.5 flex shrink-0 items-center">
                          {tools.handle}
                          <span className="w-4 text-center text-[10.5px] font-semibold tabular-nums text-muted-foreground">
                            {tools.index + 1}
                          </span>
                        </div>
                        <input
                          autoFocus={focusKey === field.field_key}
                          onFocus={(e) => {
                            if (focusKey === field.field_key) {
                              e.currentTarget.select();
                              e.currentTarget.scrollIntoView({
                                block: "center",
                                behavior: "smooth",
                              });
                            }
                          }}
                          onBlur={() => setFocusKey((k) => (k === field.field_key ? null : k))}
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
                          onClick={() =>
                            setFields((current) =>
                              current
                                .filter((f) => f.field_key !== field.field_key)
                                // Follow-ups of a removed question go back to always showing.
                                .map((f) =>
                                  f.show_if?.field_key === field.field_key
                                    ? { ...f, show_if: null }
                                    : f,
                                ),
                            )
                          }
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <CardSelect
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
                            <option key={type.value} value={type.value}>
                              {type.label}
                            </option>
                          ))}
                        </CardSelect>
                        <p className="text-[10px] text-muted-foreground">
                          {ZERO_FORM_FIELD_TYPES.find((t) => t.value === field.field_type)?.hint}
                        </p>
                        {!field.show_if && tools.index > 0 && conditionKey !== field.field_key && (
                          <button
                            type="button"
                            onClick={() => setConditionKey(field.field_key)}
                            className="ml-auto inline-flex h-7 items-center gap-1 rounded-full border border-border px-2.5 text-[10.5px] font-semibold text-muted-foreground transition hover:border-primary/40 hover:text-primary"
                          >
                            <GitBranch className="h-3 w-3" /> Make conditional
                          </button>
                        )}
                      </div>

                      {isChoiceField(field.field_type) && (
                        <div className="mt-2 space-y-1.5 border-t border-border/60 pt-2">
                          {options.map((option, optionIndex) => (
                            <div key={optionIndex} className="flex items-center gap-2">
                              <span className="text-[10px] text-muted-foreground">
                                {optionIndex + 1}.
                              </span>
                              <input
                                value={option}
                                placeholder="Option text"
                                onChange={(e) =>
                                  updateField({
                                    options: options.map((o, i) =>
                                      i === optionIndex ? e.target.value : o,
                                    ),
                                  })
                                }
                                className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-[11.5px] outline-none"
                              />
                              <button
                                onClick={() =>
                                  updateField({
                                    options: options.filter((_, i) => i !== optionIndex),
                                  })
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
                  </div>
                );
              }}
            />
            <InsertQuestion
              last
              open={insertAt === fields.length}
              onOpen={() => setInsertAt(fields.length)}
              onClose={() => setInsertAt(null)}
              earlier={fields}
              onPick={(type, condition) => insertQuestion(fields.length, type, condition)}
            />
            <p className="mt-2 text-[10.5px] text-muted-foreground">
              Tap + between questions to add one there. Drag ⋮⋮ to change the order. Conditional
              follow-ups only appear when the answer above matches.
            </p>
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="Form details">
            <div className="space-y-3">
              <div>
                <p className={label}>Title</p>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Frontend Bootcamp — early registration"
                  className={`${input} mt-1.5`}
                />
              </div>
              <div>
                <p className={label}>Cover image</p>
                <p className="mt-0.5 text-[10.5px] leading-4 text-muted-foreground">
                  Shown at the top of your form and as the preview when the link is shared on
                  WhatsApp, X, LinkedIn and more.
                </p>
                {bannerUrl ? (
                  <div className="relative mt-1.5 overflow-hidden rounded-lg border border-border">
                    <img src={bannerUrl} alt="" className="aspect-[1200/630] w-full object-cover" />
                    {uploadingBanner && (
                      <div className="absolute inset-0 grid place-items-center bg-black/40">
                        <Loader2 className="h-5 w-5 animate-spin text-white" />
                      </div>
                    )}
                    <div className="absolute bottom-2 right-2 flex gap-1.5">
                      <label className="inline-flex h-8 cursor-pointer items-center rounded-full bg-black/65 px-3 text-[11px] font-semibold text-white backdrop-blur">
                        Replace
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            void uploadBanner(e.target.files?.[0]);
                            e.target.value = "";
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => setBannerUrl("")}
                        className="h-8 rounded-full bg-black/65 px-3 text-[11px] font-semibold text-white backdrop-blur"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <label className="mt-1.5 flex aspect-[1200/630] w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border bg-muted/30 text-center transition hover:border-primary/40 hover:bg-primary/[0.03]">
                    {uploadingBanner ? (
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    ) : (
                      <>
                        <span className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-primary">
                          <UploadCloud className="h-4 w-4" />
                        </span>
                        <span className="text-[12px] font-semibold">Upload a cover image</span>
                        <span className="text-[10.5px] text-muted-foreground">
                          Landscape works best · 1200 × 630
                        </span>
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploadingBanner}
                      onChange={(e) => {
                        void uploadBanner(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                  </label>
                )}
              </div>
              <div>
                <p className={label}>Description</p>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className={`${input} h-auto resize-none py-2.5 mt-1.5`}
                />
              </div>
            </div>
          </Section>

          {isWaitlist ? (
            <section className="rounded-lg border border-border bg-card p-4">
              <h3 className="text-[13px] font-semibold">Pricing and dates</h3>
              <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                Waitlists only collect sign-ups — nobody is charged and there are no dates or seat
                limits.
              </p>
            </section>
          ) : (
            <section className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-[13px] font-semibold">Pricing and dates</h3>
                  <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                    {pricingEnabled
                      ? "Sell seats with a price, early-bird offer and deadline."
                      : "Off — this form only collects details. No payment, dates or seat limit."}
                  </p>
                </div>
                <Switch
                  checked={pricingEnabled}
                  onCheckedChange={setPricingEnabled}
                  aria-label="Pricing and dates"
                />
              </div>
              {pricingEnabled && (
                <div className="mt-4 space-y-3">
                  <div>
                    <p className={label}>Regular price</p>
                    <input
                      type="number"
                      value={regular}
                      onChange={(e) => setRegular(e.target.value)}
                      placeholder="20000"
                      className={`${input} mt-1.5`}
                    />
                  </div>
                  <div>
                    <p className={label}>Early-bird price</p>
                    <input
                      type="number"
                      value={early}
                      onChange={(e) => setEarly(e.target.value)}
                      placeholder="15000"
                      className={`${input} mt-1.5`}
                    />
                    {saving > 0 && (
                      <p className="mt-1.5 text-[10.5px] font-semibold text-primary">
                        Learners save {saving}%
                      </p>
                    )}
                    {Number(early) > Number(regular) && (
                      <p className="mt-1.5 text-[10.5px] font-semibold text-destructive">
                        Early-bird cannot exceed the regular price
                      </p>
                    )}
                  </div>
                  <div>
                    <p className={label}>Bootcamp starts</p>
                    <input
                      type="datetime-local"
                      value={startsAt}
                      onChange={(e) => setStartsAt(e.target.value)}
                      className={`${input} mt-1.5`}
                    />
                  </div>
                  <div>
                    <p className={label}>Registration deadline</p>
                    <input
                      type="datetime-local"
                      value={deadline}
                      onChange={(e) => setDeadline(e.target.value)}
                      className={`${input} mt-1.5`}
                    />
                    {deadline && startsAt && new Date(deadline) > new Date(startsAt) && (
                      <p className="mt-1.5 text-[10.5px] font-semibold text-destructive">
                        The deadline must be before the bootcamp starts
                      </p>
                    )}
                  </div>
                  <div>
                    <p className={label}>Seat limit (optional)</p>
                    <input
                      type="number"
                      value={seatLimit}
                      onChange={(e) => setSeatLimit(e.target.value)}
                      placeholder="100"
                      className={`${input} mt-1.5`}
                    />
                  </div>
                </div>
              )}
            </section>
          )}

          <div className="space-y-2">
            <button
              onClick={() => attemptSave("published")}
              disabled={save.isPending || uploadingBanner}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary text-[13px] font-semibold text-primary-foreground disabled:opacity-50"
            >
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {uploadingBanner ? "Uploading image…" : "Publish Zero Form"}
            </button>
            <button
              onClick={() => attemptSave("draft")}
              disabled={save.isPending || uploadingBanner}
              className="h-11 w-full rounded-lg border border-border text-[12.5px] font-semibold disabled:opacity-50"
            >
              Save as draft
            </button>
            {showBlockers && blockers.length > 0 && (
              <div
                role="alert"
                className="rounded-lg bg-destructive/[0.06] p-3 ring-1 ring-destructive/20"
              >
                <p className="text-[11.5px] font-semibold text-destructive">
                  Before you can publish:
                </p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] leading-4 text-muted-foreground">
                  {blockers.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
            )}
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
      const { data, error } = await supabase.rpc("get_zero_form_detail", {
        target_form_id: formId,
      });
      if (error) throw error;
      return data as any;
    },
    retry: false,
  });

  if (detail.isLoading)
    return (
      <Centered>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </Centered>
    );
  if (detail.error)
    return <Empty title="Could not load this Zero Form" detail={(detail.error as any).message} />;

  const { form, bootcamp, metrics, registrations = [], state, seats_taken } = detail.data || {};

  const rows = (registrations as any[]).filter((row) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const haystack = [
      JSON.stringify(row.registration_data || {}),
      row.full_name,
      row.username,
      row.guest_name,
      row.guest_email,
      row.guest_phone,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
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
      <button
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> All Zero Forms
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-[22px] font-semibold tracking-tight">
            {form?.form_kind === "waitlist" ? form?.title : bootcamp?.title || form?.title}
          </h2>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {form?.title}
            {bootcamp?.starts_at &&
              ` · starts ${new Date(bootcamp.starts_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`}
          </p>
        </div>
        <StateBadge state={state} />
      </div>

      <div className="mt-4 flex items-center gap-2">
        <ShareButtons
          slug={form?.slug}
          status={form?.status}
          state={state}
          bootcampId={bootcamp?.id}
        />
      </div>

      <div className="mt-6 flex gap-1 border-b border-border">
        {(["overview", "responses", "payments", "settings"] as const).map((key) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`relative h-10 px-3 text-[12px] font-semibold capitalize ${tab === key ? "text-foreground" : "text-muted-foreground"}`}
          >
            {key}
            {tab === key && (
              <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" />
            )}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === "overview" && (
          <div>
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <MetricCard
                Icon={Users}
                label="Registrations"
                value={metrics?.total ?? 0}
                detail={`${metrics?.confirmed ?? 0} paid · ${metrics?.interested ?? 0} interested`}
              />
              <MetricCard
                Icon={Wallet}
                label="Revenue"
                value={money(metrics?.revenue)}
                detail={`${metrics?.pending_payments ?? 0} awaiting payment`}
                isText
              />
              <MetricCard
                Icon={Eye}
                label="Form views"
                value={metrics?.views ?? 0}
                detail={`${metrics?.conversion ?? 0}% conversion`}
              />
              <MetricCard
                Icon={ClipboardList}
                label="Seats"
                value={
                  form?.seat_limit ? `${seats_taken}/${form.seat_limit}` : String(seats_taken ?? 0)
                }
                detail={
                  form?.seat_limit
                    ? `${Math.max(0, form.seat_limit - (seats_taken || 0))} left`
                    : "No seat limit"
                }
                isText
              />
            </div>

            {form?.pricing_enabled === false ? (
              <div className="mt-6">
                <InfoCard
                  title="Data collection"
                  value="No payment"
                  sub="Pricing and dates are switched off — this form only collects details."
                />
              </div>
            ) : (
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <InfoCard
                  title="Early-bird price"
                  value={money(form?.early_bird_price)}
                  sub={`Regular ${money(form?.regular_price)}`}
                />
                <InfoCard
                  title="Registration deadline"
                  value={
                    form?.registration_deadline
                      ? new Date(form.registration_deadline).toLocaleDateString(undefined, {
                          month: "long",
                          day: "numeric",
                        })
                      : "No deadline"
                  }
                  sub={
                    bootcamp?.starts_at
                      ? `Bootcamp starts ${new Date(bootcamp.starts_at).toLocaleDateString(undefined, { month: "long", day: "numeric" })}`
                      : ""
                  }
                />
              </div>
            )}
          </div>
        )}

        {tab === "responses" && (
          <div>
            {/* Split by what the person actually did: paid, or asked to be
                remembered. Both groups keep their full contact details. */}
            <div className="mb-3 flex flex-wrap gap-1.5">
              {(
                [
                  ["all", "Everyone", rows.length],
                  ["paid", "Paid", rows.filter(isPaidRow).length],
                  ["interest", "Interested", rows.filter(isInterestRow).length],
                ] as const
              ).map(([key, label, count]) => (
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
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, email or answer"
                className="flex-1 bg-transparent px-3 text-[12px] outline-none"
              />
            </label>

            {visibleRows.length === 0 ? (
              <Empty
                title={
                  audience === "interest"
                    ? "Nobody has registered interest yet"
                    : audience === "paid"
                      ? "No paid registrations yet"
                      : "No responses yet"
                }
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
                          <span
                            className={`rounded-full px-2 py-0.5 text-[9.5px] font-semibold ${interest ? "bg-primary/10 text-primary" : "bg-emerald-500/10 text-emerald-600"}`}
                          >
                            {interest ? "Interested" : "Paid"}
                          </span>
                          <StatusPill status={row.registration_status} />
                        </div>
                      </div>

                      {/* Contact details first — this is what the tutor needs. */}
                      {(email || phone) && (
                        <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1">
                          {email && (
                            <a
                              href={`mailto:${email}`}
                              className="flex items-center gap-1.5 text-[11.5px] font-medium text-foreground hover:text-primary"
                            >
                              <Mail className="h-3.5 w-3.5 text-muted-foreground" /> {String(email)}
                            </a>
                          )}
                          {phone && (
                            <a
                              href={`tel:${phone}`}
                              className="flex items-center gap-1.5 text-[11.5px] font-medium text-foreground hover:text-primary"
                            >
                              <Phone className="h-3.5 w-3.5 text-muted-foreground" />{" "}
                              {String(phone)}
                            </a>
                          )}
                        </div>
                      )}

                      {Object.keys(row.registration_data || {}).length > 0 && (
                        <div className="mt-2.5 grid gap-x-6 gap-y-1 border-t border-border pt-2.5 sm:grid-cols-2">
                          {Object.entries(row.registration_data || {}).map(([key, value]) => (
                            <p key={key} className="text-[11px] text-muted-foreground">
                              <span className="capitalize">{key.replaceAll("_", " ")}:</span>{" "}
                              {isUploadAnswer(value) ? (
                                <AttachmentLink answer={value} />
                              ) : (
                                <span className="text-foreground">{formatAnswer(value)}</span>
                              )}
                            </p>
                          ))}
                        </div>
                      )}

                      <p className="mt-2.5 text-[10px] text-muted-foreground">
                        {interest ? "Registered interest" : "Paid"}{" "}
                        {new Date(row.registered_at).toLocaleString(undefined, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
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
              <Empty
                title="No payments yet"
                detail="Payments appear here as learners complete registration."
              />
            ) : (
              (registrations as any[]).map((row) => (
                <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate text-[12.5px] font-semibold">
                      {row.full_name || row.username || "Learner"}
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {row.payment_reference
                        ? `Ref ${row.payment_reference.slice(0, 18)}…`
                        : "No reference"}
                      {row.confirmed_at &&
                        ` · ${new Date(row.confirmed_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[12.5px] font-semibold tabular-nums">
                      {money(row.amount)}
                    </span>
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
const ICON_ACTION =
  "grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border text-foreground transition hover:bg-muted active:scale-95";

function ShareButtons({
  slug,
  status,
  state,
  bootcampId,
}: {
  slug?: string;
  status?: string;
  state?: string;
  bootcampId?: string;
}) {
  const live = state === "bootcamp_started";
  const url = live
    ? zc(`/app/bootcamps/${bootcampId}`)
    : zeroFormUrl(slug || "");
  const shareLabel = live ? "Share bootcamp" : "Share Zero Form";

  const copy = async () => {
    await navigator.clipboard.writeText(url);
    toast.success(live ? "Bootcamp link copied" : "Zero Form link copied");
  };

  const share = async () => {
    if (hasShareSheet()) {
      try {
        await openShareSheet({ title: shareLabel, url });
        return;
      } catch {
        /* user dismissed */
      }
    }
    copy();
  };

  if (status === "draft" && !live) {
    return (
      <span className="min-w-0 truncate rounded-lg bg-muted px-3 py-2 text-[11px] font-medium text-muted-foreground">
        Publish to get a shareable link
      </span>
    );
  }

  return (
    <>
      {/* Icon-only, so Manage and all three actions sit on one line on a
          phone. The name is still announced (aria-label) and shown on hover. */}
      <button
        type="button"
        onClick={share}
        aria-label={shareLabel}
        title={shareLabel}
        className={ICON_ACTION}
      >
        <Share2 className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={copy}
        aria-label="Copy link"
        title="Copy link"
        className={ICON_ACTION}
      >
        <Copy className="h-4 w-4" />
      </button>
      {!live && slug && (
        <a
          href={`/form/${slug}`}
          target="_blank"
          rel="noreferrer"
          aria-label="Preview Zero Form"
          title="Preview"
          className={ICON_ACTION}
        >
          <ExternalLink className="h-4 w-4" />
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
      {opening ? (
        <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
      ) : (
        <Download className="h-3 w-3 shrink-0" />
      )}
      <span className="truncate">{answer.name}</span>
      {answer.size > 0 && (
        <span className="shrink-0 text-muted-foreground">({formatFileSize(answer.size)})</span>
      )}
    </button>
  );
}

function StateBadge({ state }: { state?: string }) {
  const tone =
    state === "open"
      ? "bg-emerald-500/10 text-emerald-600"
      : state === "draft"
        ? "bg-muted text-muted-foreground"
        : state === "bootcamp_started"
          ? "bg-primary/10 text-primary"
          : "bg-amber-500/10 text-amber-600";
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${tone}`}>
      {ZERO_FORM_STATE_LABEL[state || ""] || "Unknown"}
    </span>
  );
}

function StatusPill({ status }: { status?: string }) {
  const good = ["confirmed", "enrolled", "paid", "not_required"].includes(status || "");
  const warn = ["pending", "payment_pending"].includes(status || "");
  const tone = good
    ? "bg-emerald-500/10 text-emerald-600"
    : warn
      ? "bg-amber-500/10 text-amber-600"
      : "bg-rose-500/10 text-rose-600";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[9.5px] font-semibold capitalize ${tone}`}>
      {(status || "unknown").replaceAll("_", " ")}
    </span>
  );
}

const QUESTION_STARTERS: Partial<Record<ZeroFormFieldType, string>> = {
  text: "Short answer question",
  textarea: "Tell us a bit more",
  multiple_choice: "Choose one",
  checkboxes: "Select all that apply",
  select: "Pick from the list",
  yes_no: "Yes or no?",
  email: "Email address",
  phone: "Phone number",
  number: "How many?",
  country: "Country",
  file_upload: "Upload a file",
};

const TYPE_ICONS: Partial<Record<ZeroFormFieldType, LucideIcon>> = {
  text: Type,
  textarea: FileText,
  multiple_choice: CheckCircle2,
  checkboxes: ListChecks,
  select: ChevronDown,
  yes_no: ThumbsUp,
  email: Mail,
  phone: Phone,
  number: Hash,
  country: Globe,
  file_upload: UploadCloud,
};

/**
 * The "+" that lives between questions. On a desktop it fades in on hover; on
 * touch screens it is always faintly visible. Opening it shows the question
 * types right there, so a new question lands exactly where it was asked for.
 */
function InsertQuestion({
  open,
  onOpen,
  onClose,
  onPick,
  earlier,
  last,
}: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onPick: (type: ZeroFormFieldType, condition?: ZeroFormCondition) => void;
  /** Questions above this spot: what a conditional follow-up can depend on. */
  earlier: ZeroFormField[];
  last?: boolean;
}) {
  // Conditional follow-up: step 1 is the rule, step 2 the answer type.
  const [step, setStep] = useState<"types" | "rule" | "followup">("types");
  const [rule, setRule] = useState<ZeroFormCondition | null>(null);
  useEffect(() => {
    if (!open) {
      setStep("types");
      setRule(null);
    }
  }, [open]);

  if (open && step === "rule") {
    return (
      <div className="my-2 rounded-xl border border-primary/30 bg-card p-3 shadow-[0_12px_30px_-18px_rgba(0,0,0,0.35)]">
        <ConditionEditor
          sources={earlier}
          initial={rule}
          saveLabel="Next: choose the follow-up"
          onCancel={() => setStep("types")}
          onSave={(next) => {
            setRule(next);
            setStep("followup");
          }}
        />
      </div>
    );
  }

  if (open && step === "followup" && rule) {
    const source = earlier.find((f) => f.field_key === rule.field_key);
    return (
      <div className="my-2 rounded-xl border border-primary/30 bg-card p-3 shadow-[0_12px_30px_-18px_rgba(0,0,0,0.35)]">
        <div className="mb-2 flex items-start gap-2 rounded-lg bg-primary/[0.06] px-2.5 py-2">
          <GitBranch className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <p className="min-w-0 flex-1 text-[11px] font-semibold leading-4 text-primary">
            {describeCondition(rule, source)}, then ask…
          </p>
          <button
            type="button"
            onClick={() => setStep("rule")}
            className="shrink-0 text-[10.5px] font-semibold text-muted-foreground hover:text-foreground"
          >
            Change
          </button>
        </div>
        <p className="mb-2 text-[12px] font-semibold">What kind of follow-up question?</p>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {ZERO_FORM_FIELD_TYPES.map((type) => {
            const Icon = TYPE_ICONS[type.value] || Type;
            return (
              <button
                key={type.value}
                type="button"
                onClick={() => onPick(type.value, rule)}
                className="flex items-start gap-2 rounded-lg border border-border bg-background p-2.5 text-left transition hover:border-primary/40 hover:bg-primary/[0.04]"
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[11.5px] font-semibold leading-tight">
                    {type.label}
                  </span>
                  <span className="mt-0.5 block text-[10px] leading-snug text-muted-foreground">
                    {type.hint}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (open) {
    return (
      <div className="my-2 rounded-xl border border-primary/30 bg-card p-3 shadow-[0_12px_30px_-18px_rgba(0,0,0,0.35)]">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[12px] font-semibold">What kind of question?</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cancel"
            className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-muted"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <button
          type="button"
          onClick={() => setStep("rule")}
          disabled={earlier.length === 0}
          className="mb-1.5 flex w-full items-start gap-2.5 rounded-lg border border-primary/35 bg-[linear-gradient(135deg,rgba(195,33,126,0.08),rgba(195,33,126,0.02))] p-2.5 text-left transition hover:border-primary/60 disabled:cursor-not-allowed disabled:opacity-55"
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
            <GitBranch className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11.5px] font-semibold leading-tight">
              Conditional follow-up
            </span>
            <span className="mt-0.5 block text-[10px] leading-snug text-muted-foreground">
              {earlier.length === 0
                ? "Add a question above first — a follow-up depends on an earlier answer."
                : "Only appears when an earlier answer matches, e.g. “If Yes, tell us more”"}
            </span>
          </span>
        </button>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {ZERO_FORM_FIELD_TYPES.map((type) => {
            const Icon = TYPE_ICONS[type.value] || Type;
            return (
              <button
                key={type.value}
                type="button"
                onClick={() => onPick(type.value)}
                className="flex items-start gap-2 rounded-lg border border-border bg-background p-2.5 text-left transition hover:border-primary/40 hover:bg-primary/[0.04]"
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[11.5px] font-semibold leading-tight">
                    {type.label}
                  </span>
                  <span className="mt-0.5 block text-[10px] leading-snug text-muted-foreground">
                    {type.hint}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }
  if (last) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="mt-2 flex h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-[11.5px] font-semibold text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
      >
        <Plus className="h-3.5 w-3.5" /> Add question
      </button>
    );
  }
  return (
    <div className="group/insert relative -my-1 flex h-4 items-center justify-center">
      <span className="absolute inset-x-6 top-1/2 h-px -translate-y-1/2 bg-primary/40 opacity-0 transition group-hover/insert:opacity-100" />
      <button
        type="button"
        onClick={onOpen}
        aria-label="Add a question here"
        className="relative z-10 grid h-6 w-6 place-items-center rounded-full border border-border bg-card text-muted-foreground opacity-60 shadow-sm transition hover:scale-110 hover:border-primary hover:text-primary group-hover/insert:opacity-100 [@media(hover:hover)]:opacity-0"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/**
 * "Show this question when <earlier question> <is> <answer>". Earlier
 * questions are cards; the answers to match are tappable chips (Yes / No,
 * or the question's own options).
 */
function ConditionEditor({
  sources,
  initial,
  onSave,
  onCancel,
  saveLabel = "Save condition",
}: {
  sources: ZeroFormField[];
  initial: ZeroFormCondition | null;
  onSave: (rule: ZeroFormCondition) => void;
  onCancel: () => void;
  saveLabel?: string;
}) {
  // Yes / No and choice questions first: they're what follow-ups usually hang on.
  const ranked = [...sources].sort(
    (a, b) => Number(conditionChoicesFor(b).length > 0) - Number(conditionChoicesFor(a).length > 0),
  );
  const [sourceKey, setSourceKey] = useState(
    initial?.field_key && sources.some((f) => f.field_key === initial.field_key)
      ? initial.field_key
      : ranked[0]?.field_key || "",
  );
  const source = sources.find((f) => f.field_key === sourceKey) || null;
  const ops = source ? conditionOpsFor(source.field_type) : [];
  const choices = source ? conditionChoicesFor(source) : [];
  const [op, setOp] = useState(initial?.op || ops[0]?.op || "equals");
  const [value, setValue] = useState(initial?.value || "");

  useEffect(() => {
    if (!source) return;
    if (!ops.some((o) => o.op === op)) setOp(ops[0].op);
    if (value && choices.length && !choices.includes(value)) setValue("");
  }, [sourceKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const needsValue = op !== "answered";
  const ready = Boolean(source) && (!needsValue || Boolean(value));

  if (sources.length === 0) {
    return (
      <div className="text-[11px] text-muted-foreground">
        Add a question above this one first — a conditional question follows an earlier answer.
        <button type="button" onClick={onCancel} className="ml-2 font-semibold text-foreground">
          OK
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[12px] font-semibold">
          <GitBranch className="h-3.5 w-3.5 text-primary" /> Show this question when…
        </p>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel"
          className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-muted"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        This earlier question
      </p>
      <div className="max-h-44 space-y-1 overflow-y-auto pr-0.5">
        {ranked.map((f) => {
          const on = f.field_key === sourceKey;
          const Icon = TYPE_ICONS[f.field_type] || Type;
          return (
            <button
              key={f.field_key}
              type="button"
              onClick={() => setSourceKey(f.field_key)}
              className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition ${on ? "border-primary bg-primary/[0.06]" : "border-border bg-background hover:border-primary/35"}`}
            >
              <Icon
                className={`h-3.5 w-3.5 shrink-0 ${on ? "text-primary" : "text-muted-foreground"}`}
              />
              <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold">
                {f.label || "Untitled question"}
              </span>
              <span
                className={`grid h-4 w-4 shrink-0 place-items-center rounded-full ${on ? "bg-primary text-primary-foreground" : "ring-1 ring-border"}`}
              >
                {on && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
              </span>
            </button>
          );
        })}
      </div>

      {source && (
        <>
          <p className="mb-1 mt-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Condition
          </p>
          <div className="flex flex-wrap gap-1.5">
            {ops.map((o) => (
              <button
                key={o.op}
                type="button"
                onClick={() => setOp(o.op)}
                className={`h-8 rounded-full px-3 text-[11px] font-semibold transition ${op === o.op ? "bg-primary text-primary-foreground" : "border border-border bg-background text-muted-foreground hover:text-foreground"}`}
              >
                {o.label}
              </button>
            ))}
          </div>

          {needsValue && (
            <>
              <p className="mb-1 mt-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Answer
              </p>
              {choices.length > 0 ? (
                <div
                  className={
                    source.field_type === "yes_no"
                      ? "grid grid-cols-2 gap-1.5"
                      : "flex flex-wrap gap-1.5"
                  }
                >
                  {choices.map((choice) => (
                    <button
                      key={choice}
                      type="button"
                      onClick={() => setValue(choice)}
                      className={`rounded-lg border px-3 text-[12px] font-semibold transition ${source.field_type === "yes_no" ? "h-11" : "h-9"} ${value === choice ? "border-primary bg-primary/[0.08] text-primary ring-1 ring-primary/40" : "border-border bg-background hover:border-primary/35"}`}
                    >
                      {choice}
                    </button>
                  ))}
                </div>
              ) : (
                <input
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="The answer to match"
                  className="h-9 w-full rounded-lg border border-border bg-background px-2.5 text-[12px] outline-none focus:border-primary/50"
                />
              )}
            </>
          )}
        </>
      )}

      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="h-9 rounded-full px-3 text-[11.5px] font-semibold text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!ready}
          onClick={() =>
            source && onSave({ field_key: source.field_key, op, ...(needsValue ? { value } : {}) })
          }
          className="h-9 rounded-full bg-primary px-4 text-[11.5px] font-semibold text-primary-foreground disabled:opacity-45"
        >
          {saveLabel}
        </button>
      </div>
    </div>
  );
}

function Section({
  title,
  detail,
  children,
}: {
  title: string;
  detail?: string;
  children: React.ReactNode;
}) {
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
      <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <p
        className={`mt-4 text-[20px] font-semibold tracking-tight ${isText ? "" : "tabular-nums"}`}
      >
        {value}
      </p>
      <p className="mt-1 text-[10px] font-semibold">{label}</p>
      <p className="mt-0.5 text-[9.5px] text-muted-foreground">{detail}</p>
    </div>
  );
}

function InfoCard({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {title}
      </p>
      <p className="mt-2 text-[18px] font-semibold tracking-tight">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-[280px] items-center justify-center">{children}</div>;
}

function Empty({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-5 py-14 text-center">
      <ClipboardList className="mx-auto h-6 w-6 text-muted-foreground" />
      <h3 className="mt-3 text-[14px] font-semibold">{title}</h3>
      {detail && (
        <p className="mx-auto mt-1 max-w-sm text-[11.5px] leading-5 text-muted-foreground">
          {detail}
        </p>
      )}
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
        <code className="block break-all text-[11px] font-semibold">
          20260805090000_create_zero_form.sql
        </code>
      </div>
    </div>
  );
}
