import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";

vi.mock("@/env", () => ({ env: { APP_MODE: "cloud" } }));
vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: (namespace?: string) => {
    const t = (key: string) => (namespace ? `${namespace}.${key}` : key);
    return Promise.resolve(Object.assign(t, { raw: t }));
  },
}));

import type { PublicAdAttributionCookie } from "../ad-attribution.schema";

import { AD_ATTRIBUTION_NOTICE_VERSION } from "@/constants/legal-documents";
import { ExpireAdAttributionInteractor } from "@/ee/lifecycle/expire-ad-attribution.interactor";
import { unwrapValidated } from "@/core/validation/validation.utils";
import { CaptureAdClickInteractor } from "../capture-ad-click.interactor";
import { DecideAdAttributionConsentInteractor } from "../decide-ad-attribution-consent.interactor";
import { ReadAdAttributionConsentInteractor } from "../read-ad-attribution-consent.interactor";
import { WithdrawAdAttributionInteractor } from "../withdraw-ad-attribution.interactor";

const cookieRepo = { readCookie: vi.fn(), writeCookie: vi.fn() };

const freshPendingAt = () => new Date().toISOString();

const storedCookie = (clicks: unknown[], noticeVersion: string = AD_ATTRIBUTION_NOTICE_VERSION) =>
  ({
    version: 1,
    consent: { advertising: true, decidedAt: "2026-08-31T10:00:00.000Z", noticeVersion },
    clicks,
    expiresAt: "2027-11-29T10:00:00.000Z",
  }) as unknown as PublicAdAttributionCookie;

const googleClick = {
  provider: "google_ads",
  kind: "gclid",
  value: "first",
  clickedAt: "2026-08-31T10:00:00.000Z",
  capturedAt: "2026-08-31T10:00:00.000Z",
  expiresAt: "2027-11-28T10:00:00.000Z",
};

const decide = () => new DecideAdAttributionConsentInteractor(cookieRepo as never);
const capture = () => new CaptureAdClickInteractor(cookieRepo as never);
const read = () => new ReadAdAttributionConsentInteractor(cookieRepo as never);

const writtenCookie = () => cookieRepo.writeCookie.mock.calls[0]?.[0] as PublicAdAttributionCookie;

describe("ad attribution consent interactors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookieRepo.readCookie.mockResolvedValue(null);
    cookieRepo.writeCookie.mockResolvedValue(true);
  });

  it("persists an explicit allow decision with one click", async () => {
    await expect(
      unwrapValidated(
        decide().invoke({
          choice: "allow-attribution",
          visit: { search: "?gclid=first", pendingAt: freshPendingAt() },
        }),
      ),
    ).resolves.toMatchObject({ advertising: true });

    expect(cookieRepo.writeCookie).toHaveBeenCalledWith(
      expect.objectContaining({ clicks: [expect.objectContaining({ provider: "google_ads", value: "first" })] }),
    );
  });

  it("records the notice version alongside the decision", async () => {
    await unwrapValidated(decide().invoke({ choice: "allow-attribution", visit: null }));

    expect(writtenCookie().consent.noticeVersion).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("persists refusal without waiting for authenticated database clearing", async () => {
    await expect(unwrapValidated(decide().invoke({ choice: "necessary-only", visit: null }))).resolves.toMatchObject({
      advertising: false,
    });

    expect(cookieRepo.writeCookie).toHaveBeenCalledWith(expect.objectContaining({ clicks: [] }));
  });

  it("replaces an earlier click from the same provider so the platform can match it", async () => {
    cookieRepo.readCookie.mockResolvedValue(storedCookie([googleClick]));

    await unwrapValidated(capture().invoke({ search: "?gclid=second", pendingAt: freshPendingAt() }));

    expect(writtenCookie().clicks).toHaveLength(1);
    expect(writtenCookie().clicks[0]).toMatchObject({ provider: "google_ads", value: "second" });
  });

  it("keeps a click from another provider when a new provider is captured", async () => {
    cookieRepo.readCookie.mockResolvedValue(storedCookie([googleClick]));

    await unwrapValidated(capture().invoke({ search: "?oppref=chat", pendingAt: freshPendingAt() }));

    expect(
      writtenCookie()
        .clicks.map((click) => click.value)
        .sort(),
    ).toEqual(["chat", "first"]);
    expect(writtenCookie().consent).toEqual(storedCookie([]).consent);
  });

  it("captures a later eligible click while an unexpired allow choice has no stored click", async () => {
    cookieRepo.readCookie.mockResolvedValue(storedCookie([]));

    await unwrapValidated(capture().invoke({ search: "?gclid=later", pendingAt: freshPendingAt() }));

    expect(cookieRepo.writeCookie).toHaveBeenCalledWith(
      expect.objectContaining({ clicks: [expect.objectContaining({ value: "later" })] }),
    );
  });

  it("does not capture an expired pending click under stored consent", async () => {
    cookieRepo.readCookie.mockResolvedValue(storedCookie([]));

    await unwrapValidated(capture().invoke({ search: "?gclid=stale", pendingAt: "2026-08-01T10:00:00.000Z" }));

    expect(cookieRepo.writeCookie).not.toHaveBeenCalled();
  });

  it("does not write when a refusal is stored", async () => {
    cookieRepo.readCookie.mockResolvedValue({
      ...storedCookie([]),
      consent: {
        advertising: false,
        decidedAt: "2026-08-31T10:00:00.000Z",
        noticeVersion: AD_ATTRIBUTION_NOTICE_VERSION,
      },
    });

    await unwrapValidated(capture().invoke({ search: "?gclid=blocked", pendingAt: freshPendingAt() }));

    expect(cookieRepo.writeCookie).not.toHaveBeenCalled();
  });

  it("treats a decision given for an older notice as no decision so the visitor is asked again", async () => {
    cookieRepo.readCookie.mockResolvedValue(storedCookie([], "2020-01-01"));

    await expect(unwrapValidated(read().invoke())).resolves.toBeNull();

    await unwrapValidated(capture().invoke({ search: "?gclid=ignored", pendingAt: freshPendingAt() }));
    expect(cookieRepo.writeCookie).not.toHaveBeenCalled();
  });

  it("reports a decision given for the current notice", async () => {
    cookieRepo.readCookie.mockResolvedValue(storedCookie([]));

    await expect(unwrapValidated(read().invoke())).resolves.toMatchObject({ advertising: true });
  });
});

