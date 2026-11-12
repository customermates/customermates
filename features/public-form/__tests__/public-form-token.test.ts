import { describe, expect, it } from "vitest";

import { PUBLIC_FORM_LIMITS } from "../public-form-limits";
import { renderToken, renderTokenAgeMs, visitorHash } from "../public-form-render-token";
import {
  PUBLIC_FORM_TOKEN_PATTERN,
  publicFormEmbedSnippet,
  publicFormIdFromToken,
  publicFormToken,
  publicFormUrl,
} from "../public-form-token";

const ID = "00000000-0000-4000-8000-0000000000f1";
const SECRET = "token-test-secret";

describe("public form token", () => {
  it("round-trips a form id through a 64 character signed token", () => {
    const token = publicFormToken(ID, SECRET);

    expect(token).toMatch(PUBLIC_FORM_TOKEN_PATTERN);
    expect(publicFormIdFromToken(token, SECRET)).toBe(ID);
  });

  it("rejects a token signed with another secret, a changed id or a malformed value", () => {
    const token = publicFormToken(ID, SECRET);
    const otherId = publicFormToken("00000000-0000-4000-8000-0000000000f2", SECRET);

    expect(publicFormIdFromToken(token, "another-secret")).toBeNull();
    expect(publicFormIdFromToken(`${otherId.slice(0, 32)}${token.slice(32)}`, SECRET)).toBeNull();
    expect(publicFormIdFromToken(token.slice(0, 63), SECRET)).toBeNull();
    expect(publicFormIdFromToken(token.toUpperCase(), SECRET)).toBeNull();
  });

  it("refuses to sign without a secret", () => {
    expect(() => publicFormToken(ID, undefined)).toThrow();
    expect(() => publicFormToken(ID, "   ")).toThrow();
  });

  it("builds the public url with and without a fixed language", () => {
    const token = publicFormToken(ID, SECRET);

    expect(publicFormUrl("https://app.example.com/", ID, SECRET, null)).toBe(`https://app.example.com/f/${token}`);
    expect(publicFormUrl("https://app.example.com", ID, SECRET, "de")).toBe(`https://app.example.com/de/f/${token}`);
  });

  it("escapes the title in the iframe embed snippet", () => {
    const snippet = publicFormEmbedSnippet("https://app.example.com/f/abc", 'Say "hi" <b>');

    expect(snippet).toContain('src="https://app.example.com/f/abc?embed=1"');
    expect(snippet).toContain('title="Say &quot;hi&quot; &lt;b>"');
    expect(snippet).toContain("<iframe");
    expect(publicFormEmbedSnippet("https://app.example.com/f/abc?x=1", "T")).toContain("?x=1&embed=1");
  });
});

describe("form render token", () => {
  const issued = new Date("2026-11-13T10:00:00.000Z");

  it("reports how long ago the page was rendered", () => {
    const token = renderToken(ID, issued, SECRET);

    expect(renderTokenAgeMs(token, ID, new Date(issued.getTime() + 7_500), SECRET)).toBe(7_500);
  });

  it("is bound to the form and the secret", () => {
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

  it("allows a person to fill the form between two seconds and a week", () => {
    expect(PUBLIC_FORM_LIMITS.minFillMs).toBe(2_000);
    expect(PUBLIC_FORM_LIMITS.maxFillMs).toBeGreaterThanOrEqual(24 * 60 * 60 * 1_000);
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
