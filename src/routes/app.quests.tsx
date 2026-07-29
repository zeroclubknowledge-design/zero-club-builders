import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowUpRight,
  BadgeCheck,
  Banknote,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronLeft,
  Clock3,
  Loader2,
  MapPin,
  Plus,
  Search,
  Send,
  SlidersHorizontal,
  Sparkles,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useWalletCurrency } from "@/hooks/useWalletCurrency";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

export const Route = createFileRoute("/app/quests")({
  component: GigMarketplace,
});

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
  status: "open" | "paused" | "closed";
  applications_count: number;
  created_at: string;
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
  const { details: currency, format, toBaseAmount } = useWalletCurrency();
  const [activeTab, setActiveTab] = useState<MarketplaceTab>("browse");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [workType, setWorkType] = useState("All work types");
  const [budgetFloor, setBudgetFloor] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedGig, setSelectedGig] = useState<Gig | null>(null);
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

      const clientIds = [...new Set((gigs || []).map((gig: any) => gig.client_id).filter(Boolean))];
      const gigIds = (gigs || []).map((gig: any) => gig.id);
      const [{ data: clients }, { data: applications }] = await Promise.all([
        clientIds.length
          ? supabase.from("profiles").select("id, username, full_name, avatar_url, account_type").in("id", clientIds)
          : Promise.resolve({ data: [] as any[] }),
        viewerId && gigIds.length
          ? supabase.from("gig_applications").select("*").eq("applicant_id", viewerId).in("gig_id", gigIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const clientMap = new Map((clients || []).map((client: any) => [client.id, client]));
      const applicationMap = new Map((applications || []).map((application: any) => [application.gig_id, application]));
      const enriched = (gigs || []).map((gig: any) => ({
        ...gig,
        skills: gig.skills || [],
        client: clientMap.get(gig.client_id) || null,
        viewer_application: applicationMap.get(gig.id) || null,
      })) as Gig[];

      return { viewerId, gigs: enriched };
    },
    staleTime: 20_000,
  });

  const viewerId = data?.viewerId || null;
  const gigs = data?.gigs || [];

  const filteredGigs = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const minimumBudget = budgetFloor ? toBaseAmount(Number(budgetFloor)) : 0;

    return gigs.filter((gig) => {
      if (activeTab === "browse" && gig.status !== "open") return false;
      if (activeTab === "applications" && !gig.viewer_application) return false;
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
      if (!authData.user) throw new Error("Sign in to post a gig");
      if (!gigForm.title.trim() || !gigForm.description.trim()) throw new Error("Add a title and description");

      const min = toBaseAmount(Number(gigForm.budgetMin) || 0);
      const max = toBaseAmount(Number(gigForm.budgetMax) || Number(gigForm.budgetMin) || 0);
      if (min <= 0 || max < min) throw new Error("Enter a valid budget range");

      const { error } = await supabase.from("gigs").insert({
        client_id: authData.user.id,
        title: gigForm.title.trim(),
        description: gigForm.description.trim(),
        category: gigForm.category,
        skills: gigForm.skills.split(",").map((skill) => skill.trim()).filter(Boolean).slice(0, 10),
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
      toast.success("Gig published");
      setGigForm(defaultGigForm);
      setPostOpen(false);
      setActiveTab("posted");
      queryClient.invalidateQueries({ queryKey: ["gig-marketplace"] });
    },
    onError: (error: any) => toast.error(error.message || "Could not publish this gig"),
  });

  const applyToGig = useMutation({
    mutationFn: async () => {
      if (!selectedGig) throw new Error("Choose a gig first");
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) throw new Error("Sign in to send a proposal");
      if (proposal.coverNote.trim().length < 40) throw new Error("Tell the client how you will approach the work");
      if (!proposal.deliveryDays || Number(proposal.deliveryDays) < 1) throw new Error("Add a delivery estimate");

      const { error } = await supabase.from("gig_applications").insert({
        gig_id: selectedGig.id,
        applicant_id: authData.user.id,
        cover_note: proposal.coverNote.trim(),
        proposed_amount: toBaseAmount(Number(proposal.proposedAmount) || Number(selectedGig.budget_min)),
        delivery_days: Number(proposal.deliveryDays),
        portfolio_url: proposal.portfolioUrl.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Proposal sent");
      setProposal(defaultProposal);
      setSelectedGig(null);
      setDetailMode("details");
      queryClient.invalidateQueries({ queryKey: ["gig-marketplace"] });
    },
    onError: (error: any) => toast.error(error.message || "Could not send your proposal"),
  });

  const tabs: { id: MarketplaceTab; label: string; count?: number }[] = [
    { id: "browse", label: "Browse gigs", count: gigs.filter((gig) => gig.status === "open").length },
    { id: "applications", label: "My applications", count: gigs.filter((gig) => gig.viewer_application).length },
    { id: "posted", label: "Posted by me", count: gigs.filter((gig) => gig.client_id === viewerId).length },
  ];

  const openGig = (gig: Gig) => {
    setSelectedGig(gig);
    setDetailMode("details");
    setProposal({ ...defaultProposal, proposedAmount: String(Number(gig.budget_min) / currency.rate) });
  };

  return (
    <div className="min-h-screen bg-background pb-24 text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/95 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur-xl md:px-7">
        <div className="mx-auto flex max-w-[1080px] items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link to="/app" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border bg-card hover:bg-muted">
              <ChevronLeft className="h-[18px] w-[18px]" />
            </Link>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">Opportunities</p>
              <h1 className="truncate font-display text-[18px] font-semibold tracking-tight md:text-[20px]">Gig marketplace</h1>
            </div>
          </div>
          <button
            onClick={() => setPostOpen(true)}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[12px] font-semibold text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Post a gig</span><span className="sm:hidden">Post</span>
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1080px] px-4 py-5 md:px-7 md:py-7">
        <section className="border-b border-border/70 pb-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-xl">
              <h2 className="font-display text-[24px] font-semibold leading-tight tracking-tight md:text-[28px]">Find serious work. Hire proven builders.</h2>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">Paid opportunities from builders, teams, tutors, and institutions across Zero Club.</p>
            </div>
            <div className="grid grid-cols-3 divide-x divide-border overflow-hidden rounded-lg border border-border bg-card lg:w-[360px]">
              <MarketStat label="Open gigs" value={gigs.filter((gig) => gig.status === "open").length} />
              <MarketStat label="Remote" value={gigs.filter((gig) => gig.status === "open" && gig.location_type === "Remote").length} />
              <MarketStat label="Applied" value={gigs.filter((gig) => gig.viewer_application).length} />
            </div>
          </div>
        </section>

        <div className="mt-5 flex gap-1 overflow-x-auto border-b border-border no-scrollbar">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex h-11 shrink-0 items-center gap-2 px-3 text-[12px] font-semibold transition ${activeTab === tab.id ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {tab.label}
              <span className="rounded-full bg-foreground/[0.06] px-1.5 py-0.5 text-[9px] tabular-nums">{tab.count}</span>
              {activeTab === tab.id && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" />}
            </button>
          ))}
        </div>

        <section className="mt-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative flex h-11 flex-1 items-center rounded-lg border border-border bg-card focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10">
              <Search className="ml-3.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search roles, skills, or industries"
                className="h-full min-w-0 flex-1 bg-transparent px-3 text-[13px] outline-none placeholder:text-muted-foreground/65"
              />
            </label>
            <button
              onClick={() => setShowFilters((value) => !value)}
              className={`flex h-11 items-center justify-center gap-2 rounded-lg border px-4 text-[12px] font-semibold ${showFilters ? "border-primary/30 bg-primary/[0.06] text-primary" : "border-border bg-card text-foreground"}`}
            >
              <SlidersHorizontal className="h-4 w-4" /> Filters
            </button>
          </div>

          {showFilters && (
            <div className="mt-3 grid gap-3 rounded-lg border border-border bg-card p-3 sm:grid-cols-3">
              <FilterSelect label="Category" value={category} onChange={setCategory} options={CATEGORIES} />
              <FilterSelect label="Work type" value={workType} onChange={setWorkType} options={WORK_TYPES} />
              <label className="space-y-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Minimum budget</span>
                <div className="flex h-10 items-center rounded-lg border border-border bg-background px-3">
                  <span className="mr-2 text-[11px] font-semibold text-muted-foreground">{currency.symbol}</span>
                  <input type="number" min="0" value={budgetFloor} onChange={(event) => setBudgetFloor(event.target.value)} placeholder="Any" className="min-w-0 flex-1 bg-transparent text-[12px] outline-none" />
                </div>
              </label>
            </div>
          )}

          <div className="mt-5">
            {isLoading ? (
              <GigListSkeleton />
            ) : isError ? (
              <div className="rounded-lg border border-border bg-card px-5 py-14 text-center">
                <BriefcaseBusiness className="mx-auto h-7 w-7 text-muted-foreground" />
                <h3 className="mt-3 text-[15px] font-semibold">The marketplace could not load</h3>
                <button onClick={() => refetch()} className="mt-4 rounded-lg border border-border px-4 py-2 text-[12px] font-semibold hover:bg-muted">Try again</button>
              </div>
            ) : filteredGigs.length ? (
              <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
                {filteredGigs.map((gig) => <GigRow key={gig.id} gig={gig} format={format} viewerId={viewerId} onOpen={() => openGig(gig)} />)}
              </div>
            ) : (
              <MarketplaceEmptyState tab={activeTab} onPost={() => setPostOpen(true)} />
            )}
          </div>
        </section>
      </main>

      <Drawer open={Boolean(selectedGig)} onOpenChange={(open) => { if (!open) { setSelectedGig(null); setDetailMode("details"); } }}>
        <DrawerContent desktopVariant="panel" className="max-h-[94dvh] overflow-hidden border-border bg-background p-0 md:max-h-none">
          {selectedGig && detailMode === "details" ? (
            <GigDetail
              gig={selectedGig}
              viewerId={viewerId}
              format={format}
              onApply={() => setDetailMode("apply")}
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
        <DrawerContent desktopVariant="dialog" className="max-h-[94dvh] overflow-hidden border-border bg-background p-0">
          <GigPostForm
            form={gigForm}
            setForm={setGigForm}
            currencySymbol={currency.symbol}
            submitting={createGig.isPending}
            onSubmit={() => createGig.mutate()}
          />
        </DrawerContent>
      </Drawer>
    </div>
  );
}

function MarketStat({ label, value }: { label: string; value: number }) {
  return <div className="px-2 py-3 text-center"><p className="text-[16px] font-semibold tabular-nums">{value}</p><p className="mt-0.5 text-[9px] font-medium text-muted-foreground">{label}</p></div>;
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <label className="space-y-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-[12px] outline-none focus:border-primary/50">
        {options.map((option) => <option key={option}>{option}</option>)}
      </select>
    </label>
  );
}

