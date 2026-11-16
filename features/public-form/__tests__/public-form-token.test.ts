import { describe, expect, it } from "vitest";

import { SIGNED_ID_TOKEN_PATTERN } from "@/core/utils/signed-id";

import { publicFormEmbedSnippet, publicFormIdFromToken, publicFormToken, publicFormUrl } from "../public-form-token";

const ID = "00000000-0000-4000-8000-0000000000f1";
const SECRET = "token-test-secret";

describe("public form token", () => {
  it("round-trips a form id through a 64 character signed token", () => {
    const token = publicFormToken(ID, SECRET);

    expect(token).toMatch(SIGNED_ID_TOKEN_PATTERN);
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
