import type { StoredUsers } from "@/core/decorators/background-tenant";

import { runAsStoredUser } from "@/core/decorators/background-tenant";

export class PublicLinkTenant {
  constructor(private users: StoredUsers) {}

  run<T, F>(creatorId: string, read: () => Promise<T>, unavailable: () => Promise<F>): Promise<T | F> {
    return runAsStoredUser(this.users, creatorId, read, unavailable);
  }
}
