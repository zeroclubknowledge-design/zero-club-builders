import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BadgeCheck,
  Banknote,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  Clock3,
  Loader2,
  Lock,
  Plus,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
} from "@/components/icons/glyphs";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useWalletCurrency } from "@/hooks/useWalletCurrency";
import { LinkifiedText } from "@/components/LinkifiedText";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useGoBack } from "@/hooks/useGoBack";

export const Route = createFileRoute("/app/quests")({
  /* ?gig=<id> opens that job, e.g. from a hiring notification. */
  validateSearch: (search: Record<string, unknown>): { gig?: string } =>
    typeof search.gig === "string" ? { gig: search.gig } : {},
  component: GigMarketplace,
});

/** ZP a poster earns when a job they posted is finished and paid. */
const JOB_DONE_ZP = 300;

type MarketplaceTab = "browse" | "applications" | "posted";

type Gig = {
  id: string;
  client_id: string;
  title: string;
  description: string;
  category: string;
  skills: string[];
  budget_type: "fixed" | "hourly";
  budget_min: number;
  budget_max: number;
  experience_level: string;
  location_type: string;
  deadline: string | null;
  status: "open" | "paused" | "closed" | "in_progress" | "disputed" | "completed";
  applications_count: number;
  created_at: string;
  hired_profile_id?: string | null;
  hired_application_id?: string | null;
  escrow_amount?: number;
  hired_at?: string | null;
  completed_at?: string | null;
  dispute_reason?: string | null;
  hired?: Gig["client"];
  client?: {
    id: string;
    username?: string;
    full_name?: string;
    avatar_url?: string;
    account_type?: string;
  } | null;
  viewer_application?: any;
};

const CATEGORIES = ["All", "Design", "Development", "Writing", "Marketing", "Data", "Operations"];
const WORK_TYPES = ["All work types", "Remote", "Hybrid", "On-site"];

const defaultGigForm = {
  title: "",
  description: "",
  category: "Development",
  skills: "",
  budgetType: "fixed" as "fixed" | "hourly",
  budgetMin: "",
  budgetMax: "",
  experienceLevel: "Intermediate",
  locationType: "Remote",
  deadline: "",
};

const defaultProposal = {
  coverNote: "",
  proposedAmount: "",
  deliveryDays: "",
  portfolioUrl: "",
};

