// This bridge imports the COMPILED server output to ensure all modules are found at runtime
export default async function handler(req: any, res: any) {
  try {
    // Import from the built output instead of source
    // We use a relative path that Vercel's bundler will follow
    // The build output has no type declarations; Vercel type-checks this file
    // before the import exists in a typed form, so skip the check here.
    // @ts-ignore TS7016 — untyped build output
    const { default: serverHandler } = await import("../dist/server/server.js");
    
    // Convert Node.js request to a Web Request that TanStack Start expects
    const protocol = req.headers["x-forwarded-proto"] || "http";
    const host = req.headers["host"];
    const url = new URL(req.url || "/", `${protocol}://${host}`);
    
    const request = new Request(url.toString(), {
      method: req.method,
      headers: req.headers,
      body: req.method !== "GET" && req.method !== "HEAD" ? req : undefined,
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    // Let the built TanStack Start handler process the request
    // Note: serverHandler might be the fetch function directly if it's the Nitro output
    const response = typeof serverHandler === 'function' 
      ? await serverHandler(request)
      : await serverHandler.fetch(request);

    // Send the response back to Vercel
    res.status(response.status);
    response.headers.forEach((value: string, key: string) => {
      res.setHeader(key, value);
    });

    // Send chunks as they arrive so GPT and pages can stream immediately.
    if (!response.body) { res.end(); return; }
    const reader = response.body.getReader();
    const onClose = () => { void reader.cancel().catch(() => {}); };
    res.on("close", onClose);
    try {
      while (!res.destroyed) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!res.write(Buffer.from(value))) {
          await new Promise<void>((resolve) => {
            const ready = () => { res.off("drain", ready); res.off("close", ready); resolve(); };
            res.once("drain", ready);
            res.once("close", ready);
          });
        }
      }
      res.end();
    } finally {
      res.off("close", onClose);
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    
  } catch (error: any) {
    console.error("Vercel SSR Bridge Error:", error);
    if (res.headersSent) res.destroy();
    else res.status(500).send("The application couldn't load. Please try again.");
  }
}