function GigRow({ gig, format, viewerId, onOpen }: { gig: Gig; format: (value: number) => string; viewerId: string | null; onOpen: () => void }) {
  const clientName = gig.client?.full_name || gig.client?.username || "Zero Club client";
  const isOwner = viewerId === gig.client_id;
  return (
    <button onClick={onOpen} className="group w-full p-4 text-left transition hover:bg-foreground/[0.025] sm:p-5">
      <div className="flex items-start gap-3.5">
        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
          {gig.client?.avatar_url ? <img src={gig.client.avatar_url} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full w-full place-items-center bg-primary/10 text-[13px] font-semibold text-primary">{clientName.charAt(0).toUpperCase()}</div>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1 font-semibold text-foreground">{clientName}{gig.client?.account_type === "Institution" && <BadgeCheck className="h-3.5 w-3.5 fill-primary text-primary-foreground" />}</span>
            <span>{relativeDate(gig.created_at)}</span>
            {isOwner && <span className="rounded-full bg-primary/10 px-1.5 py-0.5 font-semibold text-primary">Your listing</span>}
            {gig.viewer_application && <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 font-semibold text-emerald-600">Applied</span>}
          </div>
          <div className="mt-2 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-[15px] font-semibold leading-snug tracking-tight group-hover:text-primary">{gig.title}</h3>
              <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-relaxed text-muted-foreground">{gig.description}</p>
            </div>
            <ArrowUpRight className="mt-0.5 hidden h-4 w-4 shrink-0 text-muted-foreground transition group-hover:text-primary sm:block" />
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {gig.skills.slice(0, 4).map((skill) => <span key={skill} className="rounded-md border border-border bg-background px-2 py-1 text-[9.5px] font-medium text-muted-foreground">{skill}</span>)}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/60 pt-3 text-[10.5px] text-muted-foreground">
            <span className="flex items-center gap-1.5 font-semibold text-foreground"><Banknote className="h-3.5 w-3.5 text-primary" />{format(gig.budget_min)} - {format(gig.budget_max)}{gig.budget_type === "hourly" ? "/hr" : ""}</span>
            <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{gig.location_type}</span>
            <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />{gig.applications_count || 0} proposals</span>
          </div>
        </div>
      </div>
    </button>
  );
}

function GigDetail({ gig, viewerId, format, onApply }: { gig: Gig; viewerId: string | null; format: (value: number) => string; onApply: () => void }) {
  const clientName = gig.client?.full_name || gig.client?.username || "Zero Club client";
  const isOwner = gig.client_id === viewerId;
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <DrawerHeader className="border-b border-border px-5 pb-4 pt-2 md:px-6 md:pt-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">{gig.category}</p>
        <DrawerTitle className="pr-8 font-display text-[20px] leading-tight md:text-[23px]">{gig.title}</DrawerTitle>
        <DrawerDescription className="flex flex-wrap items-center gap-2 text-[11px]">
          <span>Posted {relativeDate(gig.created_at)}</span><span>·</span><span>{gig.location_type}</span><span>·</span><span>{gig.status}</span>
        </DrawerDescription>
      </DrawerHeader>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 md:px-6">
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3.5">
          <div className="h-11 w-11 overflow-hidden rounded-lg bg-muted">
            {gig.client?.avatar_url ? <img src={gig.client.avatar_url} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full w-full place-items-center bg-primary/10 font-semibold text-primary">{clientName.charAt(0).toUpperCase()}</div>}
          </div>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 truncate text-[13px] font-semibold">{clientName}{gig.client?.account_type === "Institution" && <BadgeCheck className="h-4 w-4 fill-primary text-primary-foreground" />}</p>
            <p className="mt-0.5 text-[10.5px] text-muted-foreground">{gig.client?.account_type || "Builder"} · Zero Club profile</p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <DetailMetric icon={Banknote} label="Budget" value={`${format(gig.budget_min)} - ${format(gig.budget_max)}${gig.budget_type === "hourly" ? "/hr" : ""}`} />
          <DetailMetric icon={Sparkles} label="Experience" value={gig.experience_level} />
          <DetailMetric icon={Clock3} label="Engagement" value={gig.budget_type === "hourly" ? "Hourly" : "Fixed price"} />
          <DetailMetric icon={CalendarDays} label="Deadline" value={gig.deadline ? new Date(gig.deadline).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Flexible"} />
        </div>

        <section className="mt-6">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">About the work</h3>
          <p className="mt-3 whitespace-pre-wrap text-[13px] leading-6 text-foreground/85">{gig.description}</p>
        </section>

        <section className="mt-6">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Skills</h3>
          <div className="mt-3 flex flex-wrap gap-2">{gig.skills.map((skill) => <span key={skill} className="rounded-md border border-border bg-card px-2.5 py-1.5 text-[10.5px] font-medium">{skill}</span>)}</div>
        </section>

        <div className="mt-6 flex items-center justify-between border-y border-border py-4 text-[11px] text-muted-foreground">
          <span>{gig.applications_count || 0} proposals received</span>
          <span className="capitalize">{gig.status}</span>
        </div>
      </div>
      <div className="border-t border-border bg-background p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:p-5">
        {isOwner ? (
          <div className="flex h-11 items-center justify-center rounded-lg border border-border bg-card text-[12px] font-semibold">You posted this gig</div>
        ) : gig.viewer_application ? (
          <div className="flex h-11 items-center justify-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] text-[12px] font-semibold text-emerald-600"><Check className="h-4 w-4" /> Proposal sent</div>
        ) : (
          <button onClick={onApply} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-[13px] font-semibold text-primary-foreground hover:opacity-90"><Send className="h-4 w-4" /> Send proposal</button>
        )}
      </div>
    </div>
  );
}

function DetailMetric({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return <div className="rounded-lg border border-border bg-card p-3"><Icon className="h-4 w-4 text-primary" /><p className="mt-2 text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</p><p className="mt-1 text-[11px] font-semibold leading-snug">{value}</p></div>;
}

function ProposalForm({ gig, proposal, setProposal, currencySymbol, submitting, onBack, onSubmit }: any) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-3 border-b border-border px-5 pb-4 pt-3 md:px-6 md:pt-5">
        <button onClick={onBack} className="grid h-9 w-9 place-items-center rounded-lg border border-border hover:bg-muted"><ArrowLeft className="h-4 w-4" /></button>
        <div><p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-primary">Proposal</p><h2 className="line-clamp-1 text-[16px] font-semibold">{gig.title}</h2></div>
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 md:px-6">
        <FormField label="Cover note"><textarea value={proposal.coverNote} onChange={(event) => setProposal({ ...proposal, coverNote: event.target.value })} rows={7} maxLength={2000} placeholder="Explain your approach, relevant experience, and the result you can deliver." className="w-full resize-none rounded-lg border border-border bg-card px-3 py-3 text-[13px] leading-relaxed outline-none placeholder:text-muted-foreground/60 focus:border-primary/50 focus:ring-2 focus:ring-primary/10" /></FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Your price"><div className="flex h-11 w-full min-w-0 items-center rounded-lg border border-border bg-card px-3 text-[13px] focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10"><span className="mr-2 text-muted-foreground">{currencySymbol}</span><input type="number" min="0" value={proposal.proposedAmount} onChange={(event) => setProposal({ ...proposal, proposedAmount: event.target.value })} className="min-w-0 flex-1 bg-transparent outline-none" /></div></FormField>
          <FormField label="Delivery days"><input type="number" min="1" value={proposal.deliveryDays} onChange={(event) => setProposal({ ...proposal, deliveryDays: event.target.value })} placeholder="7" className="h-11 w-full min-w-0 rounded-lg border border-border bg-card px-3 text-[13px] outline-none placeholder:text-muted-foreground/60 focus:border-primary/50 focus:ring-2 focus:ring-primary/10" /></FormField>
        </div>
        <FormField label="Portfolio link (optional)"><input type="url" value={proposal.portfolioUrl} onChange={(event) => setProposal({ ...proposal, portfolioUrl: event.target.value })} placeholder="https://" className="h-11 w-full min-w-0 rounded-lg border border-border bg-card px-3 text-[13px] outline-none placeholder:text-muted-foreground/60 focus:border-primary/50 focus:ring-2 focus:ring-primary/10" /></FormField>
      </div>
      <div className="border-t border-border p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:p-5"><button onClick={onSubmit} disabled={submitting} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-[13px] font-semibold text-primary-foreground disabled:opacity-50">{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{submitting ? "Sending" : "Send proposal"}</button></div>
    </div>
  );
}

function GigPostForm({ form, setForm, currencySymbol, submitting, onSubmit }: any) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <DrawerHeader className="border-b border-border px-5 pb-4 pt-2 md:px-6 md:pt-5"><p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-primary">Hire on Zero Club</p><DrawerTitle className="text-[20px]">Post a gig</DrawerTitle><DrawerDescription className="text-[11px]">Publish a clear brief for builders across the network.</DrawerDescription></DrawerHeader>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 md:px-6">
        <FormField label="Gig title"><input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} maxLength={100} placeholder="e.g. Product designer for a fintech dashboard" className="h-11 w-full min-w-0 rounded-lg border border-border bg-card px-3 text-[13px] outline-none placeholder:text-muted-foreground/60 focus:border-primary/50 focus:ring-2 focus:ring-primary/10" /></FormField>
        <FormField label="Project brief"><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} maxLength={4000} rows={6} placeholder="Describe the outcome, scope, and what a strong delivery looks like." className="w-full resize-none rounded-lg border border-border bg-card px-3 py-3 text-[13px] leading-relaxed outline-none placeholder:text-muted-foreground/60 focus:border-primary/50 focus:ring-2 focus:ring-primary/10" /></FormField>
        <div className="grid grid-cols-2 gap-3"><FilterSelect label="Category" value={form.category} onChange={(value) => setForm({ ...form, category: value })} options={CATEGORIES.filter((item) => item !== "All")} /><FilterSelect label="Work type" value={form.locationType} onChange={(value) => setForm({ ...form, locationType: value })} options={WORK_TYPES.filter((item) => item !== "All work types")} /></div>
        <FormField label="Skills"><input value={form.skills} onChange={(event) => setForm({ ...form, skills: event.target.value })} placeholder="Figma, UX research, Design systems" className="h-11 w-full min-w-0 rounded-lg border border-border bg-card px-3 text-[13px] outline-none placeholder:text-muted-foreground/60 focus:border-primary/50 focus:ring-2 focus:ring-primary/10" /><p className="mt-1.5 text-[9.5px] text-muted-foreground">Separate skills with commas.</p></FormField>
        <div className="grid grid-cols-2 gap-3"><FilterSelect label="Pricing" value={form.budgetType} onChange={(value) => setForm({ ...form, budgetType: value })} options={["fixed", "hourly"]} /><FilterSelect label="Experience" value={form.experienceLevel} onChange={(value) => setForm({ ...form, experienceLevel: value })} options={["Entry", "Intermediate", "Expert"]} /></div>
        <div className="grid grid-cols-2 gap-3"><FormField label="Minimum budget"><div className="flex h-11 w-full min-w-0 items-center rounded-lg border border-border bg-card px-3 text-[13px] focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10"><span className="mr-2 text-muted-foreground">{currencySymbol}</span><input type="number" min="0" value={form.budgetMin} onChange={(event) => setForm({ ...form, budgetMin: event.target.value })} className="min-w-0 flex-1 bg-transparent outline-none" /></div></FormField><FormField label="Maximum budget"><div className="flex h-11 w-full min-w-0 items-center rounded-lg border border-border bg-card px-3 text-[13px] focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10"><span className="mr-2 text-muted-foreground">{currencySymbol}</span><input type="number" min="0" value={form.budgetMax} onChange={(event) => setForm({ ...form, budgetMax: event.target.value })} className="min-w-0 flex-1 bg-transparent outline-none" /></div></FormField></div>
        <FormField label="Deadline (optional)"><input type="date" value={form.deadline} onChange={(event) => setForm({ ...form, deadline: event.target.value })} className="h-11 w-full min-w-0 rounded-lg border border-border bg-card px-3 text-[13px] outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10" /></FormField>
      </div>
      <div className="border-t border-border p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:p-5"><button onClick={onSubmit} disabled={submitting} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-[13px] font-semibold text-primary-foreground disabled:opacity-50">{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <BriefcaseBusiness className="h-4 w-4" />}{submitting ? "Publishing" : "Publish gig"}</button></div>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block min-w-0"><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</span>{children}</label>;
}

