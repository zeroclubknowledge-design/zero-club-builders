/**
 * Zero Club icon set — hand-drawn duotone SVGs.
 * A soft fill layer sits under crisp 1.75 strokes; pass `active` to deepen
 * the fill and weight for selected states. All icons share a 24×24 grid.
 */
import React from "react";

export interface ZeroIconProps {
  className?: string;
  active?: boolean;
}

const useIconStyle = (active?: boolean) => ({
  fo: active ? 0.32 : 0.14,
  sw: active ? 2 : 1.75,
});

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

export const IconHome = ({ className, active }: ZeroIconProps) => {
  const { fo, sw } = useIconStyle(active);
  return (
    <Svg className={className}>
      <path d="M4.5 10.2 12 4.3l7.5 5.9V19a1.7 1.7 0 0 1-1.7 1.7H6.2A1.7 1.7 0 0 1 4.5 19Z" fill="currentColor" fillOpacity={fo} />
      <path d="M4.5 10.2 12 4.3l7.5 5.9V19a1.7 1.7 0 0 1-1.7 1.7H6.2A1.7 1.7 0 0 1 4.5 19Z" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.8 20.5v-4.7a2.2 2.2 0 0 1 4.4 0v4.7" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
};

export const IconLearn = ({ className, active }: ZeroIconProps) => {
  const { fo, sw } = useIconStyle(active);
  return (
    <Svg className={className}>
      <path d="M12 4.6 21 9l-9 4.4L3 9Z" fill="currentColor" fillOpacity={fo} />
      <path d="M12 4.6 21 9l-9 4.4L3 9Z" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.5 11.3v3.9c0 1.3 2.5 2.8 5.5 2.8s5.5-1.5 5.5-2.8v-3.9" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 9.2v4.6" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" />
      <circle cx="21" cy="15.4" r="1" fill="currentColor" />
    </Svg>
  );
};

export const IconClubs = ({ className, active }: ZeroIconProps) => {
  const { fo, sw } = useIconStyle(active);
  return (
    <Svg className={className}>
      <circle cx="9.2" cy="8.8" r="3.3" fill="currentColor" fillOpacity={fo} />
      <circle cx="9.2" cy="8.8" r="3.3" stroke="currentColor" strokeWidth={sw} />
      <path d="M3.4 19.7c.4-3.3 2.8-5.2 5.8-5.2s5.4 1.9 5.8 5.2Z" fill="currentColor" fillOpacity={fo} />
      <path d="M3.4 19.7c.4-3.3 2.8-5.2 5.8-5.2s5.4 1.9 5.8 5.2" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15.7 5.9a3.3 3.3 0 0 1 0 5.9" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" />
      <path d="M17.9 14.8c1.7.8 2.6 2.3 2.8 4.9" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" />
    </Svg>
  );
};

export const IconWallet = ({ className, active }: ZeroIconProps) => {
  const { fo, sw } = useIconStyle(active);
  return (
    <Svg className={className}>
      <rect x="3.2" y="6.2" width="17.6" height="13.3" rx="3" fill="currentColor" fillOpacity={fo} />
      <rect x="3.2" y="6.2" width="17.6" height="13.3" rx="3" stroke="currentColor" strokeWidth={sw} />
      <path d="M20.8 11.2h-3.9a2.35 2.35 0 0 0 0 4.7h3.9" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="17.3" cy="13.55" r="1" fill="currentColor" />
    </Svg>
  );
};

export const IconMessages = ({ className, active }: ZeroIconProps) => {
  const { fo, sw } = useIconStyle(active);
  return (
    <Svg className={className}>
      <path d="M12 4.3c-4.7 0-8.4 3.1-8.4 7.1 0 2 1 3.8 2.5 5.1-.1 1-.5 2.1-1.4 3.1 1.6 0 3.1-.6 4.2-1.4 1 .3 2 .4 3.1.4 4.7 0 8.4-3.2 8.4-7.2s-3.7-7.1-8.4-7.1Z" fill="currentColor" fillOpacity={fo} />
      <path d="M12 4.3c-4.7 0-8.4 3.1-8.4 7.1 0 2 1 3.8 2.5 5.1-.1 1-.5 2.1-1.4 3.1 1.6 0 3.1-.6 4.2-1.4 1 .3 2 .4 3.1.4 4.7 0 8.4-3.2 8.4-7.2s-3.7-7.1-8.4-7.1Z" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="8.6" cy="11.4" r="0.95" fill="currentColor" />
      <circle cx="12" cy="11.4" r="0.95" fill="currentColor" />
      <circle cx="15.4" cy="11.4" r="0.95" fill="currentColor" />
    </Svg>
  );
};

export const IconProfile = ({ className, active }: ZeroIconProps) => {
  const { fo, sw } = useIconStyle(active);
  return (
    <Svg className={className}>
      <circle cx="12" cy="8.1" r="3.7" fill="currentColor" fillOpacity={fo} />
      <circle cx="12" cy="8.1" r="3.7" stroke="currentColor" strokeWidth={sw} />
      <path d="M4.9 20.4c.6-3.9 3.5-6.1 7.1-6.1s6.5 2.2 7.1 6.1Z" fill="currentColor" fillOpacity={fo} />
      <path d="M4.9 20.4c.6-3.9 3.5-6.1 7.1-6.1s6.5 2.2 7.1 6.1" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
};

export const IconGem = ({ className, active }: ZeroIconProps) => {
  const { fo, sw } = useIconStyle(active);
  return (
    <Svg className={className}>
      <path d="M7.3 4.5h9.4L21 9.4 12 20 3 9.4Z" fill="currentColor" fillOpacity={fo} />
      <path d="M7.3 4.5h9.4L21 9.4 12 20 3 9.4Z" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.4 9.4h17.2M12 19.6 8.4 9.4l3.6-4.7 3.6 4.7L12 19.6" stroke="currentColor" strokeWidth={Math.max(1, sw - 0.6)} strokeOpacity="0.55" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
};

export const IconBookmark = ({ className, active }: ZeroIconProps) => {
  const { fo, sw } = useIconStyle(active);
  return (
    <Svg className={className}>
      <path d="M6.2 6C6.2 4.9 7.1 4 8.2 4h7.6c1.1 0 2 .9 2 2v14.2l-5.8-3.6-5.8 3.6Z" fill="currentColor" fillOpacity={fo} />
      <path d="M6.2 6C6.2 4.9 7.1 4 8.2 4h7.6c1.1 0 2 .9 2 2v14.2l-5.8-3.6-5.8 3.6Z" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
};

export const IconNotes = ({ className, active }: ZeroIconProps) => {
  const { fo, sw } = useIconStyle(active);
  return (
    <Svg className={className}>
      <rect x="4.5" y="3.6" width="12" height="16.8" rx="2.4" fill="currentColor" fillOpacity={fo} />
      <rect x="4.5" y="3.6" width="12" height="16.8" rx="2.4" stroke="currentColor" strokeWidth={sw} />
      <path d="M8 8.6h5M8 12h3.4" stroke="currentColor" strokeWidth={Math.max(1, sw - 0.6)} strokeOpacity="0.55" strokeLinecap="round" />
      <path d="m14.2 16.9 5.3-5.3a1.55 1.55 0 0 1 2.2 2.2l-5.3 5.3-3 .8Z" fill="currentColor" fillOpacity={fo} />
      <path d="m14.2 16.9 5.3-5.3a1.55 1.55 0 0 1 2.2 2.2l-5.3 5.3-3 .8Z" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
};

export const IconCompass = ({ className, active }: ZeroIconProps) => {
  const { fo, sw } = useIconStyle(active);
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="8.4" fill="currentColor" fillOpacity={fo} />
      <circle cx="12" cy="12" r="8.4" stroke="currentColor" strokeWidth={sw} />
      <path d="m15 9-1.6 4.4L9 15l1.6-4.4Z" fill="currentColor" />
    </Svg>
  );
};

export const IconPresentation = ({ className, active }: ZeroIconProps) => {
  const { fo, sw } = useIconStyle(active);
  return (
    <Svg className={className}>
      <rect x="3.5" y="4.4" width="17" height="11.2" rx="2" fill="currentColor" fillOpacity={fo} />
      <rect x="3.5" y="4.4" width="17" height="11.2" rx="2" stroke="currentColor" strokeWidth={sw} />
      <path d="m7.2 12 2.8-2.7 2.3 1.9 3.5-3.3" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 15.6v2.6M8.8 21l3.2-2.8 3.2 2.8" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
};

export const IconStore = ({ className, active }: ZeroIconProps) => {
  const { fo, sw } = useIconStyle(active);
  return (
    <Svg className={className}>
      <path d="M4.6 10.5v8.1c0 1 .8 1.9 1.9 1.9h11c1 0 1.9-.9 1.9-1.9v-8.1" fill="currentColor" fillOpacity={fo} />
      <path d="M4.6 10.5v8.1c0 1 .8 1.9 1.9 1.9h11c1 0 1.9-.9 1.9-1.9v-8.1" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 6.8 5.5 4c.2-.4.6-.6 1-.6h11c.4 0 .8.2 1 .6L20 6.8c.8 1.6-.3 3.7-2.2 3.7-1 0-1.9-.6-2.3-1.4-.4.8-1.3 1.4-2.3 1.4h-2.4c-1 0-1.9-.6-2.3-1.4-.4.8-1.3 1.4-2.3 1.4C4.3 10.5 3.2 8.4 4 6.8Z" fill="currentColor" fillOpacity={fo} />
      <path d="M4 6.8 5.5 4c.2-.4.6-.6 1-.6h11c.4 0 .8.2 1 .6L20 6.8c.8 1.6-.3 3.7-2.2 3.7-1 0-1.9-.6-2.3-1.4-.4.8-1.3 1.4-2.3 1.4h-2.4c-1 0-1.9-.6-2.3-1.4-.4.8-1.3 1.4-2.3 1.4C4.3 10.5 3.2 8.4 4 6.8Z" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.4 20.3v-4.2c0-.9.7-1.6 1.6-1.6h2c.9 0 1.6.7 1.6 1.6v4.2" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
};

export const IconInstitution = ({ className, active }: ZeroIconProps) => {
  const { fo, sw } = useIconStyle(active);
  return (
    <Svg className={className}>
      <path d="M3.6 9.4 12 4.2l8.4 5.2Z" fill="currentColor" fillOpacity={fo} />
      <path d="M3.6 9.4 12 4.2l8.4 5.2Z" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 12.4v5.2M12 12.4v5.2M18 12.4v5.2" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" />
      <path d="M4.4 20.6h15.2" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" />
    </Svg>
  );
};
