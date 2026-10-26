import { useEffect, useState } from "react";
import { FileText } from "@/components/icons/glyphs";

/** Local preview only; upload happens when the message is sent. */
export function ChatAttachmentThumbnail({ file }: { file: File }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  if (file.type.startsWith("image/"))
    return <img src={src || undefined} alt={file.name} className="-mx-3 h-14 w-14 object-cover" />;
  if (file.type.startsWith("video/"))
    return <video src={src || undefined} aria-label={file.name} muted playsInline preload="metadata" className="-mx-3 h-14 w-20 object-cover" />;
  return <><FileText className="h-5 w-5 text-[#c3217e]" /><span className="max-w-[120px] truncate text-[12px]">{file.type.startsWith("audio/") ? "Voice note" : file.name}</span></>;
}
