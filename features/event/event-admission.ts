import type { EventLog } from "@/generated/prisma";

export abstract class EventAdmission {
  abstract admit(event: EventLog): Promise<void>;
}
