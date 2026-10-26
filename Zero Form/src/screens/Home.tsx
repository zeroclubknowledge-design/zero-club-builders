import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ClipboardList, Eye, Loader2, Plus, Users, Wallet, type LucideIcon } from "@/components/icons/glyphs";
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { formatWalletAmount } from "@/hooks/useWalletCurrency";
import { AppShell } from "@/components/AppShell";
import { Brand } from "@/components/Brand";
import { ZeroFormWorkspace } from "@/features/zeroForm/ZeroFormWorkspace";
import { NAV } from "./nav";

export function Home() {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <div className="grid min-h-dvh place-items-center bg-canvas">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  return session ? <Dashboard /> : <SignedOutWorkspace />;
}

/* ── Signed in: overview + the full Zero Forms workspace ───────────────── */

function Dashboard() {
  const forms = useQuery({
    queryKey: ["zero-forms"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_zero_forms");
      if (error) throw error;
      return (data || []) as any[];
    },
    retry: false,
  });
  const list = forms.data || [];
  const totals = list.reduce(
    (t, f) => ({
      live: t.live + (f.status === "published" ? 1 : 0),
      responses: t.responses + Number(f.total_registrations || 0),
      views: t.views + Number(f.views || 0),
      revenue: t.revenue + Number(f.revenue || 0),
    }),
    { live: 0, responses: 0, views: 0, revenue: 0 },
  );
  const conversion = totals.views > 0 ? Math.round((totals.responses / totals.views) * 100) : null;

  return (
    <AppShell brand={<Brand />} nav={NAV}>
      {list.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Metric icon={CheckCircle2} label="Live forms" value={String(totals.live)} />
          <Metric icon={Users} label="Responses" value={totals.responses.toLocaleString()} />
          <Metric icon={Eye} label="Views" value={totals.views.toLocaleString()} sub={conversion !== null ? `${conversion}% respond` : undefined} />
          <Metric icon={Wallet} label="Revenue" value={formatWalletAmount(totals.revenue)} />
        </div>
      )}
      <section className="rounded-[26px] border border-border bg-card p-4 sm:p-6">
        <ZeroFormWorkspace ownerLabel="Your workspace" />
      </section>
    </AppShell>
  );
}

function Metric({ icon: Icon, label, value, sub }: { icon: LucideIcon; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-[20px] border border-border bg-card p-4">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#c3217e]/10 text-[#c3217e]"><Icon className="h-[18px] w-[18px]" /></span>
      <p className="mt-3 font-display text-[22px] font-bold tabular-nums leading-none">{value}</p>
      <p className="mt-1 text-[12px] text-muted-foreground">{label}{sub ? ` · ${sub}` : ""}</p>
    </div>
  );
}

/* ── Signed out: straight to the open forms (Browse), no landing page ── */

function SignedOutWorkspace() {
  const navigate = useNavigate();
  useEffect(() => { void navigate({ to: "/", replace: true }); }, [navigate]);
  return null;
}
