import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ClipboardList, Eye, Loader2, Plus, Users, Wallet, type LucideIcon } from "@/components/icons/glyphs";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { formatWalletAmount } from "@/hooks/useWalletCurrency";
import { AppShell } from "@/components/AppShell";
import { Brand } from "@/components/Brand";
import { AuthSheet } from "@/components/auth/AuthSheet";
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
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#cc208f]/10 text-[#cc208f]"><Icon className="h-[18px] w-[18px]" /></span>
      <p className="mt-3 font-display text-[22px] font-bold tabular-nums leading-none">{value}</p>
      <p className="mt-1 text-[12px] text-muted-foreground">{label}{sub ? ` · ${sub}` : ""}</p>
    </div>
  );
}

/* ── Signed out: the same workspace, empty, with sign-in where you'd create ── */

function SignedOutWorkspace() {
  const [auth, setAuth] = useState<null | "signup" | "signin">(null);
  return (
    <AppShell brand={<Brand />} nav={NAV}>
      <section className="rounded-[26px] border border-border bg-card p-4 sm:p-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">Your workspace</p>
            <h2 className="mt-1 font-display text-[22px] font-semibold tracking-tight">Zero Forms</h2>
            <p className="mt-1 text-[12px] text-muted-foreground">Register learners for a bootcamp, or run a waitlist for anything you're launching.</p>
          </div>
          <button onClick={() => setAuth("signup")} className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-5 text-[13px] font-semibold text-primary-foreground">
            <Plus className="h-4 w-4" /> New Zero Form
          </button>
        </div>
        <div className="rounded-lg border border-dashed border-border px-6 py-14 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#cc208f]/10 text-[#cc208f]"><ClipboardList className="h-6 w-6" /></span>
          <h3 className="mt-3 text-[15px] font-semibold">Sign in to see your Zero Forms</h3>
          <p className="mx-auto mt-1 max-w-[360px] text-[13px] text-muted-foreground">Use your Zero Club account, or create one free. Forms you made on Zero Club are already here.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button onClick={() => setAuth("signin")} className="inline-flex h-11 items-center rounded-lg bg-foreground px-5 text-[13px] font-semibold text-background">Sign in</button>
            <button onClick={() => setAuth("signup")} className="inline-flex h-11 items-center rounded-lg border border-border px-5 text-[13px] font-semibold">Create a free account</button>
          </div>
        </div>
      </section>
      <AuthSheet open={!!auth} initialMode={auth || "signup"} onClose={() => setAuth(null)} />
    </AppShell>
  );
}
