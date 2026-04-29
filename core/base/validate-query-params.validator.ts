import type { Filter, FilterableField, SortDescriptor } from "./base-get.schema";
import type { SortableField } from "./base-query-builder";

import { z } from "zod";
import { CustomColumnType } from "@/generated/prisma";

import { FilterOperatorKey } from "./base-query-builder";

import type { EntityType } from "@/generated/prisma";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { validateOrganizationIds } from "@/core/validation/validate-organization-ids";
import { validateUserIds } from "@/core/validation/validate-user-ids";
import { validateDealIds } from "@/core/validation/validate-deal-ids";
import { validateServiceIds } from "@/core/validation/validate-service-ids";
import { validateContactIds } from "@/features/contacts/validate-contact-ids";
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
import {
  getOrganizationRepo,
  getDealRepo,
  getCompanyRepo,
  getServiceRepo,
  getContactRepo,
  getCustomColumnRepo,
} from "@/core/di";

export class ValidateQueryParamsValidator {
  async invoke(
    repo: {
      getFilterableFields: () => Promise<FilterableField[]>;
      getSortableFields: () => SortableField[];
      getCustomColumns?: () => Promise<Array<{ id: string }>>;
    },
    entityType: EntityType | undefined,
    data: { filters?: Filter[]; sortDescriptor?: SortDescriptor },
    ctx: z.RefinementCtx,
  ) {
    const [filterableFields, customColumns] = await Promise.all([
      repo.getFilterableFields(),
      repo.getCustomColumns ? repo.getCustomColumns() : Promise.resolve([]),
    ]);
    const sortableFields = repo.getSortableFields();

    if (data.filters && entityType) {
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

          await this.validateFilterValue(filter, i, entityType, ctx);
        }),
      );
    }

    if (data.sortDescriptor) {
      const isStaticField = sortableFields.some((f) => f.field === data.sortDescriptor?.field);
      const isCustomColumn = customColumns.some((c) => c.id === data.sortDescriptor?.field);

      if (!isStaticField && !isCustomColumn) {
        ctx.addIssue({
          code: "custom",
          params: { error: CustomErrorCode.invalidSortField },
          path: ["sortDescriptor", "field"],
        });
      }
    }
  }

  private async validateFilterValue(filter: Filter, filterIndex: number, entityType: EntityType, ctx: z.RefinementCtx) {
    if (!("value" in filter)) return;

    if (filter.operator === FilterOperatorKey.contains) return;

    if (filter.operator === FilterOperatorKey.inLastDays) return;

    const fieldPath = ["filters", filterIndex, "value"];

    const values = Array.isArray(filter.value) ? filter.value : [filter.value];
    const valueSet = new Set(values);

    if (filter.field === "organizationIds" && valueSet.size > 0) {
      const validIdsSet = await getOrganizationRepo().findIds(valueSet);
      validateOrganizationIds(filter.value, validIdsSet, ctx, fieldPath);
    } else if (filter.field === "dealIds" && valueSet.size > 0) {
      const validIdsSet = await getDealRepo().findIds(valueSet);
      validateDealIds(filter.value, validIdsSet, ctx, fieldPath);
    } else if (filter.field === "userIds" && valueSet.size > 0) {
      const validIdsSet = await getCompanyRepo().findIds(valueSet);
      validateUserIds(filter.value, validIdsSet, ctx, fieldPath);
    } else if (filter.field === "serviceIds" && valueSet.size > 0) {
      const validIdsSet = await getServiceRepo().findIds(valueSet);
      validateServiceIds(filter.value, validIdsSet, ctx, fieldPath);
    } else if (filter.field === "contactIds" && valueSet.size > 0) {
      const validIdsSet = await getContactRepo().findIds(valueSet);
      validateContactIds(filter.value, validIdsSet, ctx, fieldPath);
    } else if (filter.field === "event") validateEvent(filter.value, ctx, fieldPath);
    else if (filter.field === "updatedAt" || filter.field === "createdAt") validateDate(filter.value, ctx, fieldPath);
    else if (this.isCustomField(filter.field)) {
      const allColumns = await getCustomColumnRepo().findByEntityType(entityType);
      const fieldPathForField = ["filters", filterIndex, "field"];

      const column = validateCustomColumnExists(filter.field, allColumns, ctx, fieldPathForField);
      if (!column) return;

      for (let i = 0; i < values.length; i++) {
        const value = values[i];
        if (value === undefined || value === null || value === "") continue;

        const valuePath = Array.isArray(filter.value) ? [...fieldPath, i] : fieldPath;

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

  private isCustomField(field: string): boolean {
    return z.uuid().safeParse(field).success;
  }
}
