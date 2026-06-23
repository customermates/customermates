import type { z } from "zod";

import type { FindWebhooksByIdsRepo } from "@/features/webhook/find-webhooks-by-ids.repo";
import type { IdEntry } from "./check-ids";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { checkIds } from "./check-ids";

export class ValidateWebhookIdsInteractor {
  constructor(private repo: FindWebhooksByIdsRepo) {}
  invoke(entries: IdEntry[], ctx: z.RefinementCtx) {
    return checkIds(entries, ctx, (ids) => this.repo.findIds(ids), CustomErrorCode.webhookNotFound);
  }
}
