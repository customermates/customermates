import type { z } from "zod";

import { CustomErrorCode } from "@/core/validation/validation.types";

export { FindOrganizationsByIdsRepo } from "../../features/organizations/find-organizations-by-ids.repo";

export function validateOrganizationIds(
  source: string | string[] | null | undefined,
  validIds: Set<string>,
  ctx: z.RefinementCtx,
  basePath: (string | number)[],
) {
  if (source === undefined || source === null) return;

  const isArray = Array.isArray(source);
  const ids = isArray ? source : [source];
  if (ids.length === 0) return;

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (!validIds.has(id)) {
      ctx.addIssue({
        code: "custom",
        params: { error: CustomErrorCode.organizationNotFound },
        path: isArray ? [...basePath, i] : basePath,
      });
    }
  }
}
