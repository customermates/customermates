import type { z } from "zod";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { secureUrlSchema } from "@/core/validation/validation.utils";

export function validateCustomFieldLink(
  value: string | string[],
  ctx: z.RefinementCtx,
  basePath: (string | number)[],
  allowMultiple?: boolean,
) {
  const values = Array.isArray(value) ? value : allowMultiple ? value.split(",").map((u) => u.trim()) : [value.trim()];
  const isArray = Array.isArray(value) || (allowMultiple && values.length > 1);

  for (let i = 0; i < values.length; i++) {
    const urlResult = secureUrlSchema().safeParse(values[i]);
    if (!urlResult.success) {
      ctx.addIssue({
        code: "custom",
        params: { error: CustomErrorCode.customFieldInvalidUrl },
        path: isArray ? [...basePath, i] : basePath,
      });
    }
  }
}
