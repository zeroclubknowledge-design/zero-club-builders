import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ChevronLeft, ChevronDown, UploadCloud, Play,
  Plus, Trash2, GripVertical, CheckCircle2,
  DollarSign, Globe, Lock, Sparkles, Save, Loader2, X
} from "lucide-react";
import { useState, useRef } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { uploadFile } from "@/lib/storage";
import { createBootcampAction } from "@/api";

export const Route = createFileRoute("/app/tutor-studio/create")({
  component: CreateBootcamp,
});

function CreateBootcamp() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  
  // Form State
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Development");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("0");
  const [isFree, setIsFree] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [videoPreviewFile, setVideoPreviewFile] = useState<File | null>(null);

  const bannerInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const [modules, setModules] = useState([
    { id: "m1", title: "Introduction", lessons: [{ id: "l1", title: "Welcome and Orientation", type: "text" }] }
  ]);

  const handleBannerUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBannerFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (ev.target?.result) {
        setBanner(ev.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setVideoPreviewFile(file);
    setVideoPreview(URL.createObjectURL(file));
  };

  const launchBootcamp = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      let bannerUrl = "";
      if (bannerFile) {
        const fileExt = bannerFile.name.split('.').pop();
        const fileName = `${Date.now()}.${fileExt}`;
        bannerUrl = await uploadFile('bootcamp-banners', bannerFile, `${user.id}/${fileName}`);
      }

      let videoUrl = "";
      if (videoPreviewFile) {
        const fileExt = videoPreviewFile.name.split('.').pop();
        const fileName = `video_${Date.now()}.${fileExt}`;
        // Assuming bootcamp-banners bucket allows videos, or we can use the same
        videoUrl = await uploadFile('bootcamp-banners', videoPreviewFile, `${user.id}/${fileName}`);
      }

      // Update directly via Supabase client to bypass Vercel Server Function duplex error
      const { data: newBootcamp, error: dbError } = await supabase
        .from('bootcamps')
        .insert([{
          creator_id: user.id,
          title,
          category,
          description,
          price: isFree ? 0 : parseFloat(price || "0"),
          banner_url: bannerUrl,
          video_url: videoUrl,
          status: 'active'
        }])
        .select()
        .single();

      if (dbError) throw dbError;

      // Insert Modules
      for (let i = 0; i < modules.length; i++) {
        const mod = modules[i];
        const { data: newModule, error: modError } = await supabase
          .from('modules')
          .insert([{
            bootcamp_id: newBootcamp.id,
            title: mod.title,
            order_index: i
          }])
          .select()
          .single();

        if (modError) {
          console.error("Module insert error:", modError);
          continue; // best effort
        }

        // Insert Lessons (Topics)
        const lessonsToInsert = mod.lessons.map((lesson, j) => ({
          module_id: newModule.id,
          title: lesson.title,
          content_type: 'text',
          order_index: j
        }));

        if (lessonsToInsert.length > 0) {
          await supabase.from('lessons').insert(lessonsToInsert);
        }
      }

      // Create Bootcamp Club
      const { data: newClub, error: clubError } = await supabase
        .from('clubs')
        .insert([{
          name: title,
          description: description,
          category: 'Bootcamp',
          creator_id: user.id,
          is_private: true,
          price: isFree ? 0 : parseFloat(price || "0"),
          banner_url: bannerUrl,
          logo_url: bannerUrl
        }])
        .select()
        .single();
        
      if (!clubError && newClub) {
        const membersToInsert = [{
          club_id: newClub.id,
          profile_id: user.id,
          role: 'Administrator'
        }];

        // Check if tutor is linked to any institutions and add them as Administrators
        const { data: instTutors } = await supabase
          .from('institution_tutors')
          .select('institution_id')
          .eq('tutor_id', user.id);

        if (instTutors && instTutors.length > 0) {
          instTutors.forEach(inst => {
            membersToInsert.push({
              club_id: newClub.id,
              profile_id: inst.institution_id,
              role: 'Administrator'
            });
          });
        }

        await supabase.from('club_members').insert(membersToInsert);
      }

      toast.success("Bootcamp launched successfully!");
      navigate({ to: "/app/tutor-studio" });
    } catch (error: any) {
      toast.error(error.message || "Failed to launch bootcamp");
    } finally {
      setLoading(false);
    }
  };

  const nextStep = () => {
    if (step < 3) setStep(step + 1);
    else {
      launchBootcamp();
    }
  };
  const addModule = () => {
    setModules([...modules, { id: Math.random().toString(), title: "New Module", lessons: [] }]);
  };

  const addLesson = (moduleId: string) => {
    setModules(modules.map(m => 
      m.id === moduleId 
        ? { ...m, lessons: [...m.lessons, { id: Math.random().toString(), title: "New Topic", type: "text" }] }
        : m
    ));
  };

  const stepLabels = ["BASICS", "CURRICULUM", "LAUNCH"];

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground pb-24">
      {/* ─── Header ─── */}
      <header className="sticky top-0 z-50 bg-background/70 backdrop-blur-2xl border-b border-border/40 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            to="/app/tutor-studio"
            className="flex items-center justify-center h-9 w-9 rounded-full bg-accent/60 transition hover:bg-accent active:scale-95"
          >
            <ChevronLeft className="h-5 w-5 text-foreground" />
          </Link>
          <h1 className="text-lg font-black tracking-tight text-foreground">
            Create Bootcamp
          </h1>
        </div>
        <button className="flex items-center gap-2 rounded-full bg-accent/60 border border-border/40 px-5 py-2 text-xs font-bold transition hover:bg-accent active:scale-95 text-foreground">
          <Save className="h-3.5 w-3.5" /> Save Draft
        </button>
      </header>

      {/* ─── Progress Stepper ─── */}
      <div className="px-6 py-7 border-b border-border/40">
        <div className="flex items-center justify-between relative">
          {/* Tracks */}
          <div className="absolute top-5 left-5 right-5 h-1 -translate-y-1/2 z-0">
            <div className="absolute inset-0 bg-accent rounded-full" />
            <div
              className="absolute top-0 left-0 h-full bg-primary rounded-full transition-all duration-500 ease-out"
              style={{ width: `${(step - 1) * 50}%` }}
            />
          </div>

          {[1, 2, 3].map((s) => (
            <div key={s} className="relative z-10 flex flex-col items-center gap-2.5">
              <div
                className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${
                  step > s
                    ?"bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                    : step === s
                      ? "bg-primary text-primary-foreground scale-110 shadow-lg shadow-primary/30"
                      : "bg-accent text-muted-foreground"
                }`}
              >
                {step > s ? <CheckCircle2 className="h-5 w-5" /> : s}
              </div>
              <span
                className={`text-[10px] transition-colors duration-300 ${ step >= s ?"text-primary" : "text-muted-foreground/30"
                }`}
              >
                {stepLabels[s - 1]}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Main Content ─── */}
      <main className="flex-1 overflow-y-auto px-6 py-8 max-w-2xl mx-auto w-full">

        {/* ══════════ Step 1 — Basics ══════════ */}
        {step === 1 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="space-y-2">
              <h2 className="text-2xl font-black tracking-tight">Basic Information</h2>
              <p className="text-sm text-muted-foreground">
                Give your bootcamp a compelling title and description to attract builders.
              </p>
            </div>

            <div className="space-y-6">
              {/* Title */}
              <div className="space-y-2">
                <label className="text-[11px] text-muted-foreground ml-1">
                  Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Advanced Web3 Development"
                  className="w-full bg-background border border-border/40 rounded-2xl px-5 py-4 text-sm font-medium outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition text-foreground placeholder:text-muted-foreground/40"
                  disabled={loading}
                />
              </div>

              {/* Category */}
              <div className="space-y-2">
                <label className="text-[11px] text-muted-foreground ml-1">
                  Category
                </label>
                <div className="relative">
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-background border border-border/40 rounded-2xl px-5 py-4 text-sm font-medium outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition text-foreground appearance-none pr-12"
                    disabled={loading}
                  >
                    <option>Design</option>
                    <option>Development</option>
                    <option>Marketing</option>
                    <option>Business</option>
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 pointer-events-none" />
                </div>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <label className="text-[11px] text-muted-foreground ml-1">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe what builders will learn…"
                  rows={4}
                  className="w-full bg-background border border-border/40 rounded-2xl px-5 py-4 text-sm font-medium outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition text-foreground placeholder:text-muted-foreground/40 resize-none"
                  disabled={loading}
                />
              </div>

              {/* Cover Image Upload */}
              <div className="space-y-2">
                <label className="text-[11px] text-muted-foreground ml-1">
                  Cover Image
                </label>
                <div
                  onClick={() => !loading && bannerInputRef.current?.click()}
                  className="relative border-2 border-dashed border-border/50 rounded-3xl min-h-[200px] flex flex-col items-center justify-center gap-4 bg-accent/10 hover:bg-primary/5 hover:border-primary/40 transition-all duration-300 cursor-pointer overflow-hidden group"
                >
                  {banner ? (
                    <img
                      src={banner}
                      className="absolute inset-0 h-full w-full object-cover"
                      alt="Banner Preview"
                    />
                  ) : (
                    <>
                      <div className="h-14 w-14 rounded-2xl bg-accent/60 flex items-center justify-center group-hover:bg-primary/10 transition-colors duration-300">
                        <UploadCloud className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors duration-300" />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-bold text-foreground">Upload a cover image</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Recommended size: 1600×900px
                        </p>
                      </div>
                    </>
                  )}
                  {banner && (
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                      <UploadCloud className="h-8 w-8 text-white" />
                    </div>
                  )}
                  <input
                    type="file"
                    ref={bannerInputRef}
                    className="hidden"
                    accept="image/*"
                    onChange={handleBannerUpload}
                  />
                </div>
              </div>

              {/* Video Preview Upload */}
              <div className="space-y-2">
                <label className="text-[11px] text-muted-foreground ml-1">
                  Video Preview
                  <span className="ml-1.5 text-muted-foreground/40 normal-case tracking-normal font-medium">
                    (Optional)
                  </span>
                </label>
                <div
                  onClick={() => !loading && videoInputRef.current?.click()}
                  className="relative border-2 border-dashed border-border/50 rounded-3xl min-h-[160px] flex flex-col items-center justify-center gap-4 bg-accent/10 hover:bg-primary/5 hover:border-primary/40 transition-all duration-300 cursor-pointer overflow-hidden group"
                >
                  {videoPreview ? (
                    <video
                      src={videoPreview}
                      className="absolute inset-0 h-full w-full object-cover"
                      muted
                      loop
                      autoPlay
                      playsInline
                    />
                  ) : (
                    <>
                      <div className="h-14 w-14 rounded-2xl bg-accent/60 flex items-center justify-center group-hover:bg-primary/10 transition-colors duration-300">
                        <Play className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors duration-300" />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-bold text-foreground">Upload a preview video</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Short intro to pitch your bootcamp
                        </p>
                      </div>
                    </>
                  )}
                  {videoPreview && (
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                      <Play className="h-8 w-8 text-white" />
                    </div>
                  )}
                  <input
                    type="file"
                    ref={videoInputRef}
                    className="hidden"
                    accept="video/*"
                    onChange={handleVideoUpload}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════ Step 2 — Curriculum ══════════ */}
        {step === 2 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="space-y-2">
              <h2 className="text-2xl font-black tracking-tight">Live Syllabus Builder</h2>
              <p className="text-sm text-muted-foreground">
                Outline the modules and topics you'll cover in your live sessions.
              </p>
            </div>

            <div className="space-y-4">
              {modules.map((module, i) => (
                <div
                  key={module.id}
                  className="rounded-3xl border border-border/40 bg-card p-6 space-y-4 shadow-sm"
                >
                  {/* Module header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-2 cursor-grab hover:bg-accent rounded-xl transition">
                        <GripVertical className="h-5 w-5 text-muted-foreground/40" />
                      </div>
                      <input
                        value={module.title}
                        onChange={(e) =>
                          setModules(
                            modules.map((m) =>
                              m.id === module.id ? { ...m, title: e.target.value } : m
                            )
                          )
                        }
                        className="bg-transparent border-none text-base font-black text-foreground outline-none focus:text-primary transition"
                      />
                    </div>
                    <button className="p-2 text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 rounded-xl transition">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Lessons list */}
                  <div className="space-y-2 pl-4">
                    {module.lessons.map((lesson) => (
                      <div
                        key={lesson.id}
                        className="flex items-center justify-between p-4 rounded-2xl bg-background border border-border/30 hover:border-primary/30 transition-all group"
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <Play className="h-3 w-3 text-primary" />
                          </div>
                          <input
                            value={lesson.title}
                            onChange={(e) =>
                              setModules(
                                modules.map((m) =>
                                  m.id === module.id
                                    ? {
                                        ...m,
                                        lessons: m.lessons.map((l) =>
                                          l.id === lesson.id
                                            ? { ...l, title: e.target.value }
                                            : l
                                        ),
                                      }
                                    : m
                                )
                              )
                            }
                            className="bg-transparent border-none text-sm font-medium text-foreground/80 outline-none focus:text-foreground transition w-full"
                          />
                        </div>
                        <button
                          onClick={() =>
                            setModules(
                              modules.map((m) =>
                                m.id === module.id
                                  ? {
                                      ...m,
                                      lessons: m.lessons.filter(
                                        (l) => l.id !== lesson.id
                                      ),
                                    }
                                  : m
                              )
                            )
                          }
                          className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-destructive/10 rounded-lg transition"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </button>
                      </div>
                    ))}

                    <button
                      onClick={() => addLesson(module.id)}
                      className="flex items-center gap-2 text-sm font-bold text-primary px-4 py-2.5 hover:bg-primary/5 rounded-xl transition mt-1"
                    >
                      <Plus className="h-4 w-4" /> Add Topic
                    </button>
                  </div>
                </div>
              ))}

              {/* Add Module */}
              <button
                onClick={addModule}
                className="w-full py-5 border-2 border-dashed border-border/40 rounded-3xl flex items-center justify-center gap-2 text-sm font-bold text-muted-foreground/40 hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-all"
              >
                <Plus className="h-5 w-5" /> Add New Module
              </button>
            </div>
          </div>
        )}

        {/* ══════════ Step 3 — Launch ══════════ */}
        {step === 3 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Hero */}
            <div className="space-y-4 text-center">
              <div className="h-20 w-20 rounded-[28px] bg-primary/15 flex items-center justify-center mx-auto mb-5 shadow-lg shadow-primary/10">
                <Sparkles className="h-9 w-9 text-primary" />
              </div>
              <h2 className="text-2xl font-black tracking-tight">Ready to Launch?</h2>
              <p className="text-sm text-muted-foreground">
                Set your pricing and accessibility options.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-5">
              {/* Pricing Card */}
              <div className="rounded-3xl border border-border/40 bg-card p-6 space-y-6 shadow-sm">
                <div className="space-y-4">
                  <label className="text-[11px] text-muted-foreground ml-1">
                    Pricing Model
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Paid */}
                    <button
                      onClick={() => setIsFree(false)}
                      className={`rounded-3xl border-2 p-5 text-left space-y-3 transition-all duration-200 ${
                        !isFree
                          ?"border-primary bg-primary/5 shadow-sm"
                          : "border-border/40 bg-accent/10 opacity-60 hover:opacity-100"
                      }`}
                    >
                      <div
                        className={`h-5 w-5 rounded-full border-[3px] flex items-center justify-center ${
                          !isFree ?"border-primary" : "border-border"
                        }`}
                      >
                        {!isFree && (
                          <div className="h-2.5 w-2.5 rounded-full bg-primary" />
                        )}
                      </div>
                      <p className="font-bold text-foreground">Paid Access</p>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Set a price for your bootcamp.
                      </p>
                    </button>

                    {/* Free */}
                    <button
                      onClick={() => {
                        setIsFree(true);
                        setPrice("0");
                      }}
                      className={`rounded-3xl border-2 p-5 text-left space-y-3 transition-all duration-200 ${
                        isFree
                          ?"border-primary bg-primary/5 shadow-sm"
                          : "border-border/40 bg-accent/10 opacity-60 hover:opacity-100"
                      }`}
                    >
                      <div
                        className={`h-5 w-5 rounded-full border-[3px] flex items-center justify-center ${
                          isFree ?"border-primary" : "border-border"
                        }`}
                      >
                        {isFree && (
                          <div className="h-2.5 w-2.5 rounded-full bg-primary" />
                        )}
                      </div>
                      <p className="font-bold text-foreground">Free</p>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Open to all builders.
                      </p>
                    </button>
                  </div>
                </div>

                {/* Price Input */}
                <div className="space-y-2">
                  <label className="text-[11px] text-muted-foreground ml-1">
                    Price
                  </label>
                  <div className="relative">
                    <span className="absolute left-5 top-1/2 -translate-y-1/2 text-muted-foreground/40 font-bold text-sm">
                      ₦
                    </span>
                    <input
                      type="number"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder="5,000"
                      className={`w-full bg-background border border-border/40 rounded-2xl pl-10 pr-5 py-4 text-sm font-medium outline-none transition text-foreground placeholder:text-muted-foreground/40 ${
                        isFree
                          ?"opacity-40 cursor-not-allowed"
                          : "focus:border-primary focus:ring-4 focus:ring-primary/10"
                      }`}
                      disabled={loading || isFree}
                    />
                  </div>
                </div>
              </div>

              {/* Visibility Card */}
              <div className="rounded-3xl border border-border/40 bg-card p-6 space-y-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-2xl bg-accent/60 flex items-center justify-center">
                      <Globe className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-foreground">Visibility</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Publicly listed
                      </p>
                    </div>
                  </div>
                  <div className="h-7 w-12 bg-primary rounded-full relative p-1 cursor-pointer transition-colors">
                    <div className="h-5 w-5 bg-primary-foreground rounded-full absolute right-1 top-1 shadow-sm transition-all" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ─── Footer Controls ─── */}
      <footer className="fixed bottom-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-2xl border-t border-border/40 px-6 py-4 flex items-center justify-between">
        <button
          onClick={() => step > 1 && setStep(step - 1)}
          disabled={loading}
          className={`text-sm font-bold text-muted-foreground hover:text-foreground transition ${
            step === 1 ?"invisible" : ""
          } disabled:opacity-50`}
        >
          Back
        </button>
        <button
          onClick={nextStep}
          disabled={loading}
          className="rounded-full bg-foreground text-background px-10 py-3.5 font-bold shadow-lg transition active:scale-95 disabled:opacity-50 flex items-center gap-2"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {step === 3 ? "Launch Bootcamp" : "Continue"}
        </button>
      </footer>
    </div>
  );
}
