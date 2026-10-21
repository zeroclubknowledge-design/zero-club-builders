import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Image as ImageIcon, Info, Loader2, Trash2, UploadCloud, UserRound } from "@/components/icons/glyphs";
import { supabase } from "@/lib/supabase";
import { uploadCertificateAsset } from "./SignatureInput";

/**
 * The brand logo on a certificate (PRO).
 *
 * A profile photo usually has a background and a circle crop in mind, so it
 * is never used on its own: tutors and organizations upload their real brand
 * mark — ideally a transparent PNG — once, and every certificate starts with
 * it. The preview sits on a checkerboard so a transparent logo looks
 * transparent, and says plainly whether the uploaded file has a background.
 */
export function BrandLogoPicker({
  value,
  savedLogo,
  profilePhoto,
  disabled,
  onChange,
  onBusyChange,
}: {
  value: string;
  /** The account's saved brand logo (profiles.brand_logo_url). */
  savedLogo: string | null;
  profilePhoto: string | null;
  disabled?: boolean;
  onChange: (url: string) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const transparency = useTransparency(value);

  useEffect(() => {
    onBusyChange?.(uploading);
  }, [uploading, onBusyChange]);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadCertificateAsset(file);
      onChange(url);
      // Kept on the account, so the next certificate starts with it.
      const { data: auth } = await supabase.auth.getUser();
      if (auth.user) {
        await supabase.from("profiles").update({ brand_logo_url: url } as never).eq("id", auth.user.id);
        void queryClient.invalidateQueries({ queryKey: ["certificate-studio"] });
      }
      toast.success("Brand logo saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Logo upload failed");
    } finally {
      setUploading(false);
    }
  };

  const usingPhoto = Boolean(value && profilePhoto && value === profilePhoto);

  return (
    <div className="rounded-2xl border border-border bg-background/60 p-3">
      <div className="flex items-start gap-3">
        {/* Checkerboard: a transparent logo shows as transparent. */}
        <div
          className="relative grid h-[76px] w-[112px] shrink-0 place-items-center overflow-hidden rounded-xl border border-border"
          style={{
            backgroundColor: "#ffffff",
            backgroundImage:
              "linear-gradient(45deg,#e9e7e4 25%,transparent 25%),linear-gradient(-45deg,#e9e7e4 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e9e7e4 75%),linear-gradient(-45deg,transparent 75%,#e9e7e4 75%)",
            backgroundSize: "14px 14px",
            backgroundPosition: "0 0,0 7px,7px -7px,-7px 0",
          }}
        >
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : value ? (
            <img src={value} alt="Your certificate logo" className="max-h-[60px] max-w-[96px] object-contain" />
          ) : (
            <span className="flex flex-col items-center gap-1 text-[10.5px] font-semibold text-muted-foreground">
              <ImageIcon className="h-5 w-5" /> No logo yet
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold">Brand logo</p>
          <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">
            Upload your logo as a transparent PNG so it sits cleanly on the certificate. PNG, WebP or JPG, up to 2 MB.
          </p>
          {value && !uploading && (
            <p
              className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${
                usingPhoto
                  ? "bg-amber-500/12 text-amber-700 dark:text-amber-400"
                  : transparency === "transparent"
                    ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400"
                    : transparency === "solid"
                      ? "bg-amber-500/12 text-amber-700 dark:text-amber-400"
                      : "bg-foreground/[0.06] text-muted-foreground"
              }`}
            >
              {usingPhoto ? (
                <><UserRound className="h-3 w-3" /> Your profile photo</>
              ) : transparency === "transparent" ? (
                <><CheckCircle2 className="h-3 w-3" /> Transparent background</>
              ) : transparency === "solid" ? (
                <><Info className="h-3 w-3" /> Has a background</>
              ) : (
                <>Your brand logo</>
              )}
            </p>
          )}
        </div>
      </div>

      {(usingPhoto || transparency === "solid") && !uploading && (
        <p className="mt-2.5 rounded-xl bg-amber-500/[0.08] px-3 py-2 text-[11.5px] leading-snug text-foreground">
          {usingPhoto
            ? "Profile photos usually have a background. Upload your brand logo for a cleaner certificate."
            : "This logo has a solid background, which will show as a box on the certificate. A transparent PNG blends in."}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label
          className={`inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full bg-foreground px-4 text-xs font-semibold text-background transition active:scale-[0.98] ${
            uploading || disabled ? "pointer-events-none opacity-50" : ""
          }`}
        >
          <UploadCloud className="h-4 w-4" />
          {uploading ? "Uploading…" : value && !usingPhoto ? "Replace logo" : "Upload brand logo"}
          <input
            className="hidden"
            type="file"
            accept="image/png,image/webp,image/jpeg"
            disabled={uploading || disabled}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void upload(file);
            }}
          />
        </label>
        {savedLogo && value !== savedLogo && (
          <button
            type="button"
            onClick={() => onChange(savedLogo)}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border px-3.5 text-xs font-semibold"
          >
            <img src={savedLogo} alt="" className="h-4 w-4 object-contain" /> Use saved logo
          </button>
        )}
        {profilePhoto && !usingPhoto && (
          <button
            type="button"
            onClick={() => onChange(profilePhoto)}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-2 text-xs font-semibold text-muted-foreground underline-offset-4 hover:underline"
          >
            Use my profile photo
          </button>
        )}
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Remove logo"
            className="ml-auto grid h-10 w-10 place-items-center rounded-full text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

/** Whether an image has see-through pixels: "transparent", "solid", or null when unknown. */
function useTransparency(url: string) {
  const [result, setResult] = useState<"transparent" | "solid" | null>(null);
  useEffect(() => {
    setResult(null);
    if (!url) return;
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const size = 64;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;
        let clear = false;
        for (let i = 3; i < data.length; i += 4) {
          if (data[i] < 250) {
            clear = true;
            break;
          }
        }
        if (!cancelled) setResult(clear ? "transparent" : "solid");
      } catch {
        /* A host without CORS headers: we just don't say. */
      }
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);
  return result;
}
