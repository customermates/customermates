import type { RecordRef } from "@/features/records/record-model.schema";

import { TenantRepository } from "@/core/base/tenant-repository";

import type { CalendarEventLinkRepo } from "./calendar-event-link.repo";

export class PrismaCalendarEventLinkRepo extends TenantRepository implements CalendarEventLinkRepo {
  async linkRecords(eventId: string, refs: RecordRef[]): Promise<void> {
    if (!refs.length) return;

    await this.prisma.calendarEventRecordLink.createMany({
      data: refs.map((ref) => ({
        companyId: this.companyId,
        calendarEventId: eventId,
        typeId: ref.typeId,
        recordId: ref.recordId,
      })),
      skipDuplicates: true,
    });
  }

  async listLinks(eventIds: string[]): Promise<Map<string, RecordRef[]>> {
    const links = new Map<string, RecordRef[]>();
    if (!eventIds.length) return links;

    const rows = await this.prisma.calendarEventRecordLink.findMany({
      where: { companyId: this.companyId, calendarEventId: { in: eventIds } },
      select: { calendarEventId: true, typeId: true, recordId: true },
      orderBy: [{ createdAt: "asc" }, { recordId: "asc" }],
    });
    for (const row of rows) {
      links.set(row.calendarEventId, [
        ...(links.get(row.calendarEventId) ?? []),
        { typeId: row.typeId, recordId: row.recordId },
      ]);
    }

    return links;
  }
}
