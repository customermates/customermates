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
  getWithdrawAdAttributionInteractor: () => ({ invoke: mocks.withdraw }),
}));
vi.mock("../ad-attribution.cookie", () => ({
  readPublicAdAttributionCookie: mocks.read,
  writePublicAdAttributionCookie: mocks.write,
}));

import { LEGAL_DOCUMENT_VERSIONS } from "@/constants/legal-documents";
import {
  captureConsentedAdClickAction,
  decidePublicAdAttributionConsentAction,
  readPublicAdAttributionConsentAction,
  reconcileAdAttributionWithdrawalAction,
} from "../ad-attribution.actions";

const freshPendingAt = () => new Date().toISOString();

const storedCookie = (clicks: unknown[], noticeVersion: string = LEGAL_DOCUMENT_VERSIONS.privacy) => ({
  version: 1,
  consent: { advertising: true, decidedAt: "2026-08-31T10:00:00.000Z", noticeVersion },
  clicks,
  expiresAt: "2027-11-29T10:00:00.000Z",
});

const googleClick = {
  provider: "google_ads",
  kind: "gclid",
  value: "first",
  clickedAt: "2026-08-31T10:00:00.000Z",
  capturedAt: "2026-08-31T10:00:00.000Z",
  expiresAt: "2027-11-28T10:00:00.000Z",
};

describe("ad attribution consent actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.read.mockResolvedValue(null);
    mocks.write.mockResolvedValue(true);
    mocks.withdraw.mockResolvedValue(true);
  });

  it("persists an explicit allow decision with one click", async () => {
    await expect(
      decidePublicAdAttributionConsentAction({
        choice: "allow-attribution",
        visit: { pendingAt: freshPendingAt(), search: "?gclid=one" },
      }),
    ).resolves.toMatchObject({ advertising: true });
    expect(mocks.write).toHaveBeenCalledWith(
      expect.objectContaining({ clicks: [expect.objectContaining({ value: "one", provider: "google_ads" })] }),
    );
    expect(mocks.withdraw).not.toHaveBeenCalled();
  });

  it("records the notice version alongside the decision", async () => {
    await decidePublicAdAttributionConsentAction({
      choice: "allow-attribution",
      visit: { pendingAt: freshPendingAt(), search: "?oppref=chat" },
    });
    const written = mocks.write.mock.calls[0][0];
    expect(written.consent.noticeVersion).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("persists refusal without waiting for authenticated database clearing", async () => {
    await expect(
      decidePublicAdAttributionConsentAction({
        choice: "necessary-only",
        visit: { pendingAt: freshPendingAt(), search: "?gclid=one" },
      }),
    ).resolves.toMatchObject({ advertising: false });
    expect(mocks.write).toHaveBeenCalledWith(expect.objectContaining({ clicks: [] }));
    expect(mocks.withdraw).not.toHaveBeenCalled();
    expect(mocks.report).not.toHaveBeenCalled();
  });

  it("retries clearing when a later hydration sees the stored refusal", async () => {
    mocks.read.mockResolvedValue({
      ...storedCookie([]),
      consent: { advertising: false, decidedAt: "x", noticeVersion: "v" },
    });
    await reconcileAdAttributionWithdrawalAction();
    expect(mocks.withdraw).toHaveBeenCalledOnce();
  });

  it("captures a retry failure without changing the stored refusal", async () => {
    mocks.read.mockResolvedValue({
      ...storedCookie([]),
      consent: { advertising: false, decidedAt: "x", noticeVersion: "v" },
    });
    mocks.withdraw.mockRejectedValueOnce(new Error("temporary"));

    await reconcileAdAttributionWithdrawalAction();

    expect(mocks.report).toHaveBeenCalledOnce();
  });

  it("replaces an earlier click from the same provider so the platform can match it", async () => {
    mocks.read.mockResolvedValue(storedCookie([googleClick]));

    await captureConsentedAdClickAction({ pendingAt: freshPendingAt(), search: "?gclid=second" });

    const written = mocks.write.mock.calls[0][0];
    expect(written.clicks).toHaveLength(1);
    expect(written.clicks[0]).toMatchObject({ provider: "google_ads", value: "second" });
  });

  it("keeps a click from another provider when a new provider is captured", async () => {
    mocks.read.mockResolvedValue(storedCookie([googleClick]));

    await captureConsentedAdClickAction({ pendingAt: freshPendingAt(), search: "?oppref=chat" });

    const written = mocks.write.mock.calls[0][0];
    expect(written.clicks.map((click: { value: string }) => click.value).sort()).toEqual(["chat", "first"]);
    expect(written.consent).toEqual(storedCookie([]).consent);
  });

  it("captures a later eligible click while an unexpired allow choice has no stored click", async () => {
    mocks.read.mockResolvedValue(storedCookie([]));

    await captureConsentedAdClickAction({ pendingAt: freshPendingAt(), search: "?gclid=later-click" });

    expect(mocks.write).toHaveBeenCalledWith(
      expect.objectContaining({ clicks: [expect.objectContaining({ kind: "gclid", value: "later-click" })] }),
    );
  });

  it("does not capture an expired pending click under stored consent", async () => {
    mocks.read.mockResolvedValue(storedCookie([]));
    const expiredPendingAt = new Date(Date.now() - 60 * 60 * 24 * 1000 - 1).toISOString();

    await captureConsentedAdClickAction({ pendingAt: expiredPendingAt, search: "?gclid=expired-click" });

    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("does not write when a refusal is stored", async () => {
    mocks.read.mockResolvedValue({
      ...storedCookie([]),
      consent: { advertising: false, decidedAt: "x", noticeVersion: "v" },
    });

    await captureConsentedAdClickAction({ pendingAt: freshPendingAt(), search: "?gclid=one" });

    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("treats a decision given for an older notice as no decision so the visitor is asked again", async () => {
    mocks.read.mockResolvedValue(storedCookie([googleClick], "2026-08-31"));

    await expect(readPublicAdAttributionConsentAction()).resolves.toBeNull();

    await captureConsentedAdClickAction({ pendingAt: freshPendingAt(), search: "?oppref=chat" });
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("reports a decision given for the current notice", async () => {
    mocks.read.mockResolvedValue(storedCookie([googleClick]));

    await expect(readPublicAdAttributionConsentAction()).resolves.toMatchObject({
      advertising: true,
      noticeVersion: LEGAL_DOCUMENT_VERSIONS.privacy,
    });
  });
});
