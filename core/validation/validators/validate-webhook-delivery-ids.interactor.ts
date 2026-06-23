import type { z } from "zod";

import type { FindWebhookDeliveriesByIdsRepo } from "@/features/webhook/find-webhook-deliveries-by-ids.repo";
import type { IdEntry } from "./check-ids";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { checkIds } from "./check-ids";

export class ValidateWebhookDeliveryIdsInteractor {
  constructor(private repo: FindWebhookDeliveriesByIdsRepo) {}
  invoke(entries: IdEntry[], ctx: z.RefinementCtx) {
    return checkIds(entries, ctx, (ids) => this.repo.findIds(ids), CustomErrorCode.webhookDeliveryNotFound);
  }
}
