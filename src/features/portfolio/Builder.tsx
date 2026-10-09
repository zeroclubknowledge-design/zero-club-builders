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
import { describePost, postImages } from "./parse";
import { PortfolioRenderer } from "./PortfolioRenderer";
import { recommendWork, toolsFrom } from "./recommend";
import { portfolioStrength } from "./strength";
import {
  ACCENTS,
  ACCENT_HEX,
  SECTION_LABELS,
  normaliseSections,
  portfolioDisplayUrl,
  portfolioUrl,
  type Portfolio,
  type PortfolioItem,
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
    patch: Partial<Pick<PortfolioItem, "problem" | "outcome">>,
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

  const move = (item: PortfolioItem, delta: -1 | 1) => {
    const list = item.kind === "project" ? [...projects] : [...proofs];
    const from = list.findIndex((entry) => entry.id === item.id);
    const to = from + delta;
    if (to < 0 || to >= list.length) return;
    [list[from], list[to]] = [list[to], list[from]];
    if (item.kind === "project") applyOrder(list, proofs);
    else applyOrder(projects, list);
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
  const preview = (
    <PortfolioRenderer
      data={{
        ...draft,
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
              <ul className="space-y-2">
                {projects.map((item, index) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    first={index === 0}
                    last={index === projects.length - 1}
                    onMove={(d) => move(item, d)}
                    onFeature={() => toggleFeatured(item)}
                    onRemove={() => remove(item)}
                    onText={(patch) => patchItemText(item.id, patch)}
                  />
                ))}
              </ul>
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
              <EmptyLine>Posts you highlight show here. Tap Add, or open the ⋯ menu on any of your posts and choose Highlight.</EmptyLine>
            ) : (
              <ul className="space-y-2">
                {proofs.map((item, index) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    first={index === 0}
                    last={index === proofs.length - 1}
                    onMove={(d) => move(item, d)}
                    onRemove={() => remove(item)}
                  />
                ))}
              </ul>
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
            <ul className="divide-y divide-border">
              {draft.portfolio.sections.map((section, index, all) => (
                <li key={section.key} className="flex items-center gap-2 py-2">
                  <span
                    className={`flex-1 text-[14px] ${section.visible ? "" : "text-muted-foreground line-through"}`}
                  >
                    {SECTION_LABELS[section.key]}
                  </span>
                  <IconBtn
                    label="Move up"
                    disabled={index === 0}
                    onClick={() => {
                      const next = [...all];
                      [next[index - 1], next[index]] = [next[index], next[index - 1]];
                      patchPortfolio({ sections: next });
                    }}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </IconBtn>
                  <IconBtn
                    label="Move down"
                    disabled={index === all.length - 1}
                    onClick={() => {
                      const next = [...all];
                      [next[index + 1], next[index]] = [next[index], next[index + 1]];
                      patchPortfolio({ sections: next });
                    }}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </IconBtn>
                  <Switch
                    checked={section.visible}
                    onCheckedChange={(visible) =>
                      patchPortfolio({
                        sections: all.map((s) => (s.key === section.key ? { ...s, visible } : s)),
                      })
                    }
                    aria-label={`Show ${SECTION_LABELS[section.key]}`}
                  />
                </li>
              ))}
            </ul>
          </Card>

          {/* Look */}
          <Card title="Look">
            <p className="text-[13px] text-muted-foreground">Template</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="rounded-xl border-2 border-foreground p-3">
                <p className="text-[14px] font-semibold">Zero Minimal</p>
                <p className="text-[12px] text-muted-foreground">Dark, quiet, work first</p>
              </div>
              <div className="rounded-xl border border-dashed border-border p-3 opacity-60">
                <p className="text-[14px] font-semibold">Zero Studio</p>
                <p className="text-[12px] text-muted-foreground">Coming soon</p>
              </div>
            </div>
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
          </Card>
        </div>

        <div className={`${tab === "preview" ? "block" : "hidden"} min-w-0 @min-[960px]/portfolio:block`}>
          <div className="min-w-0 overflow-hidden @min-[960px]/portfolio:sticky @min-[960px]/portfolio:top-[76px] @min-[960px]/portfolio:h-[calc(100vh-96px)] @min-[960px]/portfolio:overflow-y-auto @min-[960px]/portfolio:rounded-3xl @min-[960px]/portfolio:border @min-[960px]/portfolio:border-border">
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
        <span className="shrink-0 text-[11.5px] tabular-nums text-muted-foreground/70">{count}</span>
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
  first,
  last,
  onMove,
  onFeature,
  onRemove,
  onText,
}: {
  item: PortfolioItem;
  first: boolean;
  last: boolean;
  onMove: (delta: -1 | 1) => void;
  onFeature?: () => void;
  onRemove: () => void;
  onText?: (patch: Partial<Pick<PortfolioItem, "problem" | "outcome">>) => void;
}) {
  const [open, setOpen] = useState(false);
  const { title, summary } = describePost(item.post);
  const image = postImages(item.post)[0];
  const story = Boolean(item.problem && item.outcome);
  return (
    <li className="rounded-xl border border-border bg-background/60">
      <div className="flex items-center gap-2.5 p-2.5">
        {image ? (
          <img
            src={image}
            alt=""
            className="h-11 w-11 shrink-0 rounded-lg object-cover"
            loading="lazy"
          />
        ) : (
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-foreground/[0.06] text-muted-foreground">
            {item.kind === "project" ? <Rocket className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
          </span>
        )}
        <button
          type="button"
          onClick={() => onText && setOpen((v) => !v)}
          className="min-w-0 flex-1 text-left"
        >
          <span className="flex items-center gap-1">
            <span className="truncate text-[14px] font-semibold">
              {item.kind === "project" ? title : summary || title}
            </span>
            {item.post.is_verified_build && (
              <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
            )}
          </span>
          {onText && (
            <span className="text-[12px] text-muted-foreground">
              {story ? "Story added" : "Add problem & outcome"} · {open ? "close" : "edit"}
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
        <div className="flex flex-col">
          <button
            type="button"
            aria-label="Move up"
            disabled={first}
            onClick={() => onMove(-1)}
            className="grid h-5 w-7 place-items-center text-muted-foreground disabled:opacity-25"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Move down"
            disabled={last}
            onClick={() => onMove(1)}
            className="grid h-5 w-7 place-items-center text-muted-foreground disabled:opacity-25"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
        <IconBtn label="Remove from portfolio" onClick={onRemove}>
          <Trash2 className="h-4 w-4" />
        </IconBtn>
      </div>
      {open && onText && (
        <div className="space-y-2 border-t border-border p-3">
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
        </div>
      )}
    </li>
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
