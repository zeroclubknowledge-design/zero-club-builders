import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Award,
  Bookmark,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  FileText,
  Layers3,
  Loader2,
  PlayCircle,
  Pencil,
  ShieldCheck,
  Share2,
  Sparkles,
  Star,
  Users,
  Video,
} from "@/components/icons/solar";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { supabase } from "@/lib/supabase";
import { RequestFundsButton } from "@/components/RequestFundsButton";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useWalletCurrency } from "@/hooks/useWalletCurrency";
import { useQuery } from "@tanstack/react-query";
import { LinkifiedText } from "@/components/LinkifiedText";
import { RichText } from "@/components/RichText";
import { ZeroGiftPaymentOption, zeroGiftBalanceQueryKey } from "@/components/ZeroGiftPaymentOption";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/app/bootcamps/$id")({
  component: BootcampDetail,
});

function BootcampDetail() {
  const queryClient = useQueryClient();
  const { format } = useWalletCurrency();
  const { id } = Route.useParams();

  const { data: bootcampData, isLoading: isBootcampLoading, isError: bootcampFailed, refetch } = useQuery({
    queryKey: ["bootcamp", id],
    queryFn: async () => {
      const { data: bootcamp, error } = await supabase
        .from("bootcamps")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;

      const { data: creator } = await supabase
        .from("profiles")
        .select("id, username, full_name, avatar_url, account_type")
        .eq("id", bootcamp.creator_id)
        .maybeSingle();

      const { data: fetchedModules, error: modulesError } = await supabase
        .from("modules")
        .select("*")
        .eq("bootcamp_id", id)
        .order("order_index", { ascending: true });

      if (modulesError) throw modulesError;

      const moduleIds = (fetchedModules || []).map((module: any) => module.id);
      const { data: lessons } = moduleIds.length
        ? await supabase.from("lessons").select("*").in("module_id", moduleIds).order("order_index", { ascending: true })
        : { data: [] as any[] };
      const modules = (fetchedModules || []).map((module: any) => ({
        ...module,
        lessons: (lessons || []).filter((lesson: any) => lesson.module_id === module.id),
      }));

      const { data: club } = await supabase
        .from("clubs")
        .select("*")
        .eq("bootcamp_id", bootcamp.id)
        .maybeSingle();

      return { bootcamp: { ...bootcamp, profiles: creator }, modules, club };
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
  const [isClubAdmin, setIsClubAdmin] = useState(false);
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [wishlistLoading, setWishlistLoading] = useState(false);
  const [applyZeroGift, setApplyZeroGift] = useState(false);
  const [viewerChecked, setViewerChecked] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);

  useEffect(() => {
    if (bootcamp?.id) void checkEnrollment();
  }, [bootcamp?.id, club?.id]);

  useEffect(() => {
    setDescriptionExpanded(false);
  }, [id]);

  async function checkEnrollment() {
    setViewerChecked(false);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setCurrentUser(null);
        setIsEnrolled(false);
        setIsWishlisted(false);
        setIsClubAdmin(false);
        return;
      }

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
        .maybeSingle();
      setIsEnrolled(Boolean(data));

      const { data: wishlist } = await supabase
        .from("bootcamp_wishlists")
        .select("id")
        .eq("profile_id", session.user.id)
        .eq("bootcamp_id", bootcamp.id)
        .maybeSingle();
      setIsWishlisted(Boolean(wishlist));

      if (!club?.id) {
        setIsClubAdmin(false);
        return;
      }

      const { data: membership } = await supabase
        .from("club_members")
        .select("role")
        .eq("club_id", club.id)
        .eq("profile_id", session.user.id)
        .eq("role", "Administrator")
        .maybeSingle();
      setIsClubAdmin(Boolean(membership));
    } finally {
      setViewerChecked(true);
    }
  }

  async function handleWishlist() {
    if (!currentUser?.id) {
      toast.error("Please sign in to save this bootcamp");
      return;
    }

    setWishlistLoading(true);
    try {
      if (isWishlisted) {
        const { error } = await supabase
          .from("bootcamp_wishlists")
          .delete()
          .eq("profile_id", currentUser.id)
          .eq("bootcamp_id", bootcamp.id);
        if (error) throw error;

        setIsWishlisted(false);
        toast.success("Removed from your wishlist");
      } else {
        const { error } = await supabase
          .from("bootcamp_wishlists")
          .insert({ profile_id: currentUser.id, bootcamp_id: bootcamp.id });
        if (error && error.code !== "23505") throw error;

        setIsWishlisted(true);
        toast.success("Bootcamp saved to your wishlist");
      }
    } catch (error: any) {
      toast.error(error.message || "Could not update your wishlist");
    } finally {
      setWishlistLoading(false);
    }
  }

  async function handleEnroll() {
    if (!currentUser) {
      toast.error("Please sign in to enroll");
      return;
    }

    setLoading(true);
    try {
      // Enrols the caller, decided server-side from their session. The old
      // server function passed profileId from the browser and ran without a
      // session, which both failed RLS and would have let anyone enrol anyone.
      const { data: enrollmentResult, error: enrollError } = await supabase.rpc("enroll_in_bootcamp", {
        p_bootcamp_id: bootcamp.id,
        p_coupon_code: appliedCoupon ? couponInput.trim().toUpperCase() : null,
        p_apply_gift: applyZeroGift,
      });
      if (enrollError) throw enrollError;

      const result = enrollmentResult as any;
      if (result?.status === "insufficient_funds") {
        const shortfall = Math.max(0, Number(result.shortfall) || 0);
        toast.error(
          shortfall > 0
            ? `Insufficient wallet balance. Add ${format(shortfall)} to enroll.`
            : "Insufficient wallet balance. Add money to your wallet and try again."
        );
        return;
      }

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
      queryClient.invalidateQueries({ queryKey: zeroGiftBalanceQueryKey("bootcamps") });
      const giftApplied = Math.max(0, Number(result?.gift_applied) || 0);
      const walletCharged = Math.max(0, Number(result?.wallet_charged) || 0);
      toast.success(
        giftApplied > 0 && walletCharged > 0
          ? `${format(giftApplied)} Zero Gift and ${format(walletCharged)} from your wallet applied. You are enrolled!`
          : giftApplied > 0
            ? `${format(giftApplied)} Zero Gift applied. You are enrolled!`
          : Number(result?.charged) > 0
            ? `${format(Number(result.charged))} paid from your wallet. You are enrolled!`
          : "Enrolled successfully!"
      );
    } catch (error: any) {
      const message = String(error?.message || "Could not complete enrollment");
      toast.error(
        /insufficient wallet|wallet balance is too low/i.test(message)
          ? "Insufficient wallet balance. Add money to your wallet and try again."
          : message
      );
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

  if (isBootcampLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-4 text-sm font-medium text-muted-foreground">Loading bootcamp details...</p>
      </div>
    );
  }

  if (bootcampFailed || !bootcamp) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
        <div className="grid h-12 w-12 place-items-center rounded-lg bg-primary/10"><BookOpen className="h-5 w-5 text-primary" /></div>
        <h1 className="mt-4 text-[18px] font-semibold">Bootcamp unavailable</h1>
        <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-muted-foreground">We could not load this bootcamp. It may still be publishing, or your connection may have been interrupted.</p>
        <div className="mt-5 flex gap-2"><Link to="/app/bootcamps" className="rounded-lg border border-border px-4 py-2.5 text-[13px] font-semibold">Back to bootcamps</Link><button onClick={() => refetch()} className="rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-primary-foreground">Try again</button></div>
      </div>
    );
  }

  const totalLessons = modules.reduce((sum: number, module: any) => sum + (module.lessons?.length || 0), 0);
  const basePrice = Number(bootcamp.price) || 0;
  const tier = currentUser?.tier || "Basic";
  let discountPct = 0;
  if (tier === "Premium") discountPct = 0.03;
  else if (tier === "Premium+") discountPct = 0.05;

  const finalPrice = Math.round(basePrice * (1 - discountPct));
  const couponDiscountPct = Math.min(100, Math.max(0, Number(bootcamp.coupon_discount_percent) || 0));
  const couponPrice = appliedCoupon ? Math.round(finalPrice * (1 - couponDiscountPct / 100)) : finalPrice;
  const formatPrice = (value: number) => format(value);
  const canManageBootcamp = currentUser?.id === bootcamp.creator_id || currentUser?.id === bootcamp.assigned_tutor_id || isClubAdmin;
  const showLearnerActions = viewerChecked && !canManageBootcamp;
  const descriptionText = String(bootcamp.description || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const descriptionCanExpand = descriptionText.length > 180 || /<(ul|ol|h2|h3|blockquote)\b/i.test(String(bootcamp.description || ""));

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="relative h-48 w-full shrink-0">
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

      <div className="relative z-20 flex flex-1 flex-col px-5 pt-5">
        <div className="space-y-3">
          <div className="inline-flex rounded-full border border-primary/20 bg-primary/15 px-2.5 py-1 text-[10px] font-bold uppercase text-primary">
            {bootcamp.category}
          </div>
          <h1 className="font-display text-2xl font-bold leading-tight">{bootcamp.title}</h1>
          <div>
            <div className="relative">
              <div
                id="bootcamp-description"
                className={`text-sm leading-relaxed text-muted-foreground ${descriptionCanExpand && !descriptionExpanded ? "max-h-28 overflow-hidden" : ""}`}
              >
                {/* Formatted descriptions render with their headings and bullets;
                    plain older ones keep their line breaks and clickable links. */}
                {looksFormatted(bootcamp.description)
                  ? <RichText content={bootcamp.description} />
                  : <LinkifiedText text={bootcamp.description || ""} />}
              </div>
              {descriptionCanExpand && !descriptionExpanded && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-background to-transparent" />
              )}
            </div>
            {descriptionCanExpand && (
              <button
                type="button"
                onClick={() => setDescriptionExpanded((expanded) => !expanded)}
                aria-expanded={descriptionExpanded}
                aria-controls="bootcamp-description"
                className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-primary transition hover:opacity-80"
              >
                {descriptionExpanded ? "Show less" : "Read full description"}
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${descriptionExpanded ? "rotate-180" : ""}`} />
              </button>
            )}
          </div>

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

          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <div>Created by <span className="font-bold text-primary">{bootcamp.profiles?.full_name || bootcamp.profiles?.username}</span></div>
            {bootcamp.profiles?.account_type === "Institution" && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-primary/10 text-primary uppercase tracking-wide">
                Institution
              </span>
            )}
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

        {/* Each item is a card rather than a bare icon and label, and the
            section carries its own bottom padding — previously the footer's
            border sat directly under the last row with nothing between them.

            The fifth item spans both columns on purpose: five things in a
            two-column grid leaves one stranded beside an empty cell, which is
            the sort of gap that reads as a bug rather than a layout. */}
        <section className="mt-10 pb-10">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            What you get
          </h2>
          <p className="mt-1.5 text-[17px] font-semibold tracking-tight text-foreground">
            This bootcamp includes
          </p>

          <div className="mt-4 grid grid-cols-2 gap-2.5">
            {[
              { icon: Award, label: "Proof of Work Certificate", note: "Verifiable on your profile" },
              { icon: BookOpen, label: "Proof of Knowledge", note: "Assessed, not assumed" },
              { icon: FileText, label: "ZeroNotes", note: "Notes you keep for good" },
              { icon: Sparkles, label: "Earn XP", note: "Progress that compounds" },
              { icon: Users, label: "Tutor Access", note: "Ask questions as you build" },
            ].map((item, index, all) => (
              <div
                key={item.label}
                className={`flex items-start gap-3 rounded-lg border border-border/60 bg-card p-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_8px_20px_-16px_rgba(0,0,0,0.16)] ${
                  index === all.length - 1 && all.length % 2 === 1 ? "col-span-2" : ""
                }`}
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/[0.08] text-primary ring-1 ring-primary/15">
                  <item.icon className="h-[17px] w-[17px]" strokeWidth={1.9} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-semibold leading-tight tracking-tight text-foreground">
                    {item.label}
                  </span>
                  <span className="mt-0.5 block text-[10.5px] leading-4 text-muted-foreground">
                    {item.note}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <footer className="mt-auto -mx-5 border-t border-border bg-card/60 px-5 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-8">
          <div className="space-y-5">
            {canManageBootcamp && (
              <Link
                to="/app/bootcamps/$id/edit"
                params={{ id: bootcamp.id }}
                search={{ source: currentUser?.account_type === "Institution" ? "institution" : "tutor" }}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-primary/25 bg-primary/[0.06] text-[13px] font-semibold text-primary transition hover:bg-primary/[0.1]"
              >
                <Pencil className="h-4 w-4" /> Edit bootcamp
              </Link>
            )}
            {viewerChecked ? (
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-primary">
                    {canManageBootcamp ? "Your bootcamp" : "Ready to join?"}
                  </p>
                  <h2 className="mt-1 text-xl font-black text-foreground">
                    {canManageBootcamp ? "Manage this bootcamp" : "Enroll in this bootcamp"}
                  </h2>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {canManageBootcamp
                      ? "Edit the programme, start a live class, share access, or open its club."
                      : "Get the curriculum, live class access, ZeroNotes, XP rewards, and the cohort club."}
                  </p>
                </div>
                <ShieldCheck className="h-6 w-6 shrink-0 text-primary" />
              </div>
            ) : (
              <div className="space-y-2" aria-label="Checking bootcamp access">
                <div className="h-3 w-24 animate-pulse rounded-full bg-muted" />
                <div className="h-6 w-56 max-w-full animate-pulse rounded-md bg-muted" />
              </div>
            )}

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

            {showLearnerActions && !isEnrolled && basePrice > 0 && (
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

            {showLearnerActions && !isEnrolled && couponPrice > 0 && (
              <ZeroGiftPaymentOption
                service="bootcamps"
                amount={couponPrice}
                applied={applyZeroGift}
                onAppliedChange={setApplyZeroGift}
                formatAmount={formatPrice}
              />
            )}

            {showLearnerActions && (
              isEnrolled ? (
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
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3.5 text-sm font-bold text-accent-foreground shadow-[0_10px_28px_-12px_rgba(204,32,143,0.75)] transition hover:brightness-95 active:scale-[0.98] disabled:opacity-70"
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Enroll Now
                </button>
              )
            )}

            {/* Short of the fee? Ask for it from here rather than leaving,
                finding the wallet and typing the amount out again. */}
            {showLearnerActions && !isEnrolled && couponPrice > 0 && (
              <div className="mt-2.5">
                <RequestFundsButton
                  amount={couponPrice}
                  purpose={`Enrolment for ${bootcamp?.title || "a Zero Club bootcamp"}`}
                  label="Ask someone to sponsor this"
                />
              </div>
            )}

            {canManageBootcamp && <BootcampShareAction bootcamp={bootcamp} />}

            {canManageBootcamp && (
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

            {showLearnerActions && (
              <button
                type="button"
                onClick={handleWishlist}
                disabled={wishlistLoading}
                aria-pressed={isWishlisted}
                className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl border py-3.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  isWishlisted
                    ? "border-primary/30 bg-primary/[0.08] text-primary"
                    : "border-border text-foreground active:bg-accent/30"
                }`}
              >
                {wishlistLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Bookmark className={`h-4 w-4 ${isWishlisted ? "fill-current" : ""}`} />
                )}
                {isWishlisted ? "Saved to Wishlist" : "Add to Wishlist"}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

