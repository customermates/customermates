import type { StoredUsers } from "@/core/decorators/background-tenant";
import type { InteractorOutcome } from "@/core/validation/validation.utils";
import type { RecordFileGrantPurpose } from "./record-file-grant";
import type { RecordFileLinks } from "./record-file-links";

import { runAsStoredUser } from "@/core/decorators/background-tenant";
import { fail } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

export class RecordFileGrantTenant {
  constructor(
    private links: RecordFileLinks,
    private users: StoredUsers,
  ) {}

  async run<T>(
    purpose: RecordFileGrantPurpose,
    fileId: string,
    token: string,
    fn: () => Promise<InteractorOutcome<T>>,
  ): Promise<InteractorOutcome<T>> {
    const grant = this.links.verify(purpose, fileId, token);
    if (grant.status !== "valid") return fail(CustomErrorCode.recordFileLinkInvalid, ["token"]);
    return runAsStoredUser(this.users, grant.userId, fn, () => fail(CustomErrorCode.recordFileLinkInvalid, ["token"]));
  }
}
