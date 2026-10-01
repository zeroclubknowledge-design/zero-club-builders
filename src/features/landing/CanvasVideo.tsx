import { useEffect, useRef } from "react";

/**
 * A decorative looping video with no browser download button.
 *
 * Some mobile browsers (Mi Browser, Phoenix, UC, Opera, Samsung Internet's
 * video assistant…) float their own download / pop-out button over every
 * visible <video>, and none of them honour a "please don't" attribute
 * reliably. So the visible element here is a <canvas>: the <video> plays
 * off-screen at 1px and each frame is painted onto the canvas. To those
 * browsers there is no video on screen to decorate.
 *
 * - The poster shows immediately as the canvas background.
 * - Frames are only drawn while the card is on screen, and the video pauses
 *   when it scrolls away, so it costs nothing when unseen.
 * - With reduced motion (or if autoplay is refused) the poster simply stays.
 */
export function CanvasVideo({
  src,
  poster,
  play,
  className = "",
}: {
  src: string;
  poster?: string;
  play: boolean;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video || !play) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let visible = false;
    let raf = 0;
    let lastTime = -1;

    const size = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(r.width * dpr));
      const h = Math.max(1, Math.round(r.height * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    };

    // object-fit: cover
    const paint = () => {
      if (!video.videoWidth) return;
      size();
      const cw = canvas.width, ch = canvas.height;
      const s = Math.max(cw / video.videoWidth, ch / video.videoHeight);
      const dw = video.videoWidth * s, dh = video.videoHeight * s;
      ctx.drawImage(video, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
    };

    const loop = () => {
      if (!visible) return;
      // requestAnimationFrame rather than requestVideoFrameCallback: a 1px,
      // transparent video may never be composited, so its frame callbacks
      // can stall. Only repaint when the video has actually moved on.
      if (video.currentTime !== lastTime) { lastTime = video.currentTime; paint(); }
      raf = requestAnimationFrame(loop);
    };

    const start = () => {
      visible = true;
      video.play().then(loop).catch(() => { /* autoplay refused: the poster stays */ });
    };
    const stop = () => {
      visible = false;
      video.pause();
      cancelAnimationFrame(raf);
    };

    const io = new IntersectionObserver(([entry]) => (entry.isIntersecting ? start() : stop()), { rootMargin: "100px" });
    io.observe(canvas);
    return () => { io.disconnect(); stop(); };
  }, [play, src]);

  return (
    <div className={`relative ${className}`} aria-hidden>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={poster ? { backgroundImage: `url(${poster})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
      />
      {play && (
        <video
          ref={videoRef}
          src={src}
          muted
          loop
          playsInline
          preload="metadata"
          tabIndex={-1}
          disablePictureInPicture
          disableRemotePlayback
          controlsList="nodownload nofullscreen noremoteplayback"
          {...{ "webkit-playsinline": "true", "x5-playsinline": "true", "x5-video-player-type": "h5", "x-webkit-airplay": "deny" }}
          onContextMenu={(e) => e.preventDefault()}
          style={{ position: "fixed", left: -10, top: -10, width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
        />
      )}
    </div>
  );
}
