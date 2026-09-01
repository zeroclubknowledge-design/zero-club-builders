import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import {
  Activity, BarChart3, Calendar, Check, ChevronRight, ClipboardList,
  Clock, GraduationCap, LayoutGrid, Loader2, Megaphone, Plus, Search,
  Trash2, UserPlus, Users, Video, X,
} from "@/components/icons/solar";

type StudioMode = "tutor" | "institution";
type OperationsTab = "cohorts" | "learners" | "schedule" | "announcements" | "assessments";

type LearningOperationsPanelProps = {
  mode: StudioMode;
  profileId: string;
  bootcamps: any[];
  tutors?: any[];
};

const fieldClass = "h-11 w-full rounded-lg border border-border bg-background px-3.5 text-[13px] text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10";
const areaClass = "w-full rounded-lg border border-border bg-background px-3.5 py-3 text-[13px] text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10";

const cohortTone = (status: string) => {
  if (status === "active") return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
  if (status === "upcoming") return "bg-blue-500/10 text-blue-600 dark:text-blue-400";
  if (status === "completed") return "bg-violet-500/10 text-violet-600 dark:text-violet-400";
  if (status === "archived") return "bg-muted text-muted-foreground";
  return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
};

const humanDate = (value?: string | null) => {
  if (!value) return "Not set";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Not set"
    : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
};

const tutorProfile = (item: any) => item?.tutor || item;
const tutorId = (item: any) => item?.tutor_id || item?.id;

