import type { RecordEvent } from "@/generated/prisma";
import type { RecordEventAdmission } from "./record-event-admission";

export class RecordEventAdmissionGroup implements RecordEventAdmission {
  constructor(private readonly consumers: readonly RecordEventAdmission[]) {
    if (!consumers.length) throw new Error("Record events require a configured admission consumer");
  }
  async admit(event: RecordEvent): Promise<void> {
    for (const consumer of this.consumers) await consumer.admit(event);
  }
}
