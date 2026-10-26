import { useState } from "react";

/** Stable random faces keep a player recognizable across rooms and devices. */
export function GameAvatar({
  id,
  name,
  photo,
  className = "h-10 w-10",
}: {
  id: string;
  name: string;
  photo?: string | null;
  className?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  let seed = 2166136261;
  for (const character of id) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619) >>> 0;
  const colors = ["#bd9bff", "#73e6b1", "#ffbca1", "#75cfff", "#fd85ca", "#ffd575"];
  const color = colors[seed % colors.length];
  return (
    <span
      className={`relative inline-flex shrink-0 overflow-hidden rounded-full bg-[#23172d] ${className}`}
    >
      {photo && failed !== photo ? (
        <img
          src={photo}
          alt={name}
          className="h-full w-full object-cover"
          onError={() => setFailed(photo)}
        />
      ) : (
        <svg viewBox="0 0 64 64" className="h-full w-full" role="img" aria-label={`${name} avatar`}>
          <rect width="64" height="64" fill={color} />
          <path
            d={seed % 2 ? "M0 0h64v20L0 47Z" : "M0 64V27L64 5v59Z"}
            fill="#190c20"
            opacity=".13"
          />
          <rect
            x="12"
            y={seed % 3 ? "18" : "15"}
            width="40"
            height="35"
            rx={seed % 2 ? "16" : "9"}
            fill="#190c20"
          />
          <circle cx="24" cy="32" r="4" fill={color} />
          <circle cx="40" cy="32" r="4" fill={color} />
          <path
            d={seed % 3 ? "M25 43q7 6 14 0" : "M26 44h12"}
            fill="none"
            stroke={color}
            strokeWidth="3"
            strokeLinecap="round"
          />
          {seed % 2 === 0 && (
            <path d="M22 17V9m20 8V9" stroke="#190c20" strokeWidth="3" strokeLinecap="round" />
          )}
        </svg>
      )}
    </span>
  );
}
