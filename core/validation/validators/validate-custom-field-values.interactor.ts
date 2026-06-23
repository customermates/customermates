import type { z } from "zod";

import type { EntityType } from "@/generated/prisma";
import type { FindCustomColumnRepo } from "@/features/custom-column/find-custom-column.repo";

import { validateCustomFieldValues } from "@/core/validation/validate-custom-field-values";

export type CustomFieldEntry = { values: Parameters<typeof validateCustomFieldValues>[0]; path: (string | number)[] };

export class ValidateCustomFieldValuesInteractor {
  constructor(private repo: FindCustomColumnRepo) {}
  async invoke(entries: CustomFieldEntry[], entityType: EntityType, ctx: z.RefinementCtx) {
    const columns = await this.repo.findByEntityType(entityType);
    for (const { values, path } of entries) validateCustomFieldValues(values, columns, ctx, path);
  }
}
