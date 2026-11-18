import type { Prisma } from "@/generated/prisma";

import { randomUUID } from "node:crypto";

import { BookingActor, BookingAssignment, BookingStatus } from "@/generated/prisma";

import { TenantRepository } from "@/core/base/tenant-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";

import type { BookingLinkRow, WorkspaceBookingLinkRow } from "./booking.schema";
import type {
  BookingHostCandidate,
  BookingHostWrite,
  BookingLinkLookup,
  BookingLinkRepo,
  BookingLinkWrite,
} from "./booking-link.repo";
import type {
  BookingConfirmation,
  BookingMove,
  BookingReservationInput,
  BookingReservationRepo,
  BookingRow,
  HostLoad,
} from "./booking-reservation.repo";
import type { BusyInterval } from "./free-slots";

const RESERVATION_TTL_MS = 10 * 60_000;
const OPEN_STATUSES = [BookingStatus.reserved, BookingStatus.confirmed];

function upcomingWhere(now: Date): Prisma.BookingWhereInput {
  return { status: { in: OPEN_STATUSES }, endsAt: { gt: now } };
}

function memberName(user: { firstName: string; lastName: string }): string {
  return `${user.firstName} ${user.lastName}`.trim();
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
    personRelationshipId: true,
    recordTypeId: true,
    startFieldId: true,
    questions: true,
    successMessage: true,
    enabled: true,
    assignment: true,
    inviteeChanges: true,
    createdAt: true,
    calendar: { select: { name: true } },
    hosts: {
      orderBy: [{ position: "asc" }, { userId: "asc" }],
      select: {
        userId: true,
        calendarId: true,
        user: { select: { firstName: true, lastName: true } },
        calendar: { select: { name: true } },
      },
    },
    _count: { select: { bookings: { where: upcomingWhere(now) } } },
  } satisfies Prisma.BookingLinkSelect;
}

type LinkRecord = Prisma.BookingLinkGetPayload<{ select: ReturnType<typeof linkSelect> }>;

function toRow({ calendar, hosts, _count, ...link }: LinkRecord): BookingLinkRow {
  return {
    ...link,
    calendarName: calendar?.name ?? null,
    hosts: hosts
      .filter((host) => host.userId !== link.userId)
      .map((host) => ({
        userId: host.userId,
        name: memberName(host.user),
        calendarName: host.calendar?.name ?? null,
      })),
    upcomingBookings: _count.bookings,
  };
}

function writeData(data: Partial<BookingLinkWrite>): Prisma.BookingLinkUncheckedUpdateInput {
  const { workingHours, questions, ...rest } = data;

  return {
    ...rest,
    ...(workingHours !== undefined ? { workingHours: workingHours as Prisma.InputJsonValue } : {}),
    ...(questions !== undefined ? { questions: questions as Prisma.InputJsonValue } : {}),
  };
}

const bookingSelect = {
  id: true,
  companyId: true,
  bookingLinkId: true,
  calendarEventId: true,
  status: true,
  inviteeName: true,
  inviteeEmail: true,
  startsAt: true,
  endsAt: true,
  timeZone: true,
  answers: true,
  personTypeId: true,
  personRecordId: true,
  recordTypeId: true,
  recordId: true,
  hostUserId: true,
  manageToken: true,
  host: { select: { firstName: true, lastName: true } },
  link: {
    select: {
      token: true,
      title: true,
      userId: true,
      timeZone: true,
      recordTypeId: true,
      personTypeId: true,
      startFieldId: true,
    },
  },
} satisfies Prisma.BookingSelect;

type BookingRecord = Prisma.BookingGetPayload<{ select: typeof bookingSelect }>;

function storedAnswers(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.fromEntries(Object.entries(value).map(([key, answer]) => [key, String(answer)]));
}

function toBooking({ host, link, answers, ...booking }: BookingRecord): BookingRow {
  return {
    ...booking,
    answers: storedAnswers(answers),
    hostName: memberName(host),
    linkToken: link.token,
    linkTitle: link.title,
    linkOwnerId: link.userId,
    linkTimeZone: link.timeZone,
    linkRecordTypeId: link.recordTypeId,
    linkPersonTypeId: link.personTypeId,
    linkStartFieldId: link.startFieldId,
  };
}

