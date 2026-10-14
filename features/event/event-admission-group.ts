import type { EventLog } from "@/generated/prisma";
import type { EventAdmission } from "./event-admission";

export class EventAdmissionGroup implements EventAdmission {
  constructor(private readonly consumers: readonly EventAdmission[]) {
    if (!consumers.length) throw new Error("Events require a configured admission consumer");
  }
  async admit(event: EventLog): Promise<void> {
    for (const consumer of this.consumers) await consumer.admit(event);
  }
}
