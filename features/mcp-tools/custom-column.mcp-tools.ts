import { randomUUID } from "node:crypto";

import deepEqual from "fast-deep-equal/es6";
import { z } from "zod";
import { EntityType, CustomColumnType, Currency } from "@/generated/prisma";

import { customMcpFailure, mcpInteractorFailure, mcpMessageFailure, mcpValidationFailure, toonResult } from "./utils";
import type { McpToolFailureResult } from "./mcp-tool";

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

const ToolOptionSchema = OptionSchema.partial({
  value: true,
  color: true,
  isDefault: true,
  index: true,
});
const ToolSelectOptionsSchema = z.array(ToolOptionSchema).min(1);
const CustomColumnMutationIntentSchema = z.enum(["create", "update"]);

function completeOptions(options: z.infer<typeof ToolOptionSchema>[]) {
  return options.map((option, index) => ({
    ...option,
    value: option.value ?? randomUUID(),
    color: option.color ?? "secondary",
    isDefault: option.isDefault ?? index === 0,
    index: option.index ?? index,
  }));
}

const UpsertCustomColumnToolSchema = z.object({
  intent: CustomColumnMutationIntentSchema.optional().describe(
    "Explicit mutation intent. Use create with no id for a new column. UPDATE requires intent=update and an existing id. Omitted intent remains a backwards-compatible CREATE only.",
  ),
  id: z
    .uuid()
    .optional()
    .describe(
      "Existing column id to UPDATE; omit to CREATE. Passing an id also requires intent=update. On update, label, type and entityType are immutable.",
    ),
  type: z.enum(CustomColumnType).describe("Column type"),
  entityType: z.enum(EntityType).describe("Entity type"),
  label: z
    .string()
    .min(1)
    .max(255)
    .describe(
      "Column label. On update, this must exactly match the existing label; create a new column for a new label.",
    ),
  selectOptions: ToolSelectOptionsSchema.optional().describe(
    "Preferred singleSelect config. Pass the complete option list directly as [{label, value?, color?, isDefault?, index?}]. Do not also pass options.options.",
  ),
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
        .array(ToolOptionSchema)
        .min(1)
        .optional()
        .describe(
          "Legacy singleSelect shape; prefer top-level selectOptions. REPLACES the full option list; a new option needs only a label. Keep an existing option's value to preserve its records.",
        ),
    })
    .nullable()
    .optional()
    .describe(
      "Type-specific config, or omit it. plain: omit. date*: {displayFormat?}. currency: {currency}. link/email/phone: {color, allowMultiple}. An empty or null config is treated as omitted. Legacy singleSelect clients may use {options:[...]}; new calls should use top-level selectOptions.",
    ),
});

const OPTION_KEYS_BY_TYPE: Record<string, readonly string[]> = {
  [CustomColumnType.date]: ["displayFormat"],
  [CustomColumnType.dateTime]: ["displayFormat"],
  [CustomColumnType.dateRange]: ["displayFormat"],
  [CustomColumnType.dateTimeRange]: ["displayFormat"],
  [CustomColumnType.currency]: ["currency"],
  [CustomColumnType.link]: ["color", "allowMultiple"],
  [CustomColumnType.email]: ["color", "allowMultiple"],
  [CustomColumnType.phone]: ["color", "allowMultiple"],
  [CustomColumnType.singleSelect]: ["options"],
  [CustomColumnType.plain]: [],
};

function optionsForType<T extends Record<string, unknown>>(type: CustomColumnType, options: T | null | undefined) {
  if (!options) return options;

  const allowed = OPTION_KEYS_BY_TYPE[type] ?? [];

  return Object.fromEntries(Object.entries(options).filter(([key]) => allowed.includes(key))) as T;
}

function compactToolOptions<T extends Record<string, unknown>>(options: T | null | undefined): T | undefined {
  if (!options) return undefined;

  const present = Object.entries(options).filter(([, value]) => value !== undefined && value !== null);

  return present.length > 0 ? (Object.fromEntries(present) as T) : undefined;
}

const DeleteCustomColumnSchema = z.object({
  id: z.uuid().describe("Custom column id to delete"),
});

