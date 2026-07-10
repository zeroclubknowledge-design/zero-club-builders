import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, Zap, Star, Shield, History, ChevronRight, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

export const Route = createFileRoute("/app/settings/premium")({
  component: PremiumSettings,
});

function PremiumSettings() {
  const queryClient = useQueryClient();

  const { data: profile, isLoading } = useQuery({
    queryKey: ['my_profile'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;
      const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
      return data;
    }
  });

  const toggleEarlyAccess = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!profile) return;
      const { error } = await supabase
        .from('profiles')
        .update({ early_access_enabled: enabled })
        .eq('id', profile.id);
      if (error) throw error;
      return enabled;
    },
    onSuccess: (enabled) => {
      queryClient.invalidateQueries({ queryKey: ['my_profile'] });
      toast.success(enabled ? "Early Access enabled! 🚀" : "Early Access disabled");
    },
    onError: () => {
      toast.error("Failed to update Early Access status");
    }
  });

  const tier = profile?.tier || "Basic";

  return (
    <div className="flex min-h-screen flex-col bg-background pb-20">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] flex items-center border-b border-border">
        <Link to="/app/settings" className="mr-6 p-2 rounded-full transition active:bg-accent/10">
          <ChevronLeft className="h-5 w-5 text-foreground" />
        </Link>
        <h1 className="text-lg font-bold text-foreground">Premium</h1>
      </header>

      <div className="flex-1 overflow-y-auto no-scrollbar p-5">
        <section className="rounded-3xl bg-gradient-to-br from-primary/20 to-purple-500/20 border border-primary/30 p-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center shadow-glow">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">{tier} Tier</h2>
              <p className="text-xs text-primary">Current Plan</p>
            </div>
          </div>
          <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
            You are currently on the {tier} Tier. {tier === 'Basic' ? 'Upgrade to unlock premium builder features and elite perks.' : 'Enjoy your exclusive premium benefits and elite club access.'}
          </p>
          {tier === 'Basic' && (
            <Link to="/app/premium" className="mt-6 block text-center rounded-2xl bg-foreground py-3 text-sm font-bold text-background transition active:scale-95">
              Upgrade Plan
            </Link>
          )}
        </section>

        <div className="mt-8 space-y-1 flex flex-col border-t border-white/5 pt-4">
          <Link to="/app/settings/premium/features" className="flex items-center gap-4 py-4 px-1 transition active:bg-accent/10 text-left group">
            <div className="h-10 w-10 rounded-xl bg-accent flex items-center justify-center">
              <Star className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
            </div>
            <div className="flex-1">
              <div className="text-sm font-bold text-foreground">Plan Features</div>
              <div className="text-[11px] text-muted-foreground leading-tight">See everything you can do with your current plan</div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>

          <div className="flex items-center gap-4 py-4 px-1">
            <div className="h-10 w-10 rounded-xl bg-accent flex items-center justify-center">
              <Shield className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
            </div>
            <div className="flex-1">
              <div className="text-sm font-bold text-foreground">Early access</div>
              <div className="text-[11px] text-muted-foreground leading-tight">Participate in experimental features</div>
            </div>
            {toggleEarlyAccess.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            ) : (
              <Switch 
                checked={profile?.early_access_enabled} 
                onCheckedChange={(val) => toggleEarlyAccess.mutate(val)}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
