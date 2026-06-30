import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Award,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  FileText,
  Layers3,
  Loader2,
  PlayCircle,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
  Video,
} from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { supabase } from "@/lib/supabase";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { enrollUserAction } from "@/api";
import { useQuery } from "@tanstack/react-query";

export const Route = createFileRoute("/app/bootcamps/$id")({
  component: BootcampDetail,
});

function BootcampDetail() {
  const { id } = Route.useParams();

  const { data: bootcampData, isLoading: isBootcampLoading } = useQuery({
    queryKey: ["bootcamp", id],
    queryFn: async () => {
      const { data: bootcamp, error } = await supabase
        .from("bootcamps")
        .select("*, profiles(*)")
        .eq("id", id)
        .single();

      if (error) throw error;

      const { data: modules, error: modulesError } = await supabase
        .from("modules")
        .select("*, lessons(*)")
        .eq("bootcamp_id", id)
        .order("order_index", { ascending: true });

      if (modulesError) throw modulesError;

      const { data: club } = await supabase
        .from("clubs")
        .select("*")
        .eq("name", bootcamp.title)
        .eq("creator_id", bootcamp.creator_id)
        .eq("category", "Bootcamp")
        .single();

      return { bootcamp, modules, club };
    },
  });

  const { bootcamp, modules: rawModules = [], club = null } = bootcampData || {};
  const modules = rawModules || [];

  const [loading, setLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState(false);
  const [couponMessage, setCouponMessage] = useState("");

  useEffect(() => {
    if (bootcamp?.id) checkEnrollment();
  }, [bootcamp?.id]);

  async function checkEnrollment() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single();
      setCurrentUser(prof || session.user);

      const { data } = await supabase
        .from("enrollments")
        .select("*")
        .eq("profile_id", session.user.id)
        .eq("bootcamp_id", bootcamp.id)
        .single();
      setIsEnrolled(!!data);
    }
  }

  async function handleEnroll() {
    if (!currentUser) {
      toast.error("Please sign in to enroll");
      return;
    }

    setLoading(true);
    try {
      await (enrollUserAction as any)({
        data: {
          bootcampId: bootcamp.id,
          profileId: currentUser.id,
        },
      });

      if (club) {
        await supabase.from("club_members").insert([
          {
            club_id: club.id,
            profile_id: currentUser.id,
            role: "Member",
          },
        ]);
      }

      setIsEnrolled(true);
      toast.success("Enrolled successfully!");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }

  function handleApplyCoupon() {
    const code = couponInput.trim().toUpperCase();
    const bootcampCode = bootcamp?.coupon_code?.trim().toUpperCase();

    if (!code) {
      setAppliedCoupon(false);
      setCouponMessage("Enter a coupon code");
      return;
    }

    if (!bootcampCode || code !== bootcampCode) {
      setAppliedCoupon(false);
      setCouponMessage("Coupon not found");
      return;
    }

    setCouponInput(code);
    setAppliedCoupon(true);
    setCouponMessage("Coupon applied");
  }

  if (isBootcampLoading || !bootcamp) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-4 text-sm font-medium text-muted-foreground">Loading bootcamp details...</p>
      </div>
    );
  }

  const totalLessons = modules.reduce((sum: number, module: any) => sum + (module.lessons?.length || 0), 0);
  const basePrice = Number(bootcamp.price) || 0;
  const tier = currentUser?.tier || "Basic";
  let discountPct = 0;
  if (tier === "Premium") discountPct = 0.3;
  else if (tier === "Premium+") discountPct = 0.5;

  const finalPrice = Math.round(basePrice * (1 - discountPct));
  const couponDiscountPct = Math.min(100, Math.max(0, Number(bootcamp.coupon_discount_percent) || 0));
  const couponPrice = appliedCoupon ? Math.round(finalPrice * (1 - couponDiscountPct / 100)) : finalPrice;
  const formatPrice = (value: number) => `NGN ${value.toLocaleString()}`;
  const isTutor = currentUser?.id === bootcamp.creator_id;

  return (
    <div className="min-h-screen bg-background pb-12">
      <div className="relative h-48 w-full">
        <div className="absolute inset-0 z-10 bg-gradient-to-t from-background to-transparent" />
        <div className="h-full w-full overflow-hidden bg-muted">
          {bootcamp.banner_url ? (
            <img src={bootcamp.banner_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-gradient-primary" style={{ background: "linear-gradient(135deg,#cc208f,#a78bfa)" }} />
          )}
        </div>
        <Link
          to="/app/bootcamps"
          className="absolute left-4 top-4 z-20 grid h-9 w-9 place-items-center rounded-full bg-black/40 text-white backdrop-blur-md transition active:scale-95"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
      </div>

      <div className="relative z-20 -mt-12 px-5">
        <div className="space-y-3">
          <div className="inline-flex rounded-full border border-primary/20 bg-primary/15 px-2.5 py-1 text-[10px] font-bold uppercase text-primary">
            {bootcamp.category}
          </div>
          <h1 className="font-display text-2xl font-bold leading-tight">{bootcamp.title}</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">{bootcamp.description}</p>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
            <div className="flex items-center gap-1">
              <span className="font-bold text-warning">5.0</span>
              <div className="flex text-warning">
                <Star className="h-3 w-3 fill-current" />
                <Star className="h-3 w-3 fill-current" />
                <Star className="h-3 w-3 fill-current" />
                <Star className="h-3 w-3 fill-current" />
                <Star className="h-3 w-3 fill-current" />
              </div>
              <span className="text-muted-foreground">(New)</span>
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            Created by <span className="font-bold text-primary">{bootcamp.profiles?.full_name || bootcamp.profiles?.username}</span>
          </div>

          <div className="mt-5 grid grid-cols-3 rounded-lg border border-border bg-card/70 text-center shadow-soft">
            <div className="px-3 py-3">
              <div className="flex items-center justify-center gap-1 text-warning">
                <Star className="h-3.5 w-3.5 fill-current" />
                <span className="text-sm font-black text-foreground">5.0</span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">Rating</p>
            </div>
            <div className="border-x border-border px-3 py-3">
              <Layers3 className="mx-auto h-4 w-4 text-primary" />
              <p className="mt-1 text-sm font-black text-foreground">{modules.length}</p>
              <p className="text-[11px] text-muted-foreground">Sections</p>
            </div>
            <div className="px-3 py-3">
              <Users className="mx-auto h-4 w-4 text-primary" />
              <p className="mt-1 text-sm font-black text-foreground">Live</p>
              <p className="text-[11px] text-muted-foreground">Cohort</p>
            </div>
          </div>
        </div>

        <section className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold">Bootcamp content</h2>
            <span className="text-xs text-muted-foreground">{modules.length} sections</span>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            {modules.length} sections / {totalLessons} lessons / Live projects and tutor guidance
          </p>

          <Accordion type="single" collapsible className="overflow-hidden rounded-lg border border-border bg-card/30">
            {modules.map((module: any, i: number) => (
              <AccordionItem key={i} value={`item-${i}`} className="border-border px-4 last:border-b-0">
                <AccordionTrigger className="py-4 text-left text-sm font-semibold hover:no-underline">
                  <span className="flex flex-col items-start gap-1">
                    <span>{module.title}</span>
                    <span className="text-[11px] font-medium text-muted-foreground">{module.lessons?.length || 0} lessons</span>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pb-4 pt-1">
                  {module.lessons?.sort((a: any, b: any) => a.order_index - b.order_index).map((lesson: any, j: number) => (
                    <div key={j} className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        {lesson.content_type === "video" ? (
                          <PlayCircle className="h-4 w-4 text-primary" />
                        ) : (
                          <FileText className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="text-xs leading-snug">{lesson.title}</span>
                      </div>
                      <span className="shrink-0 text-[10px] text-muted-foreground">{lesson.duration || "5m"}</span>
                    </div>
                  ))}
                  {(!module.lessons || module.lessons.length === 0) && (
                    <p className="text-xs italic text-muted-foreground">No lessons in this module yet.</p>
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-bold">This bootcamp includes:</h2>
          <div className="mt-4 grid grid-cols-2 gap-4">
            {[
              { icon: Award, label: "Proof of Work Certificate" },
              { icon: BookOpen, label: "Proof of Knowledge" },
              { icon: FileText, label: "ZeroNotes" },
              { icon: Sparkles, label: "Earn XP" },
              { icon: Users, label: "Tutor Access" },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2 text-xs text-muted-foreground">
                <item.icon className="h-4 w-4 text-primary" />
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </section>

        <footer className="mt-10 -mx-5 border-t border-border bg-card/60 px-5 pb-8 pt-8">
          <div className="space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-primary">Ready to join?</p>
                <h2 className="mt-1 text-xl font-black text-foreground">Enroll in this bootcamp</h2>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Get the curriculum, live class access, ZeroNotes, XP rewards, and the cohort club.
                </p>
              </div>
              <ShieldCheck className="h-6 w-6 shrink-0 text-primary" />
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <span className="font-display text-3xl font-black text-foreground">{formatPrice(couponPrice)}</span>
              {(discountPct > 0 || appliedCoupon) && (
                <>
                  <span className="pb-1 text-sm font-bold text-muted-foreground/60 line-through">
                    {formatPrice(appliedCoupon ? finalPrice : basePrice)}
                  </span>
                  {discountPct > 0 && (
                    <span className="mb-1 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[10px] font-black text-primary">
                      {discountPct * 100}% {tier} OFF
                    </span>
                  )}
                  {appliedCoupon && (
                    <span className="mb-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-black text-emerald-500">
                      {couponDiscountPct}% COUPON OFF
                    </span>
                  )}
                </>
              )}
            </div>

            {!isEnrolled && basePrice > 0 && (
              <div className="border-t border-border/50 pt-5">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-black text-foreground">Apply Coupon</p>
                  {couponMessage && (
                    <span className={`text-[11px] font-bold ${appliedCoupon ? "text-emerald-500" : "text-muted-foreground"}`}>
                      {couponMessage}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    value={couponInput}
                    onChange={(e) => {
                      setCouponInput(e.target.value.toUpperCase());
                      setCouponMessage("");
                      setAppliedCoupon(false);
                    }}
                    placeholder="Enter Coupon"
                    className="min-w-0 flex-1 rounded-xl border border-border bg-background px-4 py-3 text-sm font-bold tracking-wide text-foreground outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
                  />
                  <button
                    onClick={handleApplyCoupon}
                    className="rounded-xl border border-primary/50 px-5 py-3 text-sm font-black text-primary transition active:scale-[0.98]"
                  >
                    Apply
                  </button>
                </div>
                {appliedCoupon && (
                  <div className="mt-2 flex items-center justify-between rounded-xl border border-border bg-background px-4 py-3 text-sm">
                    <span className="font-bold text-foreground">{couponInput}</span>
                    <span className="font-bold text-emerald-500">Applied!</span>
                  </div>
                )}
              </div>
            )}

            {isEnrolled ? (
              <div className="space-y-3">
                <div className="flex items-center justify-center gap-2 rounded-xl bg-success/10 py-3.5 text-sm font-bold text-success">
                  <CheckCircle2 className="h-5 w-5" />
                  You are enrolled
                </div>
                <Link
                  to="/app/live/$classId"
                  params={{ classId: bootcamp.id }}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-500 py-3.5 text-sm font-bold text-white shadow-lg shadow-red-500/20 transition active:scale-[0.98]"
                >
                  <Video className="h-5 w-5" />
                  Join Live Class
                </Link>
                {club && (
                  <Link
                    to="/app/clubs/chat"
                    search={{ clubId: club.id, showRules: "false" }}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary/10 py-3.5 text-sm font-bold text-primary shadow-sm transition active:scale-[0.98]"
                  >
                    <Users className="h-5 w-5" />
                    Enter Club
                  </Link>
                )}
              </div>
            ) : (
              <button
                onClick={handleEnroll}
                disabled={loading}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary py-3.5 text-sm font-bold text-primary-foreground shadow-glow transition active:scale-[0.98] disabled:opacity-70"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Enroll Now
              </button>
            )}

            {(!isEnrolled && isTutor) && (
              <div className="mt-3 space-y-3">
                <Link
                  to="/app/live/$classId"
                  params={{ classId: bootcamp.id }}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-500 py-3.5 text-sm font-bold text-white shadow-lg shadow-red-500/20 transition active:scale-[0.98]"
                >
                  <Video className="h-5 w-5" />
                  Go Live (Tutor)
                </Link>
                {club && (
                  <Link
                    to="/app/clubs/chat"
                    search={{ clubId: club.id, showRules: "false" }}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary/10 py-3.5 text-sm font-bold text-primary shadow-sm transition active:scale-[0.98]"
                  >
                    <Users className="h-5 w-5" />
                    Enter Club (Admin)
                  </Link>
                )}
              </div>
            )}

            <button className="mt-3 w-full rounded-xl border border-border py-3.5 text-sm font-bold transition active:bg-accent/30">
              Add to Wishlist
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
