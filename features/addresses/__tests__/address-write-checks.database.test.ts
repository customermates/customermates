import type { RecordMutation } from "@/features/records/record-query.schema";
import type { RecordAddress, RecordField } from "@/features/records/record-model.schema";
import type { ProviderFileResult } from "../address-lookup-request";

import { PermissionService } from "@/core/base/permission.service";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";
import { geonamesLine, zipFixture } from "../postal-codes/__tests__/zip-fixture";

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
const { PrismaUserRepo } = await import("@/features/user/prisma-user.repository");
const { PrismaBillingUsageRepo } = await import("@/features/billing-usage/prisma-billing-usage.repository");
const { RecordAccessPolicy } = await import("@/features/records/record-access");
const { RecordCalculationService } = await import("@/features/records/record-calculation.service");
const { RecordWriteService } = await import("@/features/records/record-write.service");
const { MutateRecordInteractor } = await import("@/features/records/mutate-record.interactor");
const { RecordTrashService } = await import("@/features/records/record-trash.service");
const { GetRecordInteractor } = await import("@/features/records/get-record.interactor");
const { createCrmPreset, presetId } = await import("@/features/records/crm-preset");
const { createTestRecordRepo, preloadTestRecordRepo } = await import("@/tests/helpers/record-repository");
const { AddressCheckService } = await import("../address-check.service");
const { addressFormatOf } = await import("../address-metadata");
const { PostalCodeCache } = await import("../postal-codes/postal-code-cache");
const { PostalCodeService } = await import("../postal-codes/postal-code.service");
const { PrismaPostalCodeRepo } = await import("../postal-codes/prisma-postal-code.repository");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companies: string[] = [];
const COUNTRIES = ["ch", "ca", "lu"];
const dispatched: string[] = [];

const FILES: Record<string, Buffer> = {
  "CH.zip": zipFixture([
    {
      name: "CH.txt",
      content: [
        geonamesLine("CH", "8001", "Zürich", { name1: "Kanton Zürich", code1: "ZH", name3: "Zürich" }, 47.3769, 8.5417),
        geonamesLine("CH", "3000", "Bern", { name1: "Kanton Bern", code1: "BE", name3: "Bern" }, 46.948, 7.4474),
      ].join("\n"),
    },
  ]),
  "CA_full.csv.zip": zipFixture([
    {
      name: "CA_full.txt",
      content: [
        geonamesLine("CA", "K1A 0B1", "Ottawa", { name1: "Ontario", code1: "ON" }, 45.42, -75.69, "6"),
        geonamesLine("CA", "K1A 0B2", "Ottawa", { name1: "Ontario", code1: "ON" }, 45.42, -75.69, "6"),
      ].join("\n"),
    },
  ]),
};

function download(url: URL): Promise<ProviderFileResult> {
  const body = FILES[url.pathname.slice(1)];
  return Promise.resolve(body ? { ok: true, body } : { ok: false, reason: "status", status: 404 });
}

const postalCodes = new PostalCodeService(
  new PrismaPostalCodeRepo(),
  new PostalCodeCache(),
  "https://postal.example",
  "1:test",
  addressFormatOf,
  (countryCode) => {
    dispatched.push(countryCode);
    return Promise.resolve();
  },
  download,
);

async function cleanUpPostalCodes() {
  await runWithoutTenant(async () => {
    await prisma.$executeRaw`DELETE FROM "PostalCode" WHERE "countryCode" = ANY(${COUNTRIES}::text[])`;
    await prisma.$executeRaw`DELETE FROM "PostalCodeCountry" WHERE "countryCode" = ANY(${COUNTRIES}::text[])`;
  });
}

function addressField(id: string, typeId: string, position: number): RecordField {
  return {
    id,
    typeId,
    label: "Address",
    valueType: "address",
    behavior: { kind: "input" },
    required: false,
    archived: false,
    publishedSummary: false,
    options: [],
    position,
  };
}

function address(parts: Partial<RecordAddress>): RecordAddress {
  return {
    street: null,
    line2: null,
    postalCode: null,
    city: null,
    region: null,
    countryCode: null,
    formatted: "",
    location: null,
    verification: { status: "unverified", provider: null, checkedAt: null },
    ...parts,
  };
}

