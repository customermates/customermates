import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import { createMockDiModule, MOCK_ZOD_MODULE, MOCK_PRISMA_DB_MODULE } from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();
const mockEnv = vi.hoisted(() => ({
  NODE_ENV: "test",
  APP_MODE: "cloud" as string,
  BASE_URL: "http://localhost:4000",
  DATABASE_URL: "postgresql://test:test@localhost:5432/test",
  BETTER_AUTH_SECRET: "0".repeat(32),
}));

vi.mock("@/env", () => ({ env: mockEnv }));
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("@/core/observability/server", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));

import { PUBLIC_FILL_MS, renderToken, visitorHash } from "@/core/network/public-submit-guard";
import { DomainEvent } from "@/features/event/domain-events";
import { CustomErrorCode } from "@/core/validation/validation.types";
import type { RecordModelView } from "@/features/records/record-model.schema";

import type { BookingLinkLookup } from "../booking-link.repo";
import type { HostLoad } from "../booking-reservation.repo";

import { SubmitPublicBookingInteractor } from "../submit-public-booking.interactor";
import {
  type AccessOptions,
  ANA,
  BO,
  bookingRow,
  buildAccess,
  calendarId,
  calendarRow,
  candidate,
  currentUserId,
  lookupLink,
  OWNER,
} from "./public-booking-fixtures";

const PEOPLE = "10000000-0000-4000-8000-000000000001";
const ACTIONS = "10000000-0000-4000-8000-000000000002";
const TITLE = "20000000-0000-4000-8000-000000000001";
const DUE = "20000000-0000-4000-8000-000000000002";
const NOTE = "20000000-0000-4000-8000-000000000003";
const SOURCE = "20000000-0000-4000-8000-000000000004";
const SIZE = "20000000-0000-4000-8000-000000000005";
const DAY = "20000000-0000-4000-8000-000000000006";
const CONTACT = "20000000-0000-4000-8000-000000000007";
const PERSON_RELATION = "30000000-0000-4000-8000-000000000001";
const PERSON = { typeId: PEOPLE, recordId: "40000000-0000-4000-8000-000000000001" };
const RECORD = { typeId: ACTIONS, recordId: "40000000-0000-4000-8000-000000000002" };
const TOKEN = "tok_abcdefghijklmnop";
const STARTS_AT = "2026-11-17T09:00:00.000Z";
const SECRET = "booking-test-secret";
const NOW = new Date("2026-11-16T10:00:00.000Z");
const CONFIRMED = bookingRow({ startsAt: new Date(STARTS_AT), locale: "de" });

const MODEL = {
  revision: 1,
  types: [{ id: ACTIONS, label: "Actions", primaryFieldId: TITLE, archived: false, embedded: false }],
  fields: [
    {
      id: TITLE,
      typeId: ACTIONS,
      label: "Title",
      valueType: "text",
      behavior: { kind: "input" },
      archived: false,
      options: [],
    },
    {
      id: DUE,
      typeId: ACTIONS,
      label: "Due",
      valueType: "dateTime",
      behavior: { kind: "input" },
      archived: false,
      options: [],
    },
    {
      id: NOTE,
      typeId: ACTIONS,
      label: "Topic",
      valueType: "text",
      behavior: { kind: "input" },
      archived: false,
      options: [],
    },
    {
      id: SOURCE,
      typeId: ACTIONS,
      label: "Source",
      valueType: "select",
      behavior: { kind: "input" },
      archived: false,
      options: [
        { id: "web", label: "Website" },
        { id: "event", label: "Event" },
      ],
    },
    {
      id: SIZE,
      typeId: ACTIONS,
      label: "Team size",
      valueType: "number",
      behavior: { kind: "input" },
      archived: false,
      options: [],
    },
    {
      id: DAY,
      typeId: ACTIONS,
      label: "Preferred day",
      valueType: "date",
      behavior: { kind: "input" },
      archived: false,
      options: [],
    },
    {
      id: CONTACT,
      typeId: ACTIONS,
      label: "Contact details",
      valueType: "channels",
      behavior: { kind: "input" },
      archived: false,
      options: [],
    },
  ],
  relationships: [],
} as unknown as RecordModelView;

