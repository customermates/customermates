import { randomBytes } from "node:crypto";

type MultipartFile = { content: string; content_type: string; filename: string };

type Part = { name: string; value: string } | { name: string; file: MultipartFile };

function isMultipartFile(value: unknown): value is MultipartFile {
  return (
    typeof value === "object" && value !== null && "content" in value && "content_type" in value && "filename" in value
  );
}

function collectParts(parts: Part[], name: string, value: unknown): void {
  if (value === undefined || value === null) return;
  if (isMultipartFile(value)) {
    parts.push({ name, file: value });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectParts(parts, `${name}[${index}]`, item));
    return;
  }
  if (typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) collectParts(parts, `${name}[${key}]`, nested);
    return;
  }
  parts.push({ name, value: String(value) });
}

function quoted(text: string): string {
  return text.replace(/\r/g, "%0D").replace(/\n/g, "%0A").replace(/"/g, "%22");
}

export function encodeMultipart(body: Record<string, unknown>, boundary: string): Uint8Array {
  const parts: Part[] = [];
  for (const [key, value] of Object.entries(body)) collectParts(parts, key, value);
  const text = new TextEncoder();
  const chunks: Uint8Array[] = [];
  for (const part of parts) {
    if ("file" in part) {
      chunks.push(
        text.encode(
          `--${boundary}\r\nContent-Disposition: form-data; name="${quoted(part.name)}"; filename="${quoted(part.file.filename)}"\r\nContent-Type: ${part.file.content_type.replace(/[\r\n]/g, "")}\r\n\r\n`,
        ),
        Uint8Array.from(Buffer.from(part.file.content, "base64")),
        text.encode("\r\n"),
      );
    } else {
      chunks.push(
        text.encode(
          `--${boundary}\r\nContent-Disposition: form-data; name="${quoted(part.name)}"\r\n\r\n${part.value}\r\n`,
        ),
      );
    }
  }
  chunks.push(text.encode(`--${boundary}--\r\n`));
  const bytes = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

export function multipartRequest() {
  const boundary = `----customermates-${randomBytes(16).toString("hex")}`;
  return {
    bodySerializer: (body: unknown) => encodeMultipart(body as Record<string, unknown>, boundary),
    headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
  };
}
