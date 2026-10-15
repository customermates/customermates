import { describe, expect, it } from "vitest";

import { hmacSha256Hex } from "@/core/utils/hmac";
import { verifiedRecordAddress } from "@/features/records/record-address";
import {
  ADDRESS_CANDIDATE_TTL_MS,
  addressCandidateSigningSecret,
  decodeAddressCandidate,
  encodeAddressCandidate,
} from "../address-candidate-token";

const COMPANY = "00000000-0000-4000-8000-0000000000c1";
const OTHER_COMPANY = "00000000-0000-4000-8000-0000000000c2";
const SECRET = "address-candidate:v1:test-secret";
const NOW = new Date("2026-10-15T08:00:00.000Z");

const ADDRESS = verifiedRecordAddress(
  {
    street: "Hauptstraße 5",
    line2: "3. OG",
    postalCode: "68259",
    city: "Mannheim",
    region: "Baden-Württemberg",
    countryCode: "de",
  },
  { provider: "photon", checkedAt: "2026-10-15T07:59:00.000Z", location: { lat: 49.4857901, lon: 8.5370071 } },
);

function token() {
  const encoded = encodeAddressCandidate(ADDRESS, COMPANY, SECRET, NOW);
  if (!encoded) throw new Error("expected a token");
  return encoded;
}

describe("address candidate tokens", () => {
  it("derive a purpose-bound key from the auth secret", () => {
    expect(addressCandidateSigningSecret(" secret ")).toBe("address-candidate:v1:secret");
    expect(addressCandidateSigningSecret("  ")).toBeNull();
    expect(addressCandidateSigningSecret(undefined)).toBeNull();
  });

  it("round-trip the verified address for the same workspace", () => {
    expect(decodeAddressCandidate(token(), COMPANY, SECRET, NOW)).toEqual(ADDRESS);
    expect(
      decodeAddressCandidate(token(), COMPANY, SECRET, new Date(NOW.getTime() + ADDRESS_CANDIDATE_TTL_MS - 1)),
    ).toEqual(ADDRESS);
  });

  it("refuse another workspace, another secret and an expired token", () => {
    expect(decodeAddressCandidate(token(), OTHER_COMPANY, SECRET, NOW)).toBeNull();
    expect(decodeAddressCandidate(token(), COMPANY, "address-candidate:v1:other", NOW)).toBeNull();
    expect(
      decodeAddressCandidate(token(), COMPANY, SECRET, new Date(NOW.getTime() + ADDRESS_CANDIDATE_TTL_MS)),
    ).toBeNull();
  });

  it("refuse a changed address, a forged signature and malformed tokens", () => {
    const [payload, signature] = token().split(".");
    const changed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    changed.address.street = "Hauptstraße 7";
    const changedPayload = Buffer.from(JSON.stringify(changed)).toString("base64url");
    expect(decodeAddressCandidate(`${changedPayload}.${signature}`, COMPANY, SECRET, NOW)).toBeNull();
    expect(decodeAddressCandidate(`${payload}.${"0".repeat(64)}`, COMPANY, SECRET, NOW)).toBeNull();
    for (const malformed of ["", "abc", `${payload}.${signature}.x`, `${payload}.XYZ`, "x".repeat(5_000)])
      expect(decodeAddressCandidate(malformed, COMPANY, SECRET, NOW)).toBeNull();
  });

  it("refuse a signed payload whose expiry exceeds the lifetime or that is not an address", () => {
    const sign = (value: unknown) => {
      const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
      return `${payload}.${hmacSha256Hex(SECRET, `${COMPANY}.${payload}`)}`;
    };
    const [payload] = token().split(".");
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    expect(decodeAddressCandidate(sign(decoded), COMPANY, SECRET, NOW)).toEqual(ADDRESS);
    expect(
      decodeAddressCandidate(
        sign({ ...decoded, expiresAt: NOW.getTime() + 2 * ADDRESS_CANDIDATE_TTL_MS }),
        COMPANY,
        SECRET,
        NOW,
      ),
    ).toBeNull();
    expect(
      decodeAddressCandidate(sign({ expiresAt: decoded.expiresAt, address: { street: 5 } }), COMPANY, SECRET, NOW),
    ).toBeNull();
  });

  it("only sign verified addresses", () => {
    expect(
      encodeAddressCandidate(
        { ...ADDRESS, verification: { status: "unverified", provider: null, checkedAt: null } },
        COMPANY,
        SECRET,
        NOW,
      ),
    ).toBeNull();
  });
});
