import type { RecordRef } from "@/features/records/record-model.schema";

export abstract class CalendarEventLinkRepo {
  abstract linkRecords(eventId: string, refs: RecordRef[]): Promise<void>;
  abstract listLinks(eventIds: string[]): Promise<Map<string, RecordRef[]>>;
}
