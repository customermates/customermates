import { beforeEach, describe, expect, it, vi } from "vitest";

const invokes = vi.hoisted(() => Array.from({ length: 8 }, () => vi.fn()));

vi.mock("@/env", () => ({
  env: {
    APP_MODE: "cloud",
    CRON_SECRET: "test-cron-secret",
    VERCEL_ENV: "preview",
  },
}));

vi.mock("@/core/di", () => ({
  getSendWelcomeAndDemoInteractor: () => ({ invoke: invokes[0] }),
  getSendTrialExtensionOfferInteractor: () => ({ invoke: invokes[1] }),
  getSendTrialInactivationReminderInteractor: () => ({ invoke: invokes[2] }),
  getDeactivateTrialUsersAndSendNoticeInteractor: () => ({ invoke: invokes[3] }),
  getDeactivateUsersAfterSubscriptionGracePeriodInteractor: () => ({ invoke: invokes[4] }),
  getDeleteConnectedAccountsForExpiredTrialsInteractor: () => ({ invoke: invokes[5] }),
  getDeleteConnectedAccountsForInactiveOwnersInteractor: () => ({ invoke: invokes[6] }),
  getDeleteOrphanedUnipileAccountsInteractor: () => ({ invoke: invokes[7] }),
}));

import { GET } from "../route";

describe("lifecycle cron", () => {
  beforeEach(() => vi.clearAllMocks());

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
});
