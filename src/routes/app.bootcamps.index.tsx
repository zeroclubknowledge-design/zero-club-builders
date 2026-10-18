import { createFileRoute, Link } from "@tanstack/react-router";
import { Award, BookOpen, Building2, CalendarClock, Search, Star, TicketPercent, X } from "@/components/icons/glyphs";
import { currentPrice, earlyBirdActive, levelLabel, seatsLeft } from "@/features/bootcamps/BootcampExtras";
import { useMemo, useState } from "react";
import { getBootcamps } from "@/api";
import { useQuery } from "@tanstack/react-query";
import { useWalletCurrency } from "@/hooks/useWalletCurrency";
import { supabase } from "@/lib/supabase";
import { formatCountdown } from "@/features/zeroForm/templates";
import { richTextToPlain } from "@/components/RichText";
import { useUser } from "@/hooks/useUser";
import { BootcampPreviewVideo } from "@/features/bootcamps/BootcampPreviewVideo";

export const Route = createFileRoute("/app/bootcamps/")({
  component: Bootcamps,
});

const relationCount = (value: any) => Number(Array.isArray(value) ? value[0]?.count : value?.count) || 0;
/** Enrolled learners plus members the owner added to the bootcamp's club (kept in learners_count). */
const learnerCount = (camp: any) => Math.max(Number(camp?.learners_count) || 0, relationCount(camp?.enrollments));
function BootcampCover({ bootcamp, className = '', compact = false }: { bootcamp: any; className?: string; compact?: boolean }) {
  return (
    <div className={`relative overflow-hidden bg-foreground/[0.06] ${className}`}>
      {bootcamp.banner_url ? (
        <img src={bootcamp.banner_url} alt={`${bootcamp.title} bootcamp`} className="h-full w-full object-cover" loading="lazy" decoding="async" />
      ) : bootcamp.video_url ? (
        <BootcampPreviewVideo key={bootcamp.video_url} src={bootcamp.video_url} label={`${bootcamp.title} video preview`} />
      ) : (
        <div className="grid h-full w-full place-items-center bg-foreground/[0.06]">
          <BookOpen className={`text-muted-foreground ${compact ? 'h-5 w-5' : 'h-9 w-9'}`} />
        </div>
      )}
      {/* The badge is wider than a 64px thumbnail, so at that size it says
          "Institution" by spilling over the artwork. The row beside it already
          names the tutor or institution, so it is simply dropped there. */}
      {!compact && bootcamp.profiles?.account_type === 'Institution' && (
        <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-card/95 px-2.5 py-1 text-[12px] font-semibold text-foreground">
          <Building2 className="h-3.5 w-3.5" /> Institution
        </span>
      )}
    </div>
  );
}

/* Codecademy-style at-a-glance facts: next start, offer, seats, certificate. */
function CampBadges({ camp }: { camp: any }) {
  const badges: { text: string; tone: "brand" | "plain" | "good"; icon?: any }[] = [];
  if (earlyBirdActive(camp)) badges.push({ text: "Early bird", tone: "brand", icon: TicketPercent });
  if (camp.format === "workshop") badges.push({ text: "Workshop", tone: "plain" });
  if (camp.starts_at && new Date(camp.starts_at) > new Date()) {
    badges.push({ text: `Starts ${new Date(camp.starts_at).toLocaleDateString([], { day: "numeric", month: "short" })}`, tone: "plain", icon: CalendarClock });
  }
  const left = seatsLeft(camp);
  if (left !== null && left <= 10) badges.push({ text: left === 0 ? "Full" : `${left} seats left`, tone: "brand" });
  if (camp.duration_label) badges.push({ text: camp.duration_label, tone: "plain" });
  if (levelLabel(camp.level)) badges.push({ text: levelLabel(camp.level)!, tone: "plain" });
  if (camp.certificate_enabled !== false) badges.push({ text: "Certificate", tone: "good", icon: Award });
  if (Number(camp.rating_count) > 0) badges.push({ text: `${Number(camp.rating_avg).toFixed(1)} (${camp.rating_count})`, tone: "plain", icon: Star });
  if (!badges.length) return null;
  const tone = { brand: "bg-[#cc208f]/10 text-[#a3186f]", plain: "bg-foreground/[0.05] text-foreground/75", good: "bg-success/10 text-success" };
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {badges.slice(0, 5).map(({ text, tone: t, icon: Icon }) => (
        <span key={text} className={`inline-flex h-[22px] items-center gap-1 rounded-full px-2 text-[11.5px] font-semibold ${tone[t]}`}>
          {Icon && <Icon className="h-3 w-3" />}{text}
        </span>
      ))}
    </div>
  );
}

