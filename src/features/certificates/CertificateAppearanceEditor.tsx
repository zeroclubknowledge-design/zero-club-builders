import { useId } from "react";
import {
  certificateColorLabels, certificateFonts, certificatePalette, certificateAppearanceError, readableOn, safeAccent,
  type CertificateAppearance, type CertificateDesign, type CertificateFont,
} from "./design";

const field = "min-h-10 w-full min-w-0 rounded-lg border border-border bg-background px-2.5 text-xs text-foreground outline-none focus:border-primary";
const presets: { name: string; value: CertificateAppearance }[] = [
  { name: "Ivory", value: { background_color: "#fcf9f2", back_background_color: "#fcf9f2", text_color: "#282b31", secondary_text_color: "#727067", accent_color: "#956e36", border_color: "#b69862", panel_color: "#273338", panel_text_color: "#ffffff" } },
  { name: "Midnight", value: { background_color: "#142630", back_background_color: "#142630", text_color: "#f8f5ed", secondary_text_color: "#c1cbd0", accent_color: "#dec18a", border_color: "#b69b6b", panel_color: "#203b48", panel_text_color: "#f8f5ed" } },
  { name: "Emerald", value: { background_color: "#f5faf6", back_background_color: "#f5faf6", text_color: "#173a2d", secondary_text_color: "#526b5e", accent_color: "#347b58", border_color: "#9db6a5", panel_color: "#173a2d", panel_text_color: "#ffffff" } },
  { name: "Monochrome", value: { background_color: "#ffffff", back_background_color: "#ffffff", text_color: "#181818", secondary_text_color: "#606060", accent_color: "#333333", border_color: "#999999", panel_color: "#181818", panel_text_color: "#ffffff" } },
];

function ColourField({ label, value, fallback, disabled, onChange }: { label: string; value?: string; fallback: string; disabled?: boolean; onChange: (value: string | undefined) => void }) {
  const id = useId();
  return <div className="min-w-0 space-y-1.5">
    <label htmlFor={id} className="block text-[11px] font-semibold">{label}</label>
    <div className="flex items-center gap-1.5">
      <input type="color" aria-label={`Pick ${label.toLowerCase()} colour`} value={safeAccent(value,fallback)} disabled={disabled}
        onChange={e=>onChange(e.currentTarget.value)} className="h-10 w-10 shrink-0 cursor-pointer rounded-lg border border-border bg-background p-1" />
      <input id={id} value={value ?? fallback} spellCheck={false} maxLength={7} placeholder={fallback} disabled={disabled}
        onChange={e=>onChange(e.currentTarget.value)} className={`${field} font-mono`} />
      <button type="button" aria-label={`Reset ${label.toLowerCase()} colour`} disabled={disabled || value===undefined} onClick={()=>onChange(undefined)} className="h-10 shrink-0 px-1 text-xs text-muted-foreground disabled:opacity-30">↺</button>
    </div>
  </div>;
}

