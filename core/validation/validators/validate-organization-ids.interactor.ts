import type { z } from "zod";

import type { FindOrganizationsByIdsRepo } from "@/features/organizations/find-organizations-by-ids.repo";
import type { IdEntry } from "./check-ids";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { checkIds } from "./check-ids";

export class ValidateOrganizationIdsInteractor {
  constructor(private repo: FindOrganizationsByIdsRepo) {}
  invoke(entries: IdEntry[], ctx: z.RefinementCtx) {
    return checkIds(entries, ctx, (ids) => this.repo.findIds(ids), CustomErrorCode.organizationNotFound);
  }
}
