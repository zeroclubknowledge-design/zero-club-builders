import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { uploadFile } from "@/lib/storage";
import {
  Plus, Users, LayoutGrid, GraduationCap, Building2, Trash2,
  BarChart3, Settings, Search, ChevronRight, Loader2,
  TrendingUp, DollarSign, BookOpen, Zap, Eye,
  UploadCloud, UserPlus, Activity, ArrowUpRight,
  Calendar, Hash, Video, Check, X, Edit3,
  ChevronLeft, MoreHorizontal, Shield, Star, Clock
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle
} from "@/components/ui/drawer";

export const Route = createFileRoute("/app/institution-studio/")({
  component: InstitutionHub,
});

/* ═══════════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════════ */
const fmt = (n?: number | null) => (n ?? 0).toLocaleString();
const StatCard = ({ icon: Icon, label, value, accent }: { icon: any; label: string; value: string | number; accent?: string }) => (
  <div className="relative overflow-hidden rounded-2xl bg-card ring-1 ring-border p-5 shadow-soft group hover:ring-foreground/15 transition-all">
    <div className={`grid h-10 w-10 place-items-center rounded-xl ${accent || "bg-primary/8 text-primary"} ring-1 ring-black/[0.04] mb-3`}>
      <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
    </div>
    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
    <p className="text-[22px] font-semibold tracking-tight font-display mt-1 tabular-nums">{value}</p>
  </div>
);

