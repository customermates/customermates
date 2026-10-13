import { randomUUID } from "node:crypto";

import { createTranslator } from "next-intl";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import messages from "@/i18n/locales/en.json";

vi.mock("@/env", () => ({
  env: {
    APP_MODE: "cloud",
    BASE_URL: "http://127.0.0.1:4000",
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));
vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: (namespace?: string) =>
    Promise.resolve(createTranslator({ locale: "en", messages, namespace: namespace as never })),
}));

await import("@/core/di");
const { createRestRouteWorkspace, postAs, restRoute } = await import("@/tests/helpers/rest-route-workspace");
const { getRoleManagementService, getUpsertRoleInteractor, getDeleteRoleInteractor } = await import("@/core/di");
const { PrismaRoleRepo } = await import("../prisma-role.repository");
const { EventService } = await import("@/features/event/event.service");
const { failureUnwindCause } = await import("@/core/validation/failure-unwind");
const { prisma } = await import("@/prisma/db");
const { runWithoutTenant } = await import("@/core/decorators/tenant-context");
const saveRoleRoute = await restRoute("/v1/roles/save");

type Workspace = Awaited<ReturnType<typeof createRestRouteWorkspace>>;

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const cleanups: Array<() => Promise<unknown>> = [];

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  for (const cleanup of cleanups) await cleanup();
});

async function workspace() {
  const created = await createRestRouteWorkspace();
  cleanups.push(created.cleanup);
  return created;
}

async function roleInput(w: Workspace, name = `Role ${randomUUID()}`) {
  return {
    name,
    description: "Role management failures",
    expectedRevision: await w.revision(),
    idempotencyKey: randomUUID(),
    recordGrants: [],
    permissions: [],
  };
}

function receipts(w: Workspace, idempotencyKey: string) {
  return runWithoutTenant(() =>
    prisma.recordMutationReceipt.count({ where: { companyId: w.companyId, idempotencyKey } }),
  );
}

describeDatabase("role management failures", () => {
  it("answers a role name that is taken between the check and the write as a name conflict and writes nothing", async () => {
    const w = await workspace();
    const existing = await w.as(w.admin, async () => getUpsertRoleInteractor().invoke(await roleInput(w)));
    if (!existing.ok) throw new Error("The first role could not be saved");
    vi.spyOn(PrismaRoleRepo.prototype, "isRoleNameTaken").mockResolvedValue(false);
    const revision = await w.revision();
    const input = await roleInput(w, existing.data.role.name);

    expect(await postAs(w, w.admin, saveRoleRoute, input)).toEqual({
      status: 409,
      body: {
        error: {
          kind: "conflict",
          issues: [
            {
              code: "custom",
              path: ["name"],
              message: messages.Common.errors.roleNameTaken,
              customCode: "roleNameTaken",
            },
          ],
        },
      },
    });
    expect(await w.revision()).toBe(revision);
    expect(await receipts(w, input.idempotencyKey)).toBe(0);
  }, 120_000);

  it("unwinds expected failures from the service and converts them only at the interactor", async () => {
    const w = await workspace();
    const input = await roleInput(w);

    const unwound = await w.as(w.member, () => getRoleManagementService().upsert(input)).catch((error) => error);
    expect(failureUnwindCause(unwound)).toMatchObject({ code: "permissionDenied", failureKind: "authorization" });
    await expect(w.as(w.member, () => getRoleManagementService().read())).rejects.toThrow("permissionDenied");

    expect(await w.as(w.member, () => getUpsertRoleInteractor().invoke(input))).toMatchObject({
      ok: false,
      error: { issues: [{ params: { error: "permissionDenied", kind: "authorization" } }] },
    });

    const saved = await w.as(w.admin, () => getRoleManagementService().upsert(input));
    expect(saved).toMatchObject({ role: { name: input.name }, schemaRevision: input.expectedRevision + 1 });
    expect(await w.as(w.admin, () => getUpsertRoleInteractor().invoke(input))).toEqual({
      ok: true,
      data: saved,
    });
  }, 120_000);

  it("lets an unexpected failure after a write escape the interactor and rolls the write back", async () => {
    const w = await workspace();
    const created = await w.as(w.admin, async () => getUpsertRoleInteractor().invoke(await roleInput(w)));
    if (!created.ok) throw new Error("The role could not be saved");
    const outage = new Error("Simulated audit failure");
    vi.spyOn(EventService.prototype, "publish").mockRejectedValue(outage);
    const revision = await w.revision();
    const deletion = { id: created.data.role.id, expectedRevision: revision, idempotencyKey: randomUUID() };

    await expect(w.as(w.admin, () => getDeleteRoleInteractor().invoke(deletion))).rejects.toBe(outage);
    expect(await runWithoutTenant(() => prisma.userRole.count({ where: { id: created.data.role.id } }))).toBe(1);
    expect(await w.revision()).toBe(revision);
    expect(await receipts(w, deletion.idempotencyKey)).toBe(0);
  }, 120_000);
});
