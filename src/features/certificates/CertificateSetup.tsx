import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/hooks/useUser";
import {
  certificateAccents,
  certificateTemplates,
  emptyCertificateDesign,
  LOGO_SCALE_MAX,
  LOGO_SCALE_MIN,
  logoScale,
  safeAccent,
  type CertificateDesign,
} from "./design";
import { CertificateArtwork } from "./CertificateArtwork";
import { SignatureInput } from "./SignatureInput";
import { Maximize2, X } from "@/components/icons/glyphs";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { BrandLogoPicker } from "./BrandLogoPicker";

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
        /** The account's saved brand logo, kept apart from the profile photo. */
        brand_logo: string | null;
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
  const [preview, setPreview] = useState<null | "front" | "back">(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingSignature, setUploadingSignature] = useState(false);
  /* The artwork is drawn from a local draft, not straight from `value`.
     `value` starts empty and is filled from saved defaults asynchronously, so
     drawing from it meant the preview could show the old design for a moment —
     or, when the defaults arrived mid-edit, replace what was just typed. The
     draft is written on the same event as the keystroke, so the preview and the
     fields can never disagree. */
  const [draft, setDraft] = useState<CertificateDesign | null>(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);
  useEffect(() => {
    onBusyChange?.(uploadingLogo || uploadingSignature);
    return () => onBusyChange?.(false);
  }, [uploadingLogo, uploadingSignature, onBusyChange]);
  const design = draft || value || studio.data?.defaults || emptyCertificateDesign;
  useEffect(() => {
    // Seed an empty studio with the saved default exactly once.
    if (!value && !draft && studio.data?.defaults) {
      setDraft(studio.data.defaults);
      onChange(studio.data.defaults);
    }
  }, [value, draft, studio.data?.defaults, onChange]);
  const update = (patch: Partial<CertificateDesign>) => {
    const next = { ...design, ...patch };
    setDraft(next);
    onChange(next);
  };
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

  const brandOn = design.use_brand;
  const accent = safeAccent(design.brand_accent, "#cc208f");
  const canBrand = studio.data.can_brand;

  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-6">
      {/* ── Identity: whose certificate is this? ─────────────────────────── */}
      <section className="rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold">Certificate identity</p>
            <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
              {brandOn
                ? "Your logo, name and colour are on both sides, so every certificate looks like yours."
                : "Issued under the Zero Club identity, with the same formal finish on both sides."}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={brandOn}
            aria-label="Use my brand on certificates"
            disabled={!canBrand && !brandOn}
            onClick={() =>
              update({
                use_brand: !brandOn,
                brand_name: design.brand_name || studio.data.issuer_name,
                brand_logo: design.brand_logo || studio.data.brand_logo || "",
                brand_accent: design.brand_accent || "#cc208f",
              })
            }
            className={`relative h-8 w-[58px] shrink-0 rounded-full transition-colors disabled:opacity-45 ${brandOn ? "bg-[#cc208f]" : "bg-foreground/15"}`}
          >
            <span
              className={`absolute top-1 grid h-6 w-6 place-items-center rounded-full bg-white text-[10px] font-bold text-foreground shadow-sm transition-all ${brandOn ? "left-[30px]" : "left-1"}`}
            >
              {brandOn ? "You" : "ZC"}
            </span>
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {[
            { on: false, title: "Zero Club", detail: "Our identity, our seal" },
            { on: true, title: "Your brand", detail: canBrand ? "Your logo and colour" : "PRO" },
          ].map((option) => (
            <button
              key={option.title}
              type="button"
              aria-pressed={brandOn === option.on}
              disabled={option.on && !canBrand}
              onClick={() =>
                update({
                  use_brand: option.on,
                  brand_name: option.on ? design.brand_name || studio.data.issuer_name : design.brand_name,
                  brand_logo: option.on ? design.brand_logo || studio.data.brand_logo || "" : design.brand_logo,
                })
              }
              className={`rounded-xl border p-3 text-left transition disabled:opacity-45 ${brandOn === option.on ? "border-[#cc208f] bg-[#cc208f]/[0.06]" : "border-border hover:border-foreground/25"}`}
            >
              <span className="block text-[13px] font-semibold">{option.title}</span>
              <span className="mt-0.5 block text-[11px] text-muted-foreground">{option.detail}</span>
            </button>
          ))}
        </div>
        {!canBrand && (
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            Your own logo and colour on certificates is a PRO feature: Tutor Pro, Tutor Max or an
            organization plan. Free accounts issue certificates with Zero Club branding.{" "}
            <Link to="/app/premium" className="font-semibold text-[#cc208f]">
              Go PRO
            </Link>
          </p>
        )}

        {brandOn && (
          <div className="mt-4 space-y-4 border-t border-border pt-4">
            <BrandLogoPicker
              value={design.brand_logo || ""}
              savedLogo={studio.data.brand_logo}
              profilePhoto={studio.data.logo}
              disabled={disabled}
              onChange={(brand_logo) => update({ brand_logo })}
              onBusyChange={setUploadingLogo}
            />
            {design.brand_logo && (
              <div className="rounded-xl border border-border p-3">
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="cert-logo-size" className="text-xs font-semibold">Logo size</label>
                  <span className="text-[11.5px] font-semibold tabular-nums text-muted-foreground">
                    {Math.round(logoScale({ use_brand: true, brand_logo_scale: design.brand_logo_scale }) * 100)}%
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <span className="text-[11px] text-muted-foreground">Smaller</span>
                  <input
                    id="cert-logo-size"
                    type="range"
                    min={LOGO_SCALE_MIN}
                    max={LOGO_SCALE_MAX}
                    step={0.05}
                    disabled={disabled}
                    value={logoScale({ use_brand: true, brand_logo_scale: design.brand_logo_scale })}
                    onChange={(event) => update({ brand_logo_scale: Number(event.target.value) })}
                    className="h-2 min-w-0 flex-1 cursor-pointer accent-[#cc208f]"
                  />
                  <span className="text-[11px] text-muted-foreground">Bigger</span>
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground">Make your logo stand out on both sides of the certificate. Check it in the live preview below.</p>
              </div>
            )}
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <label className="block space-y-1 text-xs font-semibold">
                  <span>Brand name</span>
                  <input
                    className={input}
                    value={design.brand_name}
                    placeholder={studio.data.issuer_name}
                    maxLength={80}
                    onChange={(event) => update({ brand_name: event.target.value })}
                  />
                </label>
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold">Brand colour</p>
              <div className="flex flex-wrap items-center gap-2">
                {certificateAccents.map((colour) => (
                  <button
                    key={colour}
                    type="button"
                    aria-label={`Brand colour ${colour}`}
                    aria-pressed={accent.toLowerCase() === colour.toLowerCase()}
                    onClick={() => update({ brand_accent: colour })}
                    style={{ backgroundColor: colour }}
                    className={`h-8 w-8 rounded-full transition ${accent.toLowerCase() === colour.toLowerCase() ? "ring-2 ring-offset-2 ring-foreground" : "ring-1 ring-black/10"}`}
                  />
                ))}
                <label className="flex h-8 items-center gap-1.5 rounded-full border border-border px-2.5 text-[11px] font-semibold text-muted-foreground">
                  <input
                    type="color"
                    aria-label="Pick a custom brand colour"
                    value={accent}
                    onChange={(event) => update({ brand_accent: event.target.value })}
                    className="h-5 w-5 cursor-pointer border-0 bg-transparent p-0"
                  />
                  Custom
                </label>
              </div>
            </div>

          </div>
        )}
      </section>

      {/* ── Preview ──────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[13px] font-semibold">Live preview</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Exactly what your learners will receive.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-full bg-muted p-1">
              {(["front", "back"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={side === s}
                  onClick={() => setSide(s)}
                  className={`min-h-9 rounded-full px-4 text-xs font-semibold capitalize ${side === s ? "bg-foreground text-background" : "text-muted-foreground"}`}
                >
                  {s}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setPreview(side)}
              disabled={!design.template}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-semibold disabled:opacity-40"
            >
              <Maximize2 className="h-3.5 w-3.5" /> Full size
            </button>
          </div>
        </div>
        <div className="overflow-hidden rounded-xl border border-border bg-white shadow-[0_18px_40px_-28px_rgba(0,0,0,0.45)]">
          <CertificateArtwork design={design} side={side} course={course} />
        </div>
      </section>

      {/* ── Templates ────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div>
          <p className="text-[13px] font-semibold">Template</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Six compositions. Your identity carries through whichever you pick.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {certificateTemplates.map((template) => {
            const selected = design.template === template.id;
            return (
              <button
                key={template.id}
                type="button"
                aria-pressed={selected}
                onClick={() =>
                  update({
                    template: template.id,
                    signer_name: design.signer_name || studio.data.issuer_name,
                  })
                }
                className={`min-w-0 overflow-hidden rounded-xl border bg-white text-left transition ${selected ? "border-[#cc208f] ring-2 ring-[#cc208f]/25" : "border-border hover:border-foreground/30"}`}
              >
                <CertificateArtwork
                  design={{ ...design, template: template.id }}
                  side={side}
                  course={course}
                />
                <div className="border-t border-border bg-card p-3">
                  <p className="flex items-center gap-1.5 text-[13px] font-semibold">
                    {template.name}
                    {selected && <span className="text-[#cc208f]">✓</span>}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    {template.note}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Signatory ────────────────────────────────────────────────────── */}
      <section className="space-y-4 rounded-2xl border border-border bg-card p-4">
        <div>
          <p className="text-[13px] font-semibold">Signatory</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Appears with the seal and the issue date on the front.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs font-semibold">
            <span>Name</span>
            <input
              value={design.signer_name}
              maxLength={80}
              onChange={(event) => update({ signer_name: event.target.value })}
              className={input}
            />
          </label>
          <label className="space-y-1 text-xs font-semibold">
            <span>Title</span>
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
      </section>

      <section className="space-y-2">
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
      </section>

      <Dialog open={preview !== null} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-h-[94vh] w-[96vw] max-w-[1180px] overflow-y-auto border-0 bg-transparent p-2 shadow-none sm:p-4">
          <DialogTitle className="sr-only">Certificate preview</DialogTitle>
          <div className="mb-2 flex items-center justify-between gap-2 text-white">
            <div className="inline-flex rounded-full bg-white/15 p-1 backdrop-blur">
              {(["front", "back"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={preview === s}
                  onClick={() => setPreview(s)}
                  className={`min-h-9 rounded-full px-4 text-xs font-semibold capitalize ${preview === s ? "bg-white text-foreground" : "text-white/80"}`}
                >
                  {s}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setPreview(null)}
              aria-label="Close preview"
              className="grid h-9 w-9 place-items-center rounded-full bg-white/15 text-white backdrop-blur"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="overflow-hidden rounded-lg bg-white shadow-2xl">
            <CertificateArtwork design={design} side={preview || "front"} course={course} />
          </div>
          <p className="mt-2 text-center text-[11px] text-white/70">
            Screens are illustrative. The issued certificate uses the learner's real name, date and
            verification code.
          </p>
        </DialogContent>
      </Dialog>
    </fieldset>
  );
}
