import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { planForMode } from "./plans";

/**
 * The server's view of the person's membership, plus the plan that applies
 * to the account type they're using now (see `planForMode`). Shares its cache
 * with the Membership page.
 */
export function useMembershipDashboard(profile: any) {
  const query = useQuery({
    queryKey: ["membership-dashboard", profile?.id, profile?.account_type, profile?.active_mode, profile?.tier, profile?.is_admin],
    enabled: Boolean(profile?.id),
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_subscription_dashboard" as never);
      if (error) return null;
      return data as any;
    },
  });
  const planKey = planForMode(profile, query.data?.plan_key ?? null);
  return { ...query, dashboard: query.data, planKey };
}
