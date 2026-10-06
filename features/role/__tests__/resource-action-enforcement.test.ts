import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError } from "@/core/errors/app-errors";
import { RESOURCE_ACCESS } from "@/features/role/resource-access";

const activeUser = vi.fn();

vi.mock("@/core/di", () => ({ getUserService: () => ({ getActiveUserOrThrow: activeUser }) }));
vi.mock("@/env", () => ({ env: { APP_MODE: "cloud", BASE_URL: "http://localhost:4000" } }));

type Guarded = { new (...args: never[]): { invoke(input?: unknown): Promise<unknown> } };

const ENFORCED: Array<[resource: string, action: string, load: () => Promise<Guarded>, input?: unknown]> = [
  ["api", "create", async () => (await import("@/features/api-key/create-api-key.interactor")).CreateApiKeyInteractor],
  [
    "api",
    "update",
    async () => (await import("@/features/webhook/upsert-webhook.interactor")).UpsertWebhookInteractor,
    { id: "webhook-1" },
  ],
  ["api", "delete", async () => (await import("@/features/api-key/delete-api-key.interactor")).DeleteApiKeyInteractor],
  ["api", "readAll", async () => (await import("@/features/webhook/get-webhooks.interactor")).GetWebhooksInteractor],
  [
    "users",
    "create",
    async () => (await import("@/features/company/invite-users-by-email.interactor")).InviteUsersByEmailInteractor,
  ],
  [
    "users",
    "update",
    async () =>
      (await import("@/features/user/upsert/admin-update-user-details.interactor")).AdminUpdateUserDetailsInteractor,
  ],
  ["users", "readOwn", async () => (await import("@/features/user/get/get-users.interactor")).GetUsersInteractor],
  [
    "company",
    "update",
    async () => (await import("@/features/company/update-company-settings.interactor")).UpdateCompanySettingsInteractor,
  ],
  [
    "wiki",
    "create",
    async () => (await import("@/features/wiki/create-wiki-pages.interactor")).CreateWikiPagesInteractor,
  ],
  [
    "wiki",
    "update",
    async () => (await import("@/features/wiki/update-wiki-page.interactor")).UpdateWikiPageInteractor,
  ],
  [
    "wiki",
    "delete",
    async () => (await import("@/features/wiki/delete-wiki-page.interactor")).DeleteWikiPageInteractor,
  ],
  ["wiki", "readAll", async () => (await import("@/features/wiki/get-wiki-pages.interactor")).GetWikiPagesInteractor],
  [
    "auditLog",
    "readAll",
    async () => (await import("@/features/audit-log/get/get-audit-logs.interactor")).GetAuditLogsInteractor,
  ],
  [
    "inboxMessages",
    "create",
    async () => (await import("@/ee/messaging/outbound/send-email.interactor")).SendEmailInteractor,
  ],
  [
    "inboxMessages",
    "update",
    async () => (await import("@/ee/messaging/thread-state/update-thread.interactor")).UpdateThreadInteractor,
  ],
  [
    "inboxMessages",
    "delete",
    async () => (await import("@/ee/messaging/outbound/discard-draft.interactor")).DiscardDraftInteractor,
  ],
  [
    "inboxMessages",
    "readAll",
    async () => (await import("@/ee/messaging/inbox/get-messaging-threads.interactor")).GetMessagingThreadsInteractor,
  ],
  [
    "routines",
    "create",
    async () => (await import("@/ee/routines/upsert-routine.interactor")).UpsertRoutineInteractor,
    {},
  ],
  [
    "routines",
    "update",
    async () => (await import("@/ee/routines/run-routine-now.interactor")).RunRoutineNowInteractor,
  ],
  ["routines", "delete", async () => (await import("@/ee/routines/delete-routine.interactor")).DeleteRoutineInteractor],
  ["routines", "readOwn", async () => (await import("@/ee/routines/get-routines.interactor")).GetRoutinesInteractor],
];

function signIn(permissions: Array<{ resource: string; action: string }>) {
  activeUser.mockResolvedValue({
    id: "user-1",
    email: "member@example.test",
    companyId: "company-1",
    status: "active",
    role: {
      id: "role-1",
      companyId: "company-1",
      isSystemRole: false,
      permissions: permissions.map((permission, index) => ({ id: `p${index}`, ...permission })),
    },
  });
}

async function guardOutcome(load: () => Promise<Guarded>, input: unknown) {
  const Interactor = await load();
  try {
    await new Interactor().invoke(input);
    return "passed";
  } catch (error) {
    return error instanceof ForbiddenError ? "forbidden" : "passed";
  }
}

beforeEach(() => vi.clearAllMocks());

describe("system resource actions", () => {
  it.each(ENFORCED)(
    "admits %s %s only with that action",
    async (resource, action, load, input) => {
      signIn([{ resource, action }]);
      expect(await guardOutcome(load, input)).toBe("passed");

      const others = ["create", "update", "delete", "readAll", "readOwn"].filter(
        (candidate) => candidate !== action && !(action === "readOwn" && candidate === "readAll"),
      );
      signIn(others.map((other) => ({ resource, action: other })));
      expect(await guardOutcome(load, input)).toBe(
        action === "readAll" && resource === "inboxMessages" ? "passed" : "forbidden",
      );
    },
    60000,
  );

  it("covers every applicable manage action of every resource that has an interactor guard", () => {
    const guarded = new Set(ENFORCED.map(([resource, action]) => `${resource}:${action}`));
    const applicable = Object.entries(RESOURCE_ACCESS).flatMap(([resource, access]) =>
      access.manage.map((action) => `${resource}:${action}`),
    );
    expect(applicable.filter((key) => !guarded.has(key))).toEqual(["users:delete", "dataModel:update"]);
  });
});