export function LearningOperationsPanel({ mode, profileId, bootcamps, tutors = [] }: LearningOperationsPanelProps) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<OperationsTab>("cohorts");
  const [selectedCohortId, setSelectedCohortId] = useState<string>("");
  const [showCohortForm, setShowCohortForm] = useState(false);
  const [showSessionForm, setShowSessionForm] = useState(false);
  const [showAnnouncementForm, setShowAnnouncementForm] = useState(false);
  const [learnerSearch, setLearnerSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [cohortForm, setCohortForm] = useState({
    bootcamp_id: bootcamps[0]?.id || "",
    name: "",
    status: "upcoming",
    lead_tutor_id: "",
    starts_at: "",
    ends_at: "",
    capacity: "",
  });
  const [sessionForm, setSessionForm] = useState({
    title: "", description: "", starts_at: "", ends_at: "", meeting_url: "", location: "",
  });
  const [announcementForm, setAnnouncementForm] = useState({ title: "", body: "", is_pinned: false });

  const bootcampIds = useMemo(() => bootcamps.map((item) => item.id).filter(Boolean), [bootcamps]);
  const bootcampKey = bootcampIds.join(",");

  useEffect(() => {
    if (!cohortForm.bootcamp_id && bootcamps[0]?.id) {
      setCohortForm((current) => ({ ...current, bootcamp_id: bootcamps[0].id }));
    }
  }, [bootcamps, cohortForm.bootcamp_id]);

  const cohortsQuery = useQuery({
    queryKey: ["learning-cohorts", mode, profileId, bootcampKey],
    enabled: bootcampIds.length > 0,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("learning_cohorts")
        .select("*")
        .in("bootcamp_id", bootcampIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
  const cohorts = cohortsQuery.data || [];

  useEffect(() => {
    if (cohorts.length && !cohorts.some((item: any) => item.id === selectedCohortId)) {
      setSelectedCohortId(cohorts[0].id);
    }
  }, [cohorts, selectedCohortId]);

  const selectedCohort = cohorts.find((item: any) => item.id === selectedCohortId) || null;
  const selectedBootcamp = bootcamps.find((item) => item.id === selectedCohort?.bootcamp_id) || null;

  const membersQuery = useQuery({
    queryKey: ["learning-cohort-members", selectedCohortId],
    enabled: Boolean(selectedCohortId),
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("learning_cohort_members")
        .select("id, cohort_id, profile_id, status, progress_percent, joined_at, completed_at, last_activity_at, profiles(id, username, full_name, avatar_url)")
        .eq("cohort_id", selectedCohortId)
        .order("joined_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
  const members = membersQuery.data || [];

  const enrollmentsQuery = useQuery({
    queryKey: ["operations-enrollments", selectedCohort?.bootcamp_id],
    enabled: Boolean(selectedCohort?.bootcamp_id),
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enrollments")
        .select("profile_id, enrolled_at, profiles(id, username, full_name, avatar_url)")
        .eq("bootcamp_id", selectedCohort.bootcamp_id)
        .order("enrolled_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
  const enrollments = enrollmentsQuery.data || [];

  const sessionsQuery = useQuery({
    queryKey: ["learning-sessions", selectedCohortId],
    enabled: Boolean(selectedCohortId),
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("learning_sessions")
        .select("*")
        .eq("cohort_id", selectedCohortId)
        .order("starts_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });
  const sessions = sessionsQuery.data || [];

  const announcementsQuery = useQuery({
    queryKey: ["learning-announcements", selectedCohortId],
    enabled: Boolean(selectedCohortId),
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("learning_announcements")
        .select("*")
        .eq("cohort_id", selectedCohortId)
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
  const announcements = announcementsQuery.data || [];

  const clubQuery = useQuery({
    queryKey: ["operations-cohort-club", selectedCohort?.bootcamp_id],
    enabled: Boolean(selectedCohort?.bootcamp_id),
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clubs")
        .select("id, name")
        .eq("bootcamp_id", selectedCohort.bootcamp_id)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const quizzesQuery = useQuery({
    queryKey: ["operations-assessments", clubQuery.data?.id],
    enabled: Boolean(clubQuery.data?.id),
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("club_quizzes")
        .select("id, title, is_published, opens_at, closes_at, club_quiz_attempts(count)")
        // `enabled` above already guarantees this, but the type does not know
        // that — the query only runs once the club has resolved.
        .eq("club_id", clubQuery.data!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
  const quizzes = quizzesQuery.data || [];

  const invalidateCohorts = () => queryClient.invalidateQueries({ queryKey: ["learning-cohorts"] });
  const invalidateMembers = () => queryClient.invalidateQueries({ queryKey: ["learning-cohort-members", selectedCohortId] });

  const createCohort = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!cohortForm.bootcamp_id || !cohortForm.name.trim()) return;
    if (cohortForm.starts_at && cohortForm.ends_at && new Date(cohortForm.ends_at) < new Date(cohortForm.starts_at)) {
      toast.error("The cohort end date must be after its start date");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from("learning_cohorts")
      .insert({
        bootcamp_id: cohortForm.bootcamp_id,
        created_by: profileId,
        lead_tutor_id: cohortForm.lead_tutor_id || null,
        name: cohortForm.name.trim(),
        status: cohortForm.status,
        starts_at: cohortForm.starts_at ? new Date(cohortForm.starts_at).toISOString() : null,
        ends_at: cohortForm.ends_at ? new Date(cohortForm.ends_at).toISOString() : null,
        capacity: cohortForm.capacity ? Number(cohortForm.capacity) : null,
      })
      .select()
      .single();
    setSaving(false);
    if (error) {
      toast.error(error.message || "The cohort could not be created");
      return;
    }
    toast.success("Cohort created");
    setShowCohortForm(false);
    setSelectedCohortId(data.id);
    setCohortForm({ bootcamp_id: cohortForm.bootcamp_id, name: "", status: "upcoming", lead_tutor_id: "", starts_at: "", ends_at: "", capacity: "" });
    invalidateCohorts();
  };

  const updateCohort = async (updates: Record<string, any>) => {
    if (!selectedCohortId) return;
    const { error } = await supabase.from("learning_cohorts").update(updates).eq("id", selectedCohortId);
    if (error) toast.error(error.message || "Cohort update failed");
    else { toast.success("Cohort updated"); invalidateCohorts(); }
  };

  const deleteCohort = async () => {
    if (!selectedCohort || !confirm(`Delete “${selectedCohort.name}”? Its schedule and announcements will also be removed.`)) return;
    const { error } = await supabase.from("learning_cohorts").delete().eq("id", selectedCohort.id);
    if (error) toast.error(error.message || "Cohort could not be deleted");
    else { toast.success("Cohort deleted"); setSelectedCohortId(""); invalidateCohorts(); }
  };

  const toggleLearner = async (enrollment: any) => {
    if (!selectedCohortId) return;
    const existing = members.find((item: any) => item.profile_id === enrollment.profile_id);
    if (existing) {
      const { error } = await supabase.from("learning_cohort_members").delete().eq("id", existing.id);
      if (error) toast.error(error.message || "Learner could not be removed");
      else { toast.success("Learner removed from cohort"); invalidateMembers(); }
      return;
    }
    if (selectedCohort?.capacity && members.length >= selectedCohort.capacity) {
      toast.error("This cohort has reached its learner capacity");
      return;
    }
    const { error } = await supabase.from("learning_cohort_members").insert({ cohort_id: selectedCohortId, profile_id: enrollment.profile_id });
    if (error) toast.error(error.message || "Learner could not be assigned");
    else { toast.success("Learner added to cohort"); invalidateMembers(); }
  };

  const updateMember = async (memberId: string, updates: Record<string, any>) => {
    const { error } = await supabase.from("learning_cohort_members").update(updates).eq("id", memberId);
    if (error) toast.error(error.message || "Learner progress could not be updated");
    else invalidateMembers();
  };

  const createSession = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedCohortId || !sessionForm.title.trim() || !sessionForm.starts_at) return;
    if (sessionForm.ends_at && new Date(sessionForm.ends_at) < new Date(sessionForm.starts_at)) {
      toast.error("The session must end after it starts");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("learning_sessions").insert({
      cohort_id: selectedCohortId,
      created_by: profileId,
      title: sessionForm.title.trim(),
      description: sessionForm.description.trim() || null,
      starts_at: new Date(sessionForm.starts_at).toISOString(),
      ends_at: sessionForm.ends_at ? new Date(sessionForm.ends_at).toISOString() : null,
      meeting_url: sessionForm.meeting_url.trim() || null,
      location: sessionForm.location.trim() || null,
    });
    setSaving(false);
    if (error) toast.error(error.message || "Session could not be scheduled");
    else {
      toast.success("Session scheduled");
      setSessionForm({ title: "", description: "", starts_at: "", ends_at: "", meeting_url: "", location: "" });
      setShowSessionForm(false);
      queryClient.invalidateQueries({ queryKey: ["learning-sessions", selectedCohortId] });
    }
  };

  const updateSessionStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("learning_sessions").update({ status }).eq("id", id);
    if (error) toast.error(error.message || "Session could not be updated");
    else queryClient.invalidateQueries({ queryKey: ["learning-sessions", selectedCohortId] });
  };

  const deleteSession = async (id: string) => {
    const { error } = await supabase.from("learning_sessions").delete().eq("id", id);
    if (error) toast.error(error.message || "Session could not be deleted");
    else queryClient.invalidateQueries({ queryKey: ["learning-sessions", selectedCohortId] });
  };

  const createAnnouncement = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedCohortId || !announcementForm.title.trim() || !announcementForm.body.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("learning_announcements").insert({
      cohort_id: selectedCohortId,
      created_by: profileId,
      title: announcementForm.title.trim(),
      body: announcementForm.body.trim(),
      is_pinned: announcementForm.is_pinned,
    });
    setSaving(false);
    if (error) toast.error(error.message || "Announcement could not be posted");
    else {
      toast.success("Announcement posted");
      setAnnouncementForm({ title: "", body: "", is_pinned: false });
      setShowAnnouncementForm(false);
      queryClient.invalidateQueries({ queryKey: ["learning-announcements", selectedCohortId] });
    }
  };

  const deleteAnnouncement = async (id: string) => {
    const { error } = await supabase.from("learning_announcements").delete().eq("id", id);
    if (error) toast.error(error.message || "Announcement could not be deleted");
    else queryClient.invalidateQueries({ queryKey: ["learning-announcements", selectedCohortId] });
  };

  const filteredEnrollments = enrollments.filter((item: any) => {
    const person = item.profiles;
    const haystack = `${person?.full_name || ""} ${person?.username || ""}`.toLowerCase();
    return haystack.includes(learnerSearch.trim().toLowerCase());
  });
  const activeMembers = members.filter((item: any) => item.status === "active").length;
  const averageProgress = members.length
    ? Math.round(members.reduce((sum: number, item: any) => sum + Number(item.progress_percent || 0), 0) / members.length)
    : 0;
  const upcomingSessions = sessions.filter((item: any) => item.status === "scheduled" && new Date(item.starts_at) >= new Date()).length;

  const tabs: Array<{ id: OperationsTab; label: string; Icon: any }> = [
    { id: "cohorts", label: "Cohorts", Icon: LayoutGrid },
    { id: "learners", label: "Learners", Icon: Users },
    { id: "schedule", label: "Schedule", Icon: Calendar },
    { id: "announcements", label: "Announcements", Icon: Megaphone },
    { id: "assessments", label: "Assessments", Icon: ClipboardList },
  ];

  if (bootcamps.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card px-6 py-14 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-primary/10 text-primary"><GraduationCap className="h-6 w-6" /></div>
        <h2 className="mt-4 text-[17px] font-semibold">Create a bootcamp first</h2>
        <p className="mx-auto mt-2 max-w-md text-[13px] leading-6 text-muted-foreground">Cohorts, learners, sessions, announcements, and assessments are organised around a bootcamp.</p>
      </div>
    );
  }

  if (cohortsQuery.isError) {
    return (
      <div className="rounded-lg border border-destructive/25 bg-destructive/[0.04] p-6">
        <h2 className="text-[16px] font-semibold text-destructive">Learning operations could not load</h2>
        <p className="mt-2 text-[13px] leading-6 text-muted-foreground">{(cohortsQuery.error as any)?.message || "Please try again after the database update has completed."}</p>
        <button onClick={() => cohortsQuery.refetch()} className="mt-4 h-10 rounded-lg bg-foreground px-4 text-[12px] font-semibold text-background">Try again</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-lg bg-[#171218] text-white ring-1 ring-white/[0.06]">
        <div className="grid grid-cols-1 gap-6 p-5 sm:p-6 lg:grid-cols-[1.4fr_1fr] lg:p-8">
          <div>
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-[#cc208f]"><Activity className="h-5 w-5" /></div>
            <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/45">{mode === "institution" ? "Digital Hub operations" : "Tutor operations"}</p>
            <h2 className="mt-2 font-display text-[25px] font-semibold tracking-tight sm:text-[30px]">Run every learning experience from one place.</h2>
            <p className="mt-3 max-w-2xl text-[13px] leading-6 text-white/60">Organise intakes, assign learners, schedule live sessions, publish updates, and follow assessment activity without leaving the studio.</p>
          </div>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-white/10 ring-1 ring-white/10">
            <div className="bg-white/[0.04] p-4"><p className="text-[9px] font-semibold uppercase text-white/40">Cohorts</p><p className="mt-2 text-[24px] font-semibold tabular-nums">{cohorts.length}</p></div>
            <div className="bg-white/[0.04] p-4"><p className="text-[9px] font-semibold uppercase text-white/40">Active learners</p><p className="mt-2 text-[24px] font-semibold tabular-nums">{activeMembers}</p></div>
            <div className="bg-white/[0.04] p-4"><p className="text-[9px] font-semibold uppercase text-white/40">Average progress</p><p className="mt-2 text-[24px] font-semibold tabular-nums">{averageProgress}%</p></div>
            <div className="bg-white/[0.04] p-4"><p className="text-[9px] font-semibold uppercase text-white/40">Upcoming sessions</p><p className="mt-2 text-[24px] font-semibold tabular-nums">{upcomingSessions}</p></div>
          </div>
        </div>
      </section>

      <div className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-card p-1 no-scrollbar">
        {tabs.map(({ id, label, Icon }) => (
          <button key={id} onClick={() => setTab(id)} className={`flex h-10 shrink-0 items-center gap-2 rounded-md px-3.5 text-[12px] font-semibold transition ${tab === id ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {tab === "cohorts" && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-[20px] font-semibold tracking-tight">Cohort management</h2><p className="mt-1 text-[12px] text-muted-foreground">Run multiple learner intakes from the same bootcamp curriculum.</p></div>
            <button onClick={() => setShowCohortForm((value) => !value)} className="flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-[12px] font-semibold text-primary-foreground"><Plus className="h-4 w-4" /> New cohort</button>
          </div>

          {showCohortForm && (
            <form onSubmit={createCohort} className="grid grid-cols-1 gap-4 rounded-lg border border-border bg-card p-5 md:grid-cols-2 lg:grid-cols-4">
              <div className="md:col-span-2"><label className="mb-1.5 block text-[10px] font-semibold uppercase text-muted-foreground">Cohort name</label><input required value={cohortForm.name} onChange={(e) => setCohortForm({ ...cohortForm, name: e.target.value })} placeholder="September Product Design Cohort" className={fieldClass} /></div>
              <div className="md:col-span-2"><label className="mb-1.5 block text-[10px] font-semibold uppercase text-muted-foreground">Bootcamp</label><select required value={cohortForm.bootcamp_id} onChange={(e) => setCohortForm({ ...cohortForm, bootcamp_id: e.target.value })} className={fieldClass}>{bootcamps.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></div>
              <div><label className="mb-1.5 block text-[10px] font-semibold uppercase text-muted-foreground">Status</label><select value={cohortForm.status} onChange={(e) => setCohortForm({ ...cohortForm, status: e.target.value })} className={fieldClass}><option value="draft">Draft</option><option value="upcoming">Upcoming</option><option value="active">Active</option><option value="completed">Completed</option></select></div>
              <div><label className="mb-1.5 block text-[10px] font-semibold uppercase text-muted-foreground">Capacity</label><input type="number" min="1" value={cohortForm.capacity} onChange={(e) => setCohortForm({ ...cohortForm, capacity: e.target.value })} placeholder="Unlimited" className={fieldClass} /></div>
              <div><label className="mb-1.5 block text-[10px] font-semibold uppercase text-muted-foreground">Starts</label><input type="datetime-local" value={cohortForm.starts_at} onChange={(e) => setCohortForm({ ...cohortForm, starts_at: e.target.value })} className={fieldClass} /></div>
              <div><label className="mb-1.5 block text-[10px] font-semibold uppercase text-muted-foreground">Ends</label><input type="datetime-local" value={cohortForm.ends_at} onChange={(e) => setCohortForm({ ...cohortForm, ends_at: e.target.value })} className={fieldClass} /></div>
              {tutors.length > 0 && <div className="md:col-span-2"><label className="mb-1.5 block text-[10px] font-semibold uppercase text-muted-foreground">Lead tutor</label><select value={cohortForm.lead_tutor_id} onChange={(e) => setCohortForm({ ...cohortForm, lead_tutor_id: e.target.value })} className={fieldClass}><option value="">Not assigned</option>{tutors.map((item: any) => { const person = tutorProfile(item); return <option key={tutorId(item)} value={tutorId(item)}>{person?.full_name || person?.username || "Tutor"}</option>; })}</select></div>}
              <div className="flex items-end gap-2 md:col-span-2"><button disabled={saving} className="flex h-11 items-center gap-2 rounded-lg bg-foreground px-5 text-[12px] font-semibold text-background disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Create cohort</button><button type="button" onClick={() => setShowCohortForm(false)} className="h-11 rounded-lg border border-border px-4 text-[12px] font-semibold">Cancel</button></div>
            </form>
          )}

          {cohortsQuery.isLoading ? <LoadingBlock /> : cohorts.length === 0 ? <EmptyBlock Icon={LayoutGrid} title="No cohorts yet" body="Create the first intake for one of your bootcamps." /> : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(250px,0.8fr)_minmax(0,1.5fr)]">
              <div className="min-w-0 space-y-2">
                {cohorts.map((item: any) => {
                  const camp = bootcamps.find((entry) => entry.id === item.bootcamp_id);
                  return <button key={item.id} onClick={() => setSelectedCohortId(item.id)} className={`w-full rounded-lg border p-4 text-left transition ${selectedCohortId === item.id ? "border-primary/35 bg-primary/[0.05]" : "border-border bg-card hover:border-foreground/15"}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-[14px] font-semibold">{item.name}</p><p className="mt-1 truncate text-[11px] text-muted-foreground">{camp?.title}</p></div><span className={`rounded-full px-2 py-1 text-[9px] font-semibold uppercase ${cohortTone(item.status)}`}>{item.status}</span></div><div className="mt-3 flex items-center gap-3 text-[10px] text-muted-foreground"><span>{humanDate(item.starts_at)}</span><span>·</span><span>{item.capacity || "∞"} seats</span></div></button>;
                })}
              </div>
              {selectedCohort && (
                <div className="min-w-0 rounded-lg border border-border bg-card p-5 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><p className="break-words text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">{selectedBootcamp?.title}</p><h3 className="mt-1 break-words text-[20px] font-semibold tracking-tight">{selectedCohort.name}</h3><p className="mt-1 text-[11px] text-muted-foreground">Cohort code: <span className="font-semibold text-foreground">{selectedCohort.code}</span></p></div><button onClick={deleteCohort} className="grid h-9 w-9 place-items-center rounded-lg border border-destructive/20 text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button></div>
                  <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Learners" value={`${members.length}${selectedCohort.capacity ? ` / ${selectedCohort.capacity}` : ""}`} /><Metric label="Average progress" value={`${averageProgress}%`} /><Metric label="Starts" value={selectedCohort.starts_at ? new Date(selectedCohort.starts_at).toLocaleDateString() : "Not set"} /><Metric label="Ends" value={selectedCohort.ends_at ? new Date(selectedCohort.ends_at).toLocaleDateString() : "Not set"} /></div>
                  <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2"><div><label className="mb-1.5 block text-[10px] font-semibold uppercase text-muted-foreground">Cohort status</label><select value={selectedCohort.status} onChange={(e) => updateCohort({ status: e.target.value })} className={fieldClass}><option value="draft">Draft</option><option value="upcoming">Upcoming</option><option value="active">Active</option><option value="completed">Completed</option><option value="archived">Archived</option></select></div>{tutors.length > 0 && <div><label className="mb-1.5 block text-[10px] font-semibold uppercase text-muted-foreground">Lead tutor</label><select value={selectedCohort.lead_tutor_id || ""} onChange={(e) => updateCohort({ lead_tutor_id: e.target.value || null })} className={fieldClass}><option value="">Not assigned</option>{tutors.map((item: any) => { const person = tutorProfile(item); return <option key={tutorId(item)} value={tutorId(item)}>{person?.full_name || person?.username || "Tutor"}</option>; })}</select></div>}</div>
                  <div className="mt-6 flex flex-wrap gap-2"><button onClick={() => setTab("learners")} className="flex h-10 items-center gap-2 rounded-lg bg-foreground px-4 text-[12px] font-semibold text-background"><Users className="h-4 w-4" /> Manage learners</button><button onClick={() => setTab("schedule")} className="flex h-10 items-center gap-2 rounded-lg border border-border px-4 text-[12px] font-semibold"><Calendar className="h-4 w-4" /> Open schedule</button></div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab !== "cohorts" && cohorts.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3.5"><div className="min-w-0"><p className="text-[9px] font-semibold uppercase text-muted-foreground">Working cohort</p><p className="truncate text-[13px] font-semibold">{selectedCohort?.name}</p></div><select value={selectedCohortId} onChange={(e) => setSelectedCohortId(e.target.value)} className="h-10 max-w-full rounded-lg border border-border bg-background px-3 text-[12px] font-semibold outline-none">{cohorts.map((item: any) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
      )}

      {tab === "learners" && selectedCohort && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-[20px] font-semibold tracking-tight">Learner roster</h2><p className="mt-1 text-[12px] text-muted-foreground">Assign enrolled learners and maintain their cohort status and progress.</p></div><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={learnerSearch} onChange={(e) => setLearnerSearch(e.target.value)} placeholder="Search learners" className="h-10 w-[230px] max-w-full rounded-lg border border-border bg-card pl-9 pr-3 text-[12px] outline-none focus:border-primary" /></div></div>
          {enrollmentsQuery.isLoading ? <LoadingBlock /> : enrollments.length === 0 ? <EmptyBlock Icon={Users} title="No enrolled learners" body="Learners will appear here after they enrol in this bootcamp." /> : (
            <div className="overflow-hidden rounded-lg border border-border bg-card"><div className="hidden grid-cols-[minmax(220px,1fr)_130px_130px_110px] gap-3 border-b border-border px-4 py-3 text-[9px] font-semibold uppercase text-muted-foreground md:grid"><span>Learner</span><span>Status</span><span>Progress</span><span className="text-right">Cohort</span></div><div className="divide-y divide-border">{filteredEnrollments.map((item: any) => { const person = item.profiles; const member = members.find((entry: any) => entry.profile_id === item.profile_id); return <div key={item.profile_id} className="grid grid-cols-1 gap-3 px-4 py-4 md:grid-cols-[minmax(220px,1fr)_130px_130px_110px] md:items-center"><div className="flex min-w-0 items-center gap-3">{person?.avatar_url ? <img src={person.avatar_url} className="h-10 w-10 rounded-lg object-cover" loading="lazy" decoding="async" /> : <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-[13px] font-bold text-primary">{(person?.full_name || person?.username || "L")[0].toUpperCase()}</div>}<div className="min-w-0"><p className="truncate text-[13px] font-semibold">{person?.full_name || person?.username || "Learner"}</p><p className="truncate text-[10px] text-muted-foreground">@{person?.username || "member"}</p></div></div>{member ? <select value={member.status} onChange={(e) => updateMember(member.id, { status: e.target.value, completed_at: e.target.value === "completed" ? new Date().toISOString() : null })} className="h-9 rounded-lg border border-border bg-background px-2 text-[11px] font-semibold"><option value="active">Active</option><option value="paused">Paused</option><option value="completed">Completed</option><option value="removed">Removed</option></select> : <span className="text-[11px] text-muted-foreground">Unassigned</span>}{member ? <div className="flex items-center gap-2"><input type="number" min="0" max="100" defaultValue={member.progress_percent} onBlur={(e) => updateMember(member.id, { progress_percent: Math.min(100, Math.max(0, Number(e.target.value) || 0)), last_activity_at: new Date().toISOString() })} className="h-9 w-16 rounded-lg border border-border bg-background px-2 text-[11px] font-semibold" /><span className="text-[10px] text-muted-foreground">%</span></div> : <span className="text-[11px] text-muted-foreground">—</span>}<button onClick={() => toggleLearner(item)} className={`flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-[11px] font-semibold md:justify-self-end ${member ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>{member ? <><X className="h-3.5 w-3.5" /> Remove</> : <><UserPlus className="h-3.5 w-3.5" /> Add</>}</button></div>; })}</div></div>
          )}
        </div>
      )}

      {tab === "schedule" && selectedCohort && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-[20px] font-semibold tracking-tight">Cohort schedule</h2><p className="mt-1 text-[12px] text-muted-foreground">Plan live classes, reviews, office hours, and in-person activities.</p></div><button onClick={() => setShowSessionForm((value) => !value)} className="flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-[12px] font-semibold text-primary-foreground"><Plus className="h-4 w-4" /> Schedule session</button></div>
          {showSessionForm && <form onSubmit={createSession} className="grid grid-cols-1 gap-4 rounded-lg border border-border bg-card p-5 md:grid-cols-2"><div className="md:col-span-2"><label className="mb-1.5 block text-[10px] font-semibold uppercase text-muted-foreground">Session title</label><input required value={sessionForm.title} onChange={(e) => setSessionForm({ ...sessionForm, title: e.target.value })} placeholder="Week 3 live class" className={fieldClass} /></div><div><label className="mb-1.5 block text-[10px] font-semibold uppercase text-muted-foreground">Starts</label><input required type="datetime-local" value={sessionForm.starts_at} onChange={(e) => setSessionForm({ ...sessionForm, starts_at: e.target.value })} className={fieldClass} /></div><div><label className="mb-1.5 block text-[10px] font-semibold uppercase text-muted-foreground">Ends</label><input type="datetime-local" value={sessionForm.ends_at} onChange={(e) => setSessionForm({ ...sessionForm, ends_at: e.target.value })} className={fieldClass} /></div><div><label className="mb-1.5 block text-[10px] font-semibold uppercase text-muted-foreground">Meeting link</label><input type="url" value={sessionForm.meeting_url} onChange={(e) => setSessionForm({ ...sessionForm, meeting_url: e.target.value })} placeholder="https://meet..." className={fieldClass} /></div><div><label className="mb-1.5 block text-[10px] font-semibold uppercase text-muted-foreground">Location</label><input value={sessionForm.location} onChange={(e) => setSessionForm({ ...sessionForm, location: e.target.value })} placeholder="Online or classroom" className={fieldClass} /></div><div className="md:col-span-2"><label className="mb-1.5 block text-[10px] font-semibold uppercase text-muted-foreground">Notes</label><textarea rows={3} value={sessionForm.description} onChange={(e) => setSessionForm({ ...sessionForm, description: e.target.value })} className={areaClass} /></div><div className="flex gap-2 md:col-span-2"><button disabled={saving} className="flex h-11 items-center gap-2 rounded-lg bg-foreground px-5 text-[12px] font-semibold text-background">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calendar className="h-4 w-4" />} Save session</button><button type="button" onClick={() => setShowSessionForm(false)} className="h-11 rounded-lg border border-border px-4 text-[12px] font-semibold">Cancel</button></div></form>}
          {sessionsQuery.isLoading ? <LoadingBlock /> : sessions.length === 0 ? <EmptyBlock Icon={Calendar} title="Nothing scheduled" body="Add the first class, review, or office-hour session for this cohort." /> : <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">{sessions.map((item: any) => <div key={item.id} className="rounded-lg border border-border bg-card p-4"><div className="flex items-start justify-between gap-3"><div className="flex gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Video className="h-4 w-4" /></div><div><p className="text-[14px] font-semibold">{item.title}</p><p className="mt-1 text-[11px] text-muted-foreground">{humanDate(item.starts_at)}</p></div></div><button onClick={() => deleteSession(item.id)} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button></div>{item.description && <p className="mt-3 text-[12px] leading-5 text-muted-foreground">{item.description}</p>}<div className="mt-4 flex flex-wrap items-center gap-2"><select value={item.status} onChange={(e) => updateSessionStatus(item.id, e.target.value)} className="h-9 rounded-lg border border-border bg-background px-2 text-[11px] font-semibold"><option value="scheduled">Scheduled</option><option value="live">Live</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select>{item.meeting_url && <a href={item.meeting_url} target="_blank" rel="noreferrer" className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-[11px] font-semibold text-primary-foreground">Join link <ChevronRight className="h-3.5 w-3.5" /></a>}{item.location && <span className="text-[10px] text-muted-foreground">{item.location}</span>}</div></div>)}</div>}
        </div>
      )}

      {tab === "announcements" && selectedCohort && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-[20px] font-semibold tracking-tight">Cohort announcements</h2><p className="mt-1 text-[12px] text-muted-foreground">Keep important instructions and changes visible to this intake.</p></div><button onClick={() => setShowAnnouncementForm((value) => !value)} className="flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-[12px] font-semibold text-primary-foreground"><Plus className="h-4 w-4" /> New announcement</button></div>
          {showAnnouncementForm && <form onSubmit={createAnnouncement} className="space-y-4 rounded-lg border border-border bg-card p-5"><div><label className="mb-1.5 block text-[10px] font-semibold uppercase text-muted-foreground">Title</label><input required value={announcementForm.title} onChange={(e) => setAnnouncementForm({ ...announcementForm, title: e.target.value })} placeholder="What learners need to know" className={fieldClass} /></div><div><label className="mb-1.5 block text-[10px] font-semibold uppercase text-muted-foreground">Message</label><textarea required rows={5} value={announcementForm.body} onChange={(e) => setAnnouncementForm({ ...announcementForm, body: e.target.value })} className={areaClass} /></div><label className="flex items-center gap-2 text-[12px] font-medium"><input type="checkbox" checked={announcementForm.is_pinned} onChange={(e) => setAnnouncementForm({ ...announcementForm, is_pinned: e.target.checked })} className="h-4 w-4 accent-primary" /> Pin this announcement</label><div className="flex gap-2"><button disabled={saving} className="flex h-11 items-center gap-2 rounded-lg bg-foreground px-5 text-[12px] font-semibold text-background">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />} Post announcement</button><button type="button" onClick={() => setShowAnnouncementForm(false)} className="h-11 rounded-lg border border-border px-4 text-[12px] font-semibold">Cancel</button></div></form>}
          {announcementsQuery.isLoading ? <LoadingBlock /> : announcements.length === 0 ? <EmptyBlock Icon={Megaphone} title="No announcements" body="Post an update that everyone in this cohort can refer back to." /> : <div className="space-y-3">{announcements.map((item: any) => <article key={item.id} className={`rounded-lg border bg-card p-5 ${item.is_pinned ? "border-primary/30" : "border-border"}`}><div className="flex items-start justify-between gap-4"><div>{item.is_pinned && <span className="mb-2 inline-flex rounded-full bg-primary/10 px-2 py-1 text-[9px] font-semibold uppercase text-primary">Pinned</span>}<h3 className="text-[15px] font-semibold">{item.title}</h3><p className="mt-1 text-[10px] text-muted-foreground">{humanDate(item.created_at)}</p></div><button onClick={() => deleteAnnouncement(item.id)} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button></div><p className="mt-4 whitespace-pre-wrap text-[13px] leading-6 text-muted-foreground">{item.body}</p></article>)}</div>}
        </div>
      )}

      {tab === "assessments" && selectedCohort && (
        <div className="space-y-5">
          <div><h2 className="text-[20px] font-semibold tracking-tight">Assessments</h2><p className="mt-1 text-[12px] text-muted-foreground">Create quizzes in the bootcamp club and monitor participation here.</p></div>
          {!clubQuery.data ? <EmptyBlock Icon={ClipboardList} title="No bootcamp club is linked" body="A cohort club is required before assessments can be created." /> : <><div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-primary/20 bg-primary/[0.04] p-5"><div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-lg bg-primary/10 text-primary"><ClipboardList className="h-5 w-5" /></div><div><p className="text-[14px] font-semibold">Assessment workspace</p><p className="mt-1 text-[11px] text-muted-foreground">Create questions, set pass marks, publish, and review attempts.</p></div></div><Link to="/app/clubs/quizzes/$clubId" params={{ clubId: clubQuery.data.id }} className="flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-[12px] font-semibold text-primary-foreground">Open assessments <ChevronRight className="h-4 w-4" /></Link></div>{quizzesQuery.isLoading ? <LoadingBlock /> : quizzes.length === 0 ? <EmptyBlock Icon={ClipboardList} title="No assessments yet" body="Open the assessment workspace to create the first quiz for this bootcamp." /> : <div className="overflow-hidden rounded-lg border border-border bg-card"><div className="divide-y divide-border">{quizzes.map((quiz: any) => <div key={quiz.id} className="flex flex-wrap items-center gap-4 px-4 py-4"><div className="grid h-10 w-10 place-items-center rounded-lg bg-violet-500/10 text-violet-600"><BarChart3 className="h-4 w-4" /></div><div className="min-w-0 flex-1"><p className="truncate text-[13px] font-semibold">{quiz.title}</p><p className="mt-1 text-[10px] text-muted-foreground">{quiz.is_published ? "Published" : "Draft"} · {quiz.club_quiz_attempts?.[0]?.count || 0} attempts</p></div><span className={`rounded-full px-2 py-1 text-[9px] font-semibold uppercase ${quiz.is_published ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"}`}>{quiz.is_published ? "Open" : "Draft"}</span></div>)}</div></div>}</>}
        </div>
      )}

      {tab !== "cohorts" && cohorts.length === 0 && <EmptyBlock Icon={LayoutGrid} title="Create a cohort first" body="This area becomes available after you create the first cohort intake." />}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-muted/50 p-3.5"><p className="text-[9px] font-semibold uppercase text-muted-foreground">{label}</p><p className="mt-1.5 truncate text-[14px] font-semibold">{value}</p></div>;
}

function LoadingBlock() {
  return <div className="flex min-h-[180px] items-center justify-center rounded-lg border border-border bg-card"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
}

function EmptyBlock({ Icon, title, body }: { Icon: any; title: string; body: string }) {
  return <div className="rounded-lg border border-dashed border-border bg-card px-6 py-12 text-center"><div className="mx-auto grid h-11 w-11 place-items-center rounded-lg bg-muted text-muted-foreground"><Icon className="h-5 w-5" /></div><h3 className="mt-4 text-[15px] font-semibold">{title}</h3><p className="mx-auto mt-1.5 max-w-md text-[12px] leading-5 text-muted-foreground">{body}</p></div>;
}
