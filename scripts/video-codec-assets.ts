import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import type { Plugin } from "vite";

/** Keep each engine asset below the hosting platform's 25 MiB file limit. */
export function videoCodecAssets(): Plugin {
  const moduleId = "virtual:zero-video-codec";
  const resolved = "\0" + moduleId;
  const chunkSize = 16 * 1024 * 1024;
  const require = createRequire(import.meta.url);
  let parts: Promise<Buffer[]> | undefined;
  let dev = false;
  const readParts = () =>
    (parts ||= readFile(require.resolve("@ffmpeg/core/wasm")).then((bytes) => {
      const output: Buffer[] = [];
      for (let offset = 0; offset < bytes.length; offset += chunkSize)
        output.push(bytes.subarray(offset, offset + chunkSize));
      return output;
    }));
  return {
    name: "zero-video-codec-assets",
    configResolved(config) {
      dev = config.command === "serve";
    },
    resolveId(id) {
      if (id === moduleId) return resolved;
    },
    async load(id) {
      if (id !== resolved) return;
      const chunks = await readParts();
      const urls = chunks.map((source, i) =>
        dev
          ? JSON.stringify(`/__zero-video-codec/part-${i}.bin`)
          : `import.meta.ROLLUP_FILE_URL_${this.emitFile({ type: "asset", name: `ffmpeg-core.part-${i}.bin`, source })}`,
      );
      return `export default [${urls.join(",")}];`;
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const match = req.url?.match(/^\/__zero-video-codec\/part-(\d+)\.bin$/);
        if (!match) return next();
        try {
          const bytes = (await readParts())[Number(match[1])];
          if (!bytes) {
            res.statusCode = 404;
            res.end();
            return;
          }
          res.setHeader("Content-Type", "application/octet-stream");
          res.setHeader("Content-Length", bytes.length);
          res.end(bytes);
        } catch (error) {
          next(error);
        }
      });
    },
  };
}
