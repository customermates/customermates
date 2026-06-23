import type { z } from "zod";

import type { FindCustomColumnsByIdsRepo } from "@/features/custom-column/find-custom-columns-by-ids.repo";
import type { IdEntry } from "./check-ids";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { checkIds } from "./check-ids";

export class ValidateCustomColumnIdsInteractor {
  constructor(private repo: FindCustomColumnsByIdsRepo) {}
  invoke(entries: IdEntry[], ctx: z.RefinementCtx) {
    return checkIds(entries, ctx, (ids) => this.repo.findIds(ids), CustomErrorCode.customColumnIdNotFound);
  }
}
