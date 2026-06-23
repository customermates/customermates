import type { z } from "zod";

import type { FindTasksByIdsRepo } from "../find-tasks-by-ids.repo";

import { CustomErrorCode } from "@/core/validation/validation.types";

export type SystemTaskNameEntry = { task: { id: string; name?: string }; path: (string | number)[] };

export class ValidateSystemTaskNameInteractor {
  constructor(private repo: FindTasksByIdsRepo) {}

  async invoke(entries: SystemTaskNameEntry[], ctx: z.RefinementCtx) {
    const all = new Set<string>();
    for (const { task } of entries) all.add(task.id);

    const systemTaskIds = await this.repo.findSystemTaskIds(all);
    for (const { task, path } of entries) {
      if (task.name === undefined) continue;
      if (!systemTaskIds.has(task.id)) continue;

      ctx.addIssue({
        code: "custom",
        params: { error: CustomErrorCode.taskNameCannotBeChangedForSystemTasks },
        path: [...path, "name"],
      });
    }
  }
}
