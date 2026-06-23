import type { z } from "zod";

import type { FindUsersByIdsRepo } from "@/features/user/find-users-by-ids.repo";
import type { IdEntry } from "./check-ids";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { checkIds } from "./check-ids";

export class ValidateUserIdsInteractor {
  constructor(private repo: FindUsersByIdsRepo) {}
  invoke(entries: IdEntry[], ctx: z.RefinementCtx) {
    return checkIds(entries, ctx, (ids) => this.repo.findIds(ids), CustomErrorCode.userNotFound);
  }
}
