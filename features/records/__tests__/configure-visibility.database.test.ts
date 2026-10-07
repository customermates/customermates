import { randomUUID } from "node:crypto";
import { omit } from "lodash";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { ConfigurationChange } from "../configuration.schema";
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
const { RecordConfigurationService } = await import("../configuration.service");
const { RecordConfigurationWriter } = await import("../record-configuration-writer");
const { RecordWriteService } = await import("../record-write.service");
const { MutateRecordInteractor } = await import("../mutate-record.interactor");
const { GetRecordModelInteractor } = await import("../get-record-model.interactor");
const { DiscoverRecordTypesInteractor } = await import("../discover-record-types.interactor");
const { PreviewRecordConfigurationInteractor } = await import("../preview-record-configuration.interactor");
const { ApplyRecordConfigurationInteractor } = await import("../configure-records.interactor");
const { createCrmPreset, presetId } = await import("../crm-preset");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

describeDatabase("Configure visibility per role", { timeout: 240_000 }, () => {
  let companyId = "";
  let archivedTypeId = "";
  const id = (key: string) => presetId(companyId, key);
  const actors: Record<"admin" | "schema" | "grants" | "reader" | "restricted", TenantUser> = {} as never;
  const roleIds: Record<string, string> = {};
  const repo = new PrismaRecordRepo();
  const policy = new RecordAccessPolicy(new PrismaUserRepo(new PermissionService()), repo);
  const calculations = new RecordCalculationService(repo);
  const company = { getDetails: () => Promise.resolve({ currency: "EUR" }) };
  const background = { dispatch: () => Promise.resolve() };
  const configurations = new RecordConfigurationService(repo);
  const getModel = new GetRecordModelInteractor(repo, policy);
  const discover = new DiscoverRecordTypesInteractor(repo, policy);
  const preview = new PreviewRecordConfigurationInteractor(repo, policy, configurations);
  const apply = new ApplyRecordConfigurationInteractor(
    repo,
    policy,
    configurations,
    new RecordConfigurationWriter(repo, calculations),
    company,
    background,
  );
  const mutate = new MutateRecordInteractor(
    repo,
    policy,
    new RecordWriteService(repo, policy, calculations),
    company,
    background,
  );

  const rename = (expectedRevision: number): ConfigurationChange => ({
    expectedRevision,
    idempotencyKey: randomUUID(),
    operations: [
      {
        operation: "putField",
        field: {
          ...omit(
            createCrmPreset(companyId, "EUR").fields.find((field) => field.id === id("contact.notes")),
            ["publishedSummary"],
          ),
          label: `Notes ${randomUUID()}`,
        },
      },
    ],
  });

  beforeAll(async () => {
    const seed = await runWithoutTenant(async () => {
      const created = await prisma.company.create({ data: {} });
      const role = (name: string, isSystemRole = false) =>
        prisma.userRole.create({ data: { companyId: created.id, name, isSystemRole } });
      const roles = {
        admin: await role("Administrator", true),
        schema: await role("Schema manager"),
        grants: await role("Grant manager"),
        reader: await role("Assigned reader"),
        restricted: await role("Restricted"),
      };
      await prisma.rolePermission.createMany({
        data: [
          { companyId: created.id, roleId: roles.schema.id, resource: "dataModel", action: "update" },
          ...(["update", "readAll"] as const).map((action) => ({
            companyId: created.id,
            roleId: roles.grants.id,
            resource: "users" as const,
            action,
          })),
          ...(["readOwn", "readAll"] as const).map((action) => ({
            companyId: created.id,
            roleId: roles.schema.id,
            resource: "dataModel" as const,
            action,
          })),
        ],
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
      roleIds[key] = seed.roles[key].id;
      actors[key] = createMockUser({
        ...(await runWithoutTenant(() => prisma.user.findUniqueOrThrow({ where: { id: seed.users[key].id } }))),
        role: { ...seed.roles[key], permissions: [] },
      });
    }
    const model = createCrmPreset(companyId, "EUR");
    await runWithTenant(actors.admin, () =>
      runInTransaction(() => repo.saveModel(model, actors.admin.id), { timeout: 30_000 }),
    );
    const created = await runWithTenant(actors.admin, () =>
      apply.invoke({
        expectedRevision: model.revision,
        idempotencyKey: randomUUID(),
        operations: [
          {
            operation: "createType",
            reference: "$archived",
            label: "Retired",
            pluralLabel: "Retired",
            description: "",
            icon: "list",
            embedded: false,
            accessPresetId: null,
          },
        ],
      }),
    );
    expect(created, JSON.stringify(created)).toMatchObject({ ok: true });
    const current = await runWithTenant(actors.admin, () => repo.getModel());
    const retired = current.types.find((type) => type.label === "Retired");
    if (!retired) throw new Error("The retired list fixture is missing");
    archivedTypeId = retired.id;
    const archived = await runWithTenant(actors.admin, () =>
      apply.invoke({
        expectedRevision: current.revision,
        idempotencyKey: randomUUID(),
        operations: [
          { operation: "putType", type: { ...retired, archived: true } },
          ...current.capabilities
            .filter((binding) => binding.kind === "channels" && binding.typeId === retired.id)
            .map((binding) => ({ operation: "putCapability" as const, capability: { ...binding, enabled: false } })),
          ...current.activityPaths
            .filter((path) => path.typeId === retired.id)
            .map((path) => ({ operation: "putActivityPath" as const, activityPath: { ...path, archived: true } })),
        ],
      }),
    );
    expect(archived, JSON.stringify(archived)).toMatchObject({ ok: true });
    await runWithoutTenant(() =>
      prisma.recordTypeGrant.create({
        data: { companyId, typeId: id("contact"), roleId: seed.roles.reader.id, actions: ["readOwn"] },
      }),
    );
    for (const assignedUserIds of [[actors.reader.id], []]) {
      const result = await runWithTenant(actors.admin, async () =>
        mutate.invoke({
          expectedRevision: (await repo.getModel()).revision,
          idempotencyKey: randomUUID(),
          mutation: {
            action: "create",
            typeId: id("contact"),
            fields: [{ fieldId: id("contact.firstName"), value: { kind: "text", value: randomUUID() } }],
            assignedUserIds,
          },
        }),
      );
      expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
    }
  });

  afterAll(async () => {
    if (companyId) await runWithoutTenant(() => prisma.company.delete({ where: { id: companyId } }));
  });

  const modelFor = async (actor: TenantUser) => {
    const result = await runWithTenant(actor, () => getModel.invoke({}));
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    return result.data;
  };
  const catalogFor = async (actor: TenantUser) => {
    const result = await runWithTenant(actor, () => discover.invoke({ includeEmbedded: true, page: 1, pageSize: 100 }));
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    return result.data;
  };

  it("gives the assigned reader only the readable list, its fields and no access presets", async () => {
    const model = await modelFor(actors.reader);
    expect(model.types.map((type) => type.id)).toEqual([id("contact")]);
    expect(model.fields.map((field) => field.id)).toContain(id("contact.firstName"));
    expect(model.fields.every((field) => field.typeId === id("contact"))).toBe(true);
    expect(model.relationships).toEqual([]);
    expect(model.accessPresets).toEqual([]);
    expect(model.activityPaths.every((path) => path.typeId === id("contact"))).toBe(true);
    expect(model.capabilities.every((binding) => binding.typeId === id("contact"))).toBe(true);
  });

  it("gives the restricted role no lists at all", async () => {
    const model = await modelFor(actors.restricted);
    expect(model.types).toEqual([]);
    expect(model.fields).toEqual([]);
    expect(model.relationships).toEqual([]);
    expect((await catalogFor(actors.restricted)).types).toEqual([]);
  });

  it("gives the schema manager, the grant manager and the admin the whole model", async () => {
    const all = (await modelFor(actors.admin)).types.map((type) => type.id).sort();
    expect((await modelFor(actors.schema)).types.map((type) => type.id).sort()).toEqual(all);
    expect((await modelFor(actors.grants)).types.map((type) => type.id).sort()).toEqual(all);
    expect(all).toContain(id("deal"));
  });

  it("counts only the reader's own records and never counts lists the caller cannot read", async () => {
    const reader = await catalogFor(actors.reader);
    expect(reader.canManageSchema).toBe(false);
    expect(reader.types.map((type) => [type.id, type.recordCount])).toEqual([[id("contact"), 1]]);

    const schema = await catalogFor(actors.schema);
    expect(schema.canManageSchema).toBe(true);
    expect(schema.types.find((type) => type.id === id("contact"))?.recordCount).toBeNull();
    expect(schema.types.every((type) => type.recordCount === null)).toBe(true);

    const admin = await catalogFor(actors.admin);
    expect(admin.types.find((type) => type.id === id("contact"))?.recordCount).toBe(2);
  });

  it("never lists an archived list in the catalog, even for the admin", async () => {
    for (const actor of [actors.admin, actors.schema, actors.reader]) {
      const catalog = await catalogFor(actor);
      expect(catalog.types.some((type) => type.id === archivedTypeId)).toBe(false);
    }
  });

  it("refuses previews and changes to members without Data model edit and allows the schema manager", async () => {
    for (const actor of [actors.reader, actors.restricted]) {
      const revision = (await modelFor(actors.admin)).revision;
      const previewed = await runWithTenant(actor, () => preview.invoke(rename(revision)));
      expect(!previewed.ok && interactorFailureStatus(previewed.error), JSON.stringify(previewed)).toBe(403);
      const applied = await runWithTenant(actor, () => apply.invoke(rename(revision)));
      expect(!applied.ok && interactorFailureStatus(applied.error)).toBe(403);
    }
    const revision = (await modelFor(actors.admin)).revision;
    expect(await runWithTenant(actors.schema, () => preview.invoke(rename(revision)))).toMatchObject({ ok: true });
    expect(await runWithTenant(actors.schema, () => apply.invoke(rename(revision)))).toMatchObject({
      ok: true,
      data: { status: "completed" },
    });
  });

  it("lets the grant manager change only grants and keeps grants and summaries away from the schema manager", async () => {
    const grantDeal = (expectedRevision: number): ConfigurationChange => ({
      expectedRevision,
      idempotencyKey: randomUUID(),
      operations: [
        {
          operation: "setTypeGrants",
          typeId: id("deal"),
          grants: [{ roleId: roleIds.restricted, actions: ["readAll"] }],
        },
      ],
    });
    const denied = async (actor: TenantUser, change: ConfigurationChange) => {
      const result = await runWithTenant(actor, () => apply.invoke(change));
      expect(!result.ok && interactorFailureStatus(result.error), JSON.stringify(result)).toBe(403);
    };
    const revision = async () => (await modelFor(actors.admin)).revision;

    await denied(actors.grants, rename(await revision()));
    await denied(actors.schema, grantDeal(await revision()));
    await denied(actors.schema, {
      expectedRevision: await revision(),
      idempotencyKey: randomUUID(),
      operations: [
        { operation: "publishSummary", fieldId: id("contact.name"), published: true, dependencyHash: "0".repeat(64) },
      ],
    });

    const granted = await runWithTenant(actors.grants, async () => apply.invoke(grantDeal(await revision())));
    expect(granted, JSON.stringify(granted)).toMatchObject({ ok: true, data: { status: "completed" } });
    expect((await modelFor(actors.restricted)).types.map((type) => type.id).sort()).toEqual(
      [id("deal"), id("lineItem")].sort(),
    );
  });
});
