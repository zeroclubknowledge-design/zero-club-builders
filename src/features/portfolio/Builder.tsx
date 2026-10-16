import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  BadgeCheck,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  EyeOff,
  Globe,
  Loader2,
  Pencil,
  Plus,
  Rocket,
  Share2,
  Star,
  Trash2,
  X,
  Zap,
} from "@/components/icons/glyphs";
import { Switch } from "@/components/ui/switch";
import { ZERO_MARK_PATH } from "@/components/ZeroLoader";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { openShareSheet } from "@/components/ShareSheet";
import { useGoBack } from "@/hooks/useGoBack";
import {
  fetchMyCandidates,
  fetchMyPortfolioStats,
  insertItems,
  removeItem,
  saveOrder,
  updateItem,
  updatePortfolio,
} from "./api";
import { describeItem, describePost, postImages } from "./parse";
import { SortableList } from "@/components/SortableList";
import { PortfolioRenderer } from "./PortfolioRenderer";
import { TEMPLATE_CATALOG } from "./templates/catalog";
import { useUser } from "@/hooks/useUser";
import { supabase } from "@/lib/supabase";
import { recommendWork, toolsFrom } from "./recommend";
import { portfolioStrength } from "./strength";
import {
  ACCENTS,
  ACCENT_HEX,
  SECTION_LABELS,
  normaliseSections,
  portfolioDisplayUrl,
  portfolioUrl,
  isPremiumTemplate,
  type Portfolio,
  type PortfolioItem,
  type PortfolioTemplate,
  type PublicPortfolio,
} from "./types";

type SaveState = "idle" | "saving" | "saved" | "error";

/** Projects first, then proofs; each in the owner's chosen order. */
function ordered(items: PortfolioItem[]) {
  return [...items].sort((a, b) => a.sort_order - b.sort_order);
}

