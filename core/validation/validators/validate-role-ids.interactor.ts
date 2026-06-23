import type { z } from "zod";

import type { FindRolesByIdsRepo } from "@/features/role/find-roles-by-ids.repo";
import type { IdEntry } from "./check-ids";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { checkIds } from "./check-ids";

export class ValidateRoleIdsInteractor {
  constructor(private repo: FindRolesByIdsRepo) {}
  invoke(entries: IdEntry[], ctx: z.RefinementCtx) {
    return checkIds(entries, ctx, (ids) => this.repo.findIds(ids), CustomErrorCode.roleNotFound);
  }
}
