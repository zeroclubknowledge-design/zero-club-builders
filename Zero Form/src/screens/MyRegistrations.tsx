import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowUpRight, CalendarDays, ClipboardList, Loader2 } from "@/components/icons/glyphs";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { zc } from "@/lib/config";
import { formatWalletAmount } from "@/hooks/useWalletCurrency";
import { AppShell, PageHead } from "@/components/AppShell";
import { Brand } from "@/components/Brand";
import { RegistrationAccount } from "@/components/RegistrationAccount";
import { NAV } from "./nav";

const STATUS: Record<string, { label: string; tone: string }> = {
  enrolled: { label: "Enrolled", tone: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400" },
  confirmed: { label: "Confirmed", tone: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400" },
  interested: { label: "On the list", tone: "bg-[#cc208f]/10 text-[#cc208f]" },
  payment_pending: { label: "Payment pending", tone: "bg-amber-500/12 text-amber-600" },
  pending: { label: "Received", tone: "bg-foreground/[0.07] text-muted-foreground" },
};

/**
 * Everything you've registered for through Zero Form — including forms you
 * filled in as a guest before you had an account (linked by your verified email).
 */
export function MyRegistrations() {
  const { session, profile, loading, signOut } = useAuth();
  const navigate = useNavigate();
  useEffect(() => { if (!loading && !session) void navigate({ to: "/signin" }); }, [loading, session, navigate]);

  const regs = useQuery({
    queryKey: ["my-zero-form-registrations", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      // Guest sign-ups made with this (verified) email become yours. Older servers may not have it yet.
      await supabase.rpc("claim_guest_zero_form_registrations" as never).then(() => undefined, () => undefined);
      const { data, error } = await supabase.rpc("get_my_zero_form_registrations");
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  return (
    <AppShell brand={<Brand />} nav={NAV}>
      <PageHead eyebrow="Your account" title="My registrations" sub="Bootcamps, waitlists and sign-ups you've joined with Zero Form." />

      <RegistrationAccount profile={profile} onSignOut={() => void signOut()} />

      {regs.isLoading ? (
        <div className="grid place-items-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : regs.error ? (
        <p className="rounded-[22px] border border-border bg-card p-6 text-center text-[14px] text-muted-foreground">{(regs.error as Error).message}</p>
      ) : !regs.data?.length ? (
        <div className="rounded-[22px] border border-dashed border-border bg-card px-6 py-14 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#cc208f]/10 text-[#cc208f]"><ClipboardList className="h-6 w-6" /></span>
          <h3 className="mt-3 text-[16px] font-bold">Nothing here yet</h3>
          <p className="mx-auto mt-1 max-w-[340px] text-[13.5px] text-muted-foreground">When you register through a Zero Form link, your place shows up here.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {regs.data.map((r) => {
            const st = STATUS[r.registration_status] || STATUS.pending;
            const starts = r.starts_at ? new Date(r.starts_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : null;
            const inBootcamp = r.bootcamp_id && ["enrolled", "confirmed"].includes(r.registration_status);
            return (
              <article key={r.id} className="overflow-hidden rounded-[22px] border border-border bg-card">
                <div className="h-24 bg-cover bg-center" style={{ backgroundImage: r.banner_url ? `url(${r.banner_url})` : "linear-gradient(120deg,#e94fb0,#b62ba4 55%,#7c3aed)" }} />
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="min-w-0 text-[15.5px] font-bold leading-snug">{r.title}</h3>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${st.tone}`}>{st.label}</span>
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted-foreground">
                    {starts && <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> Starts {starts}</span>}
                    {Number(r.amount) > 0 && <span>Paid {formatWalletAmount(Number(r.amount))}</span>}
                    {r.category && <span>{r.category}</span>}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {inBootcamp ? (
                      <a href={zc(`/app/bootcamps/${r.bootcamp_id}`)} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[#cc208f] px-4 text-[13px] font-semibold text-white">
                        Go to bootcamp <ArrowUpRight className="h-4 w-4" />
                      </a>
                    ) : null}
                    {r.slug && (
                      <Link to="/form/$slug" params={{ slug: r.slug }} className="inline-flex h-10 items-center rounded-full border border-border px-4 text-[13px] font-semibold">
                        {r.registration_status === "interested" && Number(r.form_price) > 0 ? "Pay and hold my place" : "View form"}
                      </Link>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
