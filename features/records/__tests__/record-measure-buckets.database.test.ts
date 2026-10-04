import type { RecordField, RecordRef, RecordScalar } from "../record-model.schema";
import type { RecordMeasure, RecordMeasureResult } from "../record-measure.schema";

import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { DisplayType } from "@/features/widget/widget-display.schema";
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
const { PrismaRecordRepo } = await import("../prisma-record.repository");
const { PrismaUserRepo } = await import("@/features/user/prisma-user.repository");
const { RecordAccessPolicy } = await import("../record-access");
const { RecordCalculationService } = await import("../record-calculation.service");
const { RecordWriteService } = await import("../record-write.service");
const { MutateRecordInteractor } = await import("../mutate-record.interactor");
const { QueryRecordMeasureInteractor } = await import("../query-record-measure.interactor");
const { RecordMeasureSchema } = await import("../record-measure.schema");
const { createCrmPreset, presetId } = await import("../crm-preset");
const { createWorkspaceRecordPreset } = await import("../workspace-record-preset");
const { PrismaRecordWidgetRepo } = await import("@/features/widget/prisma-record-widget.repository");
const { RecordWidgetReader } = await import("@/features/widget/record-widget-reader");
const { UpsertRecordWidgetInteractor } = await import("@/features/widget/record-widget.interactor");
const { GetWidgetGalleryInteractor } = await import("@/features/widget/get-widget-gallery.interactor");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companies: string[] = [];

type Preset = "crm" | "workspace";

async function fixture(preset: Preset = "crm") {
  const seed = await runWithoutTenant(async () => {
    const company = await prisma.company.create({ data: {} });
    companies.push(company.id);
    const role = await prisma.userRole.create({
      data: { companyId: company.id, name: "Administrator", isSystemRole: true },
    });
    const memberRole = await prisma.userRole.create({ data: { companyId: company.id, name: "Member" } });
    const user = (roleId: string, firstName: string) =>
      prisma.user.create({
        data: {
          companyId: company.id,
          roleId,
          firstName,
          lastName: "Test",
          email: `${randomUUID()}@example.test`,
          status: "active",
        },
      });
    return { company, role, memberRole, admin: await user(role.id, "Ada"), member: await user(memberRole.id, "Mia") };
  });
  const admin = createMockUser({ ...seed.admin, role: { ...seed.role, permissions: [] } });
  const member = createMockUser({ ...seed.member, role: { ...seed.memberRole, permissions: [] } });
  const repo = new PrismaRecordRepo();
  const policy = new RecordAccessPolicy(new PrismaUserRepo(), repo);
  const company = { getDetails: () => Promise.resolve({ currency: "EUR" }) };
  const mutate = new MutateRecordInteractor(
    repo,
    policy,
    new RecordWriteService(repo, policy, new RecordCalculationService(repo)),
    company,
    { dispatch: () => Promise.resolve() },
  );
  const measure = new QueryRecordMeasureInteractor(repo, policy, company);
  const reader = new RecordWidgetReader(repo, measure, new PrismaUserRepo());
  const widgets = new UpsertRecordWidgetInteractor(new PrismaRecordWidgetRepo(), repo, policy, measure, reader);
  const gallery = new GetWidgetGalleryInteractor(repo, policy);
  const id = (key: string) => presetId(seed.company.id, key);
  const model =
    preset === "crm"
      ? createCrmPreset(seed.company.id, "EUR")
      : createWorkspaceRecordPreset(seed.company.id, "EUR", (key) => key);
  const deal = id("deal");
  const field = (label: string, valueType: RecordField["valueType"]): RecordField => {
    const definition: RecordField = {
      id: randomUUID(),
      typeId: deal,
      label,
      valueType,
      behavior: { kind: "input" },
      required: false,
      archived: false,
      publishedSummary: false,
      options: [],
      position: model.fields.filter((candidate) => candidate.typeId === deal).length,
    };
    model.fields.push(definition);
    return definition;
  };
  const closeDate = field("Close date", "date");
  const closedAt = field("Closed at", "dateTime");
  const amount = field("Amount", "currency");
  const score = field("Score", "number");
  await runWithTenant(admin, () => runInTransaction(() => repo.saveModel(model, admin.id), { timeout: 30000 }));
  const run = <T>(fn: () => Promise<T>, as = admin) => runWithTenant(as, fn);
  const revision = async () =>
    (
      await runWithoutTenant(() =>
        prisma.recordSchemaState.findUniqueOrThrow({ where: { companyId: seed.company.id } }),
      )
    ).revision;
  const createDeal = async (
    values: Array<[RecordField | string, RecordScalar]>,
    assignedUserIds?: string[],
  ): Promise<RecordRef> => {
    const result = await run(async () =>
      mutate.invoke({
        expectedRevision: await revision(),
        idempotencyKey: randomUUID(),
        mutation: {
          action: "create",
          typeId: deal,
          fields: [
            { fieldId: id("deal.name"), value: { kind: "text", value: randomUUID() } },
            ...values.map(([key, value]) => ({ fieldId: typeof key === "string" ? id(key) : key.id, value })),
          ],
          ...(assignedUserIds ? { assignedUserIds } : {}),
        },
      }),
    );
    expect(result, JSON.stringify(result)).toMatchObject({ ok: true, data: { status: "completed" } });
    if (!result.ok || result.data.status !== "completed") throw new Error("Fixture creation failed");
    const ref = result.data.refs.find((candidate) => candidate.typeId === deal);
    if (!ref) throw new Error("The created deal is missing");
    return ref;
  };
  const query = async (input: Partial<RecordMeasure> & Pick<RecordMeasure, "groupBy">, as = admin) =>
    run(
      () =>
        measure.invoke(
          RecordMeasureSchema.parse({
            source: { typeId: deal },
            aggregation: "count",
            valueFieldId: null,
            ...input,
          }),
        ),
      as,
    );
  const buckets = async (input: Partial<RecordMeasure> & Pick<RecordMeasure, "groupBy">, as = admin) => {
    const result = await query(input, as);
    expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
    if (!result.ok) throw new Error("The measure failed");
    return result.data;
  };
  return {
    ...seed,
    admin,
    member,
    repo,
    id,
    deal,
    model,
    closeDate,
    closedAt,
    amount,
    score,
    run,
    revision,
    createDeal,
    query,
    buckets,
    reader,
    widgets,
    gallery,
    measure,
  };
}

