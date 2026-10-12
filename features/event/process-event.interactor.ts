import { z } from "zod";
import type { EventLog } from "@/generated/prisma";
import type { EventOutboxRepo } from "./event-outbox.repo";
import type { EventAdmission } from "./event-admission";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";

const ProcessEventSchema = z.object({ companyId: z.uuid(), eventId: z.uuid() }).strict();
type ProcessEventInput = z.infer<typeof ProcessEventSchema>;
type ProcessEventResult = { status: "delivered" | "deferred" | "not_found" };

@SystemInteractor
export class ProcessEventInteractor {
  constructor(
    private readonly outbox: EventOutboxRepo,
    private readonly admission: EventAdmission,
  ) {}

  @Enforce(ProcessEventSchema)
  async invoke(input: ProcessEventInput): Promise<ProcessEventResult> {
    const settled = this.settledStatus(await this.outbox.findUnscoped(input.companyId, input.eventId), new Date());
    if (settled) return { status: settled };
    const attempt: { event: EventLog | null } = { event: null };
    try {
      return await runInTransaction(
        async () => {
          const event = await this.outbox.findUnscoped(input.companyId, input.eventId);
          const now = new Date();
          const status = this.settledStatus(event, now);
          if (status || !event) return { status: status ?? "not_found" };
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

  private settledStatus(event: EventLog | null, now: Date): ProcessEventResult["status"] | null {
    if (!event) return "not_found";
    if (event.deliveredAt) return "delivered";
    if (event.nextAttemptAt > now) return "deferred";
    return null;
  }
}
