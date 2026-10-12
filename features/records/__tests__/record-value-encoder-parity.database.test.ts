import type { CalculatedValue } from "../record-model.schema";
import { recordInvariant } from "../record-invariant";

import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";

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
const { Prisma } = await import("@/generated/prisma");
const { runWithTenant, runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { runInTransaction } = await import("@/core/decorators/transaction-runner");
const { PrismaRecordRepo } = await import("../prisma-record.repository");
const { createCrmPreset, presetId } = await import("../crm-preset");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companies: string[] = [];

const CASES: Array<[string, CalculatedValue]> = [
  ["text", { state: "value", value: { kind: "text", value: "Ünïcode ✓" } }],
  ["select", { state: "value", value: { kind: "select", value: "option-1" } }],
  ["member", { state: "value", value: { kind: "member", value: randomUUID() } }],
  ["textList", { state: "value", value: { kind: "textList", value: ["b", "a", "b"] } }],
  ["selectList", { state: "value", value: { kind: "selectList", value: ["x", "y"] } }],
  ["number", { state: "value", value: { kind: "decimal", value: "-98765432109876543210.123456789", currency: null } }],
  [
    "tiny number",
    { state: "value", value: { kind: "decimal", value: "0.000000000000000000000000000001", currency: null } },
  ],
  ["money", { state: "value", value: { kind: "decimal", value: "19.99", currency: "EUR" } }],
  ["zero money", { state: "value", value: { kind: "decimal", value: "0", currency: "JPY" } }],
  ["true", { state: "value", value: { kind: "boolean", value: true } }],
  ["false", { state: "value", value: { kind: "boolean", value: false } }],
  ["date", { state: "value", value: { kind: "date", value: "2024-02-29" } }],
  ["date with offset", { state: "value", value: { kind: "date", value: "2024-02-29T23:30:00-05:00" } }],
  ["utc dateTime", { state: "value", value: { kind: "dateTime", value: "2024-06-01T12:34:56Z" } }],
  ["micro dateTime east", { state: "value", value: { kind: "dateTime", value: "2024-06-01T12:34:56.123456+05:30" } }],
  ["micro dateTime west", { state: "value", value: { kind: "dateTime", value: "2024-12-31T23:59:59.999999-12:00" } }],
  ["date range", { state: "value", value: { kind: "range", start: "2024-01-01", end: "2024-01-31" } }],
  [
    "dateTime range",
    { state: "value", value: { kind: "range", start: "2024-03-31T01:30:00.5+02:00", end: "2024-03-31T03:30:00Z" } },
  ],
  ["open range", { state: "value", value: { kind: "range", start: null, end: "2025-01-01T00:00:00-08:00" } }],
  ["richText", { state: "value", value: { kind: "richText", documentJson: '{"root":{"children":[],"type":"root"}}' } }],
  ["error", { state: "error", code: "currency_mismatch" }],
  ["missing", { state: "missing" }],
];

type StoredRow = Record<string, string | boolean | number | null>;

afterAll(async () => {
  if (companies.length) await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: { in: companies } } }));
});

describeDatabase("record value encoders", () => {
  it("stores identical values through setValue and the set-based publishStage for every value type", async () => {
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
    const repo = new PrismaRecordRepo();
    await runWithTenant(admin, () =>
      runInTransaction(() => repo.saveModel(createCrmPreset(companyId), admin.id), { timeout: 30000 }),
    );
    const typeId = presetId(companyId, "deal");
    const fieldId = presetId(companyId, "deal.name");
    const read = async (recordId: string) => {
      const [row] = await runWithoutTenant(() =>
        prisma.$queryRaw<StoredRow[]>(Prisma.sql`
          SELECT state, "textValue", "textListValue"::text AS "textListValue", "lexicalValue",
            "decimalValue"::text AS "decimalValue", currency, "booleanValue", "instantValue"::text AS "instantValue",
            "rangeStart"::text AS "rangeStart", "rangeEnd"::text AS "rangeEnd", "jsonValue"::text AS "jsonValue",
            "errorCode", "schemaRevision"
          FROM "RecordValue"
          WHERE "companyId" = ${companyId} AND "typeId" = ${typeId} AND "recordId" = ${recordId} AND "fieldId" = ${fieldId}`),
      );
      return row;
    };

    for (const timeZone of ["UTC", "America/New_York", "Asia/Kolkata"]) {
      const pairs = CASES.map(([name, result]) => ({ name, result, direct: randomUUID(), staged: randomUUID() }));
      await runWithoutTenant(() =>
        prisma.crmRecord.createMany({
          data: pairs.flatMap((pair) => [pair.direct, pair.staged].map((id) => ({ companyId, typeId, id }))),
        }),
      );
      const operationId = randomUUID();
      await runWithoutTenant(() =>
        prisma.recordOperation.create({
          data: { companyId, id: operationId, userId: seed.user.id, kind: "test", expectedRevision: 0, request: {} },
        }),
      );
      await runWithTenant(admin, () =>
        runInTransaction(async () => {
          await repo.prisma.$executeRaw(Prisma.sql`SELECT set_config('TimeZone', ${timeZone}, true)`);
          for (const pair of pairs) {
            await repo.setValue({ typeId, recordId: pair.direct }, fieldId, pair.result, 7);
            await repo.stageRow(operationId, "value", `${typeId}:${pair.staged}:${fieldId}`, {
              ref: { typeId, recordId: pair.staged },
              fieldId,
              result: pair.result,
              revision: 7,
            });
          }
          await repo.publishStage(operationId, 7);
        }),
      );
      for (const pair of pairs) {
        const direct = await read(pair.direct);
        expect(direct, `${pair.name} in ${timeZone}`).toBeDefined();
        expect(await read(pair.staged), `${pair.name} in ${timeZone}`).toEqual(direct);
      }
      const stored = async (name: string) => read(recordInvariant(pairs.find((pair) => pair.name === name)).direct);
      expect(await stored("micro dateTime east")).toMatchObject({
        instantValue: "2024-06-01 07:04:56.123456",
        lexicalValue: "2024-06-01T12:34:56.123456+05:30",
      });
      expect(await stored("micro dateTime west")).toMatchObject({ instantValue: "2025-01-01 11:59:59.999999" });
      expect(await stored("date with offset")).toMatchObject({ instantValue: "2024-03-01 04:30:00" });
      expect(await stored("tiny number")).toMatchObject({ decimalValue: "0.000000000000000000000000000001" });
      expect(await stored("money")).toMatchObject({
        decimalValue: "19.990000000000000000000000000000",
        currency: "EUR",
      });
      expect(await stored("dateTime range")).toMatchObject({
        rangeStart: "2024-03-30 23:30:00.5",
        rangeEnd: "2024-03-31 03:30:00",
      });
      if (timeZone === "UTC") expect(await stored("date")).toMatchObject({ instantValue: "2024-02-29 00:00:00" });
    }
  });
});
