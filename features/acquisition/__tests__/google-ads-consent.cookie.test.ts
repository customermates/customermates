import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cookieStore = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue(cookieStore),
}));
vi.mock("@/env", () => ({
  env: {
    APP_MODE: "cloud",
    BETTER_AUTH_SECRET: "test-secret",
    NODE_ENV: "test",
  },
}));

import {
  decodePublicGoogleAdsCookie,
  encodePublicGoogleAdsCookie,
  readRegistrationGoogleAdsAttribution,
  writePublicGoogleAdsCookie,
} from "../google-ads-consent.cookie";
import { PUBLIC_GOOGLE_ADS_COOKIE_NAME, type PublicGoogleAdsCookie } from "../google-ads-consent.schema";

const cookie: PublicGoogleAdsCookie = {
  version: 1,
  consent: { advertising: true, decidedAt: "2026-08-31T10:00:00.000Z" },
  click: {
    kind: "gclid",
    value: "Case-Sensitive_GCLID",
    capturedAt: "2026-08-31T10:00:00.000Z",
  },
  expiresAt: "2026-11-29T10:00:00.000Z",
};

describe("signed Google Ads attribution cookie", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T10:00:01.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects tampering and preserves a valid payload", () => {
    const encoded = encodePublicGoogleAdsCookie(cookie, "secret");
    expect(decodePublicGoogleAdsCookie(encoded, "secret")).toEqual(cookie);
    expect(decodePublicGoogleAdsCookie(`${encoded.slice(0, -1)}0`, "secret")).toBeNull();
  });

  it("writes an HTTP-only, same-site cookie and derives an 89-day database expiry", async () => {
    await expect(writePublicGoogleAdsCookie(cookie)).resolves.toBe(true);
    expect(cookieStore.set).toHaveBeenCalledWith(
      PUBLIC_GOOGLE_ADS_COOKIE_NAME,
      expect.any(String),
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
        secure: false,
      }),
    );

    cookieStore.get.mockReturnValue({
      value: cookieStore.set.mock.calls[0][1],
    });
    await expect(readRegistrationGoogleAdsAttribution()).resolves.toEqual({
      clickId: "Case-Sensitive_GCLID",
      clickIdKind: "gclid",
      capturedAt: new Date("2026-08-31T10:00:00.000Z"),
      consentedAt: new Date("2026-08-31T10:00:00.000Z"),
      expiresAt: new Date("2026-11-28T10:00:00.000Z"),
    });
  });

  it("returns no registration attribution for refusal or expiry", async () => {
    const refused = encodePublicGoogleAdsCookie(
      {
        ...cookie,
        consent: { ...cookie.consent, advertising: false },
        click: null,
      },
      "google-ads-attribution:v1:test-secret",
    );
    cookieStore.get.mockReturnValue({ value: refused });
    await expect(readRegistrationGoogleAdsAttribution()).resolves.toBeNull();

    vi.setSystemTime(new Date("2026-11-29T10:00:00.000Z"));
    cookieStore.get.mockReturnValue({
      value: encodePublicGoogleAdsCookie(cookie, "google-ads-attribution:v1:test-secret"),
    });
    await expect(readRegistrationGoogleAdsAttribution()).resolves.toBeNull();
  });
});
