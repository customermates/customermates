import type { z } from "zod";

import type { FindConnectedAccountsByIdsRepo } from "@/ee/messaging/find-connected-accounts-by-ids.repo";
import type { IdEntry } from "./check-ids";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { checkIds } from "./check-ids";

export class ValidateConnectedAccountIdsInteractor {
  constructor(private repo: FindConnectedAccountsByIdsRepo) {}
  invoke(entries: IdEntry[], ctx: z.RefinementCtx) {
    return checkIds(entries, ctx, (ids) => this.repo.findIds(ids), CustomErrorCode.connectedAccountNotFound);
  }
}