/**
 * State-aware sharing (spec section 20). Before the bootcamp starts the
 * creator shares the Zero Form; once it is live the same button shares the
 * bootcamp itself. The switch is driven by the server's view of the form.
 */
function BootcampShareAction({ bootcamp }: { bootcamp: any }) {
  const { data } = useQuery({
    queryKey: ["zero-form-for-bootcamp", bootcamp?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("zero_forms")
        .select("slug, status")
        .eq("bootcamp_id", bootcamp.id)
        .maybeSingle();
      if (error) return null;
      return data;
    },
    enabled: !!bootcamp?.id,
    retry: false,
  });

  const started = bootcamp?.starts_at ? new Date(bootcamp.starts_at) <= new Date() : true;
  const usesZeroForm = !!data?.slug && data.status === "published" && !started;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = usesZeroForm ? `${origin}/form/${data!.slug}` : `${origin}/app/bootcamps/${bootcamp.id}`;
  const label = usesZeroForm ? "Share Zero Form" : "Share bootcamp";

  const handleShare = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: bootcamp?.title || "Zero Club bootcamp", url });
        return;
      } catch { /* dismissed */ }
    }
    await navigator.clipboard.writeText(url);
    toast.success(usesZeroForm ? "Zero Form link copied" : "Bootcamp link copied");
  };

  return (
    <div className="mt-3">
      <button
        onClick={handleShare}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card py-3.5 text-sm font-bold transition active:scale-[0.98]"
      >
        <Share2 className="h-4 w-4" />
        {label}
      </button>
      {usesZeroForm && (
        <p className="mt-2 text-center text-[11px] leading-4 text-muted-foreground">
          Learners register early at your Zero Form price. This switches to the bootcamp link automatically on launch day.
        </p>
      )}
    </div>
  );
}

/** True when a description was written with the rich text editor. */
function looksFormatted(text?: string | null) {
  return /<(p|ul|ol|li|h2|h3|strong|em|br|blockquote)\b/i.test(String(text || ""));
}
