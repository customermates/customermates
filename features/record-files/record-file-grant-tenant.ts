import type { TenantUser } from "@/features/user/user.schema";
import type { InteractorOutcome } from "@/core/validation/validation.utils";
import type { RecordFileGrantPurpose } from "./record-file-grant";
import type { RecordFileLinks } from "./record-file-links";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { fail } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

export type RecordFileGrantUsers = { getActiveUserByIdOrThrow(userId: string): Promise<TenantUser> };

export class RecordFileGrantTenant {
  constructor(
    private links: RecordFileLinks,
    private users: RecordFileGrantUsers,
  ) {}

  async run<T>(
    purpose: RecordFileGrantPurpose,
    fileId: string,
    token: string,
    fn: () => Promise<InteractorOutcome<T>>,
  ): Promise<InteractorOutcome<T>> {
    const grant = this.links.verify(purpose, fileId, token);
    if (grant.status !== "valid") return fail(CustomErrorCode.recordFileLinkInvalid, ["token"]);
    const user = await this.users.getActiveUserByIdOrThrow(grant.userId).catch(() => null);
    if (!user) return fail(CustomErrorCode.recordFileLinkInvalid, ["token"]);
    return runWithTenant(user, fn);
  }
}
