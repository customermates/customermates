import { z } from "zod";

import { CustomColumnType, EntityType, Currency } from "@/generated/prisma";

import { encodeToToon } from "./utils";

import { di } from "@/core/dependency-injection/container";
import { UpsertCustomColumnInteractor } from "@/features/custom-column/upsert-custom-column.interactor";
import { CHIP_COLORS } from "@/constants/chip-colors";
import { DATE_DISPLAY_FORMATS } from "@/constants/date-format";

const EntityTypeSchema = z.enum(EntityType).describe("Entity type to add the custom field to");

const AddPlainCustomColumnSchema = z.object({
  entityType: EntityTypeSchema,
  label: z.string().min(1).describe("Display label for the field"),
});

const AddDateCustomColumnSchema = z.object({
  entityType: EntityTypeSchema,
  label: z.string().min(1).describe("Display label for the field"),
  displayFormat: z.enum(DATE_DISPLAY_FORMATS).optional().describe("Date display format"),
});

const AddDateTimeCustomColumnSchema = z.object({
  entityType: EntityTypeSchema,
  label: z.string().min(1).describe("Display label for the field"),
  displayFormat: z.enum(DATE_DISPLAY_FORMATS).optional().describe("Date display format"),
});

const AddCurrencyCustomColumnSchema = z.object({
  entityType: EntityTypeSchema,
  label: z.string().min(1).describe("Display label for the field"),
  currency: z.enum(Currency).describe("Currency code (EUR, USD, GBP, etc)"),
});

const AddSingleSelectCustomColumnSchema = z.object({
  entityType: EntityTypeSchema,
  label: z.string().min(1).describe("Display label for the field"),
  options: z
    .array(
      z.object({
        label: z.string().min(1).describe("Display label"),
        color: z.enum(CHIP_COLORS).describe("Chip color"),
        isDefault: z.boolean().describe("Is default option"),
        index: z.number().min(0).describe("Display order"),
      }),
    )
    .min(1)
    .describe("Dropdown options"),
});

const AddLinkCustomColumnSchema = z.object({
  entityType: EntityTypeSchema,
  label: z.string().min(1).describe("Display label for the field"),
  color: z.enum(CHIP_COLORS).describe("Chip color"),
  allowMultiple: z.boolean().describe("Allow multiple links"),
});

const AddEmailCustomColumnSchema = z.object({
  entityType: EntityTypeSchema,
  label: z.string().min(1).describe("Display label for the field"),
  color: z.enum(CHIP_COLORS).describe("Chip color"),
  allowMultiple: z.boolean().describe("Allow multiple emails"),
});

const AddPhoneCustomColumnSchema = z.object({
  entityType: EntityTypeSchema,
  label: z.string().min(1).describe("Display label for the field"),
  color: z.enum(CHIP_COLORS).describe("Chip color"),
  allowMultiple: z.boolean().describe("Allow multiple phone numbers"),
});

export const addPlainCustomColumnTool = {
  name: "add_plain_custom_column",
  description: "Add a plain text custom field to an entity (contact, organization, deal, service, task).",
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  inputSchema: AddPlainCustomColumnSchema,
  execute: async (params: z.infer<typeof AddPlainCustomColumnSchema>) => {
    const result = await di.get(UpsertCustomColumnInteractor).invoke({
      label: params.label,
      type: CustomColumnType.plain,
      entityType: params.entityType,
    });
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return encodeToToon({
      id: result.data.id,
      label: result.data.label,
      message: `Custom field "${result.data.label}" created successfully`,
    });
  },
};

export const addDateCustomColumnTool = {
  name: "add_date_custom_column",
  description: "Add a date custom field to an entity.",
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  inputSchema: AddDateCustomColumnSchema,
  execute: async (params: z.infer<typeof AddDateCustomColumnSchema>) => {
    const result = await di.get(UpsertCustomColumnInteractor).invoke({
      label: params.label,
      type: CustomColumnType.date,
      entityType: params.entityType,
      options: params.displayFormat ? { displayFormat: params.displayFormat } : undefined,
    });
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return encodeToToon({
      id: result.data.id,
      label: result.data.label,
      message: `Custom field "${result.data.label}" created successfully`,
    });
  },
};

