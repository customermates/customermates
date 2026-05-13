import { z } from "zod";
import { CustomColumnType, EntityType, Currency } from "@/generated/prisma";

import { encodeToToon, enumHint } from "./utils";

import {
  getUpsertCustomColumnInteractor,
  getGetCustomColumnsInteractor,
  getGetCustomColumnsByEntityTypeInteractor,
  getDeleteCustomColumnInteractor,
} from "@/core/app-di";
import { CHIP_COLORS } from "@/constants/chip-colors";
import { DATE_DISPLAY_FORMATS } from "@/constants/date-format";

const entityTypeValues = Object.values(EntityType);
const currencyValues = Object.values(Currency);
const dateFormatValues = [...DATE_DISPLAY_FORMATS];
const chipColorValues = [...CHIP_COLORS];

const EntityTypeSchema = z
  .enum(EntityType)
  .describe(`Entity type to add the custom field to ${enumHint(entityTypeValues)}`);

const ChipColorSchema = z.enum(CHIP_COLORS).describe(`Chip color ${enumHint(chipColorValues)}`);

const DateFormatSchema = z
  .enum(DATE_DISPLAY_FORMATS)
  .describe(
    `Date display format ${enumHint(dateFormatValues)}. ` +
      "numericalLong=DD.MM.YYYY, numericalShort=DD.MM.YY, descriptiveShort=DD MMM YYYY, descriptiveLong=DD MMMM YYYY, relative=e.g. '3 days ago'.",
  );

const CreatePlainCustomColumnSchema = z.object({
  entityType: EntityTypeSchema,
  label: z.string().min(1).describe("Display label for the column"),
});

const CreateDateCustomColumnSchema = z.object({
  entityType: EntityTypeSchema,
  label: z.string().min(1),
  displayFormat: DateFormatSchema.optional(),
});

const CreateDateTimeCustomColumnSchema = z.object({
  entityType: EntityTypeSchema,
  label: z.string().min(1),
  displayFormat: DateFormatSchema.optional(),
});

const CreateDateRangeCustomColumnSchema = z.object({
  entityType: EntityTypeSchema,
  label: z.string().min(1),
  displayFormat: DateFormatSchema.optional(),
});

const CreateDateTimeRangeCustomColumnSchema = z.object({
  entityType: EntityTypeSchema,
  label: z.string().min(1),
  displayFormat: DateFormatSchema.optional(),
});

const CreateCurrencyCustomColumnSchema = z.object({
  entityType: EntityTypeSchema,
  label: z.string().min(1),
  currency: z.enum(Currency).describe(`Currency ISO code ${enumHint(currencyValues)}`),
});

const CreateSingleSelectCustomColumnSchema = z.object({
  entityType: EntityTypeSchema,
  label: z.string().min(1),
  options: z
    .array(
      z.object({
        label: z.string().min(1).describe("Visible option label"),
        color: ChipColorSchema,
        isDefault: z.boolean().describe("Whether this option is selected by default on new records"),
        index: z.number().min(0).describe("Sort order (0 = first)"),
      }),
    )
    .min(1)
    .describe("Dropdown options (at least one). Each needs a label, color, isDefault flag, and sort index."),
});

const CreateLinkCustomColumnSchema = z.object({
  entityType: EntityTypeSchema,
  label: z.string().min(1),
  color: ChipColorSchema,
  allowMultiple: z.boolean().describe("Allow multiple URLs per record"),
});

const CreateEmailCustomColumnSchema = z.object({
  entityType: EntityTypeSchema,
  label: z.string().min(1),
  color: ChipColorSchema,
  allowMultiple: z.boolean().describe("Allow multiple email addresses per record"),
});

const CreatePhoneCustomColumnSchema = z.object({
  entityType: EntityTypeSchema,
  label: z.string().min(1),
  color: ChipColorSchema,
  allowMultiple: z.boolean().describe("Allow multiple phone numbers per record"),
});

const ListCustomColumnsSchema = z.object({
  entityType: EntityTypeSchema.optional().describe("Restrict to one entity type. Omit to list all custom columns."),
});

