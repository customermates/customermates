import type { StoredUsers } from "@/core/decorators/background-tenant";
import type { EventVia } from "@/features/event/event-via";

import { runAsStoredUser } from "@/core/decorators/background-tenant";

export class PublicFormTenant {
  constructor(private users: StoredUsers) {}

  run<T, F>(
    creatorId: string,
    via: EventVia | null,
    read: () => Promise<T>,
    unavailable: () => Promise<F>,
  ): Promise<T | F> {
    const attributed: StoredUsers = {
      getActiveUserByIdOrThrow: async (userId) => ({ ...(await this.users.getActiveUserByIdOrThrow(userId)), via }),
    };
    return runAsStoredUser(attributed, creatorId, read, unavailable);
  }
}
