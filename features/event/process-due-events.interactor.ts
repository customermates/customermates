import { z } from "zod";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import type { EventOutboxRepo } from "./event-outbox.repo";
import type { ProcessEventInteractor } from "./process-event.interactor";

const Schema = z.object({ companyId: z.uuid() }).strict();
const BATCH_SIZE = 100;

@SystemInteractor
export class ProcessDueEventsInteractor {
  constructor(
    private readonly outbox: EventOutboxRepo,
    private readonly process: ProcessEventInteractor,
  ) {}

  @Enforce(Schema)
  async invoke(input: z.infer<typeof Schema>): Promise<{ processed: number; hasMore: boolean }> {
    const ids = await this.outbox.dueEventsUnscoped(input.companyId, new Date(), BATCH_SIZE);
    for (const eventId of ids) await this.process.invoke({ companyId: input.companyId, eventId });
    return {
      processed: ids.length,
      hasMore:
        ids.length === BATCH_SIZE && (await this.outbox.dueEventsUnscoped(input.companyId, new Date(), 1)).length > 0,
    };
  }
}
