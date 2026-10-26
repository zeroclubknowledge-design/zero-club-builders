import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

export async function uploadCertificateAsset(file: File, signature = false) {
  if (file.size > 2 * 1024 * 1024) throw new Error("Choose an image smaller than 2 MB.");
  if (
    !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
    (signature && file.type !== "image/png")
  )
    throw new Error(
      signature
        ? "Use a transparent PNG for your signature, or draw it below."
        : "Choose a PNG, JPG or WebP logo.",
    );
  if (signature) {
    const bitmap = await createImageBitmap(file);
    try {
      if (bitmap.width > 2048 || bitmap.height > 2048)
        throw new Error("Signature images can be up to 2048 × 2048 pixels.");
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d")!;
      context.drawImage(bitmap, 0, 0);
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let clear = false,
        ink = false;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] === 0) clear = true;
        if (data[i] > 20) ink = true;
      }
      if (!clear || !ink)
        throw new Error(
          "Your signature needs a transparent background and visible ink. Draw it below or upload a transparent PNG.",
        );
    } finally {
      bitmap.close();
    }
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in to upload your certificate assets.");
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${user.id}/${signature ? "signature" : "logo"}-${crypto.randomUUID()}.${ext}`;
  const bucket = supabase.storage.from("certificate-assets");
  const { error } = await bucket.upload(path, file, {
    upsert: false,
    contentType: file.type,
    cacheControl: "31536000",
  });
  if (error) throw error;
  return bucket.getPublicUrl(path).data.publicUrl;
}

export function SignatureInput({
  value,
  onChange,
  disabled = false,
  onBusyChange,
}: {
  value: string;
  onChange: (url: string) => void;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [busy, setBusy] = useState(false);
  const [hasInk, setHasInk] = useState(false);
  useEffect(() => {
    onBusyChange?.(busy);
    return () => onBusyChange?.(false);
  }, [busy, onBusyChange]);
  const point = (event: PointerEvent<HTMLCanvasElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return [
      ((event.clientX - box.left) * 1000) / box.width,
      ((event.clientY - box.top) * 300) / box.height,
    ];
  };
  const upload = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      onChange(await uploadCertificateAsset(file, true));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Signature couldn't upload.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3">
      {value && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-white p-3">
          <img src={value} alt="Your signature" className="h-16 max-w-[70%] object-contain" />
          <button
            type="button"
            disabled={busy || disabled}
            onClick={() => onChange("")}
            className="min-h-11 text-xs font-semibold text-[#9a1963]"
          >
            Remove
          </button>
        </div>
      )}
      <div className="overflow-hidden rounded-xl border border-dashed border-border bg-white">
        <canvas
          ref={canvas}
          width={1000}
          height={300}
          aria-label="Draw your signature"
          className="block aspect-[10/3] w-full touch-none"
          onPointerDown={(event) => {
            if (busy || disabled) return;
            drawing.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            const context = event.currentTarget.getContext("2d")!;
            const [x, y] = point(event);
            context.beginPath();
            context.moveTo(x, y);
            context.strokeStyle = "#172027";
            context.lineWidth = 4;
            context.lineCap = "round";
            context.lineJoin = "round";
          }}
          onPointerMove={(event) => {
            if (!drawing.current || busy || disabled) return;
            const context = event.currentTarget.getContext("2d")!;
            const [x, y] = point(event);
            context.lineTo(x, y);
            context.stroke();
            setHasInk(true);
          }}
          onPointerUp={() => {
            drawing.current = false;
          }}
          onPointerCancel={() => {
            drawing.current = false;
          }}
          onLostPointerCapture={() => {
            drawing.current = false;
          }}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || disabled || !hasInk}
          onClick={() =>
            canvas.current?.toBlob((blob) => {
              if (blob) void upload(new File([blob], "signature.png", { type: "image/png" }));
            }, "image/png")
          }
          className="min-h-11 rounded-full bg-foreground px-4 text-xs font-semibold text-background disabled:opacity-40"
        >
          {busy ? "Uploading…" : "Use drawn signature"}
        </button>
        <button
          type="button"
          disabled={busy || disabled}
          onClick={() => {
            canvas.current?.getContext("2d")?.clearRect(0, 0, 1000, 300);
            setHasInk(false);
          }}
          className="min-h-11 rounded-full border border-border px-4 text-xs font-semibold"
        >
          Clear drawing
        </button>
        <label className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-border px-4 text-xs font-semibold">
          Upload transparent PNG
          <input
            type="file"
            accept="image/png"
            className="hidden"
            disabled={busy || disabled}
            onChange={(event) => {
              void upload(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </label>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Draw with your finger or mouse, or upload a PNG without a background. Choose “Use drawn
        signature” to attach your drawing.
      </p>
    </div>
  );
}
