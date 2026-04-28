import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";
import { CustomColumnType, EntityType, Currency } from "@/generated/prisma";

import { CHIP_COLORS } from "@/constants/chip-colors";
import { DATE_DISPLAY_FORMATS } from "@/constants/date-format";

const OptionSchema = z.object({
  value: z.string(),
  label: z.string(),
  color: z.enum(CHIP_COLORS),
  isDefault: z.boolean(),
  index: z.number(),
});
export type CustomColumnOption = Data<typeof OptionSchema>;

const BaseSchema = z.object({
  id: z.uuid(),
  label: z.string(),
  entityType: z.enum(EntityType),
});

const PlainSchema = BaseSchema.extend({
  type: z.literal(CustomColumnType.plain),
});

export const DateSchema = BaseSchema.extend({
  type: z.literal(CustomColumnType.date),
  options: z
    .object({
      displayFormat: z.enum(DATE_DISPLAY_FORMATS),
    })
    .nullable()
    .optional(),
});

export const DateTimeSchema = BaseSchema.extend({
  type: z.literal(CustomColumnType.dateTime),
  options: z
    .object({
      displayFormat: z.enum(DATE_DISPLAY_FORMATS),
    })
    .nullable()
    .optional(),
});

export const DateRangeSchema = BaseSchema.extend({
  type: z.literal(CustomColumnType.dateRange),
  options: z
    .object({
      displayFormat: z.enum(DATE_DISPLAY_FORMATS),
    })
    .nullable()
    .optional(),
});

export const DateTimeRangeSchema = BaseSchema.extend({
  type: z.literal(CustomColumnType.dateTimeRange),
  options: z
    .object({
      displayFormat: z.enum(DATE_DISPLAY_FORMATS),
    })
    .nullable()
    .optional(),
});

export const LinkSchema = BaseSchema.extend({
  type: z.literal(CustomColumnType.link),
  options: z.object({
    color: z.enum(CHIP_COLORS),
    allowMultiple: z.boolean(),
  }),
});

export const CurrencySchema = BaseSchema.extend({
  type: z.literal(CustomColumnType.currency),
  options: z.object({
    currency: z.enum(Currency),
  }),
});

export const SingleSelectSchema = BaseSchema.extend({
  type: z.literal(CustomColumnType.singleSelect),
  options: z.object({
    options: z.array(OptionSchema),
  }),
});

export const EmailSchema = BaseSchema.extend({
  type: z.literal(CustomColumnType.email),
  options: z.object({
    color: z.enum(CHIP_COLORS),
    allowMultiple: z.boolean(),
  }),
});

export const PhoneSchema = BaseSchema.extend({
  type: z.literal(CustomColumnType.phone),
  options: z.object({
    color: z.enum(CHIP_COLORS),
    allowMultiple: z.boolean(),
  }),
});

export const CustomColumnDtoSchema = z.discriminatedUnion("type", [
  PlainSchema.meta({ title: "Plain" }),
  DateSchema.meta({ title: "Date" }),
  DateTimeSchema.meta({ title: "DateTime" }),
  DateRangeSchema.meta({ title: "DateRange" }),
  DateTimeRangeSchema.meta({ title: "DateTimeRange" }),
  LinkSchema.meta({ title: "Link" }),
  CurrencySchema.meta({ title: "Currency" }),
  SingleSelectSchema.meta({ title: "SingleSelect" }),
  EmailSchema.meta({ title: "Email" }),
  PhoneSchema.meta({ title: "Phone" }),
]);

export type CustomColumnDto = Data<typeof CustomColumnDtoSchema>;
