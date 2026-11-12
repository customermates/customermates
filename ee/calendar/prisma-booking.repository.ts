import type { Prisma } from "@/generated/prisma";

import { BookingStatus, ConnectedAccountStatus, Prisma as PrismaNamespace } from "@/generated/prisma";

import { TenantRepository } from "@/core/base/tenant-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";

import type { BookingLinkRow } from "./booking.schema";
import type { BookingLinkLookup, BookingLinkRepo, BookingLinkWrite } from "./booking-link.repo";
import type {
  BookingConfirmation,
  BookingReservationInput,
  BookingReservationRepo,
} from "./booking-reservation.repo";
import type { BusyInterval } from "./free-slots";

const RESERVATION_TTL_MS = 10 * 60_000;
const OPEN_STATUSES = [BookingStatus.reserved, BookingStatus.confirmed];

function upcomingWhere(now: Date): Prisma.BookingWhereInput {
  return { status: { in: OPEN_STATUSES }, endsAt: { gt: now } };
}

function linkSelect(now: Date) {
  return {
    id: true,
    companyId: true,
    userId: true,
    calendarId: true,
    token: true,
    title: true,
    description: true,
    durationMinutes: true,
    bufferMinutes: true,
    minNoticeMinutes: true,
    horizonDays: true,
    timeZone: true,
    workingHours: true,
    withVideo: true,
    personTypeId: true,
    recordTypeId: true,
    startFieldId: true,
    questions: true,
    successMessage: true,
    enabled: true,
    createdAt: true,
    calendar: { select: { name: true } },
    _count: { select: { bookings: { where: upcomingWhere(now) } } },
  } satisfies Prisma.BookingLinkSelect;
}

type LinkRecord = Prisma.BookingLinkGetPayload<{ select: ReturnType<typeof linkSelect> }>;

function toRow({ calendar, _count, ...link }: LinkRecord): BookingLinkRow {
  return { ...link, calendarName: calendar.name, upcomingBookings: _count.bookings };
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof PrismaNamespace.PrismaClientKnownRequestError && error.code === "P2002";
}

function writeData(data: Partial<BookingLinkWrite>): Prisma.BookingLinkUncheckedUpdateInput {
  const { workingHours, questions, ...rest } = data;

  return {
    ...rest,
    ...(workingHours !== undefined ? { workingHours: workingHours as Prisma.InputJsonValue } : {}),
    ...(questions !== undefined ? { questions: questions as Prisma.InputJsonValue } : {}),
  };
}

