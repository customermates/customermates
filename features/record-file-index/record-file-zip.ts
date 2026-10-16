import { inflateRawSync } from "node:zlib";

export type RecordFileZipLimits = { maxEntries: number; maxUnpackedBytes: number };

export type RecordFileZipCheck = "ok" | "tooLarge" | "invalid";

const END_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const END_RECORD_LENGTH = 22;
const CENTRAL_HEADER_LENGTH = 46;
const LOCAL_HEADER_LENGTH = 30;
const MAX_COMMENT_LENGTH = 0xffff;
const ZIP64_EXTRA_FIELD = 0x0001;
const ZIP64_MARKER = 0xffffffff;
const STORED = 0;
const DEFLATED = 8;
const ENCRYPTED_FLAG = 0x0001;

type CentralEntry = { flags: number; method: number; compressed: number; unpacked: number; local: number };

function endRecord(view: DataView): number {
  const last = view.byteLength - END_RECORD_LENGTH;
  for (let offset = last; offset >= 0 && offset >= last - MAX_COMMENT_LENGTH; offset -= 1)
    if (view.getUint32(offset, true) === END_SIGNATURE) return offset;
  return -1;
}

function zip64Sizes(view: DataView, start: number, length: number, entry: CentralEntry): CentralEntry | null {
  let unpacked = entry.unpacked;
  let compressed = entry.compressed;
  let local = entry.local;
  for (let offset = start; offset + 4 <= start + length; ) {
    const id = view.getUint16(offset, true);
    const size = view.getUint16(offset + 2, true);
    if (offset + 4 + size > start + length) return null;
    if (id === ZIP64_EXTRA_FIELD) {
      let cursor = offset + 4;
      const read = () => {
        if (cursor + 8 > offset + 4 + size) return null;
        const value = Number(view.getBigUint64(cursor, true));
        cursor += 8;
        return value;
      };
      if (unpacked === ZIP64_MARKER) unpacked = read() ?? -1;
      if (compressed === ZIP64_MARKER) compressed = read() ?? -1;
      if (local === ZIP64_MARKER) local = read() ?? -1;
      return unpacked < 0 || compressed < 0 || local < 0 ? null : { ...entry, unpacked, compressed, local };
    }
    offset += 4 + size;
  }
  return null;
}

function centralEntry(view: DataView, offset: number): { entry: CentralEntry; next: number } | null {
  if (offset + CENTRAL_HEADER_LENGTH > view.byteLength || view.getUint32(offset, true) !== CENTRAL_SIGNATURE)
    return null;
  const nameLength = view.getUint16(offset + 28, true);
  const extraLength = view.getUint16(offset + 30, true);
  const commentLength = view.getUint16(offset + 32, true);
  const next = offset + CENTRAL_HEADER_LENGTH + nameLength + extraLength + commentLength;
  if (next > view.byteLength) return null;
  const entry = {
    flags: view.getUint16(offset + 8, true),
    method: view.getUint16(offset + 10, true),
    compressed: view.getUint32(offset + 20, true),
    unpacked: view.getUint32(offset + 24, true),
    local: view.getUint32(offset + 42, true),
  };
  if (entry.compressed !== ZIP64_MARKER && entry.unpacked !== ZIP64_MARKER && entry.local !== ZIP64_MARKER)
    return { entry, next };
  const sized = zip64Sizes(view, offset + CENTRAL_HEADER_LENGTH + nameLength, extraLength, entry);
  return sized ? { entry: sized, next } : null;
}

function entryData(bytes: Uint8Array, view: DataView, entry: CentralEntry): Uint8Array | null {
  const { local } = entry;
  if (local + LOCAL_HEADER_LENGTH > view.byteLength || view.getUint32(local, true) !== LOCAL_SIGNATURE) return null;
  const start = local + LOCAL_HEADER_LENGTH + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
  const end = start + entry.compressed;
  return end <= bytes.byteLength ? bytes.subarray(start, end) : null;
}

function unpackedSize(data: Uint8Array, method: number, budget: number): number | "tooLarge" | null {
  if (method === STORED) return data.byteLength;
  if (method !== DEFLATED) return null;
  try {
    return inflateRawSync(data, { maxOutputLength: budget + 1 }).byteLength;
  } catch (error) {
    return error instanceof RangeError ? "tooLarge" : null;
  }
}

export function checkRecordFileZip(bytes: Uint8Array, limits: RecordFileZipLimits): RecordFileZipCheck {
  if (bytes.byteLength < END_RECORD_LENGTH) return "invalid";
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = endRecord(view);
  if (end < 0) return "invalid";
  const entries = view.getUint16(end + 10, true);
  const directory = view.getUint32(end + 16, true);
  if (entries === 0xffff || directory === ZIP64_MARKER) return "tooLarge";
  if (entries > limits.maxEntries) return "tooLarge";
  let offset = directory;
  let unpacked = 0;
  for (let index = 0; index < entries; index += 1) {
    const central = centralEntry(view, offset);
    if (!central) return "invalid";
    offset = central.next;
    const { entry } = central;
    if (entry.flags & ENCRYPTED_FLAG) return "invalid";
    const data = entryData(bytes, view, entry);
    if (!data) return "invalid";
    const size = unpackedSize(data, entry.method, limits.maxUnpackedBytes - unpacked);
    if (size === null) return "invalid";
    if (size === "tooLarge") return "tooLarge";
    unpacked += size;
    if (unpacked > limits.maxUnpackedBytes) return "tooLarge";
  }
  return "ok";
}
