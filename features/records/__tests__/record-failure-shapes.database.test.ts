import { randomUUID } from "node:crypto";

import { createTranslator } from "next-intl";
import { afterAll, describe, expect, it, vi } from "vitest";

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
await import("@/features/mcp-tools/tool-registry");
const { createRestRouteWorkspace, postAs, restRoute } = await import("@/tests/helpers/rest-route-workspace");
const { executeMcpTool } = await import("@/features/mcp-tools/mcp-tool");
const { mutateRecordV2Tool } = await import("@/features/mcp-tools/record-model.mcp-tools");
const { manageRolesTool } = await import("@/features/mcp-tools/role.mcp-tools");
const { RecordCalculationService } = await import("../record-calculation.service");
const { createCrmPreset } = await import("../crm-preset");
const { prisma } = await import("@/prisma/db");
const { runWithoutTenant } = await import("@/core/decorators/tenant-context");
const recordActions = await import("@/app/[locale]/(protected)/records/actions");
const settingsActions = await import("@/app/[locale]/(protected)/settings/(workspace)/actions");
const mutateRoute = await restRoute("/v1/records/mutate");
const applyRoute = await restRoute("/v1/model/apply");
const saveRoleRoute = await restRoute("/v1/roles/save");
const deleteRoleRoute = await restRoute("/v1/roles/delete");
const operationStatusRoute = await restRoute("/v1/operations/status");
const cancelOperationRoute = await restRoute("/v1/operations/cancel");
const resumeOperationRoute = await restRoute("/v1/operations/resume");

type Workspace = Awaited<ReturnType<typeof createRestRouteWorkspace>>;
type Kind = "validation" | "authorization" | "not_found" | "conflict";

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const cleanups: Array<() => Promise<unknown>> = [];
const STATUS: Record<Kind, number> = { validation: 400, authorization: 403, not_found: 404, conflict: 409 };

afterAll(async () => {
  for (const cleanup of cleanups) await cleanup();
});

async function workspace() {
  const created = await createRestRouteWorkspace();
  cleanups.push(created.cleanup);
  return created;
}

function failure(
  kind: Kind,
  code: keyof typeof messages.Common.errors,
  path: Array<string | number> = [],
  message: string = messages.Common.errors[code],
) {
  return {
    kind,
    issues: [{ code: "custom", path, message, customCode: code }],
  };
}

async function expectRest(
  w: Workspace,
  user: Workspace["admin"],
  route: Parameters<typeof postAs>[2],
  body: unknown,
  expected: ReturnType<typeof failure>,
) {
  expect(await postAs(w, user, route, body)).toEqual({ status: STATUS[expected.kind], body: { error: expected } });
}

async function expectMcp(
  w: Workspace,
  user: Workspace["admin"],
  tool: typeof mutateRecordV2Tool | typeof manageRolesTool,
  input: unknown,
  expected: ReturnType<typeof failure>,
) {
  const result = await w.as(user, () => executeMcpTool(tool as never, [tool.inputSchema.parse(input)]));
  expect(result).toEqual({ ok: false, result: expect.any(String), failure: expected });
  if (result.ok) throw new Error("The tool unexpectedly succeeded");
  expect(result.result).toContain(expected.issues[0].message);
}

function expectRoleAction(result: unknown, expected: ReturnType<typeof failure>) {
  expect(result).toEqual({
    ok: false,
    error: { errors: [expected.issues[0].message] },
    code: expected.issues[0].customCode,
  });
}

function nameField(w: Workspace, typeKey: string) {
  return w.id(`${typeKey}.name`);
}

