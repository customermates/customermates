import { z } from "zod";

import { CustomErrorCode } from "@/core/validation/validation.types";

export function validateCustomFieldEmail(
  value: string | string[],
  ctx: z.RefinementCtx,
  basePath: (string | number)[],
  allowMultiple?: boolean,
) {
  const values = Array.isArray(value) ? value : allowMultiple ? value.split(",").map((e) => e.trim()) : [value.trim()];
  const isArray = Array.isArray(value) || (allowMultiple && values.length > 1);

  for (let i = 0; i < values.length; i++) {
    const emailResult = z.email().safeParse(values[i]);
    if (!emailResult.success) {
      ctx.addIssue({
        code: "custom",
        params: { error: CustomErrorCode.customFieldInvalidEmail },
        path: isArray ? [...basePath, i] : basePath,
      });
    }
  }
}