const DeleteCustomColumnSchema = z.object({
  id: z.uuid().describe("Custom column id to delete"),
});

const UpdatePlainCustomColumnSchema = z.object({
  id: z.uuid().describe("Custom column id to update"),
  label: z.string().min(1).describe("New display label"),
});

const UpdateDateCustomColumnSchema = z.object({
  id: z.uuid(),
  label: z.string().min(1),
  displayFormat: DateFormatSchema.optional(),
});

const UpdateDateTimeCustomColumnSchema = z.object({
  id: z.uuid(),
  label: z.string().min(1),
  displayFormat: DateFormatSchema.optional(),
});

const UpdateDateRangeCustomColumnSchema = z.object({
  id: z.uuid(),
  label: z.string().min(1),
  displayFormat: DateFormatSchema.optional(),
});

const UpdateDateTimeRangeCustomColumnSchema = z.object({
  id: z.uuid(),
  label: z.string().min(1),
  displayFormat: DateFormatSchema.optional(),
});

const UpdateCurrencyCustomColumnSchema = z.object({
  id: z.uuid(),
  label: z.string().min(1),
  currency: z.enum(Currency).describe(`Currency ISO code ${enumHint(currencyValues)}`),
});

const UpdateSingleSelectCustomColumnSchema = z.object({
  id: z.uuid(),
  label: z.string().min(1),
  options: z
    .array(
      z.object({
        value: z
          .uuid()
          .optional()
          .describe(
            "Existing option UUID. REQUIRED for options that already have records attached — " +
              "omit only for brand-new options (a new UUID is generated). " +
              "Dropping an existing option from the array DELETES any records using it.",
          ),
        label: z.string().min(1),
        color: ChipColorSchema,
        isDefault: z.boolean(),
        index: z.number().min(0),
      }),
    )
    .min(1)
    .describe(
      "REPLACES the full option list. Keep each existing option's `value` UUID to preserve stored records; " +
        "drop it to delete that option; omit `value` to add a new one.",
    ),
});

const UpdateLinkCustomColumnSchema = z.object({
  id: z.uuid(),
  label: z.string().min(1),
  color: ChipColorSchema,
  allowMultiple: z.boolean(),
});

const UpdateEmailCustomColumnSchema = z.object({
  id: z.uuid(),
  label: z.string().min(1),
  color: ChipColorSchema,
  allowMultiple: z.boolean(),
});

const UpdatePhoneCustomColumnSchema = z.object({
  id: z.uuid(),
  label: z.string().min(1),
  color: ChipColorSchema,
  allowMultiple: z.boolean(),
});

export const listCustomColumnsTool = {
  name: "list_custom_columns",
  description:
    "List custom columns across entity types. " +
    "Optional: entityType (restrict to one). " +
    "Returns { id, label, type, entityType, options } for each column. " +
    "Use the returned id with update_entity_custom_fields or delete_custom_column.",
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  inputSchema: ListCustomColumnsSchema,
  execute: async ({ entityType }: z.infer<typeof ListCustomColumnsSchema>) => {
    if (entityType) {
      const byEntity = (await getGetCustomColumnsByEntityTypeInteractor().invoke({ entityType })) as
        | { ok: true; data: unknown }
        | { ok: false; error: z.ZodError };
      if (!byEntity.ok) return `Validation error: ${z.prettifyError(byEntity.error)}`;
      return encodeToToon({ items: byEntity.data });
    }
    const all = (await getGetCustomColumnsInteractor().invoke()) as
      | { ok: true; data: unknown }
      | { ok: false; error: z.ZodError };
    if (!all.ok) return `Validation error: ${z.prettifyError(all.error)}`;
    return encodeToToon({ items: all.data });
  },
};

type LoadedColumn = { id: string; type: string; entityType: string; options?: unknown };

