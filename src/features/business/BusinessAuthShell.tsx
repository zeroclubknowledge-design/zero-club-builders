import { Link } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { BriefcaseBusiness, Building2, ChevronLeft, ShieldCheck } from "@/components/icons/glyphs";
import { usePublicTheme } from "@/hooks/usePublicTheme";

/**
 * The frame shared by business sign up, sign in and onboarding. It is the
 * personal sign-in page's own layout — cream/near-black page, glow card, the
 * dark identity panel with one bloom of brand light — so the two sides of
 * Zero Club read as one product.
 */
export function BusinessAuthShell({
  children,
  aside = true,
  topRight,
}: {
  children: ReactNode;
  aside?: boolean;
  topRight?: ReactNode;
}) {
  // Adopts the theme chosen on the landing pages.
  usePublicTheme();
  useEffect(() => {
    document.documentElement.classList.add("zc-auth-page");
    return () => document.documentElement.classList.remove("zc-auth-page");
  }, []);

  return (
    <div className="flex min-h-dvh flex-col overflow-x-hidden bg-[#f8f6f1] px-4 py-4 text-[#171417] dark:bg-[#0b0a0d] dark:text-white sm:px-6 sm:py-6">
      <div className="mx-auto flex w-full max-w-[1120px] items-center justify-between pb-4">
        <Link
          to={"/business" as never}
          className="grid h-10 w-10 place-items-center rounded-xl bg-black/[0.04] text-[#5a5056] ring-1 ring-black/10 transition hover:bg-black/[0.07] active:scale-[0.98] dark:bg-white/[0.06] dark:text-white/80 dark:ring-white/10 dark:hover:bg-white/10"
          aria-label="Back to Zero Club for Business"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={1.8} />
        </Link>
        {topRight}
      </div>

      <main className={`zc-glow-card mx-auto grid w-full max-w-[1120px] flex-1 content-start overflow-hidden rounded-[26px] bg-white dark:bg-[#100c11] lg:flex-none lg:content-normal ${aside ? "lg:grid-cols-2" : ""}`}>
        {aside && (
          <section className="relative hidden overflow-hidden rounded-[20px] bg-[#0a070a] p-8 lg:m-3 lg:flex lg:flex-col">
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                background:
                  "radial-gradient(120% 90% at 50% 22%, rgba(255,61,176,0.85) 0%, rgba(204,32,143,0.45) 26%, rgba(94,12,64,0.28) 48%, rgba(10,7,10,0.96) 74%)",
              }}
            />
            <div aria-hidden className="zc-grain absolute inset-0 opacity-[0.14]" />
            <div className="relative">
              <p className="text-sm font-medium text-[#f2a8dc]">Zero Club for Business</p>
              <h2 className="mt-3 font-display text-[34px] font-normal leading-[1.08] text-white">
                One account for your whole organization.
              </h2>
              <p className="mt-4 max-w-[340px] text-[14px] leading-6 text-white/60">
                Separate from your personal account. Switch between Company and Institutional whenever your work changes.
              </p>
            </div>
            <div className="relative mt-8 grid gap-2.5">
              <AsideRow Icon={BriefcaseBusiness} title="Company" body="Hire builders, sponsor challenges, train your team." />
              <AsideRow Icon={Building2} title="Institutional" body="Run a tech hub with bootcamps and tutors." />
              <AsideRow Icon={ShieldCheck} title="Verified hubs" body="Institutions are reviewed before they go live." />
            </div>
            <div className="relative mt-auto pt-8 text-center">
              <img decoding="async" src="/logo.png" alt="" className="mx-auto h-10 w-10 object-contain drop-shadow-[0_0_26px_rgba(204,32,143,0.7)]" />
              <p className="mt-3 font-display text-[19px] font-medium tracking-tight text-white">Zero Club for Business</p>
              <p className="mt-1 text-[12.5px] text-white/55">Where organizations meet builders.</p>
            </div>
          </section>
        )}
        <section className="px-5 py-8 sm:px-8 sm:py-10 lg:px-10">{children}</section>
      </main>
    </div>
  );
}

function AsideRow({ Icon, title, body }: { Icon: any; title: string; body: string }) {
  return (
    <div className="flex items-center gap-3.5 rounded-2xl bg-black/25 p-3.5 ring-1 ring-white/10 backdrop-blur-xl">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#cc208f]/25 text-[#f2a8dc] ring-1 ring-[#cc208f]/30">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-white">{title}</p>
        <p className="mt-0.5 text-[11.5px] leading-5 text-white/55">{body}</p>
      </div>
    </div>
  );
}

/** The mark shown above the form when the side panel is hidden (phones). */
export function BusinessFormMark() {
  return (
    <img
      decoding="async"
      src="/logo.png"
      alt="Zero Club"
      className="mx-auto mb-4 h-10 w-10 object-contain drop-shadow-[0_0_22px_rgba(204,32,143,0.6)] lg:hidden"
    />
  );
}

export const businessTopLink =
  "rounded-xl bg-black/[0.04] px-4 py-2 text-sm font-medium text-[#5a5056] ring-1 ring-black/10 transition hover:bg-black/[0.07] active:scale-[0.98] dark:bg-white/[0.06] dark:text-white/80 dark:ring-white/10 dark:hover:bg-white/10";
export const businessInput =
  "h-12 w-full rounded-xl border border-black/10 bg-[#fbfaf7] px-4 text-[15px] text-[#171417] outline-none transition placeholder:text-[#9b9297] focus:border-[#cc208f]/45 focus:bg-white focus:ring-4 focus:ring-[#cc208f]/10 dark:border-white/12 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-white/35 dark:focus:bg-white/[0.07]";
export const businessLabel = "mb-1.5 block text-[12px] font-medium text-[#5a5056] dark:text-white/60";
export const businessPrimary =
  "flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#cc208f] text-sm font-medium text-white shadow-[0_18px_36px_-20px_rgba(204,32,143,0.8)] transition hover:bg-[#ad1b79] active:scale-[0.99] disabled:opacity-60";
export const businessMuted = "text-[#6d6269] dark:text-white/50";
export const businessStrong = "text-[#241f23] dark:text-white";
