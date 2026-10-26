import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/hooks/useUser";
import {
  certificateAccents,
  certificateTemplates,
  emptyCertificateDesign,
  needsCosigner,
  templateById,
  safeAccent,
  type CertificateDesign,
} from "./design";
import { CertificateArtwork } from "./CertificateArtwork";
import { CertificateLogoSize } from "./CertificateLogoSize";
import { CertificateAppearanceEditor } from "./CertificateAppearanceEditor";
import { SignatureInput } from "./SignatureInput";
import { Maximize2, X } from "@/components/icons/glyphs";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { BrandLogoPicker } from "./BrandLogoPicker";
import { UsernamePicker } from "@/components/UsernamePicker";

/** The bootcamp creator's view of the second signatory: waiting, or signed. */
function CosignerStatus({ bootcampId, profileId }: { bootcampId: string; profileId?: string }) {
  const q = useQuery({
    queryKey: ["bootcamp-certificate-cosigner", bootcampId, profileId],
    enabled: !!bootcampId && !!profileId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("bootcamp_certificate_cosigner" as never, { p_bootcamp: bootcampId } as never);
      if (error) throw error;
      return data as unknown as { status: string; name: string; signed_at: string | null; username: string | null } | null;
    },
  });
  if (!profileId || !q.data) return null;
  const signed = q.data.status === "signed";
  return (
    <p className={`rounded-xl px-3 py-2 text-xs font-semibold ${signed ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-amber-500/10 text-amber-700 dark:text-amber-400"}`}>
      {signed
        ? `✓ ${q.data.name || "Your second signatory"} signed${q.data.signed_at ? ` on ${new Date(q.data.signed_at).toLocaleDateString()}` : ""}.`
        : `Waiting for ${q.data.name || "them"}${q.data.username ? ` (@${q.data.username})` : ""} to sign. Certificates can't be issued until they do.`}
    </p>
  );
}

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
  bootcampId,
}: {
  value: CertificateDesign | null;
  onChange: (design: CertificateDesign) => void;
  disabled?: boolean;
  course?: string;
  onBusyChange?: (busy: boolean) => void;
  /** The saved bootcamp, when editing one: shows whether the second signatory has signed. */
  bootcampId?: string;
}) {
  const studio = useCertificateStudio();
  const [side, setSide] = useState<"front" | "back">("front");
  const [preview, setPreview] = useState<null | "front" | "back">(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingSignature, setUploadingSignature] = useState(false);
  const [cosignerSearch, setCosignerSearch] = useState("");
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
    // Seed the editor with the saved design without replacing an active draft.
    const source = draft || value || studio.data?.defaults;
    if (source && ((!value && !draft) || source.artwork_version !== 2)) {
      const next: CertificateDesign = { ...source, artwork_version: 2 };
      setDraft(next);
      onChange(next);
    }
  }, [value, draft, studio.data?.defaults, onChange]);
  const update = (patch: Partial<CertificateDesign>) => {
    const next: CertificateDesign = { ...design, ...patch, artwork_version: 2 };
    if (patch.brand_accent !== undefined && design.appearance?.accent_color !== undefined)
      next.appearance = { ...design.appearance, accent_color: patch.brand_accent };
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
  const accent = safeAccent(design.appearance?.accent_color || design.brand_accent, "#c3217e");
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
                brand_accent: design.brand_accent || "#c3217e",
              })
            }
            className={`relative h-8 w-[58px] shrink-0 rounded-full transition-colors disabled:opacity-45 ${brandOn ? "bg-[#c3217e]" : "bg-foreground/15"}`}
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
              className={`rounded-xl border p-3 text-left transition disabled:opacity-45 ${brandOn === option.on ? "border-[#c3217e] bg-[#c3217e]/[0.06]" : "border-border hover:border-foreground/25"}`}
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
            <Link to="/app/premium" className="font-semibold text-[#c3217e]">
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
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(240px,0.85fr)_minmax(0,1.4fr)]">
          <div className="order-2 min-w-0 lg:order-1">
            <CertificateAppearanceEditor design={design} disabled={disabled} onChange={(appearance) => update({ appearance })} />
          </div>
          <div className="order-1 min-w-0 space-y-3 lg:sticky lg:top-4 lg:order-2">
            <CertificateLogoSize design={design} disabled={disabled} onChange={(brand_logo_scale) => update({ brand_logo_scale })} />
            <div className="overflow-hidden rounded-xl border border-border bg-white shadow-[0_18px_40px_-28px_rgba(0,0,0,0.45)]">
              <CertificateArtwork design={design} side={side} course={course} />
            </div>
          </div>
        </div>
      </section>

      {/* ── Templates ────────────────────────────────────────────────────── */}
      {([
        { pro: false, title: "Free collection", note: "Six coordinated front-and-back designs, free for every Tutor and organization." },
        { pro: true, title: "PRO collection", note: canBrand
            ? "Bold, colour-rich designs. Recolour every part, and the two-signature designs add a space for a second signatory."
            : "Bold, colour-rich designs for Tutor Pro, Tutor Max and organization plans. Preview them here." },
      ] as const).map((group) => (
        <section key={group.title} className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="flex items-center gap-2 text-[13px] font-semibold">
                {group.title}
                {group.pro && <span className="rounded-full bg-[#c3217e] px-2 py-0.5 text-[10px] font-bold tracking-wide text-white">PRO</span>}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">{group.note}</p>
            </div>
            {group.pro && !canBrand && (
              <Link to="/app/premium" className="text-xs font-semibold text-[#c3217e]">Go PRO →</Link>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {certificateTemplates.filter((t) => t.pro === group.pro).map((template) => {
              const selected = design.template === template.id;
              const locked = template.pro && !canBrand;
              return (
                <button
                  key={template.id}
                  type="button"
                  aria-pressed={selected}
                  aria-disabled={locked}
                  onClick={() => {
                    if (locked) {
                      toast("This design is part of the PRO collection", { description: "Upgrade to Tutor Pro, Tutor Max or an organization plan to use it." });
                      return;
                    }
                    update({
                      template: template.id,
                      signer_name: design.signer_name || studio.data.issuer_name,
                    });
                  }}
                  className={`relative min-w-0 overflow-hidden rounded-xl border bg-white text-left transition ${selected ? "border-[#c3217e] ring-2 ring-[#c3217e]/25" : "border-border hover:border-foreground/30"}`}
                >
                  <div className={locked ? "opacity-80" : undefined}>
                    <CertificateArtwork design={{ ...design, template: template.id }} side={side} course={course} />
                  </div>
                  {template.pro && (
                    <span className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-bold tracking-wide text-white backdrop-blur">
                      {locked ? "🔒 PRO" : "PRO"}
                    </span>
                  )}
                  <div className="border-t border-border bg-card p-3">
                    <p className="flex items-center gap-1.5 text-[13px] font-semibold">
                      {template.name}
                      {selected && <span className="text-[#c3217e]">✓</span>}
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                      {template.note}
                      {template.signatures > 1 && <span className="font-semibold text-foreground"> Two signatures.</span>}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      ))}
      {templateById(design.template)?.pro && !canBrand && (
        <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-700 dark:text-amber-400">
          This bootcamp uses a PRO design. Choose a free design, or <Link to="/app/premium" className="underline">upgrade</Link> to keep it.
        </p>
      )}

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

      {needsCosigner(design.template) && (
        <section className="space-y-4 rounded-2xl border border-[#c3217e]/30 bg-[#c3217e]/[0.035] p-4">
          <div>
            <p className="text-[13px] font-semibold">Second signatory</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              This design has two signatures. Choose who signs next to you, for example the tutor assigned to this bootcamp.
              They get a notification and add their own signature from their account. Certificates can't be issued until they've signed,
              so ask them to sign before the bootcamp starts.
            </p>
          </div>
          {design.cosigner?.profile_id ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2.5">
              <p className="min-w-0 truncate text-sm font-semibold">
                {design.cosigner.name || design.cosigner.username}
                {design.cosigner.username && <span className="font-normal text-muted-foreground"> · @{design.cosigner.username}</span>}
              </p>
              <button type="button" onClick={() => update({ cosigner: null })} className="shrink-0 text-xs font-semibold text-muted-foreground hover:text-foreground">
                Change
              </button>
            </div>
          ) : (
            <UsernamePicker
              value={cosignerSearch}
              onChange={setCosignerSearch}
              onPick={(user) => {
                setCosignerSearch("");
                update({ cosigner: { profile_id: user.id, username: user.username, name: user.full_name || user.username, title: design.cosigner?.title || "Tutor" } });
              }}
              placeholder="Search by @username"
              className={input}
            />
          )}
          {design.cosigner?.profile_id && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs font-semibold">
                <span>Name on the certificate</span>
                <input value={design.cosigner.name} maxLength={80} onChange={(e) => update({ cosigner: { ...design.cosigner!, name: e.target.value } })} className={input} />
              </label>
              <label className="space-y-1 text-xs font-semibold">
                <span>Title</span>
                <input value={design.cosigner.title} maxLength={80} onChange={(e) => update({ cosigner: { ...design.cosigner!, title: e.target.value } })} className={input} />
              </label>
            </div>
          )}
          {bootcampId && <CosignerStatus bootcampId={bootcampId} profileId={design.cosigner?.profile_id} />}
        </section>
      )}

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
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(250px,0.7fr)_minmax(0,1.7fr)]">
            <CertificateAppearanceEditor design={design} disabled={disabled} onChange={(appearance) => update({ appearance })} />
            <div className="min-w-0 space-y-3 lg:sticky lg:top-2">
              <CertificateLogoSize design={design} disabled={disabled} onChange={(brand_logo_scale) => update({ brand_logo_scale })} />
              <div className="overflow-hidden rounded-lg bg-white shadow-2xl">
                <CertificateArtwork design={design} side={preview || "front"} course={course} />
              </div>
            </div>
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
