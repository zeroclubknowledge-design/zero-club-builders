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
import { getTutorBootcamps, deleteBootcampAction } from "@/api";
import { useEffect } from "react";
import { uploadFile } from "@/lib/storage";

export const Route = createFileRoute("/app/tutor-studio/")({
  component: TutorStudioPage,
});

function TutorStudioPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [view, setView] = useState<"dashboard" | "editor">("dashboard");
  const [activeTab, setActiveTab] = useState<"details" | "curriculum" | "students" | "club">("details");
  const [hasAccess, setHasAccess] = useState(false);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [bootcampBannerFile, setBootcampBannerFile] = useState<File | null>(null);
  const [activeBootcampId, setActiveBootcampId] = useState<string | null>(null);

  // Profile data for Payout/Booking
  const [profile, setProfile] = useState<any>(null);
  const [payoutForm, setPayoutForm] = useState({ bank_name: '', account_number: '', account_name: '' });
  const [bookingForm, setBookingForm] = useState({ availability_days: 'Weekdays (Mon-Fri)', availability_start: '09:00', availability_end: '17:00', availability_duration: '60 minutes' });
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

  const { data: bootcamps = [] } = useQuery({
    queryKey: ['tutor-bootcamps'],
    queryFn: () => getTutorBootcamps()
  });

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
  }, [activeBootcamp?.id]);

  // Fetch profile settings
  useEffect(() => {
    async function loadProfile() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
        if (data) {
          setProfile(data);
          setPayoutForm({
            bank_name: data.bank_name || '',
            account_number: data.account_number || '',
            account_name: data.account_name || ''
          });
          setBookingForm({
            availability_days: data.availability_days || 'Weekdays (Mon-Fri)',
            availability_start: data.availability_start || '09:00',
            availability_end: data.availability_end || '17:00',
            availability_duration: data.availability_duration || '60 minutes'
          });
        }
      }
    }
    loadProfile();
  }, []);

  const handleSaveSettings = async (type: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const updates = type === 'Payout' ? payoutForm : bookingForm;

    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', session.user.id);

    if (error) {
      toast.error(`Failed to save ${type} settings: ${error.message}`);
    } else {
      toast.success(`${type} settings saved successfully!`);
    }
  };

  const handleSaveBootcampSettings = async () => {
    if (!activeBootcampId) return;

    const discount = Math.min(100, Math.max(0, Number(bootcampSettings.coupon_discount_percent) || 0));
    const code = bootcampSettings.coupon_code.trim().toUpperCase();
    let savedBannerUrl = bootcampSettings.banner_url;

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

    const { error } = await supabase
      .from('bootcamps')
      .update({
        title: bootcampSettings.title,
        description: bootcampSettings.description,
        category: bootcampSettings.category,
        price: Number(bootcampSettings.price) || 0,
        status: bootcampSettings.status,
        visibility: bootcampSettings.visibility,
        banner_url: savedBannerUrl || null,
        video_url: bootcampSettings.video_url || null,
        coupon_code: code || null,
        coupon_discount_percent: code ? discount : 0
      })
      .eq('id', activeBootcampId);

    if (error) {
      toast.error(`Failed to save bootcamp settings: ${error.message}`);
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
    const { error } = await supabase.from('modules').update({ title: title.trim() }).eq('id', moduleId);
    if (error) {
      toast.error(error.message || "Failed to update module");
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
    const { error } = await supabase.from('lessons').update(updates).eq('id', lessonId);
    if (error) {
      toast.error(error.message || "Failed to update lesson");
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
      <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center bg-background relative overflow-hidden">
        {/* Ambient blurs */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/15 blur-[150px] rounded-full" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-blue-500/10 blur-[120px] rounded-full translate-x-1/4 translate-y-1/4" />

        <div className="relative z-10 flex flex-col items-center max-w-sm">
          <div className="h-20 w-20 rounded-[28px] bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 grid place-items-center mb-8 shadow-lg shadow-primary/10">
            <GraduationCap className="h-10 w-10 text-primary" />
          </div>



          <h1 className="font-display text-3xl font-black text-foreground mb-3 tracking-tight">Tutor Studio</h1>
          <p className="text-sm text-muted-foreground leading-relaxed mb-10">
            You need an active <span className="font-bold text-foreground">Premium+ Plan</span> subscription to access the Tutor Studio and launch bootcamps.
          </p>

          <Link
            to="/app/premium"
            className="w-full rounded-full bg-foreground px-8 py-4 font-bold text-background shadow-xl transition hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2 text-sm"
          >
            <Zap className="h-4 w-4" /> Upgrade to Premium+ Plan
          </Link>

          <button
            onClick={() => setHasAccess(true)}
            className="mt-6 text-xs text-muted-foreground/30 hover:text-muted-foreground transition-colors underline underline-offset-4"
          >
            Bypass for Demo
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
        <header className="sticky top-0 z-40 bg-background/70 backdrop-blur-2xl border-b border-border/40 px-5 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setView("dashboard")}
              className="flex items-center justify-center text-foreground transition-all hover:opacity-70 active:scale-95"
            >
              <ChevronLeft className="h-7 w-7" strokeWidth={3} />
            </button>
            <div className="h-7 w-px bg-border/40" />
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <p className="text-[10px] text-muted-foreground">
                  {activeBootcamp?.status} · Auto-saved
                </p>
              </div>
              <h1 className="text-base font-black text-foreground leading-tight tracking-tight">
                {activeBootcamp?.title || "Loading..."}
              </h1>
            </div>
          </div>
          <button
            onClick={handleSaveBootcampSettings}
            className="rounded-full bg-foreground px-5 py-2.5 text-xs font-bold text-background shadow-lg transition hover:scale-105 active:scale-95 flex items-center gap-2"
          >
            <Check className="h-4 w-4" /> Save
          </button>
        </header>

        {/* ── Floating Pill Tabs ────────────────────────── */}
        <div className="px-5 py-4">
          <div className="inline-flex items-center bg-accent/40 backdrop-blur-md p-1.5 rounded-2xl border border-border/40 overflow-x-auto no-scrollbar max-w-full gap-1">
            {[
              { id: "details", label: "Details", icon: Layout },
              { id: "curriculum", label: "Curriculum", icon: BookOpen },
              { id: "students", label: "Students", icon: Users },
              { id: "club", label: "Club Setup", icon: Hash },
            ].map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`relative flex items-center gap-2 py-2.5 px-5 text-sm font-bold transition-all whitespace-nowrap rounded-xl ${
                    active
                      ?"bg-background text-foreground shadow-md border border-border/50"
                      : "text-muted-foreground hover:text-foreground hover:bg-background/40"
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
                  <h2 className="text-2xl font-black text-foreground tracking-tight">Syllabus Builder</h2>
                  <p className="text-xs text-muted-foreground mt-1">Drag and drop to reorder modules and lessons.</p>
                </div>
                <button onClick={handleAddModule} className="flex items-center gap-2 rounded-full bg-foreground text-background px-5 py-2.5 text-xs font-bold transition hover:scale-105 active:scale-95 shadow-lg">
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
                  <h3 className="mt-4 text-base font-black text-foreground">No modules yet</h3>
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
                    className="border border-border/50 rounded-3xl bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-center gap-3 px-5 py-1.5 border-b border-border/30 bg-accent/10">
                      <div className="p-2 cursor-grab active:cursor-grabbing hover:bg-accent rounded-xl transition-colors">
                        <GripVertical className="h-5 w-5 text-muted-foreground/40" />
                      </div>
                      <div className="flex-1 py-3">
                        <input
                          defaultValue={m.title}
                          onBlur={(e) => handleUpdateModuleTitle(m.id, e.target.value)}
                          className="w-full bg-transparent text-base font-black text-foreground tracking-tight outline-none focus:text-primary"
                        />
                        <p className="mt-1 text-[10px] font-bold text-muted-foreground">{m.lessons?.length || 0} lessons</p>
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
                                className="block w-full bg-transparent text-sm font-bold text-foreground outline-none focus:text-primary"
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
            </div>
          )}

          {/* ─── STUDENTS TAB ─────────────────── */}
          {activeTab === "students" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between pb-5 border-b border-border/40">
                <div>
                  <h2 className="text-2xl font-black text-foreground tracking-tight">Student Roster</h2>
                  <p className="text-xs text-muted-foreground mt-1">Manage and track your enrolled students.</p>
                </div>
                <div className="bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-black flex items-center gap-2 border border-primary/20">
                  <Users className="h-4 w-4" /> 1,240
                </div>
              </div>

              <div className="flex gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search students..."
                    className="w-full bg-accent/30 border border-border/40 rounded-2xl pl-12 pr-4 py-3.5 text-sm font-medium outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition text-foreground placeholder:text-muted-foreground/60"
                  />
                </div>
                <button className="grid h-[50px] w-[50px] place-items-center rounded-2xl bg-accent/30 border border-border/40 text-foreground hover:bg-accent transition shrink-0">
                  <Filter className="h-5 w-5" />
                </button>
              </div>

              <div className="rounded-3xl border border-border/40 bg-card overflow-hidden divide-y divide-border/30 shadow-sm">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center justify-between p-5 hover:bg-accent/20 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-primary/15 to-blue-500/15 border border-border/40 flex items-center justify-center font-black text-sm text-primary">
                        B{i}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-foreground">Builder {i}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">Joined 2 days ago</div>
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
              <button className="w-full py-4 text-sm font-bold text-primary bg-primary/5 hover:bg-primary/10 rounded-2xl border border-primary/20 transition-colors">
                Load More Students
              </button>
            </div>
          )}

          {/* ─── CLUB SETUP TAB ─────────────────── */}
          {activeTab === "club" && (
            <div className="space-y-8">
              <div className="pb-5 border-b border-border/40">
                <h2 className="text-2xl font-black text-foreground tracking-tight">Club Management</h2>
                <p className="text-xs text-muted-foreground mt-1">Configure community features for your bootcamp.</p>
              </div>

              {/* Roles & Permissions */}
              <section className="rounded-3xl border border-border/40 bg-card p-6 relative overflow-hidden shadow-sm">
                <div className="absolute -top-6 -right-6 opacity-[0.04">
                  <ShieldCheck className="h-40 w-40 text-primary" />
                </div>
                <div className="relative z-10 flex items-center gap-3 mb-6">
                  <div className="p-2.5 rounded-2xl bg-primary/10 text-primary">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-black text-foreground tracking-tight">Roles & Permissions</h3>
                </div>
                <div className="relative z-10 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-background border border-border/30 hover:border-primary/30 transition-all">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-2xl bg-amber-500/10 border border-amber-500/15 grid place-items-center text-amber-500 shrink-0">
                        <Star className="h-6 w-6" />
                      </div>
                      <div>
                        <p className="text-sm font-black text-foreground">Study Rep</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Oversees daily activities and answers questions</p>
                      </div>
                    </div>
                    <button className="shrink-0 px-4 py-2 rounded-full bg-accent text-xs font-bold text-foreground hover:bg-accent/80 transition-colors border border-border/30">
                      Change Rep
                    </button>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-background border border-border/30 hover:border-blue-500/30 transition-all">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-2xl bg-blue-500/10 border border-blue-500/15 grid place-items-center text-blue-500 shrink-0">
                        <ShieldCheck className="h-6 w-6" />
                      </div>
                      <div>
                        <p className="text-sm font-black text-foreground">Administrators</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Can moderate chat and manage members</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-foreground bg-accent px-3 py-1.5 rounded-full border border-border/30">2 users</span>
                      <button className="shrink-0 px-4 py-2 rounded-full bg-accent text-xs font-bold text-foreground hover:bg-accent/80 transition-colors border border-border/30">
                        Manage
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              {/* Classrooms */}
              <section className="rounded-3xl border border-border/40 bg-card p-6 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-2xl bg-violet-500/10 text-violet-500">
                      <Megaphone className="h-5 w-5" />
                    </div>
                    <h3 className="text-lg font-black text-foreground tracking-tight">Classrooms</h3>
                  </div>
                  <button className="flex items-center gap-2 text-xs font-bold text-background bg-foreground hover:scale-105 active:scale-95 px-4 py-2.5 rounded-full transition-all shadow-lg">
                    <Plus className="h-4 w-4" /> New Room
                  </button>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  {[
                    { name: "general", desc: "Main discussion area", color: "text-blue-500" },
                    { name: "q-and-a", desc: "Questions and answers", color: "text-emerald-500" },
                    { name: "assignments", desc: "Homework submission", color: "text-amber-500" },
                    { name: "announcements", desc: "Important updates", color: "text-rose-500" },
                  ].map((room) => (
                    <div
                      key={room.name}
                      className="group flex flex-col p-5 rounded-2xl bg-background border border-border/30 hover:border-violet-500/30 hover:shadow-lg transition-all"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2.5">
                          <Hash className={`h-5 w-5 ${room.color} opacity-60`} />
                          <span className="text-sm font-black text-foreground">#{room.name}</span>
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
                <h2 className="text-2xl font-black text-foreground tracking-tight">Bootcamp Details</h2>
                <p className="text-xs text-muted-foreground mt-1">Edit the page students see before enrolling.</p>
              </div>

              <div className="space-y-6 bg-card p-6 rounded-3xl border border-border/40 shadow-sm">
                {/* Cover */}
                <div className="space-y-3">
                  <label className="text-[11px] text-muted-foreground ml-1">Cover Image</label>
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
                  <label className="text-[11px] text-muted-foreground ml-1">Title</label>
                  <input
                    type="text"
                    value={bootcampSettings.title}
                    onChange={(e) => setBootcampSettings({ ...bootcampSettings, title: e.target.value })}
                    className="w-full bg-background border border-border/40 rounded-2xl px-5 py-4 text-base font-bold text-foreground outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition placeholder:text-muted-foreground/40"
                    placeholder="e.g. Advanced UI/UX Design"
                  />
                </div>

                {/* Category / Status */}
                <div className="grid grid-cols-2 gap-5">
                  <div className="space-y-3">
                    <label className="text-[11px] text-muted-foreground ml-1">Category</label>
                    <div className="relative">
                      <select
                        value={bootcampSettings.category}
                        onChange={(e) => setBootcampSettings({ ...bootcampSettings, category: e.target.value })}
                        className="w-full appearance-none bg-background border border-border/40 rounded-2xl px-5 py-4 pr-10 text-sm font-bold text-foreground outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition"
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
                    <label className="text-[11px] text-muted-foreground ml-1">Status</label>
                    <div className="relative">
                      <select
                        value={bootcampSettings.status}
                        onChange={(e) => setBootcampSettings({ ...bootcampSettings, status: e.target.value })}
                        className="w-full appearance-none bg-background border border-border/40 rounded-2xl px-5 py-4 pr-10 text-sm font-bold text-foreground outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition"
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
                  <label className="text-[11px] text-muted-foreground ml-1">Description</label>
                  <textarea
                    rows={5}
                    className="w-full bg-background border border-border/40 rounded-2xl px-5 py-4 text-sm font-medium text-foreground outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition placeholder:text-muted-foreground/40 resize-none"
                    value={bootcampSettings.description}
                    onChange={(e) => setBootcampSettings({ ...bootcampSettings, description: e.target.value })}
                    placeholder="Describe what students will learn..."
                  />
                </div>

                {/* Video / Visibility */}
                <div className="space-y-5 rounded-3xl border border-border/40 bg-background p-5">
                  <div className="space-y-3">
                    <label className="text-[11px] text-muted-foreground ml-1">Preview Video URL</label>
                    <input
                      type="url"
                      value={bootcampSettings.video_url}
                      onChange={(e) => setBootcampSettings({ ...bootcampSettings, video_url: e.target.value })}
                      placeholder="https://..."
                      className="w-full bg-card border border-border/40 rounded-2xl px-5 py-4 text-sm font-medium text-foreground outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition placeholder:text-muted-foreground/40"
                    />
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
                    <label className="text-[11px] text-muted-foreground ml-1">Price (₦)</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-muted-foreground/60">₦</span>
                      <input
                        type="number"
                        value={bootcampSettings.price}
                        onChange={(e) => setBootcampSettings({ ...bootcampSettings, price: e.target.value })}
                        className="w-full bg-background border border-border/40 rounded-2xl pl-12 pr-5 py-4 text-sm font-bold text-foreground outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition"
                      />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <label className="text-[11px] text-muted-foreground ml-1">Capacity</label>
                    <div className="relative">
                      <Users className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground/60" />
                      <input
                        type="number"
                        defaultValue="50"
                        className="w-full bg-background border border-border/40 rounded-2xl pl-12 pr-5 py-4 text-sm font-bold text-foreground outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition"
                      />
                    </div>
                  </div>
                </div>

                {/* Coupon */}
                <div className="space-y-4 rounded-3xl border border-border/40 bg-background p-5">
                  <div>
                    <h3 className="text-sm font-black text-foreground">Coupon</h3>
                    <p className="mt-1 text-xs text-muted-foreground">Add a discount code learners can apply on the bootcamp details footer.</p>
                  </div>

                  <div className="grid grid-cols-[1fr_96px] gap-3">
                    <div className="space-y-3">
                      <label className="text-[11px] text-muted-foreground ml-1">Coupon Code</label>
                      <input
                        type="text"
                        value={bootcampSettings.coupon_code}
                        onChange={(e) => setBootcampSettings({ ...bootcampSettings, coupon_code: e.target.value.toUpperCase() })}
                        placeholder="ZERO20"
                        className="w-full bg-card border border-border/40 rounded-2xl px-5 py-4 text-sm font-black tracking-wide text-foreground outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition placeholder:text-muted-foreground/40"
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="text-[11px] text-muted-foreground ml-1">Off</label>
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={bootcampSettings.coupon_discount_percent}
                          onChange={(e) => setBootcampSettings({ ...bootcampSettings, coupon_discount_percent: e.target.value })}
                          className="w-full bg-card border border-border/40 rounded-2xl px-5 py-4 pr-9 text-sm font-black text-foreground outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">%</span>
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleSaveBootcampSettings}
                  className="w-full rounded-full bg-foreground px-6 py-4 text-sm font-bold text-background shadow-lg transition active:scale-95"
                >
                  Save Bootcamp Settings
                </button>

                {/* Delete */}
                <div className="pt-6 border-t border-border/30 mt-8">
                  <button 
                    onClick={handleDeleteBootcamp}
                    disabled={deleteMutation.isPending}
                    className="w-full bg-destructive/10 text-destructive font-bold py-4 rounded-full border border-destructive/20 hover:bg-destructive hover:text-white transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50"
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
    <div className="min-h-screen bg-background pb-24">
      {/* ── Immersive Hero Header ────────────────────────── */}
      <div className="relative w-full overflow-hidden bg-background pt-[calc(3rem+env(safe-area-inset-top))] pb-6 px-5">
        {bannerUrl ? (
          <>
            <img src={bannerUrl} alt="Studio Banner" className="absolute inset-0 w-full h-full object-cover z-0" />
            <div className="absolute inset-0 bg-background/50 backdrop-blur-[2px] z-0" />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent z-0" />
          </>
        ) : (
          <>
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/15 blur-[140px] rounded-full translate-x-1/3 -translate-y-1/3 z-0 pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-blue-500/10 blur-[120px] rounded-full -translate-x-1/3 translate-y-1/3 z-0 pointer-events-none" />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent z-0 pointer-events-none" />
            {/* Subtle grid pattern */}
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+CjxwYXRoIGQ9Ik0wIDBoNDB2NDBIMHoiIGZpbGw9Im5vbmUiLz4KPHBhdGggZD0iTTAgMTBoNDBNMTAgMHY0ME0wIDIwaDQwTTIwIDB2NDBNMCAzMGg0ME0zMCAwdjQwIiBzdHJva2U9InJnYmEoMjU1LDI1NSwyNTUsMC4wMykiIHN0cm9rZS13aWR0aD0iMSIvPgo8L3N2Zz4=')] z-0 opacity-50 pointer-events-none" />
          </>
        )}

        <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-black text-foreground tracking-tight drop-shadow-sm">Tutor Dashboard</h1>
          </div>
          <Drawer>
            <DrawerTrigger asChild>
              <button
                aria-label="Global settings"
                className="grid h-11 w-11 place-items-center rounded-full border border-border/40 bg-card/80 text-foreground shadow-sm backdrop-blur-md transition hover:bg-accent active:scale-95"
              >
                <Settings className="h-5 w-5" />
              </button>
            </DrawerTrigger>
            <DrawerContent className="h-[90%] border-t border-border/40 bg-card p-0 flex flex-col shadow-[0_-10px_50px_rgba(0,0,0,0.12)] max-w-lg mx-auto">
              <div className="w-12 h-1.5 bg-border/60 rounded-full mx-auto mt-4 mb-2 shrink-0" />
              <DrawerHeader className="px-6 py-4 border-b border-border/30 shrink-0 text-left">
                <DrawerTitle className="text-xl font-black text-foreground flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Settings className="h-5 w-5 text-primary" />
                  </div>
                  Global Settings
                </DrawerTitle>
              </DrawerHeader>
              <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
                <section className="space-y-5">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Wallet className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-foreground">Payout Details</h3>
                      <p className="text-xs text-muted-foreground">Manage bank accounts and earnings</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] text-muted-foreground ml-1">Bank Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Access Bank"
                      value={payoutForm.bank_name}
                      onChange={(e) => setPayoutForm({ ...payoutForm, bank_name: e.target.value })}
                      className="w-full bg-background border border-border/40 rounded-2xl px-5 py-4 text-sm font-medium outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition text-foreground placeholder:text-muted-foreground/40"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] text-muted-foreground ml-1">Account Number</label>
                    <input
                      type="text"
                      placeholder="0123456789"
                      value={payoutForm.account_number}
                      onChange={(e) => setPayoutForm({ ...payoutForm, account_number: e.target.value })}
                      className="w-full bg-background border border-border/40 rounded-2xl px-5 py-4 text-sm font-medium outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition text-foreground placeholder:text-muted-foreground/40"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] text-muted-foreground ml-1">Account Name</label>
                    <input
                      type="text"
                      placeholder="John Doe"
                      value={payoutForm.account_name}
                      onChange={(e) => setPayoutForm({ ...payoutForm, account_name: e.target.value })}
                      className="w-full bg-background border border-border/40 rounded-2xl px-5 py-4 text-sm font-medium outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition text-foreground placeholder:text-muted-foreground/40"
                    />
                  </div>
                  <button onClick={() => handleSaveSettings('Payout')} className="w-full bg-foreground text-background font-bold py-4 rounded-full shadow-lg transition active:scale-95 text-sm">
                    Save Payout Details
                  </button>
                </section>

                <section className="space-y-5 border-t border-border/40 pt-6">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                      <Calendar className="h-5 w-5 text-blue-500" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-foreground">Booking Availability</h3>
                      <p className="text-xs text-muted-foreground">Set times for 1-on-1 tutoring</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] text-muted-foreground ml-1">Working Days</label>
                    <div className="relative">
                      <select
                        value={bookingForm.availability_days}
                        onChange={(e) => setBookingForm({ ...bookingForm, availability_days: e.target.value })}
                        className="w-full appearance-none bg-background border border-border/40 rounded-2xl px-5 py-4 text-sm font-medium outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition text-foreground cursor-pointer"
                      >
                        <option>Weekdays (Mon-Fri)</option>
                        <option>Weekends (Sat-Sun)</option>
                        <option>Everyday</option>
                      </select>
                      <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[11px] text-muted-foreground ml-1">Start Time</label>
                      <input
                        type="time"
                        value={bookingForm.availability_start}
                        onChange={(e) => setBookingForm({ ...bookingForm, availability_start: e.target.value })}
                        className="w-full bg-background border border-border/40 rounded-2xl px-5 py-4 text-sm font-medium outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition text-foreground"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[11px] text-muted-foreground ml-1">End Time</label>
                      <input
                        type="time"
                        value={bookingForm.availability_end}
                        onChange={(e) => setBookingForm({ ...bookingForm, availability_end: e.target.value })}
                        className="w-full bg-background border border-border/40 rounded-2xl px-5 py-4 text-sm font-medium outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition text-foreground"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] text-muted-foreground ml-1">Session Duration</label>
                    <div className="relative">
                      <select
                        value={bookingForm.availability_duration}
                        onChange={(e) => setBookingForm({ ...bookingForm, availability_duration: e.target.value })}
                        className="w-full appearance-none bg-background border border-border/40 rounded-2xl px-5 py-4 text-sm font-medium outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition text-foreground cursor-pointer"
                      >
                        <option>30 minutes</option>
                        <option>45 minutes</option>
                        <option>60 minutes</option>
                      </select>
                      <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>
                  <button onClick={() => handleSaveSettings('Booking')} className="w-full bg-blue-500 text-white font-bold py-4 rounded-full shadow-lg shadow-blue-500/20 transition active:scale-95 text-sm">
                    Save Availability
                  </button>
                </section>
              </div>
            </DrawerContent>
          </Drawer>
        </div>
      </div>

      <div className="px-5 mt-8 space-y-10 max-w-4xl mx-auto">
        {/* ── Quick Stats ────────────────────────── */}
        <section className="grid grid-cols-2 gap-4">
          <div className="relative rounded-3xl border border-border/40 bg-card p-6 overflow-hidden shadow-sm hover:shadow-md transition-shadow group">
            <div className="absolute -top-8 -right-8 opacity-[0.04] group-hover:opacity-[0.08] transition-opacity">
              <Wallet className="h-32 w-32 text-primary" />
            </div>
            <div className="relative z-10 flex items-center gap-3 text-muted-foreground mb-4">
              <div className="h-10 w-10 rounded-2xl bg-primary/10 grid place-items-center shrink-0">
                <Wallet className="h-5 w-5 text-primary" />
              </div>
              <span className="text-[11px] leading-tight">Total Earned</span>
            </div>
            <p className="relative z-10 font-display text-3xl font-black text-foreground tracking-tight">₦0</p>
            <div className="relative z-10 flex items-center gap-1.5 mt-2 text-emerald-500">
              <TrendingUp className="h-3.5 w-3.5" />
              <span className="text-[10px] font-bold">+0% this month</span>
            </div>
          </div>
          <div className="relative rounded-3xl border border-border/40 bg-card p-6 overflow-hidden shadow-sm hover:shadow-md transition-shadow group">
            <div className="absolute -top-8 -right-8 opacity-[0.04] group-hover:opacity-[0.08] transition-opacity">
              <GraduationCap className="h-32 w-32 text-blue-500" />
            </div>
            <div className="relative z-10 flex items-center gap-3 text-muted-foreground mb-4">
              <div className="h-10 w-10 rounded-2xl bg-blue-500/10 grid place-items-center shrink-0">
                <Users className="h-5 w-5 text-blue-500" />
              </div>
              <span className="text-[11px] leading-tight">Students</span>
            </div>
            <p className="relative z-10 font-display text-3xl font-black text-foreground tracking-tight">0</p>
            <div className="relative z-10 flex items-center gap-1.5 mt-2 text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              <span className="text-[10px] font-bold">Across all bootcamps</span>
            </div>
          </div>
        </section>

        {/* ── Bootcamps Grid ────────────────────────── */}
        <section className="space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-black text-foreground tracking-tight">Your Bootcamps</h2>
            <button
              onClick={() => router.navigate({ to: "/app/tutor-studio/create" })}
              className="flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-bold text-background shadow-lg shadow-foreground/10 transition hover:scale-105 active:scale-95"
            >
              <Plus className="h-4 w-4" /> Create
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {bootcamps.length > 0 ? bootcamps.map((course) => (
              <div
                key={course.id}
                onClick={() => { setActiveBootcampId(course.id); setActiveTab("details"); setView("editor"); }}
                className="group relative flex flex-col rounded-3xl border border-border/40 bg-card transition-all hover:border-primary/40 hover:shadow-xl hover:shadow-primary/5 cursor-pointer overflow-hidden"
              >
                {/* Thumbnail */}
                <div className="h-36 w-full bg-accent/20 relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-tr from-primary/10 to-transparent opacity-40 group-hover:opacity-80 transition-opacity" />
                  <div className="absolute top-3 right-3">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] backdrop-blur-md shadow-sm ${ course.status ==="Active" ? "bg-emerald-500/15 text-emerald-500 border border-emerald-500/25" :
                      course.status === "Draft" ? "bg-background/80 text-foreground border border-border/50" :
                      "bg-primary/15 text-primary border border-primary/25"
                    }`}>
                      {course.status === "Active" && <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                      {course.status}
                    </span>
                  </div>
                </div>

                <div className="p-5 flex-1 flex flex-col justify-between">
                  <div className="mb-4">
                    <h3 className="text-base font-black text-foreground leading-tight group-hover:text-primary transition-colors tracking-tight">{course.title}</h3>
                    <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1.5">
                      <LayoutGrid className="h-3.5 w-3.5" /> {course.category}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-border/30">
                    <div className="flex items-center gap-2.5 text-sm font-black text-foreground">
                      <div className="flex items-center gap-1.5 bg-gradient-to-r from-blue-500/10 to-transparent pl-3 pr-4 py-1.5 rounded-full text-xs border border-blue-500/10">
                        <UsersRound className="h-3.5 w-3.5 text-blue-500" />
                        <span className="text-blue-600 dark:text-blue-400">{course.students}</span>
                      </div>
                      <div className="flex items-center gap-1.5 bg-gradient-to-r from-emerald-500/10 to-transparent pl-3 pr-4 py-1.5 rounded-full text-xs border border-emerald-500/10">
                        <div className="h-4 w-4 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center text-[10px] font-black shrink-0">₦</div>
                        <span className="text-emerald-600 dark:text-emerald-400">{course.revenue}</span>
                      </div>
                    </div>
                    <div className="grid h-10 w-10 place-items-center rounded-full bg-foreground text-background shadow-md opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100 transition-all duration-300">
                      <ArrowRight className="h-4 w-4" />
                    </div>
                  </div>
                </div>
              </div>
            )) : (
              <div className="sm:col-span-2 rounded-3xl border-2 border-dashed border-border/40 bg-accent/5 p-16 flex flex-col items-center justify-center text-center">
                <div className="h-20 w-20 rounded-[28px] bg-primary/10 flex items-center justify-center mb-5">
                  <BookOpen className="h-10 w-10 text-primary" />
                </div>
                <h3 className="text-lg font-black text-foreground mb-2 tracking-tight">No Bootcamps Yet</h3>
                <p className="text-sm text-muted-foreground max-w-sm mb-8">Create your first bootcamp to start sharing your knowledge and earning.</p>
                <button
                  onClick={() => router.navigate({ to: "/app/tutor-studio/create" })}
                  className="rounded-full bg-foreground px-8 py-3.5 text-sm font-bold text-background shadow-lg transition hover:scale-105 active:scale-95"
                >
                  Create Your First Bootcamp
                </button>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
