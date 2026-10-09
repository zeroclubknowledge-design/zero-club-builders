import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogOverlay, DialogPortal } from "@/components/ui/dialog";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";
import { Download, Loader2, Send } from "@/components/icons/glyphs";

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
}

/** Saves the photo to the phone instead of opening the file in a browser tab. */
export async function downloadMedia(url: string) {
  const name = decodeURIComponent(url.split("?")[0].split("/").pop() || "zero-club-photo");
  try {
    const blob = await fetch(url).then((response) => {
      if (!response.ok) throw new Error("download failed");
      return response.blob();
    });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = name.includes(".") ? name : `${name}.jpg`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
    toast.success("Saved to your downloads");
  } catch {
    toast.error("Could not download this photo");
  }
}

const QUICK_REACTIONS = ["❤️", "😂", "🔥", "👏"];

export function ImageLightbox({
  mediaUrls,
  initialIndex,
  isOpen,
  onClose,
  sender,
  allowDownload,
  onReply,
}: ImageLightboxProps) {
  const [api, setApi] = useState<CarouselApi>();
  const [index, setIndex] = useState(initialIndex);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [downloading, setDownloading] = useState(false);

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

  const isVideoUrl = (url: string) => {
    if (!url) return false;
    return url.match(/\.(mp4|webm|ogg)$/i) || url.includes("video");
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogPortal>
        <DialogOverlay className="bg-black/95 z-[100]" />
        <DialogContent
          className="max-w-[100vw] w-full h-[100dvh] p-0 border-none bg-transparent shadow-none flex items-center justify-center z-[100] outline-none"
          onInteractOutside={onClose}
          // One close button: the dialog's own, plain white and large enough
          // to hit with a thumb. The circled duplicate that sat on top of it
          // is gone.
          closeClassName="right-2 top-[calc(0.5rem+env(safe-area-inset-top))] z-[110] grid h-12 w-12 place-items-center rounded-full opacity-100 text-white focus:ring-0 focus:ring-offset-0 data-[state=open]:bg-transparent data-[state=open]:text-white"
          closeIconClassName="h-8 w-8"
        >
          {(sender || allowDownload) && (
            <div className="pointer-events-none absolute inset-x-0 top-0 z-[105] flex items-center gap-3 bg-gradient-to-b from-black/70 to-transparent px-4 pb-8 pt-[calc(0.75rem+env(safe-area-inset-top))] pr-16 text-white">
              {sender && (
                <>
                  <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-white/15 text-[14px] font-semibold">
                    {sender.avatarUrl ? (
                      <img src={sender.avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      sender.name.charAt(0).toUpperCase()
                    )}
                  </span>
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate text-[15px] font-semibold">{sender.name}</span>
                    {sender.time && (
                      <span className="block truncate text-[12px] text-white/70">
                        {sender.time}
                      </span>
                    )}
                  </span>
                </>
              )}
              {allowDownload && (
                <button
                  type="button"
                  onClick={async () => {
                    setDownloading(true);
                    await downloadMedia(currentUrl);
                    setDownloading(false);
                  }}
                  aria-label="Download"
                  className="pointer-events-auto ml-auto grid h-11 w-11 place-items-center rounded-full text-white hover:bg-white/10"
                >
                  {downloading ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : (
                    <Download className="h-6 w-6" />
                  )}
                </button>
              )}
            </div>
          )}

          <Carousel
            setApi={setApi}
            opts={{ startIndex: initialIndex, loop: true }}
            className="w-full h-full flex items-center justify-center"
          >
            <CarouselContent className="h-full ml-0">
              {mediaUrls.map((url, i) => (
                <CarouselItem
                  key={i}
                  className="flex flex-col items-center justify-center h-full w-full pl-0 select-none"
                >
                  {isVideoUrl(url) ? (
                    <video
                      src={url}
                      controls
                      autoPlay
                      className="max-h-[85dvh] max-w-[100vw] object-contain rounded-md"
                    />
                  ) : (
                    <img
                      src={url}
                      alt={`Media ${i + 1}`}
                      className="max-h-[85dvh] max-w-[100vw] object-contain rounded-md select-none pointer-events-none"
                      loading="lazy"
                      decoding="async"
                    />
                  )}
                  {mediaUrls.length > 1 && (
                    <div className="absolute bottom-6 text-white/50 text-sm font-medium tracking-widest">
                      {i + 1} / {mediaUrls.length}
                    </div>
                  )}
                </CarouselItem>
              ))}
            </CarouselContent>
            {mediaUrls.length > 1 && (
              <>
                <CarouselPrevious className="left-4 bg-white/10 border-none text-white hover:bg-white/20 hover:text-white backdrop-blur-md w-12 h-12" />
                <CarouselNext className="right-4 bg-white/10 border-none text-white hover:bg-white/20 hover:text-white backdrop-blur-md w-12 h-12" />
              </>
            )}
          </Carousel>

          {/* Reply to this photo, in the same style as the chat box. */}
          {onReply && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void sendReply(reply);
              }}
              className="absolute inset-x-0 bottom-0 z-[105] bg-gradient-to-t from-black/80 to-transparent px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-10"
            >
              <div className="mx-auto flex max-w-[620px] items-center gap-2 rounded-full border border-white/15 bg-white/10 py-1.5 pl-4 pr-1.5 backdrop-blur-md">
                <input
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  placeholder="Reply"
                  aria-label="Reply to this photo"
                  className="min-w-0 flex-1 bg-transparent text-[15px] text-white outline-none placeholder:text-white/60"
                />
                {!reply.trim() &&
                  QUICK_REACTIONS.slice(0, 2).map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => void sendReply(emoji)}
                      className="grid h-9 w-9 place-items-center rounded-full text-[20px] active:scale-90"
                      aria-label={`Reply ${emoji}`}
                    >
                      {emoji}
                    </button>
                  ))}
                <button
                  type="submit"
                  disabled={!reply.trim() || sending}
                  aria-label="Send reply"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#cc208f] text-white transition disabled:opacity-40"
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </button>
              </div>
            </form>
          )}
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
