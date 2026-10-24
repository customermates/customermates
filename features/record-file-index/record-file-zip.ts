import { inflateZipEntry, zipEntries, zipEntryData } from "@/core/utils/zip";

export type RecordFileZipLimits = { maxEntries: number; maxUnpackedBytes: number };

export type RecordFileZipCheck = "ok" | "tooLarge" | "invalid";

export async function checkRecordFileZip(bytes: Uint8Array, limits: RecordFileZipLimits): Promise<RecordFileZipCheck> {
  const entries = zipEntries(bytes);
  if (!entries) return "invalid";
  if (entries.length > limits.maxEntries) return "tooLarge";
  let unpacked = 0;
  for (const entry of entries) {
    if (entry.encrypted) return "invalid";
    const data = zipEntryData(bytes, entry);
    if (!data) return "invalid";
    const content = await inflateZipEntry(data, entry.method, limits.maxUnpackedBytes - unpacked);
    if (content === null) return "invalid";
    if (content === "tooLarge") return "tooLarge";
    unpacked += content.byteLength;
  }
  return "ok";
}
