export const INLINE_RECORD_FILE_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

export type RecordFileByteRange = { start: number; end: number };

function asciiFallback(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/gu, "_").replace(/["\\]/gu, "_");
  return ascii.trim() || "file";
}

function encodeRfc5987(value: string): string {
  return encodeURIComponent(value).replace(
    /['()*]/gu,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export function recordFileServedInline(mimeType: string, download: boolean): boolean {
  return !download && INLINE_RECORD_FILE_TYPES.has(mimeType);
}

export function recordFileContentDisposition(name: string, inline: boolean): string {
  return `${inline ? "inline" : "attachment"}; filename="${asciiFallback(name)}"; filename*=UTF-8''${encodeRfc5987(name)}`;
}

export function parseRecordFileRange(
  header: string | null,
  size: number,
): RecordFileByteRange | "unsatisfiable" | null {
  const match = header ? /^bytes=(\d*)-(\d*)$/u.exec(header.trim()) : null;
  if (!match) return null;
  const [, first, last] = match;
  if (!first && !last) return null;
  if (!first) {
    const suffix = Number(last);
    if (suffix === 0 || size === 0) return "unsatisfiable";
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(first);
  const end = last ? Math.min(Number(last), size - 1) : size - 1;
  if (last && Number(last) < start) return null;
  if (start >= size) return "unsatisfiable";
  return { start, end };
}

export function recordFileResponseHeaders(file: {
  name: string;
  mimeType: string;
  size: number;
  inline: boolean;
  range: RecordFileByteRange | null;
}): Record<string, string> {
  const length = file.range ? file.range.end - file.range.start + 1 : file.size;
  return {
    "content-type": file.mimeType,
    "content-length": String(length),
    "content-disposition": recordFileContentDisposition(file.name, file.inline),
    "x-content-type-options": "nosniff",
    "cache-control": "private, no-store",
    "accept-ranges": "bytes",
    "content-security-policy": file.inline ? "sandbox; frame-ancestors 'self'" : "frame-ancestors 'self'",
    ...(file.range ? { "content-range": `bytes ${file.range.start}-${file.range.end}/${file.size}` } : {}),
  };
}
