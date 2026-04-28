import type { CustomColumnDto } from "../../features/custom-column/custom-column.schema";
import type { z } from "zod";

import { CustomColumnType } from "@/generated/prisma";

import { validateCustomFieldEmail } from "@/core/validation/validate-custom-field-email";
import { validateCustomFieldPhone } from "@/core/validation/validate-custom-field-phone";
import { validateCustomFieldCurrency } from "@/core/validation/validate-custom-field-currency";
import { validateCustomFieldSingleSelect } from "@/core/validation/validate-custom-field-single-select";
import { validateCustomFieldLink } from "@/core/validation/validate-custom-field-link";
import { validateCustomFieldDate } from "@/core/validation/validate-custom-field-date";
import { validateCustomFieldDateTime } from "@/core/validation/validate-custom-field-date-time";
import { validateCustomFieldDateRange } from "@/core/validation/validate-custom-field-date-range";
import { validateCustomFieldDateTimeRange } from "@/core/validation/validate-custom-field-date-time-range";
import { validateCustomColumnExists } from "@/core/validation/validate-custom-column-exists";

export { FindCustomColumnRepo } from "../../features/custom-column/find-custom-column.repo";

export function validateCustomFieldValues(
  customFieldValues: Array<{ columnId: string; value?: string | null | undefined }> | null | undefined,
  allColumns: CustomColumnDto[],
  ctx: z.RefinementCtx,
  basePath: (string | number)[],
) {
  if (customFieldValues === undefined || customFieldValues === null) return;

  for (let i = 0; i < customFieldValues.length; i++) {
    const customFieldValue = customFieldValues[i];
    const columnIdPath = [...basePath, i, "columnId"];
    const valuePath = [...basePath, i, "value"];

    const column = validateCustomColumnExists(customFieldValue.columnId, allColumns, ctx, columnIdPath);

    if (!column) continue;

    const value = customFieldValue.value;
    if (value === undefined || value === null || value === "") continue;

    switch (column.type) {
      case CustomColumnType.email: {
        validateCustomFieldEmail(value, ctx, valuePath, column.options?.allowMultiple);
        break;
      }

      case CustomColumnType.phone: {
        validateCustomFieldPhone(value, ctx, valuePath, column.options?.allowMultiple);
        break;
      }

      case CustomColumnType.currency: {
        validateCustomFieldCurrency(value, ctx, valuePath);
        break;
      }

      case CustomColumnType.singleSelect: {
        validateCustomFieldSingleSelect(value, column, ctx, valuePath);
        break;
      }

      case CustomColumnType.link: {
        validateCustomFieldLink(value, ctx, valuePath, column.options?.allowMultiple);
        break;
      }

      case CustomColumnType.date: {
        validateCustomFieldDate(value, ctx, valuePath);
        break;
      }

      case CustomColumnType.dateTime: {
        validateCustomFieldDateTime(value, ctx, valuePath);
        break;
      }

      case CustomColumnType.dateRange: {
        validateCustomFieldDateRange(value, ctx, valuePath);
        break;
      }

      case CustomColumnType.dateTimeRange: {
        validateCustomFieldDateTimeRange(value, ctx, valuePath);
        break;
      }

      case CustomColumnType.plain:
        break;
    }
  }
}
