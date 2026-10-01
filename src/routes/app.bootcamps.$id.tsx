import { hasShareSheet, openShareSheet } from "@/components/ShareSheet";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  BadgeCheck,
  Bookmark,
  BookOpen,
  Check,
  CheckCircle2,
  FileText,
  Loader2,
  Pencil,
  Play,
  ShieldCheck,
  Share2,
  Users,
  Video,
} from "@/components/icons/glyphs";
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
import { useGoBack } from "@/hooks/useGoBack";

export const Route = createFileRoute("/app/bootcamps/$id")({
  component: BootcampDetail,
});

function BootcampDetail() {
  const queryClient = useQueryClient();
  const goBack = useGoBack("/app/bootcamps");
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
  const [viewerId, setViewerId] = useState<string | null>(null);
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
  const [couponOpen, setCouponOpen] = useState(false);

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
        setViewerId(null);
        setIsEnrolled(false);
        setIsWishlisted(false);
        setIsClubAdmin(false);
        return;
      }

      setViewerId(session.user.id);

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
      <div className="flex min-h-screen flex-col items-center justify-center bg-canvas py-20">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
        <p className="mt-4 text-sm font-medium text-muted-foreground">Loading bootcamp details...</p>
      </div>
    );
  }

  if (bootcampFailed || !bootcamp) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-6 text-center">
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-foreground/[0.06]"><BookOpen className="h-5 w-5" /></div>
        <h1 className="mt-4 text-[18px] font-semibold">Bootcamp unavailable</h1>
        <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-muted-foreground">We could not load this bootcamp. It may still be publishing, or your connection may have been interrupted.</p>
        <div className="mt-5 flex gap-2"><Link to="/app/bootcamps" className="flex h-10 items-center rounded-full border border-foreground/30 px-4 text-[14px] font-semibold">Back to bootcamps</Link><button onClick={() => refetch()} className="h-10 rounded-full bg-foreground px-4 text-[14px] font-semibold text-background">Try again</button></div>
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
  const viewerIds = [viewerId, currentUser?.id, currentUser?.userId, currentUser?.user_id]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
  const canManageBootcamp = viewerIds.includes(String(bootcamp.creator_id || "").toLowerCase())
    || viewerIds.includes(String(bootcamp.assigned_tutor_id || "").toLowerCase())
    || isClubAdmin;
  const descriptionText = String(bootcamp.description || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const descriptionCanExpand = descriptionText.length > 180 || /<(ul|ol|h2|h3|blockquote)\b/i.test(String(bootcamp.description || ""));

  const creatorName = bootcamp.profiles?.full_name || bootcamp.profiles?.username || "Zero Club";
  const isInstitution = bootcamp.profiles?.account_type === "Institution";
  const shareBootcamp = async () => {
    const url = `${window.location.origin}/app/bootcamps/${bootcamp.id}`;
    if (hasShareSheet()) {
      try {
        await openShareSheet({ title: bootcamp.title || "Zero Club bootcamp", url });
        return;
      } catch { /* dismissed */ }
    }
    await navigator.clipboard.writeText(url);
    toast.success("Bootcamp link copied");
  };

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <div className="zc-page-width relative h-[220px] w-full shrink-0 overflow-hidden bg-[#221d22] md:mx-auto md:mt-2 md:max-w-[680px] md:rounded-t-xl">
        {bootcamp.banner_url ? (
          <img src={bootcamp.banner_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
        ) : (
          <div className="h-full w-full" style={{ background: "linear-gradient(135deg,#cc208f,#6b2a8f 55%,#1d1b3a)" }} />
        )}
        <button
          type="button"
          onClick={goBack}
          aria-label="Back"
          className="absolute left-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-black/45 text-white transition active:scale-95"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={shareBootcamp}
          aria-label="Share"
          className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-black/45 text-white transition active:scale-95"
        >
          <Share2 className="h-[18px] w-[18px]" />
        </button>
      </div>

      <div className="zc-page-width mx-auto flex w-full max-w-[680px] flex-1 flex-col gap-2">
        <section className="bg-card p-4 md:rounded-b-xl md:border md:border-t-0 md:border-border">
          {bootcamp.category && <span className="text-[12px] font-semibold text-[#a3186f]">{bootcamp.category}</span>}
          <h1 className="mt-1 font-display text-[24px] font-semibold leading-[1.15] text-foreground">{bootcamp.title}</h1>
          <div className="mt-3 flex items-center gap-2.5">
            <div className="h-8 w-8 shrink-0 overflow-hidden rounded-lg bg-muted">
              {bootcamp.profiles?.avatar_url ? (
                <img src={bootcamp.profiles.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="grid h-full w-full place-items-center text-[12px] font-semibold text-muted-foreground">{creatorName.charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              {bootcamp.profiles?.id ? (
                <Link to="/app/profile/$id" params={{ id: bootcamp.profiles.id }} className="flex items-center gap-1 text-[14px] font-semibold text-foreground hover:underline">
                  <span className="truncate">{creatorName}</span>
                  {isInstitution && <BadgeCheck className="h-4 w-4 shrink-0 text-[#cc208f]" />}
                </Link>
              ) : (
                <p className="text-[14px] font-semibold">{creatorName}</p>
              )}
              <p className="text-[12px] text-muted-foreground">{isInstitution ? "Institution" : "Tutor"}</p>
            </div>
          </div>
          <div className="mt-3.5 grid grid-cols-3 border-t border-border pt-3 text-center">
            <div><p className="text-[16px] font-semibold">{modules.length}</p><p className="text-[12px] text-muted-foreground">Sections</p></div>
            <div><p className="text-[16px] font-semibold">{totalLessons}</p><p className="text-[12px] text-muted-foreground">Lessons</p></div>
            <div><p className="text-[16px] font-semibold">Live</p><p className="text-[12px] text-muted-foreground">Cohort</p></div>
          </div>
        </section>

        <section className="bg-card p-4 md:rounded-xl md:border md:border-border">
          {!viewerChecked ? (
            <div className="space-y-3" aria-label="Checking bootcamp access">
              <div className="h-6 w-32 animate-pulse rounded-md bg-muted" />
              <div className="h-12 w-full animate-pulse rounded-full bg-muted" />
            </div>
          ) : canManageBootcamp ? (
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#cc208f]/10 px-2.5 py-1 text-[12px] font-semibold text-[#a3186f]">
                <ShieldCheck className="h-3.5 w-3.5" /> Instructor view
              </span>
              <h2 className="mt-2.5 font-display text-[18px] font-semibold">You're teaching this bootcamp</h2>
              <p className="mt-1 text-[14px] text-muted-foreground">
                Listed at {formatPrice(basePrice)}. Manage the programme, teach your live class and guide learners from here.
              </p>
              <Link
                to="/app/bootcamps/$id/edit"
                params={{ id: bootcamp.id }}
                search={{ source: currentUser?.account_type === "Institution" ? "institution" : "tutor" }}
                className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-foreground text-[15px] font-semibold text-background transition hover:opacity-90 active:scale-[0.98]"
              >
                <Pencil className="h-4 w-4" /> Edit bootcamp
              </Link>
              <div className={`mt-2 grid gap-2 ${club ? "grid-cols-2" : "grid-cols-1"}`}>
                <Link
                  to="/app/live/$classId"
                  params={{ classId: bootcamp.id }}
                  className="flex h-10 items-center justify-center gap-2 rounded-full border-[1.5px] border-foreground text-[14px] font-semibold text-foreground transition active:scale-[0.98]"
                >
                  <Video className="h-4 w-4" /> Start live class
                </Link>
                {club && (
                  <Link
                    to="/app/clubs/chat"
                    search={{ clubId: club.id, showRules: "false" }}
                    className="flex h-10 items-center justify-center gap-2 rounded-full border-[1.5px] border-foreground text-[14px] font-semibold text-foreground transition active:scale-[0.98]"
                  >
                    <Users className="h-4 w-4" /> Manage club
                  </Link>
                )}
              </div>
              <BootcampShareAction bootcamp={bootcamp} />
            </div>
          ) : isEnrolled ? (
            <div>
              <p className="flex items-center gap-2 text-[15px] font-semibold text-[#1a7f4b]"><CheckCircle2 className="h-5 w-5" /> You're enrolled</p>
              <div className={`mt-3 grid gap-2 ${club ? "grid-cols-2" : "grid-cols-1"}`}>
                <Link to="/app/live/$classId" params={{ classId: bootcamp.id }} className="flex h-11 items-center justify-center gap-2 rounded-full bg-foreground text-[15px] font-semibold text-background transition active:scale-[0.98]">
                  <Video className="h-[18px] w-[18px]" /> Join live class
                </Link>
                {club && (
                  <Link to="/app/clubs/chat" search={{ clubId: club.id, showRules: "false" }} className="flex h-11 items-center justify-center gap-2 rounded-full border-[1.5px] border-foreground text-[15px] font-semibold text-foreground transition active:scale-[0.98]">
                    <Users className="h-[18px] w-[18px]" /> Enter club
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[22px] font-semibold text-foreground">{couponPrice > 0 ? formatPrice(couponPrice) : "Free"}</span>
                    {(discountPct > 0 || appliedCoupon) && (
                      <span className="text-[14px] text-muted-foreground line-through">{formatPrice(appliedCoupon ? finalPrice : basePrice)}</span>
                    )}
                  </div>
                  {basePrice > 0 && (
                    <button type="button" onClick={() => setCouponOpen((open) => !open)} className="text-[13px] font-semibold text-[#cc208f] hover:text-[#a3186f]">
                      {appliedCoupon ? `${couponDiscountPct}% coupon applied` : "Have a coupon?"}
                    </button>
                  )}
                </div>
                <button
                  onClick={handleEnroll}
                  disabled={loading}
                  className="flex h-12 shrink-0 items-center gap-2 rounded-full bg-foreground px-7 text-[16px] font-semibold text-background transition hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />} Enroll
                </button>
              </div>
              {discountPct > 0 && (
                <p className="mt-2 text-[13px] font-semibold text-[#a3186f]">{discountPct * 100}% {tier} discount included</p>
              )}

              {couponOpen && basePrice > 0 && (
                <div className="mt-3 animate-in fade-in slide-in-from-top-1">
                  <div className="flex gap-2">
                    <input
                      value={couponInput}
                      onChange={(event) => {
                        setCouponInput(event.target.value.toUpperCase());
                        setCouponMessage("");
                        setAppliedCoupon(false);
                      }}
                      placeholder="Coupon code"
                      className="h-11 min-w-0 flex-1 rounded-[10px] border border-foreground/15 bg-card px-3 text-[15px] font-semibold tracking-wide outline-none focus:border-foreground/40"
                    />
                    <button onClick={handleApplyCoupon} className="h-11 rounded-full border-[1.5px] border-foreground px-5 text-[14px] font-semibold transition active:scale-[0.98]">Apply</button>
                  </div>
                  {couponMessage && (
                    <p className={`mt-1.5 text-[13px] font-semibold ${appliedCoupon ? "text-[#1a7f4b]" : "text-muted-foreground"}`}>{couponMessage}</p>
                  )}
                </div>
              )}

              {couponPrice > 0 && (
                <div className="mt-3">
                  <ZeroGiftPaymentOption service="bootcamps" amount={couponPrice} applied={applyZeroGift} onAppliedChange={setApplyZeroGift} formatAmount={formatPrice} />
                </div>
              )}

              <div className="mt-3 grid grid-cols-1 gap-2 border-t border-border pt-3">
                {couponPrice > 0 && (
                  <RequestFundsButton amount={couponPrice} purpose={`Enrolment for ${bootcamp?.title || "a Zero Club bootcamp"}`} label="Ask someone to sponsor this" />
                )}
                <button
                  type="button"
                  onClick={handleWishlist}
                  disabled={wishlistLoading}
                  aria-pressed={isWishlisted}
                  className="flex h-10 items-center justify-center gap-2 rounded-full text-[14px] font-semibold text-muted-foreground transition hover:bg-foreground/[0.04] hover:text-foreground disabled:opacity-60"
                >
                  {wishlistLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bookmark className={`h-4 w-4 ${isWishlisted ? "fill-current text-foreground" : ""}`} />}
                  {isWishlisted ? "Saved to your wishlist" : "Save for later"}
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="bg-card p-4 md:rounded-xl md:border md:border-border">
          <h2 className="font-display text-[18px] font-semibold">About this bootcamp</h2>
          <div className="relative mt-2">
            <div
              id="bootcamp-description"
              className={`text-[14px] leading-relaxed text-foreground/85 ${descriptionCanExpand && !descriptionExpanded ? "max-h-28 overflow-hidden" : ""}`}
            >
              {/* Formatted descriptions render with their headings and bullets;
                  plain older ones keep their line breaks and clickable links. */}
              {looksFormatted(bootcamp.description)
                ? <RichText content={bootcamp.description} />
                : <LinkifiedText text={bootcamp.description || ""} />}
            </div>
            {descriptionCanExpand && !descriptionExpanded && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-card to-transparent" />
            )}
          </div>
          {descriptionCanExpand && (
            <button
              type="button"
              onClick={() => setDescriptionExpanded((expanded) => !expanded)}
              aria-expanded={descriptionExpanded}
              aria-controls="bootcamp-description"
              className="mt-1 text-[13px] font-semibold text-muted-foreground hover:text-foreground"
            >
              {descriptionExpanded ? "Show less" : "See more"}
            </button>
          )}

          <h3 className="mt-5 text-[15px] font-semibold">What you get</h3>
          <ul className="mt-2 grid gap-2.5 text-[14px]">
            {["Proof of Work certificate", "Proof of Knowledge — assessed, not assumed", "Live classes and a cohort club", "Direct tutor access", "XP for every lesson and ship", "ZeroNotes you keep for good"].map((item) => (
              <li key={item} className="flex items-center gap-2.5">
                <Check className="h-[18px] w-[18px] shrink-0 text-[#1a7f4b]" /> {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="flex-1 bg-card p-4 pb-28 md:mb-6 md:flex-none md:rounded-xl md:border md:border-border md:pb-4">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-[18px] font-semibold">Syllabus</h2>
            <span className="text-[13px] text-muted-foreground">{modules.length} sections · {totalLessons} lessons</span>
          </div>
          {modules.length === 0 ? (
            <p className="mt-3 text-[14px] text-muted-foreground">The tutor is still putting the syllabus together.</p>
          ) : (
            <Accordion type="single" collapsible className="mt-3 overflow-hidden rounded-xl border border-foreground/10">
              {modules.map((module: any, i: number) => (
                <AccordionItem key={i} value={`item-${i}`} className="border-foreground/10 last:border-b-0">
                  <AccordionTrigger className="gap-2.5 px-3 py-3 text-left hover:no-underline data-[state=open]:bg-foreground/[0.03]">
                    <span className="w-5 shrink-0 text-[12px] font-semibold text-[#cc208f]/70">{String(i + 1).padStart(2, "0")}</span>
                    <span className="flex-1">
                      <span className="block text-[15px] font-semibold text-[#cc208f]">{module.title}</span>
                      <span className="block text-[12px] font-normal text-muted-foreground">{module.lessons?.length || 0} lessons</span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-0">
                    {module.lessons?.sort((a: any, b: any) => a.order_index - b.order_index).map((lesson: any, j: number) => (
                      <div key={j} className="flex items-center gap-2.5 border-t border-foreground/[0.06] py-2.5 pl-[42px] pr-3">
                        {lesson.content_type === "video" ? (
                          <Play className="h-3.5 w-3.5 shrink-0 fill-current text-muted-foreground" />
                        ) : (
                          <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        )}
                        <span className="flex-1 text-[14px] leading-snug">{lesson.title}</span>
                        {lesson.duration && <span className="shrink-0 text-[12px] text-muted-foreground">{lesson.duration}</span>}
                      </div>
                    ))}
                    {(!module.lessons || module.lessons.length === 0) && (
                      <p className="border-t border-foreground/[0.06] py-2.5 pl-[42px] pr-3 text-[13px] text-muted-foreground">No lessons in this section yet.</p>
                    )}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </section>
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
    if (hasShareSheet()) {
      try {
        await openShareSheet({ title: bootcamp?.title || "Zero Club bootcamp", url });
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
        className="flex h-10 w-full items-center justify-center gap-2 rounded-full text-[14px] font-semibold text-muted-foreground transition hover:bg-foreground/[0.04] hover:text-foreground active:scale-[0.98]"
      >
        <Share2 className="h-4 w-4" />
        {label}
      </button>
      {usesZeroForm && (
        <p className="mt-1 text-center text-[12px] leading-4 text-muted-foreground">
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
