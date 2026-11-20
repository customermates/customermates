import { describe, expect, it } from "vitest";

import {
  SIGNED_ID_TOKEN_PATTERN,
  idOfSignedToken,
  signedIdToken,
  signedTokenValid,
  unverifiedIdOfSignedToken,
} from "../signed-id";

const ID = "6f1c2a3b-4d5e-4f60-8a91-2b3c4d5e6f70";
const SECRET = "test-secret-0123456789abcdef";
const PURPOSE = "test-purpose";

describe("signed id token", () => {
  it("round-trips the id through a 64 character token", () => {
    const token = signedIdToken(PURPOSE, ID, SECRET);

    expect(token).toMatch(SIGNED_ID_TOKEN_PATTERN);
    expect(idOfSignedToken(PURPOSE, token, SECRET)).toBe(ID);
    expect(unverifiedIdOfSignedToken(token)).toBe(ID);
  });

  it("is bound to the purpose, the secret and the id", () => {
    const token = signedIdToken(PURPOSE, ID, SECRET);
    const other = signedIdToken(PURPOSE, "00000000-0000-4000-8000-0000000000f2", SECRET);

    expect(idOfSignedToken("another-purpose", token, SECRET)).toBeNull();
    expect(idOfSignedToken(PURPOSE, token, "another-secret-0123456789")).toBeNull();
    expect(idOfSignedToken(PURPOSE, `${other.slice(0, 32)}${token.slice(32)}`, SECRET)).toBeNull();
  });

  it("refuses a changed signature and malformed input", () => {
    const token = signedIdToken(PURPOSE, ID, SECRET);
    const flipped = `${token.slice(0, 63)}${token[63] === "0" ? "1" : "0"}`;

    expect(idOfSignedToken(PURPOSE, flipped, SECRET)).toBeNull();
    for (const bad of ["", token.slice(0, 63), `${token}0`, token.toUpperCase(), "../etc/passwd"])
      expect(idOfSignedToken(PURPOSE, bad, SECRET)).toBeNull();
  });

  it("lowercases the id it signs", () => {
    expect(signedIdToken(PURPOSE, ID.toUpperCase(), SECRET)).toBe(signedIdToken(PURPOSE, ID, SECRET));
  });

  it("binds a salt such as a version, so rotating it invalidates the token", () => {
    const token = signedIdToken(PURPOSE, ID, SECRET, 1);

    expect(signedTokenValid(PURPOSE, token, ID, SECRET, 1)).toBe(true);
    expect(signedTokenValid(PURPOSE, token, ID, SECRET, 2)).toBe(false);
    expect(signedTokenValid(PURPOSE, token, ID, SECRET)).toBe(false);
    expect(token).not.toBe(signedIdToken(PURPOSE, ID, SECRET));
  });

  it("needs a server secret", () => {
    expect(() => signedIdToken(PURPOSE, ID, undefined)).toThrow("BETTER_AUTH_SECRET");
    expect(() => signedIdToken(PURPOSE, ID, "  ")).toThrow("BETTER_AUTH_SECRET");
  });
});