function relativeDate(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.floor(diff / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function GigMarketplace() {
  const queryClient = useQueryClient();
  const goBack = useGoBack("/app");
  const { details: currency, format, toBaseAmount } = useWalletCurrency();
  const [activeTab, setActiveTab] = useState<MarketplaceTab>("browse");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [workType, setWorkType] = useState("All work types");
  const [budgetFloor, setBudgetFloor] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedGigId, setSelectedGigId] = useState<string | null>(null);
  const { gig: gigParam } = Route.useSearch();
  const [detailMode, setDetailMode] = useState<"details" | "apply">("details");
  const [postOpen, setPostOpen] = useState(false);
  const [gigForm, setGigForm] = useState(defaultGigForm);
  const [proposal, setProposal] = useState(defaultProposal);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["gig-marketplace"],
    queryFn: async () => {
      const { data: authData } = await supabase.auth.getSession();
      const viewerId = authData.session?.user.id || null;

      const { data: gigs, error: gigsError } = await supabase
        .from("gigs")
        .select("*")
        .order("created_at", { ascending: false });
      if (gigsError) throw gigsError;

      const clientIds = [
        ...new Set(
          (gigs || []).flatMap((gig: any) => [gig.client_id, gig.hired_profile_id]).filter(Boolean),
        ),
      ];
      const gigIds = (gigs || []).map((gig: any) => gig.id);
      const [{ data: clients }, { data: applications }, { data: viewerProfile }] =
        await Promise.all([
          clientIds.length
            ? supabase
                .from("profiles")
                .select("id, username, full_name, avatar_url, account_type")
                .in("id", clientIds)
            : Promise.resolve({ data: [] as any[] }),
          viewerId && gigIds.length
            ? supabase
                .from("gig_applications")
                .select("*")
                .eq("applicant_id", viewerId)
                .in("gig_id", gigIds)
            : Promise.resolve({ data: [] as any[] }),
          viewerId
            ? supabase
                .from("profiles")
                .select("account_type, is_admin, coins")
                .eq("id", viewerId)
                .maybeSingle()
            : Promise.resolve({ data: null as any }),
        ]);

      const clientMap = new Map((clients || []).map((client: any) => [client.id, client]));
      const applicationMap = new Map(
        (applications || []).map((application: any) => [application.gig_id, application]),
      );
      const enriched = (gigs || []).map((gig: any) => ({
        ...gig,
        skills: gig.skills || [],
        client: clientMap.get(gig.client_id) || null,
        hired: gig.hired_profile_id ? clientMap.get(gig.hired_profile_id) || null : null,
        viewer_application: applicationMap.get(gig.id) || null,
      })) as Gig[];

      return {
        viewerId,
        gigs: enriched,
        // Anyone signed in can post a job. Money is only held when they hire.
        canPostGig: Boolean(viewerId),
        walletBalance: Number(viewerProfile?.coins) || 0,
      };
    },
    staleTime: 20_000,
  });

  const viewerId = data?.viewerId || null;
  const gigs = data?.gigs || [];
  const canPostGig = Boolean(data?.canPostGig);
  const walletBalance = data?.walletBalance || 0;
  const selectedGig = selectedGigId ? gigs.find((gig) => gig.id === selectedGigId) || null : null;

  // Open the job named in the link once the list has loaded.
  useEffect(() => {
    if (gigParam && gigs.some((gig) => gig.id === gigParam)) setSelectedGigId(gigParam);
  }, [gigParam, gigs]);

  const filteredGigs = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const minimumBudget = budgetFloor ? toBaseAmount(Number(budgetFloor)) : 0;

    return gigs.filter((gig) => {
      if (activeTab === "browse" && gig.status !== "open") return false;
      if (
        activeTab === "applications" &&
        !gig.viewer_application &&
        gig.hired_profile_id !== viewerId
      )
        return false;
      if (activeTab === "posted" && gig.client_id !== viewerId) return false;
      if (category !== "All" && gig.category !== category) return false;
      if (workType !== "All work types" && gig.location_type !== workType) return false;
      if (minimumBudget && Number(gig.budget_max) < minimumBudget) return false;
      if (!normalizedSearch) return true;

      return [gig.title, gig.description, gig.category, ...(gig.skills || [])]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch);
    });
  }, [activeTab, budgetFloor, category, gigs, search, toBaseAmount, viewerId, workType]);

  const createGig = useMutation({
    mutationFn: async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) throw new Error("Sign in to post a job");
      if (gigForm.title.trim().length < 5)
        throw new Error("Give the job a title of at least 5 characters");
      if (gigForm.description.trim().length < 20)
        throw new Error("Describe the work in at least a couple of sentences");

      const min = toBaseAmount(Number(gigForm.budgetMin) || 0);
      const max = toBaseAmount(Number(gigForm.budgetMax) || Number(gigForm.budgetMin) || 0);
      if (min <= 0 || max < min) throw new Error("Enter a valid budget range");

      const { error } = await supabase.from("gigs").insert({
        client_id: authData.user.id,
        title: gigForm.title.trim(),
        description: gigForm.description.trim(),
        category: gigForm.category,
        skills: gigForm.skills
          .split(",")
          .map((skill) => skill.trim())
          .filter(Boolean)
          .slice(0, 10),
        budget_type: gigForm.budgetType,
        budget_min: min,
        budget_max: max,
        experience_level: gigForm.experienceLevel,
        location_type: gigForm.locationType,
        deadline: gigForm.deadline || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Job posted", { description: "You'll be notified as proposals come in." });
      setGigForm(defaultGigForm);
      setPostOpen(false);
      setActiveTab("posted");
      queryClient.invalidateQueries({ queryKey: ["gig-marketplace"] });
    },
    onError: (error: any) => toast.error(error.message || "Could not post this job"),
  });

  const applyToGig = useMutation({
    mutationFn: async () => {
      if (!selectedGig) throw new Error("Choose a gig first");
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) throw new Error("Sign in to send a proposal");
      if (proposal.coverNote.trim().length < 40)
        throw new Error("Tell the client how you will approach the work");
      if (!proposal.deliveryDays || Number(proposal.deliveryDays) < 1)
        throw new Error("Add a delivery estimate");

      const { error } = await supabase.from("gig_applications").insert({
        gig_id: selectedGig.id,
        applicant_id: authData.user.id,
        cover_note: proposal.coverNote.trim(),
        proposed_amount: toBaseAmount(
          Number(proposal.proposedAmount) || Number(selectedGig.budget_min),
        ),
        delivery_days: Number(proposal.deliveryDays),
        portfolio_url: proposal.portfolioUrl.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Proposal sent");
      setProposal(defaultProposal);
      setDetailMode("details");
      queryClient.invalidateQueries({ queryKey: ["gig-marketplace"] });
    },
    onError: (error: any) => toast.error(error.message || "Could not send your proposal"),
  });

  const allTabs: { id: MarketplaceTab; label: string; count?: number }[] = [
    { id: "browse", label: "Find work", count: gigs.filter((gig) => gig.status === "open").length },
    {
      id: "applications",
      label: "My work",
      count: gigs.filter((gig) => gig.viewer_application || gig.hired_profile_id === viewerId)
        .length,
    },
    {
      id: "posted",
      label: "My jobs",
      count: gigs.filter((gig) => gig.client_id === viewerId).length,
    },
  ];
  const tabs = allTabs.filter((tab) => tab.id !== "posted" || canPostGig || Number(tab.count) > 0);

  const openGig = (gig: Gig) => {
    setSelectedGigId(gig.id);
    setDetailMode("details");
    setProposal({
      ...defaultProposal,
      proposedAmount: String(Number(gig.budget_min) / currency.rate),
    });
  };

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-foreground">
      <header className="sticky top-0 z-40 bg-card pt-[env(safe-area-inset-top)]">
        <div className="zc-page-width mx-auto flex h-14 max-w-[900px] items-center gap-1 px-2">
          <button
            type="button"
            onClick={goBack}
            aria-label="Back"
            className="grid h-11 w-10 shrink-0 place-items-center rounded-full text-foreground tap hover:bg-foreground/[0.04]"
          >
            <ArrowLeft className="h-[22px] w-[22px]" />
          </button>
          <h1 className="flex-1 truncate font-display text-[18px] font-semibold">Opportunities</h1>
          {canPostGig && (
            <button
              onClick={() => setPostOpen(true)}
              className="mr-2 flex h-9 shrink-0 items-center gap-1 rounded-full bg-foreground px-3.5 text-[14px] font-semibold text-background tap hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> Post a job
            </button>
          )}
        </div>
        <div className="zc-page-width mx-auto max-w-[900px] px-4 pb-3">
          <div className="flex gap-2">
            <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg bg-foreground/[0.05] px-3">
              <Search className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search roles, skills, or industries"
                aria-label="Search jobs"
                className="min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
              />
            </label>
            <button
              onClick={() => setShowFilters((value) => !value)}
              aria-pressed={showFilters}
              aria-label="Filters"
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${showFilters ? "bg-foreground text-background" : "bg-foreground/[0.05] text-foreground"}`}
            >
              <SlidersHorizontal className="h-[18px] w-[18px]" />
            </button>
          </div>
          {showFilters && (
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <FilterSelect
                label="Category"
                value={category}
                onChange={setCategory}
                options={CATEGORIES}
              />
              <FilterSelect
                label="Work type"
                value={workType}
                onChange={setWorkType}
                options={WORK_TYPES}
              />
              <label className="space-y-1.5">
                <span className="text-[12px] font-semibold text-muted-foreground">
                  Minimum budget
                </span>
                <div className="flex h-10 items-center rounded-lg border border-border bg-card px-3">
                  <span className="mr-2 text-[14px] text-muted-foreground">{currency.symbol}</span>
                  <input
                    type="number"
                    min="0"
                    value={budgetFloor}
                    onChange={(event) => setBudgetFloor(event.target.value)}
                    placeholder="Any"
                    className="min-w-0 flex-1 bg-transparent text-[14px] outline-none"
                  />
                </div>
              </label>
            </div>
          )}
        </div>
        <div className="zc-page-width mx-auto flex max-w-[900px] gap-[22px] overflow-x-auto border-b border-border px-4 no-scrollbar">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex h-11 shrink-0 items-center gap-1.5 text-[14px] font-semibold ${activeTab === tab.id ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {tab.label}
              {Number(tab.count) > 0 && (
                <span className="text-[12px] font-medium tabular-nums text-muted-foreground">
                  {tab.count}
                </span>
              )}
              {activeTab === tab.id && (
                <span className="absolute inset-x-0 bottom-0 h-[2px] bg-foreground" />
              )}
            </button>
          ))}
        </div>
      </header>

      <main className="zc-page-width mx-auto w-full max-w-[900px]">
        {activeTab !== "applications" && (
          <HowHiringWorks onPost={canPostGig ? () => setPostOpen(true) : undefined} />
        )}
        {isLoading ? (
          <GigListSkeleton />
        ) : isError ? (
          <div className="mt-2 bg-card px-5 py-14 text-center md:rounded-xl">
            <BriefcaseBusiness className="mx-auto h-7 w-7 text-muted-foreground" />
            <h3 className="mt-3 font-display text-[17px] font-semibold">
              The marketplace could not load
            </h3>
            <button
              onClick={() => refetch()}
              className="mt-4 h-9 rounded-full border border-foreground/30 px-4 text-[14px] font-semibold hover:bg-foreground/[0.04]"
            >
              Try again
            </button>
          </div>
        ) : filteredGigs.length ? (
          <section className="mt-2 bg-card md:overflow-hidden md:rounded-xl md:border md:border-border">
            {filteredGigs.map((gig) => (
              <GigRow
                key={gig.id}
                gig={gig}
                format={format}
                viewerId={viewerId}
                onOpen={() => openGig(gig)}
              />
            ))}
          </section>
        ) : (
          <MarketplaceEmptyState
            tab={activeTab}
            canPost={canPostGig}
            onPost={() => setPostOpen(true)}
          />
        )}
      </main>

      <Drawer
        open={Boolean(selectedGig)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedGigId(null);
            setDetailMode("details");
          }
        }}
      >
        <DrawerContent
          desktopVariant="panel"
          className="max-h-[94dvh] overflow-hidden border-border bg-background p-0 md:max-h-none"
        >
          {selectedGig && detailMode === "details" ? (
            <GigDetail
              gig={selectedGig}
              viewerId={viewerId}
              format={format}
              walletBalance={walletBalance}
              currencyRate={currency.rate}
              currencySymbol={currency.symbol}
              toBaseAmount={toBaseAmount}
              onApply={() => setDetailMode("apply")}
              onChanged={() => queryClient.invalidateQueries({ queryKey: ["gig-marketplace"] })}
            />
          ) : selectedGig ? (
            <ProposalForm
              gig={selectedGig}
              proposal={proposal}
              setProposal={setProposal}
              currencySymbol={currency.symbol}
              submitting={applyToGig.isPending}
              onBack={() => setDetailMode("details")}
              onSubmit={() => applyToGig.mutate()}
            />
          ) : null}
        </DrawerContent>
      </Drawer>

      <Drawer open={postOpen} onOpenChange={setPostOpen}>
        <DrawerContent
          desktopVariant="dialog"
          className="max-h-[94dvh] overflow-hidden border-border bg-background p-0"
        >
          <GigPostForm
            form={gigForm}
            setForm={setGigForm}
            currencySymbol={currency.symbol}
            submitting={createGig.isPending}
            onSubmit={() => createGig.mutate()}
          />
        </DrawerContent>
      </Drawer>
      {/* The last card runs to the bottom of the screen, so the page never
          ends in a strip of bare background under the tab bar. */}
      <div aria-hidden className="min-h-24 flex-1 bg-card md:bg-transparent" />
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-lg border border-border bg-background px-3 text-[12px] outline-none focus:border-primary/50"
      >
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function GigRow({
  gig,
  format,
  viewerId,
  onOpen,
}: {
  gig: Gig;
  format: (value: number) => string;
  viewerId: string | null;
  onOpen: () => void;
}) {
  const clientName = gig.client?.full_name || gig.client?.username || "Zero Club member";
  const isOwner = viewerId === gig.client_id;
  const isInstitution = gig.client?.account_type === "Institution";
  return (
    <button
      onClick={onOpen}
      className="group grid w-full grid-cols-[48px_minmax(0,1fr)] gap-3 border-b border-border px-4 py-3.5 text-left transition-colors last:border-b-0 hover:bg-foreground/[0.02]"
    >
      <div
        className={`h-12 w-12 overflow-hidden bg-foreground/[0.06] ${isInstitution ? "rounded-xl" : "rounded-full"}`}
      >
        {gig.client?.avatar_url ? (
          <img
            src={gig.client.avatar_url}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-[15px] font-semibold text-muted-foreground">
            {clientName.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      <div className="min-w-0">
        <h3 className="text-[16px] font-semibold leading-snug tracking-normal text-foreground [font-family:inherit] group-hover:underline">
          {gig.title}
        </h3>
        <p className="mt-0.5 flex items-center gap-1 truncate text-[14px] text-foreground">
          {clientName}
          {isInstitution && <BadgeCheck className="h-4 w-4 shrink-0 fill-current text-accent" />}
        </p>
        <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
          {format(gig.budget_min)} – {format(gig.budget_max)}
          {gig.budget_type === "hourly" ? "/hr" : ""} · {gig.location_type}
        </p>
        {gig.skills.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {gig.skills.slice(0, 4).map((skill) => (
              <span
                key={skill}
                className="rounded-md bg-foreground/[0.05] px-2 py-0.5 text-[12px] font-medium text-foreground/80"
              >
                {skill}
              </span>
            ))}
          </div>
        )}
        <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-[12px] text-muted-foreground">
          <span>{relativeDate(gig.created_at)}</span>
          <span aria-hidden>·</span>
          <span>
            {gig.applications_count || 0}{" "}
            {(gig.applications_count || 0) === 1 ? "proposal" : "proposals"}
          </span>
          {gig.status !== "open" && (
            <>
              <span aria-hidden>·</span>
              <StatusChip status={gig.status} />
            </>
          )}
          {isOwner && (
            <>
              <span aria-hidden>·</span>
              <span className="font-semibold text-accent">Your job</span>
            </>
          )}
          {viewerId && gig.hired_profile_id === viewerId && (
            <>
              <span aria-hidden>·</span>
              <span className="flex items-center gap-1 font-semibold text-success">
                <Check className="h-3.5 w-3.5" /> You're hired
              </span>
            </>
          )}
          {gig.viewer_application && gig.hired_profile_id !== viewerId && (
            <>
              <span aria-hidden>·</span>
              <span className="flex items-center gap-1 font-semibold text-success">
                <Check className="h-3.5 w-3.5" /> Proposal sent
              </span>
            </>
          )}
        </p>
      </div>
    </button>
  );
}

const STATUS_LABEL: Record<Gig["status"], string> = {
  open: "Open",
  paused: "Paused",
  closed: "Closed",
  in_progress: "In progress",
  disputed: "Under review",
  completed: "Completed",
};

function StatusChip({ status }: { status: Gig["status"] }) {
  const tone =
    status === "open"
      ? "bg-[#1a7f4b]/10 text-[#1a7f4b]"
      : status === "in_progress"
        ? "bg-[#0A66C2]/10 text-[#0A66C2] dark:text-[#5aa2ec]"
        : status === "completed"
          ? "bg-[#cc208f]/10 text-[#a3186f] dark:text-[#f06fbf]"
          : status === "disputed"
            ? "bg-[#e3a008]/15 text-[#a66f00] dark:text-[#f2c84b]"
            : "bg-foreground/[0.06] text-muted-foreground";
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${tone}`}>
      {STATUS_LABEL[status] || status}
    </span>
  );
}