describeDatabase("record write failure shapes across REST, MCP and UI", () => {
  it("pins permission, not found and validation failures of a record mutation", async () => {
    const w = await workspace();
    const create = async (value: { kind: "text"; value: string }) => ({
      expectedRevision: await w.revision(),
      idempotencyKey: randomUUID(),
      mutation: { action: "create", typeId: w.id("deal"), fields: [{ fieldId: nameField(w, "deal"), value }] },
    });
    const denied = failure("authorization", "permissionDenied");
    await expectRest(w, w.member, mutateRoute, await create({ kind: "text", value: "Denied" }), denied);
    await expectMcp(w, w.member, mutateRecordV2Tool, await create({ kind: "text", value: "Denied" }), denied);
    expect(
      await w.as(w.member, async () =>
        recordActions.mutateRecordAction((await create({ kind: "text", value: "Denied" })) as never),
      ),
    ).toMatchObject({ ok: false, failure: denied });

    const missing = async () => ({
      expectedRevision: await w.revision(),
      idempotencyKey: randomUUID(),
      mutation: {
        action: "update",
        ref: { typeId: w.id("deal"), recordId: randomUUID() },
        expectedVersion: 1,
        fields: [{ fieldId: nameField(w, "deal"), value: { kind: "text", value: "Missing" } }],
      },
    });
    const notFound = failure("not_found", "recordNotFound");
    await expectRest(w, w.admin, mutateRoute, await missing(), notFound);
    await expectMcp(w, w.admin, mutateRecordV2Tool, await missing(), notFound);
    expect(await w.as(w.admin, async () => recordActions.mutateRecordAction((await missing()) as never))).toMatchObject(
      { ok: false, failure: notFound },
    );

    const invalid = failure(
      "validation",
      "recordValueRequired",
      ["mutation", "fields", 0, "value"],
      messages.Common.errors.recordValueRequired.replace("{field}", "Name"),
    );
    await expectRest(w, w.admin, mutateRoute, await create({ kind: "text", value: "   " }), invalid);
    await expectMcp(w, w.admin, mutateRecordV2Tool, await create({ kind: "text", value: "   " }), invalid);
    expect(
      await w.as(w.admin, async () =>
        recordActions.mutateRecordAction((await create({ kind: "text", value: "   " })) as never),
      ),
    ).toMatchObject({ ok: false, failure: invalid });

    const contact = async (avatar: string) => ({
      expectedRevision: await w.revision(),
      idempotencyKey: randomUUID(),
      mutation: {
        action: "create",
        typeId: w.id("contact"),
        fields: [
          { fieldId: w.id("contact.firstName"), value: { kind: "text", value: "Ada" } },
          { fieldId: w.id("contact.avatarUrl"), value: { kind: "text", value: avatar } },
        ],
      },
    });
    const invalidUrl = failure("validation", "invalidUrl", ["mutation", "fields", 1, "value"]);
    await expectRest(w, w.admin, mutateRoute, await contact("not a url"), invalidUrl);
    await expectMcp(w, w.admin, mutateRecordV2Tool, await contact("not a url"), invalidUrl);
    expect(
      await w.as(w.admin, async () => recordActions.mutateRecordAction((await contact("not a url")) as never)),
    ).toMatchObject({ ok: false, failure: invalidUrl });
  }, 180_000);

  it("pins permission, not found and conflict failures of role management", async () => {
    const w = await workspace();
    const memberRoleId = w.member.roleId as string;
    const adminRoleId = w.admin.roleId as string;
    const roleInput = async () => ({
      name: `Role ${randomUUID()}`,
      description: "Pinned failure shapes",
      expectedRevision: await w.revision(),
      idempotencyKey: randomUUID(),
      recordGrants: [],
      permissions: [],
    });
    const deletion = async (id: string, revisionOffset = 0) => ({
      id,
      expectedRevision: (await w.revision()) + revisionOffset,
      idempotencyKey: randomUUID(),
    });

    const denied = failure("authorization", "permissionDenied");
    await expectRest(w, w.member, saveRoleRoute, await roleInput(), denied);
    await expectMcp(w, w.member, manageRolesTool, { action: "save", role: await roleInput() }, denied);
    expectRoleAction(
      await w.as(w.member, async () => settingsActions.upsertRoleAction((await roleInput()) as never)),
      denied,
    );

    const notFound = failure("not_found", "roleNotFound");
    await expectRest(w, w.admin, deleteRoleRoute, await deletion(randomUUID()), notFound);
    await expectMcp(
      w,
      w.admin,
      manageRolesTool,
      { action: "delete", deletion: await deletion(randomUUID()) },
      notFound,
    );
    expectRoleAction(
      await w.as(w.admin, async () => settingsActions.deleteRoleAction(await deletion(randomUUID()))),
      notFound,
    );

    const assigned = failure("conflict", "roleAssignedCannotDelete");
    await expectRest(w, w.admin, deleteRoleRoute, await deletion(memberRoleId), assigned);
    await expectMcp(
      w,
      w.admin,
      manageRolesTool,
      { action: "delete", deletion: await deletion(memberRoleId) },
      assigned,
    );
    expectRoleAction(
      await w.as(w.admin, async () => settingsActions.deleteRoleAction(await deletion(memberRoleId))),
      assigned,
    );

    const stale = failure("conflict", "recordSchemaChanged");
    await expectRest(w, w.admin, deleteRoleRoute, await deletion(memberRoleId, -1), stale);
    await expectMcp(
      w,
      w.admin,
      manageRolesTool,
      { action: "delete", deletion: await deletion(memberRoleId, -1) },
      stale,
    );

    const self = failure("authorization", "roleSelfEditForbidden");
    await expectRest(w, w.admin, deleteRoleRoute, await deletion(adminRoleId), self);
    expect(
      await runWithoutTenant(() => prisma.userRole.count({ where: { id: { in: [memberRoleId, adminRoleId] } } })),
    ).toBe(2);
  }, 180_000);

  it("pins the unique name and calculation budget failures of a configuration change", async () => {
    const w = await workspace();
    const preset = createCrmPreset(w.companyId);
    const field = (key: string) => {
      const found = preset.fields.find((candidate) => candidate.id === w.id(key));
      if (!found) throw new Error(`Missing preset field ${key}`);
      return Object.fromEntries(
        Object.entries(found).filter(([key]) => key !== "publishedSummary" && key !== "archived"),
      );
    };
    const change = async (label: string) => ({
      expectedRevision: await w.revision(),
      idempotencyKey: randomUUID(),
      operations: [{ operation: "putField", field: { ...field("deal.totalValue"), label } }],
    });

    const duplicate = failure("validation", "recordConfigurationInvalid");
    const taken = preset.fields.find((candidate) => candidate.id === nameField(w, "deal"))?.label ?? "";
    await expectRest(w, w.admin, applyRoute, await change(taken), duplicate);
    expect(
      await w.as(w.admin, async () => recordActions.applyRecordConfigurationAction((await change(taken)) as never)),
    ).toMatchObject({ ok: false, failure: duplicate });

    const budget = failure("conflict", "recordCalculationBudget");
    const recalculate = vi
      .spyOn(RecordCalculationService.prototype, "recalculate")
      .mockResolvedValue({ complete: false, changed: [] });
    try {
      await expectRest(w, w.admin, applyRoute, await change(`Value ${randomUUID()}`), budget);
      expect(
        await w.as(w.admin, async () =>
          recordActions.applyRecordConfigurationAction((await change(`Value ${randomUUID()}`)) as never),
        ),
      ).toMatchObject({ ok: false, failure: budget });
    } finally {
      recalculate.mockRestore();
    }
  }, 180_000);

  it("answers an unknown or foreign role id in a configuration change with roleNotFound at its grant", async () => {
    const w = await workspace();
    const foreign = await workspace();
    const grants = (roleId: string) => [
      { roleId: w.member.roleId ?? "", actions: ["readOwn"] },
      { roleId, actions: ["readAll"] },
    ];
    const change = async (operations: unknown[]) => ({
      expectedRevision: await w.revision(),
      idempotencyKey: randomUUID(),
      operations,
    });
    for (const roleId of [randomUUID(), foreign.member.roleId ?? ""]) {
      await expectRest(
        w,
        w.admin,
        applyRoute,
        await change([{ operation: "setTypeGrants", typeId: w.id("deal"), grants: grants(roleId) }]),
        failure("not_found", "roleNotFound", ["operations", 0, "grants", 1, "roleId"]),
      );
      await expectRest(
        w,
        w.admin,
        applyRoute,
        await change([
          {
            operation: "putAccessPreset",
            preset: { id: randomUUID(), label: "Partners", grants: grants(roleId), archived: false },
          },
        ]),
        failure("not_found", "roleNotFound", ["operations", 0, "preset", "grants", 1, "roleId"]),
      );
    }
  }, 180_000);

  it("answers an unknown background operation with recordOperationNotFound at operationId", async () => {
    const w = await workspace();
    const missing = failure("not_found", "recordOperationNotFound", ["operationId"]);
    for (const route of [operationStatusRoute, cancelOperationRoute, resumeOperationRoute])
      await expectRest(w, w.admin, route, { operationId: randomUUID() }, missing);
  }, 180_000);
});
