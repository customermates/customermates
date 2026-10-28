import { describe, expect, it } from "vitest";

import {
  ENTERPRISE_DEFAULT_FILE_STORAGE_BYTES_PER_USER,
  exceedsFileStorageQuota,
  fileStorageLimitBytes,
} from "../record-file-quota";
import { RecordFileQuotaService } from "../record-file-quota.service";
import { resolveFileMaxUploadBytes } from "@/core/config/environment";
import { fileSizeLabel } from "@/core/utils/format-bytes";
import { decodeRecordFileContent } from "../record-file-content";

const GIB = 1024 ** 3;

describe("file storage quota", () => {
  it("pools the plan's storage per active user in the cloud", () => {
    const limit = (plan: "starter" | "pro" | "business" | "enterprise" | null, activeUsers: number) =>
      fileStorageLimitBytes({ plan, enterpriseBytesPerUser: null, activeUsers });
    expect(limit("starter", 3)).toBe(3 * GIB);
    expect(limit("pro", 4)).toBe(20 * GIB);
    expect(limit("business", 2)).toBe(40 * GIB);
    expect(limit(null, 1)).toBe(5 * GIB);
    expect(limit("pro", 0)).toBe(5 * GIB);
  });

  it("uses the enterprise contract and falls back to 50 GB per user", () => {
    expect(
      fileStorageLimitBytes({
        plan: "enterprise",
        enterpriseBytesPerUser: 100 * GIB,
        activeUsers: 2,
      }),
    ).toBe(200 * GIB);
    expect(fileStorageLimitBytes({ plan: "enterprise", enterpriseBytesPerUser: null, activeUsers: 2 })).toBe(
      2 * ENTERPRISE_DEFAULT_FILE_STORAGE_BYTES_PER_USER,
    );
  });

  it("leaves self-hosted and demo storage unlimited", async () => {
    const sources = {
      subscription: () => Promise.resolve({ plan: "starter" as const, enterpriseFileStorageBytesPerUser: null }),
      activeUsers: () => Promise.resolve(9),
      usedBytes: () => Promise.resolve(1),
    };
    for (const appMode of ["self-hosted", "demo"] as const)
      expect(await new RecordFileQuotaService(sources, appMode).usage()).toEqual({ usedBytes: 1, limitBytes: null });
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

  it("defaults uploads to 1 GB and honors the operator's explicit byte limit", () => {
    expect(resolveFileMaxUploadBytes(undefined)).toBe(GIB);
    expect(resolveFileMaxUploadBytes("")).toBe(GIB);
    expect(resolveFileMaxUploadBytes("104857600")).toBe(100 * 1024 * 1024);
    expect(resolveFileMaxUploadBytes("2147483648")).toBe(2 * GIB);
    expect(resolveFileMaxUploadBytes("1024")).toBe(1024);
    for (const invalid of ["0", "-1", "1.5", "unlimited", "9007199254740992"])
      expect(() => resolveFileMaxUploadBytes(invalid)).toThrow("FILE_MAX_UPLOAD_BYTES");
  });
});

describe("file size labels in upload and quota messages", () => {
  it("read like the file sizes shown in the app", () => {
    expect(fileSizeLabel(443, "en")).toBe("443 B");
    expect(fileSizeLabel(0, "en")).toBe("0 B");
    expect(fileSizeLabel(1536, "de")).toBe("1,5 KB");
    expect(fileSizeLabel(3 * 1024 * 1024, "en")).toBe("3 MB");
    expect(fileSizeLabel(60 * GIB, "de")).toBe("60 GB");
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
