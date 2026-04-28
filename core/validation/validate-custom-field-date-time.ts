import { z } from "zod";

import { CustomErrorCode } from "@/core/validation/validation.types";

export function validateCustomFieldDateTime(
  value: string | string[],
  ctx: z.RefinementCtx,
  basePath: (string | number)[],
) {
  const values = Array.isArray(value) ? value : [value];
  const isArray = Array.isArray(value);

  for (let i = 0; i < values.length; i++) {
    const datetimeOk = z.iso.datetime().safeParse(values[i]).success;
    if (datetimeOk) continue;

    ctx.addIssue({
      code: "custom",
      params: { error: CustomErrorCode.customFieldInvalidDateTime },
      path: isArray ? [...basePath, i] : basePath,
    });
  }
}
