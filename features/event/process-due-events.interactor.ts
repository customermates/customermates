import { z } from "zod";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { EventOutboxRepo } from "./event-outbox.repo";
import type { ProcessEventInteractor } from "./process-event.interactor";
import { beginEventDrain, endEventDrain } from "./event-drain";

const Schema = z.object({ companyId: z.uuid() }).strict();
const BATCH_SIZE = 100;
const DRAIN_BUDGET_MS = 10_000;

@SystemInteractor
export class ProcessDueEventsInteractor {
  constructor(
    private readonly outbox: EventOutboxRepo,
    private readonly process: ProcessEventInteractor,
    private readonly background: Pick<BackgroundTaskService, "dispatch">,
  ) {}

  @Enforce(Schema)
  async invoke(input: z.infer<typeof Schema>): Promise<{ processed: number; continued: boolean }> {
    const drain = beginEventDrain(input.companyId);
    if (!drain) return { processed: 0, continued: false };
    const startedAt = Date.now();
    const withinBudget = () => Date.now() - startedAt < DRAIN_BUDGET_MS;
    let processed = 0;
    try {
      do {
        drain.rescan = false;
        const ids = await this.outbox.dueEventsUnscoped(input.companyId, new Date(), BATCH_SIZE - processed);
        for (const eventId of ids) {
          if (!withinBudget()) {
            drain.rescan = true;
            break;
          }
          await this.process.invoke({ companyId: input.companyId, eventId });
          processed += 1;
        }
      } while (drain.rescan && processed < BATCH_SIZE && withinBudget());
    } finally {
      endEventDrain(input.companyId, drain);
    }
    const continued =
      drain.rescan ||
      (processed === BATCH_SIZE && (await this.outbox.dueEventsUnscoped(input.companyId, new Date(), 1)).length > 0);
    if (continued) await this.background.dispatch("process-events", { companyId: input.companyId });
    return { processed, continued };
  }
}
