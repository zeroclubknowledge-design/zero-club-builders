// This bridge imports the COMPILED server output to ensure all modules are found at runtime
export default async function handler(req: any, res: any) {
  try {
    // Import from the built output instead of source
    // We use a relative path that Vercel's bundler will follow
    const { default: serverHandler } = await import("../dist/server/index.js");
    
    // Convert Node.js request to a Web Request that TanStack Start expects
    const protocol = req.headers["x-forwarded-proto"] || "http";
    const host = req.headers["host"];
    const url = new URL(req.url || "/", `${protocol}://${host}`);
    
    const request = new Request(url.toString(), {
      method: req.method,
      headers: req.headers,
      body: req.method !== "GET" && req.method !== "HEAD" ? req : undefined,
    });

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

    const body = await response.arrayBuffer();
    res.send(Buffer.from(body));
    
  } catch (error: any) {
    console.error("Vercel SSR Bridge Error:", error);
    res.status(500).send(`Deployment Error: ${error.message}\n\nTrace: ${error.stack}`);
  }
}
