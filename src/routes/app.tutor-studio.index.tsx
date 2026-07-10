import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import {
  Layout, ChevronLeft, Plus, Settings, Users, Hash, UploadCloud,
  BarChart3, Calendar, DollarSign, GripVertical, MoreHorizontal, Edit3, Trash2,
  CheckCircle2, ShieldCheck, Check, Play, Clock, Filter, MessageCircle,
  UserMinus, Star, LayoutGrid, Sparkles, ArrowRight, ChevronDown, Search,
  BookOpen, Wallet, TrendingUp, Zap, Eye, GraduationCap, Megaphone, Lock, UsersRound
} from "lucide-react";

import { useState } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getTutorBootcamps, deleteBootcampAction, getBootcampLearners } from "@/api";
import { useEffect } from "react";
import { uploadFile } from "@/lib/storage";

export const Route = createFileRoute("/app/tutor-studio/")({
  component: TutorStudioPage,
});

function TutorStudioPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [view, setView] = useState<"dashboard" | "editor">("dashboard");
  const [activeTab, setActiveTab] = useState<"details" | "curriculum" | "learners" | "club">("details");
  const [hasAccess, setHasAccess] = useState(false);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [bootcampBannerFile, setBootcampBannerFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [bootcampVideoFile, setBootcampVideoFile] = useState<File | null>(null);
  const [activeBootcampId, setActiveBootcampId] = useState<string | null>(null);

  const [profile, setProfile] = useState<any>(null);
  const [bootcampSettings, setBootcampSettings] = useState({
    title: "",
    description: "",
    category: "Development",
    price: "0",
    status: "active",
    visibility: true,
    banner_url: "",
    video_url: "",
    coupon_code: "",
    coupon_discount_percent: "0"
  });

  const { data: bootcamps = [], isLoading: bootcampsLoading } = useQuery({
    queryKey: ['tutor-bootcamps'],
    queryFn: getTutorBootcamps,
  });

  const { data: learners = [] } = useQuery({
    queryKey: ['bootcamp-learners', activeBootcampId],
    queryFn: () => getBootcampLearners(activeBootcampId!),
    enabled: !!activeBootcampId
  });

  // Club linked to the active bootcamp (created alongside it with the same name)
  const [roleDrawer, setRoleDrawer] = useState<null | "rep" | "admins">(null);
  const [updatingMemberId, setUpdatingMemberId] = useState<string | null>(null);

  const [rooms, setRooms] = useState([
    { name: "general", desc: "Main discussion area", color: "text-blue-500" },
    { name: "q-and-a", desc: "Questions and answers", color: "text-emerald-500" },
    { name: "assignments", desc: "Homework submission", color: "text-amber-500" },
    { name: "announcements", desc: "Important updates", color: "text-rose-500" },
  ]);

  const { data: curriculumData, isLoading: isLoadingCurriculum } = useQuery({
    queryKey: ['bootcamp-curriculum', activeBootcampId],
    queryFn: async () => {
      const { data: bootcamp, error: bootcampError } = await supabase
        .from('bootcamps')
        .select('*')
        .eq('id', activeBootcampId!)
        .single();

      if (bootcampError) throw bootcampError;

      const { data: fetchedModules, error: modulesError } = await supabase
        .from('modules')
        .select('*, lessons(*)')
        .eq('bootcamp_id', activeBootcampId!)
        .order('order_index', { ascending: true });

      if (modulesError) throw modulesError;

      return {
        bootcamp,
        modules: (fetchedModules || []).map((module: any) => ({
          ...module,
          lessons: [...(module.lessons || [])].sort((a: any, b: any) => a.order_index - b.order_index)
        }))
      };
    },
    enabled: !!activeBootcampId && view === "editor"
  });

  const activeBootcamp = curriculumData?.bootcamp;
  const modules = curriculumData?.modules || [];

  const { data: clubData } = useQuery({
    queryKey: ['bootcamp-club', activeBootcampId, activeBootcamp?.title],
    queryFn: async () => {
      const { data } = await supabase
        .from('clubs')
        .select('*')
        .eq('creator_id', activeBootcamp!.creator_id)
        .eq('name', activeBootcamp!.title)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!activeBootcamp?.title && view === "editor"
  });

  const { data: clubMembers = [] } = useQuery({
    queryKey: ['club-members', clubData?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('club_members')
        .select('*, profiles(id, username, full_name, avatar_url)')
        .eq('club_id', clubData!.id)
        .order('joined_at', { ascending: true });
      return data || [];
    },
    enabled: !!clubData?.id
  });

  const studyRep = clubMembers.find((m: any) => m.role === 'Study Rep');
  const clubAdmins = clubMembers.filter((m: any) => m.role === 'Administrator');

  const updateMemberRole = async (profileId: string, newRole: string) => {
    if (!clubData) return false;
    setUpdatingMemberId(profileId);
    const { data, error } = await supabase
      .from('club_members')
      .update({ role: newRole })
      .eq('club_id', clubData.id)
      .eq('profile_id', profileId)
      .select();
    setUpdatingMemberId(null);

    if (error) {
      if (error.message?.includes('club_members_role_check')) {
        toast.error("Your database doesn't allow the 'Study Rep' role yet. Run supabase/migrations/add_study_rep_and_club_member_updates.sql in the Supabase SQL editor.");
      } else {
        toast.error(error.message || 'Failed to update role');
      }
      return false;
    }
    if (!data || data.length === 0) {
      toast.error('Not saved — the database blocked the update. Run the included club_members migration to enable role changes.');
      return false;
    }
    queryClient.invalidateQueries({ queryKey: ['club-members', clubData.id] });
    return true;
  };

  const handleAssignRep = async (profileId: string) => {
    const currentRep = clubMembers.find((m: any) => m.role === 'Study Rep');
    if (currentRep && currentRep.profile_id !== profileId) {
      const demoted = await updateMemberRole(currentRep.profile_id, 'Member');
      if (!demoted) return;
    }
    const ok = await updateMemberRole(profileId, 'Study Rep');
    if (ok) {
      toast.success('Study Rep updated');
      setRoleDrawer(null);
    }
  };

  const handleToggleAdmin = async (member: any) => {
    if (member.profile_id === profile?.id) {
      toast.error("You're the club owner — you always have admin access.");
      return;
    }
    const newRole = member.role === 'Administrator' ? 'Member' : 'Administrator';
    const ok = await updateMemberRole(member.profile_id, newRole);
    if (ok) toast.success(newRole === 'Administrator' ? 'Promoted to Administrator' : 'Administrator access removed');
  };

  useEffect(() => {
    if (!activeBootcamp) return;
    setBootcampSettings({
      title: activeBootcamp.title || "",
      description: activeBootcamp.description || "",
      category: activeBootcamp.category || "Development",
      price: String(activeBootcamp.price || "0"),
      status: activeBootcamp.status || "active",
      visibility: activeBootcamp.visibility ?? true,
      banner_url: activeBootcamp.banner_url || "",
      video_url: activeBootcamp.video_url || "",
      coupon_code: activeBootcamp.coupon_code || "",
      coupon_discount_percent: String(activeBootcamp.coupon_discount_percent || "0")
    });
    setBannerUrl(activeBootcamp.banner_url || null);
    setBootcampBannerFile(null);
    setVideoPreviewUrl(activeBootcamp.video_url || null);
    setBootcampVideoFile(null);
  }, [activeBootcamp?.id]);

  // Fetch profile (used for role checks)
  useEffect(() => {
    async function loadProfile() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
        if (data) setProfile(data);
      }
    }
    loadProfile();
  }, []);

  const handleSaveBootcampSettings = async () => {
    if (!activeBootcampId) return;

    const discount = Math.min(100, Math.max(0, Number(bootcampSettings.coupon_discount_percent) || 0));
    const code = bootcampSettings.coupon_code.trim().toUpperCase();
    let savedBannerUrl = bootcampSettings.banner_url;
    let savedVideoUrl = bootcampSettings.video_url;

    if (bootcampBannerFile) {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please sign in to update this bootcamp");
        return;
      }

      const fileExt = bootcampBannerFile.name.split('.').pop();
      const fileName = `bootcamp_${activeBootcampId}_${Date.now()}.${fileExt}`;
      savedBannerUrl = await uploadFile('bootcamp-banners', bootcampBannerFile, `${session.user.id}/${fileName}`);
    }

    if (bootcampVideoFile) {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please sign in to update this bootcamp");
        return;
      }

      const fileExt = bootcampVideoFile.name.split('.').pop();
      const fileName = `bootcamp_video_${activeBootcampId}_${Date.now()}.${fileExt}`;
      savedVideoUrl = await uploadFile('bootcamp-banners', bootcampVideoFile, `${session.user.id}/${fileName}`);
    }

    const { data, error } = await supabase
      .from('bootcamps')
      .update({
        title: bootcampSettings.title,
        description: bootcampSettings.description,
        category: bootcampSettings.category,
        price: Number(bootcampSettings.price) || 0,
        status: bootcampSettings.status,
        visibility: bootcampSettings.visibility,
        banner_url: savedBannerUrl || null,
        video_url: savedVideoUrl || null,
        coupon_code: code || null,
        coupon_discount_percent: code ? discount : 0
      })
      .eq('id', activeBootcampId)
      .select();

    if (error) {
      toast.error(`Failed to save bootcamp settings: ${error.message}`);
      return;
    }

    if (!data || data.length === 0) {
      toast.error(`Changes were not saved. You may not have permission to update this bootcamp or it doesn't exist.`);
      return;
    }

    toast.success("Bootcamp settings saved");
    queryClient.invalidateQueries({ queryKey: ['bootcamp-curriculum', activeBootcampId] });
    queryClient.invalidateQueries({ queryKey: ['tutor-bootcamps'] });
  };

  const handleBannerUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setBootcampBannerFile(file);
      setBannerUrl(URL.createObjectURL(file));
    }
  };

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setBootcampVideoFile(file);
      setVideoPreviewUrl(URL.createObjectURL(file));
    }
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await (deleteBootcampAction as any)({ data: { bootcampId: id } });
    },
    onSuccess: () => {
      toast.success("Bootcamp deleted successfully");
      queryClient.invalidateQueries({ queryKey: ['tutor-bootcamps'] });
      setActiveBootcampId(null);
      setView("dashboard");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to delete bootcamp");
    }
  });

  const handleDeleteBootcamp = () => {
    if (!activeBootcampId) return;
    if (confirm("Are you sure you want to delete this bootcamp? This action cannot be undone.")) {
      deleteMutation.mutate(activeBootcampId);
    }
  };

  const handleAddModule = async () => {
    if (!activeBootcampId) return;
    try {
      const newModule = {
        bootcamp_id: activeBootcampId,
        title: `Module ${modules.length + 1}`,
        order_index: modules.length
      };
      const { error } = await supabase.from('modules').insert([newModule]);
      if (error) throw error;
      toast.success("Module added");
      queryClient.invalidateQueries({ queryKey: ['bootcamp-curriculum', activeBootcampId] });
    } catch (err: any) {
      toast.error(err.message || "Failed to add module");
    }
  };

  const handleUpdateModuleTitle = async (moduleId: string, title: string) => {
    if (!title.trim()) return;
    const { data, error } = await supabase.from('modules').update({ title: title.trim() }).eq('id', moduleId).select();
    if (error) {
      toast.error(error.message || "Failed to update module");
      return;
    }
    if (!data || data.length === 0) {
      toast.error("Changes were not saved. You may not have permission to update this module.");
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['bootcamp-curriculum', activeBootcampId] });
  };

  const handleDeleteModule = async (moduleId: string) => {
    if (!confirm("Delete this module and all its lessons?")) return;
    const { error } = await supabase.from('modules').delete().eq('id', moduleId);
    if (error) {
      toast.error(error.message || "Failed to delete module");
      return;
    }
    toast.success("Module deleted");
    queryClient.invalidateQueries({ queryKey: ['bootcamp-curriculum', activeBootcampId] });
  };

  const handleAddLesson = async (moduleId: string, lessonCount: number) => {
    const { error } = await supabase.from('lessons').insert([{
      module_id: moduleId,
      title: `Lesson ${lessonCount + 1}`,
      content_type: 'text',
      duration: '5m',
      order_index: lessonCount
    }]);
    if (error) {
      toast.error(error.message || "Failed to add lesson");
      return;
    }
    toast.success("Lesson added");
    queryClient.invalidateQueries({ queryKey: ['bootcamp-curriculum', activeBootcampId] });
  };

  const handleUpdateLesson = async (lessonId: string, updates: any) => {
    const { data, error } = await supabase.from('lessons').update(updates).eq('id', lessonId).select();
    if (error) {
      toast.error(error.message || "Failed to update lesson");
      return;
    }
    if (!data || data.length === 0) {
      toast.error("Changes were not saved. You may not have permission to update this lesson.");
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['bootcamp-curriculum', activeBootcampId] });
  };

  const handleDeleteLesson = async (lessonId: string) => {
    const { error } = await supabase.from('lessons').delete().eq('id', lessonId);
    if (error) {
      toast.error(error.message || "Failed to delete lesson");
      return;
    }
    toast.success("Lesson deleted");
    queryClient.invalidateQueries({ queryKey: ['bootcamp-curriculum', activeBootcampId] });
  };

  // ═══════════════════════════════════════════════════════════════
  // ACCESS GATE
  // ═══════════════════════════════════════════════════════════════
  if (!hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center bg-background">
        <div className="flex flex-col items-center max-w-sm">
          {/* Premium dark card intro */}
          <div className="relative w-full overflow-hidden rounded-[28px] bg-[#141117] p-8 ring-1 ring-white/[0.06] shadow-lift mb-8">
            <div className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full bg-[#cc208f]/25 blur-[80px]" />
            <div className="relative z-10 flex flex-col items-center">
              <div className="grid h-14 w-14 place-items-center rounded-full bg-white/[0.06] ring-1 ring-white/10 mb-5">
                <GraduationCap className="h-6 w-6 text-white/90" strokeWidth={1.75} />
              </div>
              <h1 className="font-display text-[26px] font-semibold text-white tracking-tight">Tutor Studio</h1>
              <p className="mt-2 text-[13.5px] text-white/60 leading-relaxed">
                Launch bootcamps, build curricula, and earn from your knowledge.
              </p>
            </div>
          </div>

          <p className="text-[13.5px] text-muted-foreground leading-relaxed mb-7">
            You need an active <span className="font-semibold text-foreground">Premium+ plan</span> to access the Tutor Studio.
          </p>

          <Link
            to="/app/premium"
            className="w-full rounded-full bg-foreground px-8 py-3.5 font-semibold tracking-tight text-background tap shadow-lift flex items-center justify-center gap-2 text-[14px] hover:opacity-90"
          >
            <Zap className="h-4 w-4" /> Upgrade to Premium+
          </Link>

          <button
            onClick={() => setHasAccess(true)}
            className="mt-6 text-xs text-muted-foreground/40 hover:text-muted-foreground transition-colors underline underline-offset-4"
          >
            Bypass for demo
          </button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // EDITOR VIEW
  // ═══════════════════════════════════════════════════════════════
  if (view === "editor") {
    return (
      <div className="flex flex-col min-h-screen bg-background pb-20">
        {/* ── Editor Header ────────────────────────────── */}
        <header className="sticky top-0 z-40 bg-background/85 backdrop-blur-xl backdrop-saturate-150 border-b hairline px-5 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setView("dashboard")}
              className="grid h-9 w-9 place-items-center rounded-full ring-1 ring-border text-foreground tap hover:bg-foreground/[0.04]"
            >
              <ChevronLeft className="h-5 w-5" strokeWidth={2} />
            </button>
            <div className="h-7 w-px bg-border/40" />
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <p className="text-[10px] text-muted-foreground">
                  {activeBootcamp?.status} · Auto-saved
                </p>
              </div>
              <h1 className="text-[15px] font-semibold text-foreground leading-tight tracking-tight">
                {activeBootcamp?.title || "Loading..."}
              </h1>
            </div>
          </div>
        </header>

        {/* ── Floating Pill Tabs ────────────────────────── */}
        <div className="px-5 py-4 max-w-5xl mx-auto w-full">
          <div className="inline-flex items-center bg-foreground/[0.04] p-1 rounded-full overflow-x-auto no-scrollbar max-w-full gap-0.5">
            {[
              { id: "details", label: "Details", icon: Layout },
              { id: "curriculum", label: "Curriculum", icon: BookOpen },
              { id: "learners", label: "Learners", icon: Users },
              { id: "club", label: "Club Setup", icon: Hash },
            ].map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`relative flex items-center gap-2 py-2 px-4 text-[13px] font-semibold tracking-tight transition-all whitespace-nowrap rounded-full ${
                    active
                      ? "bg-background text-foreground shadow-soft ring-1 ring-border"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <tab.icon className={`h-4 w-4 ${active ?"text-primary" : ""}`} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Tab Content ────────────────────────── */}
        <div className="px-5 max-w-5xl mx-auto w-full">

          {/* ─── CURRICULUM TAB ─────────────────── */}
          {activeTab === "curriculum" && (
            <div className="space-y-8">
              <div className="flex items-center justify-between pb-5 border-b border-border/40">
                <div>
                  <h2 className="text-[19px] font-semibold text-foreground tracking-tight">Syllabus Builder</h2>
                  <p className="text-xs text-muted-foreground mt-1">Drag and drop to reorder modules and lessons.</p>
                </div>
                <button onClick={handleAddModule} className="flex items-center gap-2 rounded-full bg-foreground text-background px-5 py-2.5 text-xs font-bold tap hover:opacity-90">
                  Add Module
                </button>
              </div>

              {isLoadingCurriculum && (
                <div className="rounded-3xl border border-border/40 bg-card p-8 text-center text-sm font-bold text-muted-foreground">
                  Loading curriculum...
                </div>
              )}

              {!isLoadingCurriculum && modules.length === 0 && (
                <div className="rounded-3xl border-2 border-dashed border-border/50 bg-card p-10 text-center">
                  <BookOpen className="mx-auto h-10 w-10 text-primary" />
                  <h3 className="mt-4 text-[15px] font-semibold tracking-tight text-foreground">No modules yet</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Add your first module to start building the syllabus.</p>
                  <button onClick={handleAddModule} className="mt-5 rounded-full bg-foreground px-6 py-3 text-xs font-bold text-background">
                    Add First Module
                  </button>
                </div>
              )}

              {!isLoadingCurriculum && modules.length > 0 && (
              <Accordion type="multiple" defaultValue={modules.map((m: any) => m.id)} className="space-y-5">
                {modules.map((m: any) => (
                  <AccordionItem
                    key={m.id}
                    value={m.id}
                    className="ring-1 ring-border rounded-2xl bg-card overflow-hidden shadow-soft"
                  >
                    <div className="flex items-center gap-3 px-5 py-1.5 border-b border-border/30 bg-accent/10">
                      <div className="p-2 cursor-grab active:cursor-grabbing hover:bg-accent rounded-xl transition-colors">
                        <GripVertical className="h-5 w-5 text-muted-foreground/40" />
                      </div>
                      <div className="flex-1 py-3">
                        <input
                          defaultValue={m.title}
                          onBlur={(e) => handleUpdateModuleTitle(m.id, e.target.value)}
                          className="w-full bg-transparent text-[15px] font-semibold text-foreground tracking-tight outline-none focus:text-primary"
                        />
                        <p className="mt-1 text-[11px] font-medium text-muted-foreground">{m.lessons?.length || 0} lessons</p>
                      </div>
                      <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                          <button className="grid h-10 w-10 place-items-center rounded-full text-muted-foreground transition hover:bg-accent hover:text-foreground">
                            <MoreHorizontal className="h-5 w-5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52 rounded-2xl bg-card border-border/50 p-2 shadow-2xl">
                          <DropdownMenuItem className="text-foreground text-sm font-bold gap-3 py-3 rounded-xl cursor-pointer hover:bg-accent focus:bg-accent">
                            <Edit3 className="h-4 w-4 text-muted-foreground" /> Rename Module
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDeleteModule(m.id)}
                            className="text-destructive focus:text-destructive text-sm font-bold gap-3 py-3 rounded-xl cursor-pointer hover:bg-destructive/10 focus:bg-destructive/10"
                          >
                            <Trash2 className="h-4 w-4" /> Delete Module
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <AccordionContent className="px-5 pb-5 pt-4 space-y-3">
                      {(m.lessons || []).map((l: any, j: number) => (
                        <div
                          key={j}
                          className="group flex items-center justify-between gap-4 p-4 rounded-2xl bg-background border border-border/30 hover:border-primary/30 hover:shadow-lg transition-all relative overflow-hidden"
                        >
                          <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-transparent group-hover:bg-primary transition-colors rounded-r-full" />
                          <div className="flex items-center gap-4 min-w-0 pl-2 flex-1">
                            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary shrink-0">
                              <Play className="h-4 w-4 ml-0.5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <input
                                defaultValue={l.title}
                                onBlur={(e) => handleUpdateLesson(l.id, { title: e.target.value || "Untitled lesson" })}
                                className="block w-full bg-transparent text-[14px] font-medium tracking-tight text-foreground outline-none focus:text-primary"
                              />
                              <div className="mt-2 grid grid-cols-[92px_1fr] gap-2">
                                <input
                                  defaultValue={l.duration || "5m"}
                                  onBlur={(e) => handleUpdateLesson(l.id, { duration: e.target.value || "5m" })}
                                  className="rounded-lg border border-border/40 bg-card px-2 py-1 text-[10px] font-bold text-muted-foreground outline-none focus:border-primary"
                                />
                                <select
                                  defaultValue={l.content_type || "text"}
                                  onChange={(e) => handleUpdateLesson(l.id, { content_type: e.target.value })}
                                  className="rounded-lg border border-border/40 bg-card px-2 py-1 text-[10px] font-bold text-muted-foreground outline-none focus:border-primary"
                                >
                                  <option value="text">Text</option>
                                  <option value="video">Video</option>
                                  <option value="assignment">Assignment</option>
                                </select>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleDeleteLesson(l.id)}
                              className="grid h-9 w-9 place-items-center rounded-xl bg-destructive/10 text-destructive hover:bg-destructive hover:text-white transition"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                      <button
                        onClick={() => handleAddLesson(m.id, m.lessons?.length || 0)}
                        className="w-full flex items-center justify-center gap-2 py-4 border-2 border-dashed border-border/50 rounded-2xl text-sm font-bold text-muted-foreground hover:text-primary hover:border-primary/40 hover:bg-primary/5 transition-all"
                      >
                        <Plus className="h-4 w-4" /> Add Lesson
                      </button>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
              )}

              {!isLoadingCurriculum && modules.length > 0 && (
                <div className="flex justify-end pt-4 border-t border-border/40 mt-6">
                  <button
                    onClick={handleSaveBootcampSettings}
                    className="rounded-full bg-primary px-8 py-3.5 text-sm font-bold text-primary-foreground tap hover:opacity-90 flex items-center gap-2"
                  >
                    Save Changes
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ─── LEARNERS TAB ─────────────────── */}
          {activeTab === "learners" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between pb-5 border-b border-border/40">
                <div>
                  <h2 className="text-[19px] font-semibold text-foreground tracking-tight">Learner Roster</h2>
                  <p className="text-xs text-muted-foreground mt-1">Manage and track your enrolled learners.</p>
                </div>
                <div className="bg-primary/10 text-primary px-4 py-2 rounded-full text-[13px] font-semibold tracking-tight tabular-nums flex items-center gap-2 ring-1 ring-primary/15">
                  <Users className="h-4 w-4" /> {learners.length}
                </div>
              </div>

              <div className="flex gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search learners..."
                    className="w-full bg-accent/30 border border-border/40 rounded-2xl pl-12 pr-4 py-3.5 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/40 transition text-foreground placeholder:text-muted-foreground/60"
                  />
                </div>
                <button className="grid h-[50px] w-[50px] place-items-center rounded-2xl bg-accent/30 border border-border/40 text-foreground hover:bg-accent transition shrink-0">
                  <Filter className="h-5 w-5" />
                </button>
              </div>

              <div className="rounded-2xl ring-1 ring-border bg-card overflow-hidden divide-y divide-hairline shadow-soft">
                {learners.length > 0 && learners.map((learner: any) => (
                  <div key={learner.profiles?.id} className="flex items-center justify-between p-5 hover:bg-accent/20 transition-colors">
                    <div className="flex items-center gap-4">
                      {learner.profiles?.avatar_url ? (
                        <img src={learner.profiles.avatar_url} alt={learner.profiles.full_name} className="h-12 w-12 rounded-2xl object-cover border border-border/40" />
                      ) : (
                        <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-primary/15 to-blue-500/15 border border-border/40 flex items-center justify-center font-semibold text-sm text-primary">
                          {(learner.profiles?.full_name || learner.profiles?.username || "?")[0].toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div className="text-sm font-bold text-foreground">{learner.profiles?.full_name || learner.profiles?.username || "Unknown"}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">Joined {new Date(learner.created_at).toLocaleDateString()}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-emerald-500 bg-emerald-500/10 px-3 py-1.5 rounded-full flex items-center gap-1.5 border border-emerald-500/20">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Active
                      </span>
                      <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                          <button className="grid h-9 w-9 place-items-center rounded-xl text-muted-foreground hover:bg-accent hover:text-foreground transition">
                            <MoreHorizontal className="h-5 w-5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52 rounded-2xl bg-card border-border/50 p-2 shadow-2xl">
                          <DropdownMenuItem className="text-foreground text-sm font-bold gap-3 py-3 rounded-xl cursor-pointer hover:bg-accent focus:bg-accent">
                            <MessageCircle className="h-4 w-4 text-muted-foreground" /> Message
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-foreground text-sm font-bold gap-3 py-3 rounded-xl cursor-pointer hover:bg-accent focus:bg-accent">
                            <Eye className="h-4 w-4 text-muted-foreground" /> View Progress
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive focus:text-destructive text-sm font-bold gap-3 py-3 rounded-xl cursor-pointer hover:bg-destructive/10 focus:bg-destructive/10">
                            <UserMinus className="h-4 w-4" /> Remove
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </div>
              {learners.length === 0 && (
                <div className="p-8 text-center text-sm text-muted-foreground">No learners enrolled yet.</div>
              )}
              {learners.length > 5 && (
                <button className="w-full py-4 text-sm font-bold text-primary hover:bg-accent/30 transition-colors">
                  Load More Learners
                </button>
              )}
            </div>
          )}

          {/* ─── CLUB SETUP TAB ─────────────────── */}
          {activeTab === "club" && (
            <div className="space-y-8">
              <div className="pb-5 border-b border-border/40">
                <h2 className="text-[19px] font-semibold text-foreground tracking-tight">Club Management</h2>
                <p className="text-xs text-muted-foreground mt-1">Configure community features for your bootcamp.</p>
              </div>

              {/* Roles & Permissions */}
              <section className="rounded-2xl ring-1 ring-border bg-card p-6 relative overflow-hidden shadow-soft">
                <div className="relative z-10 flex items-center gap-3 mb-6">
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-primary/8 ring-1 ring-primary/15 text-primary">
                    <ShieldCheck className="h-4 w-4" strokeWidth={1.75} />
                  </div>
                  <h3 className="text-[16px] font-semibold text-foreground tracking-tight">Roles & permissions</h3>
                </div>

                {!clubData ? (
                  <div className="rounded-2xl border border-dashed border-border-strong p-6 text-center text-[13px] text-muted-foreground">
                    No club is linked to this bootcamp yet. A club is created automatically when a bootcamp launches — if you renamed the bootcamp, the link by name may be broken.
                  </div>
                ) : (
                <div className="relative z-10 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-background ring-1 ring-border">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="h-11 w-11 rounded-full bg-amber-500/8 ring-1 ring-amber-500/15 grid place-items-center text-amber-600 dark:text-amber-400 shrink-0">
                        <Star className="h-5 w-5" strokeWidth={1.75} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13.5px] font-semibold tracking-tight text-foreground">Study Rep</p>
                        {studyRep ? (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            <span className="font-medium text-foreground">{studyRep.profiles?.full_name || studyRep.profiles?.username}</span> oversees daily activities
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground mt-0.5">Not assigned yet — pick a member to lead daily activities</p>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => setRoleDrawer("rep")}
                      className="shrink-0 px-4 py-2 rounded-full ring-1 ring-border text-xs font-semibold tracking-tight text-foreground hover:bg-foreground/[0.04] tap"
                    >
                      {studyRep ? "Change Rep" : "Assign Rep"}
                    </button>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-background ring-1 ring-border">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="h-11 w-11 rounded-full bg-blue-500/8 ring-1 ring-blue-500/15 grid place-items-center text-blue-600 dark:text-blue-400 shrink-0">
                        <ShieldCheck className="h-5 w-5" strokeWidth={1.75} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13.5px] font-semibold tracking-tight text-foreground">Administrators</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Can moderate chat and manage members</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-semibold tracking-tight text-foreground ring-1 ring-border px-3 py-1.5 rounded-full tabular-nums">
                        {clubAdmins.length} {clubAdmins.length === 1 ? "admin" : "admins"}
                      </span>
                      <button
                        onClick={() => setRoleDrawer("admins")}
                        className="shrink-0 px-4 py-2 rounded-full ring-1 ring-border text-xs font-semibold tracking-tight text-foreground hover:bg-foreground/[0.04] tap"
                      >
                        Manage
                      </button>
                    </div>
                  </div>
                </div>
                )}
              </section>

              {/* Role management drawer */}
              <Drawer open={roleDrawer !== null} onOpenChange={(open) => !open && setRoleDrawer(null)}>
                <DrawerContent className="border-none bg-background p-6 focus:ring-0 max-w-lg mx-auto">
                  <DrawerTitle className="text-[20px] font-semibold tracking-tight text-foreground">
                    {roleDrawer === "rep" ? "Assign Study Rep" : "Manage administrators"}
                  </DrawerTitle>
                  <p className="mt-1 text-[13px] text-muted-foreground">
                    {roleDrawer === "rep"
                      ? "The Study Rep oversees daily activities and answers questions. Only one member holds this role."
                      : "Administrators can moderate the club chat and manage members."}
                  </p>

                  <div className="mt-5 max-h-[50vh] overflow-y-auto no-scrollbar divide-y divide-hairline">
                    {clubMembers.length === 0 && (
                      <p className="py-10 text-center text-[13px] text-muted-foreground">No members in this club yet.</p>
                    )}
                    {clubMembers.map((member: any) => {
                      const isOwner = member.profile_id === profile?.id;
                      const isRep = member.role === "Study Rep";
                      const isAdmin = member.role === "Administrator";
                      const busy = updatingMemberId === member.profile_id;
                      return (
                        <div key={member.profile_id} className="flex items-center justify-between gap-3 py-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="h-10 w-10 rounded-full bg-muted overflow-hidden ring-1 ring-border shrink-0 flex items-center justify-center text-[13px] font-semibold text-muted-foreground">
                              {member.profiles?.avatar_url ? (
                                <img src={member.profiles.avatar_url} className="h-full w-full object-cover" />
                              ) : (
                                (member.profiles?.username || "U")[0].toUpperCase()
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="text-[14px] font-semibold tracking-tight text-foreground truncate">
                                {member.profiles?.full_name || member.profiles?.username}
                                {isOwner && <span className="ml-1.5 text-[10px] font-medium text-muted-foreground">(you)</span>}
                              </p>
                              <p className="text-[11.5px] text-muted-foreground truncate">
                                @{member.profiles?.username} · {member.role}
                              </p>
                            </div>
                          </div>

                          {roleDrawer === "rep" ? (
                            isRep ? (
                              <span className="shrink-0 flex items-center gap-1 rounded-full bg-primary/8 ring-1 ring-primary/15 px-3 py-1.5 text-[11px] font-semibold text-primary">
                                <Check className="h-3 w-3" strokeWidth={2.5} /> Current Rep
                              </span>
                            ) : (
                              <button
                                onClick={() => handleAssignRep(member.profile_id)}
                                disabled={busy || updatingMemberId !== null}
                                className="shrink-0 rounded-full bg-foreground px-4 py-1.5 text-[11.5px] font-semibold tracking-tight text-background tap hover:opacity-90 disabled:opacity-40"
                              >
                                {busy ? "Saving…" : "Make Rep"}
                              </button>
                            )
                          ) : isOwner ? (
                            <span className="shrink-0 rounded-full ring-1 ring-border px-3 py-1.5 text-[11px] font-medium text-muted-foreground">Owner</span>
                          ) : (
                            <button
                              onClick={() => handleToggleAdmin(member)}
                              disabled={busy || updatingMemberId !== null}
                              className={`shrink-0 rounded-full px-4 py-1.5 text-[11.5px] font-semibold tracking-tight tap disabled:opacity-40 ${
                                isAdmin
                                  ? "ring-1 ring-destructive/25 text-destructive hover:bg-destructive/5"
                                  : "bg-foreground text-background hover:opacity-90"
                              }`}
                            >
                              {busy ? "Saving…" : isAdmin ? "Remove admin" : "Make admin"}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <button
                    onClick={() => setRoleDrawer(null)}
                    className="mt-6 w-full rounded-full ring-1 ring-border py-3 text-[13.5px] font-semibold tracking-tight text-foreground hover:bg-foreground/[0.03] tap"
                  >
                    Done
                  </button>
                </DrawerContent>
              </Drawer>

              {/* Classrooms */}
              <section className="rounded-2xl ring-1 ring-border bg-card p-6 shadow-soft">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-2xl bg-violet-500/10 text-violet-500">
                      <Megaphone className="h-5 w-5" />
                    </div>
                    <h3 className="text-[16px] font-semibold text-foreground tracking-tight">Classrooms</h3>
                  </div>
                  <button
                    onClick={() => {
                      const name = prompt("Enter room name:");
                      if (name) {
                        setRooms([...rooms, { name: name.toLowerCase().replace(/\s+/g, '-'), desc: "New room", color: "text-blue-500" }]);
                      }
                    }}
                    className="flex items-center gap-2 text-xs font-bold text-background bg-foreground hover:scale-105 active:scale-95 px-4 py-2 rounded-full tap hover:opacity-90"
                  >
                    <Plus className="h-4 w-4" /> New Room
                  </button>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  {rooms.map((room) => (
                    <div
                      key={room.name}
                      className="group flex flex-col p-5 rounded-2xl bg-background border border-border/30 hover:border-violet-500/30 hover:shadow-lg transition-all"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2.5">
                          <Hash className={`h-5 w-5 ${room.color} opacity-60`} />
                          <span className="text-[13.5px] font-semibold tracking-tight text-foreground">#{room.name}</span>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button className="grid h-8 w-8 place-items-center rounded-xl text-muted-foreground hover:bg-accent hover:text-foreground transition">
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                          <button className="grid h-8 w-8 place-items-center rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">{room.desc}</p>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {/* ─── SETTINGS TAB ─────────────────── */}
          {activeTab === "details" && (
            <div className="space-y-8 max-w-2xl mx-auto pb-10">
              <div className="pb-5 border-b border-border/40">
                <h2 className="text-[19px] font-semibold text-foreground tracking-tight">Bootcamp Details</h2>
                <p className="text-xs text-muted-foreground mt-1">Edit the page learners see before enrolling.</p>
              </div>

              <div className="space-y-6 bg-card p-6 rounded-2xl ring-1 ring-border shadow-soft">
                {/* Cover */}
                <div className="space-y-3">
                  <label className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground ml-1">Cover Image</label>
                  <label className="group border-2 border-dashed border-border/50 rounded-3xl h-48 flex flex-col items-center justify-center text-muted-foreground hover:border-primary/40 transition-all cursor-pointer relative overflow-hidden bg-accent/10">
                    {(bannerUrl || bootcampSettings.banner_url) && (
                      <>
                        <img src={bannerUrl || bootcampSettings.banner_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
                        <div className="absolute inset-0 bg-black/45 opacity-70 transition-opacity group-hover:opacity-90" />
                      </>
                    )}
                    <UploadCloud className="h-10 w-10 mb-3 text-white group-hover:text-primary transition-colors relative z-10" />
                    <span className="text-sm font-bold text-white relative z-10">Click to upload cover</span>
                    <span className="text-xs mt-1 relative z-10 text-white/75">16:9 ratio recommended</span>
                    <input type="file" accept="image/*" className="hidden" onChange={handleBannerUpload} />
                  </label>
                </div>

                {/* Title */}
                <div className="space-y-3">
                  <label className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground ml-1">Title</label>
                  <input
                    type="text"
                    value={bootcampSettings.title}
                    onChange={(e) => setBootcampSettings({ ...bootcampSettings, title: e.target.value })}
                    className="w-full bg-background ring-1 ring-border rounded-2xl px-5 py-4 text-base font-bold text-foreground outline-none focus:ring-2 focus:ring-primary/40 transition placeholder:text-muted-foreground/40"
                    placeholder="e.g. Advanced UI/UX Design"
                  />
                </div>

                {/* Category / Status */}
                <div className="grid grid-cols-2 gap-5">
                  <div className="space-y-3">
                    <label className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground ml-1">Category</label>
                    <div className="relative">
                      <select
                        value={bootcampSettings.category}
                        onChange={(e) => setBootcampSettings({ ...bootcampSettings, category: e.target.value })}
                        className="w-full appearance-none bg-background ring-1 ring-border rounded-2xl px-5 py-4 pr-10 text-sm font-bold text-foreground outline-none focus:ring-2 focus:ring-primary/40 transition"
                      >
                        <option>Design</option>
                        <option>Development</option>
                        <option>Marketing</option>
                        <option>Business</option>
                        <option>AI</option>
                        <option>Motion</option>
                      </select>
                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <label className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground ml-1">Status</label>
                    <div className="relative">
                      <select
                        value={bootcampSettings.status}
                        onChange={(e) => setBootcampSettings({ ...bootcampSettings, status: e.target.value })}
                        className="w-full appearance-none bg-background ring-1 ring-border rounded-2xl px-5 py-4 pr-10 text-sm font-bold text-foreground outline-none focus:ring-2 focus:ring-primary/40 transition"
                      >
                        <option value="draft">Draft</option>
                        <option value="active">Active</option>
                        <option value="completed">Completed</option>
                      </select>
                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>
                </div>

                {/* Description */}
                <div className="space-y-3">
                  <label className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground ml-1">Description</label>
                  <textarea
                    rows={5}
                    className="w-full bg-background ring-1 ring-border rounded-2xl px-5 py-4 text-sm font-medium text-foreground outline-none focus:ring-2 focus:ring-primary/40 transition placeholder:text-muted-foreground/40 resize-none"
                    value={bootcampSettings.description}
                    onChange={(e) => setBootcampSettings({ ...bootcampSettings, description: e.target.value })}
                    placeholder="Describe what learners will learn..."
                  />
                </div>

                {/* Video / Visibility */}
                <div className="space-y-5 rounded-3xl border border-border/40 bg-background p-5">
                  <div className="space-y-3">
                    <label className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground ml-1">Preview Video</label>
                    <label className="group border-2 border-dashed border-border/50 rounded-3xl h-48 flex flex-col items-center justify-center text-muted-foreground hover:border-primary/40 transition-all cursor-pointer relative overflow-hidden bg-accent/10">
                      {(videoPreviewUrl || bootcampSettings.video_url) ? (
                        <>
                          <video src={videoPreviewUrl || bootcampSettings.video_url} className="absolute inset-0 h-full w-full object-cover" muted loop playsInline />
                          <div className="absolute inset-0 bg-black/45 opacity-70 transition-opacity group-hover:opacity-90" />
                          <UploadCloud className="h-10 w-10 mb-3 text-white group-hover:text-primary transition-colors relative z-10" />
                          <span className="text-sm font-bold text-white relative z-10">Click to change video</span>
                        </>
                      ) : (
                        <>
                          <UploadCloud className="h-10 w-10 mb-3 group-hover:text-primary transition-colors relative z-10" />
                          <span className="text-sm font-bold relative z-10">Click to upload preview video</span>
                        </>
                      )}
                      <input type="file" accept="video/*" className="hidden" onChange={handleVideoUpload} />
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={() => setBootcampSettings({ ...bootcampSettings, visibility: !bootcampSettings.visibility })}
                    className="flex w-full items-center justify-between rounded-2xl bg-card border border-border/40 px-5 py-4 text-left"
                  >
                    <div>
                      <p className="text-sm font-bold text-foreground">Public listing</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Show this bootcamp in Learn and search.</p>
                    </div>
                    <span className={`h-7 w-12 rounded-full p-1 transition ${bootcampSettings.visibility ? "bg-primary" : "bg-accent"}`}>
                      <span className={`block h-5 w-5 rounded-full bg-background shadow-sm transition ${bootcampSettings.visibility ? "translate-x-5" : "translate-x-0"}`} />
                    </span>
                  </button>
                </div>

                {/* Price / Capacity */}
                <div className="grid grid-cols-2 gap-5">
                  <div className="space-y-3">
                    <label className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground ml-1">Price (₦)</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-muted-foreground/60">₦</span>
                      <input
                        type="number"
                        value={bootcampSettings.price}
                        onChange={(e) => setBootcampSettings({ ...bootcampSettings, price: e.target.value })}
                        className="w-full bg-background ring-1 ring-border rounded-2xl pl-12 pr-5 py-4 text-sm font-bold text-foreground outline-none focus:ring-2 focus:ring-primary/40 transition"
                      />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <label className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground ml-1">Capacity</label>
                    <div className="relative">
                      <Users className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground/60" />
                      <input
                        type="number"
                        defaultValue="50"
                        className="w-full bg-background ring-1 ring-border rounded-2xl pl-12 pr-5 py-4 text-sm font-bold text-foreground outline-none focus:ring-2 focus:ring-primary/40 transition"
                      />
                    </div>
                  </div>
                </div>

                {/* Coupon */}
                <div className="space-y-4 rounded-3xl border border-border/40 bg-background p-5">
                  <div>
                    <h3 className="text-[13.5px] font-semibold tracking-tight text-foreground">Coupon</h3>
                    <p className="mt-1 text-xs text-muted-foreground">Add a discount code learners can apply on the bootcamp details footer.</p>
                  </div>

                  <div className="grid grid-cols-[1fr_96px] gap-3">
                    <div className="space-y-3">
                      <label className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground ml-1">Coupon Code</label>
                      <input
                        type="text"
                        value={bootcampSettings.coupon_code}
                        onChange={(e) => setBootcampSettings({ ...bootcampSettings, coupon_code: e.target.value.toUpperCase() })}
                        placeholder="ZERO20"
                        className="w-full bg-card ring-1 ring-border rounded-2xl px-5 py-4 text-sm font-semibold tracking-tight text-foreground outline-none focus:ring-2 focus:ring-primary/40 transition placeholder:text-muted-foreground/40"
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground ml-1">Off</label>
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={bootcampSettings.coupon_discount_percent}
                          onChange={(e) => setBootcampSettings({ ...bootcampSettings, coupon_discount_percent: e.target.value })}
                          className="w-full bg-card ring-1 ring-border rounded-2xl px-5 py-4 pr-9 text-[13.5px] font-semibold tracking-tight text-foreground outline-none focus:ring-2 focus:ring-primary/40 transition"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">%</span>
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleSaveBootcampSettings}
                  className="w-full rounded-full bg-foreground px-6 py-3.5 text-[14px] font-semibold tracking-tight text-background tap shadow-lift hover:opacity-90"
                >
                  Save Bootcamp Settings
                </button>

                {/* Delete */}
                <div className="pt-6 border-t border-border/30 mt-8">
                  <button 
                    onClick={handleDeleteBootcamp}
                    disabled={deleteMutation.isPending}
                    className="w-full bg-destructive/8 text-destructive font-semibold tracking-tight py-3.5 rounded-full hover:bg-destructive/15 tap flex items-center justify-center gap-2 text-[13.5px] disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" /> 
                    {deleteMutation.isPending ? "Deleting..." : "Delete Bootcamp"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // DASHBOARD VIEW
  // ═══════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-background pb-20">
      {/* ── Header ────────────────────────── */}
      <div className="relative w-full bg-background pt-[calc(2.5rem+env(safe-area-inset-top))] pb-2 px-5">
        <div className="flex items-center justify-between gap-4 max-w-4xl lg:max-w-[1100px] mx-auto">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Tutor Studio</p>
            <h1 className="mt-1 font-display text-[26px] font-semibold text-foreground tracking-tight">Dashboard</h1>
          </div>
          <Link
            to="/app/tutor-studio/settings"
            aria-label="Studio settings"
            className="grid h-9 w-9 place-items-center rounded-full ring-1 ring-border bg-card text-foreground tap hover:bg-foreground/[0.04]"
          >
            <Settings className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </Link>
        </div>
      </div>

      <div className="px-5 mt-8 space-y-10 max-w-4xl lg:max-w-[1100px] mx-auto md:pb-12">
        {/* ── Quick Stats ────────────────────────── */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <div className="rounded-2xl ring-1 ring-border bg-card p-5 shadow-soft">
            <div className="flex items-center gap-2.5 text-muted-foreground">
              <Wallet className="h-4 w-4" strokeWidth={1.75} />
              <span className="text-[11px] font-medium uppercase tracking-[0.1em]">Total earned</span>
            </div>
            <p className="mt-3 font-display text-[28px] font-semibold text-foreground tracking-tight tabular-nums leading-none">₦0</p>
            <div className="flex items-center gap-1.5 mt-2.5 text-success">
              <TrendingUp className="h-3 w-3" />
              <span className="text-[11px] font-medium">+0% this month</span>
            </div>
          </div>
          <div className="rounded-2xl ring-1 ring-border bg-card p-5 shadow-soft">
            <div className="flex items-center gap-2.5 text-muted-foreground">
              <Users className="h-4 w-4" strokeWidth={1.75} />
              <span className="text-[11px] font-medium uppercase tracking-[0.1em]">Learners</span>
            </div>
            <p className="mt-3 font-display text-[28px] font-semibold text-foreground tracking-tight tabular-nums leading-none">0</p>
            <div className="flex items-center gap-1.5 mt-2.5 text-muted-foreground">
              <span className="text-[11px] font-medium">Across all bootcamps</span>
            </div>
          </div>
          <div className="hidden lg:block rounded-2xl ring-1 ring-border bg-card p-5 shadow-soft">
            <div className="flex items-center gap-2.5 text-muted-foreground">
              <BookOpen className="h-4 w-4" strokeWidth={1.75} />
              <span className="text-[11px] font-medium uppercase tracking-[0.1em]">Bootcamps</span>
            </div>
            <p className="mt-3 font-display text-[28px] font-semibold text-foreground tracking-tight tabular-nums leading-none">{bootcamps.length}</p>
            <div className="flex items-center gap-1.5 mt-2.5 text-muted-foreground">
              <span className="text-[11px] font-medium">Published & drafts</span>
            </div>
          </div>
          <div className="hidden lg:block rounded-2xl ring-1 ring-border bg-card p-5 shadow-soft">
            <div className="flex items-center gap-2.5 text-muted-foreground">
              <Zap className="h-4 w-4" strokeWidth={1.75} />
              <span className="text-[11px] font-medium uppercase tracking-[0.1em]">Active</span>
            </div>
            <p className="mt-3 font-display text-[28px] font-semibold text-foreground tracking-tight tabular-nums leading-none">{bootcamps.filter((b: any) => (b.status || "").toLowerCase() === "active").length}</p>
            <div className="flex items-center gap-1.5 mt-2.5 text-muted-foreground">
              <span className="text-[11px] font-medium">Live cohorts running</span>
            </div>
          </div>
        </section>

        {/* ── Bootcamps Grid ────────────────────────── */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[19px] font-semibold text-foreground tracking-tight">Your bootcamps</h2>
            <button
              onClick={() => router.navigate({ to: "/app/tutor-studio/create" })}
              className="flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-[13px] font-semibold tracking-tight text-background tap hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> Create
            </button>
          </div>

          <div className="grid gap-3 md:gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {bootcamps.length > 0 ? bootcamps.map((course) => (
              <div
                key={course.id}
                onClick={() => { setActiveBootcampId(course.id); setActiveTab("details"); setView("editor"); }}
                className="group relative flex flex-col rounded-2xl ring-1 ring-border bg-card transition-all hover:ring-foreground/15 shadow-soft cursor-pointer overflow-hidden"
              >
                {/* Thumbnail */}
                <div className="h-36 w-full bg-muted relative overflow-hidden">
                  {course.banner_url && (
                    <img src={course.banner_url} alt={course.title} className="absolute inset-0 w-full h-full object-cover" />
                  )}
                  {course.creator_id !== profile?.id && (
                    <div className="absolute top-3 left-3">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-primary text-primary-foreground shadow-sm uppercase tracking-wide">
                        Assigned
                      </span>
                    </div>
                  )}
                  <div className="absolute top-3 right-3">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium backdrop-blur-md ${course.status === "Active" ? "bg-black/50 text-white ring-1 ring-white/20" :
                      "bg-black/50 text-white/80 ring-1 ring-white/15"
                    }`}>
                      {course.status === "Active" && <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
                      {course.status}
                    </span>
                  </div>
                </div>

                <div className="p-5 flex-1 flex flex-col justify-between">
                  <div className="mb-4">
                    <h3 className="text-[15px] font-semibold text-foreground leading-snug tracking-tight">{course.title}</h3>
                    <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground mt-1.5">
                      {course.category}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-3.5 border-t hairline">
                    <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                      <UsersRound className="h-3.5 w-3.5" strokeWidth={1.75} />
                      <span className="tabular-nums">{course.enrollments?.[0]?.count || 0} enrolled</span>
                    </div>
                    <span className="text-[13px] font-semibold tracking-tight text-foreground tabular-nums">₦{Number(course.price || 0).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            )) : (
              <div className="sm:col-span-2 xl:col-span-3 rounded-2xl ring-1 ring-border bg-card p-14 flex flex-col items-center justify-center text-center">
                <div className="h-14 w-14 rounded-full ring-1 ring-border flex items-center justify-center mb-5">
                  <BookOpen className="h-6 w-6 text-muted-foreground/60" strokeWidth={1.75} />
                </div>
                <h3 className="text-[17px] font-semibold text-foreground mb-1.5 tracking-tight">No bootcamps yet</h3>
                <p className="text-[13.5px] text-muted-foreground max-w-sm mb-7 leading-relaxed">Create your first bootcamp to start sharing your knowledge and earning.</p>
                <button
                  onClick={() => router.navigate({ to: "/app/tutor-studio/create" })}
                  className="rounded-full bg-foreground px-6 py-2.5 text-[13px] font-semibold tracking-tight text-background tap hover:opacity-90"
                >
                  Create your first bootcamp
                </button>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
