/**
 * Zero Club icon set — premium X-style duo-state icons.
 * Inactive: crisp 1.8px outlines. Active: solid currentColor fills with
 * negative-space cutouts (evenodd), matching the X / premium-app pattern.
 * All icons share a 24×24 grid. Pass `active` to switch to the solid state.
 */
import React from "react";

export interface ZeroIconProps {
  className?: string;
  active?: boolean;
}

const SW = 1.8;

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
  strokeWidth: SW,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const IconHome = ({ className, active }: ZeroIconProps) => (
  <Svg className={className}>
    {active ? (
      <path
        d="M12 2.9 3.4 9.7v9.5c0 1.2.97 2.2 2.17 2.2H9.6v-4.9a2.4 2.4 0 0 1 4.8 0v4.9h4.03c1.2 0 2.17-1 2.17-2.2V9.7Z"
        fill="currentColor"
      />
    ) : (
      <>
        <path d="M4.25 9.95 12 3.8l7.75 6.15V19a1.9 1.9 0 0 1-1.9 1.9h-3.2v-4.7a2.65 2.65 0 0 0-5.3 0v4.7h-3.2A1.9 1.9 0 0 1 4.25 19Z" {...stroke} />
      </>
    )}
  </Svg>
);

export const IconLearn = ({ className, active }: ZeroIconProps) => (
  <Svg className={className}>
    {active ? (
      <>
        <path d="M12 3.9 22 8.6l-10 4.7L2 8.6Z" fill="currentColor" />
        <path d="M6.1 11.6 12 14.4l5.9-2.8v3.3c0 1.8-2.65 3.3-5.9 3.3s-5.9-1.5-5.9-3.3Z" fill="currentColor" />
        <path d="M21 9.2v5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
        <circle cx="21" cy="16" r="1.15" fill="currentColor" />
      </>
    ) : (
      <>
        <path d="M12 4.6 21 9l-9 4.4L3 9Z" {...stroke} />
        <path d="M6.5 11.3v3.9c0 1.3 2.5 2.8 5.5 2.8s5.5-1.5 5.5-2.8v-3.9" {...stroke} />
        <path d="M21 9.2v4.6" stroke="currentColor" strokeWidth={SW} strokeLinecap="round" />
        <circle cx="21" cy="15.4" r="1" fill="currentColor" />
      </>
    )}
  </Svg>
);

export const IconClubs = ({ className, active }: ZeroIconProps) => (
  <Svg className={className}>
    {active ? (
      <>
        <circle cx="9.2" cy="8.6" r="3.7" fill="currentColor" />
        <path d="M2.9 20c.45-3.6 3-5.7 6.3-5.7s5.85 2.1 6.3 5.7c.05.4-.25.7-.65.7H3.55c-.4 0-.7-.3-.65-.7Z" fill="currentColor" />
        <path d="M15.7 5.6a3.5 3.5 0 0 1 0 6.3" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" />
        <path d="M17.8 14.6c1.85.85 2.85 2.5 3.1 5.05" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" />
      </>
    ) : (
      <>
        <circle cx="9.2" cy="8.8" r="3.3" stroke="currentColor" strokeWidth={SW} />
        <path d="M3.4 19.7c.4-3.3 2.8-5.2 5.8-5.2s5.4 1.9 5.8 5.2" {...stroke} />
        <path d="M15.7 5.9a3.3 3.3 0 0 1 0 5.9" stroke="currentColor" strokeWidth={SW} strokeLinecap="round" />
        <path d="M17.9 14.8c1.7.8 2.6 2.3 2.8 4.9" stroke="currentColor" strokeWidth={SW} strokeLinecap="round" />
      </>
    )}
  </Svg>
);

