import type { Filter, FilterableField, SortDescriptor } from "./base-get.schema";
import type { SortableField } from "./base-query-builder";

import type { z } from "zod";
import type { EntityType } from "@/generated/prisma";
import type { ValidateContactIdsInteractor } from "@/core/validation/validators/validate-contact-ids.interactor";
import type { ValidateDealIdsInteractor } from "@/core/validation/validators/validate-deal-ids.interactor";
import type { ValidateOrganizationIdsInteractor } from "@/core/validation/validators/validate-organization-ids.interactor";
import type { ValidateServiceIdsInteractor } from "@/core/validation/validators/validate-service-ids.interactor";
import type { ValidateTaskIdsInteractor } from "@/core/validation/validators/validate-task-ids.interactor";
import type { ValidateThreadIdsInteractor } from "@/core/validation/validators/validate-thread-ids.interactor";
import type { ValidateUserIdsInteractor } from "@/core/validation/validators/validate-user-ids.interactor";
import type { FindCustomColumnRepo } from "@/features/custom-column/find-custom-column.repo";
import type { FilterEntityKind } from "@/core/types/filter-field-value-kind";

import { CustomColumnType } from "@/generated/prisma";

import { FilterOperatorKey } from "./base-query-builder";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { filterValueKind } from "@/core/types/filter-field-value-kind";
import { validateCustomFieldEmail } from "@/core/validation/validate-custom-field-email";
import { validateCustomFieldPhone } from "@/core/validation/validate-custom-field-phone";
import { validateCustomFieldCurrency } from "@/core/validation/validate-custom-field-currency";
import { validateCustomFieldSingleSelect } from "@/core/validation/validate-custom-field-single-select";
import { validateCustomFieldLink } from "@/core/validation/validate-custom-field-link";
import { validateCustomFieldDate } from "@/core/validation/validate-custom-field-date";
import { validateCustomFieldDateTime } from "@/core/validation/validate-custom-field-date-time";
import { validateCustomColumnExists } from "@/core/validation/validate-custom-column-exists";
import { validateDate } from "@/core/validation/validate-date";
import { validateEnumValue } from "@/core/validation/validate-enum-value";
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
    private taskValidator: ValidateTaskIdsInteractor,
    private threadValidator: ValidateThreadIdsInteractor,
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

  private idValidatorFor(entity: FilterEntityKind) {
    switch (entity) {
      case "organization":
        return this.organizationValidator;
      case "contact":
        return this.contactValidator;
      case "user":
        return this.userValidator;
      case "deal":
        return this.dealValidator;
      case "service":
        return this.serviceValidator;
      case "task":
        return this.taskValidator;
      case "thread":
        return this.threadValidator;
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

    if (isCustomField(filter.field) && entityType) {
      await this.checkCustomFieldValue(filter, filterIndex, entityType, ctx);
      return;
    }

    const path = ["filters", filterIndex, "value"];
    const valueKind = filterValueKind(filter.field);
    if (!valueKind || valueKind.kind === "none") return;

    switch (valueKind.kind) {
      case "entityId": {
        const ids = Array.isArray(filter.value) ? filter.value : [filter.value];
        if (ids.length > 0) await this.idValidatorFor(valueKind.entity).invoke([{ ids: filter.value, path }], ctx);
        break;
      }
      case "enum":
        validateEnumValue(filter.value, valueKind.values, ctx, path);
        break;
      case "date":
        validateDate(filter.value, ctx, path);
        break;
      case "event":
        validateEvent(filter.value, ctx, path);
        break;
    }
  }

  private async checkCustomFieldValue(
    filter: Filter & { value: string | string[] },
    filterIndex: number,
    entityType: EntityType,
    ctx: z.RefinementCtx,
  ) {
    const path = ["filters", filterIndex, "value"];
    const fieldPath = ["filters", filterIndex, "field"];
    const values = Array.isArray(filter.value) ? filter.value : [filter.value];

    const allColumns = await this.customColumnRepo.findByEntityType(entityType);
    const column = validateCustomColumnExists(filter.field, allColumns, ctx, fieldPath);
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
