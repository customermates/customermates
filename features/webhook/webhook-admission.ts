import type { EventLog, Webhook } from "@/generated/prisma";
import { TenantRepository } from "@/core/base/tenant-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { EventAdmission } from "@/features/event/event-admission";
import type { RecordRecipientReader } from "@/features/records/record-recipient-reader";

export class WebhookAdmission extends TenantRepository implements EventAdmission {
  constructor(
    private readonly reader: RecordRecipientReader,
    private readonly background: BackgroundTaskService,
  ) {
    super();
  }

  @BypassTenantGuard
  async admit(event: EventLog): Promise<void> {
    if (event.subjectKind !== "record") {
      const hooks = await this.prisma.webhook.findMany({
        where: { companyId: event.companyId, enabled: true, events: { has: event.kind } },
      });
      for (const webhook of hooks) await this.deliver(event, webhook, null);
      return;
    }
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
      if (envelope) await this.deliver(event, webhook, match.subscriptionRevision);
    }
  }

  private async deliver(event: EventLog, webhook: Webhook, subscriptionRevision: number | null): Promise<void> {
    const admissionKey = `${webhook.id}:${event.id}`;
    await this.prisma.webhookDelivery.createMany({
      data: [
        {
          companyId: event.companyId,
          webhookId: webhook.id,
          eventId: event.id,
          admissionKey,
          subscriptionRevision,
          url: webhook.url,
          event: event.kind,
          requestBody: { eventId: event.id },
        },
      ],
      skipDuplicates: true,
    });
    const delivery = await this.prisma.webhookDelivery.findFirstOrThrow({
      where: { companyId: event.companyId, admissionKey },
      select: { id: true, nextAttemptAt: true },
    });
    if (delivery.nextAttemptAt)
      await this.background.dispatch("deliver-webhook", { deliveryId: delivery.id, companyId: event.companyId });
  }
}
