import { describe, expect, it } from "vitest";

import { PUBLIC_FILL_MS, looksAutomated, renderToken, renderTokenAgeMs, visitorHash } from "../public-submit-guard";

const ID = "00000000-0000-4000-8000-0000000000f1";
const SECRET = "token-test-secret";
const issued = new Date("2026-11-13T10:00:00.000Z");

describe("render token", () => {
  it("reports how long ago the page was rendered", () => {
    const token = renderToken(ID, issued, SECRET);

    expect(renderTokenAgeMs(token, ID, new Date(issued.getTime() + 7_500), SECRET)).toBe(7_500);
  });

  it("is bound to the page and the secret", () => {
    const token = renderToken(ID, issued, SECRET);
    const later = new Date(issued.getTime() + 10_000);

    expect(renderTokenAgeMs(token, "00000000-0000-4000-8000-0000000000f2", later, SECRET)).toBeNull();
    expect(renderTokenAgeMs(token, ID, later, "another-secret")).toBeNull();
  });

  it("rejects a forged timestamp and malformed tokens", () => {
    const token = renderToken(ID, issued, SECRET);
    const signature = token.split(".")[1];

    expect(renderTokenAgeMs(`1.${signature}`, ID, issued, SECRET)).toBeNull();
    expect(renderTokenAgeMs(`${issued.getTime() - 1000}.${signature}`, ID, issued, SECRET)).toBeNull();
    expect(renderTokenAgeMs("garbage", ID, issued, SECRET)).toBeNull();
    expect(renderTokenAgeMs(`${token}.extra`, ID, issued, SECRET)).toBeNull();
  });
});

describe("looksAutomated", () => {
  const token = renderToken(ID, issued, SECRET);
  const check = (overrides: Partial<Parameters<typeof looksAutomated>[0]> = {}, afterMs = 10_000) =>
    looksAutomated({
      honeypot: "",
      renderToken: token,
      subjectId: ID,
      now: new Date(issued.getTime() + afterMs),
      authSecret: SECRET,
      ...overrides,
    });

  it("lets a person fill the page between two seconds and a day", () => {
    expect(PUBLIC_FILL_MS.min).toBe(2_000);
    expect(PUBLIC_FILL_MS.max).toBe(24 * 60 * 60 * 1_000);
    expect(check()).toBe(false);
    expect(check({}, PUBLIC_FILL_MS.min)).toBe(false);
    expect(check({}, PUBLIC_FILL_MS.max)).toBe(false);
  });

  it("flags a submission that is too fast, too old or without a valid token", () => {
    expect(check({}, PUBLIC_FILL_MS.min - 1)).toBe(true);
    expect(check({}, PUBLIC_FILL_MS.max + 1)).toBe(true);
    expect(check({ renderToken: "" })).toBe(true);
    expect(check({ subjectId: "00000000-0000-4000-8000-0000000000f2" })).toBe(true);
  });

  it("flags a filled honeypot, also one with only blanks", () => {
    expect(check({ honeypot: "http://spam.example" })).toBe(true);
    expect(check({ honeypot: "  " })).toBe(true);
  });
});

describe("visitor hash", () => {
  it("hashes an address with the secret and keeps it stable", () => {
    const first = visitorHash("203.0.113.9", SECRET);

    expect(first).toMatch(/^[0-9a-f]{32}$/u);
    expect(visitorHash("203.0.113.9", SECRET)).toBe(first);
    expect(visitorHash("203.0.113.9", "another-secret")).not.toBe(first);
    expect(first).not.toContain("203");
  });

  it("returns null without an address", () => {
    expect(visitorHash(null, SECRET)).toBeNull();
    expect(visitorHash("", SECRET)).toBeNull();
  });
});