async function loadColumnOrError(
  id: string,
  expectedType: string,
): Promise<{ ok: true; column: LoadedColumn } | { ok: false; error: string }> {
  const all = (await getGetCustomColumnsInteractor().invoke()) as
    | { ok: true; data: LoadedColumn[] }
    | { ok: false; error: z.ZodError };
  if (!all.ok) return { ok: false, error: `Validation error: ${z.prettifyError(all.error)}` };
  const existing = all.data.find((col) => col.id === id);
  if (!existing) return { ok: false, error: `Validation error: Custom column ${id} not found` };
  if (existing.type !== expectedType) {
    return {
      ok: false,
      error: `Validation error: Custom column ${id} is type "${existing.type}", not "${expectedType}". Use update_${existing.type}_custom_column instead.`,
    };
  }
  return { ok: true, column: existing };
}

async function runCustomColumnUpdate(payload: Record<string, unknown>) {
  const result = await getUpsertCustomColumnInteractor().invoke(
    payload as Parameters<ReturnType<typeof getUpsertCustomColumnInteractor>["invoke"]>[0],
  );
  if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
  return encodeToToon({
    id: result.data.id,
    label: result.data.label,
    message: `Custom field "${result.data.label}" updated successfully`,
  });
}

export const updatePlainCustomColumnTool = {
  name: "update_plain_custom_column",
  description:
    "Update a plain text custom column. " +
    "Required: id, label. " +
    "Type and entityType are immutable — use delete_custom_column then create_* to change type.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: UpdatePlainCustomColumnSchema,
  execute: async ({ id, label }: z.infer<typeof UpdatePlainCustomColumnSchema>) => {
    const loaded = await loadColumnOrError(id, CustomColumnType.plain);
    if (!loaded.ok) return loaded.error;
    return runCustomColumnUpdate({
      id,
      label,
      type: CustomColumnType.plain,
      entityType: loaded.column.entityType,
    });
  },
};

export const updateDateCustomColumnTool = {
  name: "update_date_custom_column",
  description:
    "Update a date (no time) custom column. " +
    "Required: id, label. Optional: displayFormat. " +
    "Type and entityType are immutable.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: UpdateDateCustomColumnSchema,
  execute: async ({ id, label, displayFormat }: z.infer<typeof UpdateDateCustomColumnSchema>) => {
    const loaded = await loadColumnOrError(id, CustomColumnType.date);
    if (!loaded.ok) return loaded.error;
    return runCustomColumnUpdate({
      id,
      label,
      type: CustomColumnType.date,
      entityType: loaded.column.entityType,
      options: displayFormat ? { displayFormat } : undefined,
    });
  },
};

export const updateDateTimeCustomColumnTool = {
  name: "update_datetime_custom_column",
  description:
    "Update a date+time custom column. " +
    "Required: id, label. Optional: displayFormat. " +
    "Type and entityType are immutable.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: UpdateDateTimeCustomColumnSchema,
  execute: async ({ id, label, displayFormat }: z.infer<typeof UpdateDateTimeCustomColumnSchema>) => {
    const loaded = await loadColumnOrError(id, CustomColumnType.dateTime);
    if (!loaded.ok) return loaded.error;
    return runCustomColumnUpdate({
      id,
      label,
      type: CustomColumnType.dateTime,
      entityType: loaded.column.entityType,
      options: displayFormat ? { displayFormat } : undefined,
    });
  },
};

export const updateDateRangeCustomColumnTool = {
  name: "update_date_range_custom_column",
  description:
    "Update a date range (no time) custom column. " +
    "Required: id, label. Optional: displayFormat. " +
    "Type and entityType are immutable.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: UpdateDateRangeCustomColumnSchema,
  execute: async ({ id, label, displayFormat }: z.infer<typeof UpdateDateRangeCustomColumnSchema>) => {
    const loaded = await loadColumnOrError(id, CustomColumnType.dateRange);
    if (!loaded.ok) return loaded.error;
    return runCustomColumnUpdate({
      id,
      label,
      type: CustomColumnType.dateRange,
      entityType: loaded.column.entityType,
      options: displayFormat ? { displayFormat } : undefined,
    });
  },
};

