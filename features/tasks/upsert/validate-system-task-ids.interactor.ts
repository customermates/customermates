import type { z } from "zod";

import type { FindTasksByIdsRepo } from "../find-tasks-by-ids.repo";

import { CustomErrorCode } from "@/core/validation/validation.types";

export type SystemTaskIdEntry = { ids: string | string[]; path: (string | number)[] };

export class ValidateSystemTaskIdsInteractor {
  constructor(private repo: FindTasksByIdsRepo) {}

  async invoke(entries: SystemTaskIdEntry[], ctx: z.RefinementCtx) {
    const all = new Set<string>();
    for (const { ids } of entries) {
      if (Array.isArray(ids)) ids.forEach((id) => all.add(id));
      else all.add(ids);
    }

    const systemTaskIds = await this.repo.findSystemTaskIds(all);
    for (const { ids, path } of entries) {
      const isArray = Array.isArray(ids);
      const list = isArray ? ids : [ids];
      for (let i = 0; i < list.length; i++) {
        if (systemTaskIds.has(list[i])) {
          ctx.addIssue({
            code: "custom",
            params: { error: CustomErrorCode.taskOnlyCustomTasksCanBeDeleted },
            path: isArray ? [...path, i] : path,
          });
        }
      }
    }
  }
}
