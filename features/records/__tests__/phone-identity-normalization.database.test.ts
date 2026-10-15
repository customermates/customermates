import type { RecordIdentityProvider } from "@/generated/prisma";

import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";

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
const { createCrmPreset, presetId } = await import("@/features/records/crm-preset");
const { createTestRecordRepo, preloadTestRecordRepo } = await import("@/tests/helpers/record-repository");
const { NormalizePhoneIdentitiesInteractor } = await import("../normalize-phone-identities.interactor");
const { NormalizeCompanyPhoneIdentitiesInteractor } = await import("../normalize-company-phone-identities.interactor");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companies: string[] = [];

type Identity = {
  provider: RecordIdentityProvider;
  value: string;
  aliases?: string[];
  messagingId?: string;
  displayName?: string;
  records: string[];
};

async function workspace() {
  const seed = await runWithoutTenant(async () => {
    const company = await prisma.company.create({ data: {} });
    companies.push(company.id);
    const role = await prisma.userRole.create({
      data: { companyId: company.id, name: "Administrator", isSystemRole: true },
    });
    const user = await prisma.user.create({
      data: {
        companyId: company.id,
        roleId: role.id,
        firstName: "Test",
        lastName: "User",
        email: `${randomUUID()}@example.test`,
        status: "active",
      },
    });
    return { company, role, user };
  });
  const companyId = seed.company.id;
  const admin = createMockUser({ ...seed.user, role: { ...seed.role, permissions: [] } });
  const repo = createTestRecordRepo(companyId);
  await runWithTenant(admin, () =>
    runInTransaction(() => repo.saveModel(createCrmPreset(companyId), admin.id), { timeout: 30000 }),
  );
  const typeId = presetId(companyId, "contact");
  const record = () =>
    runWithoutTenant(async () => (await prisma.crmRecord.create({ data: { companyId, typeId, id: randomUUID() } })).id);
  const identity = (input: Identity) =>
    runWithoutTenant(async () => {
      const id = randomUUID();
      await prisma.recordIdentity.create({
        data: {
          companyId,
          id,
          provider: input.provider,
          channelClass: "phone",
          value: input.value,
          messagingId: input.messagingId ?? null,
          displayName: input.displayName ?? null,
          keys: {
            create: [
              ...new Set([input.value, ...(input.messagingId ? [input.messagingId] : []), ...(input.aliases ?? [])]),
            ].map((value) => ({ value })),
          },
          records: { create: input.records.map((recordId) => ({ typeId, recordId })) },
        },
      });
      return id;
    });
  return { companyId, typeId, repo, record, identity };
}

async function stored(companyId: string) {
  return runWithoutTenant(async () => {
    const identities = await prisma.recordIdentity.findMany({
      where: { companyId },
      orderBy: { id: "asc" },
      include: {
        keys: { where: { companyId }, select: { value: true } },
        records: { where: { companyId }, select: { recordId: true } },
      },
    });
    return identities.map(({ createdAt, updatedAt, ...identity }) => ({
      ...identity,
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
      keys: identity.keys.map((key) => key.value).sort(),
      records: identity.records.map((link) => link.recordId).sort(),
    }));
  });
}

async function owners(w: Awaited<ReturnType<typeof workspace>>, value: string) {
  return runWithoutTenant(async () =>
    (await w.repo.getIdentityOwnersCompanyWide([{ channelClass: "phone", value }]))
      .map((owner) => owner.ref.recordId)
      .sort(),
  );
}

