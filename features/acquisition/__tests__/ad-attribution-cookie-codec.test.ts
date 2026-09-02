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

import { decodePublicAdAttributionCookie, encodePublicAdAttributionCookie } from "../ad-attribution-cookie-codec";
import {
  NextAdAttributionCookieRepo,
  clearRegisteredAdClicksFromCookie,
  readRegistrationAdAttribution,
} from "../next/ad-attribution-cookie";

const cookieRepo = new NextAdAttributionCookieRepo();
const writePublicAdAttributionCookie = (value: PublicAdAttributionCookie) => cookieRepo.writeCookie(value);
import { PUBLIC_AD_ATTRIBUTION_COOKIE_NAME, type PublicAdAttributionCookie } from "../ad-attribution.schema";

const SIGNING_SECRET = "ad-attribution:v1:test-secret";
const CURRENT_NOTICE = "2026-09-02";

const cookie: PublicAdAttributionCookie = {
  version: 1,
  consent: { advertising: true, decidedAt: "2026-08-31T10:00:00.000Z", noticeVersion: CURRENT_NOTICE },
  clicks: [
    {
      provider: "google_ads",
      kind: "gclid",
      value: "Case-Sensitive_GCLID",
      clickedAt: "2026-08-31T10:00:00.000Z",
      capturedAt: "2026-08-31T10:00:00.000Z",
      expiresAt: "2026-11-28T10:00:00.000Z",
    },
    {
      provider: "openai_ads",
      kind: "oppref",
      value: "Opaque-OPPREF",
      clickedAt: "2026-08-31T10:00:00.000Z",
      capturedAt: "2026-08-31T10:00:00.000Z",
      expiresAt: "2026-09-30T10:00:00.000Z",
    },
  ],
  expiresAt: "2026-11-29T10:00:00.000Z",
};

describe("signed ad attribution cookie", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T10:00:01.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects tampering and preserves a valid payload", () => {
    const encoded = encodePublicAdAttributionCookie(cookie, "secret");
    expect(encoded).not.toBeNull();
    expect(decodePublicAdAttributionCookie(encoded ?? undefined, "secret")).toEqual(cookie);
    expect(decodePublicAdAttributionCookie(`${(encoded ?? "").slice(0, -1)}0`, "secret")).toBeNull();
  });

  it("writes an HTTP-only, same-site cookie and reports one registration row per provider", async () => {
    await expect(writePublicAdAttributionCookie(cookie)).resolves.toBe(true);
    expect(cookieStore.set).toHaveBeenCalledWith(
      PUBLIC_AD_ATTRIBUTION_COOKIE_NAME,
      expect.any(String),
      expect.objectContaining({ httpOnly: true, sameSite: "lax", secure: false }),
    );

    cookieStore.get.mockReturnValue({ value: cookieStore.set.mock.calls[0][1] });
    await expect(readRegistrationAdAttribution()).resolves.toEqual([
      {
        provider: "google_ads",
        identifierKind: "gclid",
        identifierValue: "Case-Sensitive_GCLID",
        clickedAt: new Date("2026-08-31T10:00:00.000Z"),
        capturedAt: new Date("2026-08-31T10:00:00.000Z"),
        consentedAt: new Date("2026-08-31T10:00:00.000Z"),
        consentNoticeVersion: "2026-09-02",
        expiresAt: new Date("2026-11-28T10:00:00.000Z"),
      },
      {
        provider: "openai_ads",
        identifierKind: "oppref",
        identifierValue: "Opaque-OPPREF",
        clickedAt: new Date("2026-08-31T10:00:00.000Z"),
        capturedAt: new Date("2026-08-31T10:00:00.000Z"),
        consentedAt: new Date("2026-08-31T10:00:00.000Z"),
        consentNoticeVersion: "2026-09-02",
        expiresAt: new Date("2026-09-30T10:00:00.000Z"),
      },
    ]);
  });

  it("drops a provider whose own retention has lapsed while keeping the others", async () => {
    vi.setSystemTime(new Date("2026-10-01T10:00:00.000Z"));
    cookieStore.get.mockReturnValue({ value: encodePublicAdAttributionCookie(cookie, SIGNING_SECRET) });

    const attribution = await readRegistrationAdAttribution();
    expect(attribution.map((entry) => entry.provider)).toEqual(["google_ads"]);
  });

  it("returns no registration attribution for refusal or expiry", async () => {
    const refused = encodePublicAdAttributionCookie(
      { ...cookie, consent: { ...cookie.consent, advertising: false }, clicks: [] },
      SIGNING_SECRET,
    );
    cookieStore.get.mockReturnValue({ value: refused });
    await expect(readRegistrationAdAttribution()).resolves.toEqual([]);

    vi.setSystemTime(new Date("2026-11-29T10:00:00.000Z"));
    cookieStore.get.mockReturnValue({ value: encodePublicAdAttributionCookie(cookie, SIGNING_SECRET) });
    await expect(readRegistrationAdAttribution()).resolves.toEqual([]);
  });

  it("clears transferred clicks while preserving the consent decision", async () => {
    cookieStore.get.mockReturnValue({ value: encodePublicAdAttributionCookie(cookie, SIGNING_SECRET) });
    await clearRegisteredAdClicksFromCookie();

    const written = decodePublicAdAttributionCookie(cookieStore.set.mock.calls[0][1], SIGNING_SECRET);
    expect(written?.clicks).toEqual([]);
    expect(written?.consent).toEqual(cookie.consent);
  });

  it("refuses to hand a click consented under an older notice to registration", async () => {
    const stale = {
      ...cookie,
      consent: { ...cookie.consent, noticeVersion: "2026-08-31" },
    };
    cookieStore.get.mockReturnValue({ value: encodePublicAdAttributionCookie(stale, SIGNING_SECRET) });

    await expect(readRegistrationAdAttribution()).resolves.toEqual([]);
  });
});
