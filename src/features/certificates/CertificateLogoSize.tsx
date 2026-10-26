import { useId } from "react";
import { LOGO_SCALE_MAX, LOGO_SCALE_MIN, logoScale, type CertificateDesign } from "./design";

/** Kept beside the artwork so the result stays visible while resizing. */
export function CertificateLogoSize({ design, disabled, onChange }: {
  design: CertificateDesign;
  disabled?: boolean;
  onChange: (scale: number) => void;
}) {
  const id = useId();
  const scale = logoScale(design);
  if (!design.use_brand || !design.brand_logo) return null;
  return (
    <div data-vaul-no-drag className="rounded-xl border border-border bg-card p-3 text-foreground">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-xs font-semibold">Logo size</label>
        <output htmlFor={id} className="text-[11.5px] font-semibold tabular-nums text-muted-foreground">
          {Math.round(scale * 100)}%
        </output>
      </div>
      <div className="flex min-h-11 items-center gap-3">
        <span className="text-[11px] text-muted-foreground">Smaller</span>
        <input id={id} type="range" min={LOGO_SCALE_MIN} max={LOGO_SCALE_MAX} step={0.05}
          disabled={disabled} value={scale} aria-valuetext={`${Math.round(scale * 100)} percent`}
          onChange={(event) => onChange(Number(event.currentTarget.value))}
          className="h-11 min-w-0 flex-1 cursor-pointer accent-[#c3217e]" />
        <span className="text-[11px] text-muted-foreground">Bigger</span>
      </div>
      <p className="text-[11px] text-muted-foreground">Updates both sides immediately. This size will be used on the issued certificate.</p>
    </div>
  );
}
