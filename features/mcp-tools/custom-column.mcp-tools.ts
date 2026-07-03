import { z } from "zod";
import { EntityType, CustomColumnType, Currency } from "@/generated/prisma";

import { encodeToToon, validationError, customErrorMessage, enumHint } from "./utils";

import {
  getUpsertCustomColumnInteractor,
  getGetCustomColumnsInteractor,
  getGetCustomColumnsByEntityTypeInteractor,
  getDeleteCustomColumnInteractor,
} from "@/core/di";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { OptionSchema, type UpsertCustomColumnData } from "@/features/custom-column/upsert-custom-column.interactor";
import { CHIP_COLORS } from "@/constants/chip-colors";
import { DATE_DISPLAY_FORMATS } from "@/constants/date-format";

const entityTypeValues = Object.values(EntityType);
const customColumnTypeValues = Object.values(CustomColumnType);

const UpsertCustomColumnToolSchema = z.object({
  id: z
    .uuid()
    .optional()
    .describe("Existing column id to UPDATE; omit to CREATE. On update, type and entityType are immutable."),
  type: z.enum(CustomColumnType).describe(`Column type ${enumHint(customColumnTypeValues)}`),
  entityType: z.enum(EntityType).describe(`Entity type ${enumHint(entityTypeValues)}`),
  label: z.string().min(1).max(255).describe("Column label"),
  options: z
    .object({
      displayFormat: z
        .enum(DATE_DISPLAY_FORMATS)
        .optional()
        .describe("date / dateTime / dateRange / dateTimeRange only"),
      currency: z.enum(Currency).optional().describe("currency only (ISO code)"),
      color: z.enum(CHIP_COLORS).optional().describe("link / email / phone only"),
      allowMultiple: z.boolean().optional().describe("link / email / phone only"),
      options: z
        .array(OptionSchema)
        .optional()
        .describe(
          "singleSelect only. REPLACES the full option list; keep an existing option's value to preserve its records.",
        ),
    })
    .optional()
    .describe(
      "Type-specific config. plain: omit. date*: {displayFormat?}. currency: {currency}. link/email/phone: {color, allowMultiple}. singleSelect: {options:[{value,label,color,isDefault,index}]}.",
    ),
});

const ListCustomColumnsSchema = z.object({
  entityType: z
    .enum(EntityType)
    .optional()
    .describe(`Restrict to one entity type ${enumHint(entityTypeValues)}. Omit to list all custom columns.`),
});

const DeleteCustomColumnSchema = z.object({
  id: z.uuid().describe("Custom column id to delete"),
});

type LoadedColumn = { id: string; type: string; entityType: string; options?: unknown };

async function loadColumnOrError(
  id: string,
  expectedType?: string,
): Promise<{ ok: true; column: LoadedColumn } | { ok: false; error: string }> {
  const all = await getGetCustomColumnsInteractor().invoke();
  const existing = all.data.find((col) => col.id === id);
  if (!existing) {
    return {
      ok: false,
      error: await customErrorMessage(CustomErrorCode.customColumnNotFound, {
        validValues: all.data.map((col) => `${col.label} (${col.id})`).join(", "),
      }),
    };
  }
  if (expectedType && existing.type !== expectedType) {
    return {
      ok: false,
      error: await customErrorMessage(CustomErrorCode.customColumnTypeMismatch, {
        actualType: existing.type,
        expectedType,
      }),
    };
  }
  return { ok: true, column: existing };
}

export const listCustomColumnsTool = {
  name: "list_custom_columns",
  description:
    "List custom columns across entity types. " +
    "Optional: entityType (restrict to one). " +
    "Returns { id, label, type, entityType, options } for each column. " +
    "Use the returned id with update_entity_custom_fields, upsert_custom_column, or delete_custom_column.",
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  inputSchema: ListCustomColumnsSchema,
  execute: async ({ entityType }: z.infer<typeof ListCustomColumnsSchema>) => {
    if (entityType) {
      const byEntity = await getGetCustomColumnsByEntityTypeInteractor().invoke({ entityType });
      if (!byEntity.ok) return validationError(byEntity.error);
      return encodeToToon({ items: byEntity.data });
    }
    const all = await getGetCustomColumnsInteractor().invoke();
    return encodeToToon({ items: all.data });
  },
};

export const upsertCustomColumnTool = {
  name: "upsert_custom_column",
  description:
    "Create or update a custom column on an entity type. " +
    "Omit `id` to CREATE a new column; pass an existing `id` to UPDATE one (type and entityType are immutable on update - they are taken from the existing column). " +
    "Required: type, entityType, label. " +
    `entityType ${enumHint(entityTypeValues)}. ` +
    "Per type: plain = no options; date / dateTime / dateRange / dateTimeRange = optional options.displayFormat; " +
    "currency = options.currency (ISO code); link / email / phone = options.color + options.allowMultiple; " +
    "singleSelect = options.options[] of { label, color, isDefault, index, value }. " +
    "For singleSelect, options[] REPLACES the full option list: each option needs a stable `value` id - use a fresh uuid for a brand-new option, keep an existing option's `value` to preserve its stored records, and dropping an option deletes any records using it - call list_custom_columns first to read current option values. " +
    "To change a column's type, delete_custom_column then create a new one. Idempotent.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: UpsertCustomColumnToolSchema,
  execute: async (params: z.infer<typeof UpsertCustomColumnToolSchema>) => {
    let data = params;
    if (params.id) {
      const loaded = await loadColumnOrError(params.id, params.type);
      if (!loaded.ok) return loaded.error;
      data = { ...params, entityType: loaded.column.entityType as EntityType };
    }
    const result = await getUpsertCustomColumnInteractor().invoke(data as UpsertCustomColumnData);
    if (!result.ok) return validationError(result.error);
    return encodeToToon({
      id: result.data.id,
      label: result.data.label,
      message: `Custom field "${result.data.label}" ${params.id ? "updated" : "created"} successfully`,
    });
  },
};

export const deleteCustomColumnTool = {
  name: "delete_custom_column",
  description:
    "IRREVERSIBLE. Delete a custom column and ALL values stored against it across every record of its entity type. " +
    "This cannot be undone. Widgets that reference this column may break. " +
    "Required: id.",
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  inputSchema: DeleteCustomColumnSchema,
  execute: async ({ id }: z.infer<typeof DeleteCustomColumnSchema>) => {
    const loaded = await loadColumnOrError(id);
    if (!loaded.ok) return loaded.error;
    const result = await getDeleteCustomColumnInteractor().invoke({ id });
    if (!result.ok) return validationError(result.error);
    return `Deleted custom column ${result.data}`;
  },
};
