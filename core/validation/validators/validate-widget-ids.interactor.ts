import type { z } from "zod";

import type { FindWidgetsByIdsRepo } from "@/features/widget/find-widgets-by-ids.repo";
import type { IdEntry } from "./check-ids";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { checkIds } from "./check-ids";

export class ValidateWidgetIdsInteractor {
  constructor(private repo: FindWidgetsByIdsRepo) {}
  invoke(entries: IdEntry[], ctx: z.RefinementCtx) {
    return checkIds(entries, ctx, (ids) => this.repo.findIds(ids), CustomErrorCode.widgetNotFound);
  }
}
