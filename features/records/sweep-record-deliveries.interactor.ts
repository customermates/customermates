import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { WebhookDeliveryQueueRepo } from "@/features/webhook/webhook-delivery-queue.repo";
import type { RecordEventOutboxRepo } from "./record-event-outbox.repo";

@SystemInteractor
export class SweepRecordDeliveriesInteractor {
  constructor(
    private readonly outbox: RecordEventOutboxRepo,
    private readonly deliveries: WebhookDeliveryQueueRepo,
    private readonly background: Pick<BackgroundTaskService, "dispatch">,
  ) {}

  async invoke(): Promise<{
    eventWorkspaces: number;
    webhookDeliveries: number;
  }> {
    const now = new Date();
    const [companies, deliveries] = await Promise.all([
      this.outbox.dueCompaniesUnscoped(now, 100),
      this.deliveries.dueUnscoped(now, 200),
    ]);
    const results = await Promise.allSettled([
      ...companies.map((companyId) => this.background.dispatch("process-record-events", { companyId })),
      ...deliveries.map(({ companyId, deliveryId }) =>
        this.background.dispatch("deliver-webhook", { companyId, deliveryId }),
      ),
    ]);
    if (results.some((result) => result.status === "rejected"))
      throw new Error("Some due record deliveries could not be started; the next sweep will retry them");
    return {
      eventWorkspaces: companies.length,
      webhookDeliveries: deliveries.length,
    };
  }
}
