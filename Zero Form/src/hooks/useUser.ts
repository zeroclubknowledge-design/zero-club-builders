import { useAuth } from "@/lib/auth";

/** The same shape Zero Club's useUser returns for the fields shared code reads. */
export function useUser() {
  const { profile, loading } = useAuth();
  return { data: profile, isLoading: loading, isPending: loading };
}
