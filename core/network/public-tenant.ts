import type { StoredUsers } from "@/core/decorators/background-tenant";
import type { EventVia } from "@/features/event/event-via";

import { runAsStoredUser } from "@/core/decorators/background-tenant";

export class PublicTenant {
  constructor(private users: StoredUsers) {}

  run<T, F>(
    userId: string,
    read: () => Promise<T>,
    unavailable: () => Promise<F>,
    via?: EventVia | null,
  ): Promise<T | F> {
    const attributed: StoredUsers = via
      ? { getActiveUserByIdOrThrow: async (id) => ({ ...(await this.users.getActiveUserByIdOrThrow(id)), via }) }
      : this.users;
    return runAsStoredUser(attributed, userId, read, unavailable);
  }
}
