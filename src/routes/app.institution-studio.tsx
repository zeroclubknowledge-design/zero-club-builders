import { createFileRoute, Outlet, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/app/institution-studio")({
  component: InstitutionStudioLayout,
});

function InstitutionStudioLayout() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkAccess() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.navigate({ to: "/signin" });
        return;
      }
      const { data: profile } = await supabase.from("profiles").select("account_type").eq("id", session.user.id).single();
      if (profile?.account_type !== "Institution") {
        toast.error("You do not have access to the Institution Hub.");
        router.navigate({ to: "/app" });
        return;
      }
      setLoading(false);
    }
    checkAccess();
  }, [router]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return <Outlet />;
}