export const IconWallet = ({ className, active }: ZeroIconProps) => (
  <Svg className={className}>
    {active ? (
      <>
        <path
          d="M6.2 5.8h11.6a3 3 0 0 1 3 3v2.15h-3.55a2.6 2.6 0 0 0 0 5.2h3.55v1.05a3 3 0 0 1-3 3H6.2a3 3 0 0 1-3-3V8.8a3 3 0 0 1 3-3Z"
          fill="currentColor"
        />
        <path d="M20.8 12.45v2.2h-3.55a1.1 1.1 0 0 1 0-2.2Z" fill="currentColor" fillOpacity="0.45" />
        <circle cx="17.35" cy="13.55" r="1.05" fill="currentColor" />
      </>
    ) : (
      <>
        <rect x="3.2" y="6.2" width="17.6" height="13.3" rx="3" stroke="currentColor" strokeWidth={SW} />
        <path d="M20.8 11.2h-3.9a2.35 2.35 0 0 0 0 4.7h3.9" {...stroke} />
        <circle cx="17.3" cy="13.55" r="1" fill="currentColor" />
      </>
    )}
  </Svg>
);

export const IconMessages = ({ className, active }: ZeroIconProps) => (
  <Svg className={className}>
    {active ? (
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 3.9c-4.95 0-8.85 3.25-8.85 7.5 0 2.1 1.05 4 2.6 5.35-.1 1.05-.5 2.2-1.45 3.25-.15.17-.03.45.2.44 1.7-.06 3.15-.65 4.25-1.4 1.02.28 2.1.41 3.25.41 4.95 0 8.85-3.35 8.85-7.6S16.95 3.9 12 3.9ZM8.6 12.5a1.1 1.1 0 1 1 0-2.2 1.1 1.1 0 0 1 0 2.2Zm3.4 0a1.1 1.1 0 1 1 0-2.2 1.1 1.1 0 0 1 0 2.2Zm3.4 0a1.1 1.1 0 1 1 0-2.2 1.1 1.1 0 0 1 0 2.2Z"
        fill="currentColor"
      />
    ) : (
      <>
        <path d="M12 4.3c-4.7 0-8.4 3.1-8.4 7.1 0 2 1 3.8 2.5 5.1-.1 1-.5 2.1-1.4 3.1 1.6 0 3.1-.6 4.2-1.4 1 .3 2 .4 3.1.4 4.7 0 8.4-3.2 8.4-7.2s-3.7-7.1-8.4-7.1Z" {...stroke} />
        <circle cx="8.6" cy="11.4" r="0.95" fill="currentColor" />
        <circle cx="12" cy="11.4" r="0.95" fill="currentColor" />
        <circle cx="15.4" cy="11.4" r="0.95" fill="currentColor" />
      </>
    )}
  </Svg>
);

export const IconProfile = ({ className, active }: ZeroIconProps) => (
  <Svg className={className}>
    {active ? (
      <>
        <circle cx="12" cy="7.9" r="4.1" fill="currentColor" />
        <path d="M4.5 20.35c.65-4.15 3.7-6.45 7.5-6.45s6.85 2.3 7.5 6.45c.06.4-.25.75-.65.75H5.15c-.4 0-.71-.35-.65-.75Z" fill="currentColor" />
      </>
    ) : (
      <>
        <circle cx="12" cy="8.1" r="3.7" stroke="currentColor" strokeWidth={SW} />
        <path d="M4.9 20.4c.6-3.9 3.5-6.1 7.1-6.1s6.5 2.2 7.1 6.1" {...stroke} />
      </>
    )}
  </Svg>
);

export const IconGem = ({ className, active }: ZeroIconProps) => (
  <Svg className={className}>
    {active ? (
      <path d="M7.15 3.9h9.7c.3 0 .6.15.8.4l3.15 4.15c.27.36.26.86-.03 1.2l-7.99 9.7a1 1 0 0 1-1.56 0l-7.99-9.7a.98.98 0 0 1-.03-1.2L6.35 4.3c.2-.25.5-.4.8-.4Z" fill="currentColor" />
    ) : (
      <>
        <path d="M7.3 4.5h9.4L21 9.4 12 20 3 9.4Z" {...stroke} />
        <path d="M3.4 9.4h17.2M12 19.6 8.4 9.4l3.6-4.7 3.6 4.7L12 19.6" stroke="currentColor" strokeWidth={1.1} strokeOpacity="0.55" strokeLinecap="round" strokeLinejoin="round" />
      </>
    )}
  </Svg>
);

