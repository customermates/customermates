import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  createMockDiModule,
  MOCK_ZOD_MODULE,
  MOCK_PRISMA_DB_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("@/core/observability/server", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
  getLocale: () => Promise.resolve("en"),
}));
vi.mock("@/core/decorators/transaction-runner", () => ({
  runInTransaction: (work: () => unknown) => work(),
}));
vi.mock("@/core/decorators/transaction.decorator", () => ({
  Transaction: () => () => undefined,
}));

import { runWithTenant } from "@/core/decorators/tenant-context";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { serializeInteractorFailure } from "@/core/validation/validation.utils";
import type { RecordModelView } from "@/features/records/record-model.schema";

import type { BookingLinkRow } from "../booking.schema";

import { DeleteBookingLinkInteractor } from "../delete-booking-link.interactor";
import { GetBookingLinkByIdInteractor } from "../get-booking-link-by-id.interactor";
import { GetBookingLinksInteractor } from "../get-booking-links.interactor";
import { SaveBookingLinkInteractor } from "../save-booking-link.interactor";
import { DEFAULT_WORKING_HOURS } from "../working-hours";

const CALENDAR_ID = "10000000-0000-4000-8000-000000000001";
const LINK_ID = "20000000-0000-4000-8000-000000000001";
const PEOPLE = "30000000-0000-4000-8000-000000000001";
const NAME = "30000000-0000-4000-8000-000000000002";
const CHANNELS = "30000000-0000-4000-8000-000000000003";
const BASE_URL = "https://app.example.com/";

const ROW: BookingLinkRow = {
  id: LINK_ID,
  companyId: mockUser.companyId,
  userId: mockUser.id,
  calendarId: CALENDAR_ID,
  calendarName: "Work",
  token: "tok_abcdefghijklmnop",
  title: "Intro call",
  description: null,
  durationMinutes: 30,
  bufferMinutes: 0,
  minNoticeMinutes: 240,
  horizonDays: 30,
  timeZone: "Europe/Berlin",
  workingHours: DEFAULT_WORKING_HOURS,
  withVideo: false,
  personTypeId: null,
  recordTypeId: null,
  startFieldId: null,
  questions: [],
  successMessage: null,
  enabled: true,
  createdAt: new Date("2026-11-12T10:00:00.000Z"),
  upcomingBookings: 2,
};

const MODEL = {
  revision: 1,
  types: [
    { id: PEOPLE, label: "People", primaryFieldId: NAME, archived: false, embedded: false },
  ],
  fields: [
    { id: NAME, typeId: PEOPLE, label: "Name", valueType: "text", behavior: { kind: "input" }, archived: false, options: [] },
    { id: CHANNELS, typeId: PEOPLE, label: "Contact", valueType: "channels", behavior: { kind: "input" }, archived: false, options: [] },
  ],
  relationships: [],
} as unknown as RecordModelView;

function build(options: { repo?: object; access?: object; records?: object } = {}) {
  const repo = {
    list: vi.fn().mockResolvedValue([ROW]),
    find: vi.fn().mockResolvedValue(ROW),
    countOwn: vi.fn().mockResolvedValue(0),
    create: vi.fn().mockImplementation((token: string, data: object) => Promise.resolve({ ...ROW, ...data, token })),
    update: vi.fn().mockImplementation((_id: string, data: object) => Promise.resolve({ ...ROW, ...data })),
    delete: vi.fn().mockResolvedValue(true),
    ...options.repo,
  };
  const access = {
    findOwnCalendar: vi.fn().mockResolvedValue({ id: CALENDAR_ID, accountStatus: "ok" }),
    ...options.access,
  };
  const records = { loadModel: vi.fn().mockResolvedValue(MODEL), ...options.records };
  const entitlements = { require: vi.fn().mockResolvedValue(null) };
  return {
    repo,
    access,
    records,
    save: new SaveBookingLinkInteractor(repo as never, access as never, records as never, entitlements as never, BASE_URL),
    list: new GetBookingLinksInteractor(repo as never, entitlements as never, BASE_URL),
    get: new GetBookingLinkByIdInteractor(repo as never, entitlements as never, BASE_URL),
    remove: new DeleteBookingLinkInteractor(repo as never, entitlements as never),
  };
}

const run = <T,>(work: () => Promise<T>) => runWithTenant(mockUser, work);

function code(result: { ok: boolean; error?: unknown }) {
  return result.ok ? null : serializeInteractorFailure(result.error as never).issues[0]?.customCode;
}

beforeEach(() => vi.clearAllMocks());

