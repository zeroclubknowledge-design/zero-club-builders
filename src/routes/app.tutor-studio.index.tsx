import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import {
  Layout, ChevronLeft, Plus, Settings, Users, Hash, UploadCloud,
  BarChart3, Calendar, DollarSign, GripVertical, MoreHorizontal, Edit3, Trash2,
  CheckCircle2, ShieldCheck, Check, Play, Clock, Filter, MessageCircle,
  UserMinus, Star, LayoutGrid, Sparkles, ArrowRight, ChevronDown, Search,
  BookOpen, Wallet, TrendingUp, Zap, Eye, GraduationCap, Megaphone, Lock, UsersRound,
  ClipboardList
} from "@/components/icons/solar";

import { useState } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getTutorBootcamps, getBootcampLearners } from "@/api";
import { useEffect } from "react";
import { uploadFile } from "@/lib/storage";
import { useWalletCurrency } from "@/hooks/useWalletCurrency";
import { ZeroFormWorkspace } from "@/features/zeroForm/ZeroFormWorkspace";
import { RichTextEditor } from "@/components/RichTextEditor";
import { LearningOperationsPanel } from "@/features/studio/LearningOperationsPanel";

export const Route = createFileRoute("/app/tutor-studio/")({
  component: TutorStudioPage,
  // `?view=zero-forms` opens the Zero Forms workspace directly, so the prompt
  // shown after creating a bootcamp can link straight into it.
  validateSearch: (search: Record<string, unknown>): { view?: string } => ({
    view: typeof search.view === "string" ? search.view : undefined,
  }),
});

function TutorStudioPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { details: currencyDetails, format, toBaseAmount, fromBaseAmount } = useWalletCurrency();
  const initialView = Route.useSearch().view === "zero-forms" ? "zero-forms" : "dashboard";
  const [view, setView] = useState<"dashboard" | "editor" | "zero-forms" | "operations">(initialView);
  const [activeTab, setActiveTab] = useState<"details" | "curriculum" | "learners" | "club">("details");
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
    coupon_discount_percent: "0",
    ends_at: ""
  });
  const [extraCoupons, setExtraCoupons] = useState<Array<{
    key: string;
    id?: string;
    code: string;
    discount_percent: string;
    label: string;
    max_uses: string;
    expires_at: string;
  }>>([]);
  const [removedCouponIds, setRemovedCouponIds] = useState<string[]>([]);

  const { data: bootcamps = [], isLoading: bootcampsLoading, error: bootcampsError, refetch: refetchBootcamps } = useQuery({
    queryKey: ['tutor-bootcamps'],
    queryFn: getTutorBootcamps,
    retry: 1,
  });
  const [bootcampFilter, setBootcampFilter] = useState<"all" | "published" | "draft">("all");

  const { data: clubCapacity } = useQuery({
    queryKey: ['tutor-club-capacity', profile?.id, profile?.tier],
    enabled: Boolean(profile?.id),
    retry: false,
    queryFn: async () => {
      const { data } = await supabase.rpc('get_my_club_capacity');
      return data as any;
    },
  });

  const { data: learners = [] } = useQuery({
    queryKey: ['bootcamp-learners', activeBootcampId],
    queryFn: () => getBootcampLearners(activeBootcampId!),
    enabled: !!activeBootcampId
  });

  // Club linked to the active bootcamp.
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

  const savedCouponsQuery = useQuery({
    queryKey: ['studio-bootcamp-coupons', activeBootcampId],
    queryFn: async () => {
      const { data } = await supabase
        .from('bootcamp_coupons')
        .select('id, code, discount_percent, label, max_uses, expires_at')
        .eq('bootcamp_id', activeBootcampId!)
        .order('created_at', { ascending: true });
      return data || [];
    },
    enabled: !!activeBootcampId && view === "editor",
    retry: false,
  });
  const savedCoupons = savedCouponsQuery.data;

  const { data: clubData } = useQuery({
    queryKey: ['bootcamp-club', activeBootcampId, activeBootcamp?.title],
    queryFn: async () => {
      const { data } = await supabase
        .from('clubs')
        .select('*')
        .eq('bootcamp_id', activeBootcampId!)
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

  // A cohort can run several reps — one per track, per time zone, per shift.
  // This used to be a single find(), which is why assigning a second rep
  // silently demoted the first.
  const studyReps = clubMembers.filter((m: any) => m.role === 'Study Rep');
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

  /*
   * Add or remove a rep, leaving the others alone.
   *
   * The drawer stays open afterwards: appointing reps is usually done a few at
   * a time, and closing after each one made adding a second person feel like
   * the app was fighting you.
   */
  const handleToggleRep = async (member: any) => {
    const isRep = member.role === 'Study Rep';
    const ok = await updateMemberRole(member.profile_id, isRep ? 'Member' : 'Study Rep');
    if (ok) toast.success(isRep ? 'Study Rep removed' : 'Study Rep added');
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
      price: String(fromBaseAmount(activeBootcamp.price || 0)),
      status: activeBootcamp.status || "active",
      visibility: activeBootcamp.visibility ?? true,
      banner_url: activeBootcamp.banner_url || "",
      video_url: activeBootcamp.video_url || "",
      coupon_code: activeBootcamp.coupon_code || "",
      coupon_discount_percent: String(activeBootcamp.coupon_discount_percent || "0"),
      ends_at: activeBootcamp.ends_at ? String(activeBootcamp.ends_at).slice(0, 10) : ""
    });
    setBannerUrl(activeBootcamp.banner_url || null);
    setBootcampBannerFile(null);
    setVideoPreviewUrl(activeBootcamp.video_url || null);
    setBootcampVideoFile(null);
  }, [activeBootcamp?.id]);

  useEffect(() => {
    if (!activeBootcamp) return;
    const primaryCode = String(activeBootcamp.coupon_code || "").toUpperCase();
    setExtraCoupons(
      (savedCoupons || [])
        .filter((coupon: any) => String(coupon.code || "").toUpperCase() !== primaryCode)
        .map((coupon: any) => ({
          key: coupon.id,
          id: coupon.id,
          code: coupon.code || "",
          discount_percent: String(coupon.discount_percent ?? 10),
          label: coupon.label || "",
          max_uses: coupon.max_uses ? String(coupon.max_uses) : "",
          expires_at: coupon.expires_at ? String(coupon.expires_at).slice(0, 10) : "",
        })),
    );
    setRemovedCouponIds([]);
  }, [activeBootcamp?.id, savedCoupons]);

  // Fetch profile (used for role checks)
  useEffect(() => {
    async function loadProfile() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
        if (data) {
          setProfile(data);
        }
      }
    }
    loadProfile();
  }, []);

  const handleSaveBootcampSettings = async () => {
    if (!activeBootcampId) return;

    if (bootcampSettings.ends_at && activeBootcamp?.starts_at) {
      const selectedEnd = new Date(`${bootcampSettings.ends_at}T23:59:59.999`);
      if (selectedEnd < new Date(activeBootcamp.starts_at)) {
        toast.error("The bootcamp end date must be on or after its start date");
        return;
      }
    }

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
        price: toBaseAmount(Number(bootcampSettings.price) || 0),
        status: bootcampSettings.status,
        visibility: bootcampSettings.visibility,
        banner_url: savedBannerUrl || null,
        video_url: savedVideoUrl || null,
        coupon_code: code || null,
        coupon_discount_percent: code ? discount : 0,
        ends_at: bootcampSettings.ends_at
          ? new Date(`${bootcampSettings.ends_at}T23:59:59.999`).toISOString()
          : null
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

    const primaryCoupon = (savedCoupons || []).find(
      (coupon: any) => String(coupon.code || "").toUpperCase() === String(activeBootcamp?.coupon_code || "").toUpperCase(),
    );
    const couponIdsToRemove = Array.from(new Set([
      ...removedCouponIds,
      ...(!code && primaryCoupon?.id ? [primaryCoupon.id] : []),
    ]));

    if (couponIdsToRemove.length > 0) {
      const { error: removeCouponError } = await supabase
        .from('bootcamp_coupons')
        .delete()
        .in('id', couponIdsToRemove);
      if (removeCouponError) {
        toast.error(`Bootcamp saved, but a coupon could not be removed: ${removeCouponError.message}`);
        return;
      }
    }

    const couponRows = [
      ...(code ? [{
        ...(primaryCoupon?.id ? { id: primaryCoupon.id } : {}),
        bootcamp_id: activeBootcampId,
        code,
        discount_percent: discount,
        label: primaryCoupon?.label || 'Primary coupon',
        max_uses: primaryCoupon?.max_uses || null,
        expires_at: primaryCoupon?.expires_at || null,
      }] : []),
      ...extraCoupons
        .filter((coupon) => coupon.code.trim())
        .map((coupon) => ({
        ...(coupon.id ? { id: coupon.id } : {}),
        bootcamp_id: activeBootcampId,
        code: coupon.code.trim().toUpperCase(),
        discount_percent: Math.min(100, Math.max(0, Number(coupon.discount_percent) || 0)),
        label: coupon.label.trim() || null,
        max_uses: coupon.max_uses ? Number(coupon.max_uses) : null,
        expires_at: coupon.expires_at
          ? new Date(`${coupon.expires_at}T23:59:59.999`).toISOString()
          : null,
        })),
    ];

    if (couponRows.length > 0) {
      const { error: couponError } = await supabase
        .from('bootcamp_coupons')
        .upsert(couponRows, { onConflict: 'id' });
      if (couponError) {
        toast.error(`Bootcamp saved, but the coupon codes could not be saved: ${couponError.message}`);
        return;
      }
    }

    setRemovedCouponIds([]);

    const { error: clubError } = await supabase
      .from('clubs')
      .update({
        name: bootcampSettings.title,
        description: bootcampSettings.description,
        price: toBaseAmount(Number(bootcampSettings.price) || 0),
        banner_url: savedBannerUrl || null,
      })
      .eq('bootcamp_id', activeBootcampId);

    if (clubError) {
      toast.error(`Bootcamp saved, but its club could not be updated: ${clubError.message}`);
      return;
    }

    toast.success("Bootcamp settings saved");
    queryClient.invalidateQueries({ queryKey: ['bootcamp-curriculum', activeBootcampId] });
    queryClient.invalidateQueries({ queryKey: ['tutor-bootcamps'] });
    queryClient.invalidateQueries({ queryKey: ['studio-bootcamp-coupons', activeBootcampId] });
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
      // Run the delete with the signed-in browser session and request the
      // deleted row back. Supabase can return no error when row-level security
      // blocks a delete, so an empty result must not be reported as success.
      const { data, error } = await supabase
        .from('bootcamps')
        .delete()
        .eq('id', id)
        .select('id');

      if (error) throw error;
      if (!data?.some((bootcamp: { id: string }) => bootcamp.id === id)) {
        throw new Error("Bootcamp was not deleted. Only its creator can delete it.");
      }

      return id;
    },
    onSuccess: (deletedId) => {
      queryClient.setQueryData<any[]>(['tutor-bootcamps'], (current = []) =>
        current.filter((bootcamp) => bootcamp.id !== deletedId)
      );
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

  const totalLearners = bootcamps.reduce(
    (total: number, bootcamp: any) => total + Number(bootcamp.enrollments?.[0]?.count || 0),
    0
  );
  const totalRevenue = bootcamps.reduce(
    (total: number, bootcamp: any) =>
      total + Number(bootcamp.price || 0) * Number(bootcamp.enrollments?.[0]?.count || 0),
    0
  );
  const isPublished = (bootcamp: any) => String(bootcamp.status || "").toLowerCase() === "active";
  const activeBootcamps = bootcamps.filter(isPublished).length;
  const draftBootcamps = Math.max(bootcamps.length - activeBootcamps, 0);

  const visibleBootcamps = bootcamps.filter((bootcamp: any) =>
    bootcampFilter === "all" ? true : bootcampFilter === "published" ? isPublished(bootcamp) : !isPublished(bootcamp),
  );

  // ═══════════════════════════════════════════════════════════════
  // ZERO FORMS VIEW
  // ═══════════════════════════════════════════════════════════════
  if (view === "zero-forms") {
    return (
      <div className="flex min-h-screen flex-col bg-background pb-20">
        <header className="sticky top-0 z-40 flex items-center gap-3 border-b hairline bg-background/85 px-5 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur-xl">
          <button
            onClick={() => setView("dashboard")}
            className="grid h-9 w-9 place-items-center rounded-full ring-1 ring-border text-foreground tap hover:bg-foreground/[0.04]"
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={2} />
          </button>
          <div>
            <p className="text-[10px] font-medium uppercase text-muted-foreground">Tutor Studio</p>
            <h1 className="text-[17px] font-semibold tracking-tight">Zero Forms</h1>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1080px] px-4 py-6 sm:px-6">
          <ZeroFormWorkspace ownerLabel="Tutor Studio" />
        </main>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // TEACHING OPERATIONS VIEW
  // ═══════════════════════════════════════════════════════════════
  if (view === "operations") {
    return (
      <div className="min-h-screen bg-background pb-24">
        <header className="sticky top-0 z-40 border-b hairline bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
          <div className="mx-auto flex max-w-[1240px] items-center gap-3 px-4 py-3.5 md:px-7">
            <button onClick={() => setView("dashboard")} className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-card text-foreground hover:bg-muted">
              <ChevronLeft className="h-[18px] w-[18px]" />
            </button>
            <div>
              <p className="text-[10px] font-medium uppercase text-muted-foreground">Tutor Studio</p>
              <h1 className="text-[19px] font-semibold tracking-tight">Teaching operations</h1>
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1240px] px-4 py-6 md:px-7 md:py-8">
          {profile?.id ? (
            <LearningOperationsPanel mode="tutor" profileId={profile.id} bootcamps={bootcamps} />
          ) : (
            <div className="flex min-h-[280px] items-center justify-center"><div className="h-1 w-24 overflow-hidden rounded-full bg-foreground/[0.06]"><div className="h-full w-1/3 animate-progress rounded-full bg-primary" /></div></div>
          )}
        </main>
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
        <div className="w-full px-5 py-4 md:px-8">
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
        {/* No max-width. This is a workspace: the curriculum builder, the
            learner list and the settings form should use whatever room the
            window gives them, the way the institution studio already does. */}
        <div className="w-full px-5 md:px-8">

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
                        <img src={learner.profiles.avatar_url} alt={learner.profiles.full_name} className="h-12 w-12 rounded-2xl object-cover border border-border/40" loading="lazy" decoding="async" />
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
              <section className="relative overflow-hidden">
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
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-card">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="h-11 w-11 rounded-full bg-amber-500/8 ring-1 ring-amber-500/15 grid place-items-center text-amber-600 dark:text-amber-400 shrink-0">
                        <Star className="h-5 w-5" strokeWidth={1.75} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13.5px] font-semibold tracking-tight text-foreground">Study Reps</p>
                        {studyReps.length > 0 ? (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            <span className="font-medium text-foreground">
                              {studyReps.map((rep: any) => rep.profiles?.full_name || rep.profiles?.username).join(", ")}
                            </span>{" "}
                            {studyReps.length === 1 ? "oversees" : "oversee"} daily activities
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground mt-0.5">None yet — pick members to lead daily activities</p>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      {studyReps.length > 0 && (
                        <span className="rounded-full px-3 py-1.5 text-xs font-semibold tracking-tight text-foreground ring-1 ring-border tabular-nums">
                          {studyReps.length} {studyReps.length === 1 ? "rep" : "reps"}
                        </span>
                      )}
                      <button
                        onClick={() => setRoleDrawer("rep")}
                        className="shrink-0 px-4 py-2 rounded-full ring-1 ring-border text-xs font-semibold tracking-tight text-foreground hover:bg-foreground/[0.04] tap"
                      >
                        {studyReps.length > 0 ? "Manage reps" : "Assign reps"}
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-card">
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
                <DrawerContent className="mx-auto max-w-lg border-none bg-background px-4 pb-4 pt-1 focus:ring-0 sm:p-6">
                  <DrawerTitle className="text-[17px] font-semibold tracking-tight text-foreground sm:text-[20px]">
                    {roleDrawer === "rep" ? "Study Reps" : "Manage administrators"}
                  </DrawerTitle>
                  <p className="mt-1 text-[13px] text-muted-foreground">
                    {roleDrawer === "rep"
                      ? "Reps oversee daily activities and answer questions. Appoint as many as the cohort needs — tap a rep again to step them down."
                      : "Administrators can moderate the club chat and manage members. Promote as many as you need."}
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
                                <img src={member.profiles.avatar_url} className="h-full w-full object-cover" loading="lazy" decoding="async" />
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
                            <button
                              onClick={() => handleToggleRep(member)}
                              disabled={busy || updatingMemberId !== null}
                              className={`shrink-0 rounded-full px-4 py-1.5 text-[11.5px] font-semibold tracking-tight tap disabled:opacity-40 ${
                                isRep
                                  ? "bg-primary/8 text-primary ring-1 ring-primary/15 hover:bg-primary/[0.14]"
                                  : "bg-foreground text-background hover:opacity-90"
                              }`}
                            >
                              {busy ? "Saving…" : isRep ? (
                                <span className="flex items-center gap-1"><Check className="h-3 w-3" strokeWidth={2.5} /> Rep</span>
                              ) : "Make Rep"}
                            </button>
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
              <section>
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
            <div className="w-full space-y-8 pb-10">
              <div className="pb-5 border-b border-border/40">
                <h2 className="text-[19px] font-semibold text-foreground tracking-tight">Bootcamp Details</h2>
                <p className="text-xs text-muted-foreground mt-1">Edit the page learners see before enrolling.</p>
              </div>

              {/* The card that used to wrap this whole form is gone. It added a
                  ring, a shadow and 24px of padding on every side for no
                  purpose — the form is the entire tab, so there was nothing for
                  it to separate the form from. The fields now sit on the page. */}
              <div className="space-y-6">
                {/* Cover */}
                <div className="space-y-3">
                  <label className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground ml-1">Cover Image</label>
                  {/* Taller now that it has the full width to sit in — at 192px a
                      full-bleed cover reads as a letterbox strip. */}
                  <label className="group border-2 border-dashed border-border/50 rounded-3xl h-56 md:h-72 xl:h-80 flex flex-col items-center justify-center text-muted-foreground hover:border-primary/40 transition-all cursor-pointer relative overflow-hidden bg-accent/10">
                    {(bannerUrl || bootcampSettings.banner_url) && (
                      <>
                        <img src={bannerUrl || bootcampSettings.banner_url} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" decoding="async" />
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
                    className="w-full bg-card rounded-2xl px-5 py-4 text-base font-bold text-foreground outline-none focus:ring-2 focus:ring-primary/40 transition placeholder:text-muted-foreground/40"
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
                        className="w-full appearance-none bg-card rounded-2xl px-5 py-4 pr-10 text-sm font-bold text-foreground outline-none focus:ring-2 focus:ring-primary/40 transition"
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
                        className="w-full appearance-none bg-card rounded-2xl px-5 py-4 pr-10 text-sm font-bold text-foreground outline-none focus:ring-2 focus:ring-primary/40 transition"
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
                  <RichTextEditor
                    value={bootcampSettings.description}
                    onChange={(html) => setBootcampSettings({ ...bootcampSettings, description: html })}
                    placeholder="Describe what learners will learn. Use bold and bullets to organise it..."
                    minHeight={200}
                  />
                </div>

                {/* Video / Visibility */}
                {/* Was a bordered box drawn in the page's own colour — a card
                    that separated nothing from anything. */}
                <div className="space-y-5">
                  <div className="space-y-3">
                    <label className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground ml-1">Preview Video</label>
                    <label className="group border-2 border-dashed border-border/50 rounded-3xl h-56 md:h-72 xl:h-80 flex flex-col items-center justify-center text-muted-foreground hover:border-primary/40 transition-all cursor-pointer relative overflow-hidden bg-accent/10">
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

                  <div className="space-y-3 rounded-2xl border border-border/40 bg-card px-5 py-4">
                    <div className="flex items-center gap-3">
                      <Calendar className="h-5 w-5 shrink-0 text-muted-foreground/60" />
                      <div className="min-w-0 flex-1">
                        <label htmlFor="bootcamp-end-date" className="text-sm font-bold text-foreground">Bootcamp end date</label>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">The Bootcamp Club becomes read-only after this date.</p>
                      </div>
                    </div>
                    <input
                      id="bootcamp-end-date"
                      type="date"
                      value={bootcampSettings.ends_at}
                      onChange={(e) => setBootcampSettings({ ...bootcampSettings, ends_at: e.target.value })}
                      className="w-full rounded-2xl bg-background px-5 py-3.5 text-sm font-semibold text-foreground outline-none ring-1 ring-border transition focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                </div>

                {/* Price / Capacity */}
                <div className="grid grid-cols-2 gap-5">
                  <div className="space-y-3">
                    <label className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground ml-1">Price ({currencyDetails.symbol})</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-muted-foreground/60">{currencyDetails.symbol}</span>
                      <input
                        type="number"
                        value={bootcampSettings.price}
                        onChange={(e) => setBootcampSettings({ ...bootcampSettings, price: e.target.value })}
                        className="w-full bg-card rounded-2xl pl-12 pr-5 py-4 text-sm font-bold text-foreground outline-none focus:ring-2 focus:ring-primary/40 transition"
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
                        className="w-full bg-card rounded-2xl pl-12 pr-5 py-4 text-sm font-bold text-foreground outline-none focus:ring-2 focus:ring-primary/40 transition"
                      />
                    </div>
                  </div>
                </div>

                {/* Coupon */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h3 className="text-[13.5px] font-semibold tracking-tight text-foreground">Coupons</h3>
                      <p className="mt-1 text-xs text-muted-foreground">Add discount codes learners can apply on the bootcamp details footer.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setExtraCoupons((current) => [
                        ...current,
                        { key: `new-${Date.now()}`, code: "", discount_percent: "10", label: "", max_uses: "", expires_at: "" },
                      ])}
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border bg-card text-foreground transition hover:bg-accent"
                      aria-label="Add another coupon code"
                      title="Add another coupon code"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
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

                  {extraCoupons.map((coupon, index) => {
                    const patchCoupon = (changes: Partial<typeof coupon>) =>
                      setExtraCoupons((current) => current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, ...changes } : item
                      ));

                    return (
                      <div key={coupon.key} className="space-y-3 rounded-2xl border border-border/60 bg-card p-4">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={coupon.code}
                            onChange={(e) => patchCoupon({ code: e.target.value.toUpperCase() })}
                            placeholder="PARTNER20"
                            className="min-w-0 flex-1 rounded-xl bg-background px-4 py-3 text-sm font-semibold text-foreground outline-none ring-1 ring-border focus:ring-2 focus:ring-primary/40"
                          />
                          <div className="relative w-24 shrink-0">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={coupon.discount_percent}
                              onChange={(e) => patchCoupon({ discount_percent: e.target.value })}
                              className="w-full rounded-xl bg-background px-4 py-3 pr-8 text-sm font-semibold text-foreground outline-none ring-1 ring-border focus:ring-2 focus:ring-primary/40"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">%</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              if (coupon.id) setRemovedCouponIds((ids) => [...ids, coupon.id!]);
                              setExtraCoupons((current) => current.filter((_, itemIndex) => itemIndex !== index));
                            }}
                            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                            aria-label="Remove this coupon"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                          <input
                            value={coupon.label}
                            onChange={(e) => patchCoupon({ label: e.target.value })}
                            placeholder="Package name"
                            className="rounded-xl bg-background px-3 py-2.5 text-xs text-foreground outline-none ring-1 ring-border focus:ring-2 focus:ring-primary/40"
                          />
                          <input
                            type="number"
                            min="1"
                            value={coupon.max_uses}
                            onChange={(e) => patchCoupon({ max_uses: e.target.value })}
                            placeholder="Max uses"
                            className="rounded-xl bg-background px-3 py-2.5 text-xs text-foreground outline-none ring-1 ring-border focus:ring-2 focus:ring-primary/40"
                          />
                          <input
                            type="date"
                            value={coupon.expires_at}
                            onChange={(e) => patchCoupon({ expires_at: e.target.value })}
                            aria-label="Coupon expiry date"
                            className="rounded-xl bg-background px-3 py-2.5 text-xs text-foreground outline-none ring-1 ring-border focus:ring-2 focus:ring-primary/40"
                          />
                        </div>
                      </div>
                    );
                  })}
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
    <div className="min-h-screen bg-background pb-24">
      {/* ── Header ────────────────────────── */}
      <div className="sticky top-0 z-30 w-full border-b hairline bg-background/95 px-4 pb-3 pt-[calc(0.85rem+env(safe-area-inset-top))] backdrop-blur-xl md:px-7">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase text-muted-foreground">Tutor workspace</p>
            <h1 className="mt-0.5 font-display text-[23px] font-semibold tracking-tight text-foreground md:text-[26px]">Tutor Studio</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/app/tutor-studio/settings"
              aria-label="Studio settings"
              className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-card text-foreground tap hover:bg-muted"
            >
              <Settings className="h-[18px] w-[18px]" strokeWidth={2} />
            </Link>
            <button
              onClick={() => router.navigate({ to: "/app/tutor-studio/create" })}
              className="flex h-10 items-center gap-2 rounded-lg bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground tap hover:opacity-90 md:px-4"
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              <span className="hidden sm:inline">New bootcamp</span>
              <span className="sm:hidden">New</span>
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto mt-5 max-w-[1180px] space-y-6 px-4 md:px-7 md:pb-12">
        <section className="overflow-hidden rounded-lg bg-[#171218] text-white ring-1 ring-white/[0.06]">
          <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1.4fr_1fr] lg:p-8">
            <div className="max-w-2xl">
              <div className="mb-5 grid h-10 w-10 place-items-center rounded-lg bg-[#cc208f] text-white">
                <GraduationCap className="h-5 w-5" strokeWidth={2.2} />
              </div>
              <p className="text-[11px] font-medium uppercase text-white/55">Your teaching business</p>
              <h2 className="mt-2 font-display text-[25px] font-semibold tracking-tight sm:text-[31px]">Build excellent learning experiences.</h2>
              <p className="mt-3 max-w-xl text-[13.5px] leading-relaxed text-white/60">Manage curriculum, learners, pricing, coupons, and the community around every cohort from one studio.</p>
            </div>
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-white/10 ring-1 ring-white/10">
              <div className="bg-white/[0.04] p-4 sm:p-5">
                <p className="text-[10px] font-medium uppercase text-white/45">Learners</p>
                <p className="mt-2 text-[25px] font-semibold tabular-nums">{totalLearners.toLocaleString()}</p>
              </div>
              <div className="bg-white/[0.04] p-4 sm:p-5">
                <p className="text-[10px] font-medium uppercase text-white/45">Active cohorts</p>
                <p className="mt-2 text-[25px] font-semibold tabular-nums">{activeBootcamps}</p>
              </div>
              <div className="col-span-2 bg-white/[0.04] p-4 sm:p-5">
                <p className="text-[10px] font-medium uppercase text-white/45">Gross enrollment value</p>
                <p className="mt-2 text-[25px] font-semibold tabular-nums">{format(totalRevenue)}</p>
              </div>
            </div>
          </div>
        </section>
        {/* The capacity strip was a full-bleed band with a rule above and below
            — the one thing on this page that was not a card, which is why it
            kept its square corners while everything around it rounded. */}
        {clubCapacity && (
          <section className="flex flex-col gap-3 rounded-2xl bg-card px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.11em] text-primary">Permanent Club capacity</p>
              <p className="mt-1 text-[13px] font-semibold">{clubCapacity.permanent_club_count} / {clubCapacity.permanent_club_limit ?? "organisation-specific"} Clubs</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">Temporary Bootcamp cohort Clubs are excluded.</p>
            </div>
            <Link to="/app/clubs" className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border px-3 text-[10.5px] font-semibold">Manage Clubs <ArrowRight className="h-3.5 w-3.5" /></Link>
          </section>
        )}
        {/* ── Quick Stats ────────────────────────── */}
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-lg border border-border bg-card p-4 sm:p-5">
            <div className="flex items-center gap-2.5 text-muted-foreground">
              <Wallet className="h-4 w-4" strokeWidth={1.75} />
              <span className="text-[11px] font-medium uppercase">Enrollment value</span>
            </div>
            <p className="mt-3 font-display text-[24px] font-semibold leading-none tabular-nums text-foreground">{format(totalRevenue, { notation: "compact", maximumFractionDigits: 1 })}</p>
            <div className="flex items-center gap-1.5 mt-2.5 text-success">
              <TrendingUp className="h-3 w-3" />
              <span className="text-[11px] font-medium">From enrollments</span>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card p-4 sm:p-5">
            <div className="flex items-center gap-2.5 text-muted-foreground">
              <Users className="h-4 w-4" strokeWidth={1.75} />
              <span className="text-[11px] font-medium uppercase">Learners</span>
            </div>
            <p className="mt-3 font-display text-[24px] font-semibold leading-none tabular-nums text-foreground">{totalLearners.toLocaleString()}</p>
            <div className="flex items-center gap-1.5 mt-2.5 text-muted-foreground">
              <span className="text-[11px] font-medium">Across all bootcamps</span>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card p-4 sm:p-5">
            <div className="flex items-center gap-2.5 text-muted-foreground">
              <BookOpen className="h-4 w-4" strokeWidth={1.75} />
              <span className="text-[11px] font-medium uppercase">Bootcamps</span>
            </div>
            <p className="mt-3 font-display text-[24px] font-semibold leading-none tabular-nums text-foreground">{bootcamps.length}</p>
            <div className="flex items-center gap-1.5 mt-2.5 text-muted-foreground">
              <span className="text-[11px] font-medium">Published & drafts</span>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card p-4 sm:p-5">
            <div className="flex items-center gap-2.5 text-muted-foreground">
              <Zap className="h-4 w-4" strokeWidth={1.75} />
              <span className="text-[11px] font-medium uppercase">Active</span>
            </div>
            <p className="mt-3 font-display text-[24px] font-semibold leading-none tabular-nums text-foreground">{activeBootcamps}</p>
            <div className="flex items-center gap-1.5 mt-2.5 text-muted-foreground">
              <span className="text-[11px] font-medium">{draftBootcamps} in draft</span>
            </div>
          </div>
        </section>

        {/* ── Zero Forms: a proper entry point, not a button squeezed
               beside a count ────────────────────────── */}
        <button
          onClick={() => setView("zero-forms")}
          className="group flex w-full items-center gap-4 rounded-lg border border-border bg-card p-4 text-left transition-all hover:border-primary/35 hover:shadow-soft sm:p-5"
        >
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary sm:h-12 sm:w-12">
            <ClipboardList className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[15px] font-semibold tracking-tight">Zero Forms</h3>
              <span className="rounded-full bg-primary/[0.09] px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.1em] text-primary">
                Pre-registration
              </span>
            </div>
            <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
              Collect learners and early-bird payments before your bootcamp starts.
            </p>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
        </button>

        <button
          onClick={() => setView("operations")}
          className="group flex w-full items-center gap-4 rounded-lg border border-border bg-card p-4 text-left transition-all hover:border-primary/35 hover:shadow-soft sm:p-5"
        >
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary sm:h-12 sm:w-12">
            <UsersRound className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[15px] font-semibold tracking-tight">Teaching operations</h3>
              <span className="rounded-full bg-primary/[0.09] px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.1em] text-primary">Admin panel</span>
            </div>
            <p className="mt-1 text-[12px] leading-5 text-muted-foreground">Manage cohorts, learner progress, schedules, announcements, and assessments.</p>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
        </button>

        {/* ── Bootcamps Grid ────────────────────────── */}
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-[19px] font-semibold tracking-tight text-foreground">Bootcamps</h2>
              <p className="mt-1 text-[12px] text-muted-foreground">Select a bootcamp to edit every part of it.</p>
            </div>
            <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">{bootcamps.length} total</span>
          </div>

          {/* Published vs draft, so a live bootcamp is easy to find. */}
          <div className="flex flex-wrap gap-1.5">
            {([
              ["all", "All", bootcamps.length],
              ["published", "Published", activeBootcamps],
              ["draft", "Drafts", draftBootcamps],
            ] as const).map(([key, label, count]) => (
              <button
                key={key}
                onClick={() => setBootcampFilter(key as any)}
                className={`h-9 rounded-md border px-3 text-[11.5px] font-semibold transition ${bootcampFilter === key ? "border-foreground bg-foreground text-background" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}
              >
                {label} <span className="tabular-nums opacity-70">{count}</span>
              </button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {bootcampsLoading ? (
              <div className="sm:col-span-2 xl:col-span-3 rounded-lg border border-border bg-card p-10 text-center text-[13px] text-muted-foreground">Loading your studio...</div>
            ) : bootcampsError ? (
              <div className="sm:col-span-2 xl:col-span-3 rounded-lg border border-destructive/30 bg-destructive/[0.04] p-8 text-center">
                <p className="text-[13px] font-semibold text-destructive">Your bootcamps could not be loaded</p>
                <p className="mx-auto mt-1.5 max-w-md text-[11.5px] leading-5 text-muted-foreground">
                  {(bootcampsError as any)?.message || "Something went wrong. Please try again."}
                </p>
                <button onClick={() => refetchBootcamps()} className="mt-4 rounded-md bg-foreground px-4 py-2 text-[12px] font-semibold text-background">
                  Try again
                </button>
              </div>
            ) : visibleBootcamps.length > 0 ? visibleBootcamps.map((course) => (
              <div
                key={course.id}
                onClick={() => { setActiveBootcampId(course.id); setActiveTab("details"); setView("editor"); }}
                className="group relative flex cursor-pointer flex-col overflow-hidden rounded-lg border border-border bg-card transition-all hover:border-primary/35 hover:shadow-soft"
              >
                {/* Thumbnail */}
                <div className="relative h-36 w-full overflow-hidden bg-muted">
                  {course.banner_url && (
                    <img src={course.banner_url} alt={course.title} className="absolute inset-0 w-full h-full object-cover" loading="lazy" decoding="async" />
                  )}
                  {course.creator_id !== profile?.id && (
                    <div className="absolute top-3 left-3">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-primary text-primary-foreground shadow-sm uppercase tracking-wide">
                        Assigned
                      </span>
                    </div>
                  )}
                  <div className="absolute top-3 right-3">
                    <span className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[10px] font-medium backdrop-blur-md ${String(course.status || "").toLowerCase() === "active" ? "bg-black/60 text-white ring-1 ring-white/20" :
                      "bg-black/50 text-white/80 ring-1 ring-white/15"
                    }`}>
                      {String(course.status || "").toLowerCase() === "active" && <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
                      {course.status}
                    </span>
                  </div>
                </div>

                <div className="flex flex-1 flex-col justify-between p-4">
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
                    <span className="text-[13px] font-semibold tracking-tight text-foreground tabular-nums">{format(Number(course.price || 0))}</span>
                  </div>
                </div>
              </div>
            )) : (
              <div className="sm:col-span-2 xl:col-span-3 flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card p-12 text-center">
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <BookOpen className="h-6 w-6 text-muted-foreground/60" strokeWidth={1.75} />
                </div>
                <h3 className="text-[17px] font-semibold text-foreground mb-1.5 tracking-tight">
                  {bootcamps.length === 0 ? "No bootcamps yet"
                    : bootcampFilter === "published" ? "No published bootcamps"
                    : "No drafts"}
                </h3>
                <p className="text-[13.5px] text-muted-foreground max-w-sm mb-7 leading-relaxed">
                  {bootcamps.length === 0
                    ? "Create your first bootcamp to start sharing your knowledge and earning."
                    : bootcampFilter === "published"
                      ? "Your bootcamps are still drafts. Open one and set its status to Active to publish it."
                      : "Everything you have created is published."}
                </p>
                <button
                  onClick={() => router.navigate({ to: "/app/tutor-studio/create" })}
                  className="rounded-lg bg-primary px-5 py-2.5 text-[13px] font-semibold text-primary-foreground tap hover:opacity-90"
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
