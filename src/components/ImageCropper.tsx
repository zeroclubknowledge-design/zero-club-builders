import React, { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { getCroppedImg } from '@/lib/cropImage';

interface ImageCropperProps {
  image: string;
  onCropComplete: (croppedImage: Blob) => void;
  onCancel: () => void;
  aspect?: number;
}

export function ImageCropper({ image, onCropComplete, onCancel, aspect = 1 }: ImageCropperProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);

  const onCropChange = (crop: any) => {
    setCrop(crop);
  };

  const onZoomChange = (zoom: number) => {
    setZoom(zoom);
  };

  const onCropCompleteInternal = useCallback((_croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleDone = useCallback(async () => {
    try {
      const croppedImage = await getCroppedImg(image, croppedAreaPixels);
      if (croppedImage) {
        onCropComplete(croppedImage);
      }
    } catch (e) {
      console.error("Crop error:", e);
    }
  }, [croppedAreaPixels, image, onCropComplete]);

  return (
    <Dialog open={!!image} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-[500px] bg-background border-border p-6 rounded-[32px] z-[100">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Edit Photo</DialogTitle>
        </DialogHeader>
        
        <div 
          className="relative h-[300px] w-full bg-black/10 rounded-2xl overflow-hidden mt-4 border border-border/50"
          style={{ transform: 'translateZ(0)' }}
        >
          <Cropper
            image={image}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            onCropChange={onCropChange}
            onCropComplete={onCropCompleteInternal}
            onZoomChange={onZoomChange}
            classes={{
              containerClassName: "rounded-2xl",
              cropAreaClassName: "border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]"
            }}
          />
        </div>

        <div className="mt-6 px-2">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] text-muted-foreground">Zoom</p>
            <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">{Math.round(zoom * 100)}%</span>
          </div>
          <Slider
            value={[zoom]}
            min={1}
            max={3}
            step={0.05}
            onValueChange={([val]) => setZoom(val)}
            className="cursor-pointer"
          />
        </div>

        <DialogFooter className="mt-8 flex gap-3 sm:justify-center">
          <Button 
            variant="outline" 
            onClick={onCancel} 
            className="flex-1 rounded-2xl h-12 border-border/50 hover:bg-accent/10 transition-all font-bold"
          >
            Cancel
          </Button>
          <Button 
            onClick={handleDone} 
            className="flex-1 rounded-2xl h-12 bg-foreground text-background hover:opacity-90 transition-all font-bold"
          >
            Apply Crop
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
