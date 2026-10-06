/** Consume Responses SSE across arbitrary network chunk and UTF-8 boundaries. */
export async function readAIStream(response: Response, onText: (delta: string) => void) {
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Zero AI couldn't reply. Please try again.");
  }
  if (!response.body) throw new Error("Zero AI returned an empty response.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed = false;
  function processFrame(frame: string) {
    const data = frame
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data || data === "[DONE]") return;
    const event = JSON.parse(data);
    if (event.type === "response.output_text.delta" || event.type === "response.refusal.delta")
      onText(event.delta || "");
    if (event.type === "response.completed") completed = true;
    if (["error", "response.failed", "response.incomplete"].includes(event.type))
      throw new Error("Zero AI couldn't finish its reply. Please try again.");
  }
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, "\n");
      let boundary;
      while ((boundary = buffer.indexOf("\n\n")) >= 0) {
        processFrame(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
      }
      if (done) break;
    }
    if (buffer.trim()) processFrame(buffer);
    if (!completed)
      throw new Error("The connection ended before Zero AI finished. Please try again.");
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
