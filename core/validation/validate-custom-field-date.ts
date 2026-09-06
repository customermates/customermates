import { z } from "zod";

import { isIsoDateTime } from "@/core/validation/iso-date-time";

import { CustomErrorCode } from "@/core/validation/validation.types";

export function validateCustomFieldDate(value: string | string[], ctx: z.RefinementCtx, basePath: (string | number)[]) {
  const values = Array.isArray(value) ? value : [value];
  const isArray = Array.isArray(value);

  for (let i = 0; i < values.length; i++) {
    const candidate = values[i];
    const dateOnlyOk = z.iso.date().safeParse(candidate).success;
    const datetimeOk = isIsoDateTime(candidate);
    if (dateOnlyOk || datetimeOk) continue;

    ctx.addIssue({
      code: "custom",
      params: { error: CustomErrorCode.customFieldInvalidDate },
      path: isArray ? [...basePath, i] : basePath,
    });
  }
}
