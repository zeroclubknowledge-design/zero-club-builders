import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CertificateSetup, useCertificateStudio } from "@/features/certificates/CertificateSetup";
import { CosignRequests } from "@/features/certificates/CosignRequests";
import { certificateDesignError, type CertificateDesign } from "@/features/certificates/design";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

export const Route = createFileRoute("/app/certifications")({ component: CertificationsPage });
function CertificationsPage() {
  const studio = useCertificateStudio();
  const client = useQueryClient();
  const [design, setDesign] = useState<CertificateDesign | null>(null);
  const [saving, setSaving] = useState(false);
  const [certificateUploading, setCertificateUploading] = useState(false);
  const save = async () => {
    if (certificateUploading) return;
    const error = certificateDesignError(design, { forDefaults: true });
    if (error) {
      toast.error(error);
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.rpc("save_certificate_defaults", { p_design: design });
      if (error) throw error;
      await client.invalidateQueries({ queryKey: ["certificate-studio"] });
      toast.success("Certificate design saved for your next bootcamp");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Certificate design could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="min-h-screen bg-canvas px-4 pb-28 pt-6 md:px-7">
      <main className="mx-auto w-full max-w-5xl space-y-6">
        <header>
          <p className="text-xs font-semibold uppercase tracking-widest text-[#a3186f]">
            Your learning. Your recognition.
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold">Certifications</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
            Thoughtfully designed credentials for the work your learners put in. Choose a template,
            personalize both sides and add your signature.
          </p>
        </header>
        <CosignRequests />
        <section className="rounded-2xl border border-border bg-card p-4 md:p-6">
          <CertificateSetup
            value={design}
            onChange={setDesign}
            onBusyChange={setCertificateUploading}
            disabled={saving || certificateUploading}
          />
        </section>
        {studio.data?.can_manage && (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={saving || certificateUploading}
              className="min-h-12 rounded-full bg-foreground px-6 text-sm font-semibold text-background disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save as my default"}
            </button>
            <Link
              to={
                studio.data?.account_type === "Institution"
                  ? "/app/institution-studio"
                  : "/app/tutor-studio/create"
              }
              className="inline-flex min-h-12 items-center rounded-full border border-border bg-card px-5 text-sm font-semibold"
            >
              Create a bootcamp
            </Link>
          </div>
        )}
        <p className="text-xs leading-relaxed text-muted-foreground">
          Saved defaults apply to new bootcamps you choose them for. Certificates already issued
          keep their original design, signature and verification code.
        </p>
      </main>
    </div>
  );
}