function MarketplaceEmptyState({ tab, onPost }: { tab: MarketplaceTab; onPost: () => void }) {
  const content = tab === "applications" ? { title: "No proposals sent", detail: "Your applications will appear here." } : tab === "posted" ? { title: "No gigs posted", detail: "Post a gig when you are ready to hire." } : { title: "No matching gigs", detail: "Try another search or adjust the filters." };
  return <div className="rounded-lg border border-border bg-card px-5 py-16 text-center"><div className="mx-auto grid h-11 w-11 place-items-center rounded-lg bg-primary/10 text-primary"><BriefcaseBusiness className="h-5 w-5" /></div><h3 className="mt-4 text-[15px] font-semibold">{content.title}</h3><p className="mt-1 text-[12px] text-muted-foreground">{content.detail}</p>{tab === "posted" && <button onClick={onPost} className="mt-5 rounded-lg bg-primary px-4 py-2.5 text-[12px] font-semibold text-primary-foreground">Post a gig</button>}</div>;
}

function GigListSkeleton() {
  return <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">{[1, 2, 3].map((item) => <div key={item} className="p-5"><div className="flex gap-3"><div className="h-10 w-10 animate-pulse rounded-lg bg-muted" /><div className="flex-1"><div className="h-3 w-32 animate-pulse rounded bg-muted" /><div className="mt-3 h-4 w-2/3 animate-pulse rounded bg-muted" /><div className="mt-2 h-3 w-full animate-pulse rounded bg-muted" /><div className="mt-4 h-7 w-1/2 animate-pulse rounded bg-muted" /></div></div></div>)}</div>;
}