function PriceTag({ camp, formatPrice, className = "" }: { camp: any; formatPrice: (v: unknown) => string; className?: string }) {
  const now = currentPrice(camp);
  return (
    <span className={className}>
      <b className={`font-semibold ${now > 0 ? "text-foreground" : "text-success"}`}>{formatPrice(now)}</b>
      {earlyBirdActive(camp) && <s className="ml-1 font-normal text-muted-foreground">{formatPrice(camp.price)}</s>}
    </span>
  );
}

const KINDS = ["All types", "Bootcamps", "Workshops", "Starting soon", "Free"] as const;

function Bootcamps() {
  const { format } = useWalletCurrency();
  const formatPrice = (price: unknown) => Number(price || 0) > 0 ? format(Number(price)) : 'Free';
  const { data: bootcamps = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['bootcamps'],
    queryFn: () => getBootcamps(),
  });
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [kind, setKind] = useState<(typeof KINDS)[number]>('All types');

  // Interests picked during onboarding: their categories come first, and so
  // do the bootcamps in them.
  const { data: profile } = useUser();
  const interests: string[] = Array.isArray(profile?.interests) ? profile.interests : [];
  const likes = (category: unknown) => interests.some((interest) => interest.toLowerCase() === String(category || '').toLowerCase());

  const categories = useMemo(() => {
    const all = Array.from(new Set(bootcamps.map((camp: any) => camp.category).filter(Boolean))) as string[];
    return ['All', ...all.filter(likes), ...all.filter((category) => !likes(category))];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootcamps, interests.join('|')]);

  const filteredCamps = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return bootcamps.filter((camp: any) => {
      const matchesCategory = activeCategory === 'All' || camp.category === activeCategory;
      const searchable = [camp.title, richTextToPlain(camp.description), camp.category, camp.profiles?.full_name, camp.profiles?.username]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const soon = camp.starts_at && new Date(camp.starts_at) > new Date() && new Date(camp.starts_at).getTime() - Date.now() < 45 * 86_400_000;
      const matchesKind = kind === 'All types'
        || (kind === 'Bootcamps' && camp.format !== 'workshop')
        || (kind === 'Workshops' && camp.format === 'workshop')
        || (kind === 'Starting soon' && soon)
        || (kind === 'Free' && currentPrice(camp) <= 0);
      return matchesCategory && matchesKind && (!query || searchable.includes(query));
    }).sort((a: any, b: any) => Number(likes(b.category)) - Number(likes(a.category)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootcamps, activeCategory, searchQuery, kind, interests.join('|')]);

  const showFeatured = activeCategory === 'All' && kind === 'All types' && !searchQuery.trim() && filteredCamps.length > 0;
  const featured = showFeatured ? filteredCamps[0] : null;
  const catalogue = featured ? filteredCamps.slice(1) : filteredCamps;

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="sticky top-0 z-40 bg-card pt-[env(safe-area-inset-top)]">
        <div className="zc-page-width mx-auto max-w-[900px] px-4 pb-3 pt-3 md:px-6">
          <h1 className="font-display text-[24px] font-semibold tracking-[-0.02em] text-foreground">Learn</h1>
          <p className="mt-0.5 text-[14px] text-muted-foreground">Learn with a cohort. Leave with proof.</p>
          <label className="mt-3 flex h-9 w-full items-center gap-2 rounded-lg bg-foreground/[0.05] px-3">
            <Search className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Skills, bootcamps, tutors or institutions"
              aria-label="Search bootcamps"
              className="min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} aria-label="Clear search" className="grid h-6 w-6 place-items-center rounded-full text-muted-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </label>
          <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setActiveCategory(category)}
                className={`h-8 shrink-0 rounded-full px-3.5 text-[14px] font-semibold tap ${
                  activeCategory === category ? 'bg-foreground text-background' : 'border border-foreground/30 text-foreground/75 hover:bg-foreground/[0.04]'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
          <div className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto">
            {KINDS.map((k) => (
              <button key={k} onClick={() => setKind(k)} className={`h-7 shrink-0 rounded-full px-3 text-[12.5px] font-semibold ${kind === k ? 'bg-[#cc208f] text-white' : 'bg-foreground/[0.05] text-foreground/70'}`}>{k}</button>
            ))}
          </div>
        </div>
      </header>

      <main className="zc-page-width mx-auto w-full max-w-[900px]">
        <UpcomingRegistrations />
        <Link to="/app/bootcamps/requests" className="mt-2 flex items-center gap-3 bg-card px-4 py-3 md:rounded-xl md:border md:border-border">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#cc208f]/10 text-[#cc208f]"><Building2 className="h-[18px] w-[18px]" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-semibold">Teams & group seats</span>
            <span className="block truncate text-[12.5px] text-muted-foreground">Use a seat code, manage seats you bought, or request a private bootcamp</span>
          </span>
        </Link>

        {isLoading ? (
          <section className="mt-2 bg-card px-4 py-2 md:rounded-xl">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="flex gap-3 border-b border-border py-3 last:border-b-0">
                <div className="h-16 w-24 shrink-0 rounded-lg bg-foreground/[0.05] shimmer" />
                <div className="flex-1 space-y-2 py-1">
                  <div className="h-4 w-4/5 rounded bg-foreground/[0.05] shimmer" />
                  <div className="h-3 w-2/3 rounded bg-foreground/[0.05] shimmer" />
                </div>
              </div>
            ))}
          </section>
        ) : isError ? (
          <div className="mt-2 bg-card px-6 py-14 text-center md:rounded-xl">
            <BookOpen className="mx-auto h-7 w-7 text-muted-foreground" />
            <h3 className="mt-4 font-display text-[17px] font-semibold">We could not load the catalogue</h3>
            <p className="mx-auto mt-2 max-w-sm text-[14px] leading-relaxed text-muted-foreground">Your programmes are safe; try loading them again.</p>
            <button onClick={() => refetch()} className="mt-5 h-10 rounded-full bg-foreground px-5 text-[15px] font-semibold text-background">Try again</button>
          </div>
        ) : (
          <>
            {featured && (
              <section className="mt-2 bg-card p-4 md:rounded-xl md:border md:border-border">
                <p className="text-[12px] font-semibold text-accent">Featured programme</p>
                <Link to="/app/bootcamps/$id" params={{ id: featured.id }} className="group mt-2.5 block">
                  <div className="relative overflow-hidden rounded-xl">
                    <BootcampCover bootcamp={featured} className="aspect-[16/9]" />
                    <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-card/95 px-2.5 py-1 text-[12px] font-semibold text-foreground">
                      <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                      {learnerCount(featured)} {learnerCount(featured) === 1 ? 'learner' : 'learners'} enrolled
                    </span>
                  </div>
                  <h2 className="mt-3 font-display text-[20px] font-semibold leading-tight tracking-[-0.01em] text-foreground group-hover:underline">{featured.title}</h2>
                  <div className="mt-1.5 flex min-w-0 items-center gap-2 text-[13px] text-muted-foreground">
                    <span className="grid h-6 w-6 shrink-0 place-items-center overflow-hidden rounded-md bg-foreground/[0.06] text-[11px] font-semibold">
                      {featured.profiles?.avatar_url ? <img src={featured.profiles.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" /> : (featured.profiles?.full_name || featured.profiles?.username || 'T').substring(0, 1).toUpperCase()}
                    </span>
                    <span className="truncate">
                      {featured.profiles?.full_name || featured.profiles?.username}
                      {featured.category ? ` · ${featured.category}` : ''} · {relationCount(featured.modules)} {relationCount(featured.modules) === 1 ? 'module' : 'modules'}
                    </span>
                  </div>
                  <CampBadges camp={featured} />
                  <div className="mt-4 flex items-center justify-between">
                    <PriceTag camp={featured} formatPrice={formatPrice} className="text-[17px] tabular-nums" />
                    <span className="inline-flex h-10 items-center rounded-full bg-foreground px-5 text-[15px] font-semibold text-background">View programme</span>
                  </div>
                </Link>
              </section>
            )}

            {catalogue.length > 0 && (
              <section className="mt-2 bg-card px-4 pb-1 pt-3 md:rounded-xl md:border md:border-border">
                <div className="flex items-baseline justify-between">
                  <h2 className="font-display text-[18px] font-semibold text-foreground">{activeCategory === 'All' ? 'Catalogue' : activeCategory}</h2>
                  <span className="text-[13px] text-muted-foreground">{catalogue.length} {catalogue.length === 1 ? 'programme' : 'programmes'}</span>
                </div>
                <div className="md:grid md:grid-cols-2 md:gap-x-6">
                  {catalogue.map((camp: any) => (
                    <Link
                      key={camp.id}
                      to="/app/bootcamps/$id"
                      params={{ id: camp.id }}
                      className="group flex min-w-0 gap-3 border-b border-border py-3 last:border-b-0"
                    >
                      <BootcampCover bootcamp={camp} compact className="h-16 w-24 shrink-0 rounded-lg" />
                      <div className="min-w-0 flex-1">
                        <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug tracking-normal text-foreground [font-family:inherit] group-hover:underline">{camp.title}</h3>
                        <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
                          By {camp.profiles?.full_name || camp.profiles?.username}
                          {camp.profiles?.account_type === 'Institution' ? ' · Institution' : ''}
                        </p>
                        <p className="mt-0.5 text-[12px] text-muted-foreground">
                          {relationCount(camp.modules)} {relationCount(camp.modules) === 1 ? 'module' : 'modules'} · {learnerCount(camp)} {learnerCount(camp) === 1 ? 'learner' : 'learners'} ·{' '}
                          <PriceTag camp={camp} formatPrice={formatPrice} />
                        </p>
                        <CampBadges camp={camp} />
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {filteredCamps.length === 0 && (
              <div className="mt-2 flex flex-col items-center bg-card px-6 py-14 text-center md:rounded-xl">
                <div className="grid h-12 w-12 place-items-center rounded-full bg-foreground/[0.05]"><Search className="h-5 w-5 text-muted-foreground" /></div>
                <h3 className="mt-4 font-display text-[17px] font-semibold">No matching bootcamps</h3>
                <p className="mt-1.5 max-w-xs text-[14px] leading-relaxed text-muted-foreground">Try another skill, tutor or institution.</p>
                <button onClick={() => { setActiveCategory('All'); setSearchQuery(''); }} className="mt-5 h-10 rounded-full bg-foreground px-5 text-[15px] font-semibold text-background">Reset search</button>
              </div>
            )}
          </>
        )}
      </main>
      {/* The last card runs to the bottom of the screen, so the page never
          ends in a strip of bare background under the tab bar. */}
      <div aria-hidden className="min-h-24 flex-1 bg-card md:bg-transparent" />
    </div>
  );
}

/**
 * Bootcamps the learner pre-registered for through a Zero Form.
 * Reassures them the registration worked, and counts down to the start
 * (spec section 22). Once the bootcamp starts the status flips to Active.
 */
function UpcomingRegistrations() {
  const { format } = useWalletCurrency();
  const { data = [] } = useQuery({
    queryKey: ["my-zero-form-registrations"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return [];
      const { data, error } = await supabase.rpc("get_my_zero_form_registrations");
      if (error) return [];
      return (data || []) as any[];
    },
    retry: false,
  });

  if (!data.length) return null;

  return (
    <section className="mt-2 bg-card px-4 pb-1 pt-3 md:rounded-xl md:border md:border-border">
      <div className="flex min-w-0 items-center gap-2">
        <CalendarClock className="h-5 w-5 shrink-0 text-accent" />
        <h2 className="min-w-0 flex-1 font-display text-[16px] font-semibold text-foreground">Your bootcamp registrations</h2>
      </div>
      <div className="mt-1">
        {data.map((registration: any) => {
          const status = registration.registration_status;
          const enrolled = status === "enrolled" || status === "confirmed";
          /* Left interest (or started paying) on a paid form: the place is
             only theirs once they pay, which opens the form where they left it. */
          const needsPayment = !enrolled
            && (status === "interested" || status === "payment_pending" || status === "pending")
            && registration.pricing_enabled !== false
            && Number(registration.form_price) > 0
            && !!registration.slug;
          const live = enrolled && (status === "enrolled" || (registration.starts_at && new Date(registration.starts_at) <= new Date()));
          const countdown = formatCountdown(registration.starts_at);
          const body = (
            <>
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-foreground/[0.06]">
                {registration.banner_url && <img src={registration.banner_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-[14px] font-semibold leading-snug text-foreground">{registration.title}</p>
                <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                  {needsPayment
                    ? `Pay ${format(registration.form_price)} to secure your place`
                    : !enrolled
                      ? "You're on the list — we'll let you know"
                      : live ? "You're in — open your bootcamp" : countdown ? `Starts in ${countdown}` : "Starting soon"}
                  {enrolled && Number(registration.amount) > 0 && ` · ${format(registration.amount)} paid`}
                </p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${needsPayment ? "bg-primary text-primary-foreground" : live ? "bg-success/10 text-success" : enrolled ? "bg-accent/10 text-accent" : "bg-foreground/[0.06] text-muted-foreground"}`}>
                {needsPayment ? "Complete payment" : live ? "Open" : enrolled ? "Enrolled" : "Interested"}
              </span>
            </>
          );
          const row = "flex w-full min-w-0 items-center gap-3 border-b border-border py-3 last:border-b-0";
          /* min-w-0 on the link itself matters as much as on the text inside
             it, or a long bootcamp name stretches the row past the screen. */
          if (needsPayment || (!registration.bootcamp_id && registration.slug)) {
            return <a key={registration.id} href={`/form/${registration.slug}?resume=1`} className={row}>{body}</a>;
          }
          if (!registration.bootcamp_id) return <div key={registration.id} className={row}>{body}</div>;
          return (
            <Link key={registration.id} to="/app/bootcamps/$id" params={{ id: registration.bootcamp_id }} className={row}>
              {body}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
