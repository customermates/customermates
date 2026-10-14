import { describe, expect, it } from "vitest";

import { decodeRoutineRunCursor, encodeRoutineRunCursor } from "../routine-run-cursor";

function rawCursor(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

describe("routine run cursor", () => {
  it("round-trips the position of the last run on a page", () => {
    const position = { createdAt: new Date("2026-10-01T08:30:00.000Z"), id: "run-7" };

    expect(decodeRoutineRunCursor(encodeRoutineRunCursor(position))).toEqual({ valid: true, cursor: position });
  });

  it("keeps the opaque base64url format of the public cursor", () => {
    const cursor = encodeRoutineRunCursor({ createdAt: new Date("2026-10-01T08:30:00.000Z"), id: "run-7" });

    expect(cursor).toBe(rawCursor({ createdAt: "2026-10-01T08:30:00.000Z", id: "run-7" }));
  });

  it.each([null, undefined, ""])("reads %j as the first page", (cursor) => {
    expect(decodeRoutineRunCursor(cursor)).toEqual({ valid: true, cursor: null });
  });

  it.each([
    ["text that is not base64 JSON", "bad"],
    ["JSON that is not an object", rawCursor(42)],
    ["a null payload", rawCursor(null)],
    ["a missing id", rawCursor({ createdAt: "2026-10-01T08:30:00.000Z" })],
    ["an empty id", rawCursor({ createdAt: "2026-10-01T08:30:00.000Z", id: "" })],
    ["a numeric id", rawCursor({ createdAt: "2026-10-01T08:30:00.000Z", id: 7 })],
    ["a missing date", rawCursor({ id: "run-7" })],
    ["an unparseable date", rawCursor({ createdAt: "yesterday-ish", id: "run-7" })],
  ])("rejects %s", (_label, cursor) => {
    expect(decodeRoutineRunCursor(cursor)).toEqual({ valid: false });
  });
});
