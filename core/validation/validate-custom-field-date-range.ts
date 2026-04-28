import { z } from "zod";

import { CustomErrorCode } from "@/core/validation/validation.types";

export function validateCustomFieldDateRange(value: string, ctx: z.RefinementCtx, basePath: (string | number)[]) {
  const parts = value.split(",").map((p) => p.trim());

  if (parts.length !== 2 || parts.some((p) => p.length === 0)) {
    ctx.addIssue({
      code: "custom",
      params: { error: CustomErrorCode.customFieldInvalidDateRange },
      path: basePath,
    });
    return;
  }

  for (const part of parts) {
    const dateOnlyOk = z.iso.date().safeParse(part).success;
    const datetimeOk = z.iso.datetime().safeParse(part).success;
    if (dateOnlyOk || datetimeOk) continue;

    ctx.addIssue({
      code: "custom",
      params: { error: CustomErrorCode.customFieldInvalidDateRange },
      path: basePath,
    });
    return;
  }

  if (new Date(parts[0]).getTime() > new Date(parts[1]).getTime()) {
    ctx.addIssue({
      code: "custom",
      params: { error: CustomErrorCode.customFieldInvalidDateRange },
      path: basePath,
    });
  }
}
