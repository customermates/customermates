import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { WebhookDeliveryQueueRepo } from "@/features/webhook/webhook-delivery-queue.repo";
import type { RecordEventOutboxRepo } from "./record-event-outbox.repo";
import type { RecordOperationQueueRepo } from "./record-operation-queue.repo";

@SystemInteractor
export class SweepRecordDeliveriesInteractor {
  constructor(
    private readonly outbox: RecordEventOutboxRepo,
    private readonly deliveries: WebhookDeliveryQueueRepo,
    private readonly operations: RecordOperationQueueRepo,
    private readonly background: Pick<BackgroundTaskService, "dispatch">,
  ) {}

  async invoke(): Promise<{
    eventWorkspaces: number;
    webhookDeliveries: number;
    recordOperations: number;
  }> {
    const now = new Date();
    const [companies, deliveries, operations] = await Promise.all([
      this.outbox.dueCompaniesUnscoped(now, 100),
      this.deliveries.dueUnscoped(now, 200),
      this.operations.claimDueUnscoped(now, new Date(now.getTime() + 60000), 100),
    ]);
    const results = await Promise.allSettled([
      ...companies.map((companyId) => this.background.dispatch("process-record-events", { companyId })),
      ...deliveries.map(({ companyId, deliveryId }) =>
        this.background.dispatch("deliver-webhook", { companyId, deliveryId }),
      ),
      ...operations.map(({ companyId, operationId, ownerUserId, kind }) =>
        kind === "provider-avatar"
          ? this.background.dispatch("provider-avatar-operation", { companyId, operationId })
          : this.background.dispatch("record-operation", {
              operationId,
              ownerUserId,
              tenant: { companyId, userId: ownerUserId },
            }),
      ),
    ]);
    if (results.some((result) => result.status === "rejected"))
      throw new Error("Some due record work could not be started; the next sweep will retry it");
    return {
      eventWorkspaces: companies.length,
      webhookDeliveries: deliveries.length,
      recordOperations: operations.length,
    };
  }
}
