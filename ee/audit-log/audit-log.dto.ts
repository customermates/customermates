import type { DomainEvent, DomainEventMap } from "@/features/event/domain-events";
import type { Data } from "@/core/validation/validation.utils";
import type { UserReferenceSchema } from "@/core/base/base-entity.schema";

export type AuditLogDto = {
  id: string;
  event: DomainEvent;
  eventData: DomainEventMap[DomainEvent];
  createdAt: Date;
  user: Data<typeof UserReferenceSchema>;
  entityId: string;
};
