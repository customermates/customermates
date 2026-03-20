import type { Filter, FilterableField, SortDescriptor } from "./base-get.schema";

import { z } from "zod";
import { CustomColumnType } from "@/generated/prisma";

import type { EntityType } from "@/generated/prisma";

import { SortableField } from "./base-query-builder";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { TenantScoped } from "@/core/decorators/tenant-scoped.decorator";
import { validateOrganizationIds, FindOrganizationsByIdsRepo } from "@/core/validation/validate-organization-ids";
import { validateUserIds, FindUsersByIdsRepo } from "@/core/validation/validate-user-ids";
import { validateDealIds, FindDealsByIdsRepo } from "@/core/validation/validate-deal-ids";
import { validateServiceIds, FindServicesByIdsRepo } from "@/core/validation/validate-service-ids";
import { validateContactIds, FindContactsByIdsRepo } from "@/features/contacts/validate-contact-ids";
import { FindCustomColumnRepo } from "@/features/custom-column/find-custom-column.repo";
import { validateCustomFieldEmail } from "@/core/validation/validate-custom-field-email";
import { validateCustomFieldPhone } from "@/core/validation/validate-custom-field-phone";
import { validateCustomFieldCurrency } from "@/core/validation/validate-custom-field-currency";
import { validateCustomFieldSingleSelect } from "@/core/validation/validate-custom-field-single-select";
import { validateCustomFieldLink } from "@/core/validation/validate-custom-field-link";
import { validateCustomFieldDate } from "@/core/validation/validate-custom-field-date";
import { validateCustomColumnExists } from "@/core/validation/validate-custom-column-exists";
import { validateDate } from "@/core/validation/validate-date";
import { validateEvent } from "@/core/validation/validate-event";

@TenantScoped
export class ValidateQueryParamsValidator {
  async invoke(
    repo: { getFilterableFields: () => Promise<FilterableField[]>; getSortableFields: () => SortableField[] },
    entityType: EntityType | undefined,
    data: { filters?: Filter[]; sortDescriptor?: SortDescriptor },
    ctx: z.RefinementCtx,
  ) {
    const filterableFields = await repo.getFilterableFields();
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
      const found = sortableFields.find((f) => f.field === data.sortDescriptor?.field);

      if (!found) {
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

    const fieldPath = ["filters", filterIndex, "value"];

    const { di } = await import("@/core/dependency-injection/container");

    const values = Array.isArray(filter.value) ? filter.value : [filter.value];
    const valueSet = new Set(values);

    if (filter.field === "organizationIds" && valueSet.size > 0) {
      const validIdsSet = await di.get(FindOrganizationsByIdsRepo).findIds(valueSet);
      validateOrganizationIds(filter.value, validIdsSet, ctx, fieldPath);
    } else if (filter.field === "dealIds" && valueSet.size > 0) {
      const validIdsSet = await di.get(FindDealsByIdsRepo).findIds(valueSet);
      validateDealIds(filter.value, validIdsSet, ctx, fieldPath);
    } else if (filter.field === "userIds" && valueSet.size > 0) {
      const validIdsSet = await di.get(FindUsersByIdsRepo).findIds(valueSet);
      validateUserIds(filter.value, validIdsSet, ctx, fieldPath);
    } else if (filter.field === "serviceIds" && valueSet.size > 0) {
      const validIdsSet = await di.get(FindServicesByIdsRepo).findIds(valueSet);
      validateServiceIds(filter.value, validIdsSet, ctx, fieldPath);
    } else if (filter.field === "contactIds" && valueSet.size > 0) {
      const validIdsSet = await di.get(FindContactsByIdsRepo).findIds(valueSet);
      validateContactIds(filter.value, validIdsSet, ctx, fieldPath);
    } else if (filter.field === "event") validateEvent(filter.value, ctx, fieldPath);
    else if (filter.field === "updatedAt" || filter.field === "createdAt") validateDate(filter.value, ctx, fieldPath);
    else if (this.isCustomField(filter.field)) {
      const allColumns = await di.get(FindCustomColumnRepo).findByEntityType(entityType);
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

          case CustomColumnType.date:
          case CustomColumnType.dateTime: {
            validateCustomFieldDate(value, ctx, valuePath);
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