function PersonAvatar({ person, size = 44 }: { person?: Gig["client"]; size?: number }) {
  const name = person?.full_name || person?.username || "?";
  return (
    <span
      className="grid shrink-0 place-items-center overflow-hidden rounded-full bg-foreground/[0.06] text-[15px] font-semibold text-muted-foreground"
      style={{ width: size, height: size }}
    >
      {person?.avatar_url ? (
        <img
          src={person.avatar_url}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
        />
      ) : (
        name.charAt(0).toUpperCase()
      )}
    </span>
  );
}

type DetailProps = {
  gig: Gig;
  viewerId: string | null;
  format: (value: number) => string;
  walletBalance: number;
  currencyRate: number;
  currencySymbol: string;
  toBaseAmount: (value: number) => number;
  onApply: () => void;
  onChanged: () => void;
};

function GigDetail({
  gig,
  viewerId,
  format,
  walletBalance,
  currencyRate,
  currencySymbol,
  toBaseAmount,
  onApply,
  onChanged,
}: DetailProps) {
  const clientName = gig.client?.full_name || gig.client?.username || "Zero Club member";
  const isOwner = gig.client_id === viewerId;
  const isHired = Boolean(viewerId) && gig.hired_profile_id === viewerId;
  const isInstitution = gig.client?.account_type === "Institution";
  const hasHire = ["in_progress", "disputed", "completed"].includes(gig.status);
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <DrawerHeader className="shrink-0 gap-0 px-5 pb-3 pt-1 sm:gap-0 sm:px-5 sm:pb-3 sm:pt-1 md:px-6 md:pt-5">
        <div className="flex items-center gap-2">
          <span className="w-fit rounded-full bg-[#cc208f]/10 px-2.5 py-0.5 text-[12px] font-semibold text-[#a3186f]">
            {gig.category}
          </span>
          <StatusChip status={gig.status} />
        </div>
        <DrawerTitle className="mt-2 pr-8 font-display text-[20px] font-semibold leading-tight">
          {gig.title}
        </DrawerTitle>
        <DrawerDescription className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[14px] leading-relaxed text-muted-foreground">
          <span>Posted {relativeDate(gig.created_at)}</span>
          <span aria-hidden>·</span>
          <span>{gig.location_type}</span>
        </DrawerDescription>
      </DrawerHeader>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 md:px-6">
        {/* Who is hiring. */}
        <Link
          to="/app/profile/$id"
          params={{ id: gig.client_id }}
          className="flex items-center gap-3 rounded-xl py-3 tap"
        >
          <div
            className={`h-11 w-11 shrink-0 overflow-hidden bg-foreground/[0.06] ${isInstitution ? "rounded-xl" : "rounded-full"}`}
          >
            {gig.client?.avatar_url ? (
              <img
                src={gig.client.avatar_url}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
                decoding="async"
              />
            ) : (
              <div className="grid h-full w-full place-items-center text-[15px] font-semibold text-muted-foreground">
                {clientName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 truncate text-[15px] font-semibold">
              {clientName}
              {isInstitution && (
                <BadgeCheck className="h-4 w-4 shrink-0 fill-[#cc208f] text-white" />
              )}
            </p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {isOwner
                ? "You posted this job"
                : `${gig.client?.account_type || "Builder"} · View profile`}
            </p>
          </div>
        </Link>

        {/* The hire, the held money and what happens next. */}
        {hasHire && (isOwner || isHired) && (
          <HirePanel gig={gig} isOwner={isOwner} format={format} onChanged={onChanged} />
        )}

        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <DetailMetric
            icon={Banknote}
            label="Budget"
            value={`${format(gig.budget_min)} - ${format(gig.budget_max)}${gig.budget_type === "hourly" ? "/hr" : ""}`}
          />
          <DetailMetric icon={Sparkles} label="Experience" value={gig.experience_level} />
          <DetailMetric
            icon={Clock3}
            label="Engagement"
            value={gig.budget_type === "hourly" ? "Hourly" : "Fixed price"}
          />
          <DetailMetric
            icon={CalendarDays}
            label="Deadline"
            value={
              gig.deadline
                ? new Date(gig.deadline).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : "Flexible"
            }
          />
        </div>

        <section className="mt-6">
          <h3 className="text-[13px] font-semibold text-muted-foreground">About the work</h3>
          <div className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">
            <LinkifiedText text={gig.description} />
          </div>
        </section>

        {gig.skills.length > 0 && (
          <section className="mt-6">
            <h3 className="text-[13px] font-semibold text-muted-foreground">Skills</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {gig.skills.map((skill) => (
                <span
                  key={skill}
                  className="rounded-full bg-foreground/[0.05] px-3 py-1 text-[13px] font-medium text-foreground"
                >
                  {skill}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* The poster reviews proposals and hires from here. */}
        {isOwner && gig.status === "open" && (
          <ProposalsPanel
            gig={gig}
            format={format}
            walletBalance={walletBalance}
            currencyRate={currencyRate}
            currencySymbol={currencySymbol}
            toBaseAmount={toBaseAmount}
            onChanged={onChanged}
          />
        )}

        {!isOwner && (
          <div className="mt-6 flex items-center justify-between rounded-2xl bg-foreground/[0.04] px-4 py-3">
            <span className="text-[14px] text-muted-foreground">
              <span className="font-semibold tabular-nums text-foreground">
                {gig.applications_count || 0}
              </span>{" "}
              proposals received
            </span>
            <StatusChip status={gig.status} />
          </div>
        )}
      </div>
      <div className="shrink-0 border-t border-border/60 bg-background px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 md:px-6 md:pb-5">
        {isOwner ? (
          <div className="flex h-12 items-center justify-center gap-2 rounded-full bg-foreground/[0.05] text-[14px] font-semibold text-muted-foreground">
            <Sparkles className="h-4 w-4 text-[#cc208f]" /> Earn {JOB_DONE_ZP} ZP when this job is
            finished and paid
          </div>
        ) : isHired ? (
          <div className="flex h-12 items-center justify-center gap-2 rounded-full bg-[#1a7f4b]/10 text-[15px] font-semibold text-[#1a7f4b]">
            <Check className="h-5 w-5" /> You're hired for this job
          </div>
        ) : gig.viewer_application ? (
          <div className="flex h-12 items-center justify-center gap-2 rounded-full bg-foreground/[0.05] text-[15px] font-semibold text-muted-foreground">
            {gig.viewer_application.status === "withdrawn" ? (
              "You stepped down from this job"
            ) : gig.viewer_application.status === "rejected" || gig.status !== "open" ? (
              gig.status === "in_progress" || gig.status === "disputed" ? (
                "Someone else is on this job"
              ) : (
                "This job has been filled"
              )
            ) : (
              <>
                <Check className="h-5 w-5 text-[#1a7f4b]" /> Proposal sent
              </>
            )}
          </div>
        ) : gig.status === "open" ? (
          <button
            onClick={onApply}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground text-[16px] font-semibold text-background transition-opacity hover:opacity-90"
          >
            <Send className="h-5 w-5" /> Send proposal
          </button>
        ) : (
          <div className="flex h-12 items-center justify-center rounded-full bg-foreground/[0.05] text-[15px] font-semibold text-muted-foreground">
            This job is no longer taking proposals
          </div>
        )}
      </div>
    </div>
  );
}

type Proposal = {
  id: string;
  applicant_id: string;
  cover_note: string;
  proposed_amount: number;
  delivery_days: number;
  portfolio_url: string | null;
  status: string;
  created_at: string;
  applicant?: Gig["client"];
};

/** Every proposal for your open job, with Hire on each. */
function ProposalsPanel({
  gig,
  format,
  walletBalance,
  currencyRate,
  currencySymbol,
  toBaseAmount,
  onChanged,
}: {
  gig: Gig;
  format: (value: number) => string;
  walletBalance: number;
  currencyRate: number;
  currencySymbol: string;
  toBaseAmount: (value: number) => number;
  onChanged: () => void;
}) {
  const [hiring, setHiring] = useState<Proposal | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const {
    data: proposals = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["gig-proposals", gig.id],
    queryFn: async (): Promise<Proposal[]> => {
      const { data, error } = await supabase
        .from("gig_applications")
        .select(
          "id, applicant_id, cover_note, proposed_amount, delivery_days, portfolio_url, status, created_at",
        )
        .eq("gig_id", gig.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const ids = [...new Set((data || []).map((row) => row.applicant_id))];
      const { data: people } = ids.length
        ? await supabase
            .from("profiles")
            .select("id, username, full_name, avatar_url, account_type")
            .in("id", ids)
        : { data: [] as NonNullable<Gig["client"]>[] };
      const byId = new Map((people || []).map((person) => [person.id, person]));
      return (data || []).map((row) => ({
        ...row,
        applicant: byId.get(row.applicant_id) || null,
      })) as Proposal[];
    },
  });
  const live = proposals.filter(
    (proposal) => proposal.status === "submitted" || proposal.status === "shortlisted",
  );

  const startHire = (proposal: Proposal) => {
    setHiring(proposal);
    setAmount(String(Math.round((Number(proposal.proposed_amount) / currencyRate) * 100) / 100));
  };

  const pay = toBaseAmount(Number(amount) || 0);
  const short = pay > walletBalance;

  const confirmHire = async () => {
    if (!hiring) return;
    if (!pay || pay <= 0) return toast.error("Enter the amount you will pay");
    if (short)
      return toast.error("Add money to your wallet first. The full amount is held when you hire.");
    setBusy(true);
    const { error } = await supabase.rpc("hire_gig_applicant", {
      p_application: hiring.id,
      p_amount: pay,
    });
    setBusy(false);
    if (error) return toast.error(error.message || "Could not hire");
    toast.success(
      `${hiring.applicant?.full_name || hiring.applicant?.username || "They"} ${hiring.applicant ? "is" : "are"} hired`,
      {
        description: `${format(pay)} is held by Zero Club until you release it.`,
      },
    );
    setHiring(null);
    void refetch();
    onChanged();
  };

  return (
    <section className="mt-6">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[13px] font-semibold text-muted-foreground">Proposals</h3>
        <span className="text-[12px] text-muted-foreground">{live.length} waiting</span>
      </div>
      {isLoading ? (
        <div className="grid min-h-24 place-items-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : live.length === 0 ? (
        <p className="mt-2 rounded-2xl bg-foreground/[0.04] px-4 py-6 text-center text-[14px] text-muted-foreground">
          No proposals yet. Share the job to reach more builders.
        </p>
      ) : (
        <div className="mt-2 space-y-2.5">
          {live.map((proposal) => {
            const name = proposal.applicant?.full_name || proposal.applicant?.username || "Builder";
            const open = hiring?.id === proposal.id;
            return (
              <div
                key={proposal.id}
                className={`rounded-2xl border p-3.5 transition-colors ${open ? "border-[#cc208f]/50 bg-[#cc208f]/[0.04]" : "border-border/70"}`}
              >
                <div className="flex items-center gap-3">
                  <Link
                    to="/app/profile/$id"
                    params={{ id: proposal.applicant_id }}
                    className="flex min-w-0 flex-1 items-center gap-3 tap"
                  >
                    <PersonAvatar person={proposal.applicant} size={40} />
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-semibold">{name}</span>
                      <span className="block text-[12.5px] text-muted-foreground">
                        {relativeDate(proposal.created_at)}
                      </span>
                    </span>
                  </Link>
                  <span className="shrink-0 text-right">
                    <span className="block text-[15px] font-bold tabular-nums">
                      {format(proposal.proposed_amount)}
                    </span>
                    <span className="block text-[12px] text-muted-foreground">
                      {proposal.delivery_days} day{proposal.delivery_days === 1 ? "" : "s"}
                    </span>
                  </span>
                </div>
                <p className="mt-2.5 whitespace-pre-wrap text-[14px] leading-relaxed text-foreground/90">
                  {proposal.cover_note}
                </p>
                {proposal.portfolio_url && (
                  <a
                    href={proposal.portfolio_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block max-w-full truncate text-[13px] font-semibold text-[#cc208f] hover:underline"
                  >
                    {proposal.portfolio_url}
                  </a>
                )}

                {open ? (
                  <div className="mt-3 rounded-xl bg-background p-3 ring-1 ring-border">
                    <label className="block text-[12.5px] font-semibold text-muted-foreground">
                      Amount you'll pay
                    </label>
                    <div className="mt-1.5 flex h-11 items-center rounded-[10px] border border-foreground/15 bg-card px-3 focus-within:border-foreground/40">
                      <span className="mr-2 text-muted-foreground">{currencySymbol}</span>
                      <input
                        type="number"
                        min="0"
                        inputMode="decimal"
                        value={amount}
                        onChange={(event) => setAmount(event.target.value)}
                        className="min-w-0 flex-1 bg-transparent text-[15px] tabular-nums outline-none"
                      />
                    </div>
                    <p
                      className={`mt-2 text-[12.5px] leading-relaxed ${short ? "text-destructive" : "text-muted-foreground"}`}
                    >
                      {short
                        ? `Your wallet has ${format(walletBalance)}. Add money to hold the full amount.`
                        : `${format(pay)} leaves your wallet now and is held by Zero Club. ${name} sees it's secured, and gets it when you tap Release payment.`}
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => setHiring(null)}
                        className="h-10 flex-1 rounded-full border border-foreground/20 text-[14px] font-semibold"
                      >
                        Not yet
                      </button>
                      {short ? (
                        <Link
                          to="/app/wallet/add-money"
                          className="grid h-10 flex-1 place-items-center rounded-full bg-foreground text-[14px] font-semibold text-background"
                        >
                          Add money
                        </Link>
                      ) : (
                        <button
                          type="button"
                          onClick={confirmHire}
                          disabled={busy}
                          className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-[#cc208f] text-[14px] font-semibold text-white disabled:opacity-50"
                        >
                          {busy ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Lock className="h-4 w-4" />
                          )}{" "}
                          Hire & hold {format(pay)}
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => startHire(proposal)}
                    className="mt-3 h-10 w-full rounded-full bg-foreground text-[14px] font-semibold text-background tap"
                  >
                    Hire {name.split(" ")[0]}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** For the poster and the hired person once someone is hired. */
function HirePanel({
  gig,
  isOwner,
  format,
  onChanged,
}: {
  gig: Gig;
  isOwner: boolean;
  format: (value: number) => string;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<
    "release" | "cancel" | "step_down" | "report" | null
  >(null);
  const [reason, setReason] = useState("");
  const person = isOwner ? gig.hired : gig.client;
  const personName =
    person?.full_name || person?.username || (isOwner ? "Your hire" : "The poster");
  const held = Number(gig.escrow_amount) || 0;
  const canCancel =
    isOwner &&
    gig.status === "in_progress" &&
    gig.hired_at &&
    Date.now() - new Date(gig.hired_at).getTime() < 24 * 3600 * 1000;

  const run = async (
    key: string,
    fn: string,
    args: Record<string, unknown>,
    done: (data: Record<string, unknown>) => void,
  ) => {
    setBusy(key);
    const { data, error } = await supabase.rpc(fn, args);
    setBusy(null);
    if (error) return toast.error(error.message || "Something went wrong");
    setConfirming(null);
    done((data || {}) as Record<string, unknown>);
    onChanged();
  };

  return (
    <div className="mt-2 overflow-hidden rounded-2xl border border-border/70">
      <div className="flex items-center gap-3 p-3.5">
        <PersonAvatar person={person} size={44} />
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-semibold text-muted-foreground">
            {isOwner ? "Hired" : "Hired by"}
          </p>
          {person && (isOwner ? gig.hired_profile_id : gig.client_id) ? (
            <Link
              to="/app/profile/$id"
              params={{ id: (isOwner ? gig.hired_profile_id : gig.client_id) as string }}
              className="block truncate text-[15px] font-semibold hover:underline"
            >
              {personName}
            </Link>
          ) : (
            <p className="truncate text-[15px] font-semibold">{personName}</p>
          )}
        </div>
        <span className="shrink-0 text-right">
          <span className="block text-[16px] font-bold tabular-nums">{format(held)}</span>
          <span className="block text-[12px] text-muted-foreground">
            {gig.status === "completed" ? "Paid" : "Held safely"}
          </span>
        </span>
      </div>

      <div
        className={`flex items-start gap-2 px-3.5 py-2.5 text-[13px] leading-relaxed ${gig.status === "completed" ? "bg-[#1a7f4b]/[0.08] text-[#1a7f4b]" : gig.status === "disputed" ? "bg-[#e3a008]/10 text-[#8a5d00] dark:text-[#f2c84b]" : "bg-foreground/[0.04] text-muted-foreground"}`}
      >
        {gig.status === "completed" ? (
          <Check className="mt-0.5 h-4 w-4 shrink-0" />
        ) : (
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        )}
        <span>
          {gig.status === "completed"
            ? isOwner
              ? `Paid ${format(held)}. Thanks for hiring on Zero Club.`
              : `${format(held)} was paid into your wallet.`
            : gig.status === "disputed"
              ? "A problem was reported. Zero Club is reviewing it and will decide where the held pay goes."
              : isOwner
                ? "The pay is held by Zero Club. Release it when you're happy with the work."
                : "The pay is already held by Zero Club, so it's safe. You get it when the poster releases it."}
        </span>
      </div>

      {gig.status === "in_progress" && (
        <div className="space-y-2 p-3.5">
          {confirming === "report" ? (
            <div>
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="What went wrong? Zero Club will read both sides."
                className="w-full resize-none rounded-[10px] border border-foreground/15 bg-card px-3 py-2.5 text-[14px] outline-none focus:border-foreground/40"
              />
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirming(null)}
                  className="h-10 flex-1 rounded-full border border-foreground/20 text-[14px] font-semibold"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() =>
                    run("report", "dispute_gig", { p_gig: gig.id, p_reason: reason }, () =>
                      toast.success("Reported. Zero Club will review it."),
                    )
                  }
                  className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-foreground text-[14px] font-semibold text-background disabled:opacity-50"
                >
                  {busy === "report" && <Loader2 className="h-4 w-4 animate-spin" />} Send report
                </button>
              </div>
            </div>
          ) : confirming ? (
            <div className="rounded-xl bg-foreground/[0.04] p-3">
              <p className="text-[14px] font-semibold">
                {confirming === "release"
                  ? `Release ${format(held)} to ${personName}?`
                  : confirming === "cancel"
                    ? "Cancel this hire?"
                    : "Step down from this job?"}
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                {confirming === "release"
                  ? "This pays them straight away and can't be undone."
                  : confirming === "cancel"
                    ? `${format(held)} comes back to your wallet and the job opens again.`
                    : `${format(held)} goes back to the poster and the job opens again.`}
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirming(null)}
                  className="h-10 flex-1 rounded-full border border-foreground/20 text-[14px] font-semibold"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => {
                    if (confirming === "release") {
                      void run("release", "release_gig_payment", { p_gig: gig.id }, (data) => {
                        const zp = Number(data.zp_awarded) || 0;
                        toast.success(`Paid ${format(held)}`, {
                          description: zp
                            ? `+${zp} ZP for getting a job done on Zero Club.`
                            : undefined,
                        });
                      });
                    } else if (confirming === "cancel") {
                      void run("cancel", "cancel_gig_hire", { p_gig: gig.id }, () =>
                        toast.success("Hire cancelled. The money is back in your wallet."),
                      );
                    } else {
                      void run("step_down", "step_down_from_gig", { p_gig: gig.id }, () =>
                        toast.success("You stepped down from this job."),
                      );
                    }
                  }}
                  className={`flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full text-[14px] font-semibold disabled:opacity-50 ${confirming === "release" ? "bg-[#1a7f4b] text-white" : "bg-destructive text-white"}`}
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  {confirming === "release"
                    ? "Release payment"
                    : confirming === "cancel"
                      ? "Cancel hire"
                      : "Step down"}
                </button>
              </div>
            </div>
          ) : (
            <>
              {isOwner && (
                <button
                  type="button"
                  onClick={() => setConfirming("release")}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#1a7f4b] text-[15px] font-semibold text-white tap"
                >
                  <Banknote className="h-5 w-5" /> Release payment
                </button>
              )}
              <div className="flex gap-2">
                {isOwner && canCancel && (
                  <button
                    type="button"
                    onClick={() => setConfirming("cancel")}
                    className="h-10 flex-1 rounded-full border border-foreground/20 text-[13.5px] font-semibold tap"
                  >
                    Cancel hire
                  </button>
                )}
                {!isOwner && (
                  <button
                    type="button"
                    onClick={() => setConfirming("step_down")}
                    className="h-10 flex-1 rounded-full border border-foreground/20 text-[13.5px] font-semibold tap"
                  >
                    Step down
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setConfirming("report")}
                  className="h-10 flex-1 rounded-full border border-foreground/20 text-[13.5px] font-semibold text-muted-foreground tap"
                >
                  Report a problem
                </button>
              </div>
              {isOwner && !canCancel && (
                <p className="text-center text-[12px] text-muted-foreground">
                  Hires can be cancelled within 24 hours. After that, report a problem.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** One line on how hiring works, so people trust it before they post or apply. */
function HowHiringWorks({ onPost }: { onPost?: () => void }) {
  return (
    <section className="mt-2 bg-card px-4 py-3.5 md:rounded-xl md:border md:border-border">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#cc208f]/10 text-[#cc208f]">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-semibold">Hire and get hired, safely</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
            Pay is held by Zero Club from the moment someone is hired, and released when the work is
            done. Posters earn {JOB_DONE_ZP} ZP for every finished job.
          </p>
        </div>
        {onPost && (
          <button
            type="button"
            onClick={onPost}
            className="hidden h-9 shrink-0 items-center gap-1 rounded-full bg-foreground px-3.5 text-[13.5px] font-semibold text-background sm:flex"
          >
            <Plus className="h-4 w-4" /> Post a job
          </button>
        )}
      </div>
    </section>
  );
}

function DetailMetric({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-foreground/[0.04] p-3.5">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <p className="text-[13px] font-semibold">{label}</p>
      </div>
      <p className="mt-1 text-[15px] font-semibold leading-snug tabular-nums">{value}</p>
    </div>
  );
}

function ProposalForm({
  gig,
  proposal,
  setProposal,
  currencySymbol,
  submitting,
  onBack,
  onSubmit,
}: any) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-start gap-3 px-5 pb-3 pt-1 md:px-6 md:pt-5">
        <button
          onClick={onBack}
          aria-label="Back to gig"
          className="-ml-2 grid h-10 w-10 shrink-0 place-items-center rounded-full text-foreground hover:bg-foreground/[0.04]"
        >
          <ArrowLeft className="h-[22px] w-[22px]" />
        </button>
        <div className="min-w-0 pt-0.5">
          <DrawerTitle className="font-display text-[20px] font-semibold leading-tight">
            Send a proposal
          </DrawerTitle>
          <p className="mt-1 line-clamp-1 text-[14px] leading-relaxed text-muted-foreground">
            {gig.title}
          </p>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-5 pt-1 md:px-6">
        <FormField label="Cover note">
          <textarea
            value={proposal.coverNote}
            onChange={(event) => setProposal({ ...proposal, coverNote: event.target.value })}
            rows={7}
            maxLength={2000}
            placeholder="Explain your approach, relevant experience, and the result you can deliver."
            className="w-full resize-none rounded-[10px] border border-foreground/15 bg-card px-3 py-2.5 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground focus:border-foreground/40"
          />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Your price">
            <div className="flex h-11 w-full min-w-0 items-center rounded-[10px] border border-foreground/15 bg-card px-3 text-[15px] focus-within:border-foreground/40">
              <span className="mr-2 text-muted-foreground">{currencySymbol}</span>
              <input
                type="number"
                min="0"
                value={proposal.proposedAmount}
                onChange={(event) =>
                  setProposal({ ...proposal, proposedAmount: event.target.value })
                }
                className="min-w-0 flex-1 bg-transparent tabular-nums outline-none"
              />
            </div>
          </FormField>
          <FormField label="Delivery days">
            <input
              type="number"
              min="1"
              value={proposal.deliveryDays}
              onChange={(event) => setProposal({ ...proposal, deliveryDays: event.target.value })}
              placeholder="7"
              className="h-11 w-full min-w-0 rounded-[10px] border border-foreground/15 bg-card px-3 text-[15px] outline-none placeholder:text-muted-foreground focus:border-foreground/40 tabular-nums"
            />
          </FormField>
        </div>
        <FormField label="Portfolio link (optional)">
          <input
            type="url"
            value={proposal.portfolioUrl}
            onChange={(event) => setProposal({ ...proposal, portfolioUrl: event.target.value })}
            placeholder="https://"
            className="h-11 w-full min-w-0 rounded-[10px] border border-foreground/15 bg-card px-3 text-[15px] outline-none placeholder:text-muted-foreground focus:border-foreground/40"
          />
        </FormField>
      </div>
      <div className="shrink-0 border-t border-border/60 px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 md:px-6 md:pb-5">
        <button
          onClick={onSubmit}
          disabled={submitting}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground text-[16px] font-semibold text-background disabled:opacity-40"
        >
          {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          {submitting ? "Sending" : "Send proposal"}
        </button>
      </div>
    </div>
  );
}

function GigPostForm({ form, setForm, currencySymbol, submitting, onSubmit }: any) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <DrawerHeader className="shrink-0 gap-0 px-5 pb-3 pt-1 sm:gap-0 sm:px-5 sm:pb-3 sm:pt-1 md:px-6 md:pt-5">
        <p className="text-[13px] font-semibold text-[#a3186f]">Hire on Zero Club</p>
        <DrawerTitle className="mt-0.5 font-display text-[20px] font-semibold leading-tight">
          Post a job
        </DrawerTitle>
        <DrawerDescription className="mt-1 text-[14px] leading-relaxed text-muted-foreground">
          Posting is free. You only pay when you hire: the agreed amount is held by Zero Club and
          released when the work is done. Earn {JOB_DONE_ZP} ZP for every finished job.
        </DrawerDescription>
      </DrawerHeader>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-5 pt-1 md:px-6">
        <FormField label="Job title">
          <input
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
            maxLength={100}
            placeholder="e.g. Product designer for a fintech dashboard"
            className="h-11 w-full min-w-0 rounded-[10px] border border-foreground/15 bg-card px-3 text-[15px] outline-none placeholder:text-muted-foreground focus:border-foreground/40"
          />
        </FormField>
        <FormField label="Project brief">
          <textarea
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            maxLength={4000}
            rows={6}
            placeholder="Describe the outcome, scope, and what a strong delivery looks like."
            className="w-full resize-none rounded-[10px] border border-foreground/15 bg-card px-3 py-2.5 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground focus:border-foreground/40"
          />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <SheetSelect
            label="Category"
            value={form.category}
            onChange={(value) => setForm({ ...form, category: value })}
            options={CATEGORIES.filter((item) => item !== "All")}
          />
          <SheetSelect
            label="Work type"
            value={form.locationType}
            onChange={(value) => setForm({ ...form, locationType: value })}
            options={WORK_TYPES.filter((item) => item !== "All work types")}
          />
        </div>
        <FormField label="Skills">
          <input
            value={form.skills}
            onChange={(event) => setForm({ ...form, skills: event.target.value })}
            placeholder="Figma, UX research, Design systems"
            className="h-11 w-full min-w-0 rounded-[10px] border border-foreground/15 bg-card px-3 text-[15px] outline-none placeholder:text-muted-foreground focus:border-foreground/40"
          />
          <p className="mt-1.5 text-[13px] text-muted-foreground">Separate skills with commas.</p>
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <SheetSelect
            label="Pricing"
            value={form.budgetType}
            onChange={(value) => setForm({ ...form, budgetType: value })}
            options={["fixed", "hourly"]}
          />
          <SheetSelect
            label="Experience"
            value={form.experienceLevel}
            onChange={(value) => setForm({ ...form, experienceLevel: value })}
            options={["Entry", "Intermediate", "Expert"]}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Minimum budget">
            <div className="flex h-11 w-full min-w-0 items-center rounded-[10px] border border-foreground/15 bg-card px-3 text-[15px] focus-within:border-foreground/40">
              <span className="mr-2 text-muted-foreground">{currencySymbol}</span>
              <input
                type="number"
                min="0"
                value={form.budgetMin}
                onChange={(event) => setForm({ ...form, budgetMin: event.target.value })}
                className="min-w-0 flex-1 bg-transparent tabular-nums outline-none"
              />
            </div>
          </FormField>
          <FormField label="Maximum budget">
            <div className="flex h-11 w-full min-w-0 items-center rounded-[10px] border border-foreground/15 bg-card px-3 text-[15px] focus-within:border-foreground/40">
              <span className="mr-2 text-muted-foreground">{currencySymbol}</span>
              <input
                type="number"
                min="0"
                value={form.budgetMax}
                onChange={(event) => setForm({ ...form, budgetMax: event.target.value })}
                className="min-w-0 flex-1 bg-transparent tabular-nums outline-none"
              />
            </div>
          </FormField>
        </div>
        <FormField label="Deadline (optional)">
          <input
            type="date"
            value={form.deadline}
            onChange={(event) => setForm({ ...form, deadline: event.target.value })}
            className="h-11 w-full min-w-0 rounded-[10px] border border-foreground/15 bg-card px-3 text-[15px] outline-none placeholder:text-muted-foreground focus:border-foreground/40"
          />
        </FormField>
      </div>
      <div className="shrink-0 border-t border-border/60 px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 md:px-6 md:pb-5">
        <button
          onClick={onSubmit}
          disabled={submitting}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#cc208f] text-[16px] font-semibold text-white disabled:opacity-40"
        >
          {submitting ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <BriefcaseBusiness className="h-5 w-5" />
          )}
          {submitting ? "Posting" : "Post job"}
        </button>
      </div>
    </div>
  );
}

/* The select used inside the Post a gig sheet. The page's filter bar keeps
   its own compact FilterSelect. */
function SheetSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <FormField label={label}>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full min-w-0 rounded-[10px] border border-foreground/15 bg-card px-3 text-[15px] outline-none placeholder:text-muted-foreground focus:border-foreground/40 capitalize"
      >
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </FormField>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-[13px] font-semibold text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function MarketplaceEmptyState({
  tab,
  canPost,
  onPost,
}: {
  tab: MarketplaceTab;
  canPost: boolean;
  onPost: () => void;
}) {
  const content =
    tab === "applications"
      ? { title: "No work yet", detail: "Jobs you apply for or get hired on show up here." }
      : tab === "posted"
        ? {
            title: "No jobs posted yet",
            detail: "Post a job, review proposals, and hire with the pay held safely.",
          }
        : { title: "No matching jobs", detail: "Try another search or adjust the filters." };
  return (
    <div className="mt-2 bg-card px-5 py-16 text-center md:rounded-xl">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-foreground/[0.05] text-muted-foreground">
        <BriefcaseBusiness className="h-5 w-5" />
      </div>
      <h3 className="mt-4 font-display text-[17px] font-semibold">{content.title}</h3>
      <p className="mt-1 text-[14px] text-muted-foreground">{content.detail}</p>
      {tab === "posted" && canPost && (
        <button
          onClick={onPost}
          className="mt-5 h-10 rounded-full bg-foreground px-5 text-[15px] font-semibold text-background"
        >
          Post a job
        </button>
      )}
    </div>
  );
}

function GigListSkeleton() {
  return (
    <div className="mt-2 bg-card md:rounded-xl">
      {[1, 2, 3].map((item) => (
        <div key={item} className="flex gap-3 border-b border-border px-4 py-4 last:border-b-0">
          <div className="h-12 w-12 animate-pulse rounded-full bg-foreground/[0.06]" />
          <div className="flex-1">
            <div className="h-4 w-2/3 animate-pulse rounded bg-foreground/[0.06]" />
            <div className="mt-2 h-3 w-1/3 animate-pulse rounded bg-foreground/[0.06]" />
            <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-foreground/[0.06]" />
          </div>
        </div>
      ))}
    </div>
  );
}