export function CertificateAppearanceEditor({ design, disabled, onChange }: { design: CertificateDesign; disabled?: boolean; onChange: (appearance: CertificateAppearance | undefined) => void }) {
  const a = design.appearance || {};
  const p = certificatePalette(design), back = certificatePalette(design,"back");
  const update = (patch: Partial<CertificateAppearance>) => onChange({...a,...patch});
  const defaults = {
    background_color:p.paper, back_background_color:back.paper, text_color:p.ink, secondary_text_color:p.muted,
    title_color:p.ink, recipient_color:p.ink, course_color:p.ink, accent_color:p.accent,
    border_color:p.metal, panel_color:p.deep, panel_text_color:readableOn(p.deep),
    signature_background_color:readableOn(p.paper)==="#ffffff"?"#ffffff":p.paper,
  };
  return <section className="min-w-0 space-y-3 rounded-xl border border-border bg-card p-3 text-foreground">
    <div className="flex items-start justify-between gap-3">
      <div><h3 className="text-[13px] font-semibold">Customize appearance</h3><p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Every change appears in the preview and is saved with this certificate design.</p></div>
      <button type="button" disabled={disabled || !design.appearance} onClick={()=>onChange(undefined)} className="min-h-10 shrink-0 text-[11px] font-semibold text-primary disabled:opacity-40">Reset style</button>
    </div>
    <div className="flex flex-wrap gap-1.5" aria-label="Certificate colour presets">
      {presets.map(preset=><button type="button" key={preset.name} disabled={disabled}
        onClick={()=>update({...preset.value,title_color:undefined,recipient_color:undefined,course_color:undefined,signature_background_color:undefined})}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border px-2.5 text-[11px] font-semibold disabled:opacity-40">
        <span aria-hidden className="h-3 w-3 rounded-full border border-foreground/15" style={{backgroundColor:preset.value.background_color}} />{preset.name}
      </button>)}
    </div>
    <details className="rounded-lg border border-border p-3">
      <summary className="cursor-pointer text-xs font-semibold">Colours</summary>
      <div className="mt-3 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
        {Object.entries(certificateColorLabels).map(([name,label])=>{
          const key=name as keyof typeof certificateColorLabels;
          return <ColourField key={key} label={label} value={a[key]} fallback={defaults[key]} disabled={disabled} onChange={value=>update({[key]:value})} />;
        })}
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">Choose contrasting colours so the certificate is easy to read. Logos and signatures retain their original image colours.</p>
    </details>
    <details className="rounded-lg border border-border p-3">
      <summary className="cursor-pointer text-xs font-semibold">Typography and layout</summary>
      <div className="mt-3 space-y-3">
        {([["body_font","Body font"],["heading_font","Heading font"],["recipient_font","Learner name font"]] as const).map(([key,label])=><label key={key} className="block space-y-1 text-[11px] font-semibold">
          <span>{label}</span><select aria-label={label} value={a[key] || ""} disabled={disabled} className={field} onChange={e=>update({[key]:(e.currentTarget.value || undefined) as CertificateFont | undefined})}>
            <option value="">Template default</option>{Object.entries(certificateFonts).map(([value,font])=><option key={value} value={value}>{font.label}</option>)}
          </select>
        </label>)}
        {([["title_size","Heading size",28,48,design.template==="cobalt"?39:43],["recipient_size","Learner name size",24,50,46],["course_size","Programme title size",14,24,21]] as const).map(([key,label,min,max,fallback])=><label key={key} className="block text-[11px] font-semibold">
          <span className="flex justify-between"><span>{label}</span><span>{a[key] ?? fallback}</span></span>
          <input type="range" aria-label={label} min={min} max={max} step={1} value={a[key] ?? fallback} disabled={disabled} onChange={e=>update({[key]:Number(e.currentTarget.value)})} className="h-11 w-full accent-[#c3217e]" />
        </label>)}
        <label className="block space-y-1 text-[11px] font-semibold"><span>Front layout</span>
          <select aria-label="Front layout" value={a.alignment || "template"} disabled={disabled} onChange={e=>update({alignment:e.currentTarget.value as CertificateAppearance["alignment"]})} className={field}>
            <option value="template">Template default</option><option value="left">Left aligned</option><option value="center">Centered</option>
          </select>
        </label>
        {([["show_ornaments","Decorative borders and panels"],["show_seal","Completion seal"],["show_texture","Paper texture"]] as const).map(([key,label])=><label key={key} className="flex min-h-10 items-center justify-between gap-3 text-xs">
          <span>{label}</span><input type="checkbox" checked={a[key]!==false} disabled={disabled} onChange={e=>update({[key]:e.currentTarget.checked})} className="h-4 w-4 accent-[#c3217e]" />
        </label>)}
      </div>
    </details>
    <details className="rounded-lg border border-border p-3">
      <summary className="cursor-pointer text-xs font-semibold">Certificate wording</summary>
      <div className="mt-3 space-y-3">
        {([["heading","Certificate heading","Certificate of Completion"],["recipient_label","Recipient introduction","THIS CERTIFIES THAT"],["completion_text","Completion statement","has successfully completed the programme"],["recognition_text","Recognition line","Awarded in recognition of commitment, learning and practical development."]] as const).map(([key,label,fallback])=><label key={key} className="block space-y-1 text-[11px] font-semibold">
          <span>{label}</span><input className={field} value={a[key] ?? fallback} maxLength={120} disabled={disabled} onChange={e=>update({[key]:e.currentTarget.value})} />
        </label>)}
        <p className="text-[11px] text-muted-foreground">Leave a line empty to hide it. Learner names, programme details and verification codes are filled from the actual completion record.</p>
      </div>
    </details>
    {certificateAppearanceError(a) && <p role="alert" className="text-xs text-destructive">{certificateAppearanceError(a)}</p>}
  </section>;
}
