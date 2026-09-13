import type { z } from "zod";

import { isIsoDateTime } from "@/core/validation/iso-date-time";

import { CustomErrorCode } from "@/core/validation/validation.types";

export function validateDate(value: string | string[], ctx: z.RefinementCtx, fieldPath: (string | number)[]) {
  const dates = Array.isArray(value) ? value : [value];
  for (let i = 0; i < dates.length; i++) {
    if (!isIsoDateTime(dates[i])) {
      ctx.addIssue({
        code: "custom",
        params: { error: CustomErrorCode.customFieldInvalidDate },
        path: Array.isArray(value) ? [...fieldPath, i] : fieldPath,
      });
    }
  }
}
