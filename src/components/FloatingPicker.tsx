import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown } from "@/components/icons/glyphs";

export type PickerOption = {
  value: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  meta?: ReactNode;
};

/**
 * A Zero Club dropdown: a field that opens a floating, scrollable card of
 * options — not the phone's own picker.
 */
export function FloatingPicker({
  value,
  options,
  onChange,
  placeholder = "Choose",
  emptyText = "Nothing to choose from yet.",
}: {
  value?: string;
  options: PickerOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", away, true);
      window.removeEventListener("keydown", key);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative" data-vaul-no-drag>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex h-11 w-full items-center gap-2.5 rounded-[10px] border bg-card px-3 text-left text-[15px] outline-none transition ${open ? "border-[#cc208f]" : "border-foreground/15 hover:border-foreground/30"}`}
      >
        {selected?.icon && <span className="shrink-0">{selected.icon}</span>}
        <span className={`min-w-0 flex-1 truncate ${selected ? "font-medium text-foreground" : "text-muted-foreground"}`}>
          {selected?.label || placeholder}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="listbox"
          className="zc-picker-card absolute inset-x-0 top-[calc(100%+6px)] z-[70] max-h-64 overflow-y-auto overscroll-contain rounded-2xl border border-border bg-card p-1.5 shadow-[0_22px_48px_-16px_rgba(0,0,0,0.45)]"
        >
          {options.length === 0 && <p className="px-3 py-4 text-center text-[13px] text-muted-foreground">{emptyText}</p>}
          {options.map((o) => {
            const active = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${active ? "bg-[#cc208f]/[0.08]" : "hover:bg-foreground/[0.04]"}`}
              >
                {o.icon && <span className="shrink-0">{o.icon}</span>}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-semibold text-foreground">{o.label}</span>
                  {o.description && <span className="mt-0.5 block text-[12.5px] leading-snug text-muted-foreground">{o.description}</span>}
                </span>
                {o.meta && <span className="shrink-0 text-[12.5px] font-semibold text-muted-foreground">{o.meta}</span>}
                {active && <Check className="h-4 w-4 shrink-0 text-[#cc208f]" strokeWidth={3} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
