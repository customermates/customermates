import type { DomainEventMap, DomainEvent } from "./domain-events";

import { DomainEvent as DomainEventValue } from "./domain-events";
import type { DomainEventListener } from "./domain-event.listener";

import { AUDIT_LOG_EXCLUDED_EVENTS } from "./domain-events";
import type { CreateWebhookDeliveryRepo } from "@/features/webhook/create-webhook-delivery.repo";
import type { ChangeRecord } from "@/core/utils/calculate-changes";
import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { TriggerRoutinesRepo } from "@/ee/routines/trigger-routines.repo";

import { UserAccessor } from "@/core/base/user-accessor";
import { currentRoutineContext } from "@/core/decorators/routine-context";
import { carriesChangedFields, changedFieldsOf, matchesChangedFields } from "@/ee/routines/routine-event-filter";
import { WebhookEventSchema } from "@/features/webhook/webhook.schema";
import { env } from "@/env";

export abstract class GetWebhooksForEventRepo {
  abstract getWebhooksForEvent(event: string): Promise<{ url: string; events: string[] }[]>;
  abstract getWebhooksForEventUnscoped(event: string, companyId: string): Promise<{ url: string; events: string[] }[]>;
}

export abstract class CreateAuditLogRepo {
  abstract log(data: { event: string; eventData: Record<string, unknown>; entityId: string }): Promise<void>;
  abstract logUnscoped(data: {
    event: string;
    eventData: Record<string, unknown>;
    entityId: string;
    userId: string;
    companyId: string;
  }): Promise<void>;
}

type ScopedEventData<E extends DomainEvent> = Omit<DomainEventMap[E], "userId" | "companyId">;

export type PublishResult = {
  event: DomainEvent;
  skipped: "no-op-update" | null;
  listenerHandlers: number;
  webhookDeliveries: number;
  routineRuns: number;
};

function isNoOpUpdate(data: { payload: unknown }): boolean {
  const { payload } = data;
  if (typeof payload !== "object" || payload === null || !("changes" in payload)) return false;
  const { changes } = payload as { changes: ChangeRecord };
  return Object.keys(changes).length === 0;
}

export class EventService extends UserAccessor {
  constructor(
    private readonly eventListeners: DomainEventListener[],
    private webhookRepo: GetWebhooksForEventRepo,
    private webhookDeliveryRepo: CreateWebhookDeliveryRepo,
    private auditLogRepo: CreateAuditLogRepo,
    private backgroundTaskService: BackgroundTaskService,
    private routineRepo: TriggerRoutinesRepo,
  ) {
    super();
  }

  async publish<E extends DomainEvent>(
    event: E,
    data: ScopedEventData<E>,
    opts?: { systemCompanyId?: string; systemUserId?: string },
  ): Promise<PublishResult> {
    if (isNoOpUpdate(data)) {
      return this.logAndReturn({
        event,
        skipped: "no-op-update",
        listenerHandlers: 0,
        webhookDeliveries: 0,
        routineRuns: 0,
      });
    }

    const system = opts?.systemCompanyId !== undefined;
    const companyId = opts?.systemCompanyId ?? this.user.companyId;
    const userId = system ? (opts?.systemUserId ?? null) : this.user.id;
    const eventData = { ...data, userId, companyId } as DomainEventMap[E];
    const matchingListeners = system ? [] : this.eventListeners.filter((l) => l.handles(event));

    const [, , webhookDeliveries, routineRuns] = await Promise.all([
      Promise.all(matchingListeners.map((listener) => listener.handle(event, eventData))),
      this.createAuditLog(event, eventData, system),
      this.createWebhookDeliveries(event, eventData, companyId, system),
      this.createRoutineRuns(event, eventData, companyId),
      this.pruneRoutineFilters(event, eventData, companyId),
    ]);

    return this.logAndReturn({
      event,
      skipped: null,
      listenerHandlers: matchingListeners.length,
      webhookDeliveries,
      routineRuns,
    });
  }

