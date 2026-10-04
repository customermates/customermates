import type { EventService } from "@/features/event/event.service";
import type { TenantUser } from "@/features/user/user.schema";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { DomainEvent } from "@/features/event/domain-events";

export function publishUserDeactivated(eventService: EventService, user: TenantUser) {
  return runWithTenant(user, () =>
    eventService.publish(DomainEvent.USER_UPDATED, {
      entityId: user.id,
      payload: {
        firstName: user.firstName,
        lastName: user.lastName,
        country: user.country,
        status: user.status,
        avatarUrl: user.avatarUrl,
        roleId: user.roleId ?? undefined,
      },
    }),
  );
}
