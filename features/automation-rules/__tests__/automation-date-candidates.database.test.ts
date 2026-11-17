import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

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
const { runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { createRestRouteWorkspace } = await import("@/tests/helpers/rest-route-workspace");
const { createTestAutomationRuleRepo } = await import("@/tests/helpers/record-delivery");
const { dueDateOccurrences } = await import("../automation-occurrence");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const cleanups: Array<() => Promise<unknown>> = [];

afterAll(async () => {
  for (const cleanup of cleanups) await cleanup();
});

describeDatabase("date candidates of a date-reached rule", () => {
  it("names the declared kind of the field, so a date written as a moment stays one day", async () => {
    const w = await createRestRouteWorkspace();
    cleanups.push(w.cleanup);
    const typeId = w.id("deal");
    const closes = randomUUID();
    const meeting = randomUUID();
    const first = await w.create("deal", "deal.name", "Plain day");
    const second = await w.create("deal", "deal.name", "Day written as a moment");
    const schemaRevision = await w.revision();
    await runWithoutTenant(async () => {
      for (const [id, valueType] of [
        [closes, "date"],
        [meeting, "dateTime"],
      ] as const) {
        await prisma.recordFieldDefinition.create({
          data: { companyId: w.companyId, typeId, id, valueType, behavior: "input", definition: {} },
        });
      }
      for (const [recordId, fieldId, written] of [
        [first.recordId, closes, "2026-11-20"],
        [second.recordId, closes, "2026-11-20T00:00:00+01:00"],
        [first.recordId, meeting, "2026-11-20T08:00:00+01:00"],
      ] as const) {
        await prisma.recordValue.create({
          data: {
            companyId: w.companyId,
            typeId,
            recordId,
            fieldId,
            state: "value",
            lexicalValue: written,
            instantValue: new Date(written),
            schemaRevision,
          },
        });
      }
    });
    const candidates = (fieldId: string) =>
      runWithoutTenant(() =>
        createTestAutomationRuleRepo().findDateCandidatesCompanyWide({
          companyId: w.companyId,
          typeId,
          fieldId,
          from: new Date("2026-11-10T00:00:00.000Z"),
          to: new Date("2026-11-30T00:00:00.000Z"),
          limit: 10,
        }),
      );
    const byRecord = <T extends { recordId: string }>(rows: T[]) =>
      [...rows].sort((left, right) => left.recordId.localeCompare(right.recordId));

    const days = await candidates(closes);
    expect(byRecord(days)).toEqual(
      byRecord([
        { recordId: first.recordId, kind: "date", fieldValue: "2026-11-20" },
        { recordId: second.recordId, kind: "date", fieldValue: "2026-11-20T00:00:00+01:00" },
      ]),
    );
    expect(await candidates(meeting)).toEqual([
      { recordId: first.recordId, kind: "dateTime", fieldValue: "2026-11-20T08:00:00+01:00" },
    ]);

    const trigger = {
      kind: "dateReached" as const,
      typeId,
      fieldId: closes,
      days: 2,
      direction: "before" as const,
      atHour: 8,
      timezone: "Europe/Berlin",
    };
    const due = dueDateOccurrences(trigger, days, new Date("2026-11-18T09:00:00.000Z"));
    expect(due.map((item) => [item.fieldValue, item.fireAt.toISOString()])).toEqual([
      ["2026-11-20", "2026-11-18T07:00:00.000Z"],
      ["2026-11-20", "2026-11-18T07:00:00.000Z"],
    ]);

    await runWithoutTenant(() =>
      prisma.recordFieldDefinition.updateMany({
        where: { companyId: w.companyId, id: closes },
        data: { archived: true },
      }),
    );
    expect(await candidates(closes)).toEqual([]);
    expect(await candidates(meeting)).toHaveLength(1);
    await runWithoutTenant(() =>
      prisma.recordTypeDefinition.updateMany({
        where: { companyId: w.companyId, id: typeId },
        data: { archived: true },
      }),
    );
    expect(await candidates(meeting)).toEqual([]);
  });
});
