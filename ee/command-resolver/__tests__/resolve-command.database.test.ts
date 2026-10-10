import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { TenantUser } from "@/features/user/user.schema";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";
import { interactorFailureStatus } from "@/core/validation/validation.utils";

const model = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("@/ee/agent-chat/structured-model-call", () => ({
  generateStructuredObject: model.generate,
  structuredCallWorstCaseMicrocents: () => 1_000,
}));
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
const { PrismaRecordRepo } = await import("@/features/records/prisma-record.repository");
const { PrismaUserRepo } = await import("@/features/user/prisma-user.repository");
const { RecordAccessPolicy } = await import("@/features/records/record-access");
const { ResolveCommandInteractor } = await import("../resolve-command.interactor");
const { createCrmPreset, presetId } = await import("@/features/records/crm-preset");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

type Prompted = { prompt: string };

function alias(prompt: string, pattern: RegExp): string {
  const found = pattern.exec(prompt)?.[1];
  if (!found) throw new Error(`No alias for ${pattern.source}`);
  return found;
}

describeDatabase("Command resolver", { timeout: 240_000 }, () => {
  let companyId = "";
  const id = (key: string) => presetId(companyId, key);
  const actors: Record<"admin" | "reader", TenantUser> = {} as never;
  const repo = new PrismaRecordRepo();
  const policy = new RecordAccessPolicy(new PrismaUserRepo(new PermissionService()), repo);
  const views = { listRecordViewNames: vi.fn() };
  const grant = { purpose: "commandResolve" };
  const reservation = { id: "reservation", grant, reservedMicrocents: 1_000, reservedAt: new Date() };
  const usage = {
    prepareRetrieval: vi.fn(),
    reserveRetrieval: vi.fn(),
    settleRetrieval: vi.fn(),
    getUsageSummary: vi.fn(),
  };
  const entitlements = { require: vi.fn() };
  const resolver = new ResolveCommandInteractor(repo, policy, views as never, usage as never, entitlements as never);
  const secretTitle = `Confidential merger ${randomUUID()}`;

  beforeAll(async () => {
    const seed = await runWithoutTenant(async () => {
      const created = await prisma.company.create({ data: {} });
      const roles = {
        admin: await prisma.userRole.create({
          data: { companyId: created.id, name: "Administrator", isSystemRole: true },
        }),
        reader: await prisma.userRole.create({ data: { companyId: created.id, name: "Reader" } }),
      };
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
    const preset = createCrmPreset(companyId);
    await runWithTenant(actors.admin, () =>
      runInTransaction(() => repo.saveModel(preset, actors.admin.id), { timeout: 30_000 }),
    );
    await runWithoutTenant(async () => {
      const record = await prisma.crmRecord.create({
        data: { companyId, typeId: id("deal") },
      });
      await prisma.recordValue.create({
        data: {
          companyId,
          typeId: id("deal"),
          recordId: record.id,
          fieldId: id("deal.name"),
          state: "value",
          textValue: secretTitle,
          schemaRevision: 1,
        },
      });
    });
  });

  afterAll(async () => {
    if (companyId) await runWithoutTenant(() => prisma.company.delete({ where: { id: companyId } }));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    entitlements.require.mockResolvedValue(null);
    usage.prepareRetrieval.mockResolvedValue(grant);
    usage.reserveRetrieval.mockResolvedValue(reservation);
    usage.getUsageSummary.mockResolvedValue({ blockedReason: null });
    views.listRecordViewNames.mockResolvedValue([{ typeId: id("deal"), id: "view-open", name: "Open pipeline" }]);
  });

  const resolve = (query: string, actor: TenantUser = actors.admin) =>
    runWithTenant(actor, () => resolver.invoke({ query, locale: "en" }));

  it("resolves a request with conditions to a filtered list from names only and settles the charge", async () => {
    const charge = { model: "m", inputTokens: 10, costMicrocents: 42, costSource: "measured" };
    model.generate.mockImplementation(({ prompt }: Prompted) => {
      const stage = alias(prompt, /(F\d+) "Stage"/);
      return Promise.resolve({
        output: {
          kind: "list",
          list: alias(prompt, /(L\d+) "Deals"/),
          view: alias(prompt, /view (V\d+) "Open pipeline"/),
          command: null,
          filters: [
            { field: stage, operator: "in", values: [alias(prompt, new RegExp(`(${stage}O\\d+)=Qualified`))] },
            { field: alias(prompt, /(F\d+) "Value"/), operator: "gt", values: ["10000"] },
          ],
        },
        charge,
      });
    });
    expect(await resolve("qualified deals over 10k")).toEqual({
      ok: true,
      data: {
        kind: "list",
        typeId: id("deal"),
        viewId: "view-open",
        filters: [
          { field: id("deal.stage"), operator: "in", value: [id("deal.stage.qualified")] },
          { field: id("deal.totalValue"), operator: "gt", value: "10000" },
        ],
      },
    });
    const [{ prompt, system }] = model.generate.mock.calls[0] as [{ prompt: string; system: string }];
    expect(prompt).toContain("Request: qualified deals over 10k");
    expect(prompt + system).not.toContain(secretTitle);
    expect(usage.prepareRetrieval).toHaveBeenCalledWith(actors.admin.id, expect.any(Date), "commandResolve");
    expect(usage.settleRetrieval).toHaveBeenCalledWith({ reservation, charge });
  });

  it("resolves a page or setting to its stable command key and never offers sign out", async () => {
    model.generate.mockImplementation(({ prompt }: Prompted) =>
      Promise.resolve({
        output: {
          kind: "command",
          list: null,
          view: null,
          command: alias(prompt, /(C\d+) "Profile & preferences > Theme"/),
          filters: [],
        },
        charge: null,
      }),
    );
    expect(await resolve("make it dark please")).toEqual({
      ok: true,
      data: { kind: "command", key: "cmd:setting.profile.theme" },
    });
    const [{ prompt }] = model.generate.mock.calls[0] as [Prompted];
    expect(prompt).not.toContain("Sign Out");
  });

  it("rejects invented aliases and operators a field does not allow, and still settles", async () => {
    model.generate.mockImplementation(({ prompt }: Prompted) =>
      Promise.resolve({
        output: {
          kind: "list",
          list: alias(prompt, /(L\d+) "Deals"/),
          view: null,
          command: null,
          filters: [{ field: alias(prompt, /(F\d+) "Stage"/), operator: "gt", values: ["3"] }],
        },
        charge: null,
      }),
    );
    expect(await resolve("deals with stage above three")).toEqual({ ok: true, data: { kind: "none" } });
    model.generate.mockResolvedValue({
      output: { kind: "list", list: "L999", view: null, command: null, filters: [] },
      charge: null,
    });
    expect(await resolve("whatever list")).toEqual({ ok: true, data: { kind: "none" } });
    expect(usage.settleRetrieval).toHaveBeenCalledTimes(2);
  });

  it("offers only the lists a person may read", async () => {
    model.generate.mockResolvedValue({
      output: { kind: "none", list: null, view: null, command: null, filters: [] },
      charge: null,
    });
    await resolve("deals over 10k", actors.reader);
    const [{ prompt }] = model.generate.mock.calls[0] as [Prompted];
    expect(prompt).not.toContain('"Deals"');
    expect(prompt).not.toContain("Open pipeline");
  });

  it("refuses without credits or hosted AI and calls no model", async () => {
    usage.prepareRetrieval.mockResolvedValue(null);
    usage.getUsageSummary.mockResolvedValue({ blockedReason: "credits_exhausted" });
    const exhausted = await resolve("deals over 10k");
    expect(!exhausted.ok && interactorFailureStatus(exhausted.error)).toBe(429);
    usage.getUsageSummary.mockResolvedValue({ blockedReason: null });
    const unavailable = await resolve("deals over 10k");
    expect(!unavailable.ok && interactorFailureStatus(unavailable.error)).not.toBe(429);
    entitlements.require.mockResolvedValue({ ok: false, error: new Error("denied"), code: "agentChatRequiresCloud" });
    expect((await resolve("deals over 10k")).ok).toBe(false);
    expect(model.generate).not.toHaveBeenCalled();
  });
});
