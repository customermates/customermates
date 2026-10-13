import type { EventLog } from "@/generated/prisma";
import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import { transactionStorage } from "@/core/decorators/transaction-context";
import { requestEventDrainRescan } from "./event-drain";

export const EVENT_ADMISSION_MAX_ATTEMPTS = 20;
export const EVENT_ADMISSION_ABANDONED = "admission_abandoned";

export abstract class EventOutboxRepo {
  abstract findUnscoped(companyId: string, eventId: string): Promise<EventLog | null>;
  abstract markDeliveredUnscoped(event: EventLog, now: Date): Promise<boolean>;
  abstract deferUnscoped(event: EventLog, nextAttemptAt: Date): Promise<boolean>;
  abstract abandonUnscoped(event: EventLog): Promise<boolean>;
  abstract dueCompaniesUnscoped(now: Date, take: number): Promise<string[]>;
  abstract dueEventsUnscoped(companyId: string, now: Date, take: number): Promise<string[]>;
}

export async function wakeEventOutbox(
  background: Pick<BackgroundTaskService, "dispatch">,
  companyId: string,
): Promise<void> {
  const store = transactionStorage.getStore();
  if (store?.eventWakeups.has(companyId)) return;
  store?.eventWakeups.add(companyId);
  const wake = async () => {
    if (!requestEventDrainRescan(companyId)) await background.dispatch("process-events", { companyId });
  };
  if (store) store.afterCommit.push(wake);
  else await wake();
}
