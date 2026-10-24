import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

vi.mock("@/env", () => ({
  env: {
    APP_MODE: "self-hosted",
    BASE_URL: "http://127.0.0.1:4000",
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));

vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
}));

const { getManageCalendarSubscriptionsInteractor } = await import("@/core/di");
const { createRestRouteWorkspace } = await import("@/tests/helpers/rest-route-workspace");
const { CALENDAR_SUBSCRIPTION_LIMIT } = await import("../calendar-subscription.schema");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const cleanups: Array<() => Promise<unknown>> = [];

function failure(outcome: {
  ok: boolean;
  error?: { issues: Array<{ code: string; params?: Record<string, unknown> }> };
}) {
  if (outcome.ok) throw new Error("Expected a failure");
  const [issue] = outcome.error?.issues ?? [];
  return { error: issue?.params?.error, kind: issue?.params?.kind };
}

describeDatabase("calendar subscriptions", { timeout: 60000 }, () => {
  afterAll(async () => {
    for (const cleanup of cleanups) await cleanup();
  });

  it("refuses a subscription beyond the limit and answers not found for an unknown id", async () => {
    const workspace = await createRestRouteWorkspace();
    cleanups.push(workspace.cleanup);
    const manage = (input: Parameters<ReturnType<typeof getManageCalendarSubscriptionsInteractor>["invoke"]>[0]) =>
      workspace.as(workspace.admin, () => getManageCalendarSubscriptionsInteractor().invoke(input));
    const config = { sources: [], calendarIds: [], timeZone: "Europe/Berlin", mode: "month" as const };

    const created = await Promise.all(
      Array.from({ length: CALENDAR_SUBSCRIPTION_LIMIT + 2 }, () =>
        manage({ action: "create", config, includePersonalEvents: false }),
      ),
    );
    expect(created.filter((outcome) => outcome.ok)).toHaveLength(CALENDAR_SUBSCRIPTION_LIMIT);
    expect(created.filter((outcome) => !outcome.ok).map(failure)).toEqual([
      { error: "calendarSubscriptionLimitReached", kind: "conflict" },
      { error: "calendarSubscriptionLimitReached", kind: "conflict" },
    ]);

    expect(failure(await manage({ action: "revoke", id: randomUUID() }))).toEqual({
      error: "calendarSubscriptionNotFound",
      kind: "not_found",
    });

    const listed = await manage({ action: "list" });
    if (!listed.ok) throw new Error("list failed");
    const revoked = await manage({ action: "revoke", id: listed.data.subscriptions[0].id });
    expect(revoked.ok && revoked.data.subscriptions).toHaveLength(CALENDAR_SUBSCRIPTION_LIMIT - 1);
  });
});
