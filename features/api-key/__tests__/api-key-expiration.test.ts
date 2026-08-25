import { describe, expect, it } from "vitest";

import {
  API_KEY_MIN_EXPIRATION_SECONDS,
  API_KEY_TECHNICAL_MAX_EXPIRATION_DAYS,
  API_KEY_TECHNICAL_MAX_EXPIRATION_SECONDS,
  getApiKeyExpirationSeconds,
  getApiKeyMaximumExpirationDate,
  isApiKeyExpirationDateAllowed,
} from "../api-key-expiration";

describe("API key calendar expiration", () => {
  const today = new Date(2026, 7, 25, 23, 59, 59);

  it("converts local calendar days to exact whole-day seconds", () => {
    expect(getApiKeyExpirationSeconds(new Date(2026, 7, 26), today)).toBe(API_KEY_MIN_EXPIRATION_SECONDS);
    expect(getApiKeyExpirationSeconds(new Date(2027, 7, 25), today)).toBe(365 * 24 * 60 * 60);
  });

  it.each([
    [new Date(2026, 2, 29, 23, 59), new Date(2026, 2, 30)],
    [new Date(2026, 9, 25, 23, 59), new Date(2026, 9, 26)],
  ])("keeps one calendar day exact across a DST boundary near %s", (current, selected) => {
    expect(getApiKeyExpirationSeconds(selected, current)).toBe(API_KEY_MIN_EXPIRATION_SECONDS);
  });

  it("uses undefined only when no expiration date was selected", () => {
    expect(getApiKeyExpirationSeconds(null, today)).toBeUndefined();
    expect(getApiKeyExpirationSeconds(new Date(2026, 7, 25), today)).toBe(0);
    expect(getApiKeyExpirationSeconds(new Date(2026, 7, 24), today)).toBe(-API_KEY_MIN_EXPIRATION_SECONDS);
  });

  it("allows every practical future date through the technical ceiling", () => {
    const lastSupportedDate = getApiKeyMaximumExpirationDate(today);
    const firstUnsupportedDate = new Date(2026, 7, 26 + API_KEY_TECHNICAL_MAX_EXPIRATION_DAYS);

    expect(isApiKeyExpirationDateAllowed(new Date(2026, 7, 25), today)).toBe(false);
    expect(isApiKeyExpirationDateAllowed(new Date(2026, 7, 26), today)).toBe(true);
    expect(isApiKeyExpirationDateAllowed(new Date(2027, 7, 25), today)).toBe(true);
    expect(getApiKeyExpirationSeconds(lastSupportedDate, today)).toBe(API_KEY_TECHNICAL_MAX_EXPIRATION_SECONDS);
    expect(isApiKeyExpirationDateAllowed(lastSupportedDate, today)).toBe(true);
    expect(isApiKeyExpirationDateAllowed(firstUnsupportedDate, today)).toBe(false);
  });
});
