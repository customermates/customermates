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

import { TokenBucketRateLimiter } from "@/core/network/token-bucket-rate-limiter";
import { DomainEvent } from "@/features/event/domain-events";
import { PublicLinkTenant } from "@/features/public-link/public-link-tenant";
import { CustomErrorCode } from "@/core/validation/validation.types";
import type { RecordModelView } from "@/features/records/record-model.schema";

import type { BookingLinkLookup } from "../booking-link.repo";

import { PublicBookingAccess } from "../public-booking-access";
import { SubmitPublicBookingInteractor } from "../submit-public-booking.interactor";
import { DEFAULT_WORKING_HOURS } from "../working-hours";

const PEOPLE = "10000000-0000-4000-8000-000000000001";
const ACTIONS = "10000000-0000-4000-8000-000000000002";
const TITLE = "20000000-0000-4000-8000-000000000001";
const DUE = "20000000-0000-4000-8000-000000000002";
const NOTE = "20000000-0000-4000-8000-000000000003";
const PERSON = { typeId: PEOPLE, recordId: "40000000-0000-4000-8000-000000000001" };
const RECORD = { typeId: ACTIONS, recordId: "40000000-0000-4000-8000-000000000002" };
const TOKEN = "tok_abcdefghijklmnop";
const STARTS_AT = "2026-11-17T09:00:00.000Z";

const MODEL = {
  revision: 1,
  types: [
    { id: ACTIONS, label: "Actions", primaryFieldId: TITLE, archived: false, embedded: false },
  ],
  fields: [
    { id: TITLE, typeId: ACTIONS, label: "Title", valueType: "text", behavior: { kind: "input" }, archived: false, options: [] },
    { id: DUE, typeId: ACTIONS, label: "Due", valueType: "dateTime", behavior: { kind: "input" }, archived: false, options: [] },
    { id: NOTE, typeId: ACTIONS, label: "Topic", valueType: "text", behavior: { kind: "input" }, archived: false, options: [] },
  ],
  relationships: [],
} as unknown as RecordModelView;

function link(overrides: Partial<BookingLinkLookup> = {}): BookingLinkLookup {
  return {
    id: "50000000-0000-4000-8000-000000000001",
    companyId: mockUser.companyId,
    userId: mockUser.id,
    calendarId: "60000000-0000-4000-8000-000000000001",
    calendarName: "Work",
    token: TOKEN,
    title: "Intro call",
    description: null,
    durationMinutes: 30,
    bufferMinutes: 0,
    minNoticeMinutes: 240,
    horizonDays: 30,
    timeZone: "Europe/Berlin",
    workingHours: DEFAULT_WORKING_HOURS,
    withVideo: true,
    personTypeId: PEOPLE,
    recordTypeId: ACTIONS,
    startFieldId: DUE,
    questions: [{ fieldId: NOTE, required: true }],
    successMessage: "See you soon",
    enabled: true,
    createdAt: new Date(0),
    upcomingBookings: 0,
    hostName: "Ben",
    workspaceName: "Acme",
    companyDeleting: false,
    unipileAccountId: "acc_1",
    unipileCalendarId: "cal_1",
    connectedAccountId: "70000000-0000-4000-8000-000000000001",
    provider: "google",
    accountUsable: true,
    ...overrides,
  };
}

function build(options: { link?: BookingLinkLookup | null; entitlement?: unknown; perVisitor?: number } = {}) {
  const lookup = {
    findByTokenUnscoped: vi.fn().mockResolvedValue(options.link === undefined ? link() : options.link),
  };
  const access = new PublicBookingAccess(
    lookup,
    new PublicLinkTenant({ getActiveUserByIdOrThrow: vi.fn().mockResolvedValue(mockUser) }),
    {
      perLink: new TokenBucketRateLimiter(100, 60_000),
      perVisitor: new TokenBucketRateLimiter(options.perVisitor ?? 100, 60_000),
    },
    () => ({ require: vi.fn().mockResolvedValue(options.entitlement ?? null) }),
    () => ({ companyId: mockUser.companyId, has: vi.fn().mockReturnValue(true) }),
  );
  const availability = { isOpen: vi.fn().mockResolvedValue(true) };
  const reservations = {
    reserve: vi.fn().mockResolvedValue({ id: "80000000-0000-4000-8000-000000000001" }),
    confirm: vi.fn().mockResolvedValue(undefined),
    release: vi.fn().mockResolvedValue(undefined),
    countOpenForEmail: vi.fn().mockResolvedValue(0),
  };
  const writer = {
    create: vi.fn().mockResolvedValue({
      ok: true,
      eventId: "90000000-0000-4000-8000-000000000001",
      event: { conferenceUrl: "https://meet.google.com/abc" },
    }),
  };
  const links = { linkRecords: vi.fn().mockResolvedValue(undefined) };
  const records = {
    loadModel: vi.fn().mockResolvedValue(MODEL),
    findOrCreatePerson: vi.fn().mockResolvedValue(PERSON),
    createBookingRecord: vi.fn().mockResolvedValue(RECORD),
  };
  const events = { publish: vi.fn().mockResolvedValue(undefined) };
  const interactor = new SubmitPublicBookingInteractor(
    access,
    availability as never,
    reservations as never,
    writer as never,
    links as never,
    records as never,
    events as never,
  );
  return { interactor, lookup, availability, reservations, writer, links, records, events };
}

