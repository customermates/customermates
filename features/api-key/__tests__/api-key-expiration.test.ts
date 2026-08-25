import { describe, expect, it } from "vitest";

import {
  API_KEY_MAX_EXPIRATION_SECONDS,
  API_KEY_MIN_EXPIRATION_SECONDS,
  getApiKeyExpirationSeconds,
  isApiKeyExpirationDateAllowed,
} from "../api-key-expiration";

describe("API key calendar expiration", () => {
  const today = new Date(2026, 7, 25, 23, 59, 59);

  it("converts local calendar days to exact whole-day seconds", () => {
    expect(getApiKeyExpirationSeconds(new Date(2026, 7, 26), today)).toBe(API_KEY_MIN_EXPIRATION_SECONDS);
    expect(getApiKeyExpirationSeconds(new Date(2027, 7, 25), today)).toBe(API_KEY_MAX_EXPIRATION_SECONDS);
  });

  it("uses undefined only when no expiration date was selected", () => {
    expect(getApiKeyExpirationSeconds(null, today)).toBeUndefined();
    expect(getApiKeyExpirationSeconds(new Date(2026, 7, 25), today)).toBe(0);
    expect(getApiKeyExpirationSeconds(new Date(2026, 7, 24), today)).toBe(-API_KEY_MIN_EXPIRATION_SECONDS);
  });

  it("allows calendar selections from one through 365 days", () => {
    expect(isApiKeyExpirationDateAllowed(new Date(2026, 7, 25), today)).toBe(false);
    expect(isApiKeyExpirationDateAllowed(new Date(2026, 7, 26), today)).toBe(true);
    expect(isApiKeyExpirationDateAllowed(new Date(2027, 7, 25), today)).toBe(true);
    expect(isApiKeyExpirationDateAllowed(new Date(2027, 7, 26), today)).toBe(false);
  });
});
