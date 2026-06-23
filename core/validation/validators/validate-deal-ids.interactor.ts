import type { z } from "zod";

import type { FindDealsByIdsRepo } from "@/features/deals/find-deals-by-ids.repo";
import type { IdEntry } from "./check-ids";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { checkIds } from "./check-ids";

export class ValidateDealIdsInteractor {
  constructor(private repo: FindDealsByIdsRepo) {}
  invoke(entries: IdEntry[], ctx: z.RefinementCtx) {
    return checkIds(entries, ctx, (ids) => this.repo.findIds(ids), CustomErrorCode.dealNotFound);
  }
}
