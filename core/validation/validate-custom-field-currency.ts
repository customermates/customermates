import { z } from "zod";

import { CustomErrorCode } from "@/core/validation/validation.types";

export function validateCustomFieldCurrency(
  value: string | string[],
  ctx: z.RefinementCtx,
  basePath: (string | number)[],
) {
  const values = Array.isArray(value) ? value : [value];
  const isArray = Array.isArray(value);

  for (let i = 0; i < values.length; i++) {
    const numberResult = z.coerce.number().safeParse(values[i]);
    if (!numberResult.success) {
      ctx.addIssue({
        code: "custom",
        params: { error: CustomErrorCode.customFieldInvalidCurrency },
        path: isArray ? [...basePath, i] : basePath,
      });
    }
  }
}