const date = (value: string): RecordScalar => ({ kind: "date", value });
const instant = (value: string): RecordScalar => ({ kind: "dateTime", value });
const eur = (value: string): RecordScalar => ({ kind: "decimal", value, currency: "EUR" });

function text(value: RecordMeasureResult["groups"][number]["label"]) {
  return value.state === "value" && "value" in value.value ? value.value.value : value.state;
}

function series(result: RecordMeasureResult) {
  return result.groups.map((group) => [text(group.label), group.count, text(group.result)]);
}

afterAll(async () => {
  if (companies.length) await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: { in: companies } } }));
});

describeDatabase("time-bucketed record measures", () => {
  it("buckets date fields by day, ISO week, month, quarter and year in chronological order", async () => {
    const f = await fixture();
    for (const value of [
      "2026-01-05",
      "2026-01-11",
      "2026-01-12",
      "2026-02-28",
      "2026-04-01",
      "2026-12-28",
      "2027-01-01",
    ])
      await f.createDeal([[f.closeDate, date(value)]]);
    await f.createDeal([]);
    const group = (dateInterval: string, timeZone?: string) =>
      f.buckets({
        groupBy: { path: [], fieldId: f.closeDate.id, dateInterval, ...(timeZone ? { timeZone } : {}) } as never,
      });

    const day = await group("day");
    expect(series(day)).toEqual([
      ["2026-01-05", 1, "1"],
      ["2026-01-11", 1, "1"],
      ["2026-01-12", 1, "1"],
      ["2026-02-28", 1, "1"],
      ["2026-04-01", 1, "1"],
      ["2026-12-28", 1, "1"],
      ["2027-01-01", 1, "1"],
      ["missing", 1, "1"],
    ]);
    expect(day.total).toMatchObject({ count: 8, result: { state: "value", value: { value: "8" } } });
    expect(day.groups[0]).toMatchObject({
      fieldId: f.closeDate.id,
      record: null,
      label: { state: "value", value: { kind: "date", value: "2026-01-05" } },
    });
    expect(series(await group("week"))).toEqual([
      ["2026-01-05", 2, "2"],
      ["2026-01-12", 1, "1"],
      ["2026-02-23", 1, "1"],
      ["2026-03-30", 1, "1"],
      ["2026-12-28", 2, "2"],
      ["missing", 1, "1"],
    ]);
    expect(series(await group("month"))).toEqual([
      ["2026-01-01", 3, "3"],
      ["2026-02-01", 1, "1"],
      ["2026-04-01", 1, "1"],
      ["2026-12-01", 1, "1"],
      ["2027-01-01", 1, "1"],
      ["missing", 1, "1"],
    ]);
    expect(series(await group("quarter"))).toEqual([
      ["2026-01-01", 4, "4"],
      ["2026-04-01", 1, "1"],
      ["2026-10-01", 1, "1"],
      ["2027-01-01", 1, "1"],
      ["missing", 1, "1"],
    ]);
    expect(series(await group("year"))).toEqual([
      ["2026-01-01", 6, "6"],
      ["2027-01-01", 1, "1"],
      ["missing", 1, "1"],
    ]);
    expect(series(await group("month", "Pacific/Kiritimati"))).toEqual(series(await group("month")));
    expect(series(await group("day", "America/Los_Angeles"))).toEqual(series(day));
  }, 120_000);

  it("buckets dateTime values in the requested time zone across offsets, DST and the ISO year end", async () => {
    const f = await fixture();
    for (const value of [
      "2026-03-28T23:30:00Z",
      "2026-03-29T21:59:00Z",
      "2026-03-29T22:30:00Z",
      "2026-03-31T22:30:00Z",
      "2026-06-30T23:30:00-05:00",
      "2027-01-03T23:30:00Z",
    ])
      await f.createDeal([[f.closedAt, instant(value)]]);
    const group = (dateInterval: string, timeZone?: string) =>
      f.buckets({
        groupBy: { path: [], fieldId: f.closedAt.id, dateInterval, ...(timeZone ? { timeZone } : {}) } as never,
      });

    expect(series(await group("day", "UTC"))).toEqual([
      ["2026-03-28", 1, "1"],
      ["2026-03-29", 2, "2"],
      ["2026-03-31", 1, "1"],
      ["2026-07-01", 1, "1"],
      ["2027-01-03", 1, "1"],
    ]);
    expect(series(await group("day"))).toEqual(series(await group("day", "UTC")));
    expect(series(await group("day", "Europe/Berlin"))).toEqual([
      ["2026-03-29", 2, "2"],
      ["2026-03-30", 1, "1"],
      ["2026-04-01", 1, "1"],
      ["2026-07-01", 1, "1"],
      ["2027-01-04", 1, "1"],
    ]);
    expect(series(await group("month", "UTC"))).toEqual([
      ["2026-03-01", 4, "4"],
      ["2026-07-01", 1, "1"],
      ["2027-01-01", 1, "1"],
    ]);
    expect(series(await group("month", "Europe/Berlin"))).toEqual([
      ["2026-03-01", 3, "3"],
      ["2026-04-01", 1, "1"],
      ["2026-07-01", 1, "1"],
      ["2027-01-01", 1, "1"],
    ]);
    expect(series(await group("month", "America/New_York"))).toEqual([
      ["2026-03-01", 4, "4"],
      ["2026-07-01", 1, "1"],
      ["2027-01-01", 1, "1"],
    ]);
    expect(series(await group("month", "America/Chicago"))).toEqual([
      ["2026-03-01", 4, "4"],
      ["2026-06-01", 1, "1"],
      ["2027-01-01", 1, "1"],
    ]);
    expect(series(await group("week", "UTC")).map(([start]) => start)).toEqual([
      "2026-03-23",
      "2026-03-30",
      "2026-06-29",
      "2026-12-28",
    ]);
    expect(series(await group("week", "Europe/Berlin")).map(([start]) => start)).toEqual([
      "2026-03-23",
      "2026-03-30",
      "2026-06-29",
      "2027-01-04",
    ]);
    expect(series(await group("year", "Pacific/Kiritimati"))).toEqual([
      ["2026-01-01", 5, "5"],
      ["2027-01-01", 1, "1"],
    ]);
  }, 120_000);

  it("keeps exact decimals and currency for sum and average and reports empty inputs as missing", async () => {
    const f = await fixture();
    await f.createDeal([
      [f.closeDate, date("2026-05-02")],
      [f.amount, eur("0.1")],
      [f.score, { kind: "decimal", value: "12345678901234567890.123456789", currency: null }],
    ]);
    await f.createDeal([
      [f.closeDate, date("2026-05-30")],
      [f.amount, eur("0.2")],
      [f.score, { kind: "decimal", value: "0.000000001", currency: null }],
    ]);
    await f.createDeal([[f.closeDate, date("2026-07-15")]]);
    await f.createDeal([[f.amount, eur("5")]]);
    const groupBy: RecordMeasure["groupBy"] = { path: [], fieldId: f.closeDate.id, dateInterval: "month" };

    const sum = await f.buckets({ aggregation: "sum", valueFieldId: f.amount.id, groupBy });
    expect(sum.groups.map((group) => [group.label, group.result])).toEqual([
      [
        { state: "value", value: { kind: "date", value: "2026-05-01" } },
        { state: "value", value: { kind: "decimal", value: "0.3", currency: "EUR" } },
      ],
      [{ state: "value", value: { kind: "date", value: "2026-07-01" } }, { state: "missing" }],
      [{ state: "missing" }, { state: "value", value: { kind: "decimal", value: "5", currency: "EUR" } }],
    ]);
    expect(sum.total.result).toEqual({ state: "value", value: { kind: "decimal", value: "5.3", currency: "EUR" } });
    const average = await f.buckets({ aggregation: "average", valueFieldId: f.amount.id, groupBy });
    expect(average.groups[0].result).toEqual({
      state: "value",
      value: { kind: "decimal", value: "0.15", currency: "EUR" },
    });
    expect(average.groups[1].result).toEqual({ state: "missing" });
    const exact = await f.buckets({ aggregation: "sum", valueFieldId: f.score.id, groupBy });
    expect(exact.groups[0].result).toEqual({
      state: "value",
      value: { kind: "decimal", value: "12345678901234567890.12345679", currency: null },
    });
    const count = await f.buckets({ groupBy });
    expect(series(count)).toEqual([
      ["2026-05-01", 2, "2"],
      ["2026-07-01", 1, "1"],
      ["missing", 1, "1"],
    ]);
    for (const aggregation of ["min", "max"] as const) {
      const extreme = await f.buckets({ aggregation, valueFieldId: f.amount.id, groupBy });
      expect(extreme.groups[0].result).toMatchObject({
        state: "value",
        value: { value: aggregation === "min" ? "0.1" : "0.2", currency: "EUR" },
      });
    }
  }, 120_000);

  it("buckets system timestamps and groups by assignee with full attribution", async () => {
    const f = await fixture();
    const shared = await f.createDeal([[f.amount, eur("10")]], [f.admin.id, f.member.id]);
    await f.createDeal([[f.amount, eur("20")]], [f.admin.id]);
    await f.createDeal([[f.amount, eur("40")]], []);
    await runWithoutTenant(() =>
      prisma.crmRecord.update({
        where: { companyId_typeId_id: { companyId: f.company.id, typeId: shared.typeId, id: shared.recordId } },
        data: { createdAt: new Date("2025-12-31T23:30:00Z") },
      }),
    );
    const now = new Date();
    const thisMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
    const created = await f.buckets({
      groupBy: { path: [], fieldId: "system:createdAt", dateInterval: "month", timeZone: "UTC" },
    });
    expect(created.groups.map((group) => [group.fieldId, text(group.label), group.count])).toEqual([
      ["system:createdAt", "2025-12-01", 1],
      ["system:createdAt", thisMonth, 2],
    ]);
    const year = (timeZone: string) =>
      f.buckets({ groupBy: { path: [], fieldId: "system:createdAt", dateInterval: "year", timeZone } });
    const currentYear = `${now.getUTCFullYear()}-01-01`;
    expect(series(await year("UTC"))).toEqual(
      currentYear === "2025-01-01"
        ? [["2025-01-01", 3, "3"]]
        : [
            ["2025-01-01", 1, "1"],
            [currentYear, 2, "2"],
          ],
    );
    expect(series(await year("Europe/Berlin"))).toEqual(
      currentYear === "2026-01-01"
        ? [["2026-01-01", 3, "3"]]
        : [
            ["2026-01-01", 1, "1"],
            [currentYear, 2, "2"],
          ],
    );
    const updated = await f.buckets({ groupBy: { path: [], fieldId: "system:updatedAt", dateInterval: "day" } });
    expect(updated.total.count).toBe(3);
    expect(updated.groups.every((group) => group.label.state === "value" && group.label.value.kind === "date")).toBe(
      true,
    );

    const assignees = await f.buckets({
      aggregation: "sum",
      valueFieldId: f.amount.id,
      groupBy: { path: [], fieldId: "system:assignedTo" },
    });
    const byLabel = new Map(assignees.groups.map((group) => [text(group.label), [group.count, text(group.result)]]));
    expect(byLabel.get(f.admin.id)).toEqual([2, "30"]);
    expect(byLabel.get(f.member.id)).toEqual([1, "10"]);
    expect(byLabel.get("missing")).toEqual([1, "40"]);
    expect(assignees.total).toMatchObject({ count: 3, result: { state: "value", value: { value: "70" } } });
    expect(assignees.groups[0]).toMatchObject({ fieldId: "system:assignedTo", label: { value: { kind: "member" } } });
    const preview = await f.run(() =>
      f.reader.preview(
        RecordMeasureSchema.parse({
          source: { typeId: f.deal },
          aggregation: "count",
          valueFieldId: null,
          groupBy: { path: [], fieldId: "system:assignedTo" },
        }),
      ),
    );
    expect(preview.ok).toBe(true);
    if (preview.ok) {
      expect(preview.data.groupOptions).toEqual(
        expect.arrayContaining([
          { id: f.admin.id, label: "Ada Test", color: null },
          { id: f.member.id, label: "Mia Test", color: null },
        ]),
      );
    }
  }, 120_000);

  it("applies record access and restricted inputs exactly like ungrouped measures", async () => {
    const f = await fixture();
    await f.run(() =>
      runInTransaction(() => f.repo.setGrants(f.deal, [{ roleId: f.memberRole.id, actions: ["readOwn"] }])),
    );
    await f.createDeal(
      [
        [f.closeDate, date("2026-01-10")],
        [f.amount, eur("1")],
      ],
      [f.member.id],
    );
    await f.createDeal([
      [f.closeDate, date("2026-01-20")],
      [f.amount, eur("2")],
    ]);
    await f.createDeal([
      [f.closeDate, date("2026-02-10")],
      [f.amount, eur("4")],
    ]);
    const groupBy: RecordMeasure["groupBy"] = { path: [], fieldId: f.closeDate.id, dateInterval: "month" };
    const own = await f.buckets({ aggregation: "sum", valueFieldId: f.amount.id, groupBy }, f.member);
    expect(series(own)).toEqual([["2026-01-01", 1, "1"]]);
    expect(own.total).toMatchObject({ count: 1, result: { state: "value", value: { value: "1" } } });
    const all = await f.buckets({ aggregation: "sum", valueFieldId: f.amount.id, groupBy });
    expect(series(all)).toEqual([
      ["2026-01-01", 2, "3"],
      ["2026-02-01", 1, "4"],
    ]);

    const restricted = await fixture();
    await restricted.run(() =>
      runInTransaction(() =>
        restricted.repo.setGrants(restricted.deal, [{ roleId: restricted.memberRole.id, actions: ["readAll"] }]),
      ),
    );
    const deal = await restricted.createDeal([[restricted.closeDate, date("2026-03-03")]]);
    await restricted.createDeal([[restricted.closeDate, date("2026-04-04")]]);
    const service = await restricted.run(async () => {
      const result = await new MutateRecordInteractor(
        restricted.repo,
        new RecordAccessPolicy(new PrismaUserRepo(), restricted.repo),
        new RecordWriteService(
          restricted.repo,
          new RecordAccessPolicy(new PrismaUserRepo(), restricted.repo),
          new RecordCalculationService(restricted.repo),
        ),
        { getDetails: () => Promise.resolve({ currency: "EUR" }) },
        { dispatch: () => Promise.resolve() },
      ).invoke({
        expectedRevision: await restricted.revision(),
        idempotencyKey: randomUUID(),
        mutation: {
          action: "create",
          typeId: restricted.id("service"),
          fields: [
            { fieldId: restricted.id("service.name"), value: { kind: "text", value: "Private" } },
            { fieldId: restricted.id("service.amount"), value: eur("10") },
          ],
        },
      });
      if (!result.ok || result.data.status !== "completed") throw new Error("Service creation failed");
      const created = result.data.refs.find((ref) => ref.typeId === restricted.id("service"));
      if (!created) throw new Error("Service missing");
      const line = await new MutateRecordInteractor(
        restricted.repo,
        new RecordAccessPolicy(new PrismaUserRepo(), restricted.repo),
        new RecordWriteService(
          restricted.repo,
          new RecordAccessPolicy(new PrismaUserRepo(), restricted.repo),
          new RecordCalculationService(restricted.repo),
        ),
        { getDetails: () => Promise.resolve({ currency: "EUR" }) },
        { dispatch: () => Promise.resolve() },
      ).invoke({
        expectedRevision: await restricted.revision(),
        idempotencyKey: randomUUID(),
        mutation: {
          action: "create",
          typeId: restricted.id("lineItem"),
          fields: [{ fieldId: restricted.id("lineItem.name"), value: { kind: "text", value: "Private" } }],
          links: [
            { relationId: restricted.id("lineItem.deal"), direction: "outgoing", record: deal },
            { relationId: restricted.id("lineItem.service"), direction: "outgoing", record: created },
          ],
        },
      });
      expect(line, JSON.stringify(line)).toMatchObject({ ok: true, data: { status: "completed" } });
      return created;
    });
    expect(service.typeId).toBe(restricted.id("service"));
    const input = {
      aggregation: "sum" as const,
      valueFieldId: restricted.id("deal.totalValue"),
      groupBy: { path: [], fieldId: restricted.closeDate.id, dateInterval: "month" } as RecordMeasure["groupBy"],
    };
    const visible = await restricted.buckets(input);
    expect(series(visible)).toEqual([
      ["2026-03-01", 1, "10"],
      ["2026-04-01", 1, "0"],
    ]);
    const hidden = await restricted.buckets(input, restricted.member);
    expect(hidden.groups.map((group) => [group.label, group.count, group.result.state])).toEqual([
      [{ state: "value", value: { kind: "date", value: "2026-03-01" } }, 1, "restricted"],
      [{ state: "value", value: { kind: "date", value: "2026-04-01" } }, 1, "value"],
    ]);
    expect(hidden.total.result).toEqual({ state: "restricted" });
    expect(JSON.stringify(hidden)).not.toContain('"10"');
  }, 120_000);

  it("rejects intervals and time zones that do not fit the grouping with structured errors", async () => {
    const f = await fixture();
    await f.createDeal([[f.closeDate, date("2026-01-01")]]);
    const failure = async (groupBy: object) => {
      const result = await f.query({ groupBy } as never);
      expect(result.ok, JSON.stringify(result)).toBe(false);
      return result.ok ? null : JSON.stringify(result.error);
    };
    for (const fieldId of [f.id("deal.stage"), f.amount.id, null, "system:assignedTo"]) {
      const error = await failure({ path: [], fieldId, dateInterval: "month" });
      expect(error).toContain(CustomErrorCode.recordMeasureDateIntervalInvalid);
      expect(error).toContain("dateInterval");
    }
    const zone = await failure({ path: [], fieldId: f.closeDate.id, timeZone: "Europe/Berlin" });
    expect(zone).toContain(CustomErrorCode.recordMeasureDateIntervalInvalid);
    expect(zone).toContain("timeZone");
    for (const timeZone of ["Mars/Olympus", "+01:00", "UTC; DROP TABLE"]) {
      expect(
        RecordMeasureSchema.safeParse({
          source: { typeId: f.deal },
          aggregation: "count",
          valueFieldId: null,
          groupBy: { path: [], fieldId: f.closeDate.id, dateInterval: "day", timeZone },
        }).success,
      ).toBe(false);
    }
    for (let day = 1; day <= 5; day += 1) await f.createDeal([[f.closeDate, date(`2026-02-0${day}`)]]);
    const budget = await f.query({
      groupBy: { path: [], fieldId: f.closeDate.id, dateInterval: "day" },
      groupLimit: 5,
    });
    expect(budget.ok).toBe(false);
    if (!budget.ok) expect(JSON.stringify(budget.error)).toContain(CustomErrorCode.recordCalculationBudget);
  }, 120_000);

  it("persists only display types that fit the measure", async () => {
    const f = await fixture();
    await f.createDeal([
      [f.closeDate, date("2026-01-01")],
      ["deal.stage", { kind: "select", value: f.id("deal.stage.won") }],
    ]);
    const save = async (displayType: DisplayType, groupBy: RecordMeasure["groupBy"]) =>
      f.run(async () =>
        f.widgets.invoke({
          expectedRevision: await f.revision(),
          idempotencyKey: randomUUID(),
          name: `${displayType} widget`,
          isTemplate: false,
          measure: RecordMeasureSchema.parse({
            source: { typeId: f.deal },
            aggregation: "count",
            valueFieldId: null,
            groupBy,
          }),
          displayOptions: { displayType },
        }),
      );
    const byStage: RecordMeasure["groupBy"] = { path: [], fieldId: f.id("deal.stage") };
    const byMonth: RecordMeasure["groupBy"] = { path: [], fieldId: f.closeDate.id, dateInterval: "month" };
    const accepted: Array<[DisplayType, RecordMeasure["groupBy"]]> = [
      [DisplayType.number, null],
      [DisplayType.areaChart, byMonth],
      [DisplayType.rankedTable, byStage],
      [DisplayType.rankedTable, byMonth],
      [DisplayType.funnelChart, byStage],
      [DisplayType.verticalBarChart, byMonth],
    ];
    for (const [displayType, groupBy] of accepted) {
      expect(await save(displayType, groupBy), displayType).toMatchObject({
        ok: true,
        data: { displayOptions: { displayType }, status: "ready" },
      });
    }
    const rejected: Array<[DisplayType, RecordMeasure["groupBy"]]> = [
      [DisplayType.number, byStage],
      [DisplayType.areaChart, byStage],
      [DisplayType.areaChart, null],
      [DisplayType.rankedTable, null],
      [DisplayType.funnelChart, byMonth],
      [DisplayType.funnelChart, { path: [], fieldId: f.closeDate.id }],
      [DisplayType.funnelChart, { path: [], fieldId: null }],
      [DisplayType.funnelChart, { path: [], fieldId: "system:assignedTo" }],
    ];
    for (const [displayType, groupBy] of rejected) {
      const result = await save(displayType, groupBy);
      expect(result.ok, `${displayType} ${JSON.stringify(groupBy)}`).toBe(false);
      if (!result.ok) expect(JSON.stringify(result.error)).toContain(CustomErrorCode.widgetDisplayTypeUnsupported);
    }
    const stored = await runWithoutTenant(() =>
      prisma.widget.findMany({ where: { companyId: f.company.id }, select: { displayOptions: true } }),
    );
    expect(stored).toHaveLength(accepted.length);
  }, 120_000);

  it("resolves gallery templates against the preset model and hides what the model or access cannot support", async () => {
    const f = await fixture("workspace");
    const stage = f.model.fields.find((field) => field.id === f.id("deal.stage"));
    if (!stage) throw new Error("The workspace stage field is missing");
    const workspace = await f.run(() => f.gallery.invoke());
    expect(workspace.ok).toBe(true);
    if (!workspace.ok) return;
    const byKey = new Map(workspace.data.templates.map((template) => [template.key, template]));
    expect([...byKey.keys()]).toEqual([
      "openPipeline",
      "dealsByStage",
      "wonValuePerMonth",
      "topOrganizationsByRevenue",
      "openTasksPerAssignee",
    ]);
    const won = [f.id("deal.stage.won")];
    const lost = [f.id("deal.stage.lost")];
    expect(byKey.get("openPipeline")).toMatchObject({
      displayOptions: { displayType: DisplayType.number },
      measure: {
        aggregation: "sum",
        valueFieldId: f.id("deal.totalValue"),
        groupBy: null,
        source: {
          typeId: f.deal,
          filters: [
            {
              fieldId: stage.id,
              operator: "notIn",
              values: [...won, ...lost].map((value) => ({ kind: "select", value })),
            },
          ],
        },
      },
    });
    expect(byKey.get("dealsByStage")).toMatchObject({
      displayOptions: { displayType: DisplayType.funnelChart },
      measure: { aggregation: "count", groupBy: { fieldId: stage.id } },
    });
    expect(byKey.get("wonValuePerMonth")).toMatchObject({
      displayOptions: { displayType: DisplayType.areaChart },
      measure: { groupBy: { fieldId: f.closeDate.id, dateInterval: "month" }, groupLimit: 1000 },
    });
    expect(byKey.get("topOrganizationsByRevenue")).toMatchObject({
      displayOptions: { displayType: DisplayType.rankedTable },
      measure: {
        groupBy: { path: [{ relationId: f.id("deal.organizations"), direction: "outgoing" }], fieldId: null },
      },
    });
    expect(byKey.get("openTasksPerAssignee")).toMatchObject({
      displayOptions: { displayType: DisplayType.horizontalBarChart },
      measure: {
        source: {
          typeId: f.id("task"),
          filters: [
            {
              operator: "notIn",
              values: [f.id("task.status.done"), f.id("task.status.archived")].map((value) => ({
                kind: "select",
                value,
              })),
            },
          ],
        },
        groupBy: { fieldId: "system:assignedTo" },
      },
    });
    for (const template of workspace.data.templates) {
      const result = await f.run(() => f.measure.invoke(template.measure));
      expect(result.ok, template.key).toBe(true);
    }

    const crm = await fixture("crm");
    const plain = await crm.run(() => crm.gallery.invoke());
    expect(plain.ok && plain.data.templates.map((template) => template.key)).toEqual([
      "openPipeline",
      "dealsByStage",
      "wonValuePerMonth",
      "topOrganizationsByRevenue",
    ]);
    if (plain.ok) {
      expect(plain.data.templates.find((template) => template.key === "openPipeline")?.measure.source.filters).toEqual([
        {
          fieldId: crm.id("deal.stage"),
          operator: "notIn",
          value: null,
          values: [crm.id("deal.stage.won"), crm.id("deal.stage.lost")].map((value) => ({ kind: "select", value })),
        },
      ]);
    }
    await crm.run(() =>
      runInTransaction(() => crm.repo.setGrants(crm.deal, [{ roleId: crm.memberRole.id, actions: ["readOwn"] }])),
    );
    const scoped = await crm.run(() => crm.gallery.invoke(), crm.member);
    expect(scoped.ok && scoped.data.templates.map((template) => template.key)).toEqual([
      "openPipeline",
      "dealsByStage",
      "wonValuePerMonth",
    ]);
  }, 120_000);
});