export function Builder({ initial }: { initial: PublicPortfolio }) {
  const goBack = useGoBack("/app/profile");
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<PublicPortfolio>(() => ({
    ...initial,
    portfolio: { ...initial.portfolio, sections: normaliseSections(initial.portfolio.sections) },
    items: ordered(initial.items),
  }));
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  /* A premium look the owner is trying on without a membership: shown in the
     preview only, never saved (the server would refuse it anyway). */
  const [tryTemplate, setTryTemplate] = useState<PortfolioTemplate | null>(null);
  const { data: profile } = useUser();
  const premium = useQuery({
    queryKey: ["can_use_premium_portfolio", profile?.id, profile?.is_admin],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("can_use_premium_portfolio" as any);
      if (error) return false;
      return Boolean(data);
    },
    staleTime: 60_000,
  });
  const canPremium = Boolean(profile?.is_admin) || premium.data === true;
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [publishOpen, setPublishOpen] = useState(false);
  const [liveOpen, setLiveOpen] = useState(false);
  // True right after publishing; false when opened from the Share button.
  const [justPublished, setJustPublished] = useState(false);
  const [addKind, setAddKind] = useState<"project" | "proof" | null>(null);
  const [publishing, setPublishing] = useState(false);

  const portfolioId = draft.portfolio.id;
  const username = draft.profile.username;
  const isLive = draft.portfolio.status === "published";

  /* ── Autosave ─────────────────────────────────────────── */
  const pendingPortfolio = useRef<Partial<Portfolio>>({});
  const pendingItems = useRef(new Map<string, Partial<PortfolioItem>>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const portfolioPatch = pendingPortfolio.current;
    const itemPatches = [...pendingItems.current.entries()];
    pendingPortfolio.current = {};
    pendingItems.current = new Map();
    if (!Object.keys(portfolioPatch).length && !itemPatches.length) return;
    setSaveState("saving");
    try {
      await Promise.all([
        Object.keys(portfolioPatch).length ? updatePortfolio(portfolioId, portfolioPatch) : null,
        ...itemPatches.map(([id, patch]) => updateItem(id, patch as any)),
      ]);
      setSaveState("saved");
    } catch (error: any) {
      setSaveState("error");
      toast.error(error?.message || "Could not save your changes");
    }
  }, [portfolioId]);

  const schedule = useCallback(() => {
    setSaveState("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 700);
  }, [flush]);

  // Never lose the last keystrokes when leaving the page.
  useEffect(() => {
    const onHide = () => void flush();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      void flush();
    };
  }, [flush]);

  const patchPortfolio = (patch: Partial<Portfolio>) => {
    setDraft((d) => ({ ...d, portfolio: { ...d.portfolio, ...patch } }));
    pendingPortfolio.current = { ...pendingPortfolio.current, ...patch };
    schedule();
  };

  const patchItemText = (
    id: string,
    patch: Partial<
      Pick<PortfolioItem, "problem" | "outcome" | "display_title" | "display_summary" | "cover_url">
    >,
  ) => {
    setDraft((d) => ({
      ...d,
      items: d.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }));
    pendingItems.current.set(id, { ...(pendingItems.current.get(id) || {}), ...patch });
    schedule();
  };

  const runNow = async (work: () => Promise<unknown>, failure: string) => {
    setSaveState("saving");
    try {
      await work();
      setSaveState("saved");
    } catch (error: any) {
      setSaveState("error");
      toast.error(error?.message || failure);
    }
  };

  /* ── Items ────────────────────────────────────────────── */
  const projects = draft.items.filter((item) => item.kind === "project");
  const proofs = draft.items.filter((item) => item.kind === "proof");

  const applyOrder = (nextProjects: PortfolioItem[], nextProofs: PortfolioItem[]) => {
    const all = [...nextProjects, ...nextProofs].map((item, index) => ({
      ...item,
      sort_order: index,
    }));
    setDraft((d) => ({ ...d, items: all }));
    void runNow(() => saveOrder(all.map((item) => item.id)), "Could not reorder");
  };

  const toggleFeatured = (item: PortfolioItem) => {
    const featured = !item.featured;
    setDraft((d) => ({
      ...d,
      items: d.items.map((entry) => (entry.id === item.id ? { ...entry, featured } : entry)),
    }));
    void runNow(() => updateItem(item.id, { featured }), "Could not update");
  };

  const remove = (item: PortfolioItem) => {
    setDraft((d) => ({ ...d, items: d.items.filter((entry) => entry.id !== item.id) }));
    void runNow(() => removeItem(item.id), "Could not remove");
  };

  const candidates = useQuery({
    queryKey: ["portfolio_candidates", draft.profile.id],
    queryFn: () => fetchMyCandidates(draft.profile.id),
  });
  const recs = useMemo(() => recommendWork(candidates.data || []), [candidates.data]);
  const suggestedSkills = useMemo(() => {
    const have = new Set(draft.portfolio.skills.map((s) => s.toLowerCase()));
    return Array.from(
      new Map(
        [...toolsFrom(candidates.data || []), ...(draft.profile.interests || [])].map((s) => [
          s.toLowerCase(),
          s,
        ]),
      ).values(),
    )
      .filter((s) => !have.has(s.toLowerCase()))
      .slice(0, 10);
  }, [candidates.data, draft.portfolio.skills, draft.profile.interests]);

  const addPost = async (postId: string) => {
    const rec = recs.find((r) => r.post.id === postId);
    if (!rec) return;
    const kind = rec.kind;
    const sort_order = draft.items.length;
    await runNow(async () => {
      const [row] = await insertItems(portfolioId, [
        { post_id: postId, kind, featured: false, sort_order },
      ]);
      if (!row) return;
      const item: PortfolioItem = {
        id: row.id,
        kind,
        featured: false,
        sort_order,
        problem: null,
        outcome: null,
        post: rec.post,
      };
      setDraft((d) => {
        const next = [...d.items, item];
        const p = next.filter((i) => i.kind === "project");
        const q = next.filter((i) => i.kind === "proof");
        return { ...d, items: [...p, ...q].map((i, index) => ({ ...i, sort_order: index })) };
      });
    }, "Could not add");
  };

  /* ── Publish ──────────────────────────────────────────── */
  const strength = portfolioStrength(draft);
  const stats = useQuery({
    queryKey: ["my_portfolio_stats"],
    queryFn: fetchMyPortfolioStats,
    enabled: isLive,
  });

  const setStatus = async (status: "draft" | "published") => {
    setPublishing(true);
    await flush();
    const patch: Partial<Portfolio> = { status };
    if (status === "published" && !draft.portfolio.published_at)
      patch.published_at = new Date().toISOString();
    try {
      await updatePortfolio(portfolioId, patch);
      setDraft((d) => ({ ...d, portfolio: { ...d.portfolio, ...patch } }));
      void queryClient.invalidateQueries({
        queryKey: ["public_portfolio", username.toLowerCase()],
      });
      void queryClient.invalidateQueries({ queryKey: ["my_portfolio"] });
      if (status === "published") {
        setPublishOpen(false);
        setJustPublished(true);
        setLiveOpen(true);
      } else toast.success("Your portfolio is offline. Only you can see it now.");
    } catch (error: any) {
      toast.error(error?.message || "Could not update your portfolio");
    } finally {
      setPublishing(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(portfolioUrl(username));
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy the link");
    }
  };
  const share = () =>
    void openShareSheet({
      url: portfolioUrl(username),
      title: `${draft.profile.full_name || username} — Portfolio`,
      text: "Here's my portfolio — projects I've shipped on Zero Club.",
      heading: "Share your portfolio",
    });

  /* ── Render ───────────────────────────────────────────── */
  const previewTemplate = tryTemplate || draft.portfolio.template;
  const tryName = TEMPLATE_CATALOG.find((t) => t.id === tryTemplate)?.name;
  const chooseTemplate = (template: PortfolioTemplate) => {
    if (isPremiumTemplate(template) && !canPremium) {
      setTryTemplate(template);
      setTab("preview");
      return;
    }
    setTryTemplate(null);
    if (template !== draft.portfolio.template) patchPortfolio({ template });
  };
  const preview = (
    <PortfolioRenderer
      data={{
        ...draft,
        portfolio: { ...draft.portfolio, template: previewTemplate },
        items: [...draft.items].sort(
          (a, b) => Number(b.featured) - Number(a.featured) || a.sort_order - b.sort_order,
        ),
      }}
      preview
    />
  );

  return (
    <div className="@container/portfolio flex min-h-screen w-full min-w-0 flex-col bg-canvas">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-card/95 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-[1400px] items-center gap-1 px-2 md:px-4">
          <button
            type="button"
            onClick={goBack}
            className="grid h-11 w-10 shrink-0 place-items-center rounded-full text-foreground hover:bg-foreground/[0.04]"
            aria-label="Back"
          >
            <ArrowLeft className="h-[22px] w-[22px]" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-[17px] font-semibold leading-tight">Portfolio</h1>
            <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <span
                className={`h-1.5 w-1.5 rounded-full ${isLive ? "bg-emerald-500" : "bg-amber-500"}`}
              />
              {isLive ? "Live" : "Draft"}
              <span aria-live="polite">
                {saveState === "saving"
                  ? " · Saving…"
                  : saveState === "saved"
                    ? " · Saved"
                    : saveState === "error"
                      ? " · Not saved"
                      : ""}
              </span>
            </p>
          </div>
          {isLive ? (
            <button
              type="button"
              onClick={() => {
                setJustPublished(false);
                setLiveOpen(true);
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3.5 text-[13.5px] font-semibold"
            >
              <Share2 className="h-4 w-4" /> Share
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setPublishOpen(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#cc208f] px-4 text-[13.5px] font-semibold text-white"
            >
              Publish
            </button>
          )}
        </div>
        <div className="flex gap-1 px-3 pb-2 @min-[960px]/portfolio:hidden">
          {(["edit", "preview"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`h-9 flex-1 rounded-full text-[14px] font-semibold transition ${
                tab === key ? "bg-foreground text-background" : "text-muted-foreground"
              }`}
            >
              {key === "edit" ? "Edit" : "Preview"}
            </button>
          ))}
        </div>
      </header>

      <div className="mx-auto grid w-full min-w-0 max-w-[1400px] flex-1 grid-cols-[minmax(0,1fr)] @min-[960px]/portfolio:grid-cols-[minmax(0,400px)_minmax(0,1fr)] @min-[960px]/portfolio:gap-6 @min-[960px]/portfolio:px-4 @min-[960px]/portfolio:py-5">
        <div
          className={`${tab === "edit" ? "block" : "hidden"} min-w-0 space-y-3 px-3 pb-28 pt-3 @min-[960px]/portfolio:block @min-[960px]/portfolio:px-0 @min-[960px]/portfolio:pb-10 @min-[960px]/portfolio:pt-0`}
        >
          {/* Status */}
          <Card>
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-foreground/[0.06]">
                <Globe className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14.5px] font-semibold">
                  {portfolioDisplayUrl(username)}
                </p>
                <p className="text-[12.5px] text-muted-foreground">
                  {isLive
                    ? stats.data
                      ? `${stats.data.total.toLocaleString()} views · ${stats.data.last_7_days} this week`
                      : "Live for everyone"
                    : "Draft — only you can see it"}
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={`/@${username}`} target="_blank" rel="noopener" className={chip}>
                <Eye className="h-4 w-4" /> View
              </a>
              {isLive && (
                <>
                  <button type="button" onClick={copyLink} className={chip}>
                    <Copy className="h-4 w-4" /> Copy link
                  </button>
                  <button type="button" onClick={() => void setStatus("draft")} className={chip}>
                    <EyeOff className="h-4 w-4" /> Take offline
                  </button>
                </>
              )}
            </div>
          </Card>

          {/* Strength */}
          <StrengthCard strength={strength} />

          {/* Intro */}
          <Card title="Intro">
            <Label text="Headline" count={`${(draft.portfolio.headline || "").length}/140`} />
            <input
              value={draft.portfolio.headline || ""}
              maxLength={140}
              onChange={(e) => patchPortfolio({ headline: e.target.value })}
              placeholder="What you build, in one line"
              className={field}
            />
            <Label text="About" count={`${(draft.portfolio.about || "").length}/2000`} />
            <textarea
              value={draft.portfolio.about || ""}
              maxLength={2000}
              rows={5}
              onChange={(e) => patchPortfolio({ about: e.target.value })}
              placeholder={
                draft.profile.bio
                  ? `Leave empty to use your bio: “${draft.profile.bio.slice(0, 80)}…”`
                  : "Who you are, what you care about, what you're looking for"
              }
              className={`${field} h-auto resize-none py-2.5 leading-relaxed`}
            />
          </Card>

          {/* Work */}
          <Card
            title="Projects"
            action={
              <button type="button" onClick={() => setAddKind("project")} className={chip}>
                <Plus className="h-4 w-4" /> Add
              </button>
            }
          >
            {projects.length === 0 ? (
              <EmptyLine>
                No projects yet.{" "}
                <Link
                  to="/app/ship"
                  className="font-semibold text-foreground underline-offset-4 hover:underline"
                >
                  Ship one
                </Link>{" "}
                or add one you've shipped.
              </EmptyLine>
            ) : (
              <SortableList
                items={projects}
                getKey={(item) => item.id}
                onChange={(next) => applyOrder(next, proofs)}
                className="space-y-2"
                renderItem={(item, tools) => (
                  <ItemRow
                    item={item}
                    handle={tools.handle}
                    onFeature={() => toggleFeatured(item)}
                    onRemove={() => remove(item)}
                    onText={(patch) => patchItemText(item.id, patch)}
                  />
                )}
              />
            )}
          </Card>

          <Card
            title="Highlights"
            action={
              <button type="button" onClick={() => setAddKind("proof")} className={chip}>
                <Plus className="h-4 w-4" /> Add
              </button>
            }
          >
            {proofs.length === 0 ? (
              <EmptyLine>
                Posts you highlight show here. Tap Add, or open the ⋯ menu on any of your posts and
                choose Highlight.
              </EmptyLine>
            ) : (
              <SortableList
                items={proofs}
                getKey={(item) => item.id}
                onChange={(next) => applyOrder(projects, next)}
                className="space-y-2"
                renderItem={(item, tools) => (
                  <ItemRow
                    item={item}
                    handle={tools.handle}
                    onRemove={() => remove(item)}
                    onText={(patch) => patchItemText(item.id, patch)}
                  />
                )}
              />
            )}
          </Card>

          {/* Skills */}
          <Card title="Skills & tools">
            <SkillsEditor
              skills={draft.portfolio.skills}
              suggestions={suggestedSkills}
              onChange={(skills) => patchPortfolio({ skills })}
            />
          </Card>

          {/* Background lives on the profile; edit it there, once. */}
          <Card title="Experience, certificates & links">
            <p className="text-[13.5px] text-muted-foreground">
              {draft.experiences.length} {draft.experiences.length === 1 ? "role" : "roles"} ·{" "}
              {draft.certificates.length}{" "}
              {draft.certificates.length === 1 ? "certificate" : "certificates"} ·{" "}
              {draft.learning.length} {draft.learning.length === 1 ? "bootcamp" : "bootcamps"}.
              These come from your profile, so they stay the same everywhere.
            </p>
            <Link to="/app/profile/edit" className={`${chip} mt-3`}>
              <Pencil className="h-4 w-4" /> Edit on profile
            </Link>
          </Card>

          {/* Sections */}
          <Card title="Sections">
            <p className="mb-2 text-[12.5px] text-muted-foreground">
              Drag <span className="font-semibold">⋮⋮</span> to set the order your portfolio shows
              them in.
            </p>
            <SortableList
              items={draft.portfolio.sections}
              getKey={(section) => section.key}
              onChange={(next) => patchPortfolio({ sections: next })}
              className="divide-y divide-border"
              renderItem={(section, tools) => (
                <div className="flex items-center gap-2 bg-card py-1.5">
                  {tools.handle}
                  <span
                    className={`flex-1 text-[14px] ${section.visible ? "" : "text-muted-foreground line-through"}`}
                  >
                    {SECTION_LABELS[section.key]}
                  </span>
                  <IconBtn label="Move up" disabled={tools.first} onClick={tools.moveUp}>
                    <ChevronUp className="h-4 w-4" />
                  </IconBtn>
                  <IconBtn label="Move down" disabled={tools.last} onClick={tools.moveDown}>
                    <ChevronDown className="h-4 w-4" />
                  </IconBtn>
                  <Switch
                    checked={section.visible}
                    onCheckedChange={(visible) =>
                      patchPortfolio({
                        sections: draft.portfolio.sections.map((s) =>
                          s.key === section.key ? { ...s, visible } : s,
                        ),
                      })
                    }
                    aria-label={`Show ${SECTION_LABELS[section.key]}`}
                  />
                </div>
              )}
            />
          </Card>

          {/* Look */}
          <Card title="Look">
            <p className="text-[13px] text-muted-foreground">Template</p>
            {draft.portfolio.stored_template &&
              draft.portfolio.stored_template !== draft.portfolio.template &&
              isPremiumTemplate(draft.portfolio.stored_template) && (
                <p className="mt-2 rounded-xl bg-[#cc208f]/[0.08] px-3 py-2 text-[12.5px] leading-snug text-foreground">
                  Your{" "}
                  {TEMPLATE_CATALOG.find((t) => t.id === draft.portfolio.stored_template)?.name}{" "}
                  template is paused while your membership is inactive.{" "}
                  <Link to="/app/premium" className="font-semibold text-[#cc208f]">
                    Renew to bring it back
                  </Link>
                </p>
              )}
            <div className="mt-2 grid grid-cols-2 gap-2">
              {TEMPLATE_CATALOG.map((t) => {
                const selected = (tryTemplate || draft.portfolio.template) === t.id;
                const locked = t.premium && !canPremium;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => chooseTemplate(t.id)}
                    className={`relative overflow-hidden rounded-xl p-2 text-left transition ${selected ? "ring-2 ring-foreground" : "ring-1 ring-border hover:ring-foreground/30"}`}
                  >
                    <TemplateSwatch
                      id={t.id}
                      swatch={t.swatch}
                      accent={ACCENT_HEX[draft.portfolio.accent]}
                    />
                    <div className="mt-2 flex items-center gap-1.5 px-0.5">
                      <p className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">
                        {t.name}
                      </p>
                      {t.premium && (
                        <span
                          className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${locked ? "bg-foreground/[0.08] text-muted-foreground" : "bg-[#cc208f]/12 text-[#cc208f]"}`}
                        >
                          {locked ? "Pro" : "Pro ✓"}
                        </span>
                      )}
                    </div>
                    <p className="line-clamp-2 px-0.5 text-[11.5px] leading-snug text-muted-foreground">
                      {t.blurb}
                    </p>
                  </button>
                );
              })}
            </div>
            {!canPremium && (
              <p className="mt-2 text-[12px] text-muted-foreground">
                Tap a Pro template to preview it with your own work.
              </p>
            )}
            <p className="mt-4 text-[13px] text-muted-foreground">Accent</p>
            <div className="mt-2 flex flex-wrap gap-2.5">
              {ACCENTS.map((accent) => (
                <button
                  key={accent}
                  type="button"
                  aria-label={accent}
                  onClick={() => patchPortfolio({ accent })}
                  className={`grid h-9 w-9 place-items-center rounded-full ring-offset-2 ring-offset-card transition ${
                    draft.portfolio.accent === accent ? "ring-2 ring-foreground" : ""
                  }`}
                  style={{ background: ACCENT_HEX[accent] }}
                >
                  {draft.portfolio.accent === accent && (
                    <Check
                      className={`h-4 w-4 ${accent === "mono" ? "text-black" : "text-white"}`}
                    />
                  )}
                </button>
              ))}
            </div>
          </Card>

          {/* Settings */}
          <Card title="Settings">
            <ToggleRow
              label="Show my numbers"
              hint="Projects shipped, verified, highlights and XP"
              checked={draft.portfolio.show_stats}
              onChange={(show_stats) => patchPortfolio({ show_stats })}
            />
            <ToggleRow
              label="Let search engines find it"
              hint="Turn off to share by link only"
              checked={draft.portfolio.indexable}
              onChange={(indexable) => patchPortfolio({ indexable })}
            />
            {/* Where "Let's talk" goes. */}
            <div className="border-t border-border py-3">
              <p className="text-[14px] font-medium">"Let's talk" button</p>
              <p className="text-[12.5px] text-muted-foreground">Where people reach you from your portfolio.</p>
              <div className="mt-2.5 grid grid-cols-2 gap-1 rounded-full bg-foreground/[0.06] p-1">
                {([
                  ["zeroclub", "Message on Zero Club"],
                  ["email", "Email me"],
                ] as const).map(([value, label]) => {
                  const active = (draft.portfolio.contact_method || "email") === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => patchPortfolio({ contact_method: value })}
                      className={`h-9 rounded-full text-[13px] font-semibold transition ${active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              {(draft.portfolio.contact_method || "email") === "email" && !draft.profile.social_links?.email && (
                <p className="mt-2 text-[12px] text-amber-600">
                  Add an email in Edit profile → Links. Until then, "Let's talk" opens your Zero Club messages.
                </p>
              )}
            </div>
            {/* PRO: swap the Zero Club credit for a personal one. */}
            <div className="border-t border-border pt-1">
              <label className={`flex items-center gap-3 py-2 ${canPremium ? "" : "opacity-60"}`}>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-[14px] font-medium">
                    Show "Built with Zero Club"
                    {!canPremium && <span className="rounded-full bg-[#cc208f]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#cc208f]">PRO</span>}
                  </span>
                  <span className="block text-[12.5px] text-muted-foreground">
                    {canPremium
                      ? `Turn off to show "Built with Love © ${new Date().getFullYear()}" instead`
                      : "PRO members can replace it with “Built with Love”"}
                  </span>
                </span>
                <Switch
                  checked={!canPremium || !draft.portfolio.hide_branding}
                  disabled={!canPremium}
                  onCheckedChange={(on) => patchPortfolio({ hide_branding: !on })}
                />
              </label>
              {!canPremium && (
                <Link to="/app/premium" className="text-[12.5px] font-semibold text-[#cc208f]">Go PRO</Link>
              )}
            </div>
          </Card>
        </div>

        <div
          className={`${tab === "preview" ? "block" : "hidden"} min-w-0 @min-[960px]/portfolio:block`}
        >
          <div className="min-w-0 overflow-hidden @min-[960px]/portfolio:sticky @min-[960px]/portfolio:top-[76px] @min-[960px]/portfolio:h-[calc(100vh-96px)] @min-[960px]/portfolio:overflow-y-auto @min-[960px]/portfolio:rounded-3xl @min-[960px]/portfolio:border @min-[960px]/portfolio:border-border">
            {tryTemplate && (
              <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-border bg-card/95 px-4 py-3 backdrop-blur">
                <p className="min-w-0 flex-1 text-[13px]">
                  <span className="font-semibold">Previewing {tryName}.</span>{" "}
                  <span className="text-muted-foreground">
                    Premium templates are for Zero Club members.
                  </span>
                </p>
                <button
                  type="button"
                  onClick={() => setTryTemplate(null)}
                  className="h-9 rounded-full border border-border px-3.5 text-[13px] font-semibold"
                >
                  Back to mine
                </button>
                <Link
                  to="/app/premium"
                  className="inline-flex h-9 items-center rounded-full bg-[#cc208f] px-4 text-[13px] font-semibold text-white"
                >
                  Go Premium
                </Link>
              </div>
            )}
            {preview}
          </div>
        </div>
      </div>

      <AddDrawer
        kind={addKind}
        onClose={() => setAddKind(null)}
        recs={recs}
        loading={candidates.isLoading}
        taken={new Set(draft.items.map((item) => item.post.id))}
        onAdd={addPost}
      />

      <Drawer open={publishOpen} onOpenChange={setPublishOpen}>
        <DrawerContent className="mx-auto max-w-[520px]">
          <DrawerHeader className="text-left">
            <DrawerTitle>Publish your portfolio</DrawerTitle>
            <DrawerDescription>
              It will be live at {portfolioDisplayUrl(username)}. You can keep editing after.
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-[calc(env(safe-area-inset-bottom)+16px)]">
            <StrengthSummary strength={strength} />
            <button
              type="button"
              disabled={!strength.canPublish || publishing}
              onClick={() => void setStatus("published")}
              className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#cc208f] text-[15px] font-semibold text-white disabled:opacity-50"
            >
              {publishing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Rocket className="h-4 w-4" />
              )}
              {strength.canPublish ? "Publish now" : "Add a project to publish"}
            </button>
            <button
              type="button"
              onClick={() => setPublishOpen(false)}
              className="mt-2 h-11 w-full rounded-full text-[14px] font-medium text-muted-foreground"
            >
              Keep improving
            </button>
          </div>
        </DrawerContent>
      </Drawer>

      <Drawer open={liveOpen} onOpenChange={setLiveOpen}>
        <DrawerContent
          hideClose
          className="zc-share-sheet mx-auto max-w-[520px] overflow-hidden rounded-t-[22px] border-border/40 bg-card pb-[max(1.25rem,env(safe-area-inset-bottom))]"
        >
          {/* The Zero Club mark, large and faint, as on every share sheet. */}
          <svg
            viewBox="0 0 100 100"
            aria-hidden="true"
            className="zc-share-mark pointer-events-none absolute -right-10 -top-6 h-56 w-56 text-[#cc208f]"
          >
            <path d={ZERO_MARK_PATH} fillRule="evenodd" fill="currentColor" />
          </svg>

          <div className="relative flex flex-col items-center px-5 pt-2 text-center">
            {/* The owner's photo in their accent ring, with the Zero Club mark. */}
            <span className="relative">
              <span
                className="grid h-[84px] w-[84px] place-items-center rounded-full p-[3px]"
                style={{
                  background: `linear-gradient(145deg, ${ACCENT_HEX[draft.portfolio.accent] || "#cc208f"} 0%, #cc208f 100%)`,
                }}
              >
                {draft.profile.avatar_url ? (
                  <img
                    src={draft.profile.avatar_url}
                    alt=""
                    className="h-full w-full rounded-full border-[3px] border-card object-cover"
                  />
                ) : (
                  <span className="grid h-full w-full place-items-center rounded-full border-[3px] border-card bg-foreground/[0.06] text-[28px] font-semibold">
                    {(draft.profile.full_name || username).charAt(0).toUpperCase()}
                  </span>
                )}
              </span>
              <span className="absolute -bottom-0.5 -right-0.5 grid h-7 w-7 place-items-center rounded-full border-2 border-card bg-[#cc208f]">
                <svg viewBox="0 0 100 100" className="h-4 w-4 text-white" aria-hidden="true">
                  <path d={ZERO_MARK_PATH} fillRule="evenodd" fill="currentColor" />
                </svg>
              </span>
            </span>
            <DrawerTitle className="mt-3.5 text-[18px] font-semibold tracking-[-0.01em] text-foreground">
              {justPublished ? "Your portfolio is live" : "Share your portfolio"}
            </DrawerTitle>
            <DrawerDescription className="mt-1 text-[13.5px] text-muted-foreground">
              Put it in your bio, your CV and your applications.
            </DrawerDescription>
          </div>

          <div className="relative mt-5 space-y-2 px-4">
            <button
              type="button"
              onClick={copyLink}
              className="flex h-12 w-full items-center gap-2 rounded-2xl border border-border bg-background/70 px-4 text-left backdrop-blur-sm"
            >
              <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate text-[14.5px] font-semibold">
                {portfolioDisplayUrl(username)}
              </span>
              <Copy className="h-4 w-4 text-muted-foreground" />
            </button>
            <div className="grid grid-cols-2 gap-2">
              <a
                href={`/@${username}`}
                target="_blank"
                rel="noopener"
                className="flex h-12 items-center justify-center gap-2 rounded-full border border-border bg-background/70 text-[14.5px] font-semibold"
              >
                <Eye className="h-4 w-4" /> View
              </a>
              <button
                type="button"
                onClick={share}
                className="flex h-12 items-center justify-center gap-2 rounded-full bg-[#cc208f] text-[14.5px] font-semibold text-white"
              >
                <Share2 className="h-4 w-4" /> Share
              </button>
            </div>
            <button
              type="button"
              onClick={() => setLiveOpen(false)}
              className="h-11 w-full rounded-full text-[14px] font-medium text-muted-foreground"
            >
              Keep editing
            </button>
          </div>

          <div className="relative mx-5 mt-1 flex items-center justify-center gap-1.5 text-[11px] font-medium text-muted-foreground/80">
            <svg viewBox="0 0 100 100" className="h-3 w-3 text-[#cc208f]" aria-hidden="true">
              <path d={ZERO_MARK_PATH} fillRule="evenodd" fill="currentColor" />
            </svg>
            Built with Zero Club
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

/* ── Pieces ─────────────────────────────────────────────── */

const chip =
  "inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3.5 text-[13.5px] font-medium transition hover:bg-foreground/[0.04] active:scale-[0.98]";
const field =
  "mt-1.5 h-11 w-full min-w-0 max-w-full rounded-xl border border-border bg-background px-3.5 text-[16px] outline-none transition focus:border-foreground/40";

/** A tiny drawing of each template so the picker shows a shape, not just a name. */
function TemplateSwatch({
  id,
  swatch,
  accent,
}: {
  id: PortfolioTemplate;
  swatch: { bg: string; fg: string; light: boolean };
  accent: string;
}) {
  const a = swatch.light && accent === ACCENT_HEX.mono ? "#18181b" : accent;
  const line = (w: string, o = 0.5, h = 3) => (
    <span
      className="block rounded-full"
      style={{ width: w, height: h, background: swatch.fg, opacity: o }}
    />
  );
  return (
    <div className="relative h-[74px] overflow-hidden rounded-lg" style={{ background: swatch.bg }}>
      {id === "minimal" && (
        <div className="space-y-1.5 p-2.5">
          <span
            className="block h-4 w-4 rounded-full"
            style={{ background: swatch.fg, opacity: 0.25 }}
          />
          {line("70%", 0.9, 5)}
          {line("50%", 0.4)}
          <div className="grid grid-cols-2 gap-1 pt-0.5">
            <span className="h-4 rounded" style={{ background: swatch.fg, opacity: 0.1 }} />
            <span className="h-4 rounded" style={{ background: swatch.fg, opacity: 0.1 }} />
          </div>
        </div>
      )}
      {id === "signal" && (
        <div className="flex h-full gap-1.5 p-2">
          <div className="w-[34%] rounded-md p-1" style={{ background: "#ffffff10" }}>
            <span className="block h-7 rounded" style={{ background: "#ffffff22" }} />
            <span
              className="mt-1 block h-1.5 w-3/4 rounded-full"
              style={{ background: swatch.fg, opacity: 0.6 }}
            />
            <span className="mt-1 block h-2 w-1/2 rounded-full" style={{ background: a }} />
          </div>
          <div className="flex-1 space-y-1 rounded-md p-1.5" style={{ background: "#ffffff10" }}>
            {line("90%", 0.8, 4)}
            <span className="block h-[5px] w-2/5 rounded-full" style={{ background: a }} />
            <div className="grid grid-cols-2 gap-1 pt-1">
              <span className="h-5 rounded" style={{ background: "#ffffff14" }} />
              <span className="h-5 rounded" style={{ background: "#ffffff14" }} />
            </div>
          </div>
        </div>
      )}
      {id === "spotlight" && (
        <div className="relative h-full">
          <div
            className="absolute inset-0"
            style={{ background: `radial-gradient(60% 80% at 70% 40%, ${a}88, transparent 70%)` }}
          />
          <p
            className="absolute bottom-3 left-1.5 right-0 whitespace-nowrap font-serif text-[22px] leading-none"
            style={{ color: swatch.fg }}
          >
            Name Sur
          </p>
          <span className="absolute bottom-1 left-0 right-0 h-[3px]" style={{ background: a }} />
        </div>
      )}
      {id === "statement" && (
        <div className="relative h-full p-2">
          <p
            className="text-[19px] font-black leading-[0.85] tracking-tight"
            style={{ color: swatch.fg }}
          >
            NAME
            <br />
            .SUR
          </p>
          <span
            className="absolute bottom-2 right-2 grid h-7 w-7 place-items-center rounded-full border text-[7px] font-bold"
            style={{ borderColor: `${swatch.fg}55`, color: swatch.fg }}
          >
            ✦
          </span>
          <span
            className="absolute bottom-0 left-1/2 h-6 w-10 -translate-x-1/2 rounded-t-full"
            style={{ background: `radial-gradient(circle at 50% 100%, #ffd59a, ${a})` }}
          />
        </div>
      )}
      {id === "bright" && (
        <div className="flex h-full items-center gap-2 p-2.5">
          <div className="flex-1 space-y-1">
            {line("85%", 0.9, 4)}
            {line("60%", 0.9, 4)}
            <span className="block h-2 w-8 rounded-sm" style={{ background: a }} />
          </div>
          <div className="relative h-12 w-12">
            <span
              className="absolute -right-1 -top-1 h-8 w-8 rotate-12 rounded-lg"
              style={{ background: a }}
            />
            <span
              className="absolute inset-1 rounded-full border-2"
              style={{ background: "#d9d6cf", borderColor: swatch.bg }}
            />
          </div>
        </div>
      )}
      {id === "gallery" && (
        <div className="h-full">
          <div
            className="flex h-[42%] items-center justify-center gap-1"
            style={{ background: "#0d0f1a" }}
          >
            <span className="text-[9px] font-extrabold text-white">
              I Am You<span style={{ color: a }}>.</span>
            </span>
            <span className="h-4 w-4 rounded-full" style={{ background: a }} />
          </div>
          <div className="grid grid-cols-3 gap-0.5 p-1">
            {[10, 16, 12, 14, 9, 13].map((h, i) => (
              <span
                key={i}
                className="rounded-sm"
                style={{ height: h, background: i % 2 ? `${a}55` : "#00000018" }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Card({
  title,
  action,
  children,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-2xl border border-border bg-card p-4">
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-[15px] font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

function Label({ text, count }: { text: string; count?: string }) {
  return (
    <div className="mt-3 flex min-w-0 items-center justify-between gap-2 first:mt-0">
      <span className="text-[13px] font-medium text-muted-foreground">{text}</span>
      {count && (
        <span className="shrink-0 text-[11.5px] tabular-nums text-muted-foreground/70">
          {count}
        </span>
      )}
    </div>
  );
}

function EmptyLine({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-border px-3 py-4 text-[13.5px] text-muted-foreground">
      {children}
    </p>
  );
}

function IconBtn({
  label,
  onClick,
  disabled,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`grid h-8 w-8 shrink-0 place-items-center rounded-full transition disabled:opacity-30 ${
        active
          ? "bg-amber-400/15 text-amber-500"
          : "text-muted-foreground hover:bg-foreground/[0.06]"
      }`}
    >
      {children}
    </button>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 py-2">
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium">{label}</span>
        <span className="block text-[12.5px] text-muted-foreground">{hint}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function ItemRow({
  item,
  handle,
  onFeature,
  onRemove,
  onText,
}: {
  item: PortfolioItem;
  handle: ReactNode;
  onFeature?: () => void;
  onRemove: () => void;
  onText?: (
    patch: Partial<
      Pick<PortfolioItem, "problem" | "outcome" | "display_title" | "display_summary" | "cover_url">
    >,
  ) => void;
}) {
  const [open, setOpen] = useState(false);
  const original = describePost(item.post);
  const { title, summary } = describeItem(item);
  const images = postImages(item.post);
  const cover = item.cover_url && images.includes(item.cover_url) ? item.cover_url : images[0];
  const project = item.kind === "project";
  const edited = Boolean(item.display_title || item.display_summary || item.cover_url);
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-1.5 p-2 pl-1">
        {handle}
        {cover ? (
          <img
            src={cover}
            alt=""
            className="h-11 w-11 shrink-0 rounded-lg object-cover"
            loading="lazy"
          />
        ) : (
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-foreground/[0.06] text-muted-foreground">
            {project ? <Rocket className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
          </span>
        )}
        <button
          type="button"
          onClick={() => onText && setOpen((v) => !v)}
          className="ml-1 min-w-0 flex-1 text-left"
        >
          <span className="flex items-center gap-1">
            <span className="truncate text-[14px] font-semibold">
              {project ? title : summary || title}
            </span>
            {item.post.is_verified_build && (
              <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
            )}
          </span>
          {onText && (
            <span className="text-[12px] text-muted-foreground">
              {open ? "Close" : edited ? "Edited · tap to change" : "Tap to edit this card"}
            </span>
          )}
        </button>
        {onFeature && (
          <IconBtn
            label={item.featured ? "Unfeature" : "Feature"}
            active={item.featured}
            onClick={onFeature}
          >
            <Star className={`h-4 w-4 ${item.featured ? "fill-current" : ""}`} />
          </IconBtn>
        )}
        <IconBtn label="Remove from portfolio" onClick={onRemove}>
          <Trash2 className="h-4 w-4" />
        </IconBtn>
      </div>
      {open && onText && (
        <div className="space-y-2 border-t border-border p-3">
          <p className="text-[12px] leading-snug text-muted-foreground">
            Changes here only affect how this card looks on your portfolio. Your post stays as it
            is.
          </p>
          {project && (
            <>
              <Label text="Title" count={`${(item.display_title || "").length}/120`} />
              <input
                value={item.display_title || ""}
                maxLength={120}
                onChange={(e) => onText({ display_title: e.target.value || null })}
                placeholder={original.title}
                className={field}
              />
            </>
          )}
          <Label
            text={project ? "Short description" : "Caption"}
            count={`${(item.display_summary || "").length}/600`}
          />
          <textarea
            value={item.display_summary || ""}
            maxLength={600}
            rows={3}
            onChange={(e) => onText({ display_summary: e.target.value || null })}
            placeholder={original.summary.slice(0, 160) || "Describe this in a sentence or two"}
            className={`${field} h-auto resize-none py-2.5`}
          />
          {images.length > 1 && (
            <>
              <Label text="Cover image" />
              <div className="flex gap-2 overflow-x-auto pb-1">
                {images.map((url) => (
                  <button
                    key={url}
                    type="button"
                    onClick={() => onText({ cover_url: url === images[0] ? null : url })}
                    className={`shrink-0 overflow-hidden rounded-lg ring-offset-2 ring-offset-card ${url === cover ? "ring-2 ring-foreground" : "opacity-70 hover:opacity-100"}`}
                    aria-label="Use as cover"
                  >
                    <img src={url} alt="" className="h-14 w-20 object-cover" loading="lazy" />
                  </button>
                ))}
              </div>
            </>
          )}
          {project && (
            <>
              <Label
                text="Problem — what needed solving?"
                count={`${(item.problem || "").length}/1500`}
              />
              <textarea
                value={item.problem || ""}
                maxLength={1500}
                rows={3}
                onChange={(e) => onText({ problem: e.target.value || null })}
                placeholder="e.g. Small shops lost orders because customers' WhatsApp messages went unanswered"
                className={`${field} h-auto resize-none py-2.5`}
              />
              <Label text="Outcome — what changed?" count={`${(item.outcome || "").length}/1500`} />
              <textarea
                value={item.outcome || ""}
                maxLength={1500}
                rows={3}
                onChange={(e) => onText({ outcome: e.target.value || null })}
                placeholder="Only what really happened: users, results, what you learned"
                className={`${field} h-auto resize-none py-2.5`}
              />
            </>
          )}
          {edited && (
            <button
              type="button"
              onClick={() =>
                onText({ display_title: null, display_summary: null, cover_url: null })
              }
              className="text-[12.5px] font-semibold text-muted-foreground hover:text-foreground"
            >
              Reset to the original post
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SkillsEditor({
  skills,
  suggestions,
  onChange,
}: {
  skills: string[];
  suggestions: string[];
  onChange: (skills: string[]) => void;
}) {
  const [value, setValue] = useState("");
  const add = (raw: string) => {
    const skill = raw.trim().replace(/^#/, "").slice(0, 40);
    if (!skill || skills.length >= 30) return;
    if (skills.some((s) => s.toLowerCase() === skill.toLowerCase())) return;
    onChange([...skills, skill]);
  };
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {skills.map((skill) => (
          <span
            key={skill}
            className="inline-flex items-center gap-1 rounded-full bg-foreground/[0.07] py-1 pl-3 pr-1 text-[13px]"
          >
            {skill}
            <button
              type="button"
              aria-label={`Remove ${skill}`}
              onClick={() => onChange(skills.filter((s) => s !== skill))}
              className="grid h-5 w-5 place-items-center rounded-full text-muted-foreground hover:bg-foreground/10"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {skills.length === 0 && (
          <span className="text-[13px] text-muted-foreground">No skills yet.</span>
        )}
      </div>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add(value);
          setValue("");
        }}
      >
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Add a skill or tool"
          className={`${field} mt-0`}
        />
        <button
          type="submit"
          className="h-11 shrink-0 rounded-xl bg-foreground px-4 text-[14px] font-semibold text-background"
        >
          Add
        </button>
      </form>
      {suggestions.length > 0 && (
        <div className="mt-3">
          <p className="text-[12px] text-muted-foreground">From your ships and interests</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {suggestions.map((skill) => (
              <button
                key={skill}
                type="button"
                onClick={() => add(skill)}
                className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-[12.5px] text-muted-foreground hover:text-foreground"
              >
                <Plus className="h-3 w-3" /> {skill}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

type Strength = ReturnType<typeof portfolioStrength>;

function StrengthMeter({ score }: { score: number }) {
  const tone = score >= 80 ? "bg-emerald-500" : score >= 50 ? "bg-amber-500" : "bg-[#cc208f]";
  return (
    <div className="h-2 overflow-hidden rounded-full bg-foreground/[0.08]">
      <div
        className={`h-full rounded-full transition-all duration-500 ${tone}`}
        style={{ width: `${score}%` }}
      />
    </div>
  );
}

function StrengthCard({ strength }: { strength: Strength }) {
  const [all, setAll] = useState(false);
  const todo = strength.checks.filter((c) => !c.done);
  const list = all ? strength.checks : todo.slice(0, 4);
  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold">Portfolio strength</h2>
        <span className="shrink-0 text-[20px] font-semibold tabular-nums">{strength.score}%</span>
      </div>
      <div className="mt-2">
        <StrengthMeter score={strength.score} />
      </div>
      {list.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {list.map((check) => (
            <li key={check.key} className="flex items-center gap-2 text-[13.5px]">
              <span
                className={`grid h-4.5 w-4.5 shrink-0 place-items-center rounded-full ${
                  check.done ? "bg-emerald-500 text-white" : "border border-foreground/25"
                }`}
              >
                {check.done && <Check className="h-3 w-3" />}
              </span>
              <span className={check.done ? "text-muted-foreground line-through" : ""}>
                {check.label}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[13.5px] text-muted-foreground">
          Everything's in place. Nice work.
        </p>
      )}
      <button
        type="button"
        onClick={() => setAll((v) => !v)}
        className="mt-2 text-[13px] font-medium text-muted-foreground"
      >
        {all ? "Show to-dos only" : `See all ${strength.checks.length} checks`}
      </button>
    </Card>
  );
}

function StrengthSummary({ strength }: { strength: Strength }) {
  const todo = strength.checks.filter((c) => !c.done);
  return (
    <div className="rounded-2xl border border-border p-4">
      <div className="flex items-baseline justify-between">
        <span className="text-[14px] font-semibold">Strength</span>
        <span className="text-[18px] font-semibold tabular-nums">{strength.score}%</span>
      </div>
      <div className="mt-2">
        <StrengthMeter score={strength.score} />
      </div>
      {todo.length > 0 && (
        <p className="mt-2 text-[13px] text-muted-foreground">
          Still worth doing:{" "}
          {todo
            .slice(0, 3)
            .map((c) => c.label.toLowerCase())
            .join(", ")}
          {todo.length > 3 ? `, and ${todo.length - 3} more` : ""}.
        </p>
      )}
    </div>
  );
}

function AddDrawer({
  kind,
  onClose,
  recs,
  loading,
  taken,
  onAdd,
}: {
  kind: "project" | "proof" | null;
  onClose: () => void;
  recs: ReturnType<typeof recommendWork>;
  loading: boolean;
  taken: Set<string>;
  onAdd: (postId: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const list = recs.filter((r) => r.kind === kind);
  return (
    <Drawer open={Boolean(kind)} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="mx-auto max-h-[85vh] max-w-[560px]">
        <DrawerHeader className="text-left">
          <DrawerTitle>{kind === "project" ? "Add projects" : "Add highlights"}</DrawerTitle>
          <DrawerDescription>
            Only things you've shared with everyone can go on your portfolio.
          </DrawerDescription>
        </DrawerHeader>
        <div className="overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+16px)]">
          {loading ? (
            <div className="grid place-items-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : list.length === 0 ? (
            <p className="py-8 text-center text-[14px] text-muted-foreground">
              {kind === "project"
                ? "You haven't shipped a public project yet."
                : "No public posts yet."}
            </p>
          ) : (
            <ul className="space-y-2">
              {list.map((rec) => {
                const added = taken.has(rec.post.id);
                const image = postImages(rec.post)[0];
                return (
                  <li
                    key={rec.post.id}
                    className="flex items-center gap-3 rounded-xl border border-border p-2.5"
                  >
                    {image ? (
                      <img
                        src={image}
                        alt=""
                        className="h-11 w-11 shrink-0 rounded-lg object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-foreground/[0.06]">
                        <Rocket className="h-4 w-4 text-muted-foreground" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-semibold">
                        {rec.kind === "project" ? rec.title : rec.summary.slice(0, 80) || rec.title}
                      </p>
                      <p className="truncate text-[12px] text-muted-foreground">
                        {rec.recommended ? "Recommended · " : ""}
                        {rec.reasons.slice(0, 2).join(" · ") ||
                          new Date(rec.post.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={added || busy === rec.post.id}
                      onClick={async () => {
                        setBusy(rec.post.id);
                        await onAdd(rec.post.id);
                        setBusy(null);
                      }}
                      className={`inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-[13px] font-semibold ${
                        added ? "text-muted-foreground" : "bg-foreground text-background"
                      }`}
                    >
                      {busy === rec.post.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : added ? (
                        <>
                          <Check className="h-3.5 w-3.5" /> Added
                        </>
                      ) : (
                        "Add"
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
