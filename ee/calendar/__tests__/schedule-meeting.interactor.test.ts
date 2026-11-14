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

import { runWithTenant } from "@/core/decorators/tenant-context";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { serializeInteractorFailure } from "@/core/validation/validation.utils";
import { MessagingProvider } from "@/generated/prisma";

import type { WritableCalendarRow } from "../calendar-write-access.repo";

import { CancelMeetingInteractor } from "../cancel-meeting.interactor";
import { ScheduleMeetingInteractor } from "../schedule-meeting.interactor";
import { UpdateMeetingInteractor } from "../update-meeting.interactor";

const CALENDAR: WritableCalendarRow = {
  id: "10000000-0000-4000-8000-000000000001",
  name: "Work",
  unipileCalendarId: "cal_1",
  timezone: null,
  provider: MessagingProvider.google,
  connectedAccountId: "20000000-0000-4000-8000-000000000001",
  unipileAccountId: "acc_1",
  accountStatus: "ok",
  accountLabel: null,
};
const DEAL = { typeId: "30000000-0000-4000-8000-000000000001", recordId: "30000000-0000-4000-8000-000000000002" };
const ACTION = { typeId: "30000000-0000-4000-8000-000000000003", recordId: "30000000-0000-4000-8000-000000000004" };
const EVENT_ID = "40000000-0000-4000-8000-000000000001";

const INPUT = {
  title: "Intro call",
  startsAt: "2026-11-17T09:00:00.000Z",
  durationMinutes: 30,
  timeZone: "Europe/Berlin",
  attendees: [{ email: "Ada@Example.com", name: "Ada" }, { email: "ada@example.com" }],
  records: [DEAL],
};

const EVENT = {
  unipileEventId: "evt_1",
  title: "Intro call",
  description: null,
  location: null,
  conferenceUrl: null,
  startsAt: new Date("2026-11-17T09:00:00.000Z"),
  endsAt: new Date("2026-11-17T09:30:00.000Z"),
  allDay: false,
  timezone: "Europe/Berlin",
  recurrenceRule: null,
  status: "confirmed",
  visibility: null,
  attendees: [{ email: "ada@example.com", displayName: null, responseStatus: null, isOrganizer: false }],
  organizer: null,
};

function build(overrides: { access?: object; writer?: object; records?: object; entitlements?: object } = {}) {
  const access = {
    listOwnCalendars: vi.fn().mockResolvedValue({ calendars: [CALENDAR], accountsNeedingReconnect: 0 }),
    findOwnCalendar: vi.fn().mockResolvedValue(CALENDAR),
    findOwnEvent: vi.fn().mockResolvedValue(null),
    ...overrides.access,
  };
  const writer = {
    create: vi.fn().mockResolvedValue({ ok: true, eventId: EVENT_ID, event: EVENT }),
    update: vi.fn().mockResolvedValue({ ok: true, eventId: EVENT_ID, event: EVENT }),
    cancel: vi.fn().mockResolvedValue({ ok: true }),
    ...overrides.writer,
  };
  const links = {
    linkRecords: vi.fn().mockResolvedValue(undefined),
    listLinks: vi.fn().mockResolvedValue(new Map([[EVENT_ID, [DEAL]]])),
  };
  const records = {
    canRead: vi.fn().mockResolvedValue(true),
    createAction: vi.fn().mockResolvedValue(ACTION),
    ...overrides.records,
  };
  const entitlements = { require: vi.fn().mockResolvedValue(null), ...overrides.entitlements };
  const bookings = { cancelForCalendarEvent: vi.fn().mockResolvedValue(undefined) };
  return {
    access,
    writer,
    links,
    records,
    entitlements,
    bookings,
    schedule: new ScheduleMeetingInteractor(
      access as never,
      writer as never,
      links as never,
      records as never,
      entitlements as never,
    ),
    update: new UpdateMeetingInteractor(access as never, writer as never, links as never, entitlements as never),
    cancel: new CancelMeetingInteractor(access as never, writer as never, bookings as never, entitlements as never),
  };
}

const run = <T>(work: () => Promise<T>) => runWithTenant(mockUser, work);

function code(result: { ok: boolean; error?: unknown }) {
  if (result.ok) return null;
  return serializeInteractorFailure(result.error as never).issues[0]?.customCode;
}

beforeEach(() => vi.clearAllMocks());

