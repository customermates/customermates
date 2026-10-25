import { promisify } from "node:util";
import { inflateRaw } from "node:zlib";

const END_OF_DIRECTORY = 0x06054b50;
const DIRECTORY_ENTRY = 0x02014b50;
const LOCAL_HEADER = 0x04034b50;
const END_OF_DIRECTORY_LENGTH = 22;
const DIRECTORY_ENTRY_LENGTH = 46;
const LOCAL_HEADER_LENGTH = 30;
const MAX_COMMENT_LENGTH = 0xffff;
const ZIP64_EXTRA_FIELD = 0x0001;
const ZIP64_MARKER = 0xffffffff;
const ENCRYPTED_FLAG = 0x0001;

export const ZIP_STORED = 0;
export const ZIP_DEFLATED = 8;

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

const inflateRawAsync = promisify(inflateRaw);

export type ZipEntry = {
  name: string;
  encrypted: boolean;
  method: number;
  checksum: number;
  compressedSize: number;
  size: number;
  localOffset: number;
};

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function endOfDirectory(view: DataView): number {
  const last = view.byteLength - END_OF_DIRECTORY_LENGTH;
  for (let offset = last; offset >= 0 && offset >= last - MAX_COMMENT_LENGTH; offset -= 1)
    if (view.getUint32(offset, true) === END_OF_DIRECTORY) return offset;
  return -1;
}

function zip64Sizes(view: DataView, start: number, length: number, entry: ZipEntry): ZipEntry | null {
  for (let offset = start; offset + 4 <= start + length; ) {
    const id = view.getUint16(offset, true);
    const size = view.getUint16(offset + 2, true);
    if (offset + 4 + size > start + length) return null;
    if (id === ZIP64_EXTRA_FIELD) {
      let cursor = offset + 4;
      const read = (value: number) => {
        if (value !== ZIP64_MARKER) return value;
        if (cursor + 8 > offset + 4 + size) return -1;
        const wide = Number(view.getBigUint64(cursor, true));
        cursor += 8;
        return wide;
      };
      const sized = { ...entry, size: read(entry.size), compressedSize: read(entry.compressedSize) };
      const localOffset = read(entry.localOffset);
      return sized.size < 0 || sized.compressedSize < 0 || localOffset < 0 ? null : { ...sized, localOffset };
    }
    offset += 4 + size;
  }
  return null;
}

export function zipEntries(bytes: Uint8Array): ZipEntry[] | null {
  if (bytes.byteLength < END_OF_DIRECTORY_LENGTH) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = endOfDirectory(view);
  if (end < 0) return null;
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  if (count === 0xffff || offset === ZIP64_MARKER) return null;
  const decoder = new TextDecoder("utf-8");
  const entries: ZipEntry[] = [];
  for (let index = 0; index < count; index += 1) {
    if (offset + DIRECTORY_ENTRY_LENGTH > view.byteLength || view.getUint32(offset, true) !== DIRECTORY_ENTRY)
      return null;
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const nameStart = offset + DIRECTORY_ENTRY_LENGTH;
    const next = nameStart + nameLength + extraLength + commentLength;
    if (next > view.byteLength) return null;
    const entry: ZipEntry = {
      name: decoder.decode(bytes.subarray(nameStart, nameStart + nameLength)),
      encrypted: (view.getUint16(offset + 8, true) & ENCRYPTED_FLAG) !== 0,
      method: view.getUint16(offset + 10, true),
      checksum: view.getUint32(offset + 16, true),
      compressedSize: view.getUint32(offset + 20, true),
      size: view.getUint32(offset + 24, true),
      localOffset: view.getUint32(offset + 42, true),
    };
    const wide = [entry.size, entry.compressedSize, entry.localOffset].includes(ZIP64_MARKER);
    const sized = wide ? zip64Sizes(view, nameStart + nameLength, extraLength, entry) : entry;
    if (!sized) return null;
    entries.push(sized);
    offset = next;
  }
  return entries;
}

export function zipEntryData(bytes: Uint8Array, entry: ZipEntry): Uint8Array | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const local = entry.localOffset;
  if (local + LOCAL_HEADER_LENGTH > view.byteLength || view.getUint32(local, true) !== LOCAL_HEADER) return null;
  const start = local + LOCAL_HEADER_LENGTH + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
  const end = start + entry.compressedSize;
  return end <= bytes.byteLength ? bytes.subarray(start, end) : null;
}

export async function inflateZipEntry(
  data: Uint8Array,
  method: number,
  maxBytes: number,
): Promise<Uint8Array | "tooLarge" | null> {
  if (method !== ZIP_STORED && method !== ZIP_DEFLATED) return null;
  try {
    const content =
      method === ZIP_STORED ? data : new Uint8Array(await inflateRawAsync(data, { maxOutputLength: maxBytes + 1 }));
    return content.byteLength > maxBytes ? "tooLarge" : content;
  } catch (error) {
    return error instanceof RangeError ? "tooLarge" : null;
  }
}
