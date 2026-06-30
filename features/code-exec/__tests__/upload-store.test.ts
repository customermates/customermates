import { afterEach, describe, expect, it, vi } from "vitest";

import { companyUsage, deleteUpload, getUpload, guessMime, putUpload } from "../upload-store";

afterEach(() => {
  vi.useRealTimers();
});

function put(companyId: string, name = "data.csv") {
  return putUpload({ bytes: Buffer.from("a,b\n1,2\n"), mime: "text/csv", name, companyId, userId: "u1" });
}

describe("upload-store tenant scoping", () => {
  it("returns an upload only to its own company", () => {
    const id = put("company-A");
    expect(getUpload(id, "company-A")?.name).toBe("data.csv");
    expect(getUpload(id, "company-B")).toBeNull(); // cross-tenant read denied
  });

  it("returns null for an unknown id", () => {
    expect(getUpload("does-not-exist", "company-A")).toBeNull();
  });

  it("reports count and aggregate bytes for a company only", () => {
    const company = `count-${crypto.randomUUID()}`;
    expect(companyUsage(company)).toEqual({ count: 0, bytes: 0 });
    put(company);
    put(company);
    const usage = companyUsage(company);
    expect(usage.count).toBe(2);
    expect(usage.bytes).toBe(16); // two 8-byte CSVs
    expect(companyUsage(`other-${crypto.randomUUID()}`)).toEqual({ count: 0, bytes: 0 });
  });

  it("deleteUpload removes only the owner's upload", () => {
    const id = put("company-del");
    deleteUpload(id, "other-co"); // wrong tenant — no-op
    expect(getUpload(id, "company-del")).not.toBeNull();
    deleteUpload(id, "company-del");
    expect(getUpload(id, "company-del")).toBeNull();
  });
});

describe("upload-store expiry", () => {
  it("expires an upload after its TTL", () => {
    vi.useFakeTimers();
    const id = put("company-ttl");
    expect(getUpload(id, "company-ttl")).not.toBeNull();
    vi.advanceTimersByTime(25 * 60 * 60 * 1000); // 25h > 24h TTL
    expect(getUpload(id, "company-ttl")).toBeNull();
  });
});

describe("guessMime", () => {
  it("maps known extensions and defaults to octet-stream", () => {
    expect(guessMime("a.csv")).toBe("text/csv");
    expect(guessMime("chart.png")).toBe("image/png");
    expect(guessMime("report.pdf")).toBe("application/pdf");
    expect(guessMime("mystery.bin")).toBe("application/octet-stream");
  });
});
