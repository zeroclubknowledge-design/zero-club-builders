import { createFileRoute, Outlet, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { ArrowLeft, Loader2 } from "@/components/icons/glyphs";
import { IconPresentation } from "@/components/icons/nav";
import { switchMode } from "@/lib/modes";

export const Route = createFileRoute("/app/tutor-studio")({
  component: TutorStudioLayout,
});

/**
 * Tutor Studio belongs to Tutor mode. Someone in Learner or Creator mode who
 * opens it is offered the switch here, rather than being turned away as if
 * they needed a different account.
 */
function TutorStudioLayout() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [state, setState] = useState<"checking" | "ready" | "switch">("checking");
  const [profileId, setProfileId] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    async function checkAccess() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.navigate({ to: "/signin" });
        return;
      }
      setProfileId(session.user.id);
      const { data: profile } = await supabase.from("profiles").select("account_type").eq("id", session.user.id).single();
      setState(profile?.account_type === "Learner" ? "switch" : "ready");
    }
    checkAccess();
  }, [router]);

  if (state === "checking") {
    return <div className="flex min-h-screen flex-col items-center justify-center gap-4"><div className="h-1 w-24 overflow-hidden rounded-full bg-foreground/[0.06]"><div className="h-full w-1/3 rounded-full bg-primary animate-progress" /></div></div>;
  }

  if (state === "switch") {
    return (
      <div className="flex min-h-screen flex-col bg-canvas">
        <header className="sticky top-0 z-40 bg-card pt-[env(safe-area-inset-top)]">
          <div className="mx-auto flex h-14 w-full max-w-[680px] items-center px-2">
            <button onClick={() => router.history.back()} aria-label="Back" className="grid h-11 w-10 place-items-center rounded-full tap hover:bg-foreground/[0.04]">
              <ArrowLeft className="h-[22px] w-[22px]" />
            </button>
          </div>
        </header>
        <main className="mx-auto mt-2 flex w-full max-w-[680px] flex-1 flex-col items-center bg-card px-6 pb-28 pt-12 text-center md:mb-6 md:flex-none md:rounded-xl md:border md:border-border md:pb-10">
          <span className="grid h-16 w-16 place-items-center rounded-2xl bg-[#cc208f]/10 text-[#cc208f]"><IconPresentation className="h-7 w-7" /></span>
          <h1 className="mt-5 font-display text-[24px] font-semibold leading-tight">Tutor Studio is in Tutor mode</h1>
          <p className="mt-2 max-w-[360px] text-[15px] leading-relaxed text-muted-foreground">
            Same account, different hat. Switch to Tutor mode to run bootcamps and live classes. You can switch back any time from the menu.
          </p>
          <button
            disabled={switching || !profileId}
            onClick={async () => {
              if (!profileId) return;
              setSwitching(true);
              try {
                await switchMode(profileId, "tutor");
                await queryClient.invalidateQueries({ queryKey: ["profile", "current"] });
                toast.success("You're in Tutor mode");
                setState("ready");
              } catch (error: any) {
                toast.error(error?.message || "Could not switch mode");
              } finally {
                setSwitching(false);
              }
            }}
            className="mt-7 flex h-12 items-center gap-2 rounded-full bg-foreground px-6 text-[15px] font-semibold text-background disabled:opacity-60"
          >
            {switching && <Loader2 className="h-4 w-4 animate-spin" />}
            Switch to Tutor mode
          </button>
        </main>
      </div>
    );
  }

  return <Outlet />;
}
