import type { RecordField, RecordRef, RecordScalar } from "@/features/records/record-model.schema";
import type { CalendarWidgetQuery } from "../record-calendar-widget.schema";
import type { MapWidgetQuery } from "../record-map-widget.schema";

import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";

import { PermissionService } from "@/core/base/permission.service";
import { ViewMode } from "@/core/base/base-query-builder";
import { addCalendarDays } from "@/features/record-calendar/calendar-date";
import { zonedDate } from "@/features/record-calendar/zoned-time";
import { calendarEditChanges } from "@/features/record-calendar/calendar-entries";
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
const { PrismaUserRepo } = await import("@/features/user/prisma-user.repository");
const { PrismaBillingUsageRepo } = await import("@/features/billing-usage/prisma-billing-usage.repository");
const { RecordAccessPolicy } = await import("@/features/records/record-access");
const { RecordCalculationService } = await import("@/features/records/record-calculation.service");
const { RecordWriteService } = await import("@/features/records/record-write.service");
const { MutateRecordInteractor } = await import("@/features/records/mutate-record.interactor");
const { RecordTrashService } = await import("@/features/records/record-trash.service");
const { QueryRecordMeasureInteractor } = await import("@/features/records/query-record-measure.interactor");
const { QueryRecordsInteractor } = await import("@/features/records/query-records.interactor");
const { GetRecordPresentationInteractor } = await import("@/features/records/get-record-presentation.interactor");
const { RecordConfigurationService } = await import("@/features/records/configuration.service");
const { PreviewRecordConfigurationInteractor } = await import(
  "@/features/records/preview-record-configuration.interactor"
);
const { createCrmPreset, presetId } = await import("@/features/records/crm-preset");
const { createTestDataViewRepo, createTestRecordRepo } = await import("@/tests/helpers/record-repository");
const { PrismaWidgetRepo } = await import("../prisma-widget.repository");
const { RecordCalendarWidgetReader } = await import("../record-calendar-widget-reader");
const { RecordMapWidgetReader } = await import("../record-map-widget-reader");
const { UpsertRecordCalendarWidgetInteractor } = await import("../record-calendar-widget.interactor");
const { UpsertRecordMapWidgetInteractor } = await import("../record-map-widget.interactor");
const { GetRecordWidgetInteractor } = await import("../get-record-widget.interactor");
const { RecordWidgetReader } = await import("../record-widget-reader");
const { RecordActivityWidgetReader } = await import("../record-activity-widget-reader");
const { CalendarWidgetQuerySchema } = await import("../record-calendar-widget.schema");
const { GetRecordInteractor } = await import("@/features/records/get-record.interactor");
const { MapWidgetQuerySchema } = await import("../record-map-widget.schema");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companies: string[] = [];
const ZONE = "Europe/Berlin";

afterAll(async () => {
  await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: { in: companies } } }));
});

