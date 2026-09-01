import { z } from "zod";

import { Status, SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";

const MAX_CREDITS = 1_000_000;
const MAX_SIGNED_CREDITS = 1_000_000;

const OptionalReasonSchema = z
  .string()
  .trim()
  .max(500)
  .transform((value) => (value.length > 0 ? value : undefined))
  .optional();
const OperationIdSchema = z.uuid();

export const UpdateHostedAiEnterpriseAllowanceSchema = z
  .object({
    companyId: z.uuid(),
    creditsPerUser: z.number().int().min(1).max(MAX_CREDITS),
    reason: OptionalReasonSchema,
  })
  .strict();

export const CreateAgentCreditAdjustmentSchema = z
  .object({
    companyId: z.uuid(),
    userId: z.uuid(),
    creditDelta: z
      .number()
      .int()
      .min(-MAX_SIGNED_CREDITS)
      .max(MAX_SIGNED_CREDITS)
      .refine((value) => value !== 0),
    periodStart: z.iso.datetime({ offset: true, precision: 3 }),
    periodEnd: z.iso.datetime({ offset: true, precision: 3 }),
    reason: OptionalReasonSchema,
    operationId: OperationIdSchema,
  })
  .strict()
  .refine((value) => new Date(value.periodStart).getTime() < new Date(value.periodEnd).getTime(), {
    path: ["periodEnd"],
    message: "The adjustment period must end after it starts.",
  });

export const GetOperatorUserDetailSchema = z.object({ userId: z.uuid() }).strict();

export const UpdateOperatorUserStatusSchema = z
  .object({
    userId: z.uuid(),
    status: z.enum(Status),
    reason: OptionalReasonSchema,
  })
  .strict();

export const UpdateOperatorUserPlatformAccessSchema = z
  .object({
    userId: z.uuid(),
    isPlatformOperator: z.boolean(),
    reason: OptionalReasonSchema,
  })
  .strict();

export const CorrectOperatorSubscriptionSnapshotSchema = z
  .object({
    userId: z.uuid(),
    plan: z.enum(SubscriptionPlan),
    status: z.enum(SubscriptionStatus),
    quantity: z.number().int().min(1).max(MAX_CREDITS).nullable(),
    reason: OptionalReasonSchema,
  })
  .strict();

export const ResetOperatorUserCreditsSchema = z
  .object({
    userId: z.uuid(),
    mode: z.enum(["baseAllowance", "zeroBalance"]),
    reason: OptionalReasonSchema,
    operationId: OperationIdSchema,
  })
  .strict();

export const UpdateOperatorSubscriptionTermsSchema = z
  .object({
    companyId: z.uuid(),
    trialEndDate: z.iso.datetime({ offset: true, precision: 3 }).nullable(),
    lemonSqueezyId: z.string().trim().min(1).max(200).nullable(),
    reason: OptionalReasonSchema,
  })
  .strict();

export const GetOperatorWorkspaceStatsSchema = z.object({ companyId: z.uuid() }).strict();

export const DeleteOperatorWorkspaceSchema = z
  .object({
    companyId: z.uuid(),
    confirmWorkspaceLabel: z.string().trim().min(1).max(200),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

export type UpdateHostedAiEnterpriseAllowanceData = z.infer<typeof UpdateHostedAiEnterpriseAllowanceSchema>;
export type CreateAgentCreditAdjustmentData = z.infer<typeof CreateAgentCreditAdjustmentSchema>;
export type GetOperatorUserDetailData = z.infer<typeof GetOperatorUserDetailSchema>;
export type UpdateOperatorUserStatusData = z.infer<typeof UpdateOperatorUserStatusSchema>;
export type UpdateOperatorUserPlatformAccessData = z.infer<typeof UpdateOperatorUserPlatformAccessSchema>;
export type CorrectOperatorSubscriptionSnapshotData = z.infer<typeof CorrectOperatorSubscriptionSnapshotSchema>;
export type ResetOperatorUserCreditsData = z.infer<typeof ResetOperatorUserCreditsSchema>;
export type DeleteOperatorWorkspaceData = z.infer<typeof DeleteOperatorWorkspaceSchema>;
export type UpdateOperatorSubscriptionTermsData = z.infer<typeof UpdateOperatorSubscriptionTermsSchema>;
export type GetOperatorWorkspaceStatsData = z.infer<typeof GetOperatorWorkspaceStatsSchema>;

export const OperatorWorkspaceStatsDtoSchema = z.object({
  companyId: z.uuid(),
  contacts: z.number(),
  organizations: z.number(),
  deals: z.number(),
  services: z.number(),
  tasks: z.number(),
  messagingThreads: z.number(),
  messagingMessages: z.number(),
  agentConversations: z.number(),
  connectedAccounts: z.number(),
  lastActiveAt: z.date().nullable(),
  lastActivityAt: z.date().nullable(),
  channelMonths: z.array(
    z.object({
      month: z.string(),
      peakConcurrent: z.number(),
      approximate: z.boolean(),
      channels: z.array(z.object({ provider: z.string(), identifier: z.string() })),
    }),
  ),
});

export type OperatorWorkspaceStatsDto = z.infer<typeof OperatorWorkspaceStatsDtoSchema>;

export const DeleteOperatorWorkspaceResultDtoSchema = z.object({
  companyId: z.uuid(),
  workspaceLabel: z.string(),
  deletedMemberCount: z.number(),
  deletedAuthIdentityCount: z.number(),
});

export type DeleteOperatorWorkspaceResultDto = z.infer<typeof DeleteOperatorWorkspaceResultDtoSchema>;

export const HostedAiUsageTotalsDtoSchema = z.object({
  settledCostMicrocents: z.string(),
  reservedExposureMicrocents: z.string(),
  totalCommittedMicrocents: z.string(),
  chargedCredits: z.number(),
  reservedCredits: z.number(),
});

export type HostedAiUsageTotalsDto = z.infer<typeof HostedAiUsageTotalsDtoSchema>;

export const HostedAiOperatorOverviewDtoSchema = z.object({
  generatedAt: z.date(),
  currentUtcMonth: HostedAiUsageTotalsDtoSchema.extend({
    periodStart: z.date(),
    periodEnd: z.date(),
    companiesWithUsage: z.number(),
  }),
  fleet: z.object({
    companies: z.number(),
    enterpriseCompanies: z.number(),
    users: z.number(),
    activeUsers: z.number(),
  }),
  monthlySpendCapMicrocents: z.string().nullable(),
});

export type HostedAiOperatorOverviewDto = z.infer<typeof HostedAiOperatorOverviewDtoSchema>;

export const HostedAiSubscriptionDtoSchema = z.object({
  plan: z.enum(SubscriptionPlan),
  status: z.enum(SubscriptionStatus),
  enterpriseCreditsPerUser: z.number().nullable(),
  agentCreditAnchorAt: z.date().nullable(),
  trialEndDate: z.date().nullable(),
  currentPeriodEnd: z.date().nullable(),
});

export type HostedAiSubscriptionDto = z.infer<typeof HostedAiSubscriptionDtoSchema>;

export const HostedAiOperatorCompanyDtoSchema = z.object({
  companyId: z.uuid(),
  subscription: HostedAiSubscriptionDtoSchema,
  seats: z.object({ total: z.number(), active: z.number() }),
  currentUtcMonth: HostedAiUsageTotalsDtoSchema,
});

export type HostedAiOperatorCompanyDto = z.infer<typeof HostedAiOperatorCompanyDtoSchema>;

export const OperatorUserCreditPeriodDtoSchema = z.object({
  periodStart: z.date(),
  periodEnd: z.date(),
  baseAllowanceCredits: z.number(),
  adjustmentCredits: z.number(),
  effectiveAllowanceCredits: z.number(),
  chargedCredits: z.number(),
  reservedCredits: z.number(),
  committedCredits: z.number(),
  remainingCredits: z.number(),
  overageCredits: z.number(),
  blockedReason: z.string().nullable(),
});

export type OperatorUserCreditPeriodDto = z.infer<typeof OperatorUserCreditPeriodDtoSchema>;

export const OperatorUserSummaryDtoSchema = z.object({
  totalUsers: z.number(),
  totalCompanies: z.number(),
  platformOperators: z.number(),
  verifiedAuthUsers: z.number(),
  byStatus: z.object({
    active: z.number(),
    inactive: z.number(),
    pendingAuthorization: z.number(),
  }),
  byPlan: z.object({
    starter: z.number(),
    pro: z.number(),
    business: z.number(),
    enterprise: z.number(),
    missing: z.number(),
  }),
  bySubscriptionStatus: z.object({
    trial: z.number(),
    active: z.number(),
    cancelled: z.number(),
    expired: z.number(),
    pastDue: z.number(),
    unPaid: z.number(),
    missing: z.number(),
  }),
});

export type OperatorUserSummaryDto = z.infer<typeof OperatorUserSummaryDtoSchema>;

export const OperatorUserSubscriptionDtoSchema = z.object({
  plan: z.enum(SubscriptionPlan),
  status: z.enum(SubscriptionStatus),
  quantity: z.number().nullable(),
  billingProviderManaged: z.boolean(),
  updatedAt: z.date(),
  enterpriseCreditsPerUser: z.number().nullable(),
  agentCreditAnchorAt: z.date().nullable(),
  trialEndDate: z.date().nullable(),
  currentPeriodEnd: z.date().nullable(),
});

export type OperatorUserSubscriptionDto = z.infer<typeof OperatorUserSubscriptionDtoSchema>;

export const OperatorUserDetailDtoSchema = z.object({
  userId: z.uuid(),
  companyId: z.uuid(),
  email: z.string(),
  displayName: z.string(),
  status: z.enum(Status),
  isPlatformOperator: z.boolean(),
  authEmailVerified: z.boolean(),
  createdAt: z.date(),
  lastActiveAt: z.date().nullable(),
  role: z.object({ name: z.string(), isSystemRole: z.boolean() }).nullable(),
  updatedAt: z.date(),
  agentCreditActivatedAt: z.date().nullable(),
  isCurrentOperator: z.boolean(),
  statusMutation: z.object({
    allowed: z.boolean(),
    blockedReason: z.literal("provider_managed_seat_sync_required").nullable(),
  }),
  subscription: OperatorUserSubscriptionDtoSchema.nullable(),
  creditPeriod: OperatorUserCreditPeriodDtoSchema.nullable(),
});

export type OperatorUserDetailDto = z.infer<typeof OperatorUserDetailDtoSchema>;

export const AgentCreditAdjustmentDtoSchema = z.object({
  id: z.uuid(),
  companyId: z.uuid(),
  userId: z.uuid(),
  creditDelta: z.number(),
  periodStart: z.date(),
  periodEnd: z.date(),
  reason: z.string().nullable(),
  operationId: z.uuid(),
  createdByOperatorUserId: z.uuid().nullable(),
  createdAt: z.date(),
});

export type AgentCreditAdjustmentDto = z.infer<typeof AgentCreditAdjustmentDtoSchema>;

export const ResetOperatorUserCreditsResultDtoSchema = z.object({
  adjustment: AgentCreditAdjustmentDtoSchema,
  user: OperatorUserDetailDtoSchema,
});

export type ResetOperatorUserCreditsResultDto = z.infer<typeof ResetOperatorUserCreditsResultDtoSchema>;

export const OPERATOR_AUDIT_ACTION = {
  overviewRead: "hosted_ai.overview.read",
  candidateRead: "hosted_ai.candidate.read",
  companyRead: "hosted_ai.company.read",
  auditRead: "hosted_ai.audit.read",
  enterpriseAllowanceUpdate: "hosted_ai.enterprise_allowance.update",
  creditAdjustmentCreate: "hosted_ai.credit_adjustment.create",
  userListRead: "operator.users.list",
  userSummaryRead: "operator.users.summary",
  userDetailRead: "operator.users.detail",
  userStatusUpdate: "operator.user_status.update",
  userPlatformAccessUpdate: "operator.platform_access.update",
  subscriptionSnapshotCorrect: "operator.subscription_snapshot.correct",
  creditBalanceReset: "operator.credit_balance.reset",
  workspaceDelete: "operator.workspace.delete",
  subscriptionTermsUpdate: "operator.subscription_terms.update",
} as const;
