import type { RecordEvent } from "@/generated/prisma";

export abstract class RecordEventOutboxRepo {
  abstract findUnscoped(companyId: string, eventId: string): Promise<RecordEvent | null>;
  abstract markDeliveredUnscoped(event: RecordEvent, now: Date): Promise<void>;
  abstract deferUnscoped(event: RecordEvent, nextAttemptAt: Date): Promise<boolean>;
  abstract dueCompaniesUnscoped(now: Date, take: number): Promise<string[]>;
  abstract dueEventsUnscoped(companyId: string, now: Date, take: number): Promise<string[]>;
}

export abstract class RecordEventAdmission {
  abstract admit(event: RecordEvent): Promise<void>;
}
