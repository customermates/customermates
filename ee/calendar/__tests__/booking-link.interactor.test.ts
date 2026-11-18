import { beforeEach, describe, expect, it, vi } from "vitest";

import { Action, Resource } from "@/generated/prisma";
import { createMockUser, createMockUserWithPermissions } from "@/tests/helpers/mock-user";
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
import { GetWorkspaceBookingLinksInteractor } from "../get-workspace-booking-links.interactor";
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
  personRelationshipId: null,
  recordTypeId: null,
  startFieldId: null,
  questions: [],
  successMessage: null,
  enabled: true,
  assignment: "single",
  inviteeChanges: true,
  hosts: [],
  createdAt: new Date("2026-11-12T10:00:00.000Z"),
  upcomingBookings: 2,
};

const ANA_ID = "40000000-0000-4000-8000-000000000001";
const BO_ID = "40000000-0000-4000-8000-000000000002";
const MEMBERS = [
  { userId: ANA_ID, name: "Ana Host", calendarId: "10000000-0000-4000-8000-0000000000a1", calendarName: "Ana work" },
  { userId: mockUser.id, name: "Test User", calendarId: CALENDAR_ID, calendarName: "Work" },
];

const OTHER_ROW: BookingLinkRow & { ownerName: string } = {
  ...ROW,
  id: "20000000-0000-4000-8000-000000000002",
  userId: "other-user-id",
  token: "tok_other_abcdefghij",
  title: "Support call",
  ownerName: "Ada Lovelace",
};

const MODEL = {
  revision: 1,
  types: [{ id: PEOPLE, label: "People", primaryFieldId: NAME, archived: false, embedded: false }],
  fields: [
    {
      id: NAME,
      typeId: PEOPLE,
      label: "Name",
      valueType: "text",
      behavior: { kind: "input" },
      archived: false,
      options: [],
    },
    {
      id: CHANNELS,
      typeId: PEOPLE,
      label: "Contact",
      valueType: "channels",
      behavior: { kind: "input" },
      archived: false,
      options: [],
    },
  ],
  relationships: [],
} as unknown as RecordModelView;

function build(options: { repo?: object; access?: object; records?: object; busyTimeIncomplete?: boolean } = {}) {
  const availability = { busyTimeIncomplete: vi.fn().mockResolvedValue(options.busyTimeIncomplete ?? false) };
  const repo = {
    list: vi.fn().mockResolvedValue([ROW]),
    listWorkspace: vi.fn().mockResolvedValue([{ ...ROW, ownerName: "Test User" }, OTHER_ROW]),
    find: vi.fn().mockResolvedValue(ROW),
    countOwn: vi.fn().mockResolvedValue(0),
    create: vi.fn().mockImplementation((token: string, data: object) => Promise.resolve({ ...ROW, ...data, token })),
    update: vi.fn().mockImplementation((_id: string, data: object) => Promise.resolve({ ...ROW, ...data })),
    delete: vi.fn().mockResolvedValue(true),
    ...options.repo,
  };
  const access = {
    findOwnCalendar: vi.fn().mockResolvedValue({ id: CALENDAR_ID, accountStatus: "ok" }),
    listMemberCalendars: vi.fn().mockResolvedValue(MEMBERS),
    ...options.access,
  };
  const records = { loadModel: vi.fn().mockResolvedValue(MODEL), ...options.records };
  const entitlements = { require: vi.fn().mockResolvedValue(null) };
  return {
    repo,
    access,
    records,
    save: new SaveBookingLinkInteractor(
      repo as never,
      access as never,
      records as never,
      entitlements as never,
      BASE_URL,
    ),
    list: new GetBookingLinksInteractor(repo as never, entitlements as never, BASE_URL),
    availability,
    workspace: new GetWorkspaceBookingLinksInteractor(
      repo as never,
      entitlements as never,
      BASE_URL,
      availability as never,
      access as never,
    ),
    get: new GetBookingLinkByIdInteractor(repo as never, entitlements as never, BASE_URL),
    remove: new DeleteBookingLinkInteractor(repo as never, entitlements as never),
  };
}

