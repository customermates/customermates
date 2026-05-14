import type { DomainEventHandlers } from "@/features/event/domain-event.listener";
import type { recalculateCompanyWidgets } from "@/trigger/recalculate-company-widgets";
import type { BackgroundTaskService } from "@/core/utils/background-task.service";

import { DomainEventListener } from "@/features/event/domain-event.listener";
import { DomainEvent } from "@/features/event/domain-events";

const WIDGET_MUTATION_EVENTS = [
  DomainEvent.CONTACT_CREATED,
  DomainEvent.CONTACT_UPDATED,
  DomainEvent.CONTACT_DELETED,
  DomainEvent.ORGANIZATION_CREATED,
  DomainEvent.ORGANIZATION_UPDATED,
  DomainEvent.ORGANIZATION_DELETED,
  DomainEvent.DEAL_CREATED,
  DomainEvent.DEAL_UPDATED,
  DomainEvent.DEAL_DELETED,
  DomainEvent.SERVICE_CREATED,
  DomainEvent.SERVICE_UPDATED,
  DomainEvent.SERVICE_DELETED,
  DomainEvent.TASK_CREATED,
  DomainEvent.TASK_UPDATED,
  DomainEvent.TASK_DELETED,
  DomainEvent.ROLE_CREATED,
  DomainEvent.ROLE_UPDATED,
  DomainEvent.ROLE_DELETED,
  DomainEvent.CUSTOM_COLUMN_DELETED,
  DomainEvent.CUSTOM_COLUMN_CREATED,
  DomainEvent.CUSTOM_COLUMN_UPDATED,
] as const;

export class WidgetRecalcEventListener extends DomainEventListener {
  readonly handlers: DomainEventHandlers;

  constructor(private backgroundTaskService: BackgroundTaskService) {
    super();

    const dispatch = async ({ companyId }: { companyId: string }) => {
      await this.backgroundTaskService.dispatch<typeof recalculateCompanyWidgets>(
        "recalculate-company-widgets",
        { companyId },
        {
          idempotencyKey: `recalculate-company-widgets:${companyId}`,
          idempotencyKeyTTL: "30s",
        },
      );
    };

    this.handlers = Object.fromEntries(WIDGET_MUTATION_EVENTS.map((event) => [event, dispatch])) as DomainEventHandlers;
  }
}
