import { describe, expect, it } from "vitest";

import {
  RECORD_FILE_LINK_SECONDS,
  recordFileGrantSecret,
  signRecordFileGrant,
  verifyRecordFileGrant,
} from "../record-file-grant";

const FILE = "6f3c2b1a-9d8e-4c7b-a6f5-e4d3c2b1a0f9";
const OTHER_FILE = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const USER = "11111111-2222-4333-8444-555555555555";
const SECRET = "record-file-grant:v1:vitest-secret";

describe("record file grants", () => {
  it("derives a purpose-bound secret and needs a configured one", () => {
    expect(recordFileGrantSecret(" vitest-secret ")).toBe(SECRET);
    expect(recordFileGrantSecret(undefined)).toBeNull();
    expect(recordFileGrantSecret("   ")).toBeNull();
  });

  it("grants the signed file to the signed user until the link expires after 15 minutes", () => {
    const issuedAt = new Date("2026-10-15T10:00:00.000Z");
    const token = signRecordFileGrant(
      SECRET,
      "download",
      FILE,
      USER,
      new Date(issuedAt.getTime() + RECORD_FILE_LINK_SECONDS * 1000),
    );
    expect(token).toMatch(/^\d+\.[0-9a-f-]{36}\.[0-9a-f]{64}$/);
    expect(verifyRecordFileGrant(SECRET, "download", FILE, token, issuedAt)).toEqual({
      status: "valid",
      userId: USER,
    });
    expect(verifyRecordFileGrant(SECRET, "download", FILE, token, new Date("2026-10-15T10:14:59.000Z"))).toEqual({
      status: "valid",
      userId: USER,
    });
    expect(verifyRecordFileGrant(SECRET, "download", FILE, token, new Date("2026-10-15T10:15:00.000Z"))).toEqual({
      status: "expired",
    });
  });

  it("refuses another purpose, file, secret, user or expiry and malformed tokens", () => {
    const now = new Date("2026-10-15T10:00:00.000Z");
    const token = signRecordFileGrant(SECRET, "download", FILE, USER, new Date("2026-10-15T10:15:00.000Z"));
    const [expiresAt, , signature] = token.split(".");
    expect(verifyRecordFileGrant(SECRET, "upload", FILE, token, now)).toEqual({ status: "invalid" });
    expect(verifyRecordFileGrant(SECRET, "download", OTHER_FILE, token, now)).toEqual({ status: "invalid" });
    expect(verifyRecordFileGrant("record-file-grant:v1:other", "download", FILE, token, now)).toEqual({
      status: "invalid",
    });
    expect(verifyRecordFileGrant(SECRET, "download", FILE, `${expiresAt}.${OTHER_FILE}.${signature}`, now)).toEqual({
      status: "invalid",
    });
    expect(
      verifyRecordFileGrant(SECRET, "download", FILE, `${Number(expiresAt) + 3600}.${USER}.${signature}`, now),
    ).toEqual({ status: "invalid" });
    for (const malformed of ["", "abc", `${expiresAt}.${USER}`, `${token}.extra`, token.toUpperCase()])
      expect(verifyRecordFileGrant(SECRET, "download", FILE, malformed, now)).toEqual({ status: "invalid" });
  });
});
