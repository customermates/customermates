import { describe, expect, it } from "vitest";

import { publicLinkIdFromToken, publicLinkToken } from "../public-link-token";

const SECRET = "test-secret-0123456789abcdef";
const LINK_ID = "6f1c2a3b-4d5e-4f60-8a91-2b3c4d5e6f70";

describe("public link tokens", () => {
  it("round-trips the link id and hides nothing else in the token", () => {
    const token = publicLinkToken(LINK_ID, SECRET);
    expect(token).toMatch(/^[0-9a-f]{64}$/u);
    expect(publicLinkIdFromToken(token, SECRET)).toBe(LINK_ID);
  });

  it("refuses a changed signature, a changed id, another server's secret and malformed input", () => {
    const token = publicLinkToken(LINK_ID, SECRET);
    const flip = (index: number) =>
      `${token.slice(0, index)}${token[index] === "0" ? "1" : "0"}${token.slice(index + 1)}`;
    expect(publicLinkIdFromToken(flip(63), SECRET)).toBeNull();
    expect(publicLinkIdFromToken(flip(0), SECRET)).toBeNull();
    expect(publicLinkIdFromToken(token, "another-secret-0123456789")).toBeNull();
    for (const bad of ["", token.slice(0, 63), `${token}0`, token.toUpperCase(), "../etc/passwd"])
      expect(publicLinkIdFromToken(bad, SECRET)).toBeNull();
  });

  it("needs a server secret", () => {
    expect(() => publicLinkToken(LINK_ID, " ")).toThrow("BETTER_AUTH_SECRET");
  });
});