describe("booking link reads", () => {
  it("lists the caller's links with the public URL and the upcoming count", async () => {
    const result = await run(() => build().list.invoke());

    expect(result.ok && result.data.items[0]).toMatchObject({
      id: LINK_ID,
      url: "https://app.example.com/book/tok_abcdefghijklmnop",
      upcomingBookings: 2,
      calendarName: "Work",
      workingHours: DEFAULT_WORKING_HOURS,
    });
  });

  it("answers not found for an unknown link", async () => {
    const { get } = build({ repo: { find: vi.fn().mockResolvedValue(null) } });

    expect(code(await run(() => get.invoke({ id: LINK_ID })))).toBe(CustomErrorCode.bookingLinkNotFound);
  });
});

describe("SaveBookingLinkInteractor", () => {
  const CREATE = { calendarId: CALENDAR_ID, title: "Intro call", durationMinutes: 30, timeZone: "Europe/Berlin" };

  it("creates a link with defaults and an unguessable token", async () => {
    const { save, repo } = build();

    const result = await run(() => save.invoke(CREATE));

    expect(result.ok).toBe(true);
    const [token, data] = repo.create.mock.calls[0];
    expect(token).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(data).toMatchObject({
      calendarId: CALENDAR_ID,
      bufferMinutes: 0,
      minNoticeMinutes: 240,
      horizonDays: 30,
      withVideo: false,
      enabled: true,
      questions: [],
      description: null,
    });
    expect(data.workingHours).toEqual(DEFAULT_WORKING_HOURS);
  });

  it("requires a calendar, a title, a length and a time zone to create", async () => {
    const { save } = build();

    expect((await run(() => save.invoke({ title: "x" }))).ok).toBe(false);
    expect((await run(() => save.invoke({ ...CREATE, durationMinutes: 4 }))).ok).toBe(false);
    expect((await run(() => save.invoke({ ...CREATE, timeZone: "Mars/Base" }))).ok).toBe(false);
  });

  it("stops at the limit of links per user", async () => {
    const { save, repo } = build({ repo: { countOwn: vi.fn().mockResolvedValue(10) } });

    expect(code(await run(() => save.invoke(CREATE)))).toBe(CustomErrorCode.bookingLinkLimitReached);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("refuses a calendar the caller does not own and a stale connection", async () => {
    const foreign = build({ access: { findOwnCalendar: vi.fn().mockResolvedValue(null) } });
    const stale = build({ access: { findOwnCalendar: vi.fn().mockResolvedValue({ id: CALENDAR_ID, accountStatus: "credentials" }) } });

    expect(code(await run(() => foreign.save.invoke(CREATE)))).toBe(CustomErrorCode.calendarNotFound);
    expect(code(await run(() => stale.save.invoke(CREATE)))).toBe(CustomErrorCode.calendarNeedsReconnect);
  });

  it("refuses a visitor list without contact details and unknown question fields", async () => {
    const { save } = build({
      records: {
        loadModel: vi.fn().mockResolvedValue({
          ...MODEL,
          fields: MODEL.fields.filter((field) => field.id !== CHANNELS),
        }),
      },
    });

    expect(code(await run(() => save.invoke({ ...CREATE, personTypeId: PEOPLE })))).toBe(CustomErrorCode.bookingListInvalid);
  });

  it("accepts a visitor list with contact details", async () => {
    const { save, repo } = build();

    expect((await run(() => save.invoke({ ...CREATE, personTypeId: PEOPLE }))).ok).toBe(true);
    expect(repo.create.mock.calls[0][1].personTypeId).toBe(PEOPLE);
  });

  it("changes only the keys sent on update and does not re-check the calendar or lists", async () => {
    const { save, repo, access, records } = build();

    const result = await run(() => save.invoke({ id: LINK_ID, enabled: false }));

    expect(result.ok).toBe(true);
    expect(access.findOwnCalendar).not.toHaveBeenCalled();
    expect(records.loadModel).not.toHaveBeenCalled();
    expect(repo.update).toHaveBeenCalledWith(LINK_ID, expect.objectContaining({ enabled: false, title: "Intro call" }));
  });

  it("answers not found when updating a link the caller does not own", async () => {
    const { save } = build({ repo: { find: vi.fn().mockResolvedValue(null) } });

    expect(code(await run(() => save.invoke({ id: LINK_ID, enabled: false })))).toBe(CustomErrorCode.bookingLinkNotFound);
  });
});

describe("DeleteBookingLinkInteractor", () => {
  it("deletes an own link and answers not found otherwise", async () => {
    expect(await run(() => build().remove.invoke({ id: LINK_ID }))).toEqual({
      ok: true,
      data: { id: LINK_ID, deleted: true },
    });
    expect(code(await run(() => build({ repo: { delete: vi.fn().mockResolvedValue(false) } }).remove.invoke({ id: LINK_ID })))).toBe(
      CustomErrorCode.bookingLinkNotFound,
    );
  });
});
