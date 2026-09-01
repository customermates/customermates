import { beforeEach, describe, expect, it, vi } from "vitest";

const invokes = vi.hoisted(() => Array.from({ length: 11 }, () => vi.fn()));
const mockEnv = vi.hoisted(() => ({
  APP_MODE: "cloud" as "cloud" | "demo",
  CRON_SECRET: "test-cron-secret",
  VERCEL_ENV: "preview" as "preview" | "production",
}));

vi.mock("@/env", () => ({ env: mockEnv }));

vi.mock("@/core/di", () => ({
  getSendWelcomeAndDemoInteractor: () => ({ invoke: invokes[0] }),
  getSendTrialExtensionOfferInteractor: () => ({ invoke: invokes[1] }),
  getSendTrialInactivationReminderInteractor: () => ({ invoke: invokes[2] }),
  getDeactivateTrialUsersAndSendNoticeInteractor: () => ({
    invoke: invokes[3],
  }),
  getDeactivateUsersAfterSubscriptionGracePeriodInteractor: () => ({
    invoke: invokes[4],
  }),
  getDeleteConnectedAccountsForExpiredTrialsInteractor: () => ({
    invoke: invokes[5],
  }),
  getDeleteConnectedAccountsForInactiveOwnersInteractor: () => ({
    invoke: invokes[6],
  }),
  getDeleteOrphanedUnipileAccountsInteractor: () => ({ invoke: invokes[7] }),
  getExpireGoogleAdsClickIdsInteractor: () => ({ invoke: invokes[8] }),
  getSendLegalDocumentNoticesInteractor: () => ({ invoke: invokes[9] }),
  getAnalyzeCompanyRoutinesInteractor: () => ({ invoke: invokes[10] }),
}));

import { GET } from "../route";

describe("lifecycle cron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.APP_MODE = "cloud";
    mockEnv.VERCEL_ENV = "preview";
  });

  it("does not run lifecycle or Unipile cleanup in Vercel Previews", async () => {
    const response = await GET(
      new Request("https://preview.example.com/api/cron/lifecycle", {
        headers: { authorization: "Bearer test-cron-secret" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ skipped: "preview-environment" });
    expect(invokes.every((invoke) => invoke.mock.calls.length === 0)).toBe(true);
  });

  it("runs the legal-notice interactor in the normal daily lifecycle flow", async () => {
    mockEnv.VERCEL_ENV = "production";

    const response = await GET(
      new Request("https://customermates.com/api/cron/lifecycle", {
        headers: { authorization: "Bearer test-cron-secret" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(invokes.every((invoke) => invoke.mock.calls.length === 1)).toBe(true);
  });
});
