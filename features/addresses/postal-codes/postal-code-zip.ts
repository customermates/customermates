import { inflateRawSync } from "node:zlib";

const END_OF_DIRECTORY = 0x06054b50;
const DIRECTORY_ENTRY = 0x02014b50;
const LOCAL_HEADER = 0x04034b50;
const MAX_COMMENT_BYTES = 65_535;
const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function postalCodeDataError(message: string): Error {
  return new Error(message, { cause: { kind: "postalCodeData" } });
}

export function isPostalCodeDataError(error: unknown): error is Error {
  return error instanceof Error && (error.cause as { kind?: unknown } | undefined)?.kind === "postalCodeData";
}

function fail(message: string): never {
  throw postalCodeDataError(message);
}

function endOfDirectory(archive: Buffer): number {
  const lowest = Math.max(0, archive.length - 22 - MAX_COMMENT_BYTES);
  for (let offset = archive.length - 22; offset >= lowest; offset -= 1)
    if (archive.readUInt32LE(offset) === END_OF_DIRECTORY) return offset;
  return fail("The archive has no central directory");
}

export function readZipEntry(archive: Buffer, name: string, maxBytes: number): Buffer {
  if (archive.length < 22) fail("The archive is too short");
  const end = endOfDirectory(archive);
  const entries = archive.readUInt16LE(end + 10);
  let offset = archive.readUInt32LE(end + 16);
  for (let index = 0; index < entries; index += 1) {
    if (offset + 46 > archive.length || archive.readUInt32LE(offset) !== DIRECTORY_ENTRY)
      fail("The central directory is damaged");
    const method = archive.readUInt16LE(offset + 10);
    const checksum = archive.readUInt32LE(offset + 16);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const size = archive.readUInt32LE(offset + 24);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const localOffset = archive.readUInt32LE(offset + 42);
    const entryName = archive.toString("utf8", offset + 46, offset + 46 + nameLength);
    offset += 46 + nameLength + extraLength + commentLength;
    if (entryName !== name) continue;
    if (size > maxBytes) fail(`${name} is larger than ${maxBytes} bytes`);
    if (localOffset + 30 > archive.length || archive.readUInt32LE(localOffset) !== LOCAL_HEADER)
      fail(`${name} has no local header`);
    const start = localOffset + 30 + archive.readUInt16LE(localOffset + 26) + archive.readUInt16LE(localOffset + 28);
    if (start + compressedSize > archive.length) fail(`${name} is cut off`);
    const data = archive.subarray(start, start + compressedSize);
    const content =
      method === 0
        ? Buffer.from(data)
        : method === 8
          ? inflateRawSync(data, { maxOutputLength: Math.max(1, maxBytes) })
          : fail(`${name} uses compression method ${method}`);
    if (content.length !== size) fail(`${name} has ${content.length} bytes instead of ${size}`);
    if (crc32(new Uint8Array(content.buffer, content.byteOffset, content.byteLength)) !== checksum)
      fail(`${name} fails its CRC-32 check`);
    return content;
  }
  return fail(`The archive has no ${name}`);
}