async function fixture() {
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
        firstName: "Admin",
        lastName: "Test",
        email: `${randomUUID()}@example.test`,
        status: "active",
      },
    });
    return { company, role, user };
  });
  const companyId = seed.company.id;
  const admin = createMockUser({ ...seed.user, role: { ...seed.role, permissions: [] } });
  const repo = createTestRecordRepo();
  const policy = new RecordAccessPolicy(
    new PrismaUserRepo(new PermissionService(), new PrismaBillingUsageRepo()),
    repo,
  );
  const mutate = new MutateRecordInteractor(
    repo,
    policy,
    new RecordWriteService(
      repo,
      policy,
      new RecordCalculationService(repo),
      undefined,
      undefined,
      new AddressCheckService(postalCodes),
    ),
    { dispatch: () => Promise.resolve() },
    new RecordTrashService(repo, new RecordCalculationService(repo)),
  );
  const typeId = presetId(companyId, "deal");
  const field = presetId(companyId, "deal.address");
  const model = createCrmPreset(companyId);
  model.fields.push(addressField(field, typeId, Math.max(...model.fields.map((entry) => entry.position)) + 1));
  await runWithTenant(admin, () => runInTransaction(() => repo.saveModel(model, admin.id), { timeout: 30000 }));
  const run = <T>(fn: () => Promise<T>) => runWithTenant(admin, fn);
  const revision = async () =>
    (await runWithoutTenant(() => prisma.recordSchemaState.findUniqueOrThrow({ where: { companyId } }))).revision;
  const mutation = async (value: RecordMutation) =>
    run(async () =>
      mutate.invoke({ mutation: value, expectedRevision: await revision(), idempotencyKey: randomUUID() }),
    );
  const create = (value: RecordAddress) =>
    mutation({
      action: "create",
      typeId,
      fields: [
        { fieldId: presetId(companyId, "deal.name"), value: { kind: "text", value: "Deal" } },
        { fieldId: field, value: { kind: "address", value } },
      ],
    });
  const stored = async (recordId: string) => {
    const result = await run(() => new GetRecordInteractor(repo, policy).invoke({ typeId, recordId }));
    if (!result.ok) throw new Error(JSON.stringify(result));
    const entry = result.data.fields.find((candidate) => candidate.fieldId === field)?.result;
    return entry?.state === "value" && entry.value.kind === "address" ? entry.value.value : null;
  };
  const version = async (recordId: string) =>
    (await run(() => repo.getRecordCompanyWide({ typeId, recordId })))?.version ?? 0;
  return { companyId, typeId, field, repo, run, mutation, create, stored, version };
}

function completed<T extends { ok: boolean }>(result: T) {
  if (!result.ok) throw new Error(JSON.stringify(result));
  const data = (
    result as unknown as { data: { status: string; refs: Array<{ recordId: string }>; warnings?: unknown } }
  ).data;
  if (data.status !== "completed") throw new Error(JSON.stringify(result));
  return data;
}

