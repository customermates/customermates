import type { ProviderFileResult } from "../address-lookup-request";
import type { RecordField } from "@/features/records/record-model.schema";
import type { RecordExport } from "@/features/data-transfer/record-transfer.schema";
import type { TenantUser } from "@/features/user/user.schema";

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";
import { geonamesLine, zipFixture } from "../postal-codes/__tests__/zip-fixture";

vi.mock("@/env", () => ({
  env: {
    APP_MODE: "self-hosted",
    BASE_URL: "http://127.0.0.1:4000",
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
    BETTER_AUTH_SECRET: "address-check-database-secret",
    FILE_STORAGE_DRIVER: "database",
  },
}));
vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
}));

await import("@/core/di");
const { prisma } = await import("@/prisma/db");
const { runWithTenant, runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { runInTransaction } = await import("@/core/decorators/transaction-runner");
const { createTestRecordRepo } = await import("@/tests/helpers/record-repository");
const { createCrmPreset, presetId } = await import("@/features/records/crm-preset");
const { postAs, restRoute } = await import("@/tests/helpers/rest-route-workspace");
const { executeMcpTool } = await import("@/features/mcp-tools/mcp-tool");
const { checkAddressTool } = await import("@/features/mcp-tools/address.mcp-tools");
const { exportCrmRecordsTool, importCrmRecordsTool } = await import("@/features/mcp-tools/data-transfer.mcp-tools");
const { addressFormatOf } = await import("../address-metadata");
const { PostalCodeCache } = await import("../postal-codes/postal-code-cache");
const { PostalCodeService } = await import("../postal-codes/postal-code.service");
const { PrismaPostalCodeRepo } = await import("../postal-codes/prisma-postal-code.repository");

const checkRoute = await restRoute("/v1/addresses/check");
const mutateRoute = await restRoute("/v1/records/mutate");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companies: string[] = [];
const COUNTRIES = ["at", "us"];
const ATTRIBUTION = "Postal codes: GeoNames (geonames.org), CC BY 4.0";

const FILES: Record<string, Buffer> = {
  "AT.zip": zipFixture([
    {
      name: "AT.txt",
      content: [
        geonamesLine("AT", "1010", "Wien", { name1: "Wien", code1: "09", name3: "Wien" }, 48.2077, 16.3705),
        geonamesLine("AT", "6020", "Innsbruck", { name1: "Tirol", code1: "07", name3: "Innsbruck" }, 47.2627, 11.3945),
        geonamesLine("AT", "5020", "Salzburg", { name1: "Salzburg", code1: "05", name3: "Salzburg" }, 47.8, 13.04),
        geonamesLine("AT", "5020", "Morzg", { name1: "Salzburg", code1: "05", name3: "Salzburg" }, 47.77, 13.05),
      ].join("\n"),
    },
  ]),
  "US.zip": zipFixture([
    {
      name: "US.txt",
      content: [
        geonamesLine("US", "95014", "Cupertino", { name1: "California", code1: "CA" }, 37.318, -122.0449),
        geonamesLine("US", "10118", "New York", { name1: "New York", code1: "NY" }, 40.7486, -73.9864),
      ].join("\n"),
    },
  ]),
};

function download(url: URL): Promise<ProviderFileResult> {
  const body = FILES[url.pathname.slice(1)];
  return Promise.resolve(body ? { ok: true, body } : { ok: false, reason: "status", status: 404 });
}

const loader = new PostalCodeService(
  new PrismaPostalCodeRepo(),
  new PostalCodeCache(),
  "https://postal.example",
  "1:test",
  addressFormatOf,
  () => Promise.resolve(),
  download,
);

async function cleanUpPostalCodes() {
  await runWithoutTenant(async () => {
    await prisma.$executeRaw`DELETE FROM "PostalCode" WHERE "countryCode" = ANY(${COUNTRIES}::text[])`;
    await prisma.$executeRaw`DELETE FROM "PostalCodeCountry" WHERE "countryCode" = ANY(${COUNTRIES}::text[])`;
  });
}

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
        firstName: "Ada",
        lastName: "Test",
        email: `${randomUUID()}@example.test`,
        status: "active",
      },
    });
    return { company, role, user };
  });
  const companyId = seed.company.id;
  const admin = createMockUser({ ...seed.user, role: { ...seed.role, permissions: [] } });
  const id = (key: string) => presetId(companyId, key);
  const model = createCrmPreset(companyId);
  model.fields.push({
    id: id("contact.address"),
    typeId: id("contact"),
    label: "Address",
    valueType: "address",
    behavior: { kind: "input" },
    required: false,
    archived: false,
    publishedSummary: false,
    options: [],
    position: Math.max(...model.fields.map((field) => field.position)) + 1,
  } satisfies RecordField);
  const repo = createTestRecordRepo();
  await runWithTenant(admin, () => runInTransaction(() => repo.saveModel(model, admin.id), { timeout: 30_000 }));
  const as = <T>(user: TenantUser, fn: () => Promise<T>) => runWithTenant(user, fn);
  const revision = async () =>
    (await runWithoutTenant(() => prisma.recordSchemaState.findUniqueOrThrow({ where: { companyId } }))).revision;
  const createContact = async (value: unknown) =>
    postAs({ as }, admin, mutateRoute, {
      expectedRevision: await revision(),
      idempotencyKey: randomUUID(),
      mutation: {
        action: "create",
        typeId: id("contact"),
        fields: [
          { fieldId: id("contact.firstName"), value: { kind: "text", value: "Ada" } },
          { fieldId: id("contact.address"), value },
        ],
      },
    });
  const call = <
    T extends { execute: (...args: never[]) => unknown; inputSchema: { parse: (value: unknown) => unknown } },
  >(
    tool: T,
    input: unknown,
  ) => runWithTenant(admin, () => executeMcpTool(tool as never, [tool.inputSchema.parse(input)]));
  return { admin, as, id, createContact, call };
}