const run = <T>(work: () => Promise<T>) => runWithTenant(mockUser, work);

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

  it("lists the whole workspace with its owners for an admin and marks the caller's own links", async () => {
    const { workspace, repo } = build();

    const result = await run(() => workspace.invoke());

    expect(repo.listWorkspace).toHaveBeenCalledOnce();
    expect(repo.list).not.toHaveBeenCalled();
    expect(result.ok && result.data.items.map(({ id, own, ownerName }) => ({ id, own, ownerName }))).toEqual([
      { id: LINK_ID, own: true, ownerName: "Test User" },
      { id: OTHER_ROW.id, own: false, ownerName: "Ada Lovelace" },
    ]);
    expect(result.ok && result.data.hostCandidates).toEqual([{ userId: ANA_ID, name: "Ana Host" }]);
  });

  it("tells the owner when the calendar behind the own live pages could not be read in full", async () => {
    const cut = build({ busyTimeIncomplete: true });
    const paused = build({
      busyTimeIncomplete: true,
      repo: { listWorkspace: vi.fn().mockResolvedValue([{ ...ROW, enabled: false, ownerName: "Test User" }]) },
    });

    const result = await run(() => cut.workspace.invoke());
    const none = await run(() => paused.workspace.invoke());

    expect(result.ok && result.data.busyTimeIncomplete).toBe(true);
    expect(cut.availability.busyTimeIncomplete).toHaveBeenCalledWith(
      [expect.objectContaining({ id: LINK_ID })],
      expect.any(Date),
    );
    expect(none.ok && none.data.busyTimeIncomplete).toBe(false);
    expect(paused.availability.busyTimeIncomplete).not.toHaveBeenCalled();
  });

  it("lists only the caller's links for a member who is not an admin", async () => {
    const member = createMockUserWithPermissions([{ resource: Resource.inboxMessages, action: Action.readOwn }]);
    const { workspace, repo } = build();

    const result = await runWithTenant(member, () => workspace.invoke());

    expect(repo.list).toHaveBeenCalledOnce();
    expect(repo.listWorkspace).not.toHaveBeenCalled();
    expect(result.ok && result.data.items.map(({ id, own }) => ({ id, own }))).toEqual([{ id: LINK_ID, own: true }]);
    expect(result.ok && result.data.hostCandidates).toEqual([]);
  });

  it("answers the plan refusal before reading", async () => {
    const refusal = { ok: false as const, error: new Error("plan") };
    const { repo } = build();
    const denied = new GetWorkspaceBookingLinksInteractor(
      repo as never,
      { require: vi.fn().mockResolvedValue(refusal) } as never,
      BASE_URL,
      { busyTimeIncomplete: vi.fn() } as never,
      { listMemberCalendars: vi.fn() },
    );

    const result = await run(() => denied.invoke());

    expect(result.ok).toBe(false);
    expect(repo.listWorkspace).not.toHaveBeenCalled();
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
    const [token, data, hosts] = repo.create.mock.calls[0];
    expect(token).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(hosts).toEqual([]);
    expect(data).toMatchObject({
      assignment: "single",
      inviteeChanges: true,
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
    const stale = build({
      access: { findOwnCalendar: vi.fn().mockResolvedValue({ id: CALENDAR_ID, accountStatus: "credentials" }) },
    });

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

    expect(code(await run(() => save.invoke({ ...CREATE, personTypeId: PEOPLE })))).toBe(
      CustomErrorCode.bookingListInvalid,
    );
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
    expect(repo.update).toHaveBeenCalledWith(
      LINK_ID,
      expect.objectContaining({ enabled: false, title: "Intro call", assignment: "single", inviteeChanges: true }),
      undefined,
    );
  });

  it("reads a link whose calendar is gone and still lets its owner pause it without choosing a calendar", async () => {
    const orphan = { ...ROW, calendarId: null, calendarName: null };
    const { save, list, repo, access } = build({
      repo: { find: vi.fn().mockResolvedValue(orphan), list: vi.fn().mockResolvedValue([orphan]) },
    });

    const listed = await run(() => list.invoke());
    const paused = await run(() => save.invoke({ id: LINK_ID, enabled: false }));

    expect(listed.ok && listed.data.items[0]).toMatchObject({ id: LINK_ID, calendarId: null, calendarName: null });
    expect(paused.ok).toBe(true);
    expect(access.findOwnCalendar).not.toHaveBeenCalled();
    expect(repo.update).toHaveBeenCalledWith(
      LINK_ID,
      expect.objectContaining({ calendarId: null, enabled: false }),
      undefined,
    );
  });

  it("checks the calendar the owner chooses for a link that lost its calendar", async () => {
    const orphan = { ...ROW, calendarId: null, calendarName: null };
    const find = vi.fn().mockResolvedValue(orphan);
    const chosen = build({ repo: { find } });
    const foreign = build({ repo: { find }, access: { findOwnCalendar: vi.fn().mockResolvedValue(null) } });

    expect((await run(() => chosen.save.invoke({ id: LINK_ID, calendarId: CALENDAR_ID }))).ok).toBe(true);
    expect(chosen.access.findOwnCalendar).toHaveBeenCalledWith(CALENDAR_ID);
    expect(chosen.repo.update).toHaveBeenCalledWith(
      LINK_ID,
      expect.objectContaining({ calendarId: CALENDAR_ID }),
      undefined,
    );
    expect(code(await run(() => foreign.save.invoke({ id: LINK_ID, calendarId: CALENDAR_ID })))).toBe(
      CustomErrorCode.calendarNotFound,
    );
  });

  describe("round robin hosts", () => {
    const ROUND_ROBIN = { id: LINK_ID, assignment: "roundRobin" as const };
    const member = () =>
      createMockUserWithPermissions([
        { resource: Resource.inboxMessages, action: Action.readOwn },
        { resource: Resource.inboxMessages, action: Action.create },
        { resource: Resource.inboxMessages, action: Action.update },
      ]);

    it("lets an administrator add other members, each with their first usable calendar", async () => {
      const { save, repo, access } = build();

      const result = await run(() => save.invoke({ ...ROUND_ROBIN, hostUserIds: [ANA_ID, ANA_ID] }));

      expect(result.ok).toBe(true);
      expect(access.listMemberCalendars).toHaveBeenCalledOnce();
      expect(repo.update).toHaveBeenCalledWith(LINK_ID, expect.objectContaining({ assignment: "roundRobin" }), [
        { userId: ANA_ID, calendarId: "10000000-0000-4000-8000-0000000000a1" },
      ]);
    });

    it("creates a round robin page with its hosts", async () => {
      const { save, repo } = build();

      expect((await run(() => save.invoke({ ...CREATE, assignment: "roundRobin", hostUserIds: [ANA_ID] }))).ok).toBe(
        true,
      );
      expect(repo.create).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ assignment: "roundRobin" }),
        [{ userId: ANA_ID, calendarId: "10000000-0000-4000-8000-0000000000a1" }],
      );
    });

    it("refuses other members from someone who is not an administrator and stores nothing", async () => {
      const { save, repo, access } = build();

      const result = await runWithTenant(member(), () => save.invoke({ ...ROUND_ROBIN, hostUserIds: [ANA_ID] }));

      expect(code(result)).toBe(CustomErrorCode.bookingHostsNotAllowed);
      expect(access.listMemberCalendars).not.toHaveBeenCalled();
      expect(repo.update).not.toHaveBeenCalled();
    });

    it("lets someone who is not an administrator clear the hosts", async () => {
      const { save, repo } = build();

      expect((await runWithTenant(member(), () => save.invoke({ id: LINK_ID, hostUserIds: [] }))).ok).toBe(true);
      expect(repo.update).toHaveBeenLastCalledWith(LINK_ID, expect.anything(), []);
    });

    it("refuses a member without a usable calendar", async () => {
      const { save, repo } = build();

      expect(code(await run(() => save.invoke({ ...ROUND_ROBIN, hostUserIds: [ANA_ID, BO_ID] })))).toBe(
        CustomErrorCode.bookingHostWithoutCalendar,
      );
      expect(repo.update).not.toHaveBeenCalled();
    });

    it("clears the hosts when the page goes back to single", async () => {
      const { save, repo, access } = build({
        repo: {
          find: vi.fn().mockResolvedValue({
            ...ROW,
            assignment: "roundRobin",
            hosts: [{ userId: ANA_ID, name: "Ana Host", calendarName: "Ana work" }],
          }),
        },
      });

      const result = await run(() => save.invoke({ id: LINK_ID, assignment: "single", hostUserIds: [] }));

      expect(result.ok).toBe(true);
      expect(access.listMemberCalendars).not.toHaveBeenCalled();
      expect(repo.update).toHaveBeenCalledWith(LINK_ID, expect.objectContaining({ assignment: "single" }), []);
    });

    it("keeps the hosts when a change does not name them", async () => {
      const { save, repo } = build();

      expect((await run(() => save.invoke({ id: LINK_ID, inviteeChanges: false }))).ok).toBe(true);
      expect(repo.update).toHaveBeenCalledWith(LINK_ID, expect.objectContaining({ inviteeChanges: false }), undefined);
    });
  });

  it("answers not found when updating a link the caller does not own", async () => {
    const { save } = build({ repo: { find: vi.fn().mockResolvedValue(null) } });

    expect(code(await run(() => save.invoke({ id: LINK_ID, enabled: false })))).toBe(
      CustomErrorCode.bookingLinkNotFound,
    );
  });
});

describe("DeleteBookingLinkInteractor", () => {
  it("deletes an own link and answers not found otherwise", async () => {
    expect(await run(() => build().remove.invoke({ id: LINK_ID }))).toEqual({
      ok: true,
      data: { id: LINK_ID, deleted: true },
    });
    expect(
      code(
        await run(() => build({ repo: { delete: vi.fn().mockResolvedValue(false) } }).remove.invoke({ id: LINK_ID })),
      ),
    ).toBe(CustomErrorCode.bookingLinkNotFound);
  });
});
