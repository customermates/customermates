const DATA_URL_PREFIX = /^data:[^,]{0,200};base64,/iu;
const BASE64_TEXT = /^[A-Za-z0-9+/_-]*={0,2}$/u;

export function decodeRecordFileContent(content: string): Uint8Array | null {
  const compact = content.replace(DATA_URL_PREFIX, "").replace(/\s+/gu, "");
  if (!BASE64_TEXT.test(compact) || compact.replace(/=+$/u, "").length % 4 === 1) return null;
  const bytes = Buffer.from(compact, "base64");
  const canonical = (value: string) => value.replace(/=+$/u, "").replaceAll("-", "+").replaceAll("_", "/");
  return canonical(bytes.toString("base64")) === canonical(compact) ? new Uint8Array(bytes) : null;
}

export function streamOfBytes(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      if (bytes.byteLength) controller.enqueue(bytes);
      controller.close();
    },
  });
}
