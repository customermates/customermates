import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  report: vi.fn(),
  withdraw: vi.fn(),
  write: vi.fn(),
}));

vi.mock("@/env", () => ({ env: { APP_MODE: "cloud" } }));
vi.mock("@sentry/nextjs", () => ({ captureException: mocks.report }));
vi.mock("@/core/di", () => ({
  getWithdrawGoogleAdsAttributionInteractor: () => ({ invoke: mocks.withdraw }),
}));
vi.mock("../google-ads-consent.cookie", () => ({
  readPublicGoogleAdsCookie: mocks.read,
  writePublicGoogleAdsCookie: mocks.write,
}));

import {
  captureConsentedGoogleAdsClickAction,
  decidePublicGoogleAdsConsentAction,
  reconcileGoogleAdsAttributionWithdrawalAction,
} from "../google-ads-consent.actions";

describe("Google Ads consent actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.read.mockResolvedValue(null);
    mocks.write.mockResolvedValue(true);
    mocks.withdraw.mockResolvedValue(true);
  });

  it("persists an explicit allow decision with one click", async () => {
    await expect(
      decidePublicGoogleAdsConsentAction({
        choice: "allow-attribution",
        visit: { search: "?gclid=one" },
      }),
    ).resolves.toMatchObject({ advertising: true });
    expect(mocks.write).toHaveBeenCalledWith(
      expect.objectContaining({
        click: expect.objectContaining({ value: "one" }),
      }),
    );
    expect(mocks.withdraw).not.toHaveBeenCalled();
  });

  it("persists refusal without waiting for authenticated database clearing", async () => {
    await expect(
      decidePublicGoogleAdsConsentAction({
        choice: "necessary-only",
        visit: { search: "?gclid=one" },
      }),
    ).resolves.toMatchObject({ advertising: false });
    expect(mocks.write).toHaveBeenCalledWith(expect.objectContaining({ click: null }));
    expect(mocks.withdraw).not.toHaveBeenCalled();
    expect(mocks.report).not.toHaveBeenCalled();
  });

  it("retries clearing when a later hydration sees the stored refusal", async () => {
    mocks.read.mockResolvedValue({
      version: 1,
      consent: { advertising: false, decidedAt: "2026-08-31T10:00:00.000Z" },
      click: null,
      expiresAt: "2026-11-29T10:00:00.000Z",
    });
    await reconcileGoogleAdsAttributionWithdrawalAction();
    expect(mocks.withdraw).toHaveBeenCalledOnce();
  });

  it("captures a retry failure without changing the stored refusal", async () => {
    mocks.read.mockResolvedValue({
      version: 1,
      consent: { advertising: false, decidedAt: "2026-08-31T10:00:00.000Z" },
      click: null,
      expiresAt: "2026-11-29T10:00:00.000Z",
    });
    mocks.withdraw.mockRejectedValueOnce(new Error("temporary"));

    await reconcileGoogleAdsAttributionWithdrawalAction();

    expect(mocks.report).toHaveBeenCalledOnce();
  });

  it("never overwrites the initial stored click", async () => {
    mocks.read.mockResolvedValue({
      version: 1,
      consent: { advertising: true, decidedAt: "2026-08-31T10:00:00.000Z" },
      click: {
        kind: "gclid",
        value: "first",
        capturedAt: "2026-08-31T10:00:00.000Z",
      },
      expiresAt: "2026-11-29T10:00:00.000Z",
    });
    await captureConsentedGoogleAdsClickAction({ search: "?gclid=second" });
    expect(mocks.write).not.toHaveBeenCalled();
  });
});
