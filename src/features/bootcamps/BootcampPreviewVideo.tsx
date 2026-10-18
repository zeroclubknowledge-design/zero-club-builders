/** Muted inline playback lets bootcamp covers autoplay on mobile and desktop. */
export function BootcampPreviewVideo({ src, label = "Bootcamp preview video" }: { src: string; label?: string }) {
  return (
    <video
      src={src}
      aria-label={label}
      autoPlay
      loop
      muted
      playsInline
      preload="metadata"
      className="pointer-events-none h-full w-full bg-black object-cover"
    />
  );
}