function link(overrides: Partial<BookingLinkLookup> = {}): BookingLinkLookup {
  return lookupLink({
    withVideo: true,
    personTypeId: PEOPLE,
    personRelationshipId: PERSON_RELATION,
    recordTypeId: ACTIONS,
    startFieldId: DUE,
    questions: [{ fieldId: NOTE, required: true }],
    successMessage: "See you soon",
    inviteeChanges: false,
    ...overrides,
  });
}

function roundRobin(overrides: Partial<BookingLinkLookup> = {}): BookingLinkLookup {
  return link({
    assignment: "roundRobin",
    hostCandidates: [candidate(OWNER), candidate(ANA), candidate(BO)],
    ...overrides,
  });
}

function build(
  options: {
    link?: BookingLinkLookup | null;
    entitled?: boolean;
    perVisitor?: number;
    perLink?: number;
    calendars?: AccessOptions["calendars"];
    locale?: AccessOptions["locale"];
  } = {},
) {
  const { access, lookup } = buildAccess({
    link: options.link === undefined ? link() : options.link,
    authSecret: SECRET,
    now: NOW,
    perLink: options.perLink,
    perVisitor: options.perVisitor,
    entitled: options.entitled === false ? () => false : undefined,
    calendars: options.calendars,
    locale: options.locale,
  });
  const availability = {
    openHosts: vi.fn((_link: unknown, hostIds: string[]) => Promise.resolve(hostIds)),
    isOpen: vi.fn().mockResolvedValue(true),
  };
  const hostsOfReservations: string[] = [];
  const reservations = {
    reserve: vi.fn<(input: unknown, isOpen: () => Promise<boolean>) => Promise<{ id: string } | null>>(() => {
      hostsOfReservations.push(currentUserId());
      return Promise.resolve({ id: "80000000-0000-4000-8000-000000000001" });
    }),
    confirm: vi.fn().mockResolvedValue(CONFIRMED),
    release: vi.fn().mockResolvedValue(undefined),
    countOpenForEmail: vi.fn().mockResolvedValue(0),
    countForVisitorSince: vi.fn().mockResolvedValue(0),
    countForLinkSince: vi.fn().mockResolvedValue(0),
    hostLoads: vi.fn<() => Promise<HostLoad[]>>().mockResolvedValue([]),
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
  const announcer = { notifyHost: vi.fn().mockResolvedValue(undefined) };
  const mailer = { send: vi.fn().mockResolvedValue(true) };
  const interactor = new SubmitPublicBookingInteractor(
    access,
    availability as never,
    reservations as never,
    writer as never,
    links as never,
    records as never,
    events as never,
    announcer,
    "http://localhost:4000",
    mailer,
  );
  return {
    mailer,
    interactor,
    lookup,
    availability,
    reservations,
    writer,
    links,
    records,
    events,
    announcer,
    hostsOfReservations,
  };
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
  renderToken: renderToken(link().id, new Date(NOW.getTime() - 8_000), SECRET, "visitor-hash"),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockEnv.APP_MODE = "cloud";
});

