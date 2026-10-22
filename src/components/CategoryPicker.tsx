import { useEffect, useState } from "react";
import { CardSelect } from "@/components/CardSelect";

/** The suggested skill categories for bootcamps and Zero Forms. */
export const SKILL_CATEGORIES = [
  "Development",
  "Design",
  "Data Science",
  "AI",
  "Marketing",
  "Business",
  "Motion",
  "DevOps",
  "Cybersecurity",
] as const;

const CUSTOM = "__custom__";

/**
 * A category dropdown with a "Custom…" choice at the end. Choosing it shows a
 * text box so any skill that isn't listed (e.g. "Photography", "UI Writing")
 * can be typed in. The value is always the plain category text, so nothing
 * downstream changes; a saved value that isn't in the list opens as Custom.
 */
export function CategoryPicker({
  value,
  onChange,
  className = "",
  inputClassName,
  disabled,
  options = SKILL_CATEGORIES as readonly string[],
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
  options?: readonly string[];
}) {
  const known = (v: string) => options.some((o) => o.toLowerCase() === v.trim().toLowerCase());
  const [custom, setCustom] = useState(() => !!value && !known(value));
  useEffect(() => {
    if (value && !known(value)) setCustom(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="space-y-2">
      <CardSelect
        value={custom ? CUSTOM : value || options[0]}
        onChange={(e) => {
          const next = e.target.value;
          if (next === CUSTOM) {
            setCustom(true);
            onChange(known(value) ? "" : value);
          } else {
            setCustom(false);
            onChange(next);
          }
        }}
        className={className}
        disabled={disabled}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        <option value={CUSTOM}>Custom…</option>
      </CardSelect>
      {custom && (
        <input
          autoFocus
          value={value}
          maxLength={60}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Type your category, e.g. Photography"
          className={inputClassName || className}
        />
      )}
    </div>
  );
}
