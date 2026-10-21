const mediaTypes: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
  webp: "image/webp", avif: "image/avif", bmp: "image/bmp",
  mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime",
  webm: "video/webm", ogv: "video/ogg",
};

/** Windows file pickers can omit MIME metadata. Preserve the file's bytes. */
export function readChatAttachments(input: HTMLInputElement): File[] {
  const selected = Array.from(input.files || []);
  input.value = "";
  return selected.map(file => {
    const type = mediaTypes[file.name.split(".").pop()?.toLowerCase() || ""];
    if (!type || (file.type && file.type !== "application/octet-stream")) return file;
    return new File([file], file.name, { type, lastModified: file.lastModified });
  });
}
