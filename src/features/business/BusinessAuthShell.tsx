import { Link } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { BriefcaseBusiness, Building2, ChevronLeft, ShieldCheck } from "@/components/icons/glyphs";

/** The dark, quiet frame shared by business sign up, sign in and onboarding. */
export function BusinessAuthShell({
  children,
  aside = true,
  topRight,
}: {
  children: ReactNode;
  aside?: boolean;
  topRight?: ReactNode;
}) {
  useEffect(() => {
    document.documentElement.classList.add("zc-biz-page");
    return () => document.documentElement.classList.remove("zc-biz-page");
  }, []);

  return (
    <div className="flex min-h-dvh flex-col overflow-x-hidden bg-[#07060a] px-4 py-4 text-white sm:px-6 sm:py-6">
      <div className="mx-auto flex w-full max-w-[1120px] items-center justify-between pb-4">
        <Link to={"/business" as never} aria-label="Zero Club for Business" className="flex items-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/[0.06] ring-1 ring-white/10"><ChevronLeft className="h-5 w-5 text-white/80" /></span>
          <img src="/logo.png" alt="" className="hidden h-7 w-7 object-contain sm:block" />
          <span className="hidden font-display text-[16px] font-semibold sm:block">Zero Club</span>
          <span className="hidden rounded-md bg-white/[0.08] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/70 sm:block">Business</span>
        </Link>
        {topRight}
      </div>

      <main className={`mx-auto grid w-full max-w-[1120px] flex-1 content-start overflow-hidden rounded-[26px] border border-white/[0.07] bg-[#0e0c11] lg:flex-none lg:content-normal ${aside ? "lg:grid-cols-[1fr_minmax(420px,470px)]" : ""}`}>
        {aside && (
          <section className="relative m-3 hidden overflow-hidden rounded-[20px] bg-[#0a070a] p-8 lg:flex lg:flex-col xl:p-10">
            <div aria-hidden className="absolute inset-0 bg-[radial-gradient(110%_80%_at_20%_10%,rgba(204,32,143,0.55)_0%,rgba(94,12,64,0.25)_45%,rgba(10,7,10,0.96)_75%)]" />
            <div aria-hidden className="absolute inset-0 [background-image:linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:44px_44px]" />
            <div className="relative max-w-md">
              <p className="text-sm font-medium text-[#f2a8dc]">Zero Club for Business</p>
              <h2 className="mt-3 font-display text-[34px] font-semibold leading-[1.08] tracking-[-0.02em] xl:text-[38px]">
                One account for your whole organization.
              </h2>
              <p className="mt-4 text-[14px] leading-6 text-white/60">
                Separate from your personal account. Switch between Company and Institutional whenever your work changes.
              </p>
            </div>
            <div className="relative mt-auto grid gap-3 pt-10">
              <AsideRow Icon={BriefcaseBusiness} title="Company" body="Hire builders, sponsor challenges, train your team." />
              <AsideRow Icon={Building2} title="Institutional" body="Run a tech hub with bootcamps, tutors and cohorts." />
              <AsideRow Icon={ShieldCheck} title="Verified hubs" body="Institutions are reviewed before they go live." />
            </div>
          </section>
        )}
        <section className="flex flex-col justify-center px-5 py-8 sm:px-10 lg:py-12">{children}</section>
      </main>
    </div>
  );
}

function AsideRow({ Icon, title, body }: { Icon: any; title: string; body: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/10"><Icon className="h-[18px] w-[18px]" /></span>
      <span>
        <span className="block text-[14px] font-semibold">{title}</span>
        <span className="mt-0.5 block text-[12.5px] leading-5 text-white/55">{body}</span>
      </span>
    </div>
  );
}

export const businessInput =
  "h-12 w-full rounded-xl border border-white/12 bg-white/[0.04] px-4 text-[15px] text-white outline-none transition placeholder:text-white/35 focus:border-[#cc208f]/70 focus:bg-white/[0.06]";
export const businessLabel = "mb-1.5 block text-[12.5px] font-semibold text-white/75";
export const businessPrimary =
  "flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#cc208f] text-[15px] font-semibold text-white shadow-[0_18px_36px_-20px_rgba(204,32,143,0.9)] transition hover:bg-[#b51b7f] active:scale-[0.99] disabled:opacity-60";
