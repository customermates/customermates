import type { z } from "zod";

import type { Resource } from "@/generated/prisma";
import type { UserService } from "@/features/user/user.service";

import { Action } from "@/generated/prisma";
import { validateAssigneeGuard } from "@/core/validation/validate-assignee-guard";

export type AssigneeEntry = { userIds: Parameters<typeof validateAssigneeGuard>[0]; path: (string | number)[] };

export class ValidateAssigneeGuardInteractor {
  constructor(private userService: UserService) {}
  async invoke(entries: AssigneeEntry[], resource: Resource, ctx: z.RefinementCtx) {
    const [user, canReadAll] = await Promise.all([
      this.userService.getActiveUserOrThrow(),
      this.userService.hasPermission(resource, Action.readAll),
    ]);
    for (const { userIds, path } of entries) validateAssigneeGuard(userIds, user.id, canReadAll, ctx, path);
  }
}