async function fixture() {
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
  const repo = createTestRecordRepo();
  const policy = new RecordAccessPolicy(
    new PrismaUserRepo(new PermissionService(), new PrismaBillingUsageRepo()),
    repo,
  );
  const calculations = new RecordCalculationService(repo);
  const mutate = new MutateRecordInteractor(
    repo,
    policy,
    new RecordWriteService(repo, policy, calculations),
    { dispatch: () => Promise.resolve() },
    new RecordTrashService(repo, new RecordCalculationService(repo)),
  );
  const query = new QueryRecordsInteractor(repo, policy);
  const measure = new QueryRecordMeasureInteractor(repo, policy);
  const widgets = new PrismaWidgetRepo();
  const calendarReader = new RecordCalendarWidgetReader(repo, query, measure);
  const mapReader = new RecordMapWidgetReader(repo, query);
  const views = createTestDataViewRepo();
  const saveCalendar = new UpsertRecordCalendarWidgetInteractor(widgets, repo, policy, calendarReader, views);
  const saveMap = new UpsertRecordMapWidgetInteractor(widgets, repo, policy, mapReader, views);
  const readWidget = new GetRecordWidgetInteractor(
    widgets,
    new RecordWidgetReader(repo, measure, new PrismaUserRepo(new PermissionService(), new PrismaBillingUsageRepo())),
    policy,
    new RecordActivityWidgetReader(repo, { invoke: () => Promise.reject(new Error("unused")) } as never),
    calendarReader,
    mapReader,
  );
  const presentation = new GetRecordPresentationInteractor(repo, policy, views, query);
  const read = new GetRecordInteractor(repo, policy);
  const previewConfiguration = new PreviewRecordConfigurationInteractor(
    repo,
    policy,
    new RecordConfigurationService(repo),
  );
  const id = (key: string) => presetId(seed.company.id, key);
  const model = createCrmPreset(seed.company.id);
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
      ...(valueType === "currency" ? { format: { currency: "EUR" } } : {}),
    };
    model.fields.push(definition);
    return definition;
  };
  const fields = {
    closeDate: field("Close date", "date"),
    endDate: field("End date", "date"),
    meetingAt: field("Meeting at", "dateTime"),
    period: field("Period", "dateRange"),
    amount: field("Amount", "currency"),
    address: field("Address", "address"),
    note: field("Note", "text"),
    stage: id("deal.stage"),
    name: id("deal.name"),
  };
  await runWithTenant(admin, () => runInTransaction(() => repo.saveModel(model, admin.id), { timeout: 30000 }));
  const run = <T>(fn: () => Promise<T>, as = admin) => runWithTenant(as, fn);
  const revision = async () =>
    (
      await runWithoutTenant(() =>
        prisma.recordSchemaState.findUniqueOrThrow({ where: { companyId: seed.company.id } }),
      )
    ).revision;
  const createDeal = async (
    name: string,
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
            { fieldId: fields.name, value: { kind: "text", value: name } },
            ...values.map(([key, value]) => ({ fieldId: typeof key === "string" ? key : key.id, value })),
          ],
          ...(assignedUserIds ? { assignedUserIds } : {}),
        },
      }),
    );
    if (!result.ok || result.data.status !== "completed") throw new Error(JSON.stringify(result));
    const ref = result.data.refs.find((candidate) => candidate.typeId === deal);
    if (!ref) throw new Error("Created deal is missing");
    return ref;
  };
  const locate = (ref: RecordRef, lat: number, lon: number) =>
    runWithoutTenant(async () => {
      const where = {
        companyId_typeId_recordId_fieldId: {
          companyId: seed.company.id,
          typeId: ref.typeId,
          recordId: ref.recordId,
          fieldId: fields.address.id,
        },
      };
      const stored = await prisma.recordValue.findUniqueOrThrow({ where });
      await prisma.recordValue.update({
        where: { ...where, companyId: seed.company.id },
        data: {
          jsonValue: {
            ...(stored.jsonValue as Record<string, unknown>),
            location: { lat, lon, precision: "postcode" },
          },
        },
      });
    });
  const grant = (actions: Array<"readOwn" | "readAll" | "update">) =>
    run(() =>
      runInTransaction(() => repo.setGrants(deal, [{ roleId: seed.memberRole.id, actions }]), { timeout: 30000 }),
    );
  const calendarQuery = (overrides: Partial<CalendarWidgetQuery> = {}): CalendarWidgetQuery =>
    CalendarWidgetQuerySchema.parse({
      source: { typeId: deal, filters: [], relationships: [] },
      dateFieldId: fields.closeDate.id,
      layout: "upcoming",
      timeZone: ZONE,
      ...overrides,
    });
  const mapQuery = (overrides: Partial<MapWidgetQuery> = {}): MapWidgetQuery =>
    MapWidgetQuerySchema.parse({
      source: { typeId: deal, filters: [], relationships: [] },
      addressFieldId: fields.address.id,
      ...overrides,
    });
  return {
    ...seed,
    admin,
    member,
    id,
    deal,
    fields,
    run,
    revision,
    createDeal,
    locate,
    grant,
    calendarReader,
    mapReader,
    saveCalendar,
    saveMap,
    readWidget,
    presentation,
    previewConfiguration,
    calendarQuery,
    mapQuery,
    mutate,
    query,
    read,
  };
}