  private logAndReturn(result: PublishResult): PublishResult {
    if (env.NODE_ENV !== "production") {
      const { event, skipped, listenerHandlers, webhookDeliveries, routineRuns } = result;
      const suffix = skipped
        ? ` skipped=${skipped}`
        : ` listeners=${listenerHandlers} webhooks=${webhookDeliveries} routines=${routineRuns}`;
      // eslint-disable-next-line no-console
      console.log(`[event] ${event}${suffix}`);
    }
    return result;
  }

  private async createAuditLog(event: DomainEvent, payload: DomainEventMap[DomainEvent], system: boolean) {
    if (AUDIT_LOG_EXCLUDED_EVENTS.has(event) || payload.userId === null) return;

    if (system) {
      await this.auditLogRepo.logUnscoped({
        event,
        eventData: payload as Record<string, unknown>,
        entityId: payload.entityId,
        userId: payload.userId,
        companyId: payload.companyId,
      });
      return;
    }

    await this.auditLogRepo.log({
      event,
      eventData: payload as Record<string, unknown>,
      entityId: payload.entityId,
    });
  }

  private async pruneRoutineFilters(
    event: DomainEvent,
    payload: DomainEventMap[DomainEvent],
    companyId: string,
  ): Promise<void> {
    if (event !== DomainEventValue.CUSTOM_COLUMN_DELETED || !payload.entityId) return;

    await this.routineRepo.pruneRoutineFiltersForFieldUnscoped(companyId, payload.entityId);
  }

  private async createRoutineRuns(
    event: DomainEvent,
    payload: DomainEventMap[DomainEvent],
    companyId: string,
  ): Promise<number> {
    if (!WebhookEventSchema.options.some((option) => option === event)) return 0;

    const subscribed = await this.routineRepo.findEventRoutinesUnscoped(companyId, event);
    if (subscribed.length === 0) return 0;

    if (currentRoutineContext()) {
      await this.routineRepo.countSuppressedRoutineEventsUnscoped(subscribed.map((routine) => routine.id));
      return 0;
    }

    const changed = changedFieldsOf(payload);
    const routines = carriesChangedFields(payload)
      ? subscribed.filter((routine) => matchesChangedFields(routine.changedFields, changed))
      : subscribed;
    if (routines.length === 0) return 0;

    const admitted = await this.routineRepo.admitEventRoutineRunsUnscoped({
      companyId,
      event,
      entityId: payload.entityId,
      triggerPayload: payload,
      routineIds: routines.map((routine) => routine.id),
      now: new Date(),
    });

    await Promise.all(
      admitted.map((run) =>
        this.backgroundTaskService.dispatch("run-routine", {
          routineRunId: run.id,
          companyId,
          ownerUserId: run.ownerUserId,
        }),
      ),
    );

    return admitted.length;
  }

  private async createWebhookDeliveries(
    event: DomainEvent,
    payload: DomainEventMap[DomainEvent],
    companyId: string,
    system: boolean,
  ): Promise<number> {
    if (!WebhookEventSchema.options.some((option) => option === event)) return 0;

    const webhooks = system
      ? await this.webhookRepo.getWebhooksForEventUnscoped(event, companyId)
      : await this.webhookRepo.getWebhooksForEvent(event);

    if (webhooks.length === 0) return 0;

    const body = {
      event,
      data: payload,
      timestamp: new Date().toISOString(),
    };

    const data = webhooks.map((webhook) => ({
      url: webhook.url,
      event,
      requestBody: body as Record<string, unknown>,
    }));

    const ids = system
      ? await this.webhookDeliveryRepo.createUnscoped(companyId, data)
      : await this.webhookDeliveryRepo.create(data);

    await Promise.all(
      ids.map((deliveryId, idx) =>
        this.backgroundTaskService.dispatch("deliver-webhook", {
          deliveryId,
          url: webhooks[idx].url,
          companyId,
          requestBody: body as Record<string, unknown>,
        }),
      ),
    );

    return webhooks.length;
  }
}
