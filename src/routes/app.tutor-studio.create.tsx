import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ChevronLeft, ChevronDown, UploadCloud, Play,
  Plus, Trash2, GripVertical, CheckCircle2,
  DollarSign, Globe, Lock, Rocket, Save, Loader2, X
} from "@/components/icons/solar";
import { useEffect, useState, useRef } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { uploadFile } from "@/lib/storage";
import { createBootcampAction } from "@/api";
import { useWalletCurrency } from "@/hooks/useWalletCurrency";
import { RichTextEditor } from "@/components/RichTextEditor";

export const Route = createFileRoute("/app/tutor-studio/create")({
  component: CreateBootcamp,
});

function CreateBootcamp() {
  return <BootcampForm />;
}

export function BootcampForm({
  bootcampId,
  returnTo = "/app/tutor-studio",
  workspaceLabel = "Tutor Studio",
}: {
  bootcampId?: string;
  returnTo?: string;
  workspaceLabel?: string;
}) {
  const navigate = useNavigate();
  const { details: currencyDetails, format, toBaseAmount } = useWalletCurrency();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(Boolean(bootcampId));
  
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
  const [endDate, setEndDate] = useState("");

  /**
   * Extra coupon codes, held as strings while editing so partially typed
   * values do not fight the inputs. They are written to bootcamp_coupons after
   * the bootcamp is saved - a new bootcamp has no id to attach them to until
   * then, and an existing one may be published, which is fine because coupons
   * live in their own table rather than on the bootcamp row.
   */
  type ExtraCoupon = {
    key: string;
    id?: string;
    code: string;
    discount_percent: string;
    label: string;
    max_uses: string;
    expires_at: string;
  };
  const [extraCoupons, setExtraCoupons] = useState<ExtraCoupon[]>([]);
  // Share of the price paid to whoever referred a learner. Held as a string so
  // the field can be cleared while typing.
  const [referralPercent, setReferralPercent] = useState("0");
  const [removedCouponIds, setRemovedCouponIds] = useState<string[]>([]);
  const [primaryCouponId, setPrimaryCouponId] = useState<string | undefined>();

  const bannerInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const [modules, setModules] = useState([
    { id: "m1", title: "Introduction", lessons: [{ id: "l1", title: "Welcome and Orientation", type: "text" }] }
  ]);

  useEffect(() => {
    if (!bootcampId) return;

    let cancelled = false;
    const loadBootcamp = async () => {
      setInitialLoading(true);
      const { data: bootcamp, error } = await supabase
        .from("bootcamps")
        .select("*")
        .eq("id", bootcampId)
        .single();

      if (error || !bootcamp) {
        toast.error(error?.message || "Bootcamp could not be loaded");
        navigate({ to: returnTo as any });
        return;
      }

      const { data: fetchedModules, error: moduleError } = await supabase
        .from("modules")
        .select("*, lessons(*)")
        .eq("bootcamp_id", bootcampId)
        .order("order_index", { ascending: true });

      // Extra coupons live in their own table, so they load for any bootcamp,
      // published or not. A missing table means the migration has not been run
      // yet - the rest of the editor should still work, so this stays quiet.
      const { data: fetchedCoupons } = await supabase
        .from("bootcamp_coupons")
        .select("id, code, discount_percent, label, max_uses, expires_at")
        .eq("bootcamp_id", bootcampId)
        .order("created_at", { ascending: true });

      if (moduleError) {
        toast.error(moduleError.message || "Curriculum could not be loaded");
      }

      if (cancelled) return;
      setTitle(bootcamp.title || "");
      setCategory(bootcamp.category || "Development");
      setDescription(bootcamp.description || "");
      setPrice(String((Number(bootcamp.price) || 0) / currencyDetails.rate));
      setIsFree(Number(bootcamp.price) === 0);
      setBanner(bootcamp.banner_url || null);
      setVideoPreview(bootcamp.video_url || null);
      setCouponEnabled(Boolean(bootcamp.coupon_code));
      setCouponCode(bootcamp.coupon_code || "");
      setCouponDiscount(String(bootcamp.coupon_discount_percent || 10));
      setReferralPercent(String(bootcamp.referral_percent ?? 0));
      setEndDate(bootcamp.ends_at ? String(bootcamp.ends_at).slice(0, 10) : "");
      setPrimaryCouponId(
        (fetchedCoupons || []).find(
          (coupon: any) => String(coupon.code || "").toUpperCase() === String(bootcamp.coupon_code || "").toUpperCase(),
        )?.id,
      );
      setExtraCoupons(
        (fetchedCoupons || [])
          // The launch coupon above already edits the first code, so it is not
          // repeated here - that would give two inputs for one row.
          .filter((c: any) => (c.code || "").toUpperCase() !== (bootcamp.coupon_code || "").toUpperCase())
          .map((c: any) => ({
            key: c.id,
            id: c.id,
            code: c.code || "",
            discount_percent: String(c.discount_percent ?? 10),
            label: c.label || "",
            max_uses: c.max_uses ? String(c.max_uses) : "",
            expires_at: c.expires_at ? String(c.expires_at).slice(0, 10) : "",
          })),
      );
      setModules(
        (fetchedModules || []).map((module: any) => ({
          id: module.id,
          title: module.title,
          lessons: [...(module.lessons || [])]
            .sort((a: any, b: any) => a.order_index - b.order_index)
            .map((lesson: any) => ({
              id: lesson.id,
              title: lesson.title,
              type: lesson.content_type || "text",
            })),
        }))
      );
      setInitialLoading(false);
    };

    loadBootcamp();
    return () => {
      cancelled = true;
    };
  }, [bootcampId, currencyDetails.rate, navigate, returnTo]);

  const numericPrice = isFree ? 0 : toBaseAmount(parseFloat(price || "0"));
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

      let bannerUrl = banner?.startsWith("http") ? banner : "";
      if (bannerFile) {
        const fileExt = bannerFile.name.split('.').pop();
        const fileName = `${Date.now()}.${fileExt}`;
        bannerUrl = await uploadFile('bootcamp-banners', bannerFile, `${user.id}/${fileName}`);
      }

      let videoUrl = videoPreview?.startsWith("http") ? videoPreview : "";
      if (videoPreviewFile) {
        const fileExt = videoPreviewFile.name.split('.').pop();
        const fileName = `video_${Date.now()}.${fileExt}`;
        // Assuming bootcamp-banners bucket allows videos, or we can use the same
        videoUrl = await uploadFile('bootcamp-banners', videoPreviewFile, `${user.id}/${fileName}`);
      }

      const bootcampPayload = {
        title,
        category,
        description,
        price: numericPrice,
        coupon_code: couponEnabled && !isFree && normalizedCouponCode ? normalizedCouponCode : null,
        coupon_discount_percent: couponEnabled && !isFree && normalizedCouponCode ? numericCouponDiscount : 0,
        banner_url: bannerUrl || null,
        video_url: videoUrl || null,
        ends_at: endDate ? new Date(`${endDate}T23:59:59.999`).toISOString() : null,
        // Clamped here as well as by a database constraint. A free bootcamp
        // cannot pay commission on nothing, so it is forced to zero.
        referral_percent: isFree ? 0 : Math.min(50, Math.max(0, Number(referralPercent) || 0)),
        status: 'active'
      };

      const saveQuery = bootcampId
        ? supabase.from('bootcamps').update(bootcampPayload).eq('id', bootcampId)
        : supabase.from('bootcamps').insert([{ ...bootcampPayload, creator_id: user.id }]);
      const { data: newBootcamp, error: dbError } = await saveQuery.select().single();

      if (dbError) throw dbError;

      // Save the extra coupon codes now that a bootcamp id definitely exists.
      // Failures here are reported but do not roll back the bootcamp: losing a
      // discount code is far less costly than losing the course itself.
      const savedBootcampId = bootcampId || newBootcamp?.id;
      if (savedBootcampId) {
        try {
          const couponIdsToRemove = Array.from(new Set([
            ...removedCouponIds,
            ...((!couponEnabled || isFree || !normalizedCouponCode) && primaryCouponId ? [primaryCouponId] : []),
          ]));
          if (couponIdsToRemove.length > 0) {
            await supabase.from("bootcamp_coupons").delete().in("id", couponIdsToRemove);
          }

          const rows = [
            ...(couponEnabled && !isFree && normalizedCouponCode ? [{
              ...(primaryCouponId ? { id: primaryCouponId } : {}),
              bootcamp_id: savedBootcampId,
              code: normalizedCouponCode,
              discount_percent: numericCouponDiscount,
              label: "Primary coupon",
              max_uses: null,
              expires_at: null,
              created_by: user.id,
            }] : []),
            ...extraCoupons
              .filter((c) => c.code.trim())
              .map((c) => ({
              ...(c.id ? { id: c.id } : {}),
              bootcamp_id: savedBootcampId,
              code: c.code.trim().toUpperCase(),
              discount_percent: Math.min(100, Math.max(0, Number(c.discount_percent) || 0)),
              label: c.label.trim() || null,
              max_uses: c.max_uses ? Number(c.max_uses) : null,
              // A date input gives a day; treat it as end of that day so a
              // code advertised as "valid until the 20th" works all of the 20th.
              expires_at: c.expires_at ? new Date(`${c.expires_at}T23:59:59`).toISOString() : null,
              created_by: user.id,
              })),
          ];

          if (rows.length > 0) {
            const { error: couponError } = await supabase
              .from("bootcamp_coupons")
              .upsert(rows, { onConflict: "id" });
            if (couponError) throw couponError;
          }

          setRemovedCouponIds([]);
        } catch (couponErr: any) {
          toast.error(
            couponErr?.message?.includes("bootcamp_coupons")
              ? "Coupon codes could not be saved. Run the bootcamp_coupons migration."
              : couponErr?.message || "Coupon codes could not be saved.",
          );
        }
      }

      if (bootcampId) {
        const { error: clubUpdateError } = await supabase
          .from('clubs')
          .update({
            name: title,
            description,
            price: numericPrice,
            banner_url: bannerUrl || null,
          })
          .eq('bootcamp_id', bootcampId);
        if (clubUpdateError) throw clubUpdateError;

        const { error: clearError } = await supabase.from('modules').delete().eq('bootcamp_id', bootcampId);
        if (clearError) throw clearError;
      }

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

        if (modError) throw modError;

        // Insert Lessons (Topics)
        const lessonsToInsert = mod.lessons.map((lesson, j) => ({
          module_id: newModule.id,
          title: lesson.title,
          content_type: 'text',
          order_index: j
        }));

        if (lessonsToInsert.length > 0) {
          const { error: lessonError } = await supabase.from('lessons').insert(lessonsToInsert);
          if (lessonError) throw lessonError;
        }
      }

      // Create the temporary bootcamp club only for a new bootcamp.
      if (!bootcampId) {
        const { data: newClub, error: clubError } = await supabase
          .from('clubs')
          .insert([{
            name: title,
            description: description,
            category: 'Bootcamp',
            creator_id: user.id,
            bootcamp_id: newBootcamp.id,
            club_type: 'bootcamp_cohort',
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
      }

      toast.success(bootcampId ? "Bootcamp updated successfully" : "Bootcamp launched successfully!");

      // Offer Zero Form pre-registration for brand new bootcamps (spec section 19).
      if (!bootcampId) {
        toast("Collect learners before you start", {
          description: "Create a Zero Form to take early registrations and early-bird payments.",
          action: {
            label: "Create Zero Form",
            onClick: () => navigate({ to: "/app/tutor-studio", search: { view: "zero-forms" } as any }),
          },
          duration: 9000,
        });
      }

      navigate({ to: returnTo as any });
    } catch (error: any) {
      toast.error(error.message || "Failed to launch bootcamp");
    } finally {
      setLoading(false);
    }
  };

  const nextStep = () => {
    if (step === 1 && (!title.trim() || !description.trim())) {
      toast.error("Add a title and description before continuing");
      return;
    }
    if (step === 2 && modules.some((module) => !module.title.trim() || module.lessons.some((lesson) => !lesson.title.trim()))) {
      toast.error("Give every module and lesson a title before continuing");
      return;
    }
    if (step < 3) setStep(step + 1);
    else {
      launchBootcamp();
    }
  };

  const saveDraft = () => {
    localStorage.setItem("zero_club_bootcamp_draft", JSON.stringify({
      title, category, description, price, isFree, banner, videoPreview,
      couponEnabled, couponCode, couponDiscount, endDate, modules, savedAt: new Date().toISOString(),
    }));
    toast.success("Bootcamp draft saved on this device");
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

  if (initialLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background pb-24 text-foreground">
      {/* ─── Header ─── */}
      <header className="sticky top-0 z-50 border-b hairline bg-background/95 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur-xl md:px-7">
        <div className="mx-auto flex max-w-[1040px] items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate({ to: returnTo as any })}
            className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-card tap hover:bg-muted"
          >
            <ChevronLeft className="h-[18px] w-[18px] text-foreground" />
          </button>
          <div><p className="text-[10px] font-medium uppercase text-muted-foreground">{workspaceLabel}</p><h1 className="text-[18px] font-semibold tracking-tight text-foreground">{bootcampId ? "Edit bootcamp" : "Create bootcamp"}</h1></div>
        </div>
        <button onClick={saveDraft} className="flex h-10 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-[12px] font-semibold text-foreground tap hover:bg-muted sm:px-4">
          <Save className="h-3.5 w-3.5" /> Save Draft
        </button>
        </div>
      </header>

      {/* ─── Progress Stepper ─── */}
      <div className="border-b hairline px-4 py-4 md:px-7">
        <div className="relative mx-auto flex max-w-[760px] items-center justify-between">
          {/* Tracks */}
          <div className="absolute left-5 right-5 top-4 z-0 h-[2px] -translate-y-1/2">
            <div className="absolute inset-0 bg-foreground/[0.06] rounded-full" />
            <div
              className="absolute top-0 left-0 h-full bg-foreground rounded-full transition-all duration-500 ease-out"
              style={{ width: `${(step - 1) * 50}%` }}
            />
          </div>

          {[1, 2, 3].map((s) => (
            <button type="button" onClick={() => s < step && setStep(s)} key={s} className="relative z-10 flex flex-col items-center gap-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-lg text-[12px] font-semibold tabular-nums transition-all duration-300 ${
                  step > s
                    ? "bg-foreground text-background"
                    : step === s
                      ? "bg-primary text-primary-foreground ring-4 ring-primary/10"
                      : "border border-border bg-card text-muted-foreground"
                }`}
              >
                {step > s ? <CheckCircle2 className="h-5 w-5" /> : s}
              </div>
              <span
                className={`text-[10px] font-medium uppercase transition-colors duration-300 ${ step >= s ? "text-foreground" : "text-muted-foreground/40"
                }`}
              >
                {stepLabels[s - 1]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ─── Main Content ─── */}
      <main className="mx-auto w-full max-w-[820px] flex-1 overflow-y-auto px-4 py-7 md:px-7 md:py-9">

        {/* ══════════ Step 1 — Basics ══════════ */}
        {step === 1 && (
          <div className="animate-in space-y-7 fade-in slide-in-from-bottom-4 duration-500">
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase text-primary">Step 1 of 3</p><h2 className="text-[23px] font-semibold tracking-tight">Bootcamp basics</h2>
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
                  className="h-12 w-full rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-2 focus:ring-primary/10"
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
                    className="h-12 w-full appearance-none rounded-lg border border-border bg-card px-4 pr-12 text-sm font-medium text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
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
                <RichTextEditor
                  value={description}
                  onChange={setDescription}
                  placeholder="Describe what builders will learn. Use bold for key points and bullets for the outline…"
                  minHeight={180}
                />
                <p className="ml-1 text-[10.5px] leading-4 text-muted-foreground">
                  Use the toolbar to add headings, bold text and bullet points so learners can scan it quickly.
                </p>
              </div>

              {/* Cover Image Upload */}
              <div className="space-y-2">
                <label className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground ml-1">
                  Cover Image
                </label>
                <div
                  onClick={() => !loading && bannerInputRef.current?.click()}
                  className="group relative flex min-h-[210px] cursor-pointer flex-col items-center justify-center gap-4 overflow-hidden rounded-lg border border-dashed border-border bg-card hover:border-primary/40 hover:bg-primary/[0.03]"
                >
                  {banner ? (
                    <img
                      src={banner}
                      className="absolute inset-0 h-full w-full object-cover"
                      alt="Banner Preview"
                    loading="lazy" decoding="async" />
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
                  className="group relative flex min-h-[170px] cursor-pointer flex-col items-center justify-center gap-4 overflow-hidden rounded-lg border border-dashed border-border bg-card hover:border-primary/40 hover:bg-primary/[0.03]"
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
          <div className="animate-in space-y-7 fade-in slide-in-from-bottom-4 duration-500">
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase text-primary">Step 2 of 3</p>
              <h2 className="text-[23px] font-semibold tracking-tight">Curriculum builder</h2>
              <p className="text-sm text-muted-foreground">
                Outline the modules and topics you'll cover in your live sessions.
              </p>
            </div>

            <div className="space-y-4">
              {modules.map((module, i) => (
                <div
                  key={module.id}
                  className="space-y-4 rounded-lg border border-border bg-card p-4 sm:p-5"
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
                    <button onClick={() => setModules(modules.filter((item) => item.id !== module.id))} aria-label="Delete module" className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Lessons list */}
                  <div className="space-y-2 pl-4">
                    {module.lessons.map((lesson) => (
                      <div
                        key={lesson.id}
                        className="group flex items-center justify-between rounded-lg border border-border bg-background p-3.5 hover:border-primary/25"
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
                      className="mt-1 flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-[13px] font-semibold text-foreground tap hover:bg-muted"
                    >
                      <Plus className="h-4 w-4" /> Add Topic
                    </button>
                  </div>
                </div>
              ))}

              {/* Add Module */}
              <button
                onClick={addModule}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border py-4 text-[13.5px] font-semibold text-muted-foreground hover:border-primary/40 hover:bg-primary/[0.03] hover:text-primary"
              >
                <Plus className="h-5 w-5" /> Add New Module
              </button>
            </div>
          </div>
        )}

        {/* ══════════ Step 3 — Launch ══════════ */}
        {step === 3 && (
          <div className="animate-in space-y-7 fade-in slide-in-from-bottom-4 duration-500">
            {/* Hero */}
            <div className="space-y-3 text-left">
              <div className="mb-4 grid h-11 w-11 place-items-center rounded-lg bg-primary/10">
                <Rocket className="h-6 w-6 text-primary" strokeWidth={1.75} />
              </div>
              <p className="text-[10px] font-semibold uppercase text-primary">Step 3 of 3</p>
              <h2 className="text-[23px] font-semibold tracking-tight">Pricing and launch</h2>
              <p className="text-sm text-muted-foreground">
                Set your pricing and accessibility options.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-5">
              {/* Pricing Card */}
              <div className="space-y-6 rounded-lg border border-border bg-card p-5 sm:p-6">
                <div className="space-y-2">
                  <label className="ml-1 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    Bootcamp end date
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    disabled={loading}
                    className="h-12 w-full rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:opacity-50"
                  />
                  <p className="ml-1 text-[10.5px] leading-4 text-muted-foreground">
                    The Bootcamp Club becomes a read-only archive after this date.
                  </p>
                </div>

                <div className="space-y-4">
                  <label className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground ml-1">
                    Pricing Model
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Paid */}
                    <button
                      onClick={() => setIsFree(false)}
                      className={`space-y-3 rounded-lg p-4 text-left transition-all duration-200 ${
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
                      className={`space-y-3 rounded-lg p-4 text-left transition-all duration-200 ${
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
                      {currencyDetails.symbol}
                    </span>
                    <input
                      type="number"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder="5,000"
                      className={`h-12 w-full rounded-lg border border-border bg-background pl-10 pr-5 text-sm font-medium text-foreground outline-none transition placeholder:text-muted-foreground/40 ${
                        isFree
                          ?"opacity-40 cursor-not-allowed"
                          : "focus:ring-2 focus:ring-primary/40"
                      }`}
                      disabled={loading || isFree}
                    />
                  </div>
                </div>

                {/* Referral bonus. Shown for paid bootcamps only: there is
                    nothing to share a percentage of on a free one. */}
                {!isFree && (
                  <div className="space-y-4 rounded-lg border border-border bg-background p-4">
                    <div>
                      <p className="text-[13.5px] font-semibold tracking-tight text-foreground">Referral bonus</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        Pay people who share this bootcamp and bring you a paying learner.
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="relative w-[110px] shrink-0">
                        <input
                          type="number"
                          min="0"
                          max="50"
                          value={referralPercent}
                          onChange={(e) => setReferralPercent(e.target.value)}
                          disabled={loading}
                          className="h-11 w-full rounded-lg border border-border bg-card px-4 pr-8 text-sm font-semibold text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">%</span>
                      </div>
                      <p className="text-[11px] leading-4 text-muted-foreground">
                        Up to 50%. Set 0 to turn referrals off.
                      </p>
                    </div>

                    {/* The split, spelled out. A tutor should never be
                        surprised by what lands in their wallet. */}
                    {(() => {
                      const pct = Math.min(50, Math.max(0, Number(referralPercent) || 0));
                      const platformCut = numericPrice * 0.1;
                      const referralCut = numericPrice * (pct / 100);
                      const tutorCut = numericPrice - platformCut - referralCut;
                      return (
                        <div className="space-y-1.5 rounded-lg bg-muted/50 px-4 py-3 text-[11px]">
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Zero Club fee (10%)</span>
                            <span className="font-semibold text-foreground">{format(platformCut)}</span>
                          </div>
                          {pct > 0 && (
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">Referral bonus ({pct}%)</span>
                              <span className="font-semibold text-foreground">{format(referralCut)}</span>
                            </div>
                          )}
                          <div className="flex items-center justify-between border-t border-border pt-1.5">
                            <span className="font-semibold text-foreground">You receive</span>
                            <span className="font-bold text-primary">{format(tutorCut)}</span>
                          </div>
                          {pct > 0 && (
                            <p className="pt-1 text-[10px] leading-4 text-muted-foreground">
                              The bonus is paid only when someone buys through a referral link, and
                              reaches the referrer's wallet after the end of the month.
                            </p>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Coupon Setup */}
                <div className="space-y-4 rounded-lg border border-border bg-background p-4">
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
                          className="h-11 w-full rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
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
                            className="h-11 w-full rounded-lg border border-border bg-card px-4 pr-8 text-sm font-semibold text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                            disabled={loading}
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">%</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {couponEnabled && !isFree && normalizedCouponCode && (
                    <div className="flex items-center justify-between rounded-lg bg-primary/10 px-4 py-3 text-xs">
                      <span className="font-semibold text-primary">{normalizedCouponCode}</span>
                      <span className="text-muted-foreground">
                        Students pay {format(couponPreviewPrice)}
                      </span>
                    </div>
                  )}

                  {/* Extra codes, on top of the launch coupon above. Each can
                      carry its own discount, cap and expiry, so a creator can
                      give partners different packages. */}
                  {!isFree && (
                    <div className="space-y-2 border-t border-border pt-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-[12.5px] font-semibold tracking-tight text-foreground">More coupon codes</p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            One per partner or package. Works on published bootcamps too.
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() =>
                            setExtraCoupons((current) => [
                              ...current,
                              { key: `new-${Date.now()}`, code: "", discount_percent: "10", label: "", max_uses: "", expires_at: "" },
                            ])
                          }
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border text-foreground transition hover:bg-accent disabled:opacity-40"
                          aria-label="Add another coupon code"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>

                      {extraCoupons.map((coupon, index) => {
                        const patch = (changes: Partial<typeof coupon>) =>
                          setExtraCoupons((current) => current.map((c, i) => (i === index ? { ...c, ...changes } : c)));

                        return (
                          <div key={coupon.key} className="space-y-2 rounded-lg border border-border bg-card p-3">
                            <div className="flex items-center gap-2">
                              <input
                                value={coupon.code}
                                onChange={(e) => patch({ code: e.target.value.toUpperCase() })}
                                placeholder="PARTNER20"
                                disabled={loading}
                                className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-[13px] font-semibold outline-none focus:border-primary"
                              />
                              <div className="relative w-[86px] shrink-0">
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  value={coupon.discount_percent}
                                  onChange={(e) => patch({ discount_percent: e.target.value })}
                                  disabled={loading}
                                  className="h-10 w-full rounded-lg border border-border bg-background px-3 pr-7 text-[13px] font-semibold outline-none focus:border-primary"
                                />
                                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-bold text-muted-foreground">%</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  // Remember saved rows so they can be deleted
                                  // from the table when the form is saved.
                                  if (coupon.id) setRemovedCouponIds((ids) => [...ids, coupon.id!]);
                                  setExtraCoupons((current) => current.filter((_, i) => i !== index));
                                }}
                                disabled={loading}
                                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition hover:text-destructive disabled:opacity-40"
                                aria-label="Remove this coupon"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>

                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                              <input
                                value={coupon.label}
                                onChange={(e) => patch({ label: e.target.value })}
                                placeholder="Package name (optional)"
                                disabled={loading}
                                className="h-9 rounded-lg border border-border bg-background px-3 text-[12px] outline-none focus:border-primary"
                              />
                              <input
                                type="number"
                                min="1"
                                value={coupon.max_uses}
                                onChange={(e) => patch({ max_uses: e.target.value })}
                                placeholder="Max uses"
                                disabled={loading}
                                className="h-9 rounded-lg border border-border bg-background px-3 text-[12px] outline-none focus:border-primary"
                              />
                              <input
                                type="date"
                                value={coupon.expires_at}
                                onChange={(e) => patch({ expires_at: e.target.value })}
                                disabled={loading}
                                className="h-9 rounded-lg border border-border bg-background px-3 text-[12px] outline-none focus:border-primary"
                              />
                            </div>
                            <p className="text-[10px] text-muted-foreground">
                              Leave max uses and the date empty for unlimited and no expiry.
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Visibility Card */}
              <div className="space-y-4 rounded-lg border border-border bg-card p-5">
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
      <footer className="fixed bottom-0 left-0 right-0 z-50 border-t hairline bg-background/95 px-4 py-3 backdrop-blur-xl md:px-7">
        <div className="mx-auto flex max-w-[820px] items-center justify-between">
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
          className="flex h-11 items-center gap-2 rounded-lg bg-primary px-6 text-[14px] font-semibold text-primary-foreground tap hover:opacity-90 disabled:opacity-50"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {step === 3 ? (bootcampId ? "Save bootcamp" : "Launch bootcamp") : "Continue"}
        </button>
        </div>
      </footer>
    </div>
  );
}
