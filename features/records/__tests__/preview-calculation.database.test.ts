import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { CalculationExpression } from "../record-model.schema";
import type { TenantUser } from "@/features/user/user.schema";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";
import { interactorFailureStatus } from "@/core/validation/validation.utils";

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
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
}));

const { prisma } = await import("@/prisma/db");
const { runWithTenant, runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { runInTransaction } = await import("@/core/decorators/transaction-runner");
const { PermissionService } = await import("@/core/base/permission.service");
const { PrismaRecordRepo } = await import("../prisma-record.repository");
const { PrismaUserRepo } = await import("@/features/user/prisma-user.repository");
const { RecordAccessPolicy } = await import("../record-access");
const { RecordCalculationService } = await import("../record-calculation.service");
const { RecordWriteService } = await import("../record-write.service");
const { MutateRecordInteractor } = await import("../mutate-record.interactor");
const { PreviewCalculationInteractor } = await import("../preview-calculation.interactor");
const { createCrmPreset, presetId } = await import("../crm-preset");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

describeDatabase("Calculation preview", { timeout: 240_000 }, () => {
  let companyId = "";
  const id = (key: string) => presetId(companyId, key);
  const actors: Record<"admin" | "schema" | "reader", TenantUser> = {} as never;
  const repo = new PrismaRecordRepo();
  const policy = new RecordAccessPolicy(new PrismaUserRepo(new PermissionService()), repo);
  const calculations = new RecordCalculationService(repo);
  const preview = new PreviewCalculationInteractor(repo, policy, calculations);
  const mutate = new MutateRecordInteractor(repo, policy, new RecordWriteService(repo, policy, calculations), {
    dispatch: () => Promise.resolve(),
  });
  const recordIds: string[] = [];

  beforeAll(async () => {
    const seed = await runWithoutTenant(async () => {
      const created = await prisma.company.create({ data: {} });
      const role = (name: string, isSystemRole = false) =>
        prisma.userRole.create({
          data: { companyId: created.id, name, isSystemRole },
        });
      const roles = {
        admin: await role("Administrator", true),
        schema: await role("Schema"),
        reader: await role("Reader"),
      };
      await prisma.rolePermission.createMany({
        data: (["update", "readOwn", "readAll"] as const).map((action) => ({
          companyId: created.id,
          roleId: roles.schema.id,
          resource: "dataModel" as const,
          action,
        })),
      });
      const users = Object.fromEntries(
        await Promise.all(
          Object.entries(roles).map(async ([key, value]) => [
            key,
            await prisma.user.create({
              data: {
                companyId: created.id,
                roleId: value.id,
                firstName: key,
                lastName: "Test",
                email: `${randomUUID()}@example.test`,
                status: "active",
              },
            }),
          ]),
        ),
      ) as Record<keyof typeof roles, { id: string }>;
      return { company: created, roles, users };
    });
    companyId = seed.company.id;
    for (const key of Object.keys(seed.roles) as Array<keyof typeof seed.roles>) {
      actors[key] = createMockUser({
        ...(await runWithoutTenant(() => prisma.user.findUniqueOrThrow({ where: { id: seed.users[key].id } }))),
        role: { ...seed.roles[key], permissions: [] },
      });
    }
    const model = createCrmPreset(companyId);
    await runWithTenant(actors.admin, () =>
      runInTransaction(() => repo.saveModel(model, actors.admin.id), {
        timeout: 30_000,
      }),
    );
    for (const name of ["Ada", "Grace"]) {
      const result = await runWithTenant(actors.admin, async () =>
        mutate.invoke({
          expectedRevision: (await repo.getModel()).revision,
          idempotencyKey: randomUUID(),
          mutation: {
            action: "create",
            typeId: id("contact"),
            fields: [
              {
                fieldId: id("contact.firstName"),
                value: { kind: "text", value: name },
              },
            ],
            assignedUserIds: [],
          },
        }),
      );
      expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
    }
    const refs = await runWithTenant(actors.admin, () => repo.getRecordRefsCompanyWide(id("contact")));
    recordIds.push(...refs.map((ref) => ref.recordId));
  });

  afterAll(async () => {
    if (companyId) await runWithoutTenant(() => prisma.company.delete({ where: { id: companyId } }));
  });

  const greeting = (): CalculationExpression => ({
    kind: "operation",
    operator: "concat",
    arguments: [
      { kind: "field", fieldId: id("contact.firstName") },
      { kind: "literal", value: { kind: "text", value: "!" } },
    ],
  });
  const organizations = (): CalculationExpression => ({
    kind: "related",
    relationId: id("contact.organizations"),
    direction: "outgoing",
    reducer: "count",
    expression: { kind: "literal", value: null },
  });

  it("evaluates an unsaved expression on a real record and switches to another example", async () => {
    const first = await runWithTenant(actors.admin, () =>
      preview.invoke({ typeId: id("contact"), expression: greeting() }),
    );
    if (!first.ok) throw new Error(JSON.stringify(first.error));
    expect(first.data.examples).toHaveLength(2);
    expect(first.data.recordId).toBe(recordIds[0]);
    const other = recordIds[1];
    const second = await runWithTenant(actors.admin, () =>
      preview.invoke({
        typeId: id("contact"),
        expression: greeting(),
        recordId: other,
      }),
    );
    if (!second.ok) throw new Error(JSON.stringify(second.error));
    expect(second.data.recordId).toBe(other);
    const values = [first.data.value, second.data.value].map((value) =>
      value?.state === "value" && value.value.kind === "text" ? value.value.value : null,
    );
    expect(values.sort()).toEqual(["Ada!", "Grace!"]);
    const counted = await runWithTenant(actors.admin, () =>
      preview.invoke({ typeId: id("contact"), expression: organizations() }),
    );
    expect(counted).toMatchObject({
      ok: true,
      data: {
        value: { state: "value", value: { kind: "decimal", value: "0" } },
      },
    });
  });

  it("returns only a restricted state to a schema manager who cannot read every involved list fully", async () => {
    const result = await runWithTenant(actors.schema, () =>
      preview.invoke({ typeId: id("contact"), expression: greeting() }),
    );
    expect(result).toEqual({
      ok: true,
      data: { examples: [], recordId: null, value: { state: "restricted" } },
    });
  });

  it("refuses members without Data model edit", async () => {
    const result = await runWithTenant(actors.reader, () =>
      preview.invoke({ typeId: id("contact"), expression: organizations() }),
    );
    expect(!result.ok && interactorFailureStatus(result.error)).toBe(403);
  });
});