const names = (items: Array<{ title: { state: string; value?: unknown } }>) =>
  items.map(({ title }) => (title.state === "value" ? (title.value as { value: string }).value : title.state));
const date = (value: string): RecordScalar => ({ kind: "date", value });
const money = (value: string): RecordScalar => ({ kind: "decimal", value, currency: "EUR" });
const address = (street: string, postalCode: string, city: string): RecordScalar =>
  ({
    kind: "address",
    value: { street, line2: null, postalCode, city, region: null, countryCode: "de" },
  }) as RecordScalar;

describeDatabase("calendar and map widgets on PostgreSQL", () => {
  it("lists the next days by date with the overdue records first and their amounts", async () => {
    const f = await fixture();
    const today = zonedDate(new Date(), ZONE);
    await f.createDeal("Overdue", [
      [f.fields.closeDate, date(addCalendarDays(today, -2))],
      [f.fields.amount, money("100")],
    ]);
    await f.createDeal("Today", [
      [f.fields.closeDate, date(today)],
      [f.fields.amount, money("250.5")],
    ]);
    await f.createDeal("Soon", [[f.fields.closeDate, date(addCalendarDays(today, 3))]]);
    await f.createDeal("Later", [[f.fields.closeDate, date(addCalendarDays(today, 20))]]);
    await f.createDeal("Undated", []);

    const result = await f.run(() =>
      f.calendarReader.preview(f.calendarQuery({ days: 14, amountFieldId: f.fields.amount.id })),
    );
    if (!result.ok) throw new Error(JSON.stringify(result));
    const { data, fields } = result.data;
    expect(data.today).toBe(today);
    expect(data.window).toEqual({ from: today, to: addCalendarDays(today, 13) });
    expect(names(data.items)).toEqual(["Today", "Soon"]);
    expect(data.items.map(({ date: day }) => day)).toEqual([today, addCalendarDays(today, 3)]);
    expect(data.items[0].amount).toEqual({
      state: "value",
      value: { kind: "decimal", value: "250.5", currency: "EUR" },
    });
    expect(data.items[1].amount).toEqual({ state: "missing" });
    expect(names(data.overdue)).toEqual(["Overdue"]);
    expect(data.overdueCount).toBe(1);
    expect(data.truncated).toBe(false);
    expect(data.total.count).toBe(2);
    expect(fields.map(({ id }) => id).sort()).toEqual(
      [f.fields.name, f.fields.closeDate.id, f.fields.amount.id].sort(),
    );

    const quiet = await f.run(() => f.calendarReader.preview(f.calendarQuery({ showOverdue: false })));
    expect(quiet.ok && quiet.data.data.overdue).toEqual([]);
  });

  it("buckets a month per day in the widget time zone and sums an amount", async () => {
    const f = await fixture();
    const instant = (value: string): RecordScalar => ({ kind: "dateTime", value });
    await f.createDeal("Late on the 28th in UTC", [
      [f.fields.meetingAt, instant("2026-03-28T23:30:00.000Z")],
      [f.fields.amount, money("40")],
    ]);
    await f.createDeal("Morning of the 29th", [
      [f.fields.meetingAt, instant("2026-03-29T07:00:00.000Z")],
      [f.fields.amount, money("60")],
    ]);
    await f.createDeal("April", [[f.fields.meetingAt, instant("2026-04-01T10:00:00.000Z")]]);
    const window = { from: "2026-03-01", to: "2026-03-31" };
    const month = (timeZone: string) =>
      f.run(() =>
        f.calendarReader.preview(
          f.calendarQuery({
            dateFieldId: f.fields.meetingAt.id,
            layout: "month",
            timeZone,
            aggregation: "sum",
            amountFieldId: f.fields.amount.id,
          }),
          window,
        ),
      );
    const berlin = await month(ZONE);
    if (!berlin.ok) throw new Error(JSON.stringify(berlin));
    expect(berlin.data.data.days.map(({ date: day, count }) => [day, count])).toEqual([["2026-03-29", 2]]);
    expect(berlin.data.data.days[0].result).toMatchObject({ state: "value", value: { value: "100" } });
    expect(berlin.data.data.total).toMatchObject({ count: 2, result: { state: "value", value: { value: "100" } } });
    expect(berlin.data.data.items.map(({ date: day }) => day)).toEqual(["2026-03-29", "2026-03-29"]);
    const utc = await month("UTC");
    expect(utc.ok && utc.data.data.days.map(({ date: day }) => day)).toEqual(["2026-03-28", "2026-03-29"]);
  });

  it("shows a member only the records and widgets their access allows", async () => {
    const f = await fixture();
    const today = zonedDate(new Date(), ZONE);
    await f.grant(["readOwn"]);
    const own = await f.createDeal(
      "Mine",
      [
        [f.fields.closeDate, date(today)],
        [f.fields.address, address("Hafenstraße 1", "20457", "Hamburg")],
      ],
      [f.member.id],
    );
    const other = await f.createDeal("Theirs", [
      [f.fields.closeDate, date(today)],
      [f.fields.address, address("Lindenstraße 2", "10969", "Berlin")],
    ]);
    await f.locate(own, 53.5413, 9.9911);
    await f.locate(other, 52.505, 13.395);

    const calendar = await f.run(() => f.calendarReader.preview(f.calendarQuery()), f.member);
    expect(calendar.ok && names(calendar.data.data.items)).toEqual(["Mine"]);
    const map = await f.run(() => f.mapReader.preview(f.mapQuery()), f.member);
    expect(map.ok && map.data.data).toMatchObject({ total: 1, withoutLocation: 0 });
    expect(map.ok && names(map.data.data.points)).toEqual(["Mine"]);

    const saved = await f.run(async () =>
      f.saveMap.invoke({
        expectedRevision: await f.revision(),
        idempotencyKey: randomUUID(),
        name: "Locations",
        mapQuery: f.mapQuery(),
        displayOptions: { showFilters: false },
        isTemplate: true,
        kind: "map",
      }),
    );
    if (!saved.ok) throw new Error(JSON.stringify(saved));
    expect(saved.data.data?.points).toHaveLength(2);
    const shared = await f.run(() => f.readWidget.invoke({ id: saved.data.id }), f.member);
    expect(shared.ok && shared.data.kind === "map" && names(shared.data.data?.points ?? [])).toEqual(["Mine"]);
    const windowed = await f.run(() => f.readWidget.invoke({ id: saved.data.id, window: { from: today, to: today } }));
    expect(windowed).toMatchObject({ ok: false });
    expect(JSON.stringify(windowed)).toContain("window");
    const missing = await f.run(() => f.readWidget.invoke({ id: randomUUID() }));
    expect(missing).toMatchObject({ ok: false });
    expect(JSON.stringify(missing)).toContain("widgetNotFound");
  });

  it("places located records on the map with color, size and detail and counts the others", async () => {
    const f = await fixture();
    const hamburg = await f.createDeal("Hamburg", [
      [f.fields.address, address("Hafenstraße 1", "20457", "Hamburg")],
      [f.fields.stage, { kind: "select", value: f.id("deal.stage.proposal") }],
      [f.fields.amount, money("24000")],
      [f.fields.note, { kind: "text", value: "Key account" }],
    ]);
    await f.createDeal("Typed but not located", [[f.fields.address, address("Lindenstraße 2", "10969", "Berlin")]]);
    await f.createDeal("No address", []);
    await f.locate(hamburg, 53.5413, 9.9911);

    const result = await f.run(() =>
      f.mapReader.preview(
        f.mapQuery({ colorFieldId: f.fields.stage, sizeFieldId: f.fields.amount.id, detailFieldId: f.fields.note.id }),
      ),
    );
    if (!result.ok) throw new Error(JSON.stringify(result));
    expect(result.data.data).toMatchObject({ total: 3, withoutLocation: 2, truncated: false });
    expect(result.data.data.points).toEqual([
      expect.objectContaining({
        lat: 53.5413,
        lon: 9.9911,
        precision: "postcode",
        color: f.id("deal.stage.proposal"),
        size: { state: "value", value: { kind: "decimal", value: "24000", currency: "EUR" } },
        detail: { state: "value", value: { kind: "text", value: "Key account" } },
      }),
    ]);
    expect(result.data.data.points[0].address).toContain("Hamburg");
    expect(result.data.fields.find(({ id }) => id === f.fields.stage)?.options.map(({ label }) => label)).toContain(
      "Proposal",
    );
  });

  it("validates fields on save, keeps retries idempotent, refuses stale versions and reads other windows", async () => {
    const f = await fixture();
    const today = zonedDate(new Date(), ZONE);
    await f.createDeal("Today", [[f.fields.closeDate, date(today)]]);
    const create = async (calendarQuery: CalendarWidgetQuery, idempotencyKey = randomUUID()) =>
      f.run(async () =>
        f.saveCalendar.invoke({
          expectedRevision: await f.revision(),
          idempotencyKey,
          name: "Closing",
          calendarQuery,
          displayOptions: { showFilters: true },
          isTemplate: false,
          kind: "calendar",
        }),
      );
    expect(await create(f.calendarQuery({ dateFieldId: f.fields.note.id }))).toMatchObject({
      ok: false,
      error: expect.anything(),
    });
    expect(await create(f.calendarQuery({ aggregation: "sum", layout: "month" }))).toMatchObject({ ok: false });
    expect(
      await f.run(async () =>
        f.saveMap.invoke({
          expectedRevision: await f.revision(),
          idempotencyKey: randomUUID(),
          name: "Wrong field",
          mapQuery: f.mapQuery({ addressFieldId: f.fields.closeDate.id }),
          displayOptions: { showFilters: true },
          isTemplate: false,
          kind: "map",
        }),
      ),
    ).toMatchObject({ ok: false });

    const key = randomUUID();
    const first = await create(f.calendarQuery({ layout: "month" }), key);
    if (!first.ok) throw new Error(JSON.stringify(first));
    expect(first.data).toMatchObject({ kind: "calendar", version: 1, status: "ready" });
    expect(first.data.layout?.lg).toMatchObject({ w: 4, h: 7 });
    const retry = await create(f.calendarQuery({ layout: "month" }), key);
    expect(retry.ok && retry.data.id).toBe(first.data.id);

    const update = (expectedVersion: number) =>
      f.run(async () =>
        f.saveCalendar.invoke({
          id: first.data.id,
          expectedVersion,
          expectedRevision: await f.revision(),
          idempotencyKey: randomUUID(),
          name: `Version ${expectedVersion}`,
        }),
      );
    expect(await update(1)).toMatchObject({ ok: true, data: { version: 2, name: "Version 1" } });
    expect(await update(1)).toMatchObject({ ok: false });

    const day = await f.run(() => f.readWidget.invoke({ id: first.data.id, window: { from: today, to: today } }));
    expect(day.ok && day.data.kind === "calendar" && day.data.data?.window).toEqual({ from: today, to: today });
    expect(day.ok && day.data.kind === "calendar" && names(day.data.data?.items ?? [])).toEqual(["Today"]);
    const wide = await f.run(() =>
      f.readWidget.invoke({ id: first.data.id, window: { from: today, to: addCalendarDays(today, 60) } }),
    );
    expect(wide).toMatchObject({ ok: false });
  });

  it("drops optional fields from widgets on deletion and blocks deleting their date or address field", async () => {
    const f = await fixture();
    const save = await f.run(async () =>
      f.saveMap.invoke({
        expectedRevision: await f.revision(),
        idempotencyKey: randomUUID(),
        name: "Map",
        mapQuery: f.mapQuery({ detailFieldId: f.fields.note.id }),
        displayOptions: { showFilters: true },
        isTemplate: false,
        kind: "map",
      }),
    );
    if (!save.ok) throw new Error(JSON.stringify(save));
    const calendar = await f.run(async () =>
      f.saveCalendar.invoke({
        expectedRevision: await f.revision(),
        idempotencyKey: randomUUID(),
        name: "Calendar",
        calendarQuery: f.calendarQuery({ layout: "month", aggregation: "sum", amountFieldId: f.fields.amount.id }),
        displayOptions: { showFilters: true },
        isTemplate: false,
        kind: "calendar",
      }),
    );
    if (!calendar.ok) throw new Error(JSON.stringify(calendar));
    const preview = (fieldId: string) =>
      f.run(async () =>
        f.previewConfiguration.invoke({
          expectedRevision: await f.revision(),
          idempotencyKey: randomUUID(),
          operations: [{ operation: "delete", target: { kind: "field", id: fieldId } }],
        }),
      );
    expect(await preview(f.fields.note.id)).toMatchObject({
      ok: true,
      data: {
        deletion: {
          blockers: [],
          cleaned: expect.arrayContaining([
            expect.objectContaining({ consumer: expect.objectContaining({ id: save.data.id }) }),
          ]),
        },
      },
    });
    expect(await preview(f.fields.amount.id)).toMatchObject({
      ok: true,
      data: {
        deletion: {
          cleaned: expect.arrayContaining([
            expect.objectContaining({
              consumer: expect.objectContaining({ id: calendar.data.id }),
              effect: "countsRecords",
            }),
          ]),
        },
      },
    });
    for (const fieldId of [f.fields.address.id, f.fields.closeDate.id]) {
      expect(await preview(fieldId)).toMatchObject({
        ok: true,
        data: {
          valid: false,
          deletion: {
            blockers: expect.arrayContaining([expect.objectContaining({ reason: "widget" })]),
          },
        },
      });
    }
  });

  it("returns the records of a calendar window for the list, including spans that began earlier", async () => {
    const f = await fixture();
    await f.createDeal("Inside", [[f.fields.closeDate, date("2026-10-14")]]);
    await f.createDeal("Before", [[f.fields.closeDate, date("2026-09-20")]]);
    await f.createDeal("Spanning", [
      [f.fields.closeDate, date("2026-09-25")],
      [f.fields.endDate, date("2026-10-03")],
    ]);
    await f.createDeal("Range", [[f.fields.period, { kind: "range", start: "2026-09-30", end: "2026-10-02" }]]);
    const window = { from: "2026-10-01", to: "2026-10-31", timeZone: ZONE };
    const listed = (calendar: { dateFieldId: string; endDateFieldId?: string }, as = f.admin) =>
      f.run(
        () =>
          f.presentation.invoke({
            typeId: f.deal,
            params: { viewMode: ViewMode.calendar, calendar, calendarWindow: window },
          }),
        as,
      );
    const single = await listed({ dateFieldId: f.fields.closeDate.id });
    if (!single.ok) throw new Error(JSON.stringify(single));
    expect(
      single.data.result.items.map(({ fields }) => fields.find(({ fieldId }) => fieldId === f.fields.name)?.result),
    ).toEqual([{ state: "value", value: { kind: "text", value: "Inside" } }]);
    expect(single.data.result.calendarRange).toEqual({
      from: "2026-10-01",
      to: "2026-10-31",
      total: 1,
      truncated: false,
    });
    const pair = await listed({ dateFieldId: f.fields.closeDate.id, endDateFieldId: f.fields.endDate.id });
    expect(pair.ok && pair.data.result.calendarRange?.total).toBe(2);
    const range = await listed({ dateFieldId: f.fields.period.id });
    expect(range.ok && range.data.result.calendarRange?.total).toBe(1);
    const table = await f.run(() => f.presentation.invoke({ typeId: f.deal, params: {} }));
    expect(table.ok && table.data.result.calendarRange).toBeUndefined();
    expect(table.ok && table.data.result.items).toHaveLength(4);
    expect(
      await f.run(() =>
        f.presentation.invoke({
          typeId: f.deal,
          params: {
            viewMode: ViewMode.calendar,
            calendar: { dateFieldId: f.fields.note.id },
            calendarWindow: window,
          },
        }),
      ),
    ).toMatchObject({ ok: true, data: { result: { items: expect.any(Array) } } });
  });

  it("moves a record to another day through the normal update, keeping local times and refusing stale versions", async () => {
    const f = await fixture();
    const ref = await f.createDeal("Kickoff", [
      [f.fields.meetingAt, { kind: "dateTime", value: "2026-10-23T07:30:00.000Z" }],
      [f.fields.closeDate, date("2026-10-23")],
      [f.fields.endDate, date("2026-10-24")],
    ]);
    const current = await f.run(() => f.read.invoke(ref));
    if (!current.ok) throw new Error(JSON.stringify(current));
    const timed = calendarEditChanges(
      { id: ref.recordId, fields: current.data.fields },
      { start: { ...f.fields.meetingAt }, end: null, color: null },
      { edge: "move", days: 3, minutes: 0 },
      ZONE,
    );
    const pair = calendarEditChanges(
      { id: ref.recordId, fields: current.data.fields },
      { start: { ...f.fields.closeDate }, end: { ...f.fields.endDate }, color: null },
      { edge: "move", days: 7, minutes: 0 },
      ZONE,
    );
    const write = (fields: NonNullable<typeof timed>, expectedVersion: number) =>
      f.run(async () =>
        f.mutate.invoke({
          expectedRevision: await f.revision(),
          idempotencyKey: randomUUID(),
          mutation: { action: "update", ref, expectedVersion, fields },
        }),
      );
    expect(await write([...(timed ?? []), ...(pair ?? [])], current.data.version)).toMatchObject({ ok: true });
    const moved = await f.run(() => f.read.invoke(ref));
    if (!moved.ok) throw new Error(JSON.stringify(moved));
    const value = (fieldId: string) => moved.data.fields.find((field) => field.fieldId === fieldId)?.result;
    expect(value(f.fields.meetingAt.id)).toEqual({
      state: "value",
      value: { kind: "dateTime", value: "2026-10-26T09:30:00.000+01:00" },
    });
    expect(value(f.fields.closeDate.id)).toEqual({ state: "value", value: date("2026-10-30") });
    expect(value(f.fields.endDate.id)).toEqual({ state: "value", value: date("2026-10-31") });
    expect(await write(timed ?? [], current.data.version)).toMatchObject({ ok: false });
  });

  it("matches date ranges that overlap a window and dates inside it", async () => {
    const f = await fixture();
    await f.createDeal("Ends inside", [[f.fields.period, { kind: "range", start: "2026-09-28", end: "2026-10-02" }]]);
    await f.createDeal("Covers", [[f.fields.period, { kind: "range", start: "2026-09-01", end: "2026-11-30" }]]);
    await f.createDeal("Outside", [[f.fields.period, { kind: "range", start: "2026-11-02", end: "2026-11-03" }]]);
    await f.createDeal("Open end", [[f.fields.period, { kind: "range", start: "2026-10-31", end: null }]]);
    await f.createDeal("Date inside", [[f.fields.closeDate, date("2026-10-15")]]);
    const matching = async (fieldId: string, operator: "between" | "overlaps") => {
      const result = await f.run(() =>
        f.query.invoke({
          typeId: f.deal,
          filters: [{ fieldId, operator, value: null, values: [date("2026-10-01"), date("2026-10-31")] }],
          relationships: [],
          sort: [],
          page: 1,
          pageSize: 25,
        }),
      );
      if (!result.ok) throw new Error(JSON.stringify(result));
      return names(
        result.data.records.map((record) => ({
          title: record.fields.find((field) => field.fieldId === f.fields.name)?.result ?? { state: "missing" },
        })),
      ).sort();
    };
    expect(await matching(f.fields.period.id, "overlaps")).toEqual(["Covers", "Ends inside", "Open end"]);
    expect(await matching(f.fields.period.id, "between")).toEqual([]);
    expect(await matching(f.fields.closeDate.id, "overlaps")).toEqual(["Date inside"]);
  });
});
