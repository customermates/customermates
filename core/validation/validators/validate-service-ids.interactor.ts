import type { z } from "zod";

import type { FindServicesByIdsRepo } from "@/features/services/find-services-by-ids.repo";
import type { IdEntry } from "./check-ids";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { checkIds } from "./check-ids";

export class ValidateServiceIdsInteractor {
  constructor(private repo: FindServicesByIdsRepo) {}
  invoke(entries: IdEntry[], ctx: z.RefinementCtx) {
    return checkIds(entries, ctx, (ids) => this.repo.findIds(ids), CustomErrorCode.serviceNotFound);
  }
}