const ManageCustomColumnsSchema = z.object({
  action: z
    .enum(["list", "upsert", "delete"])
    .describe(
      "list = read columns (optional entityType); upsert = create (intent create, entityType, type, label, plus selectOptions for singleSelect) or update (intent update, the existing id, and the stored entityType, type and label); delete = id.",
    ),
  entityType: z
    .enum(EntityType)
    .optional()
    .describe("Entity type. Required for upsert. Optional for list to restrict to one entity type."),
  id: z
    .uuid()
    .nullable()
    .optional()
    .describe(
      "Custom column id. Required for delete. On upsert: omit to CREATE, pass an existing id to UPDATE. null is accepted only with intent=create and treated as omitted.",
    ),
  intent: CustomColumnMutationIntentSchema.optional().describe(
    "upsert only: create with no id, or update with an existing id. Omitting intent is accepted only for a legacy CREATE without an id.",
  ),
  type: z.enum(CustomColumnType).optional().describe("Column type. Required for upsert."),
  label: z
    .string()
    .min(1)
    .max(255)
    .optional()
    .describe(
      "Column label. Required for upsert. On update, this must exactly match the existing label; create a new column for a new label.",
    ),
  selectOptions: UpsertCustomColumnToolSchema.shape.selectOptions.describe(
    "Preferred for singleSelect upserts. Pass the complete option list directly. Do not also pass legacy options.options.",
  ),
  options: UpsertCustomColumnToolSchema.shape.options.describe(
    "upsert only. Type-specific config. plain: omit. date*: {displayFormat?}. currency: {currency}. link/email/phone: {color, allowMultiple}. For singleSelect use top-level selectOptions.",
  ),
});

type LoadedColumn = {
  id: string;
  label: string;
  type: string;
  entityType: string;
  options?: unknown;
};

async function loadColumnOrError(
  id: string,
  expectedType?: string,
): Promise<{ ok: true; column: LoadedColumn } | { ok: false; error: McpToolFailureResult }> {
  const all = await getGetCustomColumnsInteractor().invoke();
  const existing = all.data.find((col) => col.id === id);
  if (!existing) {
    return {
      ok: false,
      error: await customMcpFailure(CustomErrorCode.customColumnNotFound, {
        validValues: all.data.map((col) => `${col.label} (${col.id})`).join(", "),
      }),
    };
  }
  if (expectedType && existing.type !== expectedType) {
    return {
      ok: false,
      error: await customMcpFailure(CustomErrorCode.customColumnTypeMismatch, {
        actualType: existing.type,
        expectedType,
      }),
    };
  }
  return { ok: true, column: existing };
}

const ManageCustomColumnsOutputSchema = z
  .looseObject({
    items: z.array(z.looseObject({ id: z.string(), label: z.string() })).optional(),
    id: z.string().optional(),
    label: z.string().optional(),
    message: z.string().optional(),
    deleted: z.literal(true).optional(),
  })
  .describe("action list returns items; upsert returns id, label and message; delete returns deleted and id.");

