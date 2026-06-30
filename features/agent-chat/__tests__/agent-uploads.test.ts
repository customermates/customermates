import type { UIMessage } from "ai";

import { describe, expect, it } from "vitest";

import { extractUploadRefs, formatBytes, isVisionMime, parseUploadId, safeUploadName } from "../agent-uploads";

describe("parseUploadId", () => {
  it("extracts the id from an upload url and rejects others", () => {
    expect(parseUploadId("/api/v1/sandbox/uploads/abc-123")).toBe("abc-123");
    expect(parseUploadId("/api/v1/sandbox/artifacts/abc-123")).toBeNull();
    expect(parseUploadId("https://x/api/v1/sandbox/uploads/xyz?z=1")).toBe("xyz");
    expect(parseUploadId(undefined)).toBeNull();
  });
});

describe("extractUploadRefs", () => {
  it("collects distinct uploads from user file parts, in order", () => {
    const messages = [
      {
        role: "user",
        parts: [
          { type: "file", url: "/api/v1/sandbox/uploads/id1", filename: "a.csv", mediaType: "text/csv" },
          { type: "text", text: "hi" },
          { type: "file", url: "/api/v1/sandbox/uploads/id2", filename: "b.png", mediaType: "image/png" },
        ],
      },
      {
        // assistant file parts and duplicate ids are ignored
        role: "assistant",
        parts: [{ type: "file", url: "/api/v1/sandbox/uploads/id9", filename: "x", mediaType: "image/png" }],
      },
      {
        role: "user",
        parts: [{ type: "file", url: "/api/v1/sandbox/uploads/id1", filename: "a.csv", mediaType: "text/csv" }],
      },
    ] as unknown as UIMessage[];

    expect(extractUploadRefs(messages)).toEqual([
      { id: "id1", name: "a.csv", mediaType: "text/csv" },
      { id: "id2", name: "b.png", mediaType: "image/png" },
    ]);
  });
});

describe("isVisionMime", () => {
  it("recognizes provider-supported image/PDF types only", () => {
    expect(isVisionMime("image/png")).toBe(true);
    expect(isVisionMime("application/pdf")).toBe(true);
    expect(isVisionMime("image/svg+xml")).toBe(false); // not provider-supported
    expect(isVisionMime("text/csv")).toBe(false);
    expect(isVisionMime(undefined)).toBe(false);
  });
});

describe("safeUploadName", () => {
  it("strips paths and rejects traversal", () => {
    expect(safeUploadName("data.csv")).toBe("data.csv");
    expect(safeUploadName("../../etc/passwd")).toBe("passwd");
    expect(safeUploadName("a/b/c.txt")).toBe("c.txt");
    expect(safeUploadName("..")).toBeNull();
    expect(safeUploadName("")).toBeNull();
    expect(safeUploadName("a" + String.fromCharCode(0) + "b.csv")).toBeNull(); // NUL rejected
    expect(safeUploadName("My Report.csv")).toBe("My Report.csv"); // spaces are fine
  });
});

describe("formatBytes", () => {
  it("formats sizes", () => {
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});
