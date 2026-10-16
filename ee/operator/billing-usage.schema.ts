import { z } from "zod";

export const BILLING_USAGE_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export const BillingUsageMonthSchema = z.string().regex(BILLING_USAGE_MONTH_PATTERN);

export const GetOperatorBillingUsageSchema = z
  .object({
    month: BillingUsageMonthSchema,
    companyId: z.uuid().optional(),
  })
  .strict();

const BillingUsageCoverageSchema = z.object({
  complete: z.boolean(),
  recordedFrom: z.date().nullable(),
  inexactTimes: z.boolean(),
});

export const BillingUsageSeatSchema = z.object({
  userId: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  email: z.string().nullable(),
  roleName: z.string().nullable(),
  addedAt: z.date(),
  addedAtExact: z.boolean(),
  deactivatedAt: z.date().nullable(),
  deactivatedAtExact: z.boolean(),
});

export const BillingUsageChannelSchema = z.object({
  accountId: z.string(),
  provider: z.string().nullable(),
  identifier: z.string().nullable(),
  connectedAt: z.date(),
  connectedAtExact: z.boolean(),
  disconnectedAt: z.date().nullable(),
  disconnectedAtExact: z.boolean(),
});

export const WorkspaceBillingUsageSchema = z.object({
  companyId: z.string(),
  workspaceLabel: z.string(),
  createdAt: z.date(),
  deletedAt: z.date().nullable(),
  seats: z.object({
    count: z.number().int().min(0),
    coverage: BillingUsageCoverageSchema,
    users: z.array(BillingUsageSeatSchema).optional(),
  }),
  channels: z.object({
    peak: z.number().int().min(0),
    peakAt: z.date().nullable(),
    coverage: BillingUsageCoverageSchema,
    items: z.array(BillingUsageChannelSchema).optional(),
  }),
  current: z.object({
    activeSeats: z.number().int().min(0),
    connectedChannels: z.number().int().min(0),
  }),
});

export const OperatorBillingUsageDtoSchema = z.object({
  month: BillingUsageMonthSchema,
  from: z.date(),
  to: z.date(),
  monthComplete: z.boolean(),
  workspaces: z.array(WorkspaceBillingUsageSchema),
});

export type GetOperatorBillingUsageData = z.infer<typeof GetOperatorBillingUsageSchema>;
export type BillingUsageCoverage = z.infer<typeof BillingUsageCoverageSchema>;
export type BillingUsageSeatDto = z.infer<typeof BillingUsageSeatSchema>;
export type BillingUsageChannelDto = z.infer<typeof BillingUsageChannelSchema>;
export type WorkspaceBillingUsageDto = z.infer<typeof WorkspaceBillingUsageSchema>;
export type OperatorBillingUsageDto = z.infer<typeof OperatorBillingUsageDtoSchema>;