describe("SubmitPublicBookingInteractor", () => {
  it("books: creates the event, the Person and the record, links them, confirms and emits form.submitted", async () => {
    const { interactor, writer, records, links, reservations, events, announcer } = build();

    const result = await interactor.invoke(INPUT);

    expect(result).toEqual({
      status: "booked",
      startsAt: STARTS_AT,
      endsAt: "2026-11-17T09:30:00.000Z",
      conferenceUrl: "https://meet.google.com/abc",
      title: "Intro call",
      hostName: "Test User",
      manageUrl: null,
      successMessage: "See you soon",
    });
    expect(reservations.reserve).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingLinkId: link().id,
        manageToken: expect.stringMatching(/^[A-Za-z0-9_-]{24}$/),
        inviteeEmail: "ada@example.com",
        inviteeName: "Ada Lovelace",
        timeZone: "Europe/London",
        answers: { [NOTE]: "Pricing" },
        ipHash: visitorHash("visitor-hash", SECRET),
      }),
      expect.any(Function),
    );
    expect(visitorHash("visitor-hash", SECRET)).not.toBe("visitor-hash");
    expect(writer.create).toHaveBeenCalledWith(
      mockUser.companyId,
      expect.objectContaining({ unipileCalendarId: `cal_${OWNER.id}`, unipileAccountId: `acc_${OWNER.id}` }),
      expect.objectContaining({
        title: "Intro call - Ada Lovelace",
        attendeeEmails: ["ada@example.com"],
        videoLink: true,
        notifyAttendees: true,
        timeZone: "Europe/Berlin",
        description: "Ada Lovelace <ada@example.com>",
      }),
    );
    expect(records.findOrCreatePerson).toHaveBeenCalledWith({
      typeId: PEOPLE,
      email: "ada@example.com",
      name: "Ada Lovelace",
    });
    expect(records.createBookingRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        typeId: ACTIONS,
        startFieldId: DUE,
        answers: [{ fieldId: NOTE, value: { kind: "text", value: "Pricing" } }],
        identities: [],
        person: { ref: PERSON, relationshipId: PERSON_RELATION },
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
    expect(announcer.notifyHost).toHaveBeenCalledWith(
      {
        id: "80000000-0000-4000-8000-000000000001",
        companyId: mockUser.companyId,
        hostUserId: OWNER.id,
        linkOwnerId: OWNER.id,
        inviteeName: "Ada Lovelace",
        linkTitle: "Intro call",
        startsAt: new Date(STARTS_AT),
        linkTimeZone: "Europe/Berlin",
      },
      "booked",
      "en",
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

  it("answers a filled honeypot like any unavailable page before touching anything", async () => {
    const { interactor, lookup } = build();

    expect(await interactor.invoke({ ...INPUT, website: "http://spam.example" })).toEqual({ status: "unavailable" });
    expect(lookup.findByTokenUnscoped).not.toHaveBeenCalled();
  });

  describe("control characters", () => {
    it("strips them from the name and from text answers before the event, the reservation and the record", async () => {
      const { interactor, writer, reservations, records } = build();

      const result = await interactor.invoke({
        ...INPUT,
        name: "Ada\u0000 Love\nlace\u007F",
        answers: { [NOTE]: "Pricing\r\nATTENDEE:evil@example.com\u0007\t!" },
      });

      expect(result.status).toBe("booked");
      const event = writer.create.mock.calls[0][2] as { title: string; description: string };
      expect(event.title).toBe("Intro call - Ada Lovelace");
      expect(event.description).toBe("Ada Lovelace <ada@example.com>");
      expect(reservations.reserve).toHaveBeenCalledWith(
        expect.objectContaining({
          inviteeName: "Ada Lovelace",
          answers: { [NOTE]: "PricingATTENDEE:evil@example.com!" },
        }),
        expect.any(Function),
      );
      expect(records.findOrCreatePerson).toHaveBeenCalledWith(expect.objectContaining({ name: "Ada Lovelace" }));
      expect(records.createBookingRecord).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Ada Lovelace - Intro call" }),
      );
    });

    it("refuses a name that is nothing but control characters and reserves nothing", async () => {
      const { interactor, lookup, reservations } = build();

      expect(await interactor.invoke({ ...INPUT, name: "\u0001 \u0002" })).toEqual({
        status: "invalid",
        fields: ["name"],
      });
      expect(lookup.findByTokenUnscoped).not.toHaveBeenCalled();
      expect(reservations.reserve).not.toHaveBeenCalled();
    });

    it("leaves the text of a normal name and answer untouched", async () => {
      const { interactor, writer } = build();

      await interactor.invoke({ ...INPUT, name: "Zoë O'Brien-Müller", answers: { [NOTE]: "Preis: 100 € / Monat" } });

      expect(writer.create.mock.calls[0][2]).toMatchObject({
        title: "Intro call - Zoë O'Brien-Müller",
        description: "Zoë O'Brien-Müller <ada@example.com>",
      });
    });
  });

  describe("what the provider sends to the attendee", () => {
    it("keeps the visitor's answers out of the invitation and on the booking", async () => {
      const { interactor, writer, reservations } = build();

      await interactor.invoke({ ...INPUT, answers: { [NOTE]: "Claim your prize at https://evil.example/win" } });

      const event = writer.create.mock.calls[0][2] as { title: string; description: string };
      expect(`${event.title} ${event.description}`).not.toContain("evil.example");
      expect(event.description).toBe("Ada Lovelace <ada@example.com>");
      expect(reservations.reserve).toHaveBeenCalledWith(
        expect.objectContaining({ answers: { [NOTE]: "Claim your prize at https://evil.example/win" } }),
        expect.any(Function),
      );
    });

    it("takes links out of the name that goes into the title, and keeps the name the visitor typed on the booking", async () => {
      const { interactor, writer, reservations } = build();
      const name = "Ada https://evil.example/win www.evil.example evil.example/x <b>";

      await interactor.invoke({ ...INPUT, name });

      const event = writer.create.mock.calls[0][2] as { title: string; description: string };
      expect(event.title).toBe("Intro call - Ada evil example x b");
      expect(event.description).toBe("Ada evil example x b <ada@example.com>");
      expect(reservations.reserve).toHaveBeenCalledWith(
        expect.objectContaining({ inviteeName: name }),
        expect.any(Function),
      );
    });

    it("sends the page title alone when the name is nothing but a link", async () => {
      const { interactor, writer } = build();

      await interactor.invoke({ ...INPUT, name: "https://evil.example/win" });

      expect(writer.create.mock.calls[0][2]).toMatchObject({ title: "Intro call", description: "ada@example.com" });
    });
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
    availability.openHosts.mockResolvedValue([]);

    expect(await interactor.invoke(INPUT)).toEqual({ status: "slotTaken" });
    expect(availability.openHosts).toHaveBeenCalledWith(
      expect.objectContaining({ id: link().id }),
      [OWNER.id],
      NOW,
      new Date(STARTS_AT),
    );
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

  it("coerces each answer by its field type and hands contact details to the record as an identity", async () => {
    const { interactor, records, reservations, writer } = build({
      link: link({
        questions: [
          { fieldId: NOTE, required: true },
          { fieldId: SOURCE, required: false },
          { fieldId: SIZE, required: false },
          { fieldId: DAY, required: false },
          { fieldId: CONTACT, required: false },
        ],
      }),
    });

    const result = await interactor.invoke({
      ...INPUT,
      answers: {
        [NOTE]: "Pricing",
        [SOURCE]: "event",
        [SIZE]: "12,5",
        [DAY]: "2026-11-20",
        [CONTACT]: " Grace@Example.com ",
      },
    });

    expect(result.status).toBe("booked");
    expect(records.createBookingRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        answers: [
          { fieldId: NOTE, value: { kind: "text", value: "Pricing" } },
          { fieldId: SOURCE, value: { kind: "select", value: "event" } },
          { fieldId: SIZE, value: { kind: "decimal", value: "12.5", currency: null } },
          { fieldId: DAY, value: { kind: "date", value: "2026-11-20" } },
        ],
        identities: [{ provider: "mail", value: "grace@example.com" }],
      }),
    );
    expect(reservations.reserve).toHaveBeenCalledWith(
      expect.objectContaining({
        answers: {
          [NOTE]: "Pricing",
          [SOURCE]: "Event",
          [SIZE]: "12.5",
          [DAY]: "2026-11-20",
          [CONTACT]: "grace@example.com",
        },
      }),
      expect.any(Function),
    );
    expect(writer.create).toHaveBeenCalledWith(
      mockUser.companyId,
      expect.anything(),
      expect.objectContaining({ description: "Ada Lovelace <ada@example.com>" }),
    );
  });

  it("names an answer that does not fit its field and reserves nothing", async () => {
    const { interactor, reservations } = build({
      link: link({
        questions: [
          { fieldId: SOURCE, required: false },
          { fieldId: SIZE, required: false },
          { fieldId: DAY, required: false },
          { fieldId: CONTACT, required: false },
        ],
      }),
    });

    expect(
      await interactor.invoke({
        ...INPUT,
        answers: { [SOURCE]: "nope", [SIZE]: "twelve", [DAY]: "2026-02-30", [CONTACT]: "not an email" },
      }),
    ).toEqual({ status: "invalid", fields: [SOURCE, SIZE, DAY, CONTACT] });
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
    expect(
      await build({
        calendars: { [calendarId(OWNER.id)]: calendarRow(OWNER.id, { accountStatus: "credentials" }) },
      }).interactor.invoke(INPUT),
    ).toEqual({ status: "unavailable" });
    expect(await build({ link: link({ calendarId: null, hostCandidates: [] }) }).interactor.invoke(INPUT)).toEqual({
      status: "unavailable",
    });
    expect(await build({ link: link({ companyDeleting: true }) }).interactor.invoke(INPUT)).toEqual({
      status: "unavailable",
    });
    expect(await build({ entitled: false }).interactor.invoke(INPUT)).toEqual({ status: "unavailable" });
  });

  it("limits one visitor and reports when to come back", async () => {
    const { interactor } = build({ perVisitor: 2 });

    await interactor.invoke(INPUT);
    await interactor.invoke(INPUT);

    expect(await interactor.invoke(INPUT)).toEqual({ status: "rateLimited", retryAfterSeconds: expect.any(Number) });
  });

  it("is unavailable outside the cloud and touches nothing", async () => {
    mockEnv.APP_MODE = "self-hosted";
    const { interactor, lookup } = build();

    expect(await interactor.invoke(INPUT)).toEqual({ status: "unavailable" });
    expect(lookup.findByTokenUnscoped).not.toHaveBeenCalled();
  });

  describe("abuse protection", () => {
    it.each([
      ["a missing render token", ""],
      ["a render token of another page", renderToken("50000000-0000-4000-8000-000000000002", new Date(0), SECRET)],
      ["a page filled faster than a person can", renderToken(link().id, new Date(NOW.getTime() - 500), SECRET)],
      [
        "a page that is far too old",
        renderToken(link().id, new Date(NOW.getTime() - PUBLIC_FILL_MS.max - 60_000), SECRET),
      ],
    ])("refuses %s before reading availability or reserving", async (_name, token) => {
      const { interactor, availability, reservations, writer } = build();

      expect(await interactor.invoke({ ...INPUT, renderToken: token })).toEqual({ status: "unavailable" });
      expect(availability.openHosts).not.toHaveBeenCalled();
      expect(availability.isOpen).not.toHaveBeenCalled();
      expect(reservations.reserve).not.toHaveBeenCalled();
      expect(writer.create).not.toHaveBeenCalled();
    });

    it("stops a visitor that already booked too often this hour and says when to come back", async () => {
      const { interactor, reservations, writer } = build();
      reservations.countForVisitorSince.mockResolvedValue(10);

      expect(await interactor.invoke(INPUT)).toEqual({ status: "rateLimited", retryAfterSeconds: 600 });
      expect(reservations.countForVisitorSince).toHaveBeenCalledWith(
        link().id,
        visitorHash("visitor-hash", SECRET),
        new Date(NOW.getTime() - 3_600_000),
      );
      expect(reservations.reserve).not.toHaveBeenCalled();
      expect(writer.create).not.toHaveBeenCalled();
    });

    it("refuses a page that was rendered for another address", async () => {
      const { interactor, availability, reservations } = build();
      const elsewhere = renderToken(link().id, new Date(NOW.getTime() - 8_000), SECRET, "another-visitor");

      expect(await interactor.invoke({ ...INPUT, renderToken: elsewhere })).toEqual({ status: "unavailable" });
      expect(availability.openHosts).not.toHaveBeenCalled();
      expect(availability.isOpen).not.toHaveBeenCalled();
      expect(reservations.reserve).not.toHaveBeenCalled();
    });

    it("charges the bucket all visitors of a page share only after the spam checks passed", async () => {
      const { interactor, reservations } = build({ perLink: 1 });
      const tooFast = renderToken(link().id, new Date(NOW.getTime() - 500), SECRET, "visitor-hash");

      for (let attempt = 0; attempt < 3; attempt += 1) {
        await interactor.invoke({ ...INPUT, website: "https://spam.example" });
        await interactor.invoke({ ...INPUT, renderToken: tooFast });
        await interactor.invoke({ ...INPUT, renderToken: "1.deadbeef" });
      }
      expect(reservations.reserve).not.toHaveBeenCalled();

      expect((await interactor.invoke(INPUT)).status).toBe("booked");
      expect(await interactor.invoke(INPUT)).toEqual({
        status: "rateLimited",
        retryAfterSeconds: expect.any(Number),
      });
      expect(reservations.reserve).toHaveBeenCalledTimes(1);
    });

    it("stops a page that already took its bookings of the last 24 hours, counted in the database", async () => {
      const { interactor, reservations, writer } = build();
      reservations.countForLinkSince.mockResolvedValue(50);

      expect(await interactor.invoke(INPUT)).toEqual({ status: "rateLimited", retryAfterSeconds: 3600 });
      expect(reservations.countForLinkSince).toHaveBeenCalledWith(link().id, new Date(NOW.getTime() - 86_400_000));
      expect(reservations.reserve).not.toHaveBeenCalled();
      expect(writer.create).not.toHaveBeenCalled();

      reservations.countForLinkSince.mockResolvedValue(49);
      expect((await interactor.invoke(INPUT)).status).toBe("booked");
    });

    it("does not count a visitor whose address is unknown", async () => {
      const { interactor, reservations } = build();

      const unbound = renderToken(link().id, new Date(NOW.getTime() - 8_000), SECRET);

      expect((await interactor.invoke({ ...INPUT, visitor: null, renderToken: unbound })).status).toBe("booked");
      expect(reservations.countForVisitorSince).not.toHaveBeenCalled();
      expect(reservations.reserve).toHaveBeenCalledWith(
        expect.objectContaining({ ipHash: null }),
        expect.any(Function),
      );
    });
  });

  describe("reservation race", () => {
    it("re-checks that the start is still open inside the reservation and answers slotTaken when it is not", async () => {
      const { interactor, availability, reservations, writer } = build();
      reservations.reserve.mockImplementation((_input, isOpen) =>
        isOpen().then((open) => (open ? { id: "80000000-0000-4000-8000-000000000001" } : null)),
      );
      availability.isOpen.mockResolvedValueOnce(false);

      expect(await interactor.invoke(INPUT)).toEqual({ status: "slotTaken" });
      expect(availability.openHosts).toHaveBeenCalledTimes(1);
      expect(availability.isOpen).toHaveBeenCalledTimes(1);
      expect(availability.isOpen).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: link().id }),
        NOW,
        new Date(STARTS_AT),
      );
      expect(writer.create).not.toHaveBeenCalled();
    });

    it("books when the start is still open inside the reservation", async () => {
      const { interactor, reservations } = build();
      reservations.reserve.mockImplementation((_input, isOpen) =>
        isOpen().then((open) => (open ? { id: "80000000-0000-4000-8000-000000000001" } : null)),
      );

      expect((await interactor.invoke(INPUT)).status).toBe("booked");
    });
  });

  describe("the private link to change the booking", () => {
    it("puts the manage link into the result and the invitation when visitors may change their booking", async () => {
      const { interactor, writer, reservations } = build({ link: link({ inviteeChanges: true }) });

      const result = await interactor.invoke(INPUT, { manageLine: "Cancel or move:\u0007" });

      if (result.status !== "booked") throw new Error("expected a booking");
      const { manageToken } = reservations.reserve.mock.calls[0][0] as { manageToken: string };
      expect(result.manageUrl).toBe(`http://localhost:4000/book/manage/${manageToken}`);
      expect(writer.create.mock.calls[0][2]).toMatchObject({
        description: `Ada Lovelace <ada@example.com>\n\nCancel or move: http://localhost:4000/book/manage/${manageToken}`,
      });
    });

    it("draws a new manage token for every booking", async () => {
      const { interactor, reservations } = build();

      await interactor.invoke(INPUT);
      await interactor.invoke(INPUT);

      const tokens = reservations.reserve.mock.calls.map(([input]) => (input as { manageToken: string }).manageToken);
      expect(new Set(tokens).size).toBe(2);
    });

    it("leaves the link out when visitors may not change their booking", async () => {
      const { interactor, writer } = build({ link: link({ inviteeChanges: false }) });

      const result = await interactor.invoke(INPUT, { manageLine: "Cancel or move:" });

      expect(result).toMatchObject({ status: "booked", manageUrl: null });
      expect(writer.create.mock.calls[0][2]).toMatchObject({ description: "Ada Lovelace <ada@example.com>" });
    });
  });

  describe("round robin", () => {
    it("books the free host with the fewest upcoming bookings in that host's own calendar and tenant", async () => {
      const { interactor, availability, reservations, writer, announcer, hostsOfReservations } = build({
        link: roundRobin(),
      });
      availability.openHosts.mockResolvedValue([OWNER.id, BO.id]);
      reservations.hostLoads.mockResolvedValue([
        { hostUserId: OWNER.id, upcoming: 3, lastBookedAt: new Date("2026-11-15T10:00:00.000Z") },
        { hostUserId: ANA.id, upcoming: 0, lastBookedAt: null },
        { hostUserId: BO.id, upcoming: 1, lastBookedAt: new Date("2026-11-15T09:00:00.000Z") },
      ]);

      const result = await interactor.invoke(INPUT);

      expect(result).toMatchObject({ status: "booked", hostName: "Bo Host" });
      expect(availability.openHosts).toHaveBeenCalledWith(
        expect.objectContaining({ id: link().id }),
        [OWNER.id, ANA.id, BO.id],
        NOW,
        new Date(STARTS_AT),
      );
      expect(reservations.hostLoads).toHaveBeenCalledWith(link().id, NOW);
      expect(hostsOfReservations).toEqual([BO.id]);
      expect(writer.create).toHaveBeenCalledWith(
        mockUser.companyId,
        expect.objectContaining({ id: calendarId(BO.id), unipileCalendarId: `cal_${BO.id}` }),
        expect.anything(),
      );
      expect(announcer.notifyHost).toHaveBeenCalledWith(
        expect.objectContaining({ hostUserId: BO.id, linkOwnerId: OWNER.id }),
        "booked",
        "en",
      );
    });

    it("falls through to the next host when the first one was taken in the meantime", async () => {
      const { interactor, reservations, writer, hostsOfReservations } = build({ link: roundRobin() });
      reservations.hostLoads.mockResolvedValue([
        { hostUserId: OWNER.id, upcoming: 2, lastBookedAt: null },
        { hostUserId: ANA.id, upcoming: 0, lastBookedAt: null },
        { hostUserId: BO.id, upcoming: 1, lastBookedAt: null },
      ]);
      reservations.reserve.mockImplementation(() => {
        const host = currentUserId();
        hostsOfReservations.push(host);
        return Promise.resolve(host === ANA.id ? null : { id: "80000000-0000-4000-8000-000000000001" });
      });

      const result = await interactor.invoke(INPUT);

      expect(result).toMatchObject({ status: "booked", hostName: "Bo Host" });
      expect(hostsOfReservations).toEqual([ANA.id, BO.id]);
      expect(writer.create).toHaveBeenCalledTimes(1);
      expect(writer.create).toHaveBeenCalledWith(
        mockUser.companyId,
        expect.objectContaining({ id: calendarId(BO.id) }),
        expect.anything(),
      );
    });

    it("tries the next host after a provider refusal and releases the first reservation", async () => {
      const { interactor, reservations, writer } = build({ link: roundRobin() });
      writer.create
        .mockResolvedValueOnce({ ok: false, error: CustomErrorCode.unipileProviderRejected })
        .mockResolvedValueOnce({
          ok: true,
          eventId: "90000000-0000-4000-8000-000000000001",
          event: { conferenceUrl: null },
        });

      const result = await interactor.invoke(INPUT);

      expect(result).toMatchObject({ status: "booked", hostName: "Ana Host" });
      expect(reservations.release).toHaveBeenCalledTimes(1);
      expect(reservations.confirm).toHaveBeenCalledTimes(1);
    });

    it("answers unavailable when every host's provider refused, and slotTaken when every host was taken", async () => {
      const refused = build({ link: roundRobin() });
      refused.writer.create.mockResolvedValue({ ok: false, error: CustomErrorCode.unipileProviderRejected });
      expect(await refused.interactor.invoke(INPUT)).toEqual({ status: "unavailable" });
      expect(refused.reservations.release).toHaveBeenCalledTimes(3);

      const taken = build({ link: roundRobin() });
      taken.reservations.reserve.mockResolvedValue(null);
      expect(await taken.interactor.invoke(INPUT)).toEqual({ status: "slotTaken" });
      expect(taken.reservations.reserve).toHaveBeenCalledTimes(3);
      expect(taken.writer.create).not.toHaveBeenCalled();
    });

    it("offers and books only hosts whose calendar can be used", async () => {
      const { interactor, availability, hostsOfReservations } = build({
        link: roundRobin(),
        calendars: {
          [calendarId(OWNER.id)]: calendarRow(OWNER.id, { accountStatus: "credentials" }),
          [calendarId(ANA.id)]: null,
          [calendarId(BO.id)]: calendarRow(BO.id),
        },
      });

      expect(await interactor.invoke(INPUT)).toMatchObject({ status: "booked", hostName: "Bo Host" });
      expect(availability.openHosts).toHaveBeenCalledWith(expect.anything(), [BO.id], NOW, new Date(STARTS_AT));
      expect(hostsOfReservations).toEqual([BO.id]);
    });

    it("books the owner of a single page without asking for host loads to change the choice", async () => {
      const { interactor, availability, hostsOfReservations } = build();

      expect(await interactor.invoke(INPUT)).toMatchObject({ status: "booked", hostName: "Test User" });
      expect(availability.openHosts).toHaveBeenCalledWith(expect.anything(), [OWNER.id], NOW, new Date(STARTS_AT));
      expect(hostsOfReservations).toEqual([OWNER.id]);
    });

    it("tells the host in the member locale", async () => {
      const { interactor, announcer } = build({ locale: "de" });

      await interactor.invoke(INPUT);

      expect(announcer.notifyHost).toHaveBeenCalledWith(expect.anything(), "booked", "de");
    });
  });

  describe("the confirmation email to the visitor", () => {
    it("stores the language of the booking page and sends the confirmed booking to the mailer", async () => {
      const { interactor, reservations, mailer } = build();

      await interactor.invoke({ ...INPUT, locale: "de" });

      expect(reservations.reserve).toHaveBeenCalledWith(
        expect.objectContaining({ locale: "de" }),
        expect.any(Function),
      );
      expect(mailer.send.mock.calls).toEqual([[{ kind: "confirmed", booking: CONFIRMED }]]);
    });

    it("stores no language it does not offer", async () => {
      const { interactor, reservations } = build();

      await interactor.invoke({ ...INPUT, locale: "xx" });

      expect(reservations.reserve).toHaveBeenCalledWith(
        expect.objectContaining({ locale: null }),
        expect.any(Function),
      );
    });

    it("sends nothing when the booking did not go through", async () => {
      const { interactor, reservations, mailer } = build();
      reservations.reserve.mockResolvedValue(null);

      expect((await interactor.invoke(INPUT)).status).not.toBe("booked");
      expect(mailer.send).not.toHaveBeenCalled();
    });
  });
});
