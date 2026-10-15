import { beforeEach, describe, expect, it, vi } from "vitest";

const invokes = vi.hoisted(() => Array.from({ length: 12 }, () => vi.fn()));
const mockEnv = vi.hoisted(() => ({
  APP_MODE: "cloud" as "cloud" | "demo" | "self-hosted",
  CRON_SECRET: "test-cron-secret",
  VERCEL_ENV: "preview" as "preview" | "production" | undefined,
  UNIPILE_API_KEY: "test-unipile-key" as string | undefined,
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
  getExpireAdAttributionInteractor: () => ({ invoke: invokes[8] }),
  getSendLegalDocumentNoticesInteractor: () => ({ invoke: invokes[9] }),
  getPruneRoutineRunsInteractor: () => ({ invoke: invokes[10] }),
  getPurgeExpiredTrashInteractor: () => ({ invoke: invokes[11] }),
}));

import { GET } from "../route";

const RETENTION_STEPS = [8, 10, 11];
const UNIPILE_STEPS = [5, 6, 7];

function callLifecycle() {
  return GET(
    new Request("https://customermates.com/api/cron/lifecycle", {
      headers: { authorization: "Bearer test-cron-secret" },
    }),
  );
}

function calledSteps() {
  return invokes.flatMap((invoke, index) => (invoke.mock.calls.length ? [index] : []));
}

describe("lifecycle cron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.APP_MODE = "cloud";
    mockEnv.VERCEL_ENV = "preview";
    mockEnv.UNIPILE_API_KEY = "test-unipile-key";
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

    const response = await callLifecycle();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(invokes.every((invoke) => invoke.mock.calls.length === 1)).toBe(true);
  });

  it("runs only the retention steps on a self-hosted instance", async () => {
    mockEnv.APP_MODE = "self-hosted";
    mockEnv.VERCEL_ENV = undefined;
    mockEnv.UNIPILE_API_KEY = undefined;

    const response = await callLifecycle();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(calledSteps()).toEqual(RETENTION_STEPS);
  });

  it("skips the Unipile cleanups when Unipile is not configured", async () => {
    mockEnv.VERCEL_ENV = "production";
    mockEnv.UNIPILE_API_KEY = undefined;

    const response = await callLifecycle();

    expect(response.status).toBe(200);
    expect(calledSteps()).toEqual(invokes.flatMap((_, index) => (UNIPILE_STEPS.includes(index) ? [] : [index])));
  });

  it("still runs every other step when one fails and then fails with every step error", async () => {
    mockEnv.VERCEL_ENV = "production";
    const welcomeFailure = new Error("welcome mail template missing");
    const unipileFailure = new Error("UNIPILE_API_KEY env var is not set");
    invokes[0].mockImplementation(() => {
      throw welcomeFailure;
    });
    invokes[7].mockRejectedValue(unipileFailure);

    const error = await callLifecycle().catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).message).toBe(
      "Lifecycle steps failed: sendWelcomeAndDemo (welcome mail template missing), deleteOrphanedUnipileAccounts (UNIPILE_API_KEY env var is not set)",
    );
    expect((error as AggregateError).errors).toEqual([welcomeFailure, unipileFailure]);
    expect(invokes.every((invoke) => invoke.mock.calls.length === 1)).toBe(true);
  });
});
