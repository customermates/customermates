import { DomainEvent, DomainEventMap } from "@/features/event/domain-events";
import { TenantScoped } from "@/core/decorators/tenant-scoped.decorator";

export abstract class AuditLogRepo {
  abstract log(entry: { event: DomainEvent; payload: DomainEventMap[DomainEvent] }): Promise<void>;
}

@TenantScoped
export class AuditLogService {
  constructor(private repo: AuditLogRepo) {}

  async handle(event: DomainEvent, payload: DomainEventMap[DomainEvent]): Promise<void> {
    await this.repo.log({ event, payload });
  }
}
