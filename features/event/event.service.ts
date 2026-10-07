import type { DomainEventMap, DomainEvent } from "./domain-events";
import type { DomainEventListener } from "./domain-event.listener";
import type { EventLogRepo } from "./event-log.repo";
import type { ChangeRecord } from "@/core/utils/calculate-changes";

import { UserAccessor } from "@/core/base/user-accessor";
import { WebhookCurrentEventSchema } from "@/features/webhook/webhook.schema";
import { env } from "@/env";

type ScopedEventData<E extends DomainEvent> = Omit<DomainEventMap[E], "userId" | "companyId">;

function isNoOpUpdate(data: { payload: unknown }): boolean {
  const { payload } = data;
  if (typeof payload !== "object" || payload === null || !("changes" in payload)) return false;
  const { changes } = payload as { changes: ChangeRecord };
  return Object.keys(changes).length === 0;
}

export class EventService extends UserAccessor {
  constructor(
    private readonly eventListeners: DomainEventListener[],
    private readonly eventLog: EventLogRepo,
  ) {
    super();
  }

  async publish<E extends DomainEvent>(
    event: E,
    data: ScopedEventData<E>,
    opts?: { systemCompanyId?: string; systemUserId?: string },
  ): Promise<void> {
    if (isNoOpUpdate(data)) return this.trace(event, "skipped=no-op-update");

    const system = opts?.systemCompanyId !== undefined;
    const companyId = opts?.systemCompanyId ?? this.user.companyId;
    const userId = system ? (opts?.systemUserId ?? null) : this.user.id;
    const eventData = { ...data, userId, companyId } as DomainEventMap[E];
    const matchingListeners = system ? [] : this.eventListeners.filter((l) => l.handles(event));

    const [, logged] = await Promise.all([
      Promise.all(matchingListeners.map((listener) => listener.handle(event, eventData))),
      this.log(event, eventData),
    ]);

    this.trace(event, `listeners=${matchingListeners.length} logged=${logged}`);
  }

  private async log(event: DomainEvent, data: DomainEventMap[DomainEvent]): Promise<boolean> {
    const subscribable = WebhookCurrentEventSchema.options.some((option) => option === event);
    if (subscribable && !(await this.eventLog.hasSubscribersUnscoped(data.companyId, event))) return false;
    await this.eventLog.appendUnscoped(data.companyId, {
      kind: event,
      subjectId: data.entityId,
      actorId: data.userId,
      payload: data.payload,
      delivered: !subscribable,
    });
    return true;
  }

  private trace(event: DomainEvent, detail: string) {
    // eslint-disable-next-line no-console
    if (env.NODE_ENV !== "production") console.log(`[event] ${event} ${detail}`);
  }
}
