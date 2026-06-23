import type { z } from "zod";

import type { FindTasksByIdsRepo } from "@/features/tasks/find-tasks-by-ids.repo";
import type { IdEntry } from "./check-ids";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { checkIds } from "./check-ids";

export class ValidateTaskIdsInteractor {
  constructor(private repo: FindTasksByIdsRepo) {}
  invoke(entries: IdEntry[], ctx: z.RefinementCtx) {
    return checkIds(entries, ctx, (ids) => this.repo.findIds(ids), CustomErrorCode.taskNotFound);
  }
}
