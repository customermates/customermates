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

const DeleteCustomColumnSchema = z.object({
  id: z.uuid().describe("Custom column id to delete"),
});

const ManageCustomColumnsSchema = z.object({
  action: z
    .enum(["list", "upsert", "delete"])
    .describe("list = read columns, upsert = create or update a column, delete = remove a column"),
  entityType: z
    .enum(EntityType)
    .optional()
    .describe(
      `Entity type ${enumHint(entityTypeValues)}. Required for upsert. Optional for list to restrict to one entity type.`,
    ),
  id: z
    .uuid()
    .optional()
    .describe(
      "Custom column id. Required for delete. On upsert: omit to CREATE, pass an existing id to UPDATE (type and entityType are then immutable).",
    ),
  type: z
    .enum(CustomColumnType)
    .optional()
    .describe(`Column type ${enumHint(customColumnTypeValues)}. Required for upsert.`),
  label: z.string().min(1).max(255).optional().describe("Column label. Required for upsert."),
  options: UpsertCustomColumnToolSchema.shape.options.describe(
    "upsert only. Type-specific config. plain: omit. date*: {displayFormat?}. currency: {currency}. link/email/phone: {color, allowMultiple}. singleSelect: {options:[{value,label,color,isDefault,index}]}.",
  ),
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

export const manageCustomColumnsTool = {
  name: "manage_custom_columns",
  title: "Manage custom columns",
  description:
    "Use this when you need to list, create, update, or delete custom columns on an entity type. " +
    "action list returns { id, label, type, entityType, options } per column. " +
    "action upsert requires type, entityType, label; omit id to CREATE, pass id to UPDATE (type and entityType are immutable). " +
    "For singleSelect, options.options REPLACES the full option list: keep an existing option's stable value uuid to preserve stored records, use a fresh uuid for new options; dropping one deletes its stored values. " +
    "action delete is IRREVERSIBLE and removes the column plus ALL values stored against it.",
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  inputSchema: ManageCustomColumnsSchema,
  execute: async (params: z.infer<typeof ManageCustomColumnsSchema>) => {
    if (params.action === "list") {
      if (params.entityType) {
        const byEntity = await getGetCustomColumnsByEntityTypeInteractor().invoke({ entityType: params.entityType });
        if (!byEntity.ok) return validationError(byEntity.error);
        return encodeToToon({ items: byEntity.data });
      }
      const all = await getGetCustomColumnsInteractor().invoke();
      return encodeToToon({ items: all.data });
    }
    if (params.action === "upsert") {
      const parsed = UpsertCustomColumnToolSchema.safeParse(params);
      if (!parsed.success) return validationError(parsed.error);
      let data = parsed.data;
      if (parsed.data.id) {
        const loaded = await loadColumnOrError(parsed.data.id, parsed.data.type);
        if (!loaded.ok) return loaded.error;
        data = { ...parsed.data, entityType: loaded.column.entityType as EntityType };
      }
      const result = await getUpsertCustomColumnInteractor().invoke(data as UpsertCustomColumnData);
      if (!result.ok) return validationError(result.error);
      return encodeToToon({
        id: result.data.id,
        label: result.data.label,
        message: `Custom field "${result.data.label}" ${parsed.data.id ? "updated" : "created"} successfully`,
      });
    }
    const parsed = DeleteCustomColumnSchema.safeParse(params);
    if (!parsed.success) return validationError(parsed.error);
    const loaded = await loadColumnOrError(parsed.data.id);
    if (!loaded.ok) return loaded.error;
    const result = await getDeleteCustomColumnInteractor().invoke({ id: parsed.data.id });
    if (!result.ok) return validationError(result.error);
    return `Deleted custom column ${result.data}`;
  },
};
