import type { z } from "zod";

import { CustomErrorCode } from "@/core/validation/validation.types";

export function validateAssigneeGuard(
  userIds: string[] | null | undefined,
  currentUserId: string,
  canReadAll: boolean,
  ctx: z.RefinementCtx,
  basePath: (string | number)[],
) {
  if (userIds === undefined) return;
  if (canReadAll) return;
  if (userIds?.includes(currentUserId)) return;

  ctx.addIssue({
    code: "custom",
    params: { error: CustomErrorCode.assigneeRequired },
    path: basePath,
  });
}
