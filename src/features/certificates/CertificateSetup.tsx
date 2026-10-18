import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/hooks/useUser";
import { certificateTemplates, emptyCertificateDesign, type CertificateDesign } from "./design";
import { CertificateArtwork } from "./CertificateArtwork";
import { SignatureInput, uploadCertificateAsset } from "./SignatureInput";
import { toast } from "sonner";

export function useCertificateStudio() {
  const { data: user } = useUser();
  return useQuery({
    queryKey: ["certificate-studio", user?.id, user?.tier, user?.account_type],
    enabled: !!user?.id,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_certificate_studio");
      if (error) throw error;
      return data as {
        can_manage: boolean;
        account_type: string;
        can_brand: boolean;
        defaults: CertificateDesign | null;
        issuer_name: string;
        logo: string | null;
      };
    },
  });
}

export function CertificateSetup({
  value,
  onChange,
  disabled = false,
  course,
  onBusyChange,
}: {
  value: CertificateDesign | null;
  onChange: (design: CertificateDesign) => void;
  disabled?: boolean;
  course?: string;
  onBusyChange?: (busy: boolean) => void;
}) {
  const studio = useCertificateStudio();
  const [side, setSide] = useState<"front" | "back">("front");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingSignature, setUploadingSignature] = useState(false);
  useEffect(() => {
    onBusyChange?.(uploadingLogo || uploadingSignature);
    return () => onBusyChange?.(false);
  }, [uploadingLogo, uploadingSignature, onBusyChange]);
  const design = value || emptyCertificateDesign;
  useEffect(() => {
    if (!value && studio.data?.defaults) onChange(studio.data.defaults);
  }, [value, studio.data?.defaults, onChange]);
  const update = (patch: Partial<CertificateDesign>) => onChange({ ...design, ...patch });
  const input =
    "min-h-11 w-full min-w-0 rounded-xl border border-border bg-card px-3 text-sm outline-none focus:border-primary";
  if (studio.isPending)
    return (
      <p role="status" className="py-3 text-sm text-muted-foreground">
        Loading certificate studio…
      </p>
    );
  if (studio.isError)
    return (
      <p className="text-sm text-destructive">
        Certificate studio couldn't load.{" "}
        <button type="button" onClick={() => studio.refetch()} className="min-h-11 underline">
          Try again
        </button>
      </p>
    );
  if (!studio.data?.can_manage)
    return (
      <p className="text-sm text-muted-foreground">
        Certificates are available to Tutors and organizations.
      </p>
    );
  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Choose a design. Every template includes a front and back.
        </p>
        <div className="inline-flex rounded-full bg-muted p-1">
          {(["front", "back"] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={side === s}
              onClick={() => setSide(s)}
              className={`min-h-10 rounded-full px-4 text-xs font-semibold capitalize ${side === s ? "bg-foreground text-background" : "text-muted-foreground"}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {certificateTemplates.map((template) => (
          <button
            key={template.id}
            type="button"
            aria-pressed={design.template === template.id}
            onClick={() =>
              update({
                template: template.id,
                signer_name: design.signer_name || studio.data.issuer_name,
              })
            }
            className={`min-w-0 overflow-hidden rounded-xl border bg-card text-left transition ${design.template === template.id ? "border-[#cc208f] ring-2 ring-[#cc208f]/20" : "border-border hover:border-foreground/30"}`}
          >
            <CertificateArtwork
              design={{ ...design, template: template.id }}
              side={side}
              course={course}
            />
            <div className="p-3">
              <p className="text-sm font-semibold">
                {template.name}
                {design.template === template.id ? " ✓" : ""}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{template.note}</p>
            </div>
          </button>
        ))}
      </div>
      {design.template && (
        <div className="overflow-hidden rounded-xl border border-border">
          <CertificateArtwork design={design} side={side} course={course} />
        </div>
      )}
      <div className="rounded-xl border border-border p-4">
        <label className="flex min-h-11 items-center justify-between gap-3 text-sm font-semibold">
          <span>Use my brand instead of Zero Club</span>
          <input
            type="checkbox"
            checked={design.use_brand}
            disabled={(!studio.data.can_brand && !design.use_brand) || disabled}
            onChange={(event) =>
              update({
                use_brand: event.target.checked,
                brand_name: design.brand_name || studio.data.issuer_name,
                brand_logo: design.brand_logo || studio.data.logo || "",
              })
            }
            className="h-5 w-5 accent-[#cc208f]"
          />
        </label>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {studio.data.can_brand
            ? "Use your organization or tutor logo and name on both sides."
            : "Custom branding is included for organizations, Tutor Pro and Tutor Max. Zero Club branding is available on your current plan."}
        </p>
        {design.use_brand && (
          <div className="mt-4 space-y-3">
            <label className="block space-y-1 text-xs font-semibold">
              <span>Brand name</span>
              <input
                className={input}
                value={design.brand_name}
                maxLength={80}
                onChange={(event) => update({ brand_name: event.target.value })}
              />
            </label>
            {design.brand_logo && (
              <img
                src={design.brand_logo}
                alt="Certificate brand logo"
                className="h-16 max-w-40 rounded-lg bg-white p-2 object-contain"
              />
            )}
            <label className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-border px-4 text-xs font-semibold">
              {uploadingLogo ? "Uploading…" : "Upload brand logo"}
              <input
                className="hidden"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={uploadingLogo || disabled}
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  setUploadingLogo(true);
                  try {
                    update({ brand_logo: await uploadCertificateAsset(file) });
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Logo upload failed");
                  } finally {
                    setUploadingLogo(false);
                  }
                }}
              />
            </label>
          </div>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs font-semibold">
          <span>Signatory name</span>
          <input
            value={design.signer_name}
            maxLength={80}
            onChange={(event) => update({ signer_name: event.target.value })}
            className={input}
          />
        </label>
        <label className="space-y-1 text-xs font-semibold">
          <span>Signatory title</span>
          <input
            value={design.signer_title}
            maxLength={80}
            onChange={(event) => update({ signer_title: event.target.value })}
            className={input}
          />
        </label>
      </div>
      <SignatureInput
        onBusyChange={setUploadingSignature}
        value={design.signature_url}
        onChange={(signature_url) => update({ signature_url })}
        disabled={disabled}
      />
      <label className="block space-y-1 text-xs font-semibold">
        <span>Message on the back</span>
        <textarea
          value={design.back_text}
          maxLength={400}
          onChange={(event) => update({ back_text: event.target.value })}
          rows={3}
          className={`${input} py-3 font-normal`}
        />
      </label>
      <p className="text-xs text-muted-foreground">
        Preview only. Learner name, course, date and verification code are filled in when a
        certificate is issued.
      </p>
    </fieldset>
  );
}
