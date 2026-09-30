import { z } from "zod";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import type { RecordEventOutboxRepo } from "./record-event-outbox.repo";
import type { ProcessRecordEventInteractor } from "./process-record-event.interactor";

const Schema = z.object({ companyId: z.uuid() }).strict();
const BATCH_SIZE = 100;

@SystemInteractor
export class ProcessDueRecordEventsInteractor {
  constructor(
    private readonly outbox: RecordEventOutboxRepo,
    private readonly process: ProcessRecordEventInteractor,
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
