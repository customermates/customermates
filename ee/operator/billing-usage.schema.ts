import { z } from "zod";

import { SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";

export const BILLING_USAGE_MONTH_PATTERN = /^20\d{2}-(0[1-9]|1[0-2])$/;

export const BillingUsageMonthSchema = z.string().regex(BILLING_USAGE_MONTH_PATTERN);

export const GetOperatorBillingUsageSchema = z
  .object({
    month: BillingUsageMonthSchema,
    companyId: z.uuid().optional(),
  })
  .strict();
export type GetOperatorBillingUsageData = z.infer<typeof GetOperatorBillingUsageSchema>;

const BillingUsageCoverageDtoSchema = z.object({
  complete: z.boolean(),
  recordedFrom: z.date().nullable(),
  inexactTimes: z.boolean(),
});
export type BillingUsageCoverageDto = z.infer<typeof BillingUsageCoverageDtoSchema>;

export const BillingUsageSeatDtoSchema = z.object({
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
export type BillingUsageSeatDto = z.infer<typeof BillingUsageSeatDtoSchema>;

export const BillingUsageChannelDtoSchema = z.object({
  accountId: z.string(),
  provider: z.string().nullable(),
  identifier: z.string().nullable(),
  connectedAt: z.date(),
  connectedAtExact: z.boolean(),
  disconnectedAt: z.date().nullable(),
  disconnectedAtExact: z.boolean(),
});
export type BillingUsageChannelDto = z.infer<typeof BillingUsageChannelDtoSchema>;

export const BILLING_SOURCES = ["lemonSqueezy", "manual"] as const;
export type BillingSource = (typeof BILLING_SOURCES)[number];

export const WorkspaceSubscriptionDtoSchema = z.object({
  plan: z.enum(SubscriptionPlan),
  status: z.enum(SubscriptionStatus),
  billing: z.enum(BILLING_SOURCES),
  quantity: z.number().int().nullable(),
  trialEndDate: z.date().nullable(),
  currentPeriodEnd: z.date().nullable(),
  enterpriseAgentCreditsPerUser: z.number().int().nullable(),
});
export type WorkspaceSubscriptionDto = z.infer<typeof WorkspaceSubscriptionDtoSchema>;

export const WorkspaceBillingUsageDtoSchema = z.object({
  companyId: z.string(),
  workspaceLabel: z.string(),
  createdAt: z.date(),
  deletedAt: z.date().nullable(),
  seats: z.object({
    count: z.number().int().min(0),
    coverage: BillingUsageCoverageDtoSchema,
    users: z.array(BillingUsageSeatDtoSchema).optional(),
  }),
  channels: z.object({
    peak: z.number().int().min(0),
    peakAt: z.date().nullable(),
    coverage: BillingUsageCoverageDtoSchema,
    items: z.array(BillingUsageChannelDtoSchema).optional(),
  }),
  current: z.object({
    activeSeats: z.number().int().min(0),
    connectedChannels: z.number().int().min(0),
  }),
  subscription: WorkspaceSubscriptionDtoSchema.nullable(),
});
export type WorkspaceBillingUsageDto = z.infer<typeof WorkspaceBillingUsageDtoSchema>;

export const OperatorBillingUsageDtoSchema = z.object({
  month: BillingUsageMonthSchema,
  from: z.date(),
  to: z.date(),
  monthComplete: z.boolean(),
  recordingStartedAt: z.date().nullable(),
  subscriptions: z.object({
    workspaces: z.number().int().min(0),
    paying: z.number().int().min(0),
    groups: z.array(
      z.object({
        billing: z.enum(BILLING_SOURCES),
        plan: z.enum(SubscriptionPlan),
        status: z.enum(SubscriptionStatus),
        workspaces: z.number().int().min(0),
        activeSeats: z.number().int().min(0),
      }),
    ),
  }),
  workspaces: z.array(WorkspaceBillingUsageDtoSchema),
});
export type OperatorBillingUsageDto = z.infer<typeof OperatorBillingUsageDtoSchema>;
