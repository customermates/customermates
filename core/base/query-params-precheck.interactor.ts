import type { Filter, FilterableField, SortDescriptor } from "./base-get.schema";
import type { SortableField } from "./base-query-builder";

import type { FilterEntityKind } from "@/core/types/filter-field-value-kind";
import type { ValidateConnectedAccountIdsInteractor } from "@/core/validation/validators/validate-connected-account-ids.interactor";
import type { ValidateThreadIdsInteractor } from "@/core/validation/validators/validate-thread-ids.interactor";
import type { ValidateUserIdsInteractor } from "@/core/validation/validators/validate-user-ids.interactor";
import { parseRecordReferenceKey } from "@/features/records/record-reference-key";
import type { EntityType } from "@/features/records/history/v1/legacy-enums";
import { z } from "zod";

import { FilterOperatorKey } from "./base-query-builder";

import { filterValueKind } from "@/core/types/filter-field-value-kind";
import { validateDate } from "@/core/validation/validate-date";
import { validateEnumValue } from "@/core/validation/validate-enum-value";
import { validateEvent } from "@/core/validation/validate-event";
import { CustomErrorCode } from "@/core/validation/validation.types";

type StrictFields = {
  filterableFields: FilterableField[];
  customColumns: { id: string }[];
  sortableFields: SortableField[];
};

export class QueryParamsPrecheckInteractor {
  constructor(
    private userValidator: ValidateUserIdsInteractor,
    private threadValidator: ValidateThreadIdsInteractor,
    private connectedAccountValidator: ValidateConnectedAccountIdsInteractor,
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
          const field = filterableFields.find((f) => f.field === filter.field);

          if (!field) {
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

          if (!field.operators.includes(filter.operator)) {
            ctx.addIssue({
              code: "custom",
              params: {
                error: CustomErrorCode.invalidFilterOperator,
                field: filter.field,
                operator: filter.operator,
                validValues: field.operators.join(", "),
              },
              path: ["filters", i, "operator"],
            });
            return;
          }

          if (field.options && "value" in filter && typeof filter.value !== "number") {
            validateEnumValue(
              filter.value,
              field.options.map((option) => option.value),
              ctx,
              ["filters", i, "value"],
            );
          } else await this.checkFilterValue(filter, i, entityType, ctx);
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
      case "user":
        return this.userValidator;
      case "thread":
        return this.threadValidator;
      case "connectedAccount":
        return this.connectedAccountValidator;
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
    if (typeof filter.value === "number") return;

    const path = ["filters", filterIndex, "value"];
    const valueKind = filterValueKind(filter.field);
    if (!valueKind || valueKind.kind === "linkStatus" || valueKind.kind === "draftStatus") return;

    switch (valueKind.kind) {
      case "recordRef": {
        const refs = Array.isArray(filter.value) ? filter.value : [String(filter.value)];
        if (
          refs.length > 100 ||
          refs.some((value) => !parseRecordReferenceKey(value) && !z.uuid().safeParse(value).success)
        ) {
          ctx.addIssue({
            code: "custom",
            params: { error: CustomErrorCode.invalidFilterField },
            path,
          });
        }
        break;
      }
      case "entityId": {
        const ids = Array.isArray(filter.value) ? filter.value : [filter.value];
        const validator = this.idValidatorFor(valueKind.entity);
        if (!validator) {
          ctx.addIssue({
            code: "custom",
            params: { error: CustomErrorCode.invalidFilterField },
            path,
          });
          break;
        }
        if (ids.length > 0) await validator.invoke([{ ids: filter.value, path }], ctx);
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
}
