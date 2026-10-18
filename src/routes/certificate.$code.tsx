import { useState } from "react";
import { CertificateArtwork } from "@/features/certificates/CertificateArtwork";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Award,
  BadgeCheck,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  ShieldAlert,
} from "@/components/icons/glyphs";
import { supabase } from "@/lib/supabase";
import { linkedInCertificateUrl } from "@/features/bootcamps/BootcampExtras";

/* Public certificate check page: /certificate/ZC-XXXX-XXXX-XXXX */
export const Route = createFileRoute("/certificate/$code")({
  component: CertificatePage,
  head: () => ({ meta: [{ title: "Certificate — Zero Club" }] }),
});

function CertificatePage() {
  const { code } = Route.useParams();
  const [side, setSide] = useState<"front" | "back">("front");
  const cert = useQuery({
    queryKey: ["certificate", code],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "get_bootcamp_certificate_v2" as never,
        { p_code: code } as never,
      );
      if (error) throw error;
      return data as any;
    },
    retry: false,
  });
  const c = cert.data;
  const url = typeof window !== "undefined" ? window.location.href : "";

  if (cert.isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-canvas">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (cert.isError)
    return (
      <div className="grid min-h-screen place-items-center bg-canvas p-6 text-center">
        <div>
          <p className="text-lg font-semibold">Certificate could not be loaded</p>
          <button
            type="button"
            onClick={() => cert.refetch()}
            className="mt-4 min-h-11 rounded-full bg-foreground px-5 text-background"
          >
            Try again
          </button>
        </div>
      </div>
    );
  if (!c) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-6 text-center">
        <ShieldAlert className="h-10 w-10 text-muted-foreground" />
        <h1 className="mt-4 font-display text-[22px] font-semibold">Certificate not found</h1>
        <p className="mt-2 max-w-sm text-[14px] text-muted-foreground">
          No Zero Club certificate has the code{" "}
          <span className="font-mono font-semibold">{code}</span>. Check the link and try again.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex h-11 items-center rounded-full bg-foreground px-5 text-[15px] font-semibold text-background"
        >
          Go to Zero Club
        </Link>
      </div>
    );
  }

  const issued = new Date(c.issued_at).toLocaleDateString([], {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return (
    <div className="min-h-screen bg-canvas px-4 py-8 print:bg-white print:p-0">
      <div className="mx-auto max-w-[880px] print:max-w-none">
        <div
          className={`mb-4 flex items-center gap-2.5 rounded-2xl px-4 py-3 print:hidden ${c.revoked ? "bg-foreground/[0.06]" : "bg-[#1a7f4b]/10"}`}
        >
          {c.revoked ? (
            <ShieldAlert className="h-5 w-5 shrink-0 text-muted-foreground" />
          ) : (
            <BadgeCheck className="h-5 w-5 shrink-0 text-[#1a7f4b]" />
          )}
          <p
            className={`text-[14px] font-semibold ${c.revoked ? "text-muted-foreground" : "text-[#1a7f4b]"}`}
          >
            {c.revoked
              ? "This certificate has been withdrawn by its issuer."
              : `Verified — issued by ${c.design?.use_brand ? c.design.brand_name : "Zero Club"}${!c.design?.use_brand && c.issuer_name ? ` and ${c.issuer_name}` : ""} on ${issued}.`}
          </p>
        </div>

        {c.design ? (
          <>
            <style>{`@media print { @page { size: A4 landscape; margin: 0; } .certificate-sheet { break-after: page; width: 297mm; height: 210mm; display: flex !important; align-items: center; background: white; } .certificate-sheet:last-child { break-after: auto; } .certificate-sheet svg { width: 100%; max-height: 210mm; } }`}</style>
            <div className="mb-4 flex justify-center gap-2 print:hidden">
              {(["front", "back"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={side === value}
                  onClick={() => setSide(value)}
                  className={`min-h-11 rounded-full px-5 text-sm font-semibold capitalize ${side === value ? "bg-foreground text-background" : "border border-border bg-card"}`}
                >
                  {value}
                </button>
              ))}
            </div>
            <div className={c.revoked ? "opacity-60" : ""}>
              {(["front", "back"] as const).map((value) => (
                <article
                  key={value}
                  className={`certificate-sheet overflow-hidden rounded-xl border border-border bg-white print:rounded-none print:border-0 ${side === value ? "block" : "hidden print:block"}`}
                >
                  <CertificateArtwork
                    design={c.design}
                    side={value}
                    learner={c.learner_name}
                    course={c.bootcamp_title}
                    code={c.code}
                    date={issued}
                    hours={c.hours}
                  />
                </article>
              ))}
            </div>
          </>
        ) : (
          <article
            className={`relative overflow-hidden rounded-[28px] border border-border bg-white p-7 text-[#16171a] shadow-[0_30px_60px_-30px_rgba(0,0,0,.35)] sm:p-12 print:rounded-none print:border-0 print:shadow-none ${c.revoked ? "opacity-60" : ""}`}
          >
            <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#cc208f] opacity-[0.12] blur-3xl" />
            <div className="pointer-events-none absolute -bottom-28 -left-20 h-72 w-72 rounded-full bg-[#cc208f] opacity-[0.08] blur-3xl" />
            <div className="relative flex items-center justify-between gap-4">
              <p className="font-display text-[18px] font-extrabold tracking-tight">Zero Club</p>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#cc208f]/10 px-3 py-1 text-[11.5px] font-bold uppercase tracking-[0.08em] text-[#cc208f]">
                <Award className="h-3.5 w-3.5" /> Certificate of completion
              </span>
            </div>

            <p className="relative mt-12 text-[13px] font-semibold uppercase tracking-[0.12em] text-[#6b6d74]">
              This certifies that
            </p>
            <h1 className="relative mt-2 font-display text-[34px] font-extrabold leading-[1.05] tracking-[-0.03em] sm:text-[48px]">
              {c.learner_name}
            </h1>
            <p className="relative mt-5 max-w-[560px] text-[15px] leading-relaxed text-[#45474d]">
              has successfully completed the {c.format === "workshop" ? "workshop" : "bootcamp"}
            </p>
            <p className="relative mt-1 font-display text-[22px] font-bold leading-snug tracking-tight text-[#cc208f] sm:text-[28px]">
              {c.bootcamp_title}
            </p>
            {c.hours ? (
              <p className="relative mt-2 text-[14px] text-[#6b6d74]">
                {c.hours} hours of live, instructor-led learning
              </p>
            ) : null}

            <div className="relative mt-12 grid gap-6 border-t border-black/10 pt-6 sm:grid-cols-3">
              <div>
                <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[#8a8c93]">
                  Instructor
                </p>
                <p className="mt-1 text-[15px] font-bold">{c.issuer_name || "Zero Club"}</p>
              </div>
              <div>
                <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[#8a8c93]">
                  Issued
                </p>
                <p className="mt-1 text-[15px] font-bold">{issued}</p>
              </div>
              <div>
                <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[#8a8c93]">
                  Certificate ID
                </p>
                <p className="mt-1 font-mono text-[14px] font-bold">{c.code}</p>
              </div>
            </div>
            <p className="relative mt-6 text-[12px] text-[#8a8c93]">
              Check this certificate at{" "}
              {typeof window !== "undefined" ? window.location.host : "zeroclubs.xyz"}/certificate/
              {c.code}
            </p>
          </article>
        )}

        {!c.revoked && (
          <div className="mt-5 flex flex-wrap justify-center gap-2 print:hidden">
            <a
              href={linkedInCertificateUrl({
                code: c.code,
                bootcamp_title: c.bootcamp_title,
                issued_at: c.issued_at,
              })}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center gap-2 rounded-full bg-[#0a66c2] px-5 text-[14.5px] font-semibold text-white"
            >
              Add to LinkedIn <ExternalLink className="h-4 w-4" />
            </a>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(url);
                toast.success("Link copied");
              }}
              className="inline-flex h-11 items-center gap-2 rounded-full border border-border bg-card px-5 text-[14.5px] font-semibold"
            >
              <Copy className="h-4 w-4" /> Copy link
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex h-11 items-center gap-2 rounded-full border border-border bg-card px-5 text-[14.5px] font-semibold"
            >
              <Download className="h-4 w-4" /> Save as PDF
            </button>
            {c.learner_username && (
              <Link
                to="/app/profile/$id"
                params={{ id: c.learner_username }}
                className="inline-flex h-11 items-center rounded-full px-4 text-[14.5px] font-semibold text-muted-foreground"
              >
                View profile
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