function cancelledData(by: BookingActor, reason: string | null, now: Date): Prisma.BookingUncheckedUpdateManyInput {
  return { status: BookingStatus.cancelled, slotKey: null, cancelledBy: by, cancelReason: reason, cancelledAt: now };
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

  async listWorkspace(): Promise<WorkspaceBookingLinkRow[]> {
    const rows = await this.prisma.bookingLink.findMany({
      where: { companyId: this.companyId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 200,
      select: { ...linkSelect(new Date()), user: { select: { firstName: true, lastName: true } } },
    });

    return rows.map(({ user, ...row }) => ({ ...toRow(row), ownerName: memberName(user) }));
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

  async create(token: string, data: BookingLinkWrite, hosts: BookingHostWrite[]): Promise<BookingLinkRow> {
    const id = randomUUID();
    await runInTransaction(
      async () => {
        await this.prisma.bookingLink.create({
          data: {
            ...(writeData(data) as Prisma.BookingLinkUncheckedCreateInput),
            id,
            companyId: this.companyId,
            userId: this.userId,
            token,
          },
          select: { id: true },
        });
        await this.replaceHosts(id, hosts);
      },
      { lockCompany: false },
    );
    const row = await this.find(id);
    if (!row) throw new Error("The booking link was not stored");

    return row;
  }

  async update(
    id: string,
    data: Partial<BookingLinkWrite>,
    hosts?: BookingHostWrite[],
  ): Promise<BookingLinkRow | null> {
    const updated = await runInTransaction(
      async () => {
        const { count } = await this.prisma.bookingLink.updateMany({
          where: { id, companyId: this.companyId, userId: this.userId },
          data: writeData(data),
        });
        if (count && hosts) await this.replaceHosts(id, hosts);

        return count > 0;
      },
      { lockCompany: false },
    );

    return updated ? this.find(id) : null;
  }

  private async replaceHosts(bookingLinkId: string, hosts: BookingHostWrite[]): Promise<void> {
    await this.prisma.bookingLinkHost.deleteMany({ where: { companyId: this.companyId, bookingLinkId } });
    if (!hosts.length) return;
    await this.prisma.bookingLinkHost.createMany({
      data: hosts.map((host, position) => ({
        bookingLinkId,
        companyId: this.companyId,
        userId: host.userId,
        calendarId: host.calendarId,
        position,
      })),
    });
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
      },
    });
    if (!row) return null;

    const { company, user, ...link } = row;
    const owner: BookingHostCandidate[] = link.calendarId
      ? [{ userId: link.userId, name: memberName(user), calendarId: link.calendarId }]
      : [];
    const further: BookingHostCandidate[] =
      link.assignment === BookingAssignment.roundRobin
        ? link.hosts.flatMap((host) =>
            host.calendarId && host.userId !== link.userId
              ? [{ userId: host.userId, name: memberName(host.user), calendarId: host.calendarId }]
              : [],
          )
        : [];

    return {
      ...toRow(link),
      hostName: memberName(user),
      workspaceName: company.name,
      companyDeleting: company.deletingAt !== null,
      hostCandidates: [...owner, ...further],
    };
  }

  private lockHost() {
    return this.prisma
      .$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`customermates:booking-owner:${this.userId}`}, 0))`;
  }

  reserve(input: BookingReservationInput, isOpen: () => Promise<boolean>): Promise<{ id: string } | null> {
    const slotKey = `${input.startsAt.toISOString()}|${this.userId}`;

    return runInTransaction(
      async () => {
        await this.lockHost();
        await this.prisma.booking.deleteMany({
          where: {
            companyId: this.companyId,
            bookingLinkId: input.bookingLinkId,
            slotKey,
            status: BookingStatus.reserved,
            createdAt: { lt: new Date(Date.now() - RESERVATION_TTL_MS) },
          },
        });
        if (!(await isOpen())) return null;

        const id = randomUUID();
        const { count } = await this.prisma.booking.createMany({
          data: [
            {
              id,
              companyId: this.companyId,
              bookingLinkId: input.bookingLinkId,
              hostUserId: this.userId,
              manageToken: input.manageToken,
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
          ],
          skipDuplicates: true,
        });

        return count ? { id } : null;
      },
      { lockCompany: false },
    );
  }

  async confirm(id: string, confirmation: BookingConfirmation): Promise<void> {
    await this.prisma.booking.updateMany({
      where: { id, companyId: this.companyId },
      data: { ...confirmation, status: BookingStatus.confirmed, slotKey: null },
    });
  }

  async release(id: string): Promise<void> {
    await this.prisma.booking.deleteMany({
      where: { id, companyId: this.companyId, status: BookingStatus.reserved },
    });
  }

  @BypassTenantGuard
  async findByManageTokenUnscoped(manageToken: string): Promise<BookingRow | null> {
    const row = await this.prisma.booking.findUnique({ where: { manageToken }, select: bookingSelect });

    return row ? toBooking(row) : null;
  }

  private async findHosted(id: string): Promise<BookingRow | null> {
    const row = await this.prisma.booking.findFirst({
      where: { id, companyId: this.companyId, hostUserId: this.userId },
      select: bookingSelect,
    });

    return row ? toBooking(row) : null;
  }

  async cancelHosted(id: string, by: "invitee" | "host", reason: string | null, now: Date): Promise<BookingRow | null> {
    const { count } = await this.prisma.booking.updateMany({
      where: {
        id,
        companyId: this.companyId,
        hostUserId: this.userId,
        status: BookingStatus.confirmed,
        startsAt: { gt: now },
      },
      data: cancelledData(by, reason, now),
    });

    return count ? this.findHosted(id) : null;
  }

  async reopenHosted(id: string): Promise<void> {
    await this.prisma.booking.updateMany({
      where: { id, companyId: this.companyId, hostUserId: this.userId, status: BookingStatus.cancelled },
      data: { status: BookingStatus.confirmed, cancelledBy: null, cancelReason: null, cancelledAt: null },
    });
  }

  moveHosted(
    id: string,
    to: { startsAt: Date; endsAt: Date },
    now: Date,
    isOpen: () => Promise<boolean>,
  ): Promise<BookingMove | null> {
    return runInTransaction(
      async () => {
        await this.lockHost();
        const current = await this.findHosted(id);
        if (!current || current.status !== BookingStatus.confirmed || current.startsAt <= now) return null;
        if (!(await isOpen())) return null;

        await this.prisma.booking.updateMany({
          where: { id, companyId: this.companyId, hostUserId: this.userId, status: BookingStatus.confirmed },
          data: { startsAt: to.startsAt, endsAt: to.endsAt, rescheduledAt: now },
        });

        return {
          booking: { ...current, startsAt: to.startsAt, endsAt: to.endsAt },
          previousStartsAt: current.startsAt,
        };
      },
      { lockCompany: false },
    );
  }

  async restoreTimes(id: string, times: { startsAt: Date; endsAt: Date }): Promise<void> {
    await this.prisma.booking.updateMany({
      where: { id, companyId: this.companyId, hostUserId: this.userId },
      data: { startsAt: times.startsAt, endsAt: times.endsAt },
    });
  }

  @BypassTenantGuard
  async cancelForCalendarEventUnscoped(args: {
    companyId: string;
    calendarEventId: string;
    now: Date;
  }): Promise<BookingRow[]> {
    const { companyId, calendarEventId, now } = args;
    const open = await this.prisma.booking.findMany({
      where: { companyId, calendarEventId, status: { in: OPEN_STATUSES } },
      select: bookingSelect,
      take: 20,
    });
    if (!open.length) return [];

    await this.prisma.booking.updateMany({
      where: { companyId, id: { in: open.map((booking) => booking.id) }, status: { in: OPEN_STATUSES } },
      data: cancelledData(BookingActor.host, null, now),
    });

    return open.map((booking) => ({ ...toBooking(booking), status: BookingStatus.cancelled }));
  }

  @BypassTenantGuard
  async moveForCalendarEventUnscoped(args: {
    companyId: string;
    calendarEventId: string;
    startsAt: Date;
    endsAt: Date;
    now: Date;
  }): Promise<BookingMove[]> {
    const moved = await this.prisma.booking.findMany({
      where: {
        companyId: args.companyId,
        calendarEventId: args.calendarEventId,
        status: BookingStatus.confirmed,
        NOT: { startsAt: args.startsAt, endsAt: args.endsAt },
      },
      select: bookingSelect,
      take: 20,
    });
    if (!moved.length) return [];

    await this.prisma.booking.updateMany({
      where: {
        companyId: args.companyId,
        id: { in: moved.map((booking) => booking.id) },
        status: BookingStatus.confirmed,
      },
      data: { startsAt: args.startsAt, endsAt: args.endsAt, rescheduledAt: args.now },
    });

    return moved.map((booking) => ({
      booking: { ...toBooking(booking), startsAt: args.startsAt, endsAt: args.endsAt },
      previousStartsAt: booking.startsAt,
    }));
  }

  busyForOwner(from: Date, to: Date, exceptBookingId?: string): Promise<BusyInterval[]> {
    const recent = new Date(Date.now() - RESERVATION_TTL_MS);

    return this.prisma.booking.findMany({
      where: {
        companyId: this.companyId,
        hostUserId: this.userId,
        startsAt: { lt: to },
        endsAt: { gt: from },
        ...(exceptBookingId ? { id: { not: exceptBookingId } } : {}),
        OR: [
          { status: BookingStatus.reserved, createdAt: { gte: recent } },
          { status: BookingStatus.confirmed, updatedAt: { gte: recent } },
        ],
      },
      select: { startsAt: true, endsAt: true },
      take: 2000,
    });
  }

  async hostLoads(bookingLinkId: string, now: Date): Promise<HostLoad[]> {
    const rows = await this.prisma.booking.findMany({
      where: { companyId: this.companyId, bookingLinkId, ...upcomingWhere(now) },
      select: { hostUserId: true, createdAt: true },
      take: 5000,
    });
    const loads = new Map<string, HostLoad>();
    for (const row of rows) {
      const load = loads.get(row.hostUserId) ?? { hostUserId: row.hostUserId, upcoming: 0, lastBookedAt: null };
      load.upcoming += 1;
      if (!load.lastBookedAt || row.createdAt > load.lastBookedAt) load.lastBookedAt = row.createdAt;
      loads.set(row.hostUserId, load);
    }

    return [...loads.values()];
  }

  async listUpcoming(now: Date, scope: "hosted" | "workspace", limit: number): Promise<BookingRow[]> {
    const rows = await this.prisma.booking.findMany({
      where: {
        companyId: this.companyId,
        status: BookingStatus.confirmed,
        endsAt: { gt: now },
        ...(scope === "hosted" ? { OR: [{ hostUserId: this.userId }, { link: { is: { userId: this.userId } } }] } : {}),
      },
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
      take: limit,
      select: bookingSelect,
    });

    return rows.map(toBooking);
  }

  countOpenForEmail(bookingLinkId: string, email: string, now: Date): Promise<number> {
    return this.prisma.booking.count({
      where: { companyId: this.companyId, bookingLinkId, inviteeEmail: email, ...upcomingWhere(now) },
    });
  }

  countForVisitorSince(bookingLinkId: string, ipHash: string, since: Date): Promise<number> {
    return this.prisma.booking.count({
      where: { companyId: this.companyId, bookingLinkId, ipHash, createdAt: { gte: since } },
    });
  }

  countForLinkSince(bookingLinkId: string, since: Date): Promise<number> {
    return this.prisma.booking.count({
      where: { companyId: this.companyId, bookingLinkId, createdAt: { gte: since } },
    });
  }

  @BypassTenantGuard
  async deleteExpiredUnscoped(cutoffs: { endedBefore: Date; abandonedBefore: Date }, limit: number): Promise<number> {
    const expired = await this.prisma.booking.findMany({
      where: {
        OR: [
          { endsAt: { lt: cutoffs.endedBefore } },
          { status: BookingStatus.reserved, createdAt: { lt: cutoffs.abandonedBefore } },
        ],
      },
      select: { id: true },
      take: limit,
    });
    const { count } = await this.prisma.booking.deleteMany({
      where: { id: { in: expired.map((booking) => booking.id) } },
    });

    return count;
  }
}