beforeAll(async () => {
  await cleanUpPostalCodes();
  expect(await loader.load("at")).toEqual({ status: "ready", rows: 4 });
  expect(await loader.load("us")).toEqual({ status: "ready", rows: 2 });
}, 120_000);

afterAll(async () => {
  await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: { in: companies } } }));
  await cleanUpPostalCodes();
});

describeDatabase("offline address checks over REST and MCP", { timeout: 120_000 }, () => {
  it("checks parts over REST: normalised parts, the postal code's places and its centre", async () => {
    const w = await workspace();
    const result = await postAs(w, w.admin, checkRoute, { postalCode: "a-6020", countryCode: "at" });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      address: expect.objectContaining({
        postalCode: "6020",
        city: null,
        countryCode: "at",
        formatted: "6020",
        location: { lat: 47.2627, lon: 11.3945, precision: "postcode" },
        verification: { status: "unverified", provider: null, checkedAt: null },
      }),
      issues: [],
      postalCode: {
        status: "ready",
        match: "exact",
        places: [{ city: "Innsbruck", region: null, location: { lat: 47.2627, lon: 11.3945, precision: "postcode" } }],
      },
      attribution: ATTRIBUTION,
    });

    const several = await postAs(w, w.admin, checkRoute, {
      street: "Getreidegasse 9",
      postalCode: "5020",
      city: "Wien",
      countryCode: "at",
    });
    expect(several.body).toMatchObject({
      issues: [
        {
          code: "cityMismatch",
          severity: "warning",
          part: "city",
          expected: ["Salzburg", "Morzg"],
          message: "The city does not match the postal code, which belongs to Salzburg, Morzg.",
        },
      ],
      postalCode: { places: [{ city: "Salzburg" }, { city: "Morzg" }] },
    });

    const refused = await postAs(w, w.admin, checkRoute, {
      street: "1 Infinite Loop",
      postalCode: "9501",
      city: "Cupertino",
      region: "XX",
      countryCode: "us",
    });
    expect(refused.status).toBe(200);
    expect(refused.body).toMatchObject({
      issues: [
        { code: "postalCodeInvalid", severity: "error", part: "postalCode", example: "95014" },
        { code: "regionInvalid", severity: "error", part: "region" },
      ],
      postalCode: { status: "notChecked", match: null, places: [] },
      attribution: null,
    });

    const unknown = await postAs(w, w.admin, checkRoute, { postalCode: "1000-001", countryCode: "pt" });
    expect(unknown.body).toMatchObject({ issues: [], postalCode: { status: "unavailable", places: [] } });
  });

  it("answers check_address over MCP with the same result", async () => {
    const w = await workspace();
    const result = await w.call(checkAddressTool, { postalCode: "95014", region: "California", countryCode: "us" });
    expect(result.ok).toBe(true);
    expect(result.ok && result.structuredContent).toMatchObject({
      address: { postalCode: "95014", region: "CA", location: { precision: "postcode" } },
      issues: [],
      postalCode: { status: "ready", match: "exact", places: [{ city: "Cupertino", region: "CA" }] },
      attribution: ATTRIBUTION,
    });
    expect(checkAddressTool.outputSchema.safeParse(result.ok ? result.structuredContent : null).success).toBe(true);
  });

  it("refuses a malformed postal code on the part and returns warnings with a REST write", async () => {
    const w = await workspace();
    const refused = await w.createContact({
      kind: "address",
      value: { street: "Stephansplatz 1", postalCode: "10100", city: "Wien", countryCode: "at" },
    });
    expect(refused.status).toBe(400);
    expect(refused.body).toMatchObject({
      error: {
        kind: "validation",
        issues: [
          {
            customCode: "recordAddressPostalCodeInvalid",
            path: ["mutation", "fields", 1, "value", "postalCode"],
          },
        ],
      },
    });

    const saved = await w.createContact({
      kind: "address",
      value: {
        street: "350 5th Avenue",
        postalCode: "10118",
        city: "Cupertino",
        region: "New York",
        countryCode: "us",
      },
    });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({
      status: "completed",
      warnings: [
        {
          code: "cityMismatch",
          fieldId: w.id("contact.address"),
          part: "city",
          expected: ["New York"],
          message: "Address: the city does not match the postal code, which belongs to New York.",
        },
      ],
    });
  });

  it("returns address warnings from import_crm_records", async () => {
    const w = await workspace();
    const typeId = w.id("contact");
    const created = await w.createContact({
      kind: "address",
      value: { street: "Maria-Theresien-Straße 1", postalCode: "6020", city: "Innsbruck", countryCode: "at" },
    });
    expect(created.status).toBe(200);
    const recordId = (created.body.refs as Array<{ recordId: string }>)[0].recordId;
    const exported = await w.call(exportCrmRecordsTool, { typeId });
    const document = (exported.ok ? exported.structuredContent : {}) as unknown as RecordExport;
    const records = document.records
      .filter((record) => record.ref.recordId === recordId)
      .map((record) => ({
        ...record,
        fields: record.fields.map((entry) =>
          entry.fieldId === w.id("contact.address") &&
          entry.result.state === "value" &&
          entry.result.value.kind === "address"
            ? {
                ...entry,
                result: {
                  ...entry.result,
                  value: { ...entry.result.value, value: { ...entry.result.value.value, city: "Salzburg" } },
                },
              }
            : entry,
        ),
      }));
    expect(records).toHaveLength(1);
    const imported = await w.call(importCrmRecordsTool, {
      document: { ...document, records },
      mode: "update",
      idempotencyKey: `address-import-${recordId}`,
    });
    expect(imported).toMatchObject({
      ok: true,
      structuredContent: {
        updated: 1,
        warnings: [{ code: "cityMismatch", recordIds: [recordId], part: "city", expected: ["Innsbruck"] }],
      },
    });
  });
});
