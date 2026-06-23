import type { z } from "zod";

import type { FindThreadsByIdsRepo } from "@/ee/messaging/find-threads-by-ids.repo";
import type { IdEntry } from "./check-ids";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { checkIds } from "./check-ids";

export class ValidateThreadIdsInteractor {
  constructor(private repo: FindThreadsByIdsRepo) {}
  invoke(entries: IdEntry[], ctx: z.RefinementCtx) {
    return checkIds(entries, ctx, (ids) => this.repo.findThreadIds(ids), CustomErrorCode.threadNotFound);
  }
}
