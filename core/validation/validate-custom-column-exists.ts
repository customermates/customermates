import type { CustomColumnDto } from "../../features/custom-column/custom-column.schema";
import type { z } from "zod";

import { CustomErrorCode } from "@/core/validation/validation.types";

export function validateCustomColumnExists(
  columnId: string,
  allColumns: CustomColumnDto[],
  ctx: z.RefinementCtx,
  path: (string | number)[],
): CustomColumnDto | null {
  const column = allColumns.find((c) => c.id === columnId);

  if (!column) {
    const validValues = allColumns.map((col) => `${col.label} (${col.id})`);
    ctx.addIssue({
      code: "custom",
      params: {
        error: CustomErrorCode.customColumnNotFound,
        validValues,
      },
      path,
    });
    return null;
  }

  return column;
}
