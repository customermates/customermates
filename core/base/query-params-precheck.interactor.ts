import type { Filter, FilterableField, SortDescriptor } from "./base-get.schema";
import type { SortableField } from "./base-query-builder";

import type { z } from "zod";
import type { EntityType } from "@/generated/prisma";
import type { ValidateContactIdsInteractor } from "@/core/validation/validators/validate-contact-ids.interactor";
import type { ValidateDealIdsInteractor } from "@/core/validation/validators/validate-deal-ids.interactor";
import type { ValidateOrganizationIdsInteractor } from "@/core/validation/validators/validate-organization-ids.interactor";
import type { ValidateServiceIdsInteractor } from "@/core/validation/validators/validate-service-ids.interactor";
import type { ValidateUserIdsInteractor } from "@/core/validation/validators/validate-user-ids.interactor";
import type { FindCustomColumnRepo } from "@/features/custom-column/find-custom-column.repo";

import { CustomColumnType } from "@/generated/prisma";

import { FilterOperatorKey } from "./base-query-builder";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { validateCustomFieldEmail } from "@/core/validation/validate-custom-field-email";
import { validateCustomFieldPhone } from "@/core/validation/validate-custom-field-phone";
import { validateCustomFieldCurrency } from "@/core/validation/validate-custom-field-currency";
import { validateCustomFieldSingleSelect } from "@/core/validation/validate-custom-field-single-select";
import { validateCustomFieldLink } from "@/core/validation/validate-custom-field-link";
import { validateCustomFieldDate } from "@/core/validation/validate-custom-field-date";
import { validateCustomFieldDateTime } from "@/core/validation/validate-custom-field-date-time";
import { validateCustomColumnExists } from "@/core/validation/validate-custom-column-exists";
import { validateDate } from "@/core/validation/validate-date";
import { validateEvent } from "@/core/validation/validate-event";
import { isCustomField } from "@/core/utils/custom-field";

type StrictFields = {
  filterableFields: FilterableField[];
  customColumns: { id: string }[];
  sortableFields: SortableField[];
};

export class QueryParamsPrecheckInteractor {
  constructor(
    private organizationValidator: ValidateOrganizationIdsInteractor,
    private contactValidator: ValidateContactIdsInteractor,
    private userValidator: ValidateUserIdsInteractor,
    private dealValidator: ValidateDealIdsInteractor,
    private serviceValidator: ValidateServiceIdsInteractor,
    private customColumnRepo: FindCustomColumnRepo,
  ) {}

  async invoke(
    fields: StrictFields,
    entityType: EntityType | undefined,
    data: { filters?: Filter[]; sortDescriptor?: SortDescriptor },
    ctx: z.RefinementCtx,
  ) {
    const { filterableFields, customColumns, sortableFields } = fields;

    if (data.filters) {
      await Promise.all(
        data.filters.map(async (filter, i) => {
          const found = filterableFields.find((f) => f.field === filter.field && f.operators.includes(filter.operator));

          if (!found) {
            ctx.addIssue({
              code: "custom",
              params: {
                error: CustomErrorCode.invalidFilterField,
                validValues: filterableFields
                  .map((f) => `${f.label ? `${f.label} - ` : ""}${f.field} (${f.operators.join(", ")})`.trim())
                  .join(", "),
              },
              path: ["filters", i, "field"],
            });
            return;
          }

          await this.checkFilterValue(filter, i, entityType, ctx);
        }),
      );
    }

    if (data.sortDescriptor) {
      const isStaticField = sortableFields.some((f) => f.field === data.sortDescriptor?.field);
      const isCustomColumn = customColumns.some((c) => c.id === data.sortDescriptor?.field);

      if (!isStaticField && !isCustomColumn) {
        ctx.addIssue({
          code: "custom",
          params: {
            error: CustomErrorCode.invalidSortField,
            validValues: [...sortableFields.map((f) => f.field), ...customColumns.map((c) => c.id)].join(", "),
          },
          path: ["sortDescriptor", "field"],
        });
      }
    }
  }

  private async checkFilterValue(
    filter: Filter,
    filterIndex: number,
    entityType: EntityType | undefined,
    ctx: z.RefinementCtx,
  ) {
    if (!("value" in filter)) return;

    if (filter.operator === FilterOperatorKey.contains) return;

    if (filter.operator === FilterOperatorKey.inLastDays) return;

    const path = ["filters", filterIndex, "value"];

    const values = Array.isArray(filter.value) ? filter.value : [filter.value];
    const valueSet = new Set(values);

    if (filter.field === "organizationIds" && valueSet.size > 0)
      await this.organizationValidator.invoke([{ ids: filter.value, path }], ctx);
    else if (filter.field === "dealIds" && valueSet.size > 0)
      await this.dealValidator.invoke([{ ids: filter.value, path }], ctx);
    else if (filter.field === "userIds" && valueSet.size > 0)
      await this.userValidator.invoke([{ ids: filter.value, path }], ctx);
    else if (filter.field === "serviceIds" && valueSet.size > 0)
      await this.serviceValidator.invoke([{ ids: filter.value, path }], ctx);
    else if (filter.field === "contactIds" && valueSet.size > 0)
      await this.contactValidator.invoke([{ ids: filter.value, path }], ctx);
    else if (filter.field === "event") validateEvent(filter.value, ctx, path);
    else if (filter.field === "updatedAt" || filter.field === "createdAt") validateDate(filter.value, ctx, path);
    else if (isCustomField(filter.field) && entityType) {
      const allColumns = await this.customColumnRepo.findByEntityType(entityType);
      const fieldPathForField = ["filters", filterIndex, "field"];

      const column = validateCustomColumnExists(filter.field, allColumns, ctx, fieldPathForField);
      if (!column) return;

      for (let i = 0; i < values.length; i++) {
        const value = values[i];
        if (value === undefined || value === null || value === "") continue;

        const valuePath = Array.isArray(filter.value) ? [...path, i] : path;

        switch (column.type) {
          case CustomColumnType.email: {
            validateCustomFieldEmail(value, ctx, valuePath);
            break;
          }

          case CustomColumnType.phone: {
            validateCustomFieldPhone(value, ctx, valuePath);
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
            validateCustomFieldLink(value, ctx, valuePath);
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
            validateCustomFieldDate(value, ctx, valuePath);
            break;
          }

          case CustomColumnType.dateTimeRange: {
            validateCustomFieldDateTime(value, ctx, valuePath);
            break;
          }

          case CustomColumnType.plain:
            break;
        }
      }
    }
  }
}