describeDatabase("phone identities stored by earlier releases", () => {
  const dispatched: Array<{ companyId: string }> = [];
  const scan = new NormalizePhoneIdentitiesInteractor(
    createTestRecordRepo(),
    (companyId) => createTestRecordRepo(companyId),
    {
      dispatch: (id, payload) => {
        expect(id).toBe("normalize-phone-identities");
        dispatched.push(payload as { companyId: string });
        return Promise.resolve();
      },
    },
  );
  const repair = new NormalizeCompanyPhoneIdentitiesInteractor((companyId) => createTestRecordRepo(companyId));
  const repairAll = async (companyId: string) => {
    const totals = { renamed: 0, merged: 0, batches: 0 };
    let after: string | null = null;
    do {
      const batch = await repair.invoke({ companyId, after });
      expect(batch.busy).toBe(false);
      totals.renamed += batch.renamed;
      totals.merged += batch.merged;
      totals.batches += 1;
      after = batch.next;
    } while (after);
    return totals;
  };

  beforeAll(() => preloadTestRecordRepo(), 120_000);

  afterAll(async () => {
    await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: { in: companies } } }));
  });

  it("brings old phone values into the current format, merges duplicates and keeps every link and key", async () => {
    const w = await workspace();
    const untouched = await workspace();
    const [migrated, both, chat, typed, office, mobile, local, aliased] = await Promise.all(
      Array.from({ length: 8 }, () => w.record()),
    );
    const whatsapp = await w.identity({
      provider: "whatsapp",
      value: "+49301234567",
      messagingId: "chat-ada",
      displayName: "Ada",
      records: [chat],
    });
    const fromPhoneField = await w.identity({ provider: "phone", value: "+490301234567", records: [migrated, both] });
    const fromOldChannels = await w.identity({ provider: "whatsapp", value: "+0049301234567", records: [both, typed] });
    const renamed = await w.identity({ provider: "phone", value: "+4906211234567", records: [office] });
    const selfHeld = await w.identity({
      provider: "phone",
      value: "+49040123456",
      aliases: ["+4940123456"],
      records: [aliased],
    });
    await w.identity({ provider: "phone", value: "+4915112345678", records: [mobile] });
    await w.identity({ provider: "whatsapp", value: "+0621123456", records: [local] });
    await untouched.identity({ provider: "phone", value: "+4915112345678", records: [await untouched.record()] });
    const before = await stored(w.companyId);
    const otherBefore = await stored(untouched.companyId);
    expect(await owners(w, "+49301234567")).toEqual([chat]);

    expect((await scan.invoke()).dispatched).toContain(w.companyId);
    expect(dispatched.map((entry) => entry.companyId)).toContain(w.companyId);
    expect(dispatched.map((entry) => entry.companyId)).not.toContain(untouched.companyId);
    expect(await repairAll(w.companyId)).toEqual({ renamed: 2, merged: 2, batches: 1 });

    const after = await stored(w.companyId);
    const byId = new Map(after.map((identity) => [identity.id, identity]));
    expect(byId.has(fromPhoneField)).toBe(false);
    expect(byId.has(fromOldChannels)).toBe(false);
    expect(byId.get(whatsapp)).toMatchObject({
      provider: "whatsapp",
      value: "+49301234567",
      messagingId: "chat-ada",
      displayName: "Ada",
      keys: ["+0049301234567", "+490301234567", "+49301234567", "chat-ada"].sort(),
      records: [migrated, both, chat, typed].sort(),
    });
    expect(byId.get(renamed)).toMatchObject({
      provider: "phone",
      value: "+496211234567",
      keys: ["+4906211234567", "+496211234567"],
      records: [office],
    });
    expect(byId.get(selfHeld)).toMatchObject({
      value: "+4940123456",
      keys: ["+49040123456", "+4940123456"],
      records: [aliased],
    });
    for (const kept of before.filter((identity) => ["+4915112345678", "+0621123456"].includes(identity.value)))
      expect(byId.get(kept.id)).toEqual(kept);
    expect(await owners(w, "+49301234567")).toEqual([migrated, both, chat, typed].sort());
    expect(await owners(w, "+496211234567")).toEqual([office]);
    expect(new Set(after.flatMap((identity) => identity.records))).toEqual(
      new Set(before.flatMap((identity) => identity.records)),
    );
    expect(await stored(untouched.companyId)).toEqual(otherBefore);

    dispatched.length = 0;
    expect((await scan.invoke()).dispatched).not.toContain(w.companyId);
    expect(await repairAll(w.companyId)).toEqual({ renamed: 0, merged: 0, batches: 1 });
    expect(
      createHash("sha256")
        .update(JSON.stringify(await stored(w.companyId)))
        .digest("hex"),
    ).toBe(createHash("sha256").update(JSON.stringify(after)).digest("hex"));
  });

  it("leaves a workspace alone while a background record operation runs", async () => {
    const w = await workspace();
    await w.identity({ provider: "phone", value: "+490301234567", records: [await w.record()] });
    await runWithoutTenant(() =>
      prisma.recordSchemaState.update({
        where: { companyId: w.companyId },
        data: { activeOperationId: randomUUID() },
      }),
    );
    const before = await stored(w.companyId);
    expect(await repair.invoke({ companyId: w.companyId, after: null })).toEqual({
      renamed: 0,
      merged: 0,
      busy: true,
      next: null,
    });
    expect(await stored(w.companyId)).toEqual(before);
  });
});