describe("ScheduleMeetingInteractor", () => {
  it("creates the event in the first writable calendar, de-duplicates attendees, links the records and the follow-up Action", async () => {
    const { schedule, writer, links, records } = build();

    const result = await run(() =>
      schedule.invoke({
        ...INPUT,
        followUp: { typeId: ACTION.typeId, dateFieldId: "50000000-0000-4000-8000-000000000001" },
      } as never),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(writer.create).toHaveBeenCalledWith(
      mockUser.companyId,
      CALENDAR,
      expect.objectContaining({
        title: "Intro call",
        attendeeEmails: ["ada@example.com"],
        videoLink: false,
        notifyAttendees: true,
        endsAt: new Date("2026-11-17T09:30:00.000Z"),
      }),
    );
    expect(records.createAction).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Intro call", links: [DEAL], timeZone: "Europe/Berlin" }),
    );
    expect(links.linkRecords).toHaveBeenCalledWith(EVENT_ID, [DEAL, ACTION]);
    expect(result.data).toMatchObject({
      id: EVENT_ID,
      calendarId: CALENDAR.id,
      records: [DEAL, ACTION],
      followUp: ACTION,
      warnings: [],
      startsAt: "2026-11-17T09:00:00.000Z",
      endsAt: "2026-11-17T09:30:00.000Z",
    });
  });

  it("keeps the meeting and reports a warning when the follow-up Action cannot be created", async () => {
    const { schedule, links } = build({ records: { createAction: vi.fn().mockResolvedValue(null) } });

    const result = await run(() =>
      schedule.invoke({
        ...INPUT,
        followUp: { typeId: ACTION.typeId, dateFieldId: "50000000-0000-4000-8000-000000000001" },
      } as never),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.warnings).toEqual(["actionNotCreated"]);
    expect(result.data.followUp).toBeNull();
    expect(links.linkRecords).toHaveBeenCalledWith(EVENT_ID, [DEAL]);
  });

  it("reports a warning when linking the records fails after the event exists", async () => {
    const { schedule, links } = build();
    links.linkRecords.mockRejectedValue(new Error("db"));

    const result = await run(() => schedule.invoke(INPUT as never));

    expect(result.ok && result.data.warnings).toEqual(["recordsNotLinked"]);
  });

  it("refuses without a connected calendar and tells whether a reconnect would help", async () => {
    const none = build({
      access: { listOwnCalendars: vi.fn().mockResolvedValue({ calendars: [], accountsNeedingReconnect: 0 }) },
    });
    const stale = build({
      access: { listOwnCalendars: vi.fn().mockResolvedValue({ calendars: [], accountsNeedingReconnect: 1 }) },
    });

    expect(code(await run(() => none.schedule.invoke(INPUT as never)))).toBe(CustomErrorCode.calendarWriteUnavailable);
    expect(code(await run(() => stale.schedule.invoke(INPUT as never)))).toBe(CustomErrorCode.calendarNeedsReconnect);
    expect(none.writer.create).not.toHaveBeenCalled();
  });

  it("answers not found for a calendar the caller does not own and asks to reconnect a stale account", async () => {
    const other = build({ access: { findOwnCalendar: vi.fn().mockResolvedValue(null) } });
    const stale = build({
      access: { findOwnCalendar: vi.fn().mockResolvedValue({ ...CALENDAR, accountStatus: "permissions" }) },
    });
    const withCalendar = { ...INPUT, calendarId: CALENDAR.id };

    expect(code(await run(() => other.schedule.invoke(withCalendar as never)))).toBe(CustomErrorCode.calendarNotFound);
    expect(code(await run(() => stale.schedule.invoke(withCalendar as never)))).toBe(
      CustomErrorCode.calendarNeedsReconnect,
    );
  });

  it("refuses records the caller cannot read before calling the provider", async () => {
    const { schedule, writer } = build({ records: { canRead: vi.fn().mockResolvedValue(false) } });

    expect(code(await run(() => schedule.invoke(INPUT as never)))).toBe(CustomErrorCode.recordNotFound);
    expect(writer.create).not.toHaveBeenCalled();
  });

  it("passes a provider failure on as the error code and links nothing", async () => {
    const { schedule, links } = build({
      writer: { create: vi.fn().mockResolvedValue({ ok: false, error: CustomErrorCode.unipileSendOutcomeUnknown }) },
    });

    expect(code(await run(() => schedule.invoke(INPUT as never)))).toBe(CustomErrorCode.unipileSendOutcomeUnknown);
    expect(links.linkRecords).not.toHaveBeenCalled();
  });

  it("is denied without the inbox plan", async () => {
    const denial = { ok: false, error: { issues: [] }, code: "paidSubscriptionRequired" };
    const { schedule, writer } = build({ entitlements: { require: vi.fn().mockResolvedValue(denial) } });

    expect(await run(() => schedule.invoke(INPUT as never))).toBe(denial);
    expect(writer.create).not.toHaveBeenCalled();
  });

  it("rejects a meeting shorter than the minimum and an invalid time zone", async () => {
    const { schedule } = build();

    expect((await run(() => schedule.invoke({ ...INPUT, durationMinutes: 1 } as never))).ok).toBe(false);
    expect((await run(() => schedule.invoke({ ...INPUT, timeZone: "Mars/Base" } as never))).ok).toBe(false);
  });
});

