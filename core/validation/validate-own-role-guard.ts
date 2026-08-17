import type { z } from "zod";

import { CustomErrorCode } from "@/core/validation/validation.types";

export function validateOwnRoleGuard(
  roleId: string | null | undefined,
  currentRoleId: string | null | undefined,
  ctx: z.RefinementCtx,
  basePath: (string | number)[],
) {
  if (!roleId) return;
  if (!currentRoleId) return;
  if (roleId !== currentRoleId) return;

  ctx.addIssue({
    code: "custom",
    params: { error: CustomErrorCode.roleSelfEditForbidden },
    path: basePath,
  });
}
