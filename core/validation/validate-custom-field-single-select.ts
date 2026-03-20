import type { CustomColumnDto } from "../../features/custom-column/custom-column.schema";
import type { z } from "zod";

import { CustomColumnType } from "@/generated/prisma";

import { CustomErrorCode } from "@/core/validation/validation.types";

export function validateCustomFieldSingleSelect(
  value: string | string[],
  column: CustomColumnDto,
  ctx: z.RefinementCtx,
  basePath: (string | number)[],
) {
  if (column.type !== CustomColumnType.singleSelect) return;

  const values = Array.isArray(value) ? value : [value];
  const isArray = Array.isArray(value);
  const options = column.options.options;
  const allowedValueUuids = options.map((opt) => opt.value);
  const allowedValues = options.map((opt) => `${opt.label} (${opt.value})`);

  for (let i = 0; i < values.length; i++) {
    if (!allowedValueUuids.includes(values[i])) {
      ctx.addIssue({
        code: "custom",
        params: {
          error: CustomErrorCode.customFieldInvalidSingleSelect,
          validValues: allowedValues,
        },
        path: isArray ? [...basePath, i] : basePath,
      });
    }
  }
}