export const IconBookmark = ({ className, active }: ZeroIconProps) => (
  <Svg className={className}>
    {active ? (
      <path d="M6 5.9c0-1.2 1-2.2 2.2-2.2h7.6c1.2 0 2.2 1 2.2 2.2v14.05c0 .55-.62.88-1.08.58L12 17.4l-4.92 3.13a.7.7 0 0 1-1.08-.58Z" fill="currentColor" />
    ) : (
      <path d="M6.2 6C6.2 4.9 7.1 4 8.2 4h7.6c1.1 0 2 .9 2 2v14.2l-5.8-3.6-5.8 3.6Z" {...stroke} />
    )}
  </Svg>
);

export const IconNotes = ({ className, active }: ZeroIconProps) => (
  <Svg className={className}>
    {active ? (
      <>
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M6.7 3.2h7.6a2.6 2.6 0 0 1 2.6 2.6v4.05l-4.55 4.55a1.9 1.9 0 0 0-.49.84l-.75 2.8a1.55 1.55 0 0 0 .43 1.53l.65.63H6.7a2.6 2.6 0 0 1-2.6-2.6V5.8a2.6 2.6 0 0 1 2.6-2.6Zm2 4.6a.85.85 0 1 0 0 1.7h4.6a.85.85 0 1 0 0-1.7Zm0 3.6a.85.85 0 1 0 0 1.7h2.6a.85.85 0 1 0 0-1.7Z"
          fill="currentColor"
        />
        <path d="m14.4 17 5.15-5.15a1.72 1.72 0 0 1 2.43 2.43L16.83 19.4l-3.25.87Z" fill="currentColor" />
      </>
    ) : (
      <>
        <rect x="4.5" y="3.6" width="12" height="16.8" rx="2.4" stroke="currentColor" strokeWidth={SW} />
        <path d="M8 8.6h5M8 12h3.4" stroke="currentColor" strokeWidth={1.2} strokeOpacity="0.55" strokeLinecap="round" />
        <path d="m14.2 16.9 5.3-5.3a1.55 1.55 0 0 1 2.2 2.2l-5.3 5.3-3 .8Z" {...stroke} />
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
        d="M12 3.2a8.8 8.8 0 1 0 0 17.6 8.8 8.8 0 0 0 0-17.6Zm3.55 5.05-2 5.5-5.5 2 2-5.5Z"
        fill="currentColor"
      />
    ) : (
      <>
        <circle cx="12" cy="12" r="8.4" stroke="currentColor" strokeWidth={SW} />
        <path d="m15 9-1.6 4.4L9 15l1.6-4.4Z" fill="currentColor" />
      </>
    )}
  </Svg>
);

export const IconMetrics = ({ className, active }: ZeroIconProps) => (
  <Svg className={className}>
    {active ? (
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M6.9 3.2h10.2a3.7 3.7 0 0 1 3.7 3.7v10.2a3.7 3.7 0 0 1-3.7 3.7H6.9a3.7 3.7 0 0 1-3.7-3.7V6.9a3.7 3.7 0 0 1 3.7-3.7Zm.5 9v4.6a1.05 1.05 0 1 0 2.1 0v-4.6a1.05 1.05 0 1 0-2.1 0Zm3.55-4v8.6a1.05 1.05 0 1 0 2.1 0V8.2a1.05 1.05 0 1 0-2.1 0Zm3.55 2.1v6.5a1.05 1.05 0 1 0 2.1 0v-6.5a1.05 1.05 0 1 0-2.1 0Z"
        fill="currentColor"
      />
    ) : (
      <>
        <rect x="3.5" y="3.5" width="17" height="17" rx="3.2" stroke="currentColor" strokeWidth={SW} />
        <path d="M7.4 16.8v-3.5M11.9 16.8V9.4M16.5 16.8v-5.6" stroke="currentColor" strokeWidth={SW} strokeLinecap="round" />
        <path d="m7.4 11.3 4.5-3 4.6 1.7" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
      </>
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
          d="M5.3 3.9h13.4a2.6 2.6 0 0 1 2.6 2.6v6.8a2.6 2.6 0 0 1-2.6 2.6H5.3a2.6 2.6 0 0 1-2.6-2.6V6.5a2.6 2.6 0 0 1 2.6-2.6Zm10.7 4-3.1 2.95-2.25-1.85-2.9 2.8 1.18 1.22 1.82-1.75 2.25 1.85 4.18-3.98Z"
          fill="currentColor"
        />
        <path d="M12 16.2v2.2M8.6 21.2l3.4-3 3.4 3" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" />
      </>
    ) : (
      <>
        <rect x="3.5" y="4.4" width="17" height="11.2" rx="2" stroke="currentColor" strokeWidth={SW} />
        <path d="m7.2 12 2.8-2.7 2.3 1.9 3.5-3.3" {...stroke} />
        <path d="M12 15.6v2.6M8.8 21l3.2-2.8 3.2 2.8" {...stroke} />
      </>
    )}
  </Svg>
);

