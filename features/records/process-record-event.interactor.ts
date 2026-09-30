import { z } from "zod";
import type { RecordEvent } from "@/generated/prisma";
import type { RecordEventOutboxRepo, RecordEventAdmission } from "./record-event-outbox.repo";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";

const ProcessRecordEventSchema = z.object({ companyId: z.uuid(), eventId: z.uuid() }).strict();
type ProcessRecordEventInput = z.infer<typeof ProcessRecordEventSchema>;
type ProcessRecordEventResult = { status: "delivered" | "deferred" | "not_found" };

@SystemInteractor
export class ProcessRecordEventInteractor {
  constructor(
    private readonly outbox: RecordEventOutboxRepo,
    private readonly admission: RecordEventAdmission,
  ) {}

  @Enforce(ProcessRecordEventSchema)
  async invoke(input: ProcessRecordEventInput): Promise<ProcessRecordEventResult> {
    const attempt: { event: RecordEvent | null } = { event: null };
    try {
      return await runInTransaction(
        async () => {
          const event = await this.outbox.findUnscoped(input.companyId, input.eventId);
          if (!event) return { status: "not_found" } as const;
          if (event.deliveredAt) return { status: "delivered" } as const;
          const now = new Date();
          if (event.nextAttemptAt > now) return { status: "deferred" } as const;
          attempt.event = event;
          await this.admission.admit(event);
          await this.outbox.markDeliveredUnscoped(event, now);
          return { status: "delivered" } as const;
        },
        { companyId: input.companyId, timeout: 30000 },
      );
    } catch (error) {
      if (!attempt.event) throw error;
      const event = attempt.event;
      const delay = Math.min(3_600_000, 1000 * 2 ** Math.min(event.attempts, 12));
      await runInTransaction(() => this.outbox.deferUnscoped(event, new Date(Date.now() + delay)), {
        companyId: input.companyId,
      });
      return { status: "deferred" };
    }
  }
}
