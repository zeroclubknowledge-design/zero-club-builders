import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ChevronLeft, ChevronDown, UploadCloud, Play,
  Plus, Trash2, GripVertical, CheckCircle2,
  DollarSign, Globe, Lock, Rocket, Save, Loader2, X
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
  const [couponEnabled, setCouponEnabled] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [couponDiscount, setCouponDiscount] = useState("10");

  const bannerInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const [modules, setModules] = useState([
    { id: "m1", title: "Introduction", lessons: [{ id: "l1", title: "Welcome and Orientation", type: "text" }] }
  ]);

  const numericPrice = isFree ? 0 : parseFloat(price || "0");
  const numericCouponDiscount = Math.min(100, Math.max(0, Number(couponDiscount) || 0));
  const couponPreviewPrice = Math.max(0, Math.round(numericPrice * (1 - numericCouponDiscount / 100)));
  const normalizedCouponCode = couponCode.trim().toUpperCase();

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
          price: numericPrice,
          coupon_code: couponEnabled && !isFree && normalizedCouponCode ? normalizedCouponCode : null,
          coupon_discount_percent: couponEnabled && !isFree && normalizedCouponCode ? numericCouponDiscount : 0,
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
          price: numericPrice,
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
      <header className="sticky top-0 z-50 bg-background/85 backdrop-blur-xl backdrop-saturate-150 border-b hairline px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            to="/app/tutor-studio"
            className="grid h-9 w-9 place-items-center rounded-full ring-1 ring-border tap hover:bg-foreground/[0.04]"
          >
            <ChevronLeft className="h-[18px] w-[18px] text-foreground" />
          </Link>
          <h1 className="text-[17px] font-semibold tracking-tight text-foreground">
            Create Bootcamp
          </h1>
        </div>
        <button className="flex items-center gap-1.5 rounded-full ring-1 ring-border px-4 py-2 text-[12px] font-semibold tracking-tight tap hover:bg-foreground/[0.04] text-foreground">
          <Save className="h-3.5 w-3.5" /> Save Draft
        </button>
      </header>

      {/* ─── Progress Stepper ─── */}
      <div className="px-6 py-6 border-b hairline">
        <div className="flex items-center justify-between relative">
          {/* Tracks */}
          <div className="absolute top-5 left-5 right-5 h-[2px] -translate-y-1/2 z-0">
            <div className="absolute inset-0 bg-foreground/[0.06] rounded-full" />
            <div
              className="absolute top-0 left-0 h-full bg-foreground rounded-full transition-all duration-500 ease-out"
              style={{ width: `${(step - 1) * 50}%` }}
            />
          </div>

          {[1, 2, 3].map((s) => (
            <div key={s} className="relative z-10 flex flex-col items-center gap-2.5">
              <div
                className={`h-10 w-10 rounded-full flex items-center justify-center text-[13px] font-semibold tabular-nums transition-all duration-300 ${
                  step > s
                    ? "bg-foreground text-background"
                    : step === s
                      ? "bg-foreground text-background ring-4 ring-foreground/10"
                      : "ring-1 ring-border bg-card text-muted-foreground"
                }`}
              >
                {step > s ? <CheckCircle2 className="h-5 w-5" /> : s}
              </div>
              <span
                className={`text-[10px] font-medium uppercase tracking-[0.14em] transition-colors duration-300 ${ step >= s ? "text-foreground" : "text-muted-foreground/40"
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
              <h2 className="text-[21px] font-semibold tracking-tight">Basic Information</h2>
              <p className="text-sm text-muted-foreground">
                Give your bootcamp a compelling title and description to attract builders.
              </p>
            </div>

            <div className="space-y-6">
              {/* Title */}
              <div className="space-y-2">
                <label className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground ml-1">
                  Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Advanced Web3 Development"
                  className="w-full bg-background ring-1 ring-border rounded-2xl px-5 py-4 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/40 transition text-foreground placeholder:text-muted-foreground/40"
                  disabled={loading}
                />
              </div>

              {/* Category */}
              <div className="space-y-2">
                <label className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground ml-1">
                  Category
                </label>
                <div className="relative">
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-background ring-1 ring-border rounded-2xl px-5 py-4 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/40 transition text-foreground appearance-none pr-12"
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
                <label className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground ml-1">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe what builders will learn…"
                  rows={4}
                  className="w-full bg-background ring-1 ring-border rounded-2xl px-5 py-4 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/40 transition text-foreground placeholder:text-muted-foreground/40 resize-none"
                  disabled={loading}
                />
              </div>

              {/* Cover Image Upload */}
              <div className="space-y-2">
                <label className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground ml-1">
                  Cover Image
                </label>
                <div
                  onClick={() => !loading && bannerInputRef.current?.click()}
                  className="relative border border-dashed border-border-strong rounded-2xl min-h-[200px] flex flex-col items-center justify-center gap-4 bg-accent/10 hover:bg-primary/5 hover:border-primary/40 transition-all duration-300 cursor-pointer overflow-hidden group"
                >
                  {banner ? (
                    <img
                      src={banner}
                      className="absolute inset-0 h-full w-full object-cover"
                      alt="Banner Preview"
                    />
                  ) : (
                    <>
                      <div className="h-12 w-12 rounded-full ring-1 ring-border bg-card flex items-center justify-center group-hover:bg-primary/10 transition-colors duration-300">
                        <UploadCloud className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors duration-300" />
                      </div>
                      <div className="text-center">
                        <p className="text-[13.5px] font-semibold tracking-tight text-foreground">Upload a cover image</p>
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
                <label className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground ml-1">
                  Video Preview
                  <span className="ml-1.5 text-muted-foreground/40 normal-case tracking-normal font-medium">
                    (Optional)
                  </span>
                </label>
                <div
                  onClick={() => !loading && videoInputRef.current?.click()}
                  className="relative border border-dashed border-border-strong rounded-2xl min-h-[160px] flex flex-col items-center justify-center gap-4 bg-accent/10 hover:bg-primary/5 hover:border-primary/40 transition-all duration-300 cursor-pointer overflow-hidden group"
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
                      <div className="h-12 w-12 rounded-full ring-1 ring-border bg-card flex items-center justify-center group-hover:bg-primary/10 transition-colors duration-300">
                        <Play className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors duration-300" />
                      </div>
                      <div className="text-center">
                        <p className="text-[13.5px] font-semibold tracking-tight text-foreground">Upload a preview video</p>
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
              <h2 className="text-[21px] font-semibold tracking-tight">Live Syllabus Builder</h2>
              <p className="text-sm text-muted-foreground">
                Outline the modules and topics you'll cover in your live sessions.
              </p>
            </div>

            <div className="space-y-4">
              {modules.map((module, i) => (
                <div
                  key={module.id}
                  className="rounded-2xl ring-1 ring-border bg-card p-5 space-y-4 shadow-soft"
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
                        className="bg-transparent border-none text-[15px] font-semibold tracking-tight text-foreground outline-none focus:text-primary transition"
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
                        className="flex items-center justify-between p-3.5 rounded-xl bg-background ring-1 ring-border hover:ring-primary/25 transition-all group"
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
                      className="flex items-center gap-1.5 text-[13px] font-semibold tracking-tight text-foreground px-3.5 py-2 hover:bg-foreground/[0.04] rounded-full ring-1 ring-border tap transition mt-1"
                    >
                      <Plus className="h-4 w-4" /> Add Topic
                    </button>
                  </div>
                </div>
              ))}

              {/* Add Module */}
              <button
                onClick={addModule}
                className="w-full py-4 border border-dashed border-border-strong rounded-2xl flex items-center justify-center gap-2 text-[13.5px] font-semibold tracking-tight text-muted-foreground hover:border-primary/40 hover:text-primary hover:bg-primary/[0.03] transition-all"
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
              <div className="h-14 w-14 rounded-full bg-primary/8 ring-1 ring-primary/15 flex items-center justify-center mx-auto mb-5">
                <Rocket className="h-6 w-6 text-primary" strokeWidth={1.75} />
              </div>
              <h2 className="text-[21px] font-semibold tracking-tight">Ready to Launch?</h2>
              <p className="text-sm text-muted-foreground">
                Set your pricing and accessibility options.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-5">
              {/* Pricing Card */}
              <div className="rounded-2xl ring-1 ring-border bg-card p-5 space-y-6 shadow-soft">
                <div className="space-y-4">
                  <label className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground ml-1">
                    Pricing Model
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Paid */}
                    <button
                      onClick={() => setIsFree(false)}
                      className={`rounded-2xl p-5 text-left space-y-3 transition-all duration-200 ${
                        !isFree
                          ? "ring-2 ring-primary/50 bg-primary/[0.04]"
                          : "ring-1 ring-border opacity-60 hover:opacity-100"
                      }`}
                    >
                      <div
                        className={`h-5 w-5 rounded-full border-2 flex items-center justify-center ${
                          !isFree ?"border-primary" : "border-border"
                        }`}
                      >
                        {!isFree && (
                          <div className="h-2 w-2 rounded-full bg-primary" />
                        )}
                      </div>
                      <p className="font-semibold tracking-tight text-foreground">Paid access</p>
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
                      className={`rounded-2xl p-5 text-left space-y-3 transition-all duration-200 ${
                        isFree
                          ? "ring-2 ring-primary/50 bg-primary/[0.04]"
                          : "ring-1 ring-border opacity-60 hover:opacity-100"
                      }`}
                    >
                      <div
                        className={`h-5 w-5 rounded-full border-2 flex items-center justify-center ${
                          isFree ?"border-primary" : "border-border"
                        }`}
                      >
                        {isFree && (
                          <div className="h-2 w-2 rounded-full bg-primary" />
                        )}
                      </div>
                      <p className="font-semibold tracking-tight text-foreground">Free</p>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Open to all builders.
                      </p>
                    </button>
                  </div>
                </div>

                {/* Price Input */}
                <div className="space-y-2">
                  <label className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground ml-1">
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
                      className={`w-full bg-background ring-1 ring-border rounded-2xl pl-10 pr-5 py-4 text-sm font-medium outline-none transition text-foreground placeholder:text-muted-foreground/40 ${
                        isFree
                          ?"opacity-40 cursor-not-allowed"
                          : "focus:ring-2 focus:ring-primary/40"
                      }`}
                      disabled={loading || isFree}
                    />
                  </div>
                </div>

                {/* Coupon Setup */}
                <div className="space-y-4 rounded-2xl ring-1 ring-border bg-background p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[13.5px] font-semibold tracking-tight text-foreground">Launch coupon</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        Let students apply a discount code at checkout.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCouponEnabled(!couponEnabled)}
                      disabled={loading || isFree}
                      className={`h-7 w-12 rounded-full p-1 transition disabled:cursor-not-allowed disabled:opacity-40 ${
                        couponEnabled && !isFree ? "bg-primary" : "bg-accent"
                      }`}
                    >
                      <span
                        className={`block h-5 w-5 rounded-full bg-background shadow-sm transition ${
                          couponEnabled && !isFree ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>

                  {couponEnabled && !isFree && (
                    <div className="grid grid-cols-[1fr_96px] gap-3">
                      <div className="space-y-2">
                        <label className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground ml-1">Coupon Code</label>
                        <input
                          type="text"
                          value={couponCode}
                          onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                          placeholder="ZERO20"
                          className="w-full bg-card ring-1 ring-border rounded-2xl px-4 py-3.5 text-sm font-semibold tracking-tight text-foreground outline-none focus:ring-2 focus:ring-primary/40 transition placeholder:text-muted-foreground/40"
                          disabled={loading}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground ml-1">Off</label>
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={couponDiscount}
                            onChange={(e) => setCouponDiscount(e.target.value)}
                            className="w-full bg-card ring-1 ring-border rounded-2xl px-4 py-3.5 pr-8 text-sm font-semibold tracking-tight text-foreground outline-none focus:ring-2 focus:ring-primary/40 transition"
                            disabled={loading}
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">%</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {couponEnabled && !isFree && normalizedCouponCode && (
                    <div className="flex items-center justify-between rounded-2xl bg-primary/10 px-4 py-3 text-xs">
                      <span className="font-semibold text-primary">{normalizedCouponCode}</span>
                      <span className="text-muted-foreground">
                        Students pay NGN {couponPreviewPrice.toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Visibility Card */}
              <div className="rounded-2xl ring-1 ring-border bg-card p-5 space-y-4 shadow-soft">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full ring-1 ring-border bg-card flex items-center justify-center">
                      <Globe className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-[13.5px] font-semibold tracking-tight text-foreground">Visibility</p>
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
      <footer className="fixed bottom-0 left-0 right-0 z-50 bg-background/85 backdrop-blur-xl backdrop-saturate-150 border-t hairline px-6 py-4 flex items-center justify-between">
        <button
          onClick={() => step > 1 && setStep(step - 1)}
          disabled={loading}
          className={`text-[13.5px] font-semibold tracking-tight text-muted-foreground hover:text-foreground transition-colors ${
            step === 1 ?"invisible" : ""
          } disabled:opacity-50`}
        >
          Back
        </button>
        <button
          onClick={nextStep}
          disabled={loading}
          className="rounded-full bg-foreground text-background px-8 py-3.5 text-[14px] font-semibold tracking-tight shadow-lift tap hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {step === 3 ? "Launch bootcamp" : "Continue"}
        </button>
      </footer>
    </div>
  );
}
