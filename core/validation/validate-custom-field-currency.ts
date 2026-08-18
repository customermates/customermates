import type { z } from "zod";

import { isCanonicalFilterNumber } from "@/core/base/filter-value";
import { CustomErrorCode } from "@/core/validation/validation.types";

export function validateCustomFieldCurrency(
  value: string | string[],
  ctx: z.RefinementCtx,
  basePath: (string | number)[],
) {
  const values = Array.isArray(value) ? value : [value];
  const isArray = Array.isArray(value);

  for (let i = 0; i < values.length; i++) {
    const candidate = values[i];
    const isCanonical = typeof candidate === "string" && isCanonicalFilterNumber(candidate.trim());

    if (!isCanonical) {
      ctx.addIssue({
        code: "custom",
        params: { error: CustomErrorCode.customFieldInvalidCurrency },
        path: isArray ? [...basePath, i] : basePath,
      });
    }
  }
}