const INPUT = {
  token: TOKEN,
  visitor: "visitor-hash",
  startsAt: STARTS_AT,
  name: "Ada Lovelace",
  email: "Ada@Example.com",
  timeZone: "Europe/London",
  answers: { [NOTE]: "Pricing" },
  website: "",
};

beforeEach(() => vi.clearAllMocks());

describe("SubmitPublicBookingInteractor", () => {
  it("books: creates the event, the Person and the record, links them, confirms and emits form.submitted", async () => {
    const { interactor, writer, records, links, reservations, events } = build();

    const result = await interactor.invoke(INPUT);

    expect(result).toEqual({
      status: "booked",
      startsAt: STARTS_AT,
      endsAt: "2026-11-17T09:30:00.000Z",
      conferenceUrl: "https://meet.google.com/abc",
      title: "Intro call",
      successMessage: "See you soon",
    });
    expect(reservations.reserve).toHaveBeenCalledWith(
      expect.objectContaining({
        inviteeEmail: "ada@example.com",
        inviteeName: "Ada Lovelace",
        timeZone: "Europe/London",
        answers: { [NOTE]: "Pricing" },
        ipHash: "visitor-hash",
      }),
    );
    expect(writer.create).toHaveBeenCalledWith(
      mockUser.companyId,
      expect.objectContaining({ unipileCalendarId: "cal_1", unipileAccountId: "acc_1" }),
      expect.objectContaining({
        title: "Intro call - Ada Lovelace",
        attendeeEmails: ["ada@example.com"],
        videoLink: true,
        notifyAttendees: true,
        timeZone: "Europe/Berlin",
        description: "Ada Lovelace <ada@example.com>\nTopic: Pricing",
      }),
    );
    expect(records.findOrCreatePerson).toHaveBeenCalledWith({ typeId: PEOPLE, email: "ada@example.com", name: "Ada Lovelace" });
    expect(records.createBookingRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        typeId: ACTIONS,
        startFieldId: DUE,
        answers: [{ fieldId: NOTE, value: "Pricing" }],
        links: [PERSON],
      }),
    );
    expect(links.linkRecords).toHaveBeenCalledWith("90000000-0000-4000-8000-000000000001", [PERSON, RECORD]);
    expect(reservations.confirm).toHaveBeenCalledWith("80000000-0000-4000-8000-000000000001", {
      calendarEventId: "90000000-0000-4000-8000-000000000001",
      personTypeId: PEOPLE,
      personRecordId: PERSON.recordId,
      recordTypeId: ACTIONS,
      recordId: RECORD.recordId,
    });
    expect(events.publish).toHaveBeenCalledWith(
      DomainEvent.FORM_SUBMITTED,
      {
        entityId: "80000000-0000-4000-8000-000000000001",
        payload: expect.objectContaining({
          source: "booking",
          formId: link().id,
          formName: "Intro call",
          typeId: ACTIONS,
          outcome: "created",
          recordId: RECORD.recordId,
          personRecordId: PERSON.recordId,
          answers: expect.objectContaining({ email: "ada@example.com", name: "Ada Lovelace", [NOTE]: "Pricing" }),
        }),
      },
      { systemCompanyId: mockUser.companyId },
    );
  });

  it("still books when the Person or the record cannot be written", async () => {
    const { interactor, records, reservations, events } = build();
    records.findOrCreatePerson.mockRejectedValue(new Error("boom"));
    records.createBookingRecord.mockResolvedValue(null);

    const result = await interactor.invoke(INPUT);

    expect(result.status).toBe("booked");
    expect(reservations.confirm).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ personRecordId: null, recordId: null }),
    );
    expect(events.publish).toHaveBeenCalled();
  });

  it("emits no event for a link without a list", async () => {
    const { interactor, events } = build({ link: link({ personTypeId: null, recordTypeId: null, questions: [] }) });

    expect((await interactor.invoke({ ...INPUT, answers: {} })).status).toBe("booked");
    expect(events.publish).not.toHaveBeenCalled();
  });

  it("refuses a filled honeypot before touching anything", async () => {
    const { interactor, lookup } = build();

    expect(await interactor.invoke({ ...INPUT, website: "http://spam.example" })).toEqual({
      status: "invalid",
      fields: ["website"],
    });
    expect(lookup.findByTokenUnscoped).not.toHaveBeenCalled();
  });

  it("names the invalid input fields", async () => {
    const { interactor } = build();

    expect(await interactor.invoke({ ...INPUT, email: "not-an-email", name: "" })).toEqual({
      status: "invalid",
      fields: expect.arrayContaining(["email", "name"]),
    });
  });

  it("answers slotTaken when the time is no longer free and reserves nothing", async () => {
    const { interactor, availability, reservations, writer } = build();
    availability.isOpen.mockResolvedValue(false);

    expect(await interactor.invoke(INPUT)).toEqual({ status: "slotTaken" });
    expect(reservations.reserve).not.toHaveBeenCalled();
    expect(writer.create).not.toHaveBeenCalled();
  });

  it("answers slotTaken when another visitor reserved the same start first", async () => {
    const { interactor, reservations, writer } = build();
    reservations.reserve.mockResolvedValue(null);

    expect(await interactor.invoke(INPUT)).toEqual({ status: "slotTaken" });
    expect(writer.create).not.toHaveBeenCalled();
  });

  it("names a missing required answer and reserves nothing", async () => {
    const { interactor, reservations } = build();

    expect(await interactor.invoke({ ...INPUT, answers: {} })).toEqual({ status: "invalid", fields: [NOTE] });
    expect(reservations.reserve).not.toHaveBeenCalled();
  });

  it("stops a visitor with too many upcoming bookings on one page", async () => {
    const { interactor, reservations } = build();
    reservations.countOpenForEmail.mockResolvedValue(3);

    expect(await interactor.invoke(INPUT)).toEqual({ status: "rateLimited", retryAfterSeconds: 3600 });
    expect(reservations.reserve).not.toHaveBeenCalled();
  });

  it("releases the reservation when the provider refuses the event", async () => {
    const { interactor, writer, reservations, records } = build();
    writer.create.mockResolvedValue({ ok: false, error: CustomErrorCode.unipileProviderRejected });

    expect(await interactor.invoke(INPUT)).toEqual({ status: "unavailable" });
    expect(reservations.release).toHaveBeenCalledWith("80000000-0000-4000-8000-000000000001");
    expect(reservations.confirm).not.toHaveBeenCalled();
    expect(records.findOrCreatePerson).not.toHaveBeenCalled();
  });

  it("is unavailable for a missing, paused or disconnected link and without the inbox plan", async () => {
    expect(await build({ link: null }).interactor.invoke(INPUT)).toEqual({ status: "unavailable" });
    expect(await build({ link: link({ enabled: false }) }).interactor.invoke(INPUT)).toEqual({ status: "unavailable" });
    expect(await build({ link: link({ accountUsable: false }) }).interactor.invoke(INPUT)).toEqual({
      status: "unavailable",
    });
    expect(await build({ link: link({ companyDeleting: true }) }).interactor.invoke(INPUT)).toEqual({
      status: "unavailable",
    });
    expect(await build({ entitlement: { ok: false } }).interactor.invoke(INPUT)).toEqual({ status: "unavailable" });
  });

  it("limits one visitor and reports when to come back", async () => {
    const { interactor } = build({ perVisitor: 2 });

    await interactor.invoke(INPUT);
    await interactor.invoke(INPUT);

    expect(await interactor.invoke(INPUT)).toEqual({ status: "rateLimited", retryAfterSeconds: expect.any(Number) });
  });
});
