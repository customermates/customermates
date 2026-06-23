import type { z } from "zod";

import type { FindContactsByIdsRepo } from "@/features/contacts/find-contacts-by-ids.repo";
import type { IdEntry } from "./check-ids";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { checkIds } from "./check-ids";

export class ValidateContactIdsInteractor {
  constructor(private repo: FindContactsByIdsRepo) {}
  invoke(entries: IdEntry[], ctx: z.RefinementCtx) {
    return checkIds(entries, ctx, (ids) => this.repo.findIds(ids), CustomErrorCode.contactNotFound);
  }
}
