import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BriefcaseBusiness, Building2, Clock, MapPin, Users } from "@/components/icons/glyphs";
import { supabase } from "@/lib/supabase";
import { isBusiness } from "@/lib/business";

/** "About the organization" on a business account's profile. */
export function BusinessProfileCard({ profile, isOwn }: { profile: any; isOwn?: boolean }) {
  const enabled = isBusiness(profile) && Boolean(profile?.id);
  const info = useQuery({
    queryKey: ["business-profile", profile?.id],
    enabled,
    queryFn: async () => {
      const [{ data: b }, { count }] = await Promise.all([
        supabase.from("business_profiles" as never).select("*").eq("profile_id", profile.id).maybeSingle(),
        supabase.from("gigs").select("id", { count: "exact", head: true }).eq("client_id", profile.id).eq("status", "open"),
      ]);
      return { b: b as any, openRoles: count || 0 };
    },
    staleTime: 60_000,
  });
  if (!enabled) return null;
  const b = info.data?.b;
  const openRoles = info.data?.openRoles || 0;
  const institutional = profile.business_mode === "institutional";
  const place = [b?.city, b?.country].filter(Boolean).join(", ");

  return (
    <div className="mt-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-full bg-[#c3217e]/10 px-2.5 py-1 text-[12px] font-semibold text-[#c3217e]">
          {institutional ? <Building2 className="h-3.5 w-3.5" /> : <BriefcaseBusiness className="h-3.5 w-3.5" />}
          {institutional ? "Tech hub" : "Company"}
        </span>
        {b?.industry && <span className="rounded-full bg-foreground/[0.05] px-2.5 py-1 text-[12px] font-medium text-muted-foreground">{b.industry}</span>}
        {b?.hiring && <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[12px] font-semibold text-emerald-600">Hiring</span>}
      </div>
      {b?.about && <p className="mt-3 whitespace-pre-line text-[14px] leading-relaxed text-foreground/85">{b.about}</p>}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-muted-foreground">
        {place && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {place}</span>}
        {b?.size && <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {b.size} people</span>}
        {b?.founded_year && <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Since {b.founded_year}</span>}
      </div>
      {(openRoles > 0 || isOwn) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {openRoles > 0 && (
            <Link to={"/app/quests" as never} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground px-4 text-[13px] font-semibold text-background">
              <BriefcaseBusiness className="h-4 w-4" /> {openRoles} open role{openRoles === 1 ? "" : "s"}
            </Link>
          )}
          {isOwn && (
            <Link to={"/app/business" as never} search={{ tab: "page" } as never} className="inline-flex h-9 items-center rounded-full border border-border px-4 text-[13px] font-semibold">
              Edit company page
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