export const IconStore = ({ className, active }: ZeroIconProps) => (
  <Svg className={className}>
    {active ? (
      <>
        <path
          d="M4.4 11.1c.35.1.72.15 1.1.15 1 0 1.9-.5 2.5-1.15.6.65 1.5 1.15 2.5 1.15h3c1 0 1.9-.5 2.5-1.15.6.65 1.5 1.15 2.5 1.15.38 0 .75-.05 1.1-.15v7.5c0 1.16-.94 2.1-2.1 2.1h-2.35v-4.35c0-.97-.78-1.75-1.75-1.75h-2.8c-.97 0-1.75.78-1.75 1.75v4.35H6.5a2.1 2.1 0 0 1-2.1-2.1Z"
          fill="currentColor"
        />
        <path
          d="M3.75 6.6 5.3 3.75c.22-.4.64-.65 1.1-.65h11.2c.46 0 .88.25 1.1.65l1.55 2.85c.85 1.7-.3 3.9-2.35 3.9-1.05 0-2-.6-2.4-1.5-.4.9-1.35 1.5-2.4 1.5h-2.2c-1.05 0-2-.6-2.4-1.5-.4.9-1.35 1.5-2.4 1.5-2.05 0-3.2-2.2-2.35-3.9Z"
          fill="currentColor"
        />
      </>
    ) : (
      <>
        <path d="M4.6 10.5v8.1c0 1 .8 1.9 1.9 1.9h11c1 0 1.9-.9 1.9-1.9v-8.1" {...stroke} />
        <path d="M4 6.8 5.5 4c.2-.4.6-.6 1-.6h11c.4 0 .8.2 1 .6L20 6.8c.8 1.6-.3 3.7-2.2 3.7-1 0-1.9-.6-2.3-1.4-.4.8-1.3 1.4-2.3 1.4h-2.4c-1 0-1.9-.6-2.3-1.4-.4.8-1.3 1.4-2.3 1.4C4.3 10.5 3.2 8.4 4 6.8Z" {...stroke} />
        <path d="M9.4 20.3v-4.2c0-.9.7-1.6 1.6-1.6h2c.9 0 1.6.7 1.6 1.6v4.2" {...stroke} />
      </>
    )}
  </Svg>
);

export const IconInstitution = ({ className, active }: ZeroIconProps) => (
  <Svg className={className}>
    {active ? (
      <>
        <path d="M11.55 3.35a.95.95 0 0 1 .9 0l8.1 5.05c.75.4.45 1.5-.4 1.5H3.85c-.85 0-1.15-1.1-.4-1.5Z" fill="currentColor" />
        <path d="M6 12v5.6M12 12v5.6M18 12v5.6" stroke="currentColor" strokeWidth={2.3} strokeLinecap="round" />
        <path d="M4.1 20.7h15.8" stroke="currentColor" strokeWidth={2.3} strokeLinecap="round" />
      </>
    ) : (
      <>
        <path d="M3.6 9.4 12 4.2l8.4 5.2Z" {...stroke} />
        <path d="M6 12.4v5.2M12 12.4v5.2M18 12.4v5.2" stroke="currentColor" strokeWidth={SW} strokeLinecap="round" />
        <path d="M4.4 20.6h15.2" stroke="currentColor" strokeWidth={SW} strokeLinecap="round" />
      </>
    )}
  </Svg>
);

