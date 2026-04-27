import type { RootStore } from "@/core/stores/root.store";
import type { AuditLogDto } from "@/ee/audit-log/get/get-audit-logs-by-entity-id.interactor";

import { Resource } from "@/generated/prisma";

import { DomainEvent } from "@/features/event/domain-events";
import { BaseModalStore } from "@/core/base/base-modal.store";

export class AuditLogModalStore extends BaseModalStore<AuditLogDto> {
  constructor(public readonly rootStore: RootStore) {
    super(
      rootStore,
      {
        id: "",
        event: DomainEvent.CONTACT_CREATED,
        eventData: {
          userId: "",
          companyId: "",
          entityId: "",
          payload: {
            id: "",
            firstName: "",
            lastName: "",
            emails: [],
            createdAt: new Date(),
            updatedAt: new Date(),
            organizations: [],
            users: [],
            deals: [],
            customFieldValues: [],
          },
        } as AuditLogDto["eventData"],
        createdAt: new Date(),
        user: {
          id: "",
          firstName: "",
          lastName: "",
          avatarUrl: null,
          email: "",
        },
        entityId: "",
      },
      Resource.auditLog,
    );
  }
}
