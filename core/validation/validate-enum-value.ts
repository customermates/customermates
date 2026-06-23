import type { z } from "zod";

import { CustomErrorCode } from "@/core/validation/validation.types";

export function validateEnumValue(
  value: string | string[],
  allowed: readonly string[],
  ctx: z.RefinementCtx,
  fieldPath: (string | number)[],
) {
  const values = Array.isArray(value) ? value : [value];
  for (let i = 0; i < values.length; i++) {
    if (!allowed.includes(values[i])) {
      ctx.addIssue({
        code: "custom",
        params: { error: CustomErrorCode.invalidFilterValue },
        path: Array.isArray(value) ? [...fieldPath, i] : fieldPath,
      });
    }
  }
}