export const IconBell = ({ className, active }: ZeroIconProps) => (
  <Svg className={className}>
    {active ? (
      <>
        <path
          d="M12 3c-3.45 0-6 2.65-6 6.1v2.85c0 .62-.24 1.4-.62 1.98l-1.05 1.6c-.5.77.03 1.82.95 1.82h13.44c.92 0 1.45-1.05.95-1.82l-1.05-1.6c-.38-.58-.62-1.36-.62-1.98V9.1C18 5.65 15.45 3 12 3Z"
          fill="currentColor"
        />
        <path d="M9.65 19.9a2.45 2.45 0 0 0 4.7 0" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" />
      </>
    ) : (
      <>
        <path d="M12 3.6c-3.1 0-5.35 2.4-5.35 5.5v2.85c0 .77-.28 1.68-.73 2.36l-1.05 1.6c-.23.36 0 .84.43.84h13.4c.43 0 .66-.48.43-.84l-1.05-1.6c-.45-.68-.73-1.59-.73-2.36V9.1c0-3.1-2.25-5.5-5.35-5.5Z" {...stroke} />
        <path d="M9.85 19.6a2.25 2.25 0 0 0 4.3 0" stroke="currentColor" strokeWidth={SW} strokeLinecap="round" />
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
          d="M12 2.4c3.05 1.7 4.7 4.6 4.7 8.2 0 1.55-.27 3-.76 4.35H8.06A12.9 12.9 0 0 1 7.3 10.6c0-3.6 1.65-6.5 4.7-8.2Zm0 5.2a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6Z"
          fill="currentColor"
        />
        <path d="M7.55 12.15 5 15.1c-.42.5-.07 1.3.6 1.3h2.75Z" fill="currentColor" />
        <path d="m16.45 12.15 2.55 2.95c.42.5.07 1.3-.6 1.3h-2.75Z" fill="currentColor" />
        <path d="M10.6 16.6h2.8c.35 1.6-.1 3.1-1.4 4.5-1.3-1.4-1.75-2.9-1.4-4.5Z" fill="currentColor" />
      </>
    ) : (
      <>
        <path d="M12 3.1c2.7 1.55 4.15 4.15 4.15 7.5 0 1.4-.23 2.7-.66 3.9h-6.98a12.2 12.2 0 0 1-.66-3.9c0-3.35 1.45-5.95 4.15-7.5Z" {...stroke} />
        <circle cx="12" cy="9.2" r="1.6" stroke="currentColor" strokeWidth={SW} />
        <path d="M7.8 12.4 5.5 15.1c-.35.4-.05 1.05.5 1.05h2.3" {...stroke} />
        <path d="m16.2 12.4 2.3 2.7c.35.4.05 1.05-.5 1.05h-2.3" {...stroke} />
        <path d="M10.8 16.9h2.4c.25 1.35-.15 2.6-1.2 3.8-1.05-1.2-1.45-2.45-1.2-3.8Z" {...stroke} />
      </>
    )}
  </Svg>
);

export const IconSpark = ({ className, active }: ZeroIconProps) => (
  <Svg className={className}>
    {active ? (
      <path d="M13.9 2.9c.1-.65-.72-1.02-1.13-.5L4.9 12.35c-.33.42-.03 1.05.5 1.05h4.85l-1.15 7.7c-.1.65.72 1.02 1.13.5l7.87-9.95c.33-.42.03-1.05-.5-1.05h-4.85Z" fill="currentColor" />
    ) : (
      <path d="M13.2 2.9 5.4 12.7h4.7l-1.3 8.4 7.8-9.8h-4.7Z" {...stroke} />
    )}
  </Svg>
);

export const IconShield = ({ className, active }: ZeroIconProps) => (
  <Svg className={className}>
    {active ? (
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12.32 2.75a.95.95 0 0 0-.64 0L4.31 5.4a.95.95 0 0 0-.63.9v5.1c0 4.9 3.1 8.45 7.99 10.05.21.07.45.07.66 0 4.89-1.6 7.99-5.15 7.99-10.05V6.3a.95.95 0 0 0-.63-.9Zm3.5 7.2-1.2-1.2-3.92 3.92-1.98-1.98-1.2 1.2 3.18 3.18Z"
        fill="currentColor"
      />
    ) : (
      <>
        <path d="M12 3.3 19.3 6v5.3c0 4.5-2.85 7.75-7.3 9.25-4.45-1.5-7.3-4.75-7.3-9.25V6Z" {...stroke} />
        <path d="m8.9 11.9 2.1 2.1 4.1-4.1" {...stroke} />
      </>
    )}
  </Svg>
);
