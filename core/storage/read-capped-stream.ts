import { createHash } from "node:crypto";

export type CappedStreamRead = { ok: true; bytes: Uint8Array; sha256: string } | { ok: false; reason: "tooLarge" };

export async function readCappedStream(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number,
): Promise<CappedStreamRead> {
  const hash = createHash("sha256");
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return { ok: false, reason: "tooLarge" };
    }
    hash.update(value);
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, bytes, sha256: hash.digest("hex") };
}

export function emptyFileStream(): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.close();
    },
  });
}

export function totalSizeOfContentRange(header: string | null): number | null {
  const total = header ? /\/(\d+)\s*$/u.exec(header)?.[1] : undefined;
  return total === undefined ? null : Number(total);
}
