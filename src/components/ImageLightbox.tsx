import { Dialog, DialogContent, DialogOverlay, DialogPortal } from "@/components/ui/dialog";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import { X } from "lucide-react";

interface ImageLightboxProps {
  mediaUrls: string[];
  initialIndex: number;
  isOpen: boolean;
  onClose: () => void;
}

export function ImageLightbox({ mediaUrls, initialIndex, isOpen, onClose }: ImageLightboxProps) {
  if (!isOpen || !mediaUrls || mediaUrls.length === 0) return null;

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
        >
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 z-[110] p-2 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
          
          <Carousel 
            opts={{ startIndex: initialIndex, loop: true }}
            className="w-full h-full flex items-center justify-center"
          >
            <CarouselContent className="h-full ml-0">
              {mediaUrls.map((url, i) => (
                <CarouselItem key={i} className="flex flex-col items-center justify-center h-full w-full pl-0 select-none">
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
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
