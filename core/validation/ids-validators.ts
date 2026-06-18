import type { z } from "zod";

import { CustomErrorCode } from "@/core/validation/validation.types";

export function makeIdsValidator(errorCode: CustomErrorCode) {
  return function validateIds(
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
          params: { error: errorCode },
          path: isArray ? [...basePath, i] : basePath,
        });
      }
    }
  };
}

export const validateContactIds = makeIdsValidator(CustomErrorCode.contactNotFound);
export const validateDealIds = makeIdsValidator(CustomErrorCode.dealNotFound);
export const validateOrganizationIds = makeIdsValidator(CustomErrorCode.organizationNotFound);
export const validateServiceIds = makeIdsValidator(CustomErrorCode.serviceNotFound);
export const validateTaskIds = makeIdsValidator(CustomErrorCode.taskNotFound);
export const validateUserIds = makeIdsValidator(CustomErrorCode.userNotFound);

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

export function validateSystemTaskName(
  task: { id: string; name?: string },
  systemTaskIds: Set<string>,
  ctx: z.RefinementCtx,
  basePath: (string | number)[],
) {
  if (task.name === undefined) return;
  if (!systemTaskIds.has(task.id)) return;

  ctx.addIssue({
    code: "custom",
    params: { error: CustomErrorCode.taskNameCannotBeChangedForSystemTasks },
    path: [...basePath, "name"],
  });
}
