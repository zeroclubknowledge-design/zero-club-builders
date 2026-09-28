import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BadgeCheck, Banknote, BriefcaseBusiness, CalendarDays, Check, Clock3, Loader2, Plus, Search, Send, SlidersHorizontal, Sparkles } from "@/components/icons/glyphs";
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
  const goBack = useGoBack("/app");
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
      const [{ data: clients }, { data: applications }, { data: viewerProfile }] = await Promise.all([
        clientIds.length
          ? supabase.from("profiles").select("id, username, full_name, avatar_url, account_type").in("id", clientIds)
          : Promise.resolve({ data: [] as any[] }),
        viewerId && gigIds.length
          ? supabase.from("gig_applications").select("*").eq("applicant_id", viewerId).in("gig_id", gigIds)
          : Promise.resolve({ data: [] as any[] }),
        viewerId
          ? supabase.from("profiles").select("account_type, is_admin").eq("id", viewerId).maybeSingle()
          : Promise.resolve({ data: null as any }),
      ]);

      const clientMap = new Map((clients || []).map((client: any) => [client.id, client]));
      const applicationMap = new Map((applications || []).map((application: any) => [application.gig_id, application]));
      const enriched = (gigs || []).map((gig: any) => ({
        ...gig,
        skills: gig.skills || [],
        client: clientMap.get(gig.client_id) || null,
        viewer_application: applicationMap.get(gig.id) || null,
      })) as Gig[];

      return {
        viewerId,
        gigs: enriched,
        canPostGig: viewerProfile?.account_type === "Institution" || Boolean(viewerProfile?.is_admin),
      };
    },
    staleTime: 20_000,
  });

  const viewerId = data?.viewerId || null;
  const gigs = data?.gigs || [];
  const canPostGig = Boolean(data?.canPostGig);

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
      const { data: postingProfile } = await supabase.from("profiles").select("account_type, is_admin").eq("id", authData.user.id).single();
      if (postingProfile?.account_type !== "Institution" && !postingProfile?.is_admin) {
        throw new Error("Only institutions and Zero Club admins can post gigs");
      }
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

  const allTabs: { id: MarketplaceTab; label: string; count?: number }[] = [
    { id: "browse", label: "Browse gigs", count: gigs.filter((gig) => gig.status === "open").length },
    { id: "applications", label: "My applications", count: gigs.filter((gig) => gig.viewer_application).length },
    { id: "posted", label: "Posted by me", count: gigs.filter((gig) => gig.client_id === viewerId).length },
  ];
  const tabs = allTabs.filter((tab) => tab.id !== "posted" || canPostGig || Number(tab.count) > 0);

  const openGig = (gig: Gig) => {
    setSelectedGig(gig);
    setDetailMode("details");
    setProposal({ ...defaultProposal, proposedAmount: String(Number(gig.budget_min) / currency.rate) });
  };

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-foreground">
      <header className="sticky top-0 z-40 bg-card pt-[env(safe-area-inset-top)]">
        <div className="zc-page-width mx-auto flex h-14 max-w-[900px] items-center gap-1 px-2">
          <button type="button" onClick={goBack} aria-label="Back" className="grid h-11 w-10 shrink-0 place-items-center rounded-full text-foreground tap hover:bg-foreground/[0.04]">
            <ArrowLeft className="h-[22px] w-[22px]" />
          </button>
          <h1 className="flex-1 truncate font-display text-[18px] font-semibold">Opportunities</h1>
          {canPostGig && (
            <button
              onClick={() => setPostOpen(true)}
              className="mr-2 flex h-9 shrink-0 items-center gap-1 rounded-full bg-foreground px-3.5 text-[14px] font-semibold text-background tap hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> Post a gig
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
                aria-label="Search gigs"
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
              <FilterSelect label="Category" value={category} onChange={setCategory} options={CATEGORIES} />
              <FilterSelect label="Work type" value={workType} onChange={setWorkType} options={WORK_TYPES} />
              <label className="space-y-1.5">
                <span className="text-[12px] font-semibold text-muted-foreground">Minimum budget</span>
                <div className="flex h-10 items-center rounded-lg border border-border bg-card px-3">
                  <span className="mr-2 text-[14px] text-muted-foreground">{currency.symbol}</span>
                  <input type="number" min="0" value={budgetFloor} onChange={(event) => setBudgetFloor(event.target.value)} placeholder="Any" className="min-w-0 flex-1 bg-transparent text-[14px] outline-none" />
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
              {Number(tab.count) > 0 && <span className="text-[12px] font-medium tabular-nums text-muted-foreground">{tab.count}</span>}
              {activeTab === tab.id && <span className="absolute inset-x-0 bottom-0 h-[2px] bg-foreground" />}
            </button>
          ))}
        </div>
      </header>

      <main className="zc-page-width mx-auto w-full max-w-[900px]">
        {isLoading ? (
          <GigListSkeleton />
        ) : isError ? (
          <div className="mt-2 bg-card px-5 py-14 text-center md:rounded-xl">
            <BriefcaseBusiness className="mx-auto h-7 w-7 text-muted-foreground" />
            <h3 className="mt-3 font-display text-[17px] font-semibold">The marketplace could not load</h3>
            <button onClick={() => refetch()} className="mt-4 h-9 rounded-full border border-foreground/30 px-4 text-[14px] font-semibold hover:bg-foreground/[0.04]">Try again</button>
          </div>
        ) : filteredGigs.length ? (
          <section className="mt-2 bg-card md:overflow-hidden md:rounded-xl md:border md:border-border">
            {filteredGigs.map((gig) => <GigRow key={gig.id} gig={gig} format={format} viewerId={viewerId} onOpen={() => openGig(gig)} />)}
          </section>
        ) : (
          <MarketplaceEmptyState tab={activeTab} canPost={canPostGig} onPost={() => setPostOpen(true)} />
        )}
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
      {/* The last card runs to the bottom of the screen, so the page never
          ends in a strip of bare background under the tab bar. */}
      <div aria-hidden className="min-h-24 flex-1 bg-card md:bg-transparent" />
    </div>
  );
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
  const isInstitution = gig.client?.account_type === "Institution";
  return (
    <button onClick={onOpen} className="group grid w-full grid-cols-[48px_minmax(0,1fr)] gap-3 border-b border-border px-4 py-3.5 text-left transition-colors last:border-b-0 hover:bg-foreground/[0.02]">
      <div className={`h-12 w-12 overflow-hidden bg-foreground/[0.06] ${isInstitution ? "rounded-xl" : "rounded-full"}`}>
        {gig.client?.avatar_url ? (
          <img src={gig.client.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
        ) : (
          <div className="grid h-full w-full place-items-center text-[15px] font-semibold text-muted-foreground">{clientName.charAt(0).toUpperCase()}</div>
        )}
      </div>
      <div className="min-w-0">
        <h3 className="text-[16px] font-semibold leading-snug tracking-normal text-foreground [font-family:inherit] group-hover:underline">{gig.title}</h3>
        <p className="mt-0.5 flex items-center gap-1 truncate text-[14px] text-foreground">
          {clientName}
          {isInstitution && <BadgeCheck className="h-4 w-4 shrink-0 fill-current text-accent" />}
        </p>
        <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
          {format(gig.budget_min)} – {format(gig.budget_max)}{gig.budget_type === "hourly" ? "/hr" : ""} · {gig.location_type}
        </p>
        {gig.skills.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {gig.skills.slice(0, 4).map((skill) => (
              <span key={skill} className="rounded-md bg-foreground/[0.05] px-2 py-0.5 text-[12px] font-medium text-foreground/80">{skill}</span>
            ))}
          </div>
        )}
        <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-[12px] text-muted-foreground">
          <span>{relativeDate(gig.created_at)}</span>
          <span aria-hidden>·</span>
          <span>{gig.applications_count || 0} {(gig.applications_count || 0) === 1 ? "proposal" : "proposals"}</span>
          {isOwner && (
            <>
              <span aria-hidden>·</span>
              <span className="font-semibold text-accent">Your listing</span>
            </>
          )}
          {gig.viewer_application && (
            <>
              <span aria-hidden>·</span>
              <span className="flex items-center gap-1 font-semibold text-success"><Check className="h-3.5 w-3.5" /> Proposal sent</span>
            </>
          )}
        </p>
      </div>
    </button>
  );
}

