import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useUser } from "@/hooks/useUser";
import { draftKey, usePersistentDraft } from "@/lib/draftStorage";
import { Dialog, DialogContent, DialogOverlay, DialogPortal } from "@/components/ui/dialog";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";
import { ArrowLeft, Copy, Download, Loader2, MoreHorizontal, Send, Share2 } from "@/components/icons/glyphs";

interface ImageLightboxProps {
  mediaUrls: string[];
  initialIndex: number;
  isOpen: boolean;
  onClose: () => void;
  /** Chats: who sent it and when, shown across the top. */
  sender?: { name: string; avatarUrl?: string | null; time?: string };
  /** Chats: a Download button for the photo on screen. */
  allowDownload?: boolean;
  /** Chats: a reply box under the photo. The text is sent as a reply to it. */
  onReply?: (text: string) => Promise<unknown> | unknown;
  /** What each item is, when the URL alone can't tell (chat uploads). */
  mediaTypes?: ("image" | "video")[];
  /** Text sent with the photo or video, shown under it. */
  caption?: string;
}

import { downloadMedia as downloadMediaUtil, shareMediaFile, isVideoResource } from "@/lib/downloadMedia";

export const downloadMedia = downloadMediaUtil;

const QUICK_REACTIONS = ["❤️", "😂", "🔥", "👏"];

