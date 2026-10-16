import { describe, expect, it } from "vitest";

import { docxFixture, zipFixture } from "@/tests/helpers/record-file-fixtures";

import { checkRecordFileZip } from "../record-file-zip";

const LIMITS = { maxEntries: 50, maxUnpackedBytes: 1024 * 1024 };

function centralDirectoryOffset(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getUint32(bytes.byteLength - 22 + 16, true);
}

describe("record file zip check", () => {
  it("accepts an office document whose parts unpack within the limits", () => {
    expect(checkRecordFileZip(docxFixture([{ text: "Hello" }]), LIMITS)).toBe("ok");
  });

  it("refuses a part that inflates beyond the limit, even when its header claims a small size", () => {
    const bomb = zipFixture({ "word/document.xml": new Uint8Array(2 * 1024 * 1024) });
    expect(checkRecordFileZip(bomb, LIMITS)).toBe("tooLarge");

    const lying = bomb.slice();
    new DataView(lying.buffer).setUint32(centralDirectoryOffset(lying) + 24, 10, true);
    expect(checkRecordFileZip(lying, LIMITS)).toBe("tooLarge");
  });

  it("adds up every part and refuses archives with too many parts", () => {
    const half = new Uint8Array(600 * 1024);
    expect(checkRecordFileZip(zipFixture({ "a.xml": half }), LIMITS)).toBe("ok");
    expect(checkRecordFileZip(zipFixture({ "a.xml": half, "b.xml": half }), LIMITS)).toBe("tooLarge");
    const parts = Object.fromEntries(Array.from({ length: 51 }, (_, index) => [`part-${index}.xml`, "x"]));
    expect(checkRecordFileZip(zipFixture(parts), LIMITS)).toBe("tooLarge");
  });

  it("refuses bytes that are not a readable zip archive", () => {
    expect(checkRecordFileZip(new TextEncoder().encode("not a zip archive at all"), LIMITS)).toBe("invalid");
    const truncated = zipFixture({ "a.xml": "x".repeat(5_000) });
    expect(checkRecordFileZip(truncated.slice(0, truncated.byteLength - 30), LIMITS)).toBe("invalid");
    const encrypted = zipFixture({ "a.xml": "secret" });
    new DataView(encrypted.buffer).setUint16(centralDirectoryOffset(encrypted) + 8, 1, true);
    expect(checkRecordFileZip(encrypted, LIMITS)).toBe("invalid");
  });
});