export const updateDateTimeRangeCustomColumnTool = {
  name: "update_datetime_range_custom_column",
  description:
    "Update a date+time range custom column. " +
    "Required: id, label. Optional: displayFormat. " +
    "Type and entityType are immutable.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: UpdateDateTimeRangeCustomColumnSchema,
  execute: async ({ id, label, displayFormat }: z.infer<typeof UpdateDateTimeRangeCustomColumnSchema>) => {
    const loaded = await loadColumnOrError(id, CustomColumnType.dateTimeRange);
    if (!loaded.ok) return loaded.error;
    return runCustomColumnUpdate({
      id,
      label,
      type: CustomColumnType.dateTimeRange,
      entityType: loaded.column.entityType,
      options: displayFormat ? { displayFormat } : undefined,
    });
  },
};

export const updateCurrencyCustomColumnTool = {
  name: "update_currency_custom_column",
  description:
    "Update a money custom column. " +
    "Required: id, label, currency. " +
    `currency ${enumHint(currencyValues)}. Type and entityType are immutable.`,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: UpdateCurrencyCustomColumnSchema,
  execute: async ({ id, label, currency }: z.infer<typeof UpdateCurrencyCustomColumnSchema>) => {
    const loaded = await loadColumnOrError(id, CustomColumnType.currency);
    if (!loaded.ok) return loaded.error;
    return runCustomColumnUpdate({
      id,
      label,
      type: CustomColumnType.currency,
      entityType: loaded.column.entityType,
      options: { currency },
    });
  },
};

export const updateSingleSelectCustomColumnTool = {
  name: "update_single_select_custom_column",
  description:
    "Update a dropdown (single-select) custom column. " +
    "Required: id, label, options[]. " +
    "options[] REPLACES the option list. Keep each existing option's `value` UUID to preserve stored records; " +
    "drop an option to delete any records using it; omit `value` to add a new option. " +
    "Call list_custom_columns first to fetch current option values.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: UpdateSingleSelectCustomColumnSchema,
  execute: async ({ id, label, options }: z.infer<typeof UpdateSingleSelectCustomColumnSchema>) => {
    const loaded = await loadColumnOrError(id, CustomColumnType.singleSelect);
    if (!loaded.ok) return loaded.error;
    const optionsWithIds = options.map((option) => ({
      ...option,
      value: option.value ?? crypto.randomUUID(),
    }));
    return runCustomColumnUpdate({
      id,
      label,
      type: CustomColumnType.singleSelect,
      entityType: loaded.column.entityType,
      options: { options: optionsWithIds },
    });
  },
};

export const updateLinkCustomColumnTool = {
  name: "update_link_custom_column",
  description:
    "Update a URL custom column. " +
    "Required: id, label, color, allowMultiple. " +
    `color ${enumHint(chipColorValues)}. Type and entityType are immutable.`,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: UpdateLinkCustomColumnSchema,
  execute: async ({ id, label, color, allowMultiple }: z.infer<typeof UpdateLinkCustomColumnSchema>) => {
    const loaded = await loadColumnOrError(id, CustomColumnType.link);
    if (!loaded.ok) return loaded.error;
    return runCustomColumnUpdate({
      id,
      label,
      type: CustomColumnType.link,
      entityType: loaded.column.entityType,
      options: { color, allowMultiple },
    });
  },
};

export const updateEmailCustomColumnTool = {
  name: "update_email_custom_column",
  description:
    "Update an email custom column. " +
    "Required: id, label, color, allowMultiple. " +
    `color ${enumHint(chipColorValues)}. Type and entityType are immutable.`,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: UpdateEmailCustomColumnSchema,
  execute: async ({ id, label, color, allowMultiple }: z.infer<typeof UpdateEmailCustomColumnSchema>) => {
    const loaded = await loadColumnOrError(id, CustomColumnType.email);
    if (!loaded.ok) return loaded.error;
    return runCustomColumnUpdate({
      id,
      label,
      type: CustomColumnType.email,
      entityType: loaded.column.entityType,
      options: { color, allowMultiple },
    });
  },
};

