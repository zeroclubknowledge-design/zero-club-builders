import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Award,
  BadgeCheck,
  BriefcaseBusiness,
  Check,
  GraduationCap,
  Loader2,
  Rocket,
  Sparkles,
  Star,
  Tag,
  Zap,
} from "@/components/icons/glyphs";
import { supabase } from "@/lib/supabase";
import { useProfileCredentials } from "@/features/profile/credentials";
import { createPortfolio, fetchMyCandidates, loadPortfolio } from "./api";
import { clip, postImages } from "./parse";
import { recommendWork, toolsFrom, type Recommendation } from "./recommend";
import type { Portfolio } from "./types";

/**
 * First run: scan what the person has already published on Zero Club,
 * recommend the strongest pieces, and let them choose. Nothing is written
 * until they press Continue.
 */
export function SetupWizard({
  profile,
  onCreated,
}: {
  profile: { id: string; username?: string | null; interests?: string[] | null };
  onCreated: (portfolio: Portfolio) => void;
}) {
  const candidates = useQuery({
    queryKey: ["portfolio_candidates", profile.id],
    retry: false,
    queryFn: () => loadPortfolio((signal) => fetchMyCandidates(profile.id, signal)),
  });
  const credentials = useProfileCredentials(profile.id);
  const experiences = credentials.data?.experiences || [];
  const certificates = credentials.data?.certificates || [];
  const learning = useQuery({
    queryKey: ["portfolio_learning_count", profile.id],
    queryFn: async () => {
      const { count } = await supabase
        .from("enrollments")
        .select("id", { count: "exact", head: true })
        .eq("profile_id", profile.id);
      return count || 0;
    },
  });

  // A beat of "scanning" so the summary reads as a result, not a flash.
  const [scanned, setScanned] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setScanned(true), 900);
    return () => clearTimeout(timer);
  }, []);

  const recs = useMemo(() => recommendWork(candidates.data || []), [candidates.data]);
  const projects = recs.filter((r) => r.kind === "project");
  const proofs = recs.filter((r) => r.kind === "proof");
  const tools = useMemo(() => toolsFrom(candidates.data || []), [candidates.data]);

  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [featured, setFeatured] = useState<string | null>(null);
  useEffect(() => {
    if (!candidates.data || selected) return;
    setSelected(new Set(recs.filter((r) => r.recommended).map((r) => r.post.id)));
    setFeatured(projects.find((r) => r.recommended)?.post.id || null);
  }, [candidates.data, recs, projects, selected]);

  const [showAllProofs, setShowAllProofs] = useState(false);
  const [creating, setCreating] = useState(false);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev || []);
      if (next.has(id)) {
        next.delete(id);
        if (featured === id) setFeatured(null);
      } else next.add(id);
      return next;
    });

  const create = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const chosen = recs.filter((r) => selected?.has(r.post.id));
      const chosenProjects = chosen.filter((r) => r.kind === "project");
      const chosenProofs = chosen.filter((r) => r.kind === "proof");
      const skills = Array.from(
        new Map(
          [
            ...toolsFrom(chosenProjects.map((r) => r.post)),
            ...tools,
            ...(profile.interests || []),
          ].map((s) => [s.toLowerCase(), s]),
        ).values(),
      ).slice(0, 12);
      const items = [...chosenProjects, ...chosenProofs].map((r, index) => ({
        post_id: r.post.id,
        kind: r.kind,
        featured: r.post.id === featured,
        sort_order: index,
      }));
      const portfolio = await createPortfolio(profile.id, { skills }, items);
      onCreated(portfolio);
    } catch (error: any) {
      toast.error(error?.message || "Could not create your portfolio");
      setCreating(false);
    }
  };

  if (!profile.username) {
    return (
      <Empty
        title="Pick a username first"
        body="Your portfolio lives at zeroclubs.xyz/@username, so you need one before you start."
        action={
          <Link
            to="/app/profile/edit"
            className="inline-flex h-11 items-center rounded-full bg-foreground px-5 text-[14px] font-semibold text-background"
          >
            Set a username
          </Link>
        }
      />
    );
  }

  if (candidates.isError) {
    return (
      <Empty
        title="Couldn't scan your work"
        body={candidates.error instanceof Error ? candidates.error.message : "Please try again."}
        action={
          <button
            type="button"
            onClick={() => void candidates.refetch()}
            className="inline-flex h-11 items-center rounded-full bg-foreground px-5 text-[14px] font-semibold text-background"
          >
            Try again
          </button>
        }
      />
    );
  }

  if (!scanned || candidates.isLoading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <span className="relative grid h-16 w-16 place-items-center rounded-2xl bg-[#cc208f]/10 text-[#cc208f]">
          <Sparkles className="h-7 w-7 animate-pulse" />
        </span>
        <p className="font-display text-[20px] font-semibold">Scanning your work…</p>
        <p className="max-w-[300px] text-[14px] text-muted-foreground">
          Reading your projects, Zero Proofs, skills and learning on Zero Club.
        </p>
      </div>
    );
  }

  const counts = [
    { Icon: Rocket, n: projects.length, one: "project", many: "projects" },
    { Icon: Zap, n: proofs.length, one: "Zero Proof", many: "Zero Proofs" },
    { Icon: Tag, n: tools.length, one: "tool", many: "tools" },
    { Icon: BriefcaseBusiness, n: experiences.length, one: "role", many: "roles" },
    { Icon: Award, n: certificates.length, one: "certificate", many: "certificates" },
    { Icon: GraduationCap, n: learning.data || 0, one: "bootcamp", many: "bootcamps" },
  ];

  if (recs.length === 0) {
    return (
      <Empty
        title="Nothing to show yet"
        body="A portfolio is built from what you ship. Ship your first project and it will show up here."
        action={
          <div className="flex flex-col items-center gap-2">
            <Link
              to="/app/ship"
              className="inline-flex h-11 items-center rounded-full bg-foreground px-5 text-[14px] font-semibold text-background"
            >
              Ship a project
            </Link>
            <button
              type="button"
              onClick={create}
              className="text-[14px] font-medium text-muted-foreground"
            >
              {creating ? "Creating…" : "Start an empty portfolio"}
            </button>
          </div>
        }
      />
    );
  }

  const visibleProofs = showAllProofs
    ? proofs
    : proofs.filter((r) => r.recommended || selected?.has(r.post.id));
  const count = selected?.size || 0;

  return (
    <div className="mx-auto w-full max-w-[680px] px-4 pb-32 pt-5">
      <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#cc208f]">
        Smart setup
      </p>
      <h2 className="mt-1 font-display text-[26px] font-semibold leading-tight tracking-tight">
        Here's what we found
      </h2>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {counts.map(({ Icon, n, one, many }) => (
          <div key={one} className="rounded-2xl border border-border bg-card p-3">
            <Icon className="h-4 w-4 text-muted-foreground" />
            <p className="mt-2 text-[20px] font-semibold tabular-nums leading-none">{n}</p>
            <p className="mt-1 text-[12px] text-muted-foreground">{n === 1 ? one : many}</p>
          </div>
        ))}
      </div>

      {projects.length > 0 && (
        <>
          <SectionTitle
            title="Projects"
            hint="We picked your strongest. Tap to include, star the one to lead with."
          />
          <div className="space-y-2.5">
            {projects.map((rec) => (
              <PickRow
                key={rec.post.id}
                rec={rec}
                selected={Boolean(selected?.has(rec.post.id))}
                featured={featured === rec.post.id}
                onToggle={() => toggle(rec.post.id)}
                onFeature={() => {
                  if (!selected?.has(rec.post.id)) toggle(rec.post.id);
                  setFeatured(featured === rec.post.id ? null : rec.post.id);
                }}
              />
            ))}
          </div>
        </>
      )}

      {proofs.length > 0 && (
        <>
          <SectionTitle title="Zero Proofs" hint="Posts that show your work in progress." />
          <div className="space-y-2.5">
            {visibleProofs.map((rec) => (
              <PickRow
                key={rec.post.id}
                rec={rec}
                selected={Boolean(selected?.has(rec.post.id))}
                onToggle={() => toggle(rec.post.id)}
              />
            ))}
          </div>
          {!showAllProofs && visibleProofs.length < proofs.length && (
            <button
              type="button"
              onClick={() => setShowAllProofs(true)}
              className="mt-3 w-full rounded-xl border border-dashed border-border py-3 text-[14px] font-medium text-muted-foreground"
            >
              Show all {proofs.length} posts
            </button>
          )}
        </>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur-xl md:static md:mt-8 md:border-0 md:bg-transparent md:p-0">
        <button
          type="button"
          onClick={create}
          disabled={creating}
          className="mx-auto flex h-12 w-full max-w-[680px] items-center justify-center gap-2 rounded-full bg-foreground text-[15px] font-semibold text-background transition active:scale-[0.99] disabled:opacity-60"
        >
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Continue with {count} {count === 1 ? "item" : "items"}
        </button>
      </div>
    </div>
  );
}

function SectionTitle({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="mb-3 mt-8">
      <h3 className="text-[16px] font-semibold">{title}</h3>
      <p className="text-[13px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function PickRow({
  rec,
  selected,
  featured,
  onToggle,
  onFeature,
}: {
  rec: Recommendation;
  selected: boolean;
  featured?: boolean;
  onToggle: () => void;
  onFeature?: () => void;
}) {
  const image = postImages(rec.post)[0];
  return (
    <div
      className={`flex gap-3 rounded-2xl border p-3 transition ${
        selected ? "border-foreground/25 bg-card" : "border-border bg-card/40 opacity-75"
      }`}
    >
      <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 gap-3 text-left">
        <span
          className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border ${
            selected ? "border-foreground bg-foreground text-background" : "border-foreground/30"
          }`}
        >
          {selected && <Check className="h-3.5 w-3.5" />}
        </span>
        {image ? (
          <img
            src={image}
            alt=""
            className="h-14 w-14 shrink-0 rounded-xl object-cover"
            loading="lazy"
          />
        ) : null}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[14.5px] font-semibold">{rec.title}</span>
            {rec.post.is_verified_build && (
              <BadgeCheck className="h-4 w-4 shrink-0 text-emerald-500" />
            )}
          </span>
          {rec.kind === "proof" && (
            <span className="line-clamp-2 text-[13px] text-muted-foreground">
              {clip(rec.summary, 140)}
            </span>
          )}
          <span className="mt-1.5 flex flex-wrap gap-1">
            {rec.recommended && (
              <span className="rounded-full bg-[#cc208f]/10 px-2 py-0.5 text-[11.5px] font-semibold text-[#cc208f]">
                Recommended
              </span>
            )}
            {rec.category && (
              <span className="rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[11.5px] text-muted-foreground">
                {rec.category}
              </span>
            )}
            {rec.reasons.slice(0, 3).map((reason) => (
              <span
                key={reason}
                className="rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[11.5px] text-muted-foreground"
              >
                {reason}
              </span>
            ))}
          </span>
        </span>
      </button>
      {onFeature && (
        <button
          type="button"
          onClick={onFeature}
          aria-label={featured ? "Unfeature" : "Feature"}
          title={featured ? "Featured" : "Feature this project"}
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition ${
            featured
              ? "bg-amber-400/15 text-amber-500"
              : "text-muted-foreground hover:bg-foreground/5"
          }`}
        >
          <Star className={`h-4.5 w-4.5 ${featured ? "fill-current" : ""}`} />
        </button>
      )}
    </div>
  );
}

function Empty({ title, body, action }: { title: string; body: string; action: ReactNode }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="font-display text-[22px] font-semibold">{title}</p>
      <p className="max-w-[340px] text-[14.5px] text-muted-foreground">{body}</p>
      <div className="mt-3">{action}</div>
    </div>
  );
}
