import { createFileRoute, Outlet, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShieldCheck } from "@/components/icons/glyphs";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { ZeroLoader } from "@/components/ZeroLoader";

export const Route = createFileRoute("/app/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function verifyAdmin() {
      const { data: authData } = await supabase.auth.getSession();
      if (!authData.session) {
        router.navigate({ to: "/signin" });
        return;
      }

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", authData.session.user.id)
        .single();

      if (error || !profile?.is_admin) {
        toast.error("Zero Club admin access is required.");
        router.navigate({ to: "/app" });
        return;
      }
      if (mounted) setChecking(false);
    }
    verifyAdmin();
    return () => { mounted = false; };
  }, [router]);

  if (checking) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
        <div className="grid h-11 w-11 place-items-center rounded-lg bg-primary/10 text-primary"><ShieldCheck className="h-5 w-5" /></div>
        <ZeroLoader tone="brand" />
      </div>
    );
  }

  return <Outlet />;
}
