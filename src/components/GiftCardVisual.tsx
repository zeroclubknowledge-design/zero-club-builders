import { Gift } from "lucide-react";

export const giftTemplates = [
  { id: "signature", name: "Signature", shell: "bg-[#171218] text-white", accent: "bg-[#cc208f]", muted: "text-white/55" },
  { id: "studio", name: "Studio", shell: "bg-[#cc208f] text-white", accent: "bg-white text-[#cc208f]", muted: "text-white/70" },
  { id: "paper", name: "Paper", shell: "bg-[#f4f0e8] text-[#171218]", accent: "bg-[#171218] text-white", muted: "text-black/50" },
  { id: "signal", name: "Signal", shell: "bg-[#184f3c] text-white", accent: "bg-[#d6ff62] text-[#173328]", muted: "text-white/60" },
  { id: "cobalt", name: "Cobalt", shell: "bg-[#2446a8] text-white", accent: "bg-white text-[#2446a8]", muted: "text-white/65" },
  { id: "sun", name: "Sun", shell: "bg-[#f2c84b] text-[#201b12]", accent: "bg-[#201b12] text-white", muted: "text-black/55" },
] as const;

export const giftServices = [
  { id: "bootcamps", label: "Bootcamps", description: "Enrollment in any eligible bootcamp" },
  { id: "membership", label: "Membership", description: "Zero Club Premium membership" },
  { id: "zero-ai", label: "Zero AI", description: "Zero AI access and usage" },
  { id: "tutor-session", label: "Tutor session", description: "A one-to-one tutor booking" },
  { id: "zero-store", label: "Zero Store", description: "Products in the Zero Store" },
] as const;

export function GiftCardVisual({
  amount,
  service,
  templateId,
  code,
  message,
  compact = false,
}: {
  amount: number;
  service: string;
  templateId: string;
  code?: string;
  message?: string | null;
  compact?: boolean;
}) {
  const template = giftTemplates.find((item) => item.id === templateId) || giftTemplates[0];
  const serviceLabel = giftServices.find((item) => item.id === service)?.label || service;

  return (
    <div className={`relative aspect-[1.62/1] w-full overflow-hidden rounded-lg p-5 shadow-lift ${template.shell} ${compact ? "max-w-[320px]" : "max-w-[520px] sm:p-7"}`}>
      <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full border-[18px] border-current opacity-[0.08]" />
      <div className="absolute -bottom-12 right-16 h-24 w-24 rotate-12 border-[14px] border-current opacity-[0.06]" />
      <div className="relative flex h-full flex-col justify-between">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2.5"><img src="/logo.png" alt="" className="h-7 w-7 object-contain" /><span className="text-[13px] font-semibold">Zero Club Gift</span></div>
          <div className={`grid h-8 w-8 place-items-center rounded-lg ${template.accent}`}><Gift className="h-4 w-4 fill-current" /></div>
        </div>
        <div>
          <p className={`text-[9px] font-semibold uppercase ${template.muted}`}>For {serviceLabel}</p>
          <p className="mt-1 text-[30px] font-semibold leading-none tracking-tight tabular-nums sm:text-[38px]">₦{Number(amount || 0).toLocaleString()}</p>
          {message && <p className={`mt-2 line-clamp-1 text-[10px] ${template.muted}`}>{message}</p>}
        </div>
        <div className={`flex items-end justify-between gap-4 text-[9px] font-medium uppercase ${template.muted}`}><span>Restricted gift credit</span><span className="font-mono normal-case">{code || "ZC-GIFT"}</span></div>
      </div>
    </div>
  );
}
