import { describePost, postImages } from "./parse";
import type { PublicPortfolio } from "./types";

export type StrengthCheck = { key: string; label: string; done: boolean; required?: boolean };

/** What makes a portfolio convincing, as specific to-dos. Only the first is required to publish. */
export function portfolioStrength(data: PublicPortfolio) {
  const { profile, portfolio, items, experiences, certificates, learning } = data;
  const projects = items.filter((item) => item.kind === "project");
  const featured = projects.filter((item) => item.featured);
  const social = profile.social_links || {};
  const checks: StrengthCheck[] = [
    { key: "work", label: "Add at least one project", done: projects.length > 0, required: true },
    { key: "three", label: "Show 3 or more projects", done: projects.length >= 3 },
    { key: "featured", label: "Feature your best project", done: featured.length > 0 },
    {
      key: "screens",
      label: "Every project has a screenshot",
      done: projects.length > 0 && projects.every((item) => postImages(item.post).length > 0),
    },
    {
      key: "story",
      label: "Write the problem and outcome for a project",
      done: projects.some((item) => item.problem && item.outcome),
    },
    {
      key: "links",
      label: "Give a project a live or repo link",
      done: projects.some((item) => (describePost(item.post).ship?.links.length || 0) > 0),
    },
    {
      key: "headline",
      label: "Write a one-line headline",
      done: Boolean(portfolio.headline?.trim()),
    },
    {
      key: "about",
      label: "Say a little about yourself",
      done: (portfolio.about?.trim() || profile.bio?.trim() || "").length >= 60,
    },
    { key: "skills", label: "List 3 or more skills", done: (portfolio.skills || []).length >= 3 },
    {
      key: "background",
      label: "Add experience, a certificate or a bootcamp",
      done: experiences.length + certificates.length + learning.length > 0,
    },
    { key: "photo", label: "Add a profile photo", done: Boolean(profile.avatar_url) },
    {
      key: "contact",
      label: "Add an email or social link",
      done: Object.values(social).some(Boolean) || Boolean(profile.website),
    },
  ];
  const done = checks.filter((check) => check.done).length;
  return {
    checks,
    score: Math.round((done / checks.length) * 100),
    canPublish: checks.filter((check) => check.required).every((check) => check.done),
  };
}
