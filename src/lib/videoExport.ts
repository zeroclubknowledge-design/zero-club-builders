import { FFmpeg } from "@ffmpeg/ffmpeg";
import coreURL from "@ffmpeg/core?url";
import wasmParts from "virtual:zero-video-codec";

export type VideoProbe = {
  streams?: {
    codec_type?: string;
    codec_name?: string;
    pix_fmt?: string;
    profile?: string;
    width?: number;
    height?: number;
  }[];
  format?: { duration?: string };
};

/** MP4 is a container: copy only codecs already suitable for social apps. */
export function socialVideoArgs(probe: VideoProbe): string[] {
  const video = probe.streams?.find((s) => s.codec_type === "video");
  if (!video) throw new Error("This file does not contain a readable video track.");
  const audio = probe.streams?.filter((s) => s.codec_type === "audio") || [];
  const copy =
    video.codec_name === "h264" &&
    video.pix_fmt === "yuv420p" &&
    ["Constrained Baseline", "Baseline", "Main", "High"].includes(video.profile || "") &&
    (video.width || 0) <= 1920 &&
    (video.height || 0) <= 1920;
  return [
    "-i",
    "input",
    "-map",
    "0:v:0",
    "-map",
    "0:a:0?",
    "-sn",
    "-dn",
    ...(copy
      ? ["-c:v", "copy"]
      : [
          "-vf",
          "scale=w='min(1280,iw)':h='min(1280,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,pad=ceil(iw/2)*2:ceil(ih/2)*2",
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",
          "-crf",
          "23",
          "-pix_fmt",
          "yuv420p",
          "-profile:v",
          "main",
          "-r",
          "30",
        ]),
    ...(audio.length && audio[0].codec_name === "aac"
      ? ["-c:a", "copy"]
      : ["-c:a", "aac", "-b:a", "128k", "-ac", "2", "-ar", "48000"]),
    "-movflags",
    "+faststart",
    "-f",
    "mp4",
    "output.mp4",
  ];
}

let queue: Promise<unknown> = Promise.resolve();

/** Real, offline H.264/AAC conversion. Never relabel original bytes as MP4. */
export function exportSocialVideo(
  blob: Blob,
  onProgress?: (status: string) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  const job = queue.then(async () => {
    signal?.throwIfAborted();
    if (!blob.size) throw new Error("This video is empty. Please try the download again.");
    // The single-thread WASM encoder holds input and output in memory.
    if (blob.size > 512 * 1024 * 1024)
      throw new Error(
        "This video is too large to convert on this device. Download the original or use a shorter clip.",
      );
    const ffmpeg = new FFmpeg();
    const fetchController = new AbortController();
    const cancel = () => {
      fetchController.abort();
      ffmpeg.terminate();
    };
    signal?.addEventListener("abort", cancel, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    let wasmURL: string | undefined;
    try {
      onProgress?.("Loading video converter…");
      // Loading is bounded separately from encoding; long videos are not cut short.
      await Promise.race([
        (async () => {
          const parts = await Promise.all(
            wasmParts.map(async (url) => {
              const response = await fetch(url, { signal: fetchController.signal });
              if (!response.ok)
                throw new Error("The video converter could not download. Please try again.");
              return response.blob();
            }),
          );
          wasmURL = URL.createObjectURL(new Blob(parts, { type: "application/wasm" }));
          signal?.throwIfAborted();
          return ffmpeg.load({ coreURL, wasmURL });
        })(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            cancel();
            reject(
              new Error("The video converter could not load. Check your connection and try again."),
            );
          }, 90000);
        }),
      ]);
      clearTimeout(timer);
      if (wasmURL) URL.revokeObjectURL(wasmURL);
      wasmURL = undefined;
      signal?.throwIfAborted();
      await ffmpeg.writeFile("input", new Uint8Array(await blob.arrayBuffer()));
      onProgress?.("Checking video and audio…");
      // Core 0.12.10 can report -1 after successfully writing probe JSON.
      // Validate the parsed streams instead of trusting that exit status.
      await ffmpeg.ffprobe([
        "-v",
        "error",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        "input",
        "-o",
        "probe.json",
      ]);
      const probe = JSON.parse(
        (await ffmpeg.readFile("probe.json", "utf8")) as string,
      ) as VideoProbe;
      ffmpeg.on("progress", ({ progress }) => {
        onProgress?.(
          Number.isFinite(progress) && progress > 0
            ? `Preparing shareable MP4… ${Math.min(99, Math.round(progress * 100))}%`
            : "Preparing shareable MP4…",
        );
      });
      onProgress?.("Preparing shareable MP4… Keep Zero Club open.");
      const exit = await ffmpeg.exec(socialVideoArgs(probe), 30 * 60 * 1000);
      signal?.throwIfAborted();
      if (exit !== 0)
        throw new Error("Video conversion did not finish. Please retry or download the original.");
      const data = await ffmpeg.readFile("output.mp4");
      if (
        !(data instanceof Uint8Array) ||
        data.length < 12 ||
        String.fromCharCode(...data.slice(4, 8)) !== "ftyp"
      )
        throw new Error("The converted video could not be verified. Please retry.");
      return new Blob([new Uint8Array(data)], { type: "video/mp4" });
    } finally {
      clearTimeout(timer);
      if (wasmURL) URL.revokeObjectURL(wasmURL);
      fetchController.abort();
      signal?.removeEventListener("abort", cancel);
      ffmpeg.terminate();
    }
  });
  // One encoder at a time, also for messages containing several videos.
  queue = job.catch(() => {});
  return job;
}
