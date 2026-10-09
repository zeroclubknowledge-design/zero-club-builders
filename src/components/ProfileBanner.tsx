import { useState, type ReactNode } from "react";

/**
 * The banner at the top of every profile, yours or anyone else's.
 *
 * Banners uploaded through Zero Club are cropped wide, and those show whole,
 * edge to edge. Some people's banners are other shapes (near-square photos,
 * very long strips). Shown at their own shape, those made one profile look
 * nothing like the next. So every banner sits in the same wide frame: the
 * frame follows the picture's own proportions within a sensible range, and
 * only a picture outside that range is trimmed, from the middle, to fit.
 */

const DEFAULT_RATIO = 16 / 7; // What the banner cropper produces.
const TALLEST = 2.2; // Taller than this is trimmed to fit.
const WIDEST = 4; // Wider than this is trimmed to fit.

export function ProfileBanner({
  url,
  alt,
  empty,
}: {
  url?: string | null;
  alt: string;
  empty?: ReactNode;
}) {
  const [ratio, setRatio] = useState(DEFAULT_RATIO);
  return (
    <div
      className="relative w-full overflow-hidden bg-[#221d22]"
      style={{ aspectRatio: String(ratio) }}
    >
      {url ? (
        <img
          src={url}
          alt={alt}
          className="absolute inset-0 h-full w-full object-cover object-center"
          loading="lazy"
          decoding="async"
          onLoad={(event) => {
            const { naturalWidth, naturalHeight } = event.currentTarget;
            if (naturalWidth && naturalHeight) {
              setRatio(Math.min(WIDEST, Math.max(TALLEST, naturalWidth / naturalHeight)));
            }
          }}
        />
      ) : (
        empty
      )}
    </div>
  );
}
