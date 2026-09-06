import type { z } from "zod";

import { isIsoDateTime } from "@/core/validation/iso-date-time";

import { CustomErrorCode } from "@/core/validation/validation.types";

export function validateCustomFieldDateTimeRange(value: string, ctx: z.RefinementCtx, basePath: (string | number)[]) {
  const parts = value.split(",").map((p) => p.trim());

  if (parts.length !== 2 || parts.some((p) => p.length === 0)) {
    ctx.addIssue({
      code: "custom",
      params: { error: CustomErrorCode.customFieldInvalidDateTimeRange },
      path: basePath,
    });
    return;
  }

  for (const part of parts) {
    if (!isIsoDateTime(part)) {
      ctx.addIssue({
        code: "custom",
        params: { error: CustomErrorCode.customFieldInvalidDateTimeRange },
        path: basePath,
      });
      return;
    }
  }

  if (new Date(parts[0]).getTime() > new Date(parts[1]).getTime()) {
    ctx.addIssue({
      code: "custom",
      params: { error: CustomErrorCode.customFieldInvalidDateTimeRange },
      path: basePath,
    });
  }
}
