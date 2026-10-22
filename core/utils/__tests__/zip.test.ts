import { describe, expect, it } from "vitest";

import { zipArchive } from "@/tests/helpers/record-file-fixtures";

import { crc32, inflateZipEntry, zipEntries, zipEntryData } from "../zip";

const text = (value: string) => new TextEncoder().encode(value);

describe("zip archives", () => {
  it("computes the standard CRC-32", () => {
    expect(crc32(text("123456789"))).toBe(0xcbf43926);
  });

  it("lists every entry with its sizes and reads stored and deflated data", async () => {
    const archive = zipArchive([
      { name: "a.txt", data: text("Hello") },
      { name: "b.txt", data: text("Stored"), stored: true },
    ]);
    const entries = zipEntries(archive);
    expect(entries?.map(({ name, size, encrypted }) => ({ name, size, encrypted }))).toEqual([
      { name: "a.txt", size: 5, encrypted: false },
      { name: "b.txt", size: 6, encrypted: false },
    ]);
    const contents = await Promise.all(
      (entries ?? []).map(async (entry) => {
        const data = zipEntryData(archive, entry);
        const content = data ? await inflateZipEntry(data, entry.method, 100) : null;
        return content instanceof Uint8Array ? new TextDecoder().decode(content) : content;
      }),
    );
    expect(contents).toEqual(["Hello", "Stored"]);
  });

  it("stops inflating at the byte budget and refuses what is not a zip archive", async () => {
    const archive = zipArchive([{ name: "big.xml", data: new Uint8Array(10_000) }]);
    const [entry] = zipEntries(archive) ?? [];
    const data = zipEntryData(archive, entry);
    expect(data && (await inflateZipEntry(data, entry.method, 9_999))).toBe("tooLarge");
    expect(data && (await inflateZipEntry(data, entry.method, 10_000))).toBeInstanceOf(Uint8Array);
    expect(zipEntries(text("not a zip archive at all"))).toBeNull();
    expect(zipEntries(archive.slice(0, archive.byteLength - 30))).toBeNull();
  });
});