export function ImageLightbox({
  mediaUrls,
  initialIndex,
  isOpen,
  onClose,
  sender,
  allowDownload = true,
  onReply,
  mediaTypes,
  caption,
}: ImageLightboxProps) {
  const [api, setApi] = useState<CarouselApi>();
  const [index, setIndex] = useState(initialIndex);
  const { data: currentUser } = useUser();
  const [reply, setReply] = usePersistentDraft(draftKey(currentUser?.id, "photo-reply", typeof window === "undefined" ? "" : window.location.pathname, mediaUrls?.[0] || ""), "");
  const [sending, setSending] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [captionOpen, setCaptionOpen] = useState(false);

  useEffect(() => {
    if (!api) return;
    const onSelect = () => setIndex(api.selectedScrollSnap());
    onSelect();
    api.on("select", onSelect);
    return () => {
      api.off("select", onSelect);
    };
  }, [api]);

  if (!isOpen || !mediaUrls || mediaUrls.length === 0) return null;
  const currentUrl = mediaUrls[index] || mediaUrls[0];

  const sendReply = async (text: string) => {
    if (!onReply || !text.trim() || sending) return;
    setSending(true);
    try {
      await onReply(text.trim());
      setReply("");
      onClose();
    } finally {
      setSending(false);
    }
  };

  const isVideo = (url: string, i: number) => {
    if (mediaTypes?.[i]) return mediaTypes[i] === "video";
    if (!url) return false;
    return /\.(mp4|webm|ogg|mov|m4v)(\?|$)/i.test(url) || url.includes("video");
  };

  const isCurrentVideo = isVideo(currentUrl, index);

  const share = async () => {
    setMenuOpen(false);
    setDownloading(true);
    try {
      await shareMediaFile(currentUrl, { isVideo: isCurrentVideo });
    } catch {
      /* Share sheet closed */
    } finally {
      setDownloading(false);
    }
  };

  const save = async () => {
    setMenuOpen(false);
    setDownloading(true);
    try {
      await downloadMediaUtil(currentUrl, { isVideo: isCurrentVideo });
    } finally {
      setDownloading(false);
    }
  };

  const trimmedCaption = (caption || "").trim();

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogPortal>
        <DialogOverlay className="z-[100] bg-black" />
        <DialogContent
          className="z-[100] flex h-[100dvh] w-full max-w-[100vw] flex-col border-none bg-black p-0 text-white shadow-none outline-none"
          onInteractOutside={onClose}
          closeClassName="hidden"
        >
          {/* Top bar: back, who sent it, download, and a menu — like a social app's viewer. */}
          <div className="relative z-[105] flex items-center gap-3 px-2 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
            <button type="button" onClick={onClose} aria-label="Back" className="grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-white/10">
              <ArrowLeft className="h-6 w-6" />
            </button>
            {sender ? (
              <span className="flex min-w-0 flex-1 items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-white/15 text-[15px] font-semibold">
                  {sender.avatarUrl ? <img src={sender.avatarUrl} alt="" className="h-full w-full object-cover" /> : sender.name.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate text-[16px] font-bold">{sender.name}</span>
                  {sender.time && <span className="block truncate text-[13px] text-white/60">{sender.time}</span>}
                </span>
              </span>
            ) : (
              <span className="flex-1" />
            )}
            {mediaUrls.length > 1 && (
              <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-[12px] font-semibold tabular-nums text-white/80">
                {index + 1} / {mediaUrls.length}
              </span>
            )}
            {allowDownload && (
              <button
                type="button"
                onClick={() => void save()}
                aria-label={isCurrentVideo ? "Save video (MP4)" : "Save to phone"}
                title={isCurrentVideo ? "Save video (MP4)" : "Save to phone"}
                disabled={downloading}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-white/10 active:scale-95 disabled:opacity-50"
              >
                {downloading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5 text-white/80" />}
              </button>
            )}
            {(
              <div className="relative shrink-0">
                <button type="button" onClick={() => setMenuOpen((o) => !o)} aria-label="More" aria-expanded={menuOpen} className="grid h-11 w-11 place-items-center rounded-full hover:bg-white/10">
                  <MoreHorizontal className="h-6 w-6 rotate-90" />
                </button>
                {menuOpen && (
                  <>
                    <button type="button" aria-label="Close menu" className="fixed inset-0 z-[106] cursor-default" onClick={() => setMenuOpen(false)} />
                    <div className="absolute right-1 top-12 z-[107] w-56 overflow-hidden rounded-2xl bg-[#1c1b1f] py-1.5 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.9)] ring-1 ring-white/10">
                      {allowDownload && (
                        <button type="button" onClick={() => void save()} className="flex w-full items-center gap-3 px-4 py-3 text-left text-[14.5px] hover:bg-white/[0.06]">
                          <Download className="h-5 w-5 text-white/70" /> {isCurrentVideo ? "Save video (MP4)" : "Save to phone"}
                        </button>
                      )}
                      <button type="button" onClick={() => void share()} className="flex w-full items-center gap-3 px-4 py-3 text-left text-[14.5px] hover:bg-white/[0.06]">
                        <Share2 className="h-5 w-5 text-white/70" /> {isCurrentVideo ? "Share video to socials" : "Share"}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          setMenuOpen(false);
                          try { await navigator.clipboard.writeText(currentUrl); toast.success("Link copied"); } catch { toast.error("Could not copy the link"); }
                        }}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left text-[14.5px] hover:bg-white/[0.06]"
                      >
                        <Copy className="h-5 w-5 text-white/70" /> Copy link
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* The media, centred on black. */}
          <div className="relative min-h-0 flex-1">
            <Carousel setApi={setApi} opts={{ startIndex: initialIndex, loop: mediaUrls.length > 1 }} className="h-full w-full">
              <CarouselContent className="ml-0 h-full">
                {mediaUrls.map((url, i) => (
                  <CarouselItem key={i} className="flex h-full w-full select-none items-center justify-center pl-0">
                    {isVideo(url, i) ? (
                      i === index ? (
                        <video src={url} controls autoPlay playsInline className="max-h-full max-w-full object-contain" />
                      ) : (
                        <video src={`${url}#t=0.1`} preload="metadata" muted playsInline className="max-h-full max-w-full object-contain" />
                      )
                    ) : (
                      <img src={url} alt={`Media ${i + 1}`} className="pointer-events-none max-h-full max-w-full select-none object-contain" loading="lazy" decoding="async" />
                    )}
                  </CarouselItem>
                ))}
              </CarouselContent>
              {mediaUrls.length > 1 && (
                <>
                  <CarouselPrevious className="left-4 hidden h-11 w-11 border-none bg-white/10 text-white backdrop-blur-md hover:bg-white/20 hover:text-white sm:flex" />
                  <CarouselNext className="right-4 hidden h-11 w-11 border-none bg-white/10 text-white backdrop-blur-md hover:bg-white/20 hover:text-white sm:flex" />
                </>
              )}
            </Carousel>
          </div>

          {/* The text that came with it. */}
          {trimmedCaption && (
            <button
              type="button"
              onClick={() => setCaptionOpen((o) => !o)}
              className="relative z-[105] mx-auto w-full max-w-[640px] px-5 pt-3 text-left"
            >
              <p className={`whitespace-pre-wrap break-words text-[15px] leading-relaxed text-white/90 ${captionOpen ? "max-h-[40dvh] overflow-y-auto" : "line-clamp-3"}`}>{trimmedCaption}</p>
            </button>
          )}

          {/* Reply to this photo or video. */}
          {onReply ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void sendReply(reply);
              }}
              className="relative z-[105] px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3"
            >
              <div className="mx-auto flex max-w-[640px] items-center gap-2 rounded-full bg-white/[0.08] py-1.5 pl-1.5 pr-1.5 ring-1 ring-white/15">
                <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-white/15 text-[13px] font-semibold">
                  {(currentUser as any)?.avatar_url ? <img src={(currentUser as any).avatar_url} alt="" className="h-full w-full object-cover" /> : ((currentUser as any)?.full_name || "Y").charAt(0)}
                </span>
                <input
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  placeholder="Reply"
                  aria-label="Reply to this"
                  className="min-w-0 flex-1 bg-transparent text-[15px] text-white outline-none placeholder:text-white/55"
                />
                {!reply.trim() &&
                  QUICK_REACTIONS.slice(0, 2).map((emoji) => (
                    <button key={emoji} type="button" onClick={() => void sendReply(emoji)} className="grid h-9 w-9 place-items-center rounded-full text-[20px] active:scale-90" aria-label={`Reply ${emoji}`}>
                      {emoji}
                    </button>
                  ))}
                <button type="submit" disabled={!reply.trim() || sending} aria-label="Send reply" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#c3217e] text-white transition disabled:opacity-40">
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
            </form>
          ) : (
            <div className="pb-[calc(0.75rem+env(safe-area-inset-bottom))]" />
          )}
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