describeDatabase("address checks on record writes", () => {
  beforeAll(async () => {
    await preloadTestRecordRepo();
    await cleanUpPostalCodes();
    expect(await postalCodes.load("ch")).toEqual({ status: "ready", rows: 2 });
    expect(await postalCodes.load("ca")).toEqual({ status: "ready", rows: 1 });
  }, 120_000);

  afterAll(async () => {
    await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: { in: companies } } }));
    await cleanUpPostalCodes();
  });

  it("normalises the parts, places the address at its postal code and reports nothing", async () => {
    const f = await fixture();
    const result = completed(
      await f.create(address({ street: "Bahnhofstrasse 1", postalCode: "CH-8001", city: "Zürich", countryCode: "ch" })),
    );
    expect(result.warnings).toBeUndefined();
    expect(await f.stored(result.refs[0].recordId)).toEqual(
      address({
        street: "Bahnhofstrasse 1",
        postalCode: "8001",
        city: "Zürich",
        countryCode: "ch",
        formatted: "Bahnhofstrasse 1, 8001 Zürich",
        location: { lat: 47.3769, lon: 8.5417, precision: "postcode" },
      }),
    );
  });

  it("saves a city that does not belong to the postal code and warns about it", async () => {
    const f = await fixture();
    const result = completed(
      await f.create(address({ street: "Bahnhofstrasse 1", postalCode: "8001", city: "Bern", countryCode: "ch" })),
    );
    expect(result.warnings).toEqual([
      {
        code: "cityMismatch",
        fieldId: f.field,
        recordIds: [result.refs[0].recordId],
        part: "city",
        expected: ["Zürich"],
        message: "Address: the city does not match the postal code, which belongs to Zürich.",
      },
    ]);
    expect((await f.stored(result.refs[0].recordId))?.city).toBe("Bern");
  });

  it("refuses a postal code, region code or country the country does not know", async () => {
    const f = await fixture();
    const invalidCode = await f.create(address({ postalCode: "800", city: "Zürich", countryCode: "ch" }));
    expect(invalidCode.ok).toBe(false);
    expect(JSON.stringify(invalidCode)).toContain("recordAddressPostalCodeInvalid");
    expect(invalidCode.ok ? null : invalidCode.error.issues.map((issue) => issue.path)).toEqual([
      ["mutation", "fields", 1, "value", "postalCode"],
    ]);
    const invalidRegion = await f.create(
      address({ postalCode: "K1A 0B1", city: "Ottawa", region: "ZZ", countryCode: "ca" }),
    );
    expect(JSON.stringify(invalidRegion)).toContain("recordAddressRegionInvalid");
    const invalidCountry = await f.create(address({ city: "Atlantis", countryCode: "zz" }));
    expect(JSON.stringify(invalidCountry)).toContain("recordAddressCountryInvalid");
  });

  it("stores the region's key and warns when the postal code belongs to another province", async () => {
    const f = await fixture();
    const ontario = completed(
      await f.create(
        address({
          street: "80 Wellington St",
          postalCode: "k1a0b1",
          city: "Ottawa",
          region: "Ontario",
          countryCode: "ca",
        }),
      ),
    );
    expect(ontario.warnings).toBeUndefined();
    expect(await f.stored(ontario.refs[0].recordId)).toMatchObject({
      postalCode: "K1A 0B1",
      region: "ON",
      location: { lat: 45.42, lon: -75.69, precision: "postcode" },
    });
    const quebec = completed(
      await f.create(
        address({
          street: "80 Wellington St",
          postalCode: "K1A 0B1",
          city: "Ottawa",
          region: "Québec",
          countryCode: "ca",
        }),
      ),
    );
    expect(quebec.warnings).toEqual([
      expect.objectContaining({ code: "postalCodeRegionMismatch", part: "region", expected: ["ON"] }),
    ]);
  });

  it("keeps checking formats where no postal codes are loaded and starts loading them", async () => {
    const f = await fixture();
    const result = completed(
      await f.create(address({ street: "Rue de la Gare 1", postalCode: "L-4968", countryCode: "lu" })),
    );
    expect(result.warnings).toEqual([expect.objectContaining({ code: "partMissing", part: "city" })]);
    expect(await f.stored(result.refs[0].recordId)).toMatchObject({ postalCode: "4968", location: null });
    expect(dispatched).toContain("lu");
  });

  it("does not check an address again when a write repeats its stored parts", async () => {
    const f = await fixture();
    const created = completed(
      await f.create(address({ street: "Bahnhofstrasse 1", postalCode: "8001", city: "Zürich", countryCode: "ch" })),
    );
    const recordId = created.refs[0].recordId;
    const legacy = address({
      street: "Old 1",
      postalCode: "12",
      city: "Zürich",
      countryCode: "ch",
      formatted: "Old 1, 12 Zürich",
    });
    await f.run(() =>
      runInTransaction(async () => {
        await f.repo.setValue(
          { typeId: f.typeId, recordId },
          f.field,
          { state: "value", value: { kind: "address", value: legacy } },
          0,
        );
      }),
    );
    const repeated = await f.mutation({
      action: "update",
      ref: { typeId: f.typeId, recordId },
      expectedVersion: await f.version(recordId),
      fields: [
        { fieldId: presetId(f.companyId, "deal.name"), value: { kind: "text", value: "Renamed" } },
        { fieldId: f.field, value: { kind: "address", value: legacy } },
      ],
    });
    expect(repeated.ok).toBe(true);
    expect((await f.stored(recordId))?.postalCode).toBe("12");
  });

  it("reports one warning for every record a bulk change gives the same implausible address", async () => {
    const f = await fixture();
    const first = completed(
      await f.create(address({ city: "Zürich", countryCode: "ch", street: "A 1", postalCode: "8001" })),
    );
    const second = completed(
      await f.create(address({ city: "Zürich", countryCode: "ch", street: "B 2", postalCode: "8001" })),
    );
    const targets = await Promise.all(
      [first, second].map(async (result) => ({
        ref: { typeId: f.typeId, recordId: result.refs[0].recordId },
        expectedVersion: await f.version(result.refs[0].recordId),
      })),
    );
    const bulk = completed(
      await f.mutation({
        action: "updateMany",
        targets,
        fields: [
          {
            fieldId: f.field,
            value: {
              kind: "address",
              value: address({ street: "C 3", postalCode: "3000", city: "Zürich", countryCode: "ch" }),
            },
          },
        ],
      }),
    );
    expect(bulk.warnings).toEqual([
      expect.objectContaining({
        code: "cityMismatch",
        recordIds: [first.refs[0].recordId, second.refs[0].recordId],
        expected: ["Bern"],
      }),
    ]);
  });

  it("keeps an address given only as text", async () => {
    const f = await fixture();
    const result = completed(await f.create(address({ formatted: "Bahnhofstrasse 1, 8001 Zürich" })));
    expect(result.warnings).toBeUndefined();
    expect(await f.stored(result.refs[0].recordId)).toEqual(address({ formatted: "Bahnhofstrasse 1, 8001 Zürich" }));
  });
});