function GigDetail({ gig, viewerId, format, onApply }: { gig: Gig; viewerId: string | null; format: (value: number) => string; onApply: () => void }) {
  const clientName = gig.client?.full_name || gig.client?.username || "Zero Club client";
  const isOwner = gig.client_id === viewerId;
  const isInstitution = gig.client?.account_type === "Institution";
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <DrawerHeader className="shrink-0 gap-0 px-5 pb-3 pt-1 sm:gap-0 sm:px-5 sm:pb-3 sm:pt-1 md:px-6 md:pt-5">
        <span className="w-fit rounded-full bg-[#cc208f]/10 px-2.5 py-0.5 text-[12px] font-semibold text-[#a3186f]">{gig.category}</span>
        <DrawerTitle className="mt-2 pr-8 font-display text-[20px] font-semibold leading-tight">{gig.title}</DrawerTitle>
        <DrawerDescription className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[14px] leading-relaxed text-muted-foreground">
          <span>Posted {relativeDate(gig.created_at)}</span><span aria-hidden>·</span><span>{gig.location_type}</span><span aria-hidden>·</span><span className="capitalize">{gig.status}</span>
        </DrawerDescription>
      </DrawerHeader>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 md:px-6">
        <div className="flex items-center gap-3 py-3">
          <div className={`h-11 w-11 shrink-0 overflow-hidden bg-foreground/[0.06] ${isInstitution ? "rounded-xl" : "rounded-full"}`}>
            {gig.client?.avatar_url ? <img src={gig.client.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" /> : <div className="grid h-full w-full place-items-center text-[15px] font-semibold text-muted-foreground">{clientName.charAt(0).toUpperCase()}</div>}
          </div>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 truncate text-[15px] font-semibold">{clientName}{isInstitution && <BadgeCheck className="h-4 w-4 shrink-0 fill-[#cc208f] text-white" />}</p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">{gig.client?.account_type || "Builder"} · Zero Club profile</p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <DetailMetric icon={Banknote} label="Budget" value={`${format(gig.budget_min)} - ${format(gig.budget_max)}${gig.budget_type === "hourly" ? "/hr" : ""}`} />
          <DetailMetric icon={Sparkles} label="Experience" value={gig.experience_level} />
          <DetailMetric icon={Clock3} label="Engagement" value={gig.budget_type === "hourly" ? "Hourly" : "Fixed price"} />
          <DetailMetric icon={CalendarDays} label="Deadline" value={gig.deadline ? new Date(gig.deadline).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Flexible"} />
        </div>

        <section className="mt-6">
          <h3 className="text-[13px] font-semibold text-muted-foreground">About the work</h3>
          <div className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">
            <LinkifiedText text={gig.description} />
          </div>
        </section>

        <section className="mt-6">
          <h3 className="text-[13px] font-semibold text-muted-foreground">Skills</h3>
          <div className="mt-2 flex flex-wrap gap-2">{gig.skills.map((skill) => <span key={skill} className="rounded-full bg-foreground/[0.05] px-3 py-1 text-[13px] font-medium text-foreground">{skill}</span>)}</div>
        </section>

        <div className="mt-6 flex items-center justify-between rounded-2xl bg-foreground/[0.04] px-4 py-3">
          <span className="text-[14px] text-muted-foreground"><span className="font-semibold tabular-nums text-foreground">{gig.applications_count || 0}</span> proposals received</span>
          <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold capitalize ${gig.status === "open" ? "bg-[#1a7f4b]/10 text-[#1a7f4b]" : "bg-foreground/[0.06] text-muted-foreground"}`}>{gig.status}</span>
        </div>
      </div>
      <div className="shrink-0 border-t border-border/60 bg-background px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 md:px-6 md:pb-5">
        {isOwner ? (
          <div className="flex h-12 items-center justify-center rounded-full bg-foreground/[0.05] text-[15px] font-semibold text-muted-foreground">You posted this gig</div>
        ) : gig.viewer_application ? (
          <div className="flex h-12 items-center justify-center gap-2 rounded-full bg-[#1a7f4b]/10 text-[15px] font-semibold text-[#1a7f4b]"><Check className="h-5 w-5" /> Proposal sent</div>
        ) : (
          <button onClick={onApply} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground text-[16px] font-semibold text-background transition-opacity hover:opacity-90"><Send className="h-5 w-5" /> Send proposal</button>
        )}
      </div>
    </div>
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

function ProposalForm({ gig, proposal, setProposal, currencySymbol, submitting, onBack, onSubmit }: any) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-start gap-3 px-5 pb-3 pt-1 md:px-6 md:pt-5">
        <button onClick={onBack} aria-label="Back to gig" className="-ml-2 grid h-10 w-10 shrink-0 place-items-center rounded-full text-foreground hover:bg-foreground/[0.04]"><ArrowLeft className="h-[22px] w-[22px]" /></button>
        <div className="min-w-0 pt-0.5">
          <DrawerTitle className="font-display text-[20px] font-semibold leading-tight">Send a proposal</DrawerTitle>
          <p className="mt-1 line-clamp-1 text-[14px] leading-relaxed text-muted-foreground">{gig.title}</p>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-5 pt-1 md:px-6">
        <FormField label="Cover note"><textarea value={proposal.coverNote} onChange={(event) => setProposal({ ...proposal, coverNote: event.target.value })} rows={7} maxLength={2000} placeholder="Explain your approach, relevant experience, and the result you can deliver." className="w-full resize-none rounded-[10px] border border-foreground/15 bg-card px-3 py-2.5 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground focus:border-foreground/40" /></FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Your price"><div className="flex h-11 w-full min-w-0 items-center rounded-[10px] border border-foreground/15 bg-card px-3 text-[15px] focus-within:border-foreground/40"><span className="mr-2 text-muted-foreground">{currencySymbol}</span><input type="number" min="0" value={proposal.proposedAmount} onChange={(event) => setProposal({ ...proposal, proposedAmount: event.target.value })} className="min-w-0 flex-1 bg-transparent tabular-nums outline-none" /></div></FormField>
          <FormField label="Delivery days"><input type="number" min="1" value={proposal.deliveryDays} onChange={(event) => setProposal({ ...proposal, deliveryDays: event.target.value })} placeholder="7" className="h-11 w-full min-w-0 rounded-[10px] border border-foreground/15 bg-card px-3 text-[15px] outline-none placeholder:text-muted-foreground focus:border-foreground/40 tabular-nums" /></FormField>
        </div>
        <FormField label="Portfolio link (optional)"><input type="url" value={proposal.portfolioUrl} onChange={(event) => setProposal({ ...proposal, portfolioUrl: event.target.value })} placeholder="https://" className="h-11 w-full min-w-0 rounded-[10px] border border-foreground/15 bg-card px-3 text-[15px] outline-none placeholder:text-muted-foreground focus:border-foreground/40" /></FormField>
      </div>
      <div className="shrink-0 border-t border-border/60 px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 md:px-6 md:pb-5"><button onClick={onSubmit} disabled={submitting} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground text-[16px] font-semibold text-background disabled:opacity-40">{submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}{submitting ? "Sending" : "Send proposal"}</button></div>
    </div>
  );
}

function GigPostForm({ form, setForm, currencySymbol, submitting, onSubmit }: any) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <DrawerHeader className="shrink-0 gap-0 px-5 pb-3 pt-1 sm:gap-0 sm:px-5 sm:pb-3 sm:pt-1 md:px-6 md:pt-5">
        <p className="text-[13px] font-semibold text-[#a3186f]">Hire on Zero Club</p>
        <DrawerTitle className="mt-0.5 font-display text-[20px] font-semibold leading-tight">Post a gig</DrawerTitle>
        <DrawerDescription className="mt-1 text-[14px] leading-relaxed text-muted-foreground">Publish a clear brief for builders across the network.</DrawerDescription>
      </DrawerHeader>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-5 pt-1 md:px-6">
        <FormField label="Gig title"><input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} maxLength={100} placeholder="e.g. Product designer for a fintech dashboard" className="h-11 w-full min-w-0 rounded-[10px] border border-foreground/15 bg-card px-3 text-[15px] outline-none placeholder:text-muted-foreground focus:border-foreground/40" /></FormField>
        <FormField label="Project brief"><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} maxLength={4000} rows={6} placeholder="Describe the outcome, scope, and what a strong delivery looks like." className="w-full resize-none rounded-[10px] border border-foreground/15 bg-card px-3 py-2.5 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground focus:border-foreground/40" /></FormField>
        <div className="grid grid-cols-2 gap-3"><SheetSelect label="Category" value={form.category} onChange={(value) => setForm({ ...form, category: value })} options={CATEGORIES.filter((item) => item !== "All")} /><SheetSelect label="Work type" value={form.locationType} onChange={(value) => setForm({ ...form, locationType: value })} options={WORK_TYPES.filter((item) => item !== "All work types")} /></div>
        <FormField label="Skills"><input value={form.skills} onChange={(event) => setForm({ ...form, skills: event.target.value })} placeholder="Figma, UX research, Design systems" className="h-11 w-full min-w-0 rounded-[10px] border border-foreground/15 bg-card px-3 text-[15px] outline-none placeholder:text-muted-foreground focus:border-foreground/40" /><p className="mt-1.5 text-[13px] text-muted-foreground">Separate skills with commas.</p></FormField>
        <div className="grid grid-cols-2 gap-3"><SheetSelect label="Pricing" value={form.budgetType} onChange={(value) => setForm({ ...form, budgetType: value })} options={["fixed", "hourly"]} /><SheetSelect label="Experience" value={form.experienceLevel} onChange={(value) => setForm({ ...form, experienceLevel: value })} options={["Entry", "Intermediate", "Expert"]} /></div>
        <div className="grid grid-cols-2 gap-3"><FormField label="Minimum budget"><div className="flex h-11 w-full min-w-0 items-center rounded-[10px] border border-foreground/15 bg-card px-3 text-[15px] focus-within:border-foreground/40"><span className="mr-2 text-muted-foreground">{currencySymbol}</span><input type="number" min="0" value={form.budgetMin} onChange={(event) => setForm({ ...form, budgetMin: event.target.value })} className="min-w-0 flex-1 bg-transparent tabular-nums outline-none" /></div></FormField><FormField label="Maximum budget"><div className="flex h-11 w-full min-w-0 items-center rounded-[10px] border border-foreground/15 bg-card px-3 text-[15px] focus-within:border-foreground/40"><span className="mr-2 text-muted-foreground">{currencySymbol}</span><input type="number" min="0" value={form.budgetMax} onChange={(event) => setForm({ ...form, budgetMax: event.target.value })} className="min-w-0 flex-1 bg-transparent tabular-nums outline-none" /></div></FormField></div>
        <FormField label="Deadline (optional)"><input type="date" value={form.deadline} onChange={(event) => setForm({ ...form, deadline: event.target.value })} className="h-11 w-full min-w-0 rounded-[10px] border border-foreground/15 bg-card px-3 text-[15px] outline-none placeholder:text-muted-foreground focus:border-foreground/40" /></FormField>
      </div>
      <div className="shrink-0 border-t border-border/60 px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 md:px-6 md:pb-5"><button onClick={onSubmit} disabled={submitting} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#cc208f] text-[16px] font-semibold text-white disabled:opacity-40">{submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <BriefcaseBusiness className="h-5 w-5" />}{submitting ? "Publishing" : "Publish gig"}</button></div>
    </div>
  );
}

/* The select used inside the Post a gig sheet. The page's filter bar keeps
   its own compact FilterSelect. */
function SheetSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <FormField label={label}>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-11 w-full min-w-0 rounded-[10px] border border-foreground/15 bg-card px-3 text-[15px] outline-none placeholder:text-muted-foreground focus:border-foreground/40 capitalize">
        {options.map((option) => <option key={option}>{option}</option>)}
      </select>
    </FormField>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block min-w-0"><span className="mb-1.5 block text-[13px] font-semibold text-muted-foreground">{label}</span>{children}</label>;
}

function MarketplaceEmptyState({ tab, canPost, onPost }: { tab: MarketplaceTab; canPost: boolean; onPost: () => void }) {
  const content = tab === "applications" ? { title: "No proposals sent", detail: "Your applications will appear here." } : tab === "posted" ? { title: "No gigs posted", detail: "Post a gig when you are ready to hire." } : { title: "No matching gigs", detail: "Try another search or adjust the filters." };
  return (
    <div className="mt-2 bg-card px-5 py-16 text-center md:rounded-xl">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-foreground/[0.05] text-muted-foreground"><BriefcaseBusiness className="h-5 w-5" /></div>
      <h3 className="mt-4 font-display text-[17px] font-semibold">{content.title}</h3>
      <p className="mt-1 text-[14px] text-muted-foreground">{content.detail}</p>
      {tab === "posted" && canPost && <button onClick={onPost} className="mt-5 h-10 rounded-full bg-foreground px-5 text-[15px] font-semibold text-background">Post a gig</button>}
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
