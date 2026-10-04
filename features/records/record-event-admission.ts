import type { RecordEvent } from "@/generated/prisma";

export abstract class RecordEventAdmission {
  abstract admit(event: RecordEvent): Promise<void>;
}
