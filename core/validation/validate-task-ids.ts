import type { z } from "zod";

import { CustomErrorCode } from "@/core/validation/validation.types";

export { FindTasksByIdsRepo } from "../../features/tasks/find-tasks-by-ids.repo";

export function validateTaskIds(
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
        params: { error: CustomErrorCode.taskNotFound },
        path: isArray ? [...basePath, i] : basePath,
      });
    }
  }
}

export function validateSystemTaskIds(
  source: string | string[] | null | undefined,
  systemTaskIds: Set<string>,
  ctx: z.RefinementCtx,
  basePath: (string | number)[],
) {
  if (source === undefined || source === null) return;

  const isArray = Array.isArray(source);
  const ids = isArray ? source : [source];
  if (ids.length === 0) return;

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (systemTaskIds.has(id)) {
      ctx.addIssue({
        code: "custom",
        params: { error: CustomErrorCode.taskOnlyCustomTasksCanBeDeleted },
        path: isArray ? [...basePath, i] : basePath,
      });
    }
  }
}
