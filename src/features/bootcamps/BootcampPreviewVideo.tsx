/** Muted inline playback lets bootcamp covers autoplay on mobile and desktop. */
export function BootcampPreviewVideo({ src, label = "Bootcamp preview video", controls = false, poster }: { src: string; label?: string; controls?: boolean; poster?: string }) {
  return (
    <video
      src={src}
      poster={poster}
      controls={controls}
      aria-label={label}
      autoPlay
      loop
      muted
      playsInline
      preload="metadata"
      className={`h-full w-full bg-black ${controls ? "object-contain" : "pointer-events-none object-cover"}`}
    />
  );
}
