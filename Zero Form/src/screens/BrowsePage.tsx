import { useState } from "react";
import { ClipboardList, Plus } from "@/components/icons/glyphs";
import { AppShell } from "@/components/AppShell";
import { Brand } from "@/components/Brand";
import { AuthSheet } from "@/components/auth/AuthSheet";
import { useAuth } from "@/lib/auth";
import { BrowseForms } from "./Browse";
import { NAV } from "./nav";

/** /browse, and what signed-out visitors land on: every open Zero Form from every club. */
export function BrowsePage() {
  const { session, loading } = useAuth();
  const [auth, setAuth] = useState<null | "signup" | "signin">(null);
  return (
    <AppShell brand={<Brand />} nav={NAV}>
      <BrowseForms />
      {!loading && !session && (
        <section className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-[22px] border border-border bg-card p-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#cc208f]/10 text-[#cc208f]"><ClipboardList className="h-5 w-5" /></span>
            <div className="min-w-0">
              <h2 className="text-[15px] font-bold">Running a bootcamp or launching something?</h2>
              <p className="text-[13px] text-muted-foreground">Make your own Zero Form with your Zero Club account. Forms you made on Zero Club are already here.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setAuth("signin")} className="inline-flex h-11 items-center rounded-lg border border-border px-5 text-[13px] font-semibold">Sign in</button>
            <button onClick={() => setAuth("signup")} className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-5 text-[13px] font-semibold text-primary-foreground"><Plus className="h-4 w-4" /> New Zero Form</button>
          </div>
        </section>
      )}
      <AuthSheet open={!!auth} initialMode={auth || "signup"} onClose={() => setAuth(null)} />
    </AppShell>
  );
}