describe("narrow ad attribution interactors", () => {
  const owner = createMockUser();
  const routeGuard = { resolveAccountState: vi.fn() };
  const repo = {
    clearAdAttributionForUser: vi.fn(),
    expireAdAttributionUnscoped: vi.fn(),
  };
  const refusedCookie = {
    version: 1,
    consent: {
      advertising: false,
      decidedAt: "2026-08-31T10:00:00.000Z",
      noticeVersion: AD_ATTRIBUTION_NOTICE_VERSION,
    },
    clicks: [],
    expiresAt: "2027-11-29T10:00:00.000Z",
  } as unknown as PublicAdAttributionCookie;

  const withdraw = () => new WithdrawAdAttributionInteractor(routeGuard as never, repo, cookieRepo as never);

  beforeEach(() => {
    vi.clearAllMocks();
    routeGuard.resolveAccountState.mockResolvedValue({ state: "allowed", user: owner });
    repo.clearAdAttributionForUser.mockResolvedValue(true);
    repo.expireAdAttributionUnscoped.mockResolvedValue(2);
    cookieRepo.readCookie.mockResolvedValue(refusedCookie);
  });

  it("clears only the authenticated user's attribution once a refusal is stored", async () => {
    await expect(unwrapValidated(withdraw().invoke())).resolves.toBe(true);
    expect(repo.clearAdAttributionForUser).toHaveBeenCalledWith({ userId: owner.id });
  });

  it("does nothing without an authenticated user", async () => {
    routeGuard.resolveAccountState.mockResolvedValue({ state: "unregistered", user: null });

    await expect(unwrapValidated(withdraw().invoke())).resolves.toBe(false);
    expect(repo.clearAdAttributionForUser).not.toHaveBeenCalled();
  });

  it("leaves the database alone while the stored decision still allows attribution", async () => {
    cookieRepo.readCookie.mockResolvedValue(storedCookie([]));

    await expect(unwrapValidated(withdraw().invoke())).resolves.toBe(false);
    expect(repo.clearAdAttributionForUser).not.toHaveBeenCalled();
  });

  it("delegates bounded expiry without changing account state", async () => {
    const now = new Date("2026-11-29T10:00:00.000Z");
    await expect(new ExpireAdAttributionInteractor(repo).invoke(now)).resolves.toBe(2);
    expect(repo.expireAdAttributionUnscoped).toHaveBeenCalledWith(now);
  });
});