describe("UpdateMeetingInteractor", () => {
  const ROW = {
    id: EVENT_ID,
    unipileEventId: "evt_1",
    calendarId: CALENDAR.id,
    unipileCalendarId: "cal_1",
    unipileAccountId: "acc_1",
    provider: MessagingProvider.google,
    accountStatus: "ok",
    connectedAccountId: CALENDAR.connectedAccountId,
  };

  it("moves a meeting: end follows the new start and the stored links come back", async () => {
    const { update, writer } = build({ access: { findOwnEvent: vi.fn().mockResolvedValue(ROW) } });

    const result = await run(() =>
      update.invoke({
        id: EVENT_ID,
        startsAt: "2026-11-18T10:00:00.000Z",
        durationMinutes: 45,
        timeZone: "Europe/Berlin",
      } as never),
    );

    expect(result.ok && result.data.records).toEqual([DEAL]);
    expect(writer.update).toHaveBeenCalledWith(
      mockUser.companyId,
      ROW,
      expect.objectContaining({
        startsAt: new Date("2026-11-18T10:00:00.000Z"),
        endsAt: new Date("2026-11-18T10:45:00.000Z"),
        notifyAttendees: true,
      }),
    );
  });

  it("requires the start and the length together and an event the caller owns", async () => {
    const owned = build({ access: { findOwnEvent: vi.fn().mockResolvedValue(ROW) } });
    const foreign = build();

    expect(
      (await run(() => owned.update.invoke({ id: EVENT_ID, startsAt: "2026-11-18T10:00:00.000Z" } as never))).ok,
    ).toBe(false);
    expect(code(await run(() => foreign.update.invoke({ id: EVENT_ID, title: "x" } as never)))).toBe(
      CustomErrorCode.calendarEventNotFound,
    );
  });
});

describe("CancelMeetingInteractor", () => {
  const ROW = {
    id: EVENT_ID,
    unipileEventId: "evt_1",
    calendarId: CALENDAR.id,
    unipileCalendarId: "cal_1",
    unipileAccountId: "acc_1",
    provider: MessagingProvider.google,
    accountStatus: "ok",
    connectedAccountId: CALENDAR.connectedAccountId,
  };

  it("cancels at the provider and marks the booking of that event cancelled", async () => {
    const { cancel, writer, bookings } = build({ access: { findOwnEvent: vi.fn().mockResolvedValue(ROW) } });

    const result = await run(() => cancel.invoke({ id: EVENT_ID, comment: "Sorry" }));

    expect(result).toEqual({ ok: true, data: { id: EVENT_ID, status: "cancelled" } });
    expect(writer.cancel).toHaveBeenCalledWith(ROW, "Sorry");
    expect(bookings.cancelForCalendarEvent).toHaveBeenCalledWith(EVENT_ID);
  });

  it("keeps the booking when the provider refuses and answers not found for a foreign event", async () => {
    const refused = build({
      access: { findOwnEvent: vi.fn().mockResolvedValue(ROW) },
      writer: { cancel: vi.fn().mockResolvedValue({ ok: false, error: CustomErrorCode.unipileProviderRejected }) },
    });
    const foreign = build();

    expect(code(await run(() => refused.cancel.invoke({ id: EVENT_ID })))).toBe(
      CustomErrorCode.unipileProviderRejected,
    );
    expect(refused.bookings.cancelForCalendarEvent).not.toHaveBeenCalled();
    expect(code(await run(() => foreign.cancel.invoke({ id: EVENT_ID })))).toBe(CustomErrorCode.calendarEventNotFound);
  });
});