export const updatePhoneCustomColumnTool = {
  name: "update_phone_custom_column",
  description:
    "Update a phone-number custom column. " +
    "Required: id, label, color, allowMultiple. " +
    `color ${enumHint(chipColorValues)}. Type and entityType are immutable.`,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: UpdatePhoneCustomColumnSchema,
  execute: async ({ id, label, color, allowMultiple }: z.infer<typeof UpdatePhoneCustomColumnSchema>) => {
    const loaded = await loadColumnOrError(id, CustomColumnType.phone);
    if (!loaded.ok) return loaded.error;
    return runCustomColumnUpdate({
      id,
      label,
      type: CustomColumnType.phone,
      entityType: loaded.column.entityType,
      options: { color, allowMultiple },
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
    const result = (await getDeleteCustomColumnInteractor().invoke({ id })) as
      | { ok: true; data: string }
      | { ok: false; error: z.ZodError };
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return `Deleted custom column ${result.data}`;
  },
};

function successResponse(data: { id: string; label: string }) {
  return encodeToToon({
    id: data.id,
    label: data.label,
    message: `Custom field "${data.label}" created successfully`,
  });
}

export const createPlainCustomColumnTool = {
  name: "create_plain_custom_column",
  description:
    "Create a plain text column on an entity type. " +
    "Required: entityType, label. " +
    `entityType ${enumHint(entityTypeValues)}.`,
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  inputSchema: CreatePlainCustomColumnSchema,
  execute: async (params: z.infer<typeof CreatePlainCustomColumnSchema>) => {
    const result = await getUpsertCustomColumnInteractor().invoke({
      label: params.label,
      type: CustomColumnType.plain,
      entityType: params.entityType,
    });
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return successResponse(result.data);
  },
};

export const createDateCustomColumnTool = {
  name: "create_date_custom_column",
  description:
    "Create a date column (no time) on an entity type. " + "Required: entityType, label. Optional: displayFormat.",
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  inputSchema: CreateDateCustomColumnSchema,
  execute: async (params: z.infer<typeof CreateDateCustomColumnSchema>) => {
    const result = await getUpsertCustomColumnInteractor().invoke({
      label: params.label,
      type: CustomColumnType.date,
      entityType: params.entityType,
      options: params.displayFormat ? { displayFormat: params.displayFormat } : undefined,
    });
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return successResponse(result.data);
  },
};

export const createDateTimeCustomColumnTool = {
  name: "create_datetime_custom_column",
  description:
    "Create a date+time column on an entity type. " + "Required: entityType, label. Optional: displayFormat.",
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  inputSchema: CreateDateTimeCustomColumnSchema,
  execute: async (params: z.infer<typeof CreateDateTimeCustomColumnSchema>) => {
    const result = await getUpsertCustomColumnInteractor().invoke({
      label: params.label,
      type: CustomColumnType.dateTime,
      entityType: params.entityType,
      options: params.displayFormat ? { displayFormat: params.displayFormat } : undefined,
    });
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return successResponse(result.data);
  },
};

export const createDateRangeCustomColumnTool = {
  name: "create_date_range_custom_column",
  description:
    "Create a date range (no time) column on an entity type. " +
    "Values are stored as 'YYYY-MM-DD,YYYY-MM-DD' (start,end). " +
    "Required: entityType, label. Optional: displayFormat.",
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  inputSchema: CreateDateRangeCustomColumnSchema,
  execute: async (params: z.infer<typeof CreateDateRangeCustomColumnSchema>) => {
    const result = await getUpsertCustomColumnInteractor().invoke({
      label: params.label,
      type: CustomColumnType.dateRange,
      entityType: params.entityType,
      options: params.displayFormat ? { displayFormat: params.displayFormat } : undefined,
    });
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return successResponse(result.data);
  },
};

export const createDateTimeRangeCustomColumnTool = {
  name: "create_datetime_range_custom_column",
  description:
    "Create a date+time range column on an entity type. " +
    "Values are stored as full ISO 8601 datetimes joined by a comma (e.g. 2024-01-15T09:00:00Z,2024-01-15T17:00:00Z). " +
    "Required: entityType, label. Optional: displayFormat.",
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  inputSchema: CreateDateTimeRangeCustomColumnSchema,
  execute: async (params: z.infer<typeof CreateDateTimeRangeCustomColumnSchema>) => {
    const result = await getUpsertCustomColumnInteractor().invoke({
      label: params.label,
      type: CustomColumnType.dateTimeRange,
      entityType: params.entityType,
      options: params.displayFormat ? { displayFormat: params.displayFormat } : undefined,
    });
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return successResponse(result.data);
  },
};

export const createCurrencyCustomColumnTool = {
  name: "create_currency_custom_column",
  description:
    "Create a money column on an entity type. " +
    "Required: entityType, label, currency. " +
    `currency ${enumHint(currencyValues)}.`,
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  inputSchema: CreateCurrencyCustomColumnSchema,
  execute: async (params: z.infer<typeof CreateCurrencyCustomColumnSchema>) => {
    const result = await getUpsertCustomColumnInteractor().invoke({
      label: params.label,
      type: CustomColumnType.currency,
      entityType: params.entityType,
      options: { currency: params.currency },
    });
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return successResponse(result.data);
  },
};

export const createSingleSelectCustomColumnTool = {
  name: "create_single_select_custom_column",
  description:
    "Create a dropdown (single-select) column on an entity type. " +
    "Required: entityType, label, options[]. " +
    "Each option needs { label, color, isDefault, index }. " +
    `color ${enumHint(chipColorValues)}.`,
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  inputSchema: CreateSingleSelectCustomColumnSchema,
  execute: async (params: z.infer<typeof CreateSingleSelectCustomColumnSchema>) => {
    const optionsWithIds = params.options.map((option) => ({
      ...option,
      value: crypto.randomUUID(),
    }));

    const result = await getUpsertCustomColumnInteractor().invoke({
      label: params.label,
      type: CustomColumnType.singleSelect,
      entityType: params.entityType,
      options: { options: optionsWithIds },
    });
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return successResponse(result.data);
  },
};

export const createLinkCustomColumnTool = {
  name: "create_link_custom_column",
  description:
    "Create a URL column on an entity type. " +
    "Required: entityType, label, color, allowMultiple. " +
    `color ${enumHint(chipColorValues)}.`,
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  inputSchema: CreateLinkCustomColumnSchema,
  execute: async (params: z.infer<typeof CreateLinkCustomColumnSchema>) => {
    const result = await getUpsertCustomColumnInteractor().invoke({
      label: params.label,
      type: CustomColumnType.link,
      entityType: params.entityType,
      options: { color: params.color, allowMultiple: params.allowMultiple },
    });
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return successResponse(result.data);
  },
};

export const createEmailCustomColumnTool = {
  name: "create_email_custom_column",
  description:
    "Create an email column on an entity type. " +
    "Required: entityType, label, color, allowMultiple. " +
    `color ${enumHint(chipColorValues)}.`,
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  inputSchema: CreateEmailCustomColumnSchema,
  execute: async (params: z.infer<typeof CreateEmailCustomColumnSchema>) => {
    const result = await getUpsertCustomColumnInteractor().invoke({
      label: params.label,
      type: CustomColumnType.email,
      entityType: params.entityType,
      options: { color: params.color, allowMultiple: params.allowMultiple },
    });
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return successResponse(result.data);
  },
};

export const createPhoneCustomColumnTool = {
  name: "create_phone_custom_column",
  description:
    "Create a phone-number column on an entity type. " +
    "Required: entityType, label, color, allowMultiple. " +
    `color ${enumHint(chipColorValues)}.`,
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  inputSchema: CreatePhoneCustomColumnSchema,
  execute: async (params: z.infer<typeof CreatePhoneCustomColumnSchema>) => {
    const result = await getUpsertCustomColumnInteractor().invoke({
      label: params.label,
      type: CustomColumnType.phone,
      entityType: params.entityType,
      options: { color: params.color, allowMultiple: params.allowMultiple },
    });
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return successResponse(result.data);
  },
};
