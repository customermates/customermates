import { randomUUID } from "node:crypto";
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
const { ConsolidateLinkedinIdentitiesInteractor } = await import("../consolidate-linkedin-identities.interactor");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companies: string[] = [];

const FRANCESCA = "ACoAAB8eNoQBhr8Ek4Y-7zwwnasJF849Xk3zums";
const JOERG = "ACoAACZiRDsBcZPmJQea7rVroTK2fVpoRiscjR8";
const LUIGI = "ACoAAEtbrVQBxVuhu08dHgGH0roSsurOcCbbR6k";
const GLORY = "ACoAADlxH8cBnL3qsKZe4P1xYOCZS1Ft0cuZ4Ts";
const SINGLE = "ACoAAAGM_VUBCu28ZaCdC_Ae5OPR3khfJJOBDlk";

type Seed = {
  value: string;
  messagingId?: string;
  profileUrl?: string;
  displayName?: string;
  createdAt?: string;
  records: string[];
};

async function workspace() {
  const seed = await runWithoutTenant(async () => {
    const company = await prisma.company.create({ data: {} });
    companies.push(company.id);
    const role = await prisma.userRole.create({
      data: {
        companyId: company.id,
        name: "Administrator",
        isSystemRole: true,
      },
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
  const admin = createMockUser({
    ...seed.user,
    role: { ...seed.role, permissions: [] },
  });
  const repo = createTestRecordRepo(companyId);
  await runWithTenant(admin, () =>
    runInTransaction(() => repo.saveModel(createCrmPreset(companyId), admin.id), { timeout: 30000 }),
  );
  const typeId = presetId(companyId, "contact");
  const record = () =>
    runWithoutTenant(
      async () =>
        (
          await prisma.crmRecord.create({
            data: { companyId, typeId, id: randomUUID() },
          })
        ).id,
    );
  /** Stores an identity the way earlier releases did: keys are only its value and messaging id. */
  const identity = (input: Seed) =>
    runWithoutTenant(async () => {
      const id = randomUUID();
      await prisma.recordIdentity.create({
        data: {
          companyId,
          id,
          provider: "linkedin",
          channelClass: "linkedin",
          value: input.value,
          messagingId: input.messagingId ?? null,
          displayName: input.displayName ?? null,
          profileUrl: input.profileUrl ?? null,
          ...(input.createdAt ? { createdAt: new Date(input.createdAt) } : {}),
          keys: {
            create: [...new Set([input.value, ...(input.messagingId ? [input.messagingId] : [])])].map((value) => ({
              value,
            })),
          },
          records: {
            create: input.records.map((recordId) => ({ typeId, recordId })),
          },
        },
      });
      return id;
    });
  const owners = (value: string) =>
    runWithoutTenant(async () =>
      (await repo.getIdentityOwnersCompanyWide([{ channelClass: "linkedin", value }]))
        .map((owner) => owner.ref.recordId)
        .sort(),
    );
  const setIdentities = (recordId: string, inputs: Parameters<typeof repo.setIdentities>[1]) =>
    runWithTenant(admin, () => runInTransaction(() => repo.setIdentities({ typeId, recordId }, inputs)));
  return { companyId, typeId, repo, record, identity, owners, setIdentities };
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

describeDatabase("LinkedIn member id and username stored as two identities", () => {
  const consolidate = new ConsolidateLinkedinIdentitiesInteractor((companyId) => createTestRecordRepo(companyId));

  beforeAll(() => preloadTestRecordRepo(), 120_000);

  afterAll(async () => {
    await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: { in: companies } } }));
  });

  it("merges each proven pair into one channel, keeps every key, link and message route, and repeats as a no-op", async () => {
    const w = await workspace();
    const [francesca, joerg, luigi, glory, single] = await Promise.all(Array.from({ length: 5 }, () => w.record()));
    const francescaMember = await w.identity({
      value: FRANCESCA,
      messagingId: FRANCESCA,
      displayName: "Francesca Pollard",
      profileUrl: "https://www.linkedin.com/in/francesca-pollard-004a12126/",
      createdAt: "2026-11-03T15:19:05.000Z",
      records: [francesca],
    });
    const francescaSlug = await w.identity({
      value: "francesca-pollard-004a12126",
      displayName: "Francesca Pollard",
      profileUrl: "https://www.linkedin.com/in/francesca-pollard-004a12126/",
      createdAt: "2026-11-03T15:19:06.000Z",
      records: [francesca],
    });
    const joergMember = await w.identity({
      value: JOERG,
      profileUrl: "https://www.linkedin.com/in/j%C3%B6rg-n%C3%BCckel",
      records: [joerg],
    });
    const joergSlug = await w.identity({
      value: "jörg-nückel",
      records: [joerg],
    });
    await w.identity({ value: LUIGI, messagingId: LUIGI, records: [luigi] });
    await w.identity({
      value: "luigi-borriello-8704b22b3",
      profileUrl: "https://www.linkedin.com/in/luigi-borriello-8704b22b3",
      records: [luigi],
    });
    await w.identity({
      value: "glory-yakubu",
      profileUrl: "https://www.linkedin.com/in/glory-yakubu",
      records: [glory],
    });
    await w.identity({
      value: "glory-yakubu-5478b522a",
      messagingId: GLORY,
      profileUrl: "https://www.linkedin.com/in/glory-yakubu-5478b522a",
      records: [glory],
    });
    const singleMember = await w.identity({
      value: SINGLE,
      profileUrl: "https://www.linkedin.com/in/dan-mccormick-2458688",
      records: [single],
    });
    const before = await stored(w.companyId);

    const dryRun = await consolidate.invoke({
      companyId: w.companyId,
      apply: false,
    });
    expect(dryRun).toMatchObject({
      busy: false,
      applied: false,
      repair: null,
    });
    expect(dryRun.plan.merges.map((merge) => merge.survivorId).sort()).toEqual([francescaSlug, joergSlug].sort());
    expect(dryRun.plan.backfills.map((backfill) => backfill.identityId)).toEqual([singleMember]);
    expect(await stored(w.companyId)).toEqual(before);
    await expect(consolidate.invoke({ companyId: w.companyId, apply: true })).rejects.toThrow(/backup/);
    expect(await stored(w.companyId)).toEqual(before);

    const backups: Array<{ rows: Array<{ id: string }> }> = [];
    const applied = await consolidate.invoke({ companyId: w.companyId, apply: true }, (snapshot) => {
      backups.push(snapshot);
    });
    expect(applied.applied).toBe(true);
    expect(applied.repair).toMatchObject({ merged: 2, removed: 2 });
    expect(applied.readback).toEqual({
      remainingMerges: 0,
      remainingBackfills: 0,
      problems: [],
    });
    expect(backups[0]?.rows.map((row) => row.id).sort()).toEqual(
      [francescaMember, francescaSlug, joergMember, joergSlug, singleMember].sort(),
    );

    const after = await stored(w.companyId);
    const byId = new Map(after.map((identity) => [identity.id, identity]));
    expect(byId.has(francescaMember)).toBe(false);
    expect(byId.has(joergMember)).toBe(false);
    expect(byId.get(francescaSlug)).toMatchObject({
      value: "francesca-pollard-004a12126",
      messagingId: FRANCESCA,
      displayName: "Francesca Pollard",
      keys: [FRANCESCA, "francesca-pollard-004a12126"].sort(),
      records: [francesca],
    });
    expect(byId.get(joergSlug)).toMatchObject({
      messagingId: JOERG,
      keys: [JOERG, "jörg-nückel"].sort(),
    });
    expect(byId.get(singleMember)?.keys).toEqual([SINGLE, "dan-mccormick-2458688"].sort());
    for (const exception of before.filter((identity) => [luigi, glory].includes(identity.records[0] ?? "")))
      expect(byId.get(exception.id)).toEqual(exception);
    expect(after.filter((identity) => identity.records.includes(francesca))).toHaveLength(1);

    // Message history: synced threads carry the member id, imports the username; both reach the person.
    expect(await w.owners(FRANCESCA)).toEqual([francesca]);
    expect(await w.owners("francesca-pollard-004a12126")).toEqual([francesca]);
    expect(await w.owners("dan-mccormick-2458688")).toEqual([single]);

    const again = await consolidate.invoke({ companyId: w.companyId, apply: true }, () => {
      throw new Error("A repeated run must not need a backup");
    });
    expect(again).toMatchObject({
      applied: false,
      plan: { merges: [], backfills: [] },
    });
    expect(again.plan.skipped).toEqual([]);
    expect(await stored(w.companyId)).toEqual(after);
  });

  it("skips groups on excluded records and leaves a busy workspace alone", async () => {
    const w = await workspace();
    const person = await w.record();
    await w.identity({
      value: FRANCESCA,
      profileUrl: "https://www.linkedin.com/in/francesca-pollard-004a12126",
      records: [person],
    });
    await w.identity({
      value: "francesca-pollard-004a12126",
      records: [person],
    });
    const excluded = await consolidate.invoke({
      companyId: w.companyId,
      apply: false,
      excludeRecordIds: [person],
    });
    expect(excluded.plan).toMatchObject({
      merges: [],
      skipped: [{ reason: "excludedRecord" }],
    });

    await runWithoutTenant(() =>
      prisma.recordSchemaState.update({
        where: { companyId: w.companyId },
        data: { activeOperationId: randomUUID() },
      }),
    );
    const before = await stored(w.companyId);
    expect(await consolidate.invoke({ companyId: w.companyId, apply: true }, () => undefined)).toMatchObject({
      busy: true,
      applied: false,
    });
    expect(await stored(w.companyId)).toEqual(before);
  });

  it("links a username import to the synced member-id identity instead of creating a second channel", async () => {
    const w = await workspace();
    const [synced, imported] = await Promise.all([w.record(), w.record()]);
    await w.setIdentities(synced, [
      {
        provider: "linkedin",
        value: FRANCESCA,
        messagingId: FRANCESCA,
        profileUrl: "https://www.linkedin.com/in/francesca-pollard-004a12126/",
      },
    ]);
    await w.setIdentities(imported, [{ provider: "linkedin", value: "Francesca-Pollard-004a12126" }]);
    const rows = await stored(w.companyId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      value: FRANCESCA,
      keys: [FRANCESCA, "Francesca-Pollard-004a12126", "francesca-pollard-004a12126"].sort(),
      records: [synced, imported].sort(),
    });
  });

  it("teaches an imported username identity the member id when the message sync links it", async () => {
    const w = await workspace();
    const person = await w.record();
    await w.setIdentities(person, [{ provider: "linkedin", value: "francesca-pollard-004a12126" }]);
    const [created] = await stored(w.companyId);
    await w.setIdentities(person, [
      { provider: "linkedin", value: "francesca-pollard-004a12126" },
      {
        provider: "linkedin",
        value: FRANCESCA,
        messagingId: FRANCESCA,
        profileUrl: "https://www.linkedin.com/in/francesca-pollard-004a12126/",
      },
    ]);
    const rows = await stored(w.companyId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: created?.id,
      value: "francesca-pollard-004a12126",
      messagingId: FRANCESCA,
      profileUrl: "https://www.linkedin.com/in/francesca-pollard-004a12126/",
      keys: [FRANCESCA, "francesca-pollard-004a12126"].sort(),
      records: [person],
    });
    expect(await w.owners(FRANCESCA)).toEqual([person]);
  });

  it("still saves a person that holds both identities before the consolidation ran", async () => {
    const w = await workspace();
    const person = await w.record();
    const url = "https://www.linkedin.com/in/francesca-pollard-004a12126/";
    await w.identity({
      value: FRANCESCA,
      messagingId: FRANCESCA,
      profileUrl: url,
      records: [person],
    });
    await w.identity({
      value: "francesca-pollard-004a12126",
      profileUrl: url,
      records: [person],
    });
    const before = await stored(w.companyId);
    await w.setIdentities(person, [
      {
        provider: "linkedin",
        value: FRANCESCA,
        messagingId: FRANCESCA,
        profileUrl: url,
      },
      {
        provider: "linkedin",
        value: "francesca-pollard-004a12126",
        profileUrl: url,
      },
    ]);
    expect((await stored(w.companyId)).map((row) => row.id)).toEqual(before.map((row) => row.id));
  });
});