/* ═══════════════════════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════════════════════ */
function InstitutionHub() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"overview" | "tutors" | "bootcamps" | "analytics" | "settings">("overview");
  const [profile, setProfile] = useState<any>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  // ── Tutor management ──
  const [inviteQuery, setInviteQuery] = useState("");
  const [inviting, setInviting] = useState(false);

  // ── Bootcamp creation ──
  const [showCreateBootcamp, setShowCreateBootcamp] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newBootcamp, setNewBootcamp] = useState({
    title: "", description: "", category: "Development", price: "0",
  });
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  // ── Assign tutor drawer ──
  const [assignDrawer, setAssignDrawer] = useState<string | null>(null); // bootcampId
  const [assigning, setAssigning] = useState(false);

  // ── Settings ──
  const [editingProfile, setEditingProfile] = useState(false);
  const [settingsForm, setSettingsForm] = useState({ full_name: "", bio: "", location: "", website: "" });
  const [savingSettings, setSavingSettings] = useState(false);

  // ── Search ──
  const [bootcampSearch, setBootcampSearch] = useState("");

  /* ── Listen for tab changes from the unified main sidebar (desktop) ── */
  useEffect(() => {
    const handler = (e: Event) => {
      const tab = (e as CustomEvent).detail;
      if (tab) setActiveTab(tab);
    };
    window.addEventListener("institution-tab-change", handler);
    return () => window.removeEventListener("institution-tab-change", handler);
  }, []);

  /* ── Load institution profile ── */
  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
      if (data) {
        setProfile(data);
        setSettingsForm({
          full_name: data.full_name || "",
          bio: data.bio || "",
          location: data.location || "",
          website: data.website || "",
        });
      }
      setProfileLoading(false);
    }
    load();
  }, []);

  /* ── Fetch tutors ── */
  const { data: tutors = [], isLoading: tutorsLoading, refetch: refetchTutors } = useQuery({
    queryKey: ["institution-tutors", profile?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("institution_tutors")
        .select("*, tutor:profiles!institution_tutors_tutor_id_fkey(*)")
        .eq("institution_id", profile.id);
      return data || [];
    },
    enabled: !!profile?.id,
  });

  /* ── Fetch all bootcamps (institution-created + tutor-created) ── */
  const { data: allBootcamps = [], isLoading: bootcampsLoading, refetch: refetchBootcamps } = useQuery({
    queryKey: ["institution-all-bootcamps", profile?.id],
    queryFn: async () => {
      const tutorIds = tutors.map((t: any) => t.tutor_id);
      const allCreatorIds = [profile.id, ...tutorIds];

      const { data, error } = await supabase
        .from("bootcamps")
        .select("*, profiles:creator_id(id, username, full_name, avatar_url), enrollments(count)")
        .in("creator_id", allCreatorIds)
        .order("created_at", { ascending: false });

      if (error) { console.error(error); return []; }
      return data || [];
    },
    enabled: !!profile?.id && !tutorsLoading,
  });

  /* ── Enrollment count ── */
  const totalLearners = allBootcamps.reduce((acc: number, b: any) => acc + (b.enrollments?.[0]?.count || 0), 0);
  const totalRevenue = allBootcamps.reduce((acc: number, b: any) => {
    const enrollCount = b.enrollments?.[0]?.count || 0;
    return acc + (b.price || 0) * enrollCount;
  }, 0);

  /* ═══ HANDLERS ═══ */

  const handleAddTutor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteQuery.trim() || !profile) return;
    setInviting(true);

    const { data: found } = await supabase
      .from("profiles")
      .select("id, account_type, username, full_name")
      .or(`username.ilike.${inviteQuery.trim()},full_name.ilike.${inviteQuery.trim()}`)
      .maybeSingle();

    if (!found) { toast.error("User not found."); setInviting(false); return; }
    if (found.account_type !== "Tutor") { toast.error("This user is not a Tutor account."); setInviting(false); return; }

    const { data: existing } = await supabase
      .from("institution_tutors")
      .select("id")
      .eq("institution_id", profile.id)
      .eq("tutor_id", found.id)
      .maybeSingle();

    if (existing) { toast.error("Tutor is already in your organization."); setInviting(false); return; }

    // Send invitation DM
    const { error } = await supabase.from("messages").insert({
      sender_id: profile.id,
      receiver_id: found.id,
      content: `TUTOR_INVITE:${profile.id}:${profile.full_name || profile.username || "Institution"}`
    });

    if (error) { toast.error("Failed to send invitation."); }
    else { toast.success(`Invitation sent to @${found.username}!`); setInviteQuery(""); }
    setInviting(false);
  };

  const handleRemoveTutor = async (tutorId: string) => {
    if (!confirm("Remove this tutor from your organization?")) return;
    const { error } = await supabase
      .from("institution_tutors")
      .delete()
      .match({ institution_id: profile.id, tutor_id: tutorId });
    if (error) toast.error("Failed to remove tutor.");
    else { toast.success("Tutor removed."); refetchTutors(); }
  };

  const handleCreateBootcamp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !newBootcamp.title) return;
    setCreating(true);

    try {
      let bannerUrl = "";
      if (bannerFile) {
        const ext = bannerFile.name.split(".").pop();
        const fname = `${Date.now()}.${ext}`;
        bannerUrl = await uploadFile("bootcamp-banners", bannerFile, `${profile.id}/${fname}`);
      }

      const { data: created, error } = await supabase
        .from("bootcamps")
        .insert([{
          creator_id: profile.id,
          title: newBootcamp.title,
          description: newBootcamp.description,
          category: newBootcamp.category,
          price: Number(newBootcamp.price) || 0,
          banner_url: bannerUrl,
          status: "active",
        }])
        .select()
        .single();

      if (error) throw error;

      // Auto-create a club for the bootcamp
      const { data: newClub } = await supabase
        .from("clubs")
        .insert([{
          name: newBootcamp.title,
          description: newBootcamp.description,
          category: "Bootcamp",
          creator_id: profile.id,
          is_private: true,
          price: Number(newBootcamp.price) || 0,
          banner_url: bannerUrl,
          logo_url: bannerUrl,
        }])
        .select()
        .single();

      if (newClub) {
        await supabase.from("club_members").insert([{
          club_id: newClub.id,
          profile_id: profile.id,
          role: "Administrator",
        }]);
      }

      toast.success("Bootcamp created!");
      setShowCreateBootcamp(false);
      setNewBootcamp({ title: "", description: "", category: "Development", price: "0" });
      setBannerFile(null);
      setBannerPreview(null);
      refetchBootcamps();
    } catch (err: any) {
      toast.error(err.message || "Failed to create bootcamp");
    } finally {
      setCreating(false);
    }
  };

  const handleAssignTutor = async (bootcampId: string, tutorId: string) => {
    setAssigning(true);
    try {
      // Update bootcamp's assigned_tutor_id
      const { error } = await supabase
        .from("bootcamps")
        .update({ assigned_tutor_id: tutorId })
        .eq("id", bootcampId);

      if (error) throw error;

      // Also add tutor as admin to the club associated with this bootcamp
      const bootcamp = allBootcamps.find((b: any) => b.id === bootcampId);
      if (bootcamp) {
        const { data: club } = await supabase
          .from("clubs")
          .select("id")
          .eq("creator_id", profile.id)
          .eq("name", bootcamp.title)
          .maybeSingle();

        if (club) {
          // Check if tutor is already a member
          const { data: existingMember } = await supabase
            .from("club_members")
            .select("id")
            .eq("club_id", club.id)
            .eq("profile_id", tutorId)
            .maybeSingle();

          if (!existingMember) {
            await supabase.from("club_members").insert([{
              club_id: club.id,
              profile_id: tutorId,
              role: "Administrator",
            }]);
          } else {
            await supabase
              .from("club_members")
              .update({ role: "Administrator" })
              .eq("club_id", club.id)
              .eq("profile_id", tutorId);
          }
        }
      }

      toast.success("Tutor assigned to bootcamp!");
      setAssignDrawer(null);
      refetchBootcamps();
    } catch (err: any) {
      toast.error(err.message || "Failed to assign tutor");
    } finally {
      setAssigning(false);
    }
  };

  const handleUnassignTutor = async (bootcampId: string) => {
    const { error } = await supabase
      .from("bootcamps")
      .update({ assigned_tutor_id: null })
      .eq("id", bootcampId);
    if (error) toast.error("Failed to unassign.");
    else { toast.success("Tutor unassigned."); refetchBootcamps(); }
  };

  const handleDeleteBootcamp = async (bootcampId: string) => {
    if (!confirm("Delete this bootcamp permanently?")) return;
    const { error } = await supabase.from("bootcamps").delete().eq("id", bootcampId);
    if (error) toast.error("Failed to delete.");
    else { toast.success("Bootcamp deleted."); refetchBootcamps(); }
  };

  const handleSaveSettings = async () => {
    if (!profile) return;
    setSavingSettings(true);
    const { error } = await supabase
      .from("profiles")
      .update(settingsForm)
      .eq("id", profile.id);
    if (error) toast.error("Failed to save.");
    else {
      toast.success("Settings saved!");
      setProfile({ ...profile, ...settingsForm });
      setEditingProfile(false);
    }
    setSavingSettings(false);
  };

  const filteredBootcamps = allBootcamps.filter((b: any) =>
    b.title?.toLowerCase().includes(bootcampSearch.toLowerCase()) ||
    b.category?.toLowerCase().includes(bootcampSearch.toLowerCase())
  );

  // Top performing bootcamps
  const topBootcamps = [...allBootcamps]
    .sort((a: any, b: any) => (b.enrollments?.[0]?.count || 0) - (a.enrollments?.[0]?.count || 0))
    .slice(0, 5);

  // Top tutors by bootcamp count
  const tutorBootcampCounts = tutors.map((t: any) => {
    const count = allBootcamps.filter((b: any) => b.creator_id === t.tutor_id || b.assigned_tutor_id === t.tutor_id).length;
    const learnerCount = allBootcamps
      .filter((b: any) => b.creator_id === t.tutor_id || b.assigned_tutor_id === t.tutor_id)
      .reduce((acc: number, b: any) => acc + (b.enrollments?.[0]?.count || 0), 0);
    return { ...t, bootcampCount: count, learnerCount };
  }).sort((a: any, b: any) => b.learnerCount - a.learnerCount);

  const CATEGORIES = ["Development", "Design", "Data Science", "Business", "Marketing", "AI/ML", "DevOps", "Cybersecurity"];

  const sidebarItems = [
    { key: "overview", label: "Overview", Icon: Activity },
    { key: "tutors", label: "Tutors", Icon: Users },
    { key: "bootcamps", label: "Bootcamps", Icon: LayoutGrid },
    { key: "analytics", label: "Analytics", Icon: BarChart3 },
    { key: "settings", label: "Settings", Icon: Settings },
  ] as const;

  if (profileLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-1 w-24 overflow-hidden rounded-full bg-foreground/[0.06]">
          <div className="h-full w-1/3 rounded-full bg-primary animate-progress" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-env(safe-area-inset-top))] pt-[env(safe-area-inset-top)] bg-background">
      {/* ═══ DESKTOP SIDEBAR — hidden; tabs are in main app sidebar ═══ */}
      {/* The main sidebar in app.tsx now renders institution hub tabs on desktop.
          We keep the mobile bottom tab bar below for small screens. */}

      {/* ═══ MOBILE TAB BAR ═══ */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 md:left-[292px] z-50 bg-background/95 backdrop-blur-xl border-t hairline px-2 pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-around">
          {sidebarItems.map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex flex-col items-center gap-0.5 py-2.5 px-3 transition-colors ${
                activeTab === key ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Icon className="h-5 w-5" strokeWidth={activeTab === key ? 2.25 : 1.75} />
              <span className="text-[9px] font-semibold tracking-tight">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ═══ MAIN CONTENT ═══ */}
      <div className="flex-1 overflow-auto pb-20 lg:pb-6 min-w-0">
        <div className="w-full p-5 md:p-8 lg:px-10 lg:py-8">

          {/* ────────────────── OVERVIEW TAB ────────────────── */}
          {activeTab === "overview" && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {/* Welcome */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h1 className="text-[24px] md:text-[28px] font-semibold tracking-tight font-display">
                    Welcome back, {(profile?.full_name || "Admin").split(" ")[0]}
                  </h1>
                  <p className="text-[13.5px] text-muted-foreground mt-1 leading-relaxed">
                    Here's an overview of your tech hub's performance.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setActiveTab("bootcamps"); setShowCreateBootcamp(true); }}
                    className="flex items-center gap-1.5 h-10 px-5 bg-foreground text-background text-[13px] font-semibold tracking-tight rounded-full tap hover:opacity-90 transition shadow-sm"
                  >
                    <Plus className="h-4 w-4" /> Create Bootcamp
                  </button>
                </div>
              </div>

              {/* KPI Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard icon={Users} label="Total tutors" value={fmt(tutors.length)} accent="bg-blue-500/10 text-blue-500" />
                <StatCard icon={LayoutGrid} label="Bootcamps" value={fmt(allBootcamps.length)} accent="bg-violet-500/10 text-violet-500" />
                <StatCard icon={GraduationCap} label="Learners" value={fmt(totalLearners)} accent="bg-emerald-500/10 text-emerald-500" />
                <StatCard icon={DollarSign} label="Revenue" value={`₦${fmt(totalRevenue)}`} accent="bg-amber-500/10 text-amber-500" />
              </div>

              {/* Quick Actions */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <button
                  onClick={() => setActiveTab("tutors")}
                  className="flex items-center gap-4 p-5 rounded-2xl bg-card ring-1 ring-border hover:ring-foreground/15 shadow-soft transition-all group tap"
                >
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-blue-500/10 text-blue-500 ring-1 ring-blue-500/15">
                    <UserPlus className="h-5 w-5" />
                  </div>
                  <div className="text-left">
                    <p className="text-[14px] font-semibold tracking-tight">Manage tutors</p>
                    <p className="text-[11.5px] text-muted-foreground mt-0.5">Invite, assign and manage</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto group-hover:translate-x-0.5 transition-transform" />
                </button>

                <button
                  onClick={() => setActiveTab("bootcamps")}
                  className="flex items-center gap-4 p-5 rounded-2xl bg-card ring-1 ring-border hover:ring-foreground/15 shadow-soft transition-all group tap"
                >
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-violet-500/10 text-violet-500 ring-1 ring-violet-500/15">
                    <BookOpen className="h-5 w-5" />
                  </div>
                  <div className="text-left">
                    <p className="text-[14px] font-semibold tracking-tight">View bootcamps</p>
                    <p className="text-[11.5px] text-muted-foreground mt-0.5">Create and assign tutors</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto group-hover:translate-x-0.5 transition-transform" />
                </button>

                <button
                  onClick={() => setActiveTab("analytics")}
                  className="flex items-center gap-4 p-5 rounded-2xl bg-card ring-1 ring-border hover:ring-foreground/15 shadow-soft transition-all group tap"
                >
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-500/10 text-emerald-500 ring-1 ring-emerald-500/15">
                    <TrendingUp className="h-5 w-5" />
                  </div>
                  <div className="text-left">
                    <p className="text-[14px] font-semibold tracking-tight">View analytics</p>
                    <p className="text-[11.5px] text-muted-foreground mt-0.5">Revenue and performance</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>

              {/* Recent Bootcamps */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Recent bootcamps</h2>
                  <button onClick={() => setActiveTab("bootcamps")} className="text-[11px] font-semibold text-primary tap">View all</button>
                </div>
                {allBootcamps.length === 0 ? (
                  <div className="text-center p-8 border border-dashed border-border rounded-2xl text-[13px] text-muted-foreground">
                    No bootcamps yet. Create your first one!
                  </div>
                ) : (
                  <div className="space-y-2">
                    {allBootcamps.slice(0, 4).map((b: any) => (
                      <div key={b.id} className="flex items-center gap-4 p-4 rounded-2xl bg-card ring-1 ring-border shadow-soft">
                        <div className="h-12 w-12 rounded-xl overflow-hidden bg-muted shrink-0">
                          {b.banner_url ? (
                            <img src={b.banner_url} className="h-full w-full object-cover" />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center bg-primary/5">
                              <GraduationCap className="h-5 w-5 text-primary/40" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-semibold tracking-tight truncate">{b.title}</p>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-[11px] text-muted-foreground">{b.enrollments?.[0]?.count || 0} learners</span>
                            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                              b.status === "active" ? "bg-emerald-500/10 text-emerald-500" : "bg-muted text-muted-foreground"
                            }`}>
                              {b.status === "active" ? "Published" : "Draft"}
                            </span>
                          </div>
                        </div>
                        {b.profiles && (
                          <div className="flex items-center gap-2 shrink-0">
                            {b.profiles.avatar_url ? (
                              <img src={b.profiles.avatar_url} className="h-7 w-7 rounded-full object-cover ring-1 ring-border" />
                            ) : (
                              <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold">
                                {(b.profiles.username || "U")[0].toUpperCase()}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ────────────────── TUTORS TAB ────────────────── */}
          {activeTab === "tutors" && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div>
                <h1 className="text-[24px] md:text-[28px] font-semibold tracking-tight font-display">Manage tutors</h1>
                <p className="text-[13.5px] text-muted-foreground mt-2 leading-relaxed">
                  Add and manage the instructors who teach under your organization.
                </p>
              </div>

              {/* Add Tutor Card */}
              <div className="bg-card ring-1 ring-border rounded-2xl p-6 shadow-soft">
                <h3 className="font-semibold tracking-tight text-[16px] mb-1">Invite a tutor</h3>
                <p className="text-[12px] text-muted-foreground mb-4">Search by their Zero Club username to send an invitation.</p>
                <form onSubmit={handleAddTutor} className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                      type="text"
                      value={inviteQuery}
                      onChange={(e) => setInviteQuery(e.target.value)}
                      placeholder="Enter tutor username..."
                      className="w-full h-12 bg-background ring-1 ring-border rounded-xl pl-11 pr-5 text-[14px] font-medium outline-none focus:ring-2 focus:ring-primary/40 transition"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={inviting || !inviteQuery.trim()}
                    className="h-12 px-6 bg-foreground text-background text-[14px] font-semibold tracking-tight rounded-xl flex items-center justify-center gap-2 tap hover:opacity-90 disabled:opacity-50 shrink-0"
                  >
                    {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                    Send Invite
                  </button>
                </form>
              </div>

              {/* Tutor List */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Your tutors ({tutors.length})
                  </h3>
                </div>
                {tutorsLoading ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {[1, 2].map(i => <div key={i} className="h-24 rounded-2xl bg-foreground/[0.04] shimmer" />)}
                  </div>
                ) : tutors.length === 0 ? (
                  <div className="text-center p-10 border border-dashed border-border rounded-2xl text-[13.5px] text-muted-foreground">
                    <Users className="h-8 w-8 mx-auto text-muted-foreground/30 mb-3" />
                    No tutors added yet. Invite your first tutor above!
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {tutorBootcampCounts.map((t: any) => (
                      <div key={t.id} className="p-5 ring-1 ring-border bg-card rounded-2xl shadow-soft hover:ring-foreground/15 transition-all">
                        <div className="flex items-center gap-4">
                          {t.tutor?.avatar_url ? (
                            <img src={t.tutor.avatar_url} className="h-12 w-12 rounded-xl object-cover ring-1 ring-border" />
                          ) : (
                            <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-lg">
                              {(t.tutor?.username || "T")[0].toUpperCase()}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <h4 className="text-[14px] font-semibold tracking-tight truncate">
                              {t.tutor?.full_name || t.tutor?.username || "Unknown"}
                            </h4>
                            <p className="text-[11px] text-muted-foreground">@{t.tutor?.username || "unknown"}</p>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="grid h-8 w-8 place-items-center rounded-full hover:bg-foreground/[0.04] text-muted-foreground tap">
                                <MoreHorizontal className="h-4 w-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="min-w-[160px]">
                              <DropdownMenuItem
                                onClick={() => navigate({ to: "/app/profile/$id", params: { id: t.tutor_id } })}
                                className="text-[13px]"
                              >
                                <Eye className="h-3.5 w-3.5 mr-2" /> View profile
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleRemoveTutor(t.tutor_id)}
                                className="text-[13px] text-destructive focus:text-destructive"
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-2" /> Remove tutor
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        <div className="flex items-center gap-4 mt-4 pt-4 border-t hairline">
                          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <BookOpen className="h-3 w-3" />
                            <span className="font-medium tabular-nums">{t.bootcampCount} bootcamps</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <GraduationCap className="h-3 w-3" />
                            <span className="font-medium tabular-nums">{t.learnerCount} learners</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ────────────────── BOOTCAMPS TAB ────────────────── */}
          {activeTab === "bootcamps" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h1 className="text-[24px] md:text-[28px] font-semibold tracking-tight font-display">Bootcamps</h1>
                  <p className="text-[13.5px] text-muted-foreground mt-1">Create bootcamps and assign tutors to teach them.</p>
                </div>
                <button
                  onClick={() => setShowCreateBootcamp(!showCreateBootcamp)}
                  className="flex items-center gap-1.5 h-10 px-5 bg-foreground text-background text-[13px] font-semibold tracking-tight rounded-full tap hover:opacity-90 transition shadow-sm shrink-0"
                >
                  {showCreateBootcamp ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  {showCreateBootcamp ? "Cancel" : "Create Bootcamp"}
                </button>
              </div>

              {/* Create Bootcamp Form */}
              {showCreateBootcamp && (
                <form onSubmit={handleCreateBootcamp} className="bg-card ring-1 ring-border rounded-2xl p-6 shadow-soft space-y-5 animate-in fade-in slide-in-from-top-4 duration-300">
                  <h3 className="text-[16px] font-semibold tracking-tight">New bootcamp</h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-1.5 block">Title *</label>
                      <input
                        required
                        value={newBootcamp.title}
                        onChange={(e) => setNewBootcamp({ ...newBootcamp, title: e.target.value })}
                        placeholder="e.g. Full-Stack Web Development"
                        className="w-full h-11 bg-background ring-1 ring-border rounded-xl px-4 text-[13.5px] font-medium outline-none focus:ring-2 focus:ring-primary/40 transition"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-1.5 block">Category</label>
                      <select
                        value={newBootcamp.category}
                        onChange={(e) => setNewBootcamp({ ...newBootcamp, category: e.target.value })}
                        className="w-full h-11 bg-background ring-1 ring-border rounded-xl px-4 text-[13.5px] font-medium outline-none focus:ring-2 focus:ring-primary/40 transition appearance-none"
                      >
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-1.5 block">Description</label>
                    <textarea
                      value={newBootcamp.description}
                      onChange={(e) => setNewBootcamp({ ...newBootcamp, description: e.target.value })}
                      placeholder="Describe what learners will gain..."
                      rows={3}
                      className="w-full bg-background ring-1 ring-border rounded-xl px-4 py-3 text-[13.5px] font-medium outline-none focus:ring-2 focus:ring-primary/40 transition resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-1.5 block">Price (₦)</label>
                      <input
                        type="number"
                        min="0"
                        value={newBootcamp.price}
                        onChange={(e) => setNewBootcamp({ ...newBootcamp, price: e.target.value })}
                        className="w-full h-11 bg-background ring-1 ring-border rounded-xl px-4 text-[13.5px] font-medium outline-none focus:ring-2 focus:ring-primary/40 transition"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-1.5 block">Banner Image</label>
                      <input type="file" accept="image/*" className="hidden" ref={bannerInputRef} onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) { setBannerFile(f); setBannerPreview(URL.createObjectURL(f)); }
                      }} />
                      <button
                        type="button"
                        onClick={() => bannerInputRef.current?.click()}
                        className="w-full h-11 bg-background ring-1 ring-border rounded-xl px-4 text-[13.5px] font-medium text-muted-foreground flex items-center gap-2 hover:bg-accent/30 transition"
                      >
                        <UploadCloud className="h-4 w-4" />
                        {bannerFile ? bannerFile.name : "Upload banner"}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={creating || !newBootcamp.title}
                    className="h-11 px-8 bg-foreground text-background text-[13.5px] font-semibold tracking-tight rounded-xl flex items-center gap-2 tap hover:opacity-90 disabled:opacity-50"
                  >
                    {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Create Bootcamp
                  </button>
                </form>
              )}

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search bootcamps..."
                  value={bootcampSearch}
                  onChange={(e) => setBootcampSearch(e.target.value)}
                  className="w-full h-11 bg-card ring-1 ring-border rounded-xl pl-11 pr-4 text-[13.5px] font-medium outline-none focus:ring-primary/40 transition"
                />
              </div>

              {/* Bootcamp Cards */}
              {bootcampsLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[1, 2, 3].map(i => <div key={i} className="h-72 rounded-2xl bg-foreground/[0.04] shimmer" />)}
                </div>
              ) : filteredBootcamps.length === 0 ? (
                <div className="text-center p-12 border border-dashed border-border rounded-2xl text-[13.5px] text-muted-foreground">
                  <LayoutGrid className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="font-medium text-foreground">No bootcamps found</p>
                  <p className="text-[12px] mt-1">Create your first bootcamp to get started.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredBootcamps.map((b: any) => {
                    const assignedTutor = tutors.find((t: any) => t.tutor_id === b.assigned_tutor_id);
                    const isOwnBootcamp = b.creator_id === profile?.id;

                    return (
                      <div key={b.id} className="group relative flex flex-col overflow-hidden rounded-2xl ring-1 ring-border bg-card hover:ring-foreground/15 shadow-soft transition-all">
                        {/* Banner */}
                        <div className="relative aspect-[16/9] overflow-hidden bg-muted">
                          {b.banner_url ? (
                            <img src={b.banner_url} alt={b.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
                              <GraduationCap className="h-10 w-10 text-primary/30" />
                            </div>
                          )}
                          <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                            <span className={`text-[9px] font-medium px-2 py-0.5 rounded-full backdrop-blur-md ring-1 ring-white/15 ${
                              b.status === "active" ? "bg-emerald-500/80 text-white" : "bg-black/50 text-white/70"
                            }`}>
                              {b.status === "active" ? "Published" : "Draft"}
                            </span>
                            {isOwnBootcamp && (
                              <span className="text-[9px] font-medium px-2 py-0.5 rounded-full bg-primary/80 text-white backdrop-blur-md ring-1 ring-white/15">
                                Your bootcamp
                              </span>
                            )}
                          </div>
                          {b.price > 0 && (
                            <div className="absolute top-2.5 right-2.5 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-black/50 text-white tabular-nums backdrop-blur-md ring-1 ring-white/15">
                              ₦{b.price.toLocaleString()}
                            </div>
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 p-4 flex flex-col">
                          <div className="mb-1 flex items-center gap-1.5">
                            <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{b.category}</span>
                          </div>
                          <h3 className="line-clamp-2 font-display text-[15px] font-semibold tracking-tight leading-snug">
                            {b.title}
                          </h3>

                          {/* Assigned Tutor */}
                          <div className="mt-3 flex items-center justify-between">
                            {assignedTutor ? (
                              <div className="flex items-center gap-2">
                                {assignedTutor.tutor?.avatar_url ? (
                                  <img src={assignedTutor.tutor.avatar_url} className="h-6 w-6 rounded-full object-cover ring-1 ring-border" />
                                ) : (
                                  <div className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[9px] font-bold">
                                    {(assignedTutor.tutor?.username || "T")[0].toUpperCase()}
                                  </div>
                                )}
                                <span className="text-[11px] font-medium text-muted-foreground truncate">
                                  {assignedTutor.tutor?.full_name || assignedTutor.tutor?.username}
                                </span>
                              </div>
                            ) : b.profiles && b.creator_id !== profile?.id ? (
                              <div className="flex items-center gap-2">
                                {b.profiles.avatar_url ? (
                                  <img src={b.profiles.avatar_url} className="h-6 w-6 rounded-full object-cover ring-1 ring-border" />
                                ) : (
                                  <div className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[9px] font-bold">
                                    {(b.profiles.username || "T")[0].toUpperCase()}
                                  </div>
                                )}
                                <span className="text-[11px] font-medium text-muted-foreground truncate">
                                  {b.profiles.full_name || b.profiles.username}
                                </span>
                              </div>
                            ) : (
                              <span className="text-[11px] font-medium text-amber-500 flex items-center gap-1">
                                <Clock className="h-3 w-3" /> No tutor assigned
                              </span>
                            )}
                            <span className="text-[11px] font-medium text-muted-foreground tabular-nums">
                              {b.enrollments?.[0]?.count || 0} learners
                            </span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="border-t hairline px-4 py-3 flex items-center justify-between gap-2">
                          {isOwnBootcamp && (
                            <button
                              onClick={() => setAssignDrawer(b.id)}
                              className="flex items-center gap-1.5 text-[12px] font-semibold text-primary tap hover:underline"
                            >
                              <Users className="h-3.5 w-3.5" />
                              {assignedTutor ? "Reassign" : "Assign Tutor"}
                            </button>
                          )}
                          {!isOwnBootcamp && <div />}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="grid h-7 w-7 place-items-center rounded-full hover:bg-foreground/[0.04] text-muted-foreground tap">
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="min-w-[160px]">
                              <DropdownMenuItem asChild className="text-[13px]">
                                <Link to="/app/bootcamps/$id" params={{ id: b.id }}>
                                  <Eye className="h-3.5 w-3.5 mr-2" /> View details
                                </Link>
                              </DropdownMenuItem>
                              {isOwnBootcamp && assignedTutor && (
                                <DropdownMenuItem onClick={() => handleUnassignTutor(b.id)} className="text-[13px]">
                                  <X className="h-3.5 w-3.5 mr-2" /> Unassign tutor
                                </DropdownMenuItem>
                              )}
                              {isOwnBootcamp && (
                                <DropdownMenuItem
                                  onClick={() => handleDeleteBootcamp(b.id)}
                                  className="text-[13px] text-destructive focus:text-destructive"
                                >
                                  <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete bootcamp
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ────────────────── ANALYTICS TAB ────────────────── */}
          {activeTab === "analytics" && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div>
                <h1 className="text-[24px] md:text-[28px] font-semibold tracking-tight font-display">Analytics</h1>
                <p className="text-[13.5px] text-muted-foreground mt-2">Track your organization's performance and growth.</p>
              </div>

              {/* KPI Row */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard icon={Users} label="Total tutors" value={fmt(tutors.length)} accent="bg-blue-500/10 text-blue-500" />
                <StatCard icon={LayoutGrid} label="Active bootcamps" value={fmt(allBootcamps.filter((b: any) => b.status === "active").length)} accent="bg-violet-500/10 text-violet-500" />
                <StatCard icon={GraduationCap} label="Total learners" value={fmt(totalLearners)} accent="bg-emerald-500/10 text-emerald-500" />
                <StatCard icon={DollarSign} label="Total revenue" value={`₦${fmt(totalRevenue)}`} accent="bg-amber-500/10 text-amber-500" />
              </div>

              {/* Top Bootcamps */}
              <div className="bg-card ring-1 ring-border rounded-2xl shadow-soft overflow-hidden">
                <div className="p-5 border-b hairline">
                  <h3 className="text-[15px] font-semibold tracking-tight">Top bootcamps by enrollment</h3>
                </div>
                {topBootcamps.length === 0 ? (
                  <div className="p-8 text-center text-[13px] text-muted-foreground">No bootcamp data yet.</div>
                ) : (
                  <div className="divide-y hairline">
                    {topBootcamps.map((b: any, i: number) => (
                      <div key={b.id} className="flex items-center gap-4 px-5 py-4 hover:bg-foreground/[0.02] transition-colors">
                        <span className="text-[13px] font-bold tabular-nums text-muted-foreground w-6 text-center">{i + 1}</span>
                        <div className="h-10 w-10 rounded-xl overflow-hidden bg-muted shrink-0">
                          {b.banner_url ? (
                            <img src={b.banner_url} className="h-full w-full object-cover" />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center bg-primary/5">
                              <GraduationCap className="h-4 w-4 text-primary/40" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13.5px] font-semibold tracking-tight truncate">{b.title}</p>
                          <p className="text-[11px] text-muted-foreground">{b.category}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[14px] font-semibold tabular-nums">{b.enrollments?.[0]?.count || 0}</p>
                          <p className="text-[10px] text-muted-foreground">learners</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Tutor Performance */}
              <div className="bg-card ring-1 ring-border rounded-2xl shadow-soft overflow-hidden">
                <div className="p-5 border-b hairline">
                  <h3 className="text-[15px] font-semibold tracking-tight">Tutor performance</h3>
                </div>
                {tutorBootcampCounts.length === 0 ? (
                  <div className="p-8 text-center text-[13px] text-muted-foreground">No tutor data yet.</div>
                ) : (
                  <div className="divide-y hairline">
                    {tutorBootcampCounts.map((t: any, i: number) => (
                      <div key={t.id} className="flex items-center gap-4 px-5 py-4 hover:bg-foreground/[0.02] transition-colors">
                        <span className="text-[13px] font-bold tabular-nums text-muted-foreground w-6 text-center">{i + 1}</span>
                        {t.tutor?.avatar_url ? (
                          <img src={t.tutor.avatar_url} className="h-10 w-10 rounded-xl object-cover ring-1 ring-border" />
                        ) : (
                          <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
                            {(t.tutor?.username || "T")[0].toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-[13.5px] font-semibold tracking-tight truncate">
                            {t.tutor?.full_name || t.tutor?.username}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {t.bootcampCount} bootcamp{t.bootcampCount !== 1 ? "s" : ""}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[14px] font-semibold tabular-nums">{t.learnerCount}</p>
                          <p className="text-[10px] text-muted-foreground">learners</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ────────────────── SETTINGS TAB ────────────────── */}
          {activeTab === "settings" && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div>
                <h1 className="text-[24px] md:text-[28px] font-semibold tracking-tight font-display">Settings</h1>
                <p className="text-[13.5px] text-muted-foreground mt-2">Manage your organization's profile and preferences.</p>
              </div>

              {/* Organization Profile */}
              <div className="bg-card ring-1 ring-border rounded-2xl shadow-soft overflow-hidden">
                <div className="p-5 border-b hairline flex items-center justify-between">
                  <h3 className="text-[15px] font-semibold tracking-tight">Organization profile</h3>
                  <button
                    onClick={() => setEditingProfile(!editingProfile)}
                    className="text-[12px] font-semibold text-primary tap"
                  >
                    {editingProfile ? "Cancel" : "Edit"}
                  </button>
                </div>
                <div className="p-5 space-y-5">
                  {editingProfile ? (
                    <>
                      <div>
                        <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-1.5 block">Organization Name</label>
                        <input
                          value={settingsForm.full_name}
                          onChange={(e) => setSettingsForm({ ...settingsForm, full_name: e.target.value })}
                          className="w-full h-11 bg-background ring-1 ring-border rounded-xl px-4 text-[13.5px] font-medium outline-none focus:ring-2 focus:ring-primary/40 transition"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-1.5 block">Bio</label>
                        <textarea
                          value={settingsForm.bio}
                          onChange={(e) => setSettingsForm({ ...settingsForm, bio: e.target.value })}
                          rows={3}
                          className="w-full bg-background ring-1 ring-border rounded-xl px-4 py-3 text-[13.5px] font-medium outline-none focus:ring-2 focus:ring-primary/40 transition resize-none"
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-1.5 block">Location</label>
                          <input
                            value={settingsForm.location}
                            onChange={(e) => setSettingsForm({ ...settingsForm, location: e.target.value })}
                            className="w-full h-11 bg-background ring-1 ring-border rounded-xl px-4 text-[13.5px] font-medium outline-none focus:ring-2 focus:ring-primary/40 transition"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-1.5 block">Website</label>
                          <input
                            value={settingsForm.website}
                            onChange={(e) => setSettingsForm({ ...settingsForm, website: e.target.value })}
                            className="w-full h-11 bg-background ring-1 ring-border rounded-xl px-4 text-[13.5px] font-medium outline-none focus:ring-2 focus:ring-primary/40 transition"
                          />
                        </div>
                      </div>
                      <button
                        onClick={handleSaveSettings}
                        disabled={savingSettings}
                        className="h-11 px-6 bg-foreground text-background text-[13.5px] font-semibold tracking-tight rounded-xl flex items-center gap-2 tap hover:opacity-90 disabled:opacity-50"
                      >
                        {savingSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        Save Changes
                      </button>
                    </>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center gap-4">
                        <div className="h-16 w-16 rounded-2xl overflow-hidden bg-primary/8 ring-1 ring-primary/15 flex items-center justify-center">
                          {profile?.avatar_url ? (
                            <img src={profile.avatar_url} className="h-full w-full object-cover" />
                          ) : (
                            <Building2 className="h-7 w-7 text-primary" />
                          )}
                        </div>
                        <div>
                          <h4 className="text-[17px] font-semibold tracking-tight">{profile?.full_name || "Unnamed"}</h4>
                          <p className="text-[12px] text-muted-foreground">@{profile?.username} · {profile?.location || "No location set"}</p>
                        </div>
                      </div>
                      {profile?.bio && <p className="text-[13px] text-muted-foreground leading-relaxed">{profile.bio}</p>}
                      {profile?.website && (
                        <a href={profile.website} target="_blank" rel="noopener noreferrer" className="text-[12px] font-medium text-primary flex items-center gap-1">
                          {profile.website} <ArrowUpRight className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Quick Links */}
              <div className="bg-card ring-1 ring-border rounded-2xl shadow-soft overflow-hidden">
                <div className="p-5 border-b hairline">
                  <h3 className="text-[15px] font-semibold tracking-tight">Quick links</h3>
                </div>
                <div className="divide-y hairline">
                  {[
                    { label: "Edit profile", to: "/app/profile/edit", icon: Edit3 },
                    { label: "Wallet settings", to: "/app/wallet/settings", icon: DollarSign },
                    { label: "Notification settings", to: "/app/settings/notifications", icon: Activity },
                    { label: "Security", to: "/app/settings/security", icon: Shield },
                  ].map((link) => (
                    <Link
                      key={link.to}
                      to={link.to}
                      className="flex items-center gap-4 px-5 py-4 hover:bg-foreground/[0.02] transition-colors tap group"
                    >
                      <div className="grid h-9 w-9 place-items-center rounded-xl bg-foreground/[0.04] text-muted-foreground">
                        <link.icon className="h-4 w-4" />
                      </div>
                      <span className="flex-1 text-[13.5px] font-medium">{link.label}</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                    </Link>
                  ))}
                </div>
              </div>

              {/* Account Info */}
              <div className="bg-card ring-1 ring-border rounded-2xl shadow-soft p-5">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-3">Account details</h3>
                <div className="grid grid-cols-2 gap-4 text-[13px]">
                  <div>
                    <p className="text-muted-foreground text-[11px]">Account type</p>
                    <p className="font-semibold mt-0.5">Institution</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-[11px]">Username</p>
                    <p className="font-semibold mt-0.5">@{profile?.username}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-[11px]">Membership tier</p>
                    <p className="font-semibold mt-0.5 capitalize">{profile?.tier || "Basic"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-[11px]">Total tutors</p>
                    <p className="font-semibold mt-0.5 tabular-nums">{tutors.length}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ═══ ASSIGN TUTOR DRAWER ═══ */}
      <Drawer open={!!assignDrawer} onOpenChange={(open) => { if (!open) setAssignDrawer(null); }}>
        <DrawerContent className="border-t border-border/40 bg-background/95 backdrop-blur-xl">
          <div className="px-5 pt-6 pb-10">
            <DrawerHeader className="px-0 pt-0 text-left mb-6">
              <DrawerTitle className="text-[19px] font-semibold tracking-tight text-foreground">
                Assign a tutor
              </DrawerTitle>
              <p className="text-[12px] text-muted-foreground mt-1">
                Select a tutor from your organization to teach this bootcamp.
              </p>
            </DrawerHeader>

            {tutors.length === 0 ? (
              <div className="text-center p-8 border border-dashed border-border rounded-2xl text-[13px] text-muted-foreground">
                No tutors in your organization. Add tutors first.
              </div>
            ) : (
              <div className="space-y-2">
                {tutors.map((t: any) => {
                  const bootcamp = allBootcamps.find((b: any) => b.id === assignDrawer);
                  const isCurrentlyAssigned = bootcamp?.assigned_tutor_id === t.tutor_id;

                  return (
                    <button
                      key={t.id}
                      onClick={() => {
                        if (!isCurrentlyAssigned && assignDrawer) {
                          handleAssignTutor(assignDrawer, t.tutor_id);
                        }
                      }}
                      disabled={assigning || isCurrentlyAssigned}
                      className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all tap border ${
                        isCurrentlyAssigned
                          ? "bg-primary/10 border-primary/20"
                          : "bg-card border-border hover:border-foreground/15"
                      }`}
                    >
                      {t.tutor?.avatar_url ? (
                        <img src={t.tutor.avatar_url} className="h-11 w-11 rounded-xl object-cover ring-1 ring-border" />
                      ) : (
                        <div className="h-11 w-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-lg">
                          {(t.tutor?.username || "T")[0].toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 text-left min-w-0">
                        <p className="text-[14px] font-semibold tracking-tight truncate">
                          {t.tutor?.full_name || t.tutor?.username}
                        </p>
                        <p className="text-[11px] text-muted-foreground">@{t.tutor?.username}</p>
                      </div>
                      {isCurrentlyAssigned ? (
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-primary">
                          <Check className="h-3.5 w-3.5" /> Assigned
                        </span>
                      ) : assigning ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
