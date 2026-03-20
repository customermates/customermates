import { DomainEvent, DomainEventMap } from "./domain-events";
import { EventBusWorker } from "./event-bus.worker";

import { TenantScoped } from "@/core/decorators/tenant-scoped.decorator";
import { UserAccessor } from "@/core/base/user-accessor";

type ScopedEventData<E extends DomainEvent> = Omit<DomainEventMap[E], "userId" | "companyId">;

@TenantScoped
export class EventService extends UserAccessor {
  async publish<E extends DomainEvent>(event: E, data: ScopedEventData<E>): Promise<void> {
    const { id: userId, companyId } = this.user;
    const eventData = { ...(data as object), userId, companyId } as DomainEventMap[E];
    const { di } = await import("@/core/dependency-injection/container");
    await di.get(EventBusWorker).dispatch(event, eventData);
  }
}