export class PrismaBookingRepo extends TenantRepository implements BookingLinkRepo, BookingReservationRepo {
  async list(): Promise<BookingLinkRow[]> {
    const rows = await this.prisma.bookingLink.findMany({
      where: { companyId: this.companyId, userId: this.userId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 100,
      select: linkSelect(new Date()),
    });

    return rows.map(toRow);
  }

  async find(id: string): Promise<BookingLinkRow | null> {
    const row = await this.prisma.bookingLink.findFirst({
      where: { id, companyId: this.companyId, userId: this.userId },
      select: linkSelect(new Date()),
    });

    return row ? toRow(row) : null;
  }

  countOwn(): Promise<number> {
    return this.prisma.bookingLink.count({ where: { companyId: this.companyId, userId: this.userId } });
  }

  async create(token: string, data: BookingLinkWrite): Promise<BookingLinkRow> {
    const row = await this.prisma.bookingLink.create({
      data: {
        ...(writeData(data) as Prisma.BookingLinkUncheckedCreateInput),
        companyId: this.companyId,
        userId: this.userId,
        token,
      },
      select: linkSelect(new Date()),
    });

    return toRow(row);
  }

  async update(id: string, data: Partial<BookingLinkWrite>): Promise<BookingLinkRow | null> {
    const { count } = await this.prisma.bookingLink.updateMany({
      where: { id, companyId: this.companyId, userId: this.userId },
      data: writeData(data),
    });

    return count ? this.find(id) : null;
  }

  async delete(id: string): Promise<boolean> {
    const { count } = await this.prisma.bookingLink.deleteMany({
      where: { id, companyId: this.companyId, userId: this.userId },
    });

    return count > 0;
  }

  @BypassTenantGuard
  async findByTokenUnscoped(token: string): Promise<BookingLinkLookup | null> {
    const row = await this.prisma.bookingLink.findUnique({
      where: { token },
      select: {
        ...linkSelect(new Date()),
        company: { select: { name: true, deletingAt: true } },
        user: { select: { firstName: true, lastName: true } },
        calendar: {
          select: {
            name: true,
            unipileCalendarId: true,
            connectedAccount: { select: { id: true, provider: true, status: true, unipileAccountId: true } },
          },
        },
      },
    });
    if (!row) return null;

    const { company, user, calendar, _count, ...link } = row;

    return {
      ...link,
      calendarName: calendar.name,
      upcomingBookings: _count.bookings,
      hostName: `${user.firstName} ${user.lastName}`.trim(),
      workspaceName: company.name,
      companyDeleting: company.deletingAt !== null,
      unipileAccountId: calendar.connectedAccount.unipileAccountId,
      unipileCalendarId: calendar.unipileCalendarId,
      connectedAccountId: calendar.connectedAccount.id,
      provider: calendar.connectedAccount.provider,
      accountUsable: calendar.connectedAccount.status === ConnectedAccountStatus.ok,
    };
  }

  async reserve(input: BookingReservationInput): Promise<{ id: string } | null> {
    const slotKey = input.startsAt.toISOString();
    await this.prisma.booking.deleteMany({
      where: {
        companyId: this.companyId,
        bookingLinkId: input.bookingLinkId,
        slotKey,
        status: BookingStatus.reserved,
        createdAt: { lt: new Date(Date.now() - RESERVATION_TTL_MS) },
      },
    });

    try {
      return await this.prisma.booking.create({
        data: {
          companyId: this.companyId,
          bookingLinkId: input.bookingLinkId,
          slotKey,
          status: BookingStatus.reserved,
          inviteeName: input.inviteeName,
          inviteeEmail: input.inviteeEmail,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          timeZone: input.timeZone,
          answers: input.answers,
          ipHash: input.ipHash,
        },
        select: { id: true },
      });
    } catch (error) {
      if (isUniqueViolation(error)) return null;
      throw error;
    }
  }

  async confirm(id: string, confirmation: BookingConfirmation): Promise<void> {
    await this.prisma.booking.updateMany({
      where: { id, companyId: this.companyId },
      data: { ...confirmation, status: BookingStatus.confirmed },
    });
  }

  async release(id: string): Promise<void> {
    await this.prisma.booking.deleteMany({
      where: { id, companyId: this.companyId, status: BookingStatus.reserved },
    });
  }

  async cancelForCalendarEvent(calendarEventId: string): Promise<void> {
    await this.prisma.booking.updateMany({
      where: { companyId: this.companyId, calendarEventId, status: { in: OPEN_STATUSES } },
      data: { status: BookingStatus.cancelled, slotKey: null },
    });
  }

  async busyForOwner(from: Date, to: Date): Promise<BusyInterval[]> {
    const rows = await this.prisma.booking.findMany({
      where: {
        companyId: this.companyId,
        link: { is: { userId: this.userId } },
        startsAt: { lt: to },
        endsAt: { gt: from },
        OR: [
          { status: BookingStatus.confirmed },
          { status: BookingStatus.reserved, createdAt: { gte: new Date(Date.now() - RESERVATION_TTL_MS) } },
        ],
      },
      select: { startsAt: true, endsAt: true },
      take: 2000,
    });

    return rows;
  }

  countOpenForEmail(bookingLinkId: string, email: string, now: Date): Promise<number> {
    return this.prisma.booking.count({
      where: { companyId: this.companyId, bookingLinkId, inviteeEmail: email, ...upcomingWhere(now) },
    });
  }
}
