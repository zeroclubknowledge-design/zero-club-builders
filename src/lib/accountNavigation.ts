export type NavigationAudience = "learner" | "creator" | "tutor" | "institution" | "company" | "administrator" | "unknown";

/** Navigation follows the account in use, never a subscription held in another mode. */
export function navigationAudience(profile: any): NavigationAudience {
  if (!profile) return "unknown";
  if (profile.is_admin === true) return "administrator";
  const type = String(profile.account_type || "").trim().toLowerCase();
  if (profile.account_kind === "business") return profile.business_mode === "institutional" ? "institution" : "company";
  if (type === "institution") return "institution";
  if (["business", "company", "organization"].includes(type)) return "company";
  if (type === "tutor") return "tutor";
  if (type === "creator") return "creator";
  // Creator mode historically uses account_type=Learner. Tutor approval and
  // paid tiers alone do not mean that those workspaces are currently in use.
  if (["learner", "builder", "user", ""].includes(type)) return profile.active_mode === "creator" ? "creator" : "learner";
  return "unknown";
}

export const navigationAudienceLabel: Record<NavigationAudience, string> = {
  learner: "Learner", creator: "Creator", tutor: "Tutor", institution: "Institution",
  company: "Company", administrator: "Administrator", unknown: "Account",
};

const accountRoutes: { path: string; audiences: NavigationAudience[] }[] = [
  { path: "/app/creator", audiences: ["creator"] },
  { path: "/app/my-store", audiences: ["creator"] },
  { path: "/app/tutor-studio", audiences: ["tutor"] },
  { path: "/app/certifications", audiences: ["tutor", "institution"] },
  { path: "/app/institution-studio", audiences: ["institution"] },
  { path: "/app/business", audiences: ["company"] },
  { path: "/app/admin", audiences: [] },
];

export function navigationAllowed(profile: any, destination: string) {
  const audience = navigationAudience(profile);
  if (audience === "administrator") return true;
  const path = destination.split(/[?#]/, 1)[0].replace(/\/+$/, "");
  const rule = accountRoutes.find(rule => path === rule.path || path.startsWith(rule.path + "/"));
  return !rule || rule.audiences.includes(audience);
}

export function accountNavigation<T extends { to: string }>(profile: any, links: T[]): T[] {
  return links.filter(link => navigationAllowed(profile, link.to));
}