export const manageCustomColumnsTool = {
  name: "manage_custom_columns",
  title: "Manage custom columns",
  description:
    "Use this when you need to list, create, update, or delete custom columns on an entity type. " +
    "Do not create or change a custom column only to make an unsupported manage_data_views filter possible; report the unavailable saved-view filter instead. " +
    "action list returns { id, label, type, entityType, options } per column. " +
    "action upsert requires type, entityType, label: for CREATE pass intent=create and OMIT id; for UPDATE pass intent=update and the existing id; a mismatched intent/id pair is rejected without writing. Label, type and entityType are immutable, so create a new column instead of repurposing one. " +
    'For singleSelect, prefer top-level selectOptions; for example {"action":"upsert","intent":"create","entityType":"contact","type":"singleSelect","label":"Priority","selectOptions":[{"label":"High"}]}. Never also pass legacy options.options. The list REPLACES every option: keep an existing option\'s value uuid to preserve its records, use a fresh uuid for a new one; dropping one deletes its stored values. ' +
    "action delete is IRREVERSIBLE and removes the column plus ALL values stored against it; deleting the company's deal weighting column turns weighting off and also requires update permission on the company.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  },
  inputSchema: ManageCustomColumnsSchema,
  outputSchema: ManageCustomColumnsOutputSchema,
  execute: async (params: z.infer<typeof ManageCustomColumnsSchema>) => {
    if (params.action === "list") {
      if (params.entityType) {
        const byEntity = await getGetCustomColumnsByEntityTypeInteractor().invoke({
          entityType: params.entityType,
        });
        if (!byEntity.ok) return mcpInteractorFailure(byEntity.error);
        return toonResult({ total: byEntity.data.length, items: byEntity.data });
      }
      const all = await getGetCustomColumnsInteractor().invoke();
      return toonResult({ total: all.data.length, items: all.data });
    }
    if (params.action === "upsert") {
      const normalizedParams = params.intent === "create" && params.id === null ? { ...params, id: undefined } : params;
      const parsed = UpsertCustomColumnToolSchema.safeParse(normalizedParams);
      if (!parsed.success) return mcpValidationFailure(parsed.error);
      if (parsed.data.intent === "create" && parsed.data.id) {
        return mcpMessageFailure(
          "intent=create must omit id; use intent=update only when modifying an existing custom column.",
          ["id"],
        );
      }
      if (parsed.data.intent === "update" && !parsed.data.id)
        return mcpMessageFailure("intent=update requires the id of an existing custom column.", ["id"]);
      if (parsed.data.id && parsed.data.intent !== "update") {
        return mcpMessageFailure(
          "Refusing to update from id alone. Pass intent=update only when modifying that existing custom column.",
          ["intent"],
        );
      }
      if (
        parsed.data.selectOptions &&
        parsed.data.options?.options &&
        !deepEqual(parsed.data.selectOptions, parsed.data.options.options)
      ) {
        return mcpMessageFailure(
          "Conflicting single-select choices were provided in selectOptions and options.options. Pass only one list, or make them identical.",
          ["selectOptions"],
        );
      }
      const isSingleSelect = parsed.data.type === CustomColumnType.singleSelect;
      const selectOptions = isSingleSelect ? (parsed.data.selectOptions ?? parsed.data.options?.options) : undefined;
      if (isSingleSelect && !selectOptions) {
        return mcpMessageFailure(
          "singleSelect requires a non-empty top-level selectOptions list (legacy options.options is also accepted).",
          ["selectOptions"],
        );
      }
      const columnParams = { ...parsed.data };
      delete columnParams.intent;
      delete columnParams.selectOptions;
      if (columnParams.id === undefined) delete columnParams.id;
      columnParams.options = compactToolOptions(optionsForType(parsed.data.type, columnParams.options));
      if (columnParams.options === undefined) delete columnParams.options;
      let data = selectOptions
        ? {
            ...columnParams,
            options: {
              ...columnParams.options,
              options: completeOptions(selectOptions),
            },
          }
        : columnParams;
      if (parsed.data.id) {
        const loaded = await loadColumnOrError(parsed.data.id, parsed.data.type);
        if (!loaded.ok) return loaded.error;
        if (parsed.data.entityType !== loaded.column.entityType) {
          return mcpMessageFailure(
            `Refusing to update a custom column on ${loaded.column.entityType} as ${parsed.data.entityType}. Use the id of a custom column on the requested entity type.`,
            ["entityType"],
          );
        }
        if (parsed.data.label !== loaded.column.label) {
          return mcpMessageFailure(
            `Refusing to rename the existing custom column "${loaded.column.label}". Keep its label unchanged when updating it, or use intent=create without an id to create "${parsed.data.label}" as a new column.`,
            ["label"],
          );
        }
        data = { ...data, entityType: loaded.column.entityType as EntityType };
      }
      const result = await getUpsertCustomColumnInteractor().invoke(data as UpsertCustomColumnData);
      if (!result.ok) return mcpInteractorFailure(result.error);
      return toonResult({
        id: result.data.id,
        label: result.data.label,
        message: `Custom field "${result.data.label}" ${parsed.data.id ? "updated" : "created"} successfully`,
      });
    }
    const parsed = DeleteCustomColumnSchema.safeParse(params);
    if (!parsed.success) return mcpValidationFailure(parsed.error);
    const loaded = await loadColumnOrError(parsed.data.id);
    if (!loaded.ok) return loaded.error;
    const result = await getDeleteCustomColumnInteractor().invoke({
      id: parsed.data.id,
    });
    if (!result.ok) return mcpInteractorFailure(result.error);
    return {
      text: `Deleted custom column ${result.data}`,
      structuredContent: { deleted: true, id: parsed.data.id },
    };
  },
};
