/**
 * Minimal Server-Sent Events parser for fetch() response bodies.
 *
 * ADK's /run_sse writes one JSON object per event as `data: {...}\n\n`.
 * Comment lines (`: keep-alive`) from the BFF heartbeat are ignored.
 */
export function createSseParser(onData: (data: string) => void) {
  let buffer = "";

  function flushBlock(block: string) {
    const dataLines: string[] = [];
    for (const rawLine of block.split("\n")) {
      const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
      if (!line || line.startsWith(":")) continue;
      if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).replace(/^ /, ""));
      }
    }
    if (dataLines.length) onData(dataLines.join("\n"));
  }

  return {
    push(chunk: string) {
      buffer += chunk.replace(/\r\n/g, "\n");
      let index: number;
      while ((index = buffer.indexOf("\n\n")) !== -1) {
        const block = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        flushBlock(block);
      }
    },
    end() {
      if (buffer.trim()) flushBlock(buffer);
      buffer = "";
    },
  };
}

/** Read an SSE response body and invoke `onJson` for each parsed data payload. */
export async function readSseStream(
  body: ReadableStream<Uint8Array>,
  onJson: (payload: unknown) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser((data) => {
    try {
      onJson(JSON.parse(data));
    } catch {
      // Ignore malformed payloads rather than breaking the whole stream.
    }
  });

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    parser.push(decoder.decode(value, { stream: true }));
  }
  parser.push(decoder.decode());
  parser.end();
}
