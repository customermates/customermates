import { describe, expect, it } from "vitest";

import {
  ENTERPRISE_DEFAULT_FILE_STORAGE_BYTES_PER_USER,
  exceedsFileStorageQuota,
  fileStorageLimitBytes,
} from "../record-file-quota";
import { RecordFileQuotaService } from "../record-file-quota.service";
import { recordFileMaxUploadBytes } from "../record-file-limits";
import { storageSizeLabel } from "../storage-size";
import { decodeRecordFileContent } from "../record-file-content";

const GIB = 1024 ** 3;

describe("file storage quota", () => {
  it("pools the plan's storage per active user in the cloud", () => {
    const limit = (plan: "starter" | "pro" | "business" | "enterprise" | null, activeUsers: number) =>
      fileStorageLimitBytes({ appMode: "cloud", plan, enterpriseBytesPerUser: null, activeUsers });
    expect(limit("starter", 3)).toBe(3 * GIB);
    expect(limit("pro", 4)).toBe(20 * GIB);
    expect(limit("business", 2)).toBe(40 * GIB);
    expect(limit(null, 1)).toBe(5 * GIB);
    expect(limit("pro", 0)).toBe(5 * GIB);
  });

  it("uses the enterprise contract and falls back to 50 GB per user", () => {
    expect(
      fileStorageLimitBytes({
        appMode: "cloud",
        plan: "enterprise",
        enterpriseBytesPerUser: 100 * GIB,
        activeUsers: 2,
      }),
    ).toBe(200 * GIB);
    expect(
      fileStorageLimitBytes({ appMode: "cloud", plan: "enterprise", enterpriseBytesPerUser: null, activeUsers: 2 }),
    ).toBe(2 * ENTERPRISE_DEFAULT_FILE_STORAGE_BYTES_PER_USER);
  });

  it("leaves self-hosted and demo storage unlimited", () => {
    for (const appMode of ["self-hosted", "demo"] as const) {
      expect(fileStorageLimitBytes({ appMode, plan: "starter", enterpriseBytesPerUser: null, activeUsers: 9 })).toBe(
        null,
      );
    }
  });

  it("refuses only what goes past the limit", () => {
    expect(exceedsFileStorageQuota(900, 100, 1000)).toBe(false);
    expect(exceedsFileStorageQuota(900, 101, 1000)).toBe(true);
    expect(exceedsFileStorageQuota(5000, 1, 1000)).toBe(true);
    expect(exceedsFileStorageQuota(10 ** 15, 10 ** 12, null)).toBe(false);
  });

  it("reports usage with the limit only where a plan applies", async () => {
    const sources = {
      subscription: () => Promise.resolve({ plan: "business" as const, enterpriseFileStorageBytesPerUser: null }),
      activeUsers: () => Promise.resolve(3),
      usedBytes: () => Promise.resolve(1234),
    };
    expect(await new RecordFileQuotaService(sources, "cloud").usage()).toEqual({
      usedBytes: 1234,
      limitBytes: 60 * GIB,
    });
    expect(await new RecordFileQuotaService(sources, "self-hosted").usage()).toEqual({
      usedBytes: 1234,
      limitBytes: null,
    });
  });

  it("caps cloud uploads at 25 MB and keeps the self-hosted setting", () => {
    expect(recordFileMaxUploadBytes("cloud", 100 * 1024 * 1024)).toBe(25 * 1024 * 1024);
    expect(recordFileMaxUploadBytes("cloud", 1024)).toBe(1024);
    expect(recordFileMaxUploadBytes("self-hosted", 100 * 1024 * 1024)).toBe(100 * 1024 * 1024);
  });
});

describe("storage size labels", () => {
  const label = (bytes: number, locale: string) => storageSizeLabel(bytes, locale).replace(/\s/gu, " ");

  it("labels sizes in binary units with one decimal in the reader's locale", () => {
    expect(label(0, "en")).toBe("0 byte");
    expect(label(1023, "en")).toBe("1,023 byte");
    expect(label(1536, "en")).toBe("1.5 kB");
    expect(label(25 * 1024 * 1024, "en")).toBe("25 MB");
    expect(label(1.2 * GIB, "de")).toBe("1,2 GB");
    expect(label(20 * GIB, "de")).toBe("20 GB");
    expect(label(250 * GIB, "en")).toBe("250 GB");
    expect(label(1.5 * GIB, "fr")).toBe("1,5 Go");
  });
});

describe("base64 file content", () => {
  it("decodes standard, URL-safe, unpadded and data URL content", () => {
    const hello = new TextEncoder().encode("hello?>");
    expect(decodeRecordFileContent(Buffer.from(hello).toString("base64"))).toEqual(hello);
    expect(decodeRecordFileContent(Buffer.from(hello).toString("base64url"))).toEqual(hello);
    expect(decodeRecordFileContent("aGVsbG8/Pg")).toEqual(hello);
    expect(decodeRecordFileContent(`data:text/plain;base64,${Buffer.from(hello).toString("base64")}`)).toEqual(hello);
    expect(decodeRecordFileContent("aGVs\nbG8/Pg==")).toEqual(hello);
    expect(decodeRecordFileContent("")).toEqual(new Uint8Array(0));
  });

  it("refuses text that is not base64", () => {
    for (const invalid of ["not base64!", "a", "aGVsbG8=x", "aGVsbG8===", "%%%%"])
      expect(decodeRecordFileContent(invalid), invalid).toBeNull();
  });
});
