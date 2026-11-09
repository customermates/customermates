import { beforeEach, describe, expect, it, vi } from "vitest";

const invokes = vi.hoisted(() => Array.from({ length: 15 }, () => vi.fn(() => Promise.resolve())));
const sentry = vi.hoisted(() => ({ captureException: vi.fn() }));
const mockEnv = vi.hoisted(() => ({
  APP_MODE: "cloud" as "cloud" | "demo" | "self-hosted",
  CRON_SECRET: "test-cron-secret",
  VERCEL_ENV: "preview" as "preview" | "production" | undefined,
  UNIPILE_API_KEY: "test-unipile-key" as string | undefined,
}));

vi.mock("@/env", () => ({ env: mockEnv }));
vi.mock("@/core/observability/server", () => sentry);

vi.mock("@/core/di", () => ({
  getSendWelcomeAndDemoInteractor: () => ({ invoke: invokes[0] }),
  getSendTrialExtensionOfferInteractor: () => ({ invoke: invokes[1] }),
  getDeactivateUsersAfterSubscriptionGracePeriodInteractor: () => ({
    invoke: invokes[2],
  }),
  getDeleteConnectedAccountsForExpiredTrialsInteractor: () => ({
    invoke: invokes[3],
  }),
  getDeleteConnectedAccountsForInactiveOwnersInteractor: () => ({
    invoke: invokes[4],
  }),
  getDeleteOrphanedUnipileAccountsInteractor: () => ({ invoke: invokes[5] }),
  getExpireAdAttributionInteractor: () => ({ invoke: invokes[6] }),
  getSendLegalDocumentNoticesInteractor: () => ({ invoke: invokes[7] }),
  getPruneRoutineRunsInteractor: () => ({ invoke: invokes[8] }),
  getPurgeExpiredTrashInteractor: () => ({ invoke: invokes[9] }),
  getPruneDraftSendsInteractor: () => ({ invoke: invokes[10] }),
  getPruneWikiKnowledgeGapsInteractor: () => ({ invoke: invokes[11] }),
  getSyncStaleWikiSectionsInteractor: () => ({ invoke: invokes[12] }),
  getPurgeExpiredRecordFilesInteractor: () => ({ invoke: invokes[13] }),
  getNormalizePhoneIdentitiesInteractor: () => ({ invoke: invokes[14] }),
}));

import { GET } from "../route";

const RETENTION_STEPS = [6, 8, 9, 10, 11, 12, 13, 14];
const UNIPILE_STEPS = [3, 4, 5];

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
    expect(calledSteps()).toEqual(invokes.map((_, index) => index));
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
    invokes[0].mockImplementationOnce(() => {
      throw welcomeFailure;
    });
    invokes[5].mockRejectedValueOnce(unipileFailure);

    const error = await callLifecycle().catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).message).toBe(
      "Lifecycle steps failed: sendWelcomeAndDemo (welcome mail template missing), deleteOrphanedUnipileAccounts (UNIPILE_API_KEY env var is not set)",
    );
    expect((error as AggregateError).errors).toEqual([welcomeFailure, unipileFailure]);
    expect(calledSteps()).toEqual(invokes.map((_, index) => index));
  });

  it("still runs the other lifecycle tasks when the Knowledge Base section sync fails", async () => {
    mockEnv.VERCEL_ENV = "production";
    const failure = new Error("canceling statement due to lock timeout");
    invokes[12].mockRejectedValueOnce(failure);

    const response = await GET(
      new Request("https://customermates.com/api/cron/lifecycle", {
        headers: { authorization: "Bearer test-cron-secret" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(calledSteps()).toEqual(invokes.map((_, index) => index));
    expect(sentry.captureException).toHaveBeenCalledWith(failure, {
      tags: { kind: "wiki-section-cron-sync" },
    });
  });
});
