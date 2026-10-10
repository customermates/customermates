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
const { DraftCalculationInteractor } = await import("../draft-calculation.interactor");
const { createCrmPreset, presetId } = await import("@/features/records/crm-preset");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

describeDatabase("Calculation draft", { timeout: 240_000 }, () => {
  let companyId = "";
  const id = (key: string) => presetId(companyId, key);
  const actors: Record<"admin" | "reader", TenantUser> = {} as never;
  const repo = new PrismaRecordRepo();
  const policy = new RecordAccessPolicy(new PrismaUserRepo(new PermissionService()), repo);
  const grant = { purpose: "calculationDraft" };
  const reservation = { id: "reservation", grant, reservedMicrocents: 1_000, reservedAt: new Date() };
  const usage = {
    prepareRetrieval: vi.fn(),
    reserveRetrieval: vi.fn(),
    settleRetrieval: vi.fn(),
    getUsageSummary: vi.fn(),
  };
  const entitlements = { require: vi.fn() };
  const draft = new DraftCalculationInteractor(repo, policy, usage as never, entitlements as never);

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
  });

  const describeTotal = () =>
    runWithTenant(actors.admin, () =>
      draft.invoke({ typeId: id("deal"), description: "Total of the line item amounts" }),
    );

  it("drafts a validated expression from aliases and settles the measured charge", async () => {
    const charge = { model: "m", inputTokens: 10, costMicrocents: 42, costSource: "measured" };
    model.generate.mockImplementation(({ prompt }: { prompt: string }) => {
      const relation = /\b(r\d+) incoming: Line items/.exec(prompt)?.[1];
      const amount = /\b(f\d+): Amount/.exec(prompt)?.[1];
      return Promise.resolve({
        output: {
          source: "rollup",
          expression: JSON.stringify({
            kind: "related",
            relationId: relation,
            direction: "incoming",
            reducer: "sum",
            expression: { kind: "field", fieldId: amount },
          }),
        },
        charge,
      });
    });
    const result = await describeTotal();
    expect(result).toEqual({
      ok: true,
      data: {
        draft: {
          source: "rollup",
          expression: {
            kind: "related",
            relationId: id("lineItem.deal"),
            direction: "incoming",
            reducer: "sum",
            expression: { kind: "field", fieldId: id("lineItem.amount") },
          },
        },
      },
    });
    expect(usage.prepareRetrieval).toHaveBeenCalledWith(actors.admin.id, expect.any(Date), "calculationDraft");
    expect(usage.settleRetrieval).toHaveBeenCalledWith({ reservation, charge });
  });

  it("asks the model with the short draft timeout", async () => {
    model.generate.mockResolvedValue({ output: null, charge: null });
    await describeTotal();
    expect(model.generate).toHaveBeenCalledWith(expect.objectContaining({ timeoutMs: 8_000 }));
  });

  it("refuses a field of another list", async () => {
    const result = await runWithTenant(actors.admin, () =>
      draft.invoke({ typeId: id("deal"), fieldId: id("contact.firstName"), description: "Total" }),
    );
    expect(!result.ok && interactorFailureStatus(result.error)).toBe(404);
    expect(model.generate).not.toHaveBeenCalled();
  });

  it("returns no draft for an invalid answer and still settles", async () => {
    model.generate.mockResolvedValue({
      output: { source: "formula", expression: '{"kind":"field","fieldId":"f999"}' },
      charge: null,
    });
    expect(await describeTotal()).toEqual({ ok: true, data: { draft: null } });
    expect(usage.settleRetrieval).toHaveBeenCalledWith({ reservation, charge: null });
  });

  it("refuses without credits or when hosted AI is unavailable and calls no model", async () => {
    usage.prepareRetrieval.mockResolvedValue(null);
    usage.getUsageSummary.mockResolvedValue({ blockedReason: "credits_exhausted" });
    const exhausted = await describeTotal();
    expect(!exhausted.ok && interactorFailureStatus(exhausted.error)).toBe(429);
    usage.getUsageSummary.mockResolvedValue({ blockedReason: null });
    const unavailable = await describeTotal();
    expect(unavailable.ok).toBe(false);
    expect(!unavailable.ok && interactorFailureStatus(unavailable.error)).not.toBe(429);
    expect(model.generate).not.toHaveBeenCalled();
  });

  it("keeps deleted lists and their relationships out of the prompt", async () => {
    model.generate.mockResolvedValue({ output: null, charge: null });
    await describeTotal();
    expect(model.generate.mock.calls[0][0].prompt).toContain("Organizations");
    await runWithTenant(actors.admin, async () => {
      const current = await repo.getModel();
      const archived = {
        ...current,
        types: current.types.map((type) => (type.id === id("organization") ? { ...type, archived: true } : type)),
      };
      await runInTransaction(() => repo.saveModel(archived, actors.admin.id), { timeout: 30_000 });
    });
    model.generate.mockClear();
    await describeTotal();
    expect(model.generate.mock.calls[0][0].prompt).not.toContain("Organizations");
  });

  it("refuses members without Data model edit and denied entitlements", async () => {
    const reader = await runWithTenant(actors.reader, () => draft.invoke({ typeId: id("deal"), description: "Total" }));
    expect(!reader.ok && interactorFailureStatus(reader.error)).toBe(403);
    entitlements.require.mockResolvedValue({ ok: false, error: new Error("denied"), code: "agentChatRequiresCloud" });
    expect((await describeTotal()).ok).toBe(false);
    expect(model.generate).not.toHaveBeenCalled();
  });
});
