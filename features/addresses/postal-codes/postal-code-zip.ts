import { inflateRawSync } from "node:zlib";

import { crc32, ZIP_DEFLATED, ZIP_STORED, zipEntries, zipEntryData } from "@/core/utils/zip";

export function postalCodeDataError(message: string): Error {
  return new Error(message, { cause: { kind: "postalCodeData" } });
}

export function isPostalCodeDataError(error: unknown): error is Error {
  return error instanceof Error && (error.cause as { kind?: unknown } | undefined)?.kind === "postalCodeData";
}

function fail(message: string): never {
  throw postalCodeDataError(message);
}

function bytesOf(buffer: Buffer): Uint8Array {
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

export function readZipEntry(archive: Buffer, name: string, maxBytes: number): Buffer {
  const bytes = bytesOf(archive);
  const entry = (zipEntries(bytes) ?? fail("The archive has no readable central directory")).find(
    (candidate) => candidate.name === name,
  );
  if (!entry) return fail(`The archive has no ${name}`);
  if (entry.size > maxBytes) fail(`${name} is larger than ${maxBytes} bytes`);
  const data = zipEntryData(bytes, entry) ?? fail(`${name} is cut off`);
  const content =
    entry.method === ZIP_STORED
      ? Buffer.from(data)
      : entry.method === ZIP_DEFLATED
        ? inflateRawSync(data, { maxOutputLength: Math.max(1, maxBytes) })
        : fail(`${name} uses compression method ${entry.method}`);
  if (content.length !== entry.size) fail(`${name} has ${content.length} bytes instead of ${entry.size}`);
  if (crc32(bytesOf(content)) !== entry.checksum) fail(`${name} fails its CRC-32 check`);
  return content;
}
