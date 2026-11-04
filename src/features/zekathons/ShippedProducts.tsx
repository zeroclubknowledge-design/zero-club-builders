import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";

type Credit = {
  role: string;
  zekathon_products: {
    id: string;
    title: string;
    zekathon_releases: { version: string; created_at: string }[];
  };
};

export function ShippedProducts({ profileId, className }: { profileId: string; className?: string }) {
  const credits = useQuery({
    queryKey: ["zekathons", "shipped", profileId],
    queryFn: async () => {
      const { data, error } = await supabase.from("zekathon_members")
        .select("role, zekathon_products!inner(id,title,zekathon_releases!inner(version,created_at))")
        .eq("profile_id", profileId).eq("accepted", true);
      if (error) throw error;
      return (data ?? []) as unknown as Credit[];
    },
  });
  if (!credits.data?.length) return null;
  return <Card className={className}>
    <CardHeader><CardTitle>Shipped products</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      {credits.data.map(({ role, zekathon_products: product }) => {
        const latest = [...product.zekathon_releases].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
        return <Link key={product.id} to="/app/zekathons" search={{ product: product.id, event: undefined }} className="block rounded-lg bg-muted p-3 hover:bg-muted/70">
          <p className="font-semibold">{product.title}</p>
          <p className="text-sm text-muted-foreground">{role} · {latest.version} · {new Date(latest.created_at).toLocaleDateString()}</p>
        </Link>;
      })}
    </CardContent>
  </Card>;
}
