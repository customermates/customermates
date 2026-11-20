import { vi } from "vitest";

import type { TenantUser } from "@/features/user/user.schema";
import type { AppLocale } from "@/i18n/locale-registry";

import { getTenantUser } from "@/core/decorators/tenant-context";
import { PublicTenant } from "@/core/network/public-tenant";
import { TokenBucketRateLimiter } from "@/core/network/token-bucket-rate-limiter";
import { createMockUser } from "@/tests/helpers/mock-user";

import type { BookingHostCandidate, BookingLinkLookup } from "../booking-link.repo";
import type { BookingRow } from "../booking-reservation.repo";
import type { WritableCalendarRow, WritableEventRow } from "../calendar-write-access.repo";

import { PublicBookingAccess } from "../public-booking-access";
import { DEFAULT_WORKING_HOURS } from "../working-hours";

export const OWNER = createMockUser();
export const ANA = createMockUser({ id: "host-ana", firstName: "Ana", lastName: "Host", email: "ana@example.com" });
export const BO = createMockUser({ id: "host-bo", firstName: "Bo", lastName: "Host", email: "bo@example.com" });
export const STRANGER = createMockUser({ id: "host-stranger", companyId: "other-company-id", firstName: "Sam" });

export const LINK_ID = "50000000-0000-4000-8000-000000000001";
export const TOKEN = "tok_abcdefghijklmnop";
export const MANAGE_TOKEN = "manage_abcdefghijklmnop";
export const BOOKING_ID = "80000000-0000-4000-8000-000000000001";
export const EVENT_ID = "90000000-0000-4000-8000-000000000001";

export function calendarId(userId: string): string {
  return `calendar-of-${userId}`;
}

export function calendarRow(userId: string, overrides: Partial<WritableCalendarRow> = {}): WritableCalendarRow {
  return {
    id: calendarId(userId),
    name: "Work",
    unipileCalendarId: `cal_${userId}`,
    timezone: "Europe/Berlin",
    provider: "google",
    connectedAccountId: `account-of-${userId}`,
    unipileAccountId: `acc_${userId}`,
    accountStatus: "ok",
    accountLabel: null,
    ...overrides,
  };
}

export function eventRow(overrides: Partial<WritableEventRow> = {}): WritableEventRow {
  return {
    id: EVENT_ID,
    unipileEventId: "evt_1",
    calendarId: calendarId(OWNER.id),
    unipileCalendarId: `cal_${OWNER.id}`,
    unipileAccountId: `acc_${OWNER.id}`,
    provider: "google",
    accountStatus: "ok",
    connectedAccountId: `account-of-${OWNER.id}`,
    ...overrides,
  };
}

export function candidate(user: TenantUser): BookingHostCandidate {
  return { userId: user.id, name: `${user.firstName} ${user.lastName}`, calendarId: calendarId(user.id) };
}

export function lookupLink(overrides: Partial<BookingLinkLookup> = {}): BookingLinkLookup {
  return {
    id: LINK_ID,
    companyId: OWNER.companyId,
    userId: OWNER.id,
    calendarId: calendarId(OWNER.id),
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
    createdAt: new Date(0),
    upcomingBookings: 0,
    hostName: "Test User",
    workspaceName: "Acme",
    brand: null,
    companyDeleting: false,
    hostCandidates: [candidate(OWNER)],
    ...overrides,
  };
}

export function bookingRow(overrides: Partial<BookingRow> = {}): BookingRow {
  return {
    id: BOOKING_ID,
    companyId: OWNER.companyId,
    bookingLinkId: LINK_ID,
    linkToken: TOKEN,
    linkTitle: "Intro call",
    linkOwnerId: OWNER.id,
    linkTimeZone: "Europe/Berlin",
    linkRecordTypeId: null,
    linkPersonTypeId: null,
    linkStartFieldId: null,
    calendarEventId: EVENT_ID,
    status: "confirmed",
    inviteeName: "Ada Lovelace",
    inviteeEmail: "ada@example.com",
    startsAt: new Date("2026-11-20T09:00:00.000Z"),
    endsAt: new Date("2026-11-20T09:30:00.000Z"),
    timeZone: "Europe/London",
    answers: {},
    personTypeId: null,
    personRecordId: null,
    recordTypeId: null,
    recordId: null,
    hostUserId: OWNER.id,
    hostName: "Test User",
    hostEmail: OWNER.email,
    manageToken: MANAGE_TOKEN,
    linkInviteeChanges: true,
    workspaceName: "Acme",
    brand: null,
    locale: null,
    cancelledBy: null,
    cancelReason: null,
    rescheduledAt: null,
    reminderSentAt: null,
    ...overrides,
  };
}

export type AccessOptions = {
  link?: BookingLinkLookup | null;
  booking?: BookingRow | null;
  users?: TenantUser[];
  permitted?: (userId: string) => boolean;
  entitled?: (userId: string) => boolean;
  calendars?: Record<string, WritableCalendarRow | null>;
  perLink?: number;
  perVisitor?: number;
  now?: Date;
  locale?: AppLocale;
  authSecret?: string;
};

export function buildAccess(options: AccessOptions = {}) {
  const users = options.users ?? [OWNER, ANA, BO, STRANGER];
  const calendars: Record<string, WritableCalendarRow | null> =
    options.calendars ?? Object.fromEntries(users.map((user) => [calendarId(user.id), calendarRow(user.id)]));
  const lookup = {
    findByTokenUnscoped: vi.fn().mockResolvedValue(options.link === undefined ? lookupLink() : options.link),
    findByManageTokenUnscoped: vi
      .fn()
      .mockResolvedValue(options.booking === undefined ? bookingRow() : options.booking),
  };
  const getActiveUserByIdOrThrow = vi.fn((id: string) => {
    const user = users.find((item) => item.id === id);
    return user ? Promise.resolve(user) : Promise.reject(new Error("unknown user"));
  });
  const findOwnCalendar = vi.fn((id: string) => {
    const user = getTenantUser();
    return Promise.resolve(id === calendarId(user.id) ? (calendars[id] ?? null) : null);
  });
  const access = new PublicBookingAccess(
    lookup,
    new PublicTenant({ getActiveUserByIdOrThrow }),
    {
      perLink: new TokenBucketRateLimiter(options.perLink ?? 100, 60_000),
      perVisitor: new TokenBucketRateLimiter(options.perVisitor ?? 100, 60_000),
    },
    () => {
      const user = getTenantUser();
      return { require: vi.fn().mockResolvedValue(options.entitled?.(user.id) === false ? { ok: false } : null) };
    },
    () => {
      const user = getTenantUser();
      return { companyId: user.companyId, has: vi.fn().mockReturnValue(options.permitted?.(user.id) ?? true) };
    },
    () => ({ findOwnCalendar }),
    {
      authSecret: options.authSecret ?? "booking-test-secret",
      now: () => options.now ?? new Date("2026-11-16T10:00:00.000Z"),
      locale: () => options.locale ?? "en",
    },
  );

  return { access, lookup, findOwnCalendar, getActiveUserByIdOrThrow, calendars };
}

export function currentUserId(): string {
  return getTenantUser().id;
}
