import { describe, expect, it } from "vitest";

import { crc32, isPostalCodeDataError, readZipEntry } from "../postal-code-zip";
import { zipFixture } from "./zip-fixture";

describe("postal code archives", () => {
  it("reads deflated and stored entries by name", () => {
    const archive = zipFixture([
      { name: "readme.txt", content: "GeoNames" },
      { name: "DE.txt", content: "DE\t68259\tMannheim" },
      { name: "plain.txt", content: "stored", stored: true },
    ]);
    expect(readZipEntry(archive, "DE.txt", 1_000).toString("utf8")).toBe("DE\t68259\tMannheim");
    expect(readZipEntry(archive, "plain.txt", 1_000).toString("utf8")).toBe("stored");
  });

  it("computes the standard CRC-32", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("refuses a damaged checksum, a missing entry, an oversized entry and a cut-off archive", () => {
    const damaged = zipFixture([{ name: "DE.txt", content: "DE\t68259", checksum: 12345 }]);
    const archive = zipFixture([{ name: "DE.txt", content: "DE\t68259\tMannheim" }]);
    const failures = [
      () => readZipEntry(damaged, "DE.txt", 1_000),
      () => readZipEntry(archive, "AT.txt", 1_000),
      () => readZipEntry(archive, "DE.txt", 5),
      () => readZipEntry(archive.subarray(0, 40), "DE.txt", 1_000),
      () => readZipEntry(Buffer.from("not a zip archive at all, sorry"), "DE.txt", 1_000),
    ];
    for (const failure of failures) {
      let error: unknown;
      try {
        failure();
      } catch (caught) {
        error = caught;
      }
      expect(isPostalCodeDataError(error), String(error)).toBe(true);
    }
  });
});
