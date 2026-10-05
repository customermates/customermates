import type { RecordEvent } from "@/generated/prisma";
import { TenantRepository } from "@/core/base/tenant-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { RecordEventAdmission } from "@/features/records/record-event-admission";
import type { RecordRecipientReader } from "@/features/records/record-recipient-reader";

export class RecordWebhookAdmission extends TenantRepository implements RecordEventAdmission {
  constructor(
    private readonly reader: RecordRecipientReader,
    private readonly background: BackgroundTaskService,
  ) {
    super();
  }

  @BypassTenantGuard
  async admit(event: RecordEvent): Promise<void> {
    const matches = await this.prisma.recordEventMatch.findMany({
      where: {
        companyId: event.companyId,
        eventId: event.id,
        subscription: { companyId: event.companyId, kind: "webhook", enabled: true },
      },
      include: { subscription: true },
    });
    if (!matches.length) return;
    const hooks = await this.prisma.webhook.findMany({
      where: {
        companyId: event.companyId,
        id: { in: matches.map((match) => match.subscriptionId) },
        enabled: true,
        events: { has: event.kind },
      },
    });
    const byId = new Map(hooks.map((hook) => [hook.id, hook]));
    for (const match of matches) {
      const webhook = byId.get(match.subscriptionId);
      if (!webhook || match.subscriptionRevision !== match.subscription.revision) continue;
      const envelope = await this.reader.readEvent({
        companyId: event.companyId,
        userId: match.subscription.ownerUserId,
        eventId: event.id,
        subscriptionId: webhook.id,
      });
      if (!envelope) continue;
      await this.prisma.webhookDelivery.createMany({
        data: [
          {
            companyId: event.companyId,
            webhookId: webhook.id,
            recordEventId: event.id,
            admissionKey: `${webhook.id}:${event.id}`,
            subscriptionRevision: match.subscriptionRevision,
            url: webhook.url,
            event: event.kind,
            requestBody: { version: 2, eventId: event.id },
          },
        ],
        skipDuplicates: true,
      });
      const delivery = await this.prisma.webhookDelivery.findFirstOrThrow({
        where: {
          companyId: event.companyId,
          admissionKey: `${webhook.id}:${event.id}`,
        },
        select: { id: true, nextAttemptAt: true },
      });
      if (delivery.nextAttemptAt)
        await this.background.dispatch("deliver-webhook", { deliveryId: delivery.id, companyId: event.companyId });
    }
  }
}
