import { z } from "zod";

import { CustomErrorCode } from "@/core/validation/validation.types";

export function validateCustomFieldPhone(
  value: string | string[],
  ctx: z.RefinementCtx,
  basePath: (string | number)[],
  allowMultiple?: boolean,
) {
  const values = Array.isArray(value) ? value : allowMultiple ? value.split(",").map((p) => p.trim()) : [value.trim()];
  const isArray = Array.isArray(value) || (allowMultiple && values.length > 1);

  for (let i = 0; i < values.length; i++) {
    const phoneResult = z.e164().safeParse(values[i]);
    if (!phoneResult.success) {
      ctx.addIssue({
        code: "custom",
        params: { error: CustomErrorCode.customFieldInvalidPhone },
        path: isArray ? [...basePath, i] : basePath,
      });
    }
  }
}
