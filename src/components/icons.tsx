/**
 * Zero Club icon set v2 — premium X-caliber iconography.
 * Minimal geometric silhouettes drawn on a 24×24 grid with 2px rounded
 * strokes. Pass `active` to switch to the solid filled state, exactly like
 * X's tab icons. No decorative noise, no duotone washes.
 */
import React from "react";

export interface ZeroIconProps {
  className?: string;
  active?: boolean;
}

const Svg = ({ className, children }: { className?: string; children: React.ReactNode }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    {children}
  </svg>
);

const stroke = {
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const IconHome = ({ className, active }: ZeroIconProps) => (
  <Svg className={className}>
    {active ? (
      <path
        d="M12 2.6a1.1 1.1 0 0 1 .68.24l8.4 6.7c.29.23.42.55.42.88v8.68a2.4 2.4 0 0 1-2.4 2.4h-3.85v-4.55a3.25 3.25 0 0 0-6.5 0v4.55H4.9a2.4 2.4 0 0 1-2.4-2.4V10.42c0-.33.13-.65.42-.88l8.4-6.7A1.1 1.1 0 0 1 12 2.6Z"
        fill="currentColor"
      />
    ) : (
      <>
        <path d="M4 10.1 12 3.7l8 6.4V19a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" {...stroke} />
        <path d="M9.4 21v-4.2a2.6 2.6 0 0 1 5.2 0V21" {...stroke} />
      </>
    )}
  </Svg>
);

export const IconLearn = ({ className, active }: ZeroIconProps) => (
  <Svg className={className}>
    {active ? (
      <>
        <path d="M11.6 3.9a1.05 1.05 0 0 1 .8 0l9.2 4.3c.83.39.83 1.57 0 1.96l-9.2 4.3a1.05 1.05 0 0 1-.8 0l-9.2-4.3c-.83-.39-.83-1.57 0-1.96Z" fill="currentColor" />
        <path d="m6.2 12.2 5.38 2.51c.27.13.57.13.84 0L17.8 12.2v3.55c0 1.9-2.6 3.45-5.8 3.45s-5.8-1.55-5.8-3.45Z" fill="currentColor" />
        <path d="M21.6 10.4v4.4" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" />
      </>
    ) : (
      <>
        <path d="M2.8 9.3 12 5l9.2 4.3L12 13.6Z" {...stroke} />
        <path d="M6.6 11.7v3.9c0 1.6 2.4 2.9 5.4 2.9s5.4-1.3 5.4-2.9v-3.9" {...stroke} />
        <path d="M21.2 9.5v4.4" {...stroke} />
      </>
    )}
  </Svg>
);

export const IconClubs = ({ className, active }: ZeroIconProps) => (
  <Svg className={className}>
    {active ? (
      <>
        <circle cx="9" cy="8.8" r="3.9" fill="currentColor" />
        <path d="M2.7 20.05C3.2 16.3 5.7 14.2 9 14.2s5.8 2.1 6.3 5.85c.06.4-.26.75-.66.75H3.36c-.4 0-.72-.35-.66-.75Z" fill="currentColor" />
        <path d="M15.5 5.5a3.7 3.7 0 0 1 0 6.7" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" />
        <path d="M17.7 14.7c1.9.9 3 2.6 3.3 5.2" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" />
      </>
    ) : (
      <>
        <circle cx="9" cy="9" r="3.4" stroke="currentColor" strokeWidth={2} />
        <path d="M3.2 20c.5-3.5 2.9-5.5 5.8-5.5s5.3 2 5.8 5.5" {...stroke} />
        <path d="M15.4 6a3.4 3.4 0 0 1 0 6.2" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
        <path d="M17.6 14.9c1.8.9 2.9 2.6 3.2 5.1" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      </>
    )}
  </Svg>
);

export const IconWallet = ({ className, active }: ZeroIconProps) => (
  <Svg className={className}>
    {active ? (
      <>
        <path
          d="M6.2 6h11.6A3.2 3.2 0 0 1 21 9.2v2.2h-3.8a2.3 2.3 0 0 0 0 4.6H21v.3a3.2 3.2 0 0 1-3.2 3.2H6.2A3.2 3.2 0 0 1 3 16.3V9.2A3.2 3.2 0 0 1 6.2 6Z"
          fill="currentColor"
        />
        <circle cx="17.6" cy="13.7" r="1.1" fill="currentColor" />
      </>
    ) : (
      <>
        <rect x="3" y="6" width="18" height="13.5" rx="3.2" stroke="currentColor" strokeWidth={2} />
        <path d="M21 11.4h-3.8a2.3 2.3 0 0 0 0 4.6H21" {...stroke} />
        <circle cx="17.6" cy="13.7" r="1.05" fill="currentColor" />
      </>
    )}
  </Svg>
);

export const IconMessages = ({ className, active }: ZeroIconProps) => (
  <Svg className={className}>
    {active ? (
      <path
        d="M12 3.6c-5.2 0-9.25 3.45-9.25 7.75 0 2.2 1.05 4.15 2.8 5.55-.15 1.1-.6 2.25-1.55 3.3-.17.19-.04.5.22.49 1.8-.06 3.35-.72 4.53-1.55 1.03.3 2.13.46 3.25.46 5.2 0 9.25-3.5 9.25-7.8S17.2 3.6 12 3.6Z"
        fill="currentColor"
      />
    ) : (
      <path
        d="M12 4.1c-5 0-8.9 3.3-8.9 7.4 0 2.1 1 4 2.7 5.3-.15 1.1-.6 2.2-1.5 3.2 1.75-.05 3.25-.7 4.4-1.5 1 .3 2.15.45 3.3.45 5 0 8.9-3.4 8.9-7.45S17 4.1 12 4.1Z"
        {...stroke}
      />
    )}
  </Svg>
);

export const IconGames = ({ className, active }: ZeroIconProps) => (
  <Svg className={className}>
    {active ? (
      <path
        d="M7.2 6.1h9.6a4.3 4.3 0 0 1 4.18 3.28l1.18 4.82c.72 2.94-2.7 5.18-5.13 3.36l-1.25-.94a2.2 2.2 0 0 0-1.32-.44H9.54a2.2 2.2 0 0 0-1.32.44l-1.25.94c-2.43 1.82-5.85-.42-5.13-3.36l1.18-4.82A4.3 4.3 0 0 1 7.2 6.1Zm.05 3.05a1 1 0 0 0-1 1v.95H5.3a1 1 0 0 0 0 2h.95v.95a1 1 0 0 0 2 0v-.95h.95a1 1 0 0 0 0-2h-.95v-.95a1 1 0 0 0-1-1Zm8.75.55a1.18 1.18 0 1 0 0 2.36 1.18 1.18 0 0 0 0-2.36Zm2.45 2.45a1.18 1.18 0 1 0 0 2.36 1.18 1.18 0 0 0 0-2.36Z"
        fill="currentColor"
      />
    ) : (
      <>
        <path d="M7.2 6.5h9.6a3.9 3.9 0 0 1 3.8 3l1.15 4.7c.62 2.5-2.3 4.4-4.36 2.86l-1.25-.94a2.8 2.8 0 0 0-1.68-.56H9.54a2.8 2.8 0 0 0-1.68.56l-1.25.94c-2.06 1.54-4.98-.36-4.36-2.86l1.15-4.7a3.9 3.9 0 0 1 3.8-3Z" {...stroke} />
        <path d="M7.2 9.8v4M5.2 11.8h4" {...stroke} />
        <circle cx="16" cy="10.7" r="1" fill="currentColor" />
        <circle cx="18.3" cy="13" r="1" fill="currentColor" />
      </>
    )}
  </Svg>
);

export const IconProfile = ({ className, active }: ZeroIconProps) => (
  <Svg className={className}>
    {active ? (
      <>
        <circle cx="12" cy="8.1" r="4.3" fill="currentColor" />
        <path d="M4.4 20c.7-4.2 3.7-6.6 7.6-6.6s6.9 2.4 7.6 6.6c.07.42-.26.8-.68.8H5.08c-.42 0-.75-.38-.68-.8Z" fill="currentColor" />
      </>
    ) : (
      <>
        <circle cx="12" cy="8.2" r="3.9" stroke="currentColor" strokeWidth={2} />
        <path d="M4.6 20.4c.7-4 3.6-6.2 7.4-6.2s6.7 2.2 7.4 6.2" {...stroke} />
      </>
    )}
  </Svg>
);

export const IconGem = ({ className, active }: ZeroIconProps) => (
  <Svg className={className}>
    {active ? (
      <path d="M7.05 3.8h9.9c.33 0 .64.15.84.42l3 3.95c.3.4.28.94-.04 1.31l-8 9.44a1 1 0 0 1-1.5 0l-8-9.44a1.05 1.05 0 0 1-.04-1.31l3-3.95c.2-.27.51-.42.84-.42Z" fill="currentColor" />
    ) : (
      <>
        <path d="M7.2 4.3h9.6l4.4 5L12 20.2 2.8 9.3Z" {...stroke} />
        <path d="M3.4 9.3h17.2" stroke="currentColor" strokeWidth={1.4} strokeOpacity="0.5" strokeLinecap="round" />
      </>
    )}
  </Svg>
);

export const IconBookmark = ({ className, active }: ZeroIconProps) => (
  <Svg className={className}>
    {active ? (
      <path d="M8.5 3.2h7a2.6 2.6 0 0 1 2.6 2.6v14.5a.75.75 0 0 1-1.16.63L12 17.55l-4.94 3.38a.75.75 0 0 1-1.16-.63V5.8A2.6 2.6 0 0 1 8.5 3.2Z" fill="currentColor" />
    ) : (
      <path d="M6.2 5.9a2.4 2.4 0 0 1 2.4-2.4h6.8a2.4 2.4 0 0 1 2.4 2.4v14.6L12 16.7l-5.8 3.8Z" {...stroke} />
    )}
  </Svg>
);

export const IconNotes = ({ className, active }: ZeroIconProps) => (
  <Svg className={className}>
    {active ? (
      <>
        <path
          d="M11.1 4.2H6.3a3 3 0 0 0-3 3v10.5a3 3 0 0 0 3 3h10.5a3 3 0 0 0 3-3v-4.8l-6.6 6.6c-.3.3-.68.51-1.1.61l-3.3.83a1.35 1.35 0 0 1-1.64-1.64l.83-3.3c.1-.42.31-.8.61-1.1Z"
          fill="currentColor"
        />
        <path d="M18.6 3.35a2.35 2.35 0 0 1 3.32 3.32l-9.1 9.1a1 1 0 0 1-.47.26l-3.14.79a.55.55 0 0 1-.67-.67l.79-3.14a1 1 0 0 1 .26-.47Z" fill="currentColor" />
      </>
    ) : (
      <>
        <path d="M20.2 12.6v5.2a2.7 2.7 0 0 1-2.7 2.7H6.2a2.7 2.7 0 0 1-2.7-2.7V6.5a2.7 2.7 0 0 1 2.7-2.7h5.2" {...stroke} />
        <path d="M18.9 3.6a2.1 2.1 0 0 1 3 3l-8.8 8.8-4 1 1-4Z" {...stroke} />
      </>
    )}
  </Svg>
);

export const IconCompass = ({ className, active }: ZeroIconProps) => (
  <Svg className={className}>
    {active ? (
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2.9a9.1 9.1 0 1 0 0 18.2 9.1 9.1 0 0 0 0-18.2Zm3.9 5.05a.62.62 0 0 0-.83-.83l-5.6 2.05c-.28.1-.5.32-.6.6l-2.05 5.6a.62.62 0 0 0 .83.83l5.6-2.05c.28-.1.5-.32.6-.6Z"
        fill="currentColor"
      />
    ) : (
      <>
        <circle cx="12" cy="12" r="8.7" stroke="currentColor" strokeWidth={2} />
        <path d="m15.2 8.8-1.7 4.7-4.7 1.7 1.7-4.7Z" fill="currentColor" />
      </>
    )}
  </Svg>
);

export const IconMetrics = ({ className, active }: ZeroIconProps) => (
  <Svg className={className}>
    {active ? (
      <path
        d="M5.4 20.2v-6.4M12 20.2V4.4M18.6 20.2v-9.9"
        stroke="currentColor"
        strokeWidth={3.4}
        strokeLinecap="round"
      />
    ) : (
      <path d="M5.4 20V14M12 20V4.6M18.6 20v-9.5" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" />
    )}
  </Svg>
);

export const IconPresentation = ({ className, active }: ZeroIconProps) => (
  <Svg className={className}>
    {active ? (
      <>
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M5.9 3.7h12.2a2.9 2.9 0 0 1 2.9 2.9v6.6a2.9 2.9 0 0 1-2.9 2.9H5.9A2.9 2.9 0 0 1 3 13.2V6.6a2.9 2.9 0 0 1 2.9-2.9Zm10.85 4.1-3.35 3.2-2.2-1.8-2.95 2.85 1.25 1.3 1.8-1.75 2.2 1.8 4.5-4.3Z"
          fill="currentColor"
        />
        <path d="M12 16.6v1.9M8.6 21.4l3.4-3 3.4 3" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      </>
    ) : (
      <>
        <rect x="3.4" y="4.2" width="17.2" height="11.6" rx="2.4" stroke="currentColor" strokeWidth={2} />
        <path d="m7.4 11.7 2.7-2.6 2.2 1.8 3.9-3.7" {...stroke} />
        <path d="M12 15.8v2.4M8.7 21.2l3.3-2.9 3.3 2.9" {...stroke} />
      </>
    )}
  </Svg>
);

export const IconStore = ({ className, active }: ZeroIconProps) => (
  <Svg className={className}>
    {active ? (
      <>
        <path
          d="M4.3 11.3c.4.1.8.16 1.2.16 1.05 0 2-.44 2.65-1.13a3.63 3.63 0 0 0 2.65 1.13h2.4c1.05 0 2-.44 2.65-1.13a3.63 3.63 0 0 0 2.65 1.13c.4 0 .8-.05 1.2-.16v7.3a2.4 2.4 0 0 1-2.4 2.4h-2.1v-4.1c0-1-.8-1.8-1.8-1.8h-2.8c-1 0-1.8.8-1.8 1.8V21H6.7a2.4 2.4 0 0 1-2.4-2.4Z"
          fill="currentColor"
        />
        <path
          d="M3.65 6.35 5.3 3.4c.23-.42.67-.68 1.15-.68h11.1c.48 0 .92.26 1.15.68l1.65 2.95c.9 1.8-.3 4.1-2.5 4.1-1.1 0-2.1-.62-2.5-1.55-.4.93-1.4 1.55-2.5 1.55h-1.7c-1.1 0-2.1-.62-2.5-1.55-.4.93-1.4 1.55-2.5 1.55-2.2 0-3.4-2.3-2.5-4.1Z"
          fill="currentColor"
        />
      </>
    ) : (
      <>
        <path d="M4.6 10.8v7.8a2.1 2.1 0 0 0 2.1 2.1h10.6a2.1 2.1 0 0 0 2.1-2.1v-7.8" {...stroke} />
        <path d="M3.9 6.7 5.5 3.8c.2-.37.58-.6 1-.6h11c.42 0 .8.23 1 .6l1.6 2.9c.85 1.7-.3 3.9-2.3 3.9-1.05 0-2-.6-2.4-1.5-.4.9-1.35 1.5-2.4 1.5h-2c-1.05 0-2-.6-2.4-1.5-.4.9-1.35 1.5-2.4 1.5-2 0-3.15-2.2-2.3-3.9Z" {...stroke} />
        <path d="M9.5 20.4v-3.9c0-.95.75-1.7 1.7-1.7h1.6c.95 0 1.7.75 1.7 1.7v3.9" {...stroke} />
      </>
    )}
  </Svg>
);

export const IconInstitution = ({ className, active }: ZeroIconProps) => (
  <Svg className={className}>
    {active ? (
      <>
        <path d="M11.5 2.85a1.05 1.05 0 0 1 1 0l8.3 4.55c.86.47.53 1.78-.45 1.78H3.65c-.98 0-1.31-1.31-.45-1.78Z" fill="currentColor" />
        <path d="M5.6 11.4v5.9M12 11.4v5.9M18.4 11.4v5.9" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
        <path d="M3.8 20.8h16.4" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
      </>
    ) : (
      <>
        <path d="M3.4 9.1 12 4.4l8.6 4.7Z" {...stroke} />
        <path d="M5.6 11.8v5.4M12 11.8v5.4M18.4 11.8v5.4" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
        <path d="M4.2 20.6h15.6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      </>
    )}
  </Svg>
);

export const IconBell = ({ className, active }: ZeroIconProps) => (
  <Svg className={className}>
    {active ? (
      <>
        <path
          d="M12 2.8c-3.55 0-6.15 2.7-6.15 6.25v2.7c0 .65-.25 1.45-.65 2.05l-1.1 1.7c-.5.78.05 1.85.97 1.85h13.86c.92 0 1.47-1.07.97-1.85l-1.1-1.7c-.4-.6-.65-1.4-.65-2.05v-2.7C18.15 5.5 15.55 2.8 12 2.8Z"
          fill="currentColor"
        />
        <path d="M9.6 20.1a2.5 2.5 0 0 0 4.8 0" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" />
      </>
    ) : (
      <>
        <path d="M12 3.4c-3.3 0-5.7 2.5-5.7 5.8v2.6c0 .8-.3 1.75-.75 2.45l-1 1.55c-.25.4 0 .9.47.9h13.96c.47 0 .72-.5.47-.9l-1-1.55c-.45-.7-.75-1.65-.75-2.45V9.2c0-3.3-2.4-5.8-5.7-5.8Z" {...stroke} />
        <path d="M9.8 19.7a2.3 2.3 0 0 0 4.4 0" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      </>
    )}
  </Svg>
);

export const IconRocket = ({ className, active }: ZeroIconProps) => (
  <Svg className={className}>
    {active ? (
      <>
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M12 2.3c3.1 1.75 4.8 4.7 4.8 8.35 0 1.55-.28 3-.78 4.35H7.98a12.9 12.9 0 0 1-.78-4.35c0-3.65 1.7-6.6 4.8-8.35Zm0 5.3a1.85 1.85 0 1 0 0 3.7 1.85 1.85 0 0 0 0-3.7Z"
          fill="currentColor"
        />
        <path d="M7.4 12.3 4.85 15.2c-.44.5-.08 1.3.59 1.3H8.2Z" fill="currentColor" />
        <path d="m16.6 12.3 2.55 2.9c.44.5.08 1.3-.59 1.3H15.8Z" fill="currentColor" />
        <path d="M10.55 16.5h2.9c.36 1.65-.1 3.2-1.45 4.65-1.35-1.45-1.81-3-1.45-4.65Z" fill="currentColor" />
      </>
    ) : (
      <>
        <path d="M12 3.1c2.7 1.55 4.15 4.15 4.15 7.5 0 1.4-.23 2.7-.66 3.9h-6.98a12.2 12.2 0 0 1-.66-3.9c0-3.35 1.45-5.95 4.15-7.5Z" {...stroke} />
        <circle cx="12" cy="9.3" r="1.6" stroke="currentColor" strokeWidth={2} />
        <path d="M7.8 12.5 5.5 15.2c-.35.4-.05 1.05.5 1.05h2.3" {...stroke} />
        <path d="m16.2 12.5 2.3 2.7c.35.4.05 1.05-.5 1.05h-2.3" {...stroke} />
        <path d="M10.8 16.9h2.4c.25 1.35-.15 2.6-1.2 3.8-1.05-1.2-1.45-2.45-1.2-3.8Z" {...stroke} />
      </>
    )}
  </Svg>
);

export const IconSpark = ({ className, active }: ZeroIconProps) => (
  <Svg className={className}>
    {active ? (
      <path
        d="M13.97 2.95c.13-.7-.75-1.12-1.2-.57L4.9 12.03c-.4.48-.06 1.22.57 1.22h4.6l-1.04 7.8c-.13.7.75 1.12 1.2.57l7.87-9.65c.4-.48.06-1.22-.57-1.22h-4.6Z"
        fill="currentColor"
      />
    ) : (
      <path d="M13.2 2.8 5.2 12.9h4.7l-1.1 8.3 8-10.1h-4.7Z" {...stroke} />
    )}
  </Svg>
);

/**
 * Tab-bar menu. Three rules in the resting state; the active state thickens
 * them into bars rather than filling a shape, because there is no silhouette
 * here to fill the way Home or Clubs have one.
 */
export const IconMenu = ({ className, active }: ZeroIconProps) => (
  <Svg className={className}>
    {active ? (
      <>
        <rect x="3" y="5" width="18" height="2.6" rx="1.3" fill="currentColor" />
        <rect x="3" y="10.7" width="18" height="2.6" rx="1.3" fill="currentColor" />
        <rect x="3" y="16.4" width="18" height="2.6" rx="1.3" fill="currentColor" />
      </>
    ) : (
      <>
        <path d="M4 6.3h16" {...stroke} />
        <path d="M4 12h16" {...stroke} />
        <path d="M4 17.7h16" {...stroke} />
      </>
    )}
  </Svg>
);

export const IconShield = ({ className, active }: ZeroIconProps) => (
  <Svg className={className}>
    {active ? (
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12.35 2.55a1 1 0 0 0-.7 0L4.2 5.3a1 1 0 0 0-.65.94v5.2c0 5 3.2 8.6 8.1 10.25.23.08.47.08.7 0 4.9-1.65 8.1-5.25 8.1-10.25v-5.2a1 1 0 0 0-.65-.94Zm3.7 7.35-1.3-1.3-3.85 3.85-1.85-1.85-1.3 1.3 3.15 3.15Z"
        fill="currentColor"
      />
    ) : (
      <>
        <path d="M12 3.2 19.4 6v5.3c0 4.55-2.9 7.85-7.4 9.4-4.5-1.55-7.4-4.85-7.4-9.4V6Z" {...stroke} />
        <path d="m8.8 11.9 2.2 2.2 4.2-4.2" {...stroke} />
      </>
    )}
  </Svg>
);