export const addDateTimeCustomColumnTool = {
  name: "add_datetime_custom_column",
  description: "Add a date and time custom field to an entity.",
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  inputSchema: AddDateTimeCustomColumnSchema,
  execute: async (params: z.infer<typeof AddDateTimeCustomColumnSchema>) => {
    const result = await di.get(UpsertCustomColumnInteractor).invoke({
      label: params.label,
      type: CustomColumnType.dateTime,
      entityType: params.entityType,
      options: params.displayFormat ? { displayFormat: params.displayFormat } : undefined,
    });
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return encodeToToon({
      id: result.data.id,
      label: result.data.label,
      message: `Custom field "${result.data.label}" created successfully`,
    });
  },
};

export const addCurrencyCustomColumnTool = {
  name: "add_currency_custom_column",
  description: "Add a currency/money custom field to an entity.",
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  inputSchema: AddCurrencyCustomColumnSchema,
  execute: async (params: z.infer<typeof AddCurrencyCustomColumnSchema>) => {
    const result = await di.get(UpsertCustomColumnInteractor).invoke({
      label: params.label,
      type: CustomColumnType.currency,
      entityType: params.entityType,
      options: { currency: params.currency },
    });
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return encodeToToon({
      id: result.data.id,
      label: result.data.label,
      message: `Custom field "${result.data.label}" created successfully`,
    });
  },
};

export const addSingleSelectCustomColumnTool = {
  name: "add_single_select_custom_column",
  description: "Add a dropdown/single select custom field to an entity.",
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  inputSchema: AddSingleSelectCustomColumnSchema,
  execute: async (params: z.infer<typeof AddSingleSelectCustomColumnSchema>) => {
    const optionsWithIds = params.options.map((option) => ({
      ...option,
      value: crypto.randomUUID(),
    }));

    const result = await di.get(UpsertCustomColumnInteractor).invoke({
      label: params.label,
      type: CustomColumnType.singleSelect,
      entityType: params.entityType,
      options: { options: optionsWithIds },
    });
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return encodeToToon({
      id: result.data.id,
      label: result.data.label,
      message: `Custom field "${result.data.label}" created successfully`,
    });
  },
};

export const addLinkCustomColumnTool = {
  name: "add_link_custom_column",
  description: "Add a URL/link custom field to an entity.",
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  inputSchema: AddLinkCustomColumnSchema,
  execute: async (params: z.infer<typeof AddLinkCustomColumnSchema>) => {
    const result = await di.get(UpsertCustomColumnInteractor).invoke({
      label: params.label,
      type: CustomColumnType.link,
      entityType: params.entityType,
      options: { color: params.color, allowMultiple: params.allowMultiple },
    });
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return encodeToToon({
      id: result.data.id,
      label: result.data.label,
      message: `Custom field "${result.data.label}" created successfully`,
    });
  },
};

export const addEmailCustomColumnTool = {
  name: "add_email_custom_column",
  description: "Add an email custom field to an entity.",
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  inputSchema: AddEmailCustomColumnSchema,
  execute: async (params: z.infer<typeof AddEmailCustomColumnSchema>) => {
    const result = await di.get(UpsertCustomColumnInteractor).invoke({
      label: params.label,
      type: CustomColumnType.email,
      entityType: params.entityType,
      options: { color: params.color, allowMultiple: params.allowMultiple },
    });
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return encodeToToon({
      id: result.data.id,
      label: result.data.label,
      message: `Custom field "${result.data.label}" created successfully`,
    });
  },
};

export const addPhoneCustomColumnTool = {
  name: "add_phone_custom_column",
  description: "Add a phone number custom field to an entity.",
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  inputSchema: AddPhoneCustomColumnSchema,
  execute: async (params: z.infer<typeof AddPhoneCustomColumnSchema>) => {
    const result = await di.get(UpsertCustomColumnInteractor).invoke({
      label: params.label,
      type: CustomColumnType.phone,
      entityType: params.entityType,
      options: { color: params.color, allowMultiple: params.allowMultiple },
    });
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return encodeToToon({
      id: result.data.id,
      label: result.data.label,
      message: `Custom field "${result.data.label}" created successfully`,
    });
  },
};
