import { z } from "zod";

import { Status, SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";

const MAX_CREDITS = 1_000_000;
const MAX_SIGNED_CREDITS = 1_000_000;
const MAX_BIGINT = 9_223_372_036_854_775_807n;

const ReasonSchema = z.string().trim().min(8).max(500);
const OptionalReasonSchema = z
  .string()
  .trim()
  .max(500)
  .transform((value) => (value.length > 0 ? value : undefined))
  .optional();
const OperationIdSchema = z.uuid();

export const FindHostedAiOperatorCandidateSchema = z
  .object({
    email: z
      .string()
      .trim()
      .max(320)
      .transform((email) => email.toLocaleLowerCase("en-US"))
      .pipe(z.email()),
  })
  .strict();

export const GetHostedAiOperatorCompanySchema = z.object({ companyId: z.uuid() }).strict();

export const UpdateHostedAiEnterpriseAllowanceSchema = z
  .object({
    companyId: z.uuid(),
    creditsPerUser: z.number().int().min(1).max(MAX_CREDITS),
    reason: OptionalReasonSchema,
    operationId: OperationIdSchema,
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

export const UpdateHostedAiGlobalControlSchema = z
  .object({
    expectedVersion: z.number().int().min(1).max(2_147_483_646),
    hostedProviderWorkPaused: z.boolean(),
    monthlySpendCapMicrocents: z
      .string()
      .max(19)
      .regex(/^\d+$/)
      .refine((value) => BigInt(value) <= MAX_BIGINT)
      .nullable(),
    reason: ReasonSchema,
    operationId: OperationIdSchema,
  })
  .strict();

export const ListOperatorAuditEventsSchema = z
  .object({
    cursor: z.uuid().optional(),
    limit: z.number().int().min(1).max(100).default(50),
  })
  .strict();

export const OperatorUserSortSchema = z.enum(["newest", "oldest", "emailAsc", "emailDesc"]);

export const ListOperatorUsersSchema = z
  .object({
    cursor: z.uuid().optional(),
    limit: z.number().int().min(1).max(100).default(25),
    query: z
      .string()
      .trim()
      .max(200)
      .transform((query) => query.replace(/\s+/gu, " "))
      .optional(),
    status: z.enum(Status).optional(),
    subscriptionPlan: z.enum(SubscriptionPlan).optional(),
    subscriptionStatus: z.enum(SubscriptionStatus).optional(),
    isPlatformOperator: z.boolean().optional(),
    sort: OperatorUserSortSchema.default("newest"),
  })
  .strict();

export const GetOperatorUserDetailSchema = z.object({ userId: z.uuid() }).strict();

export const UpdateOperatorUserStatusSchema = z
  .object({
    userId: z.uuid(),
    expectedUpdatedAt: z.iso.datetime({ offset: true, precision: 3 }),
    status: z.enum(Status),
    reason: OptionalReasonSchema,
    operationId: OperationIdSchema,
  })
  .strict();

export const UpdateOperatorUserPlatformAccessSchema = z
  .object({
    userId: z.uuid(),
    expectedUpdatedAt: z.iso.datetime({ offset: true, precision: 3 }),
    isPlatformOperator: z.boolean(),
    reason: OptionalReasonSchema,
    operationId: OperationIdSchema,
  })
  .strict();

export const CorrectOperatorSubscriptionSnapshotSchema = z
  .object({
    userId: z.uuid(),
    expectedUpdatedAt: z.iso.datetime({ offset: true, precision: 3 }),
    plan: z.enum(SubscriptionPlan),
    status: z.enum(SubscriptionStatus),
    quantity: z.number().int().min(1).max(MAX_CREDITS).nullable(),
    reason: OptionalReasonSchema,
    operationId: OperationIdSchema,
  })
  .strict();

export const ResetOperatorUserCreditsSchema = z
  .object({
    userId: z.uuid(),
    mode: z.enum(["baseAllowance", "zeroBalance"]),
    expectedPeriodStart: z.iso.datetime({ offset: true, precision: 3 }),
    expectedPeriodEnd: z.iso.datetime({ offset: true, precision: 3 }),
    expectedBaseAllowanceCredits: z.number().int().safe().min(0),
    expectedAdjustmentCredits: z.number().int().safe(),
    expectedCommittedCredits: z.number().int().safe().min(0),
    reason: OptionalReasonSchema,
    operationId: OperationIdSchema,
  })
  .strict();

export type FindHostedAiOperatorCandidateData = z.infer<typeof FindHostedAiOperatorCandidateSchema>;
export type GetHostedAiOperatorCompanyData = z.infer<typeof GetHostedAiOperatorCompanySchema>;
export type UpdateHostedAiEnterpriseAllowanceData = z.infer<typeof UpdateHostedAiEnterpriseAllowanceSchema>;
export type CreateAgentCreditAdjustmentData = z.infer<typeof CreateAgentCreditAdjustmentSchema>;
export type UpdateHostedAiGlobalControlData = z.infer<typeof UpdateHostedAiGlobalControlSchema>;
export type ListOperatorAuditEventsData = z.input<typeof ListOperatorAuditEventsSchema>;
export type ListOperatorUsersData = z.input<typeof ListOperatorUsersSchema>;
export type ParsedListOperatorUsersData = z.output<typeof ListOperatorUsersSchema>;
export type GetOperatorUserDetailData = z.infer<typeof GetOperatorUserDetailSchema>;
export type UpdateOperatorUserStatusData = z.infer<typeof UpdateOperatorUserStatusSchema>;
export type UpdateOperatorUserPlatformAccessData = z.infer<typeof UpdateOperatorUserPlatformAccessSchema>;
export type CorrectOperatorSubscriptionSnapshotData = z.infer<typeof CorrectOperatorSubscriptionSnapshotSchema>;
export type ResetOperatorUserCreditsData = z.infer<typeof ResetOperatorUserCreditsSchema>;

export type HostedAiGlobalControlDto = {
  id: "global";
  hostedProviderWorkPaused: boolean;
  monthlySpendCapMicrocents: string | null;
  reason: string;
  version: number;
  updatedByOperatorUserId: string;
  createdAt: string;
  updatedAt: string;
};

export type HostedAiUsageTotalsDto = {
  settledCostMicrocents: string;
  reservedExposureMicrocents: string;
  totalCommittedMicrocents: string;
  chargedCredits: number;
  reservedCredits: number;
};

export type HostedAiOperatorOverviewDto = {
  generatedAt: string;
  currentUtcMonth: HostedAiUsageTotalsDto & {
    periodStart: string;
    periodEnd: string;
    companiesWithUsage: number;
  };
  fleet: {
    companies: number;
    enterpriseCompanies: number;
    users: number;
    activeUsers: number;
  };
  globalControl: HostedAiGlobalControlDto;
};

export type HostedAiSubscriptionDto = {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  enterpriseCreditsPerUser: number | null;
  agentCreditAnchorAt: string | null;
  trialEndDate: string | null;
  currentPeriodEnd: string | null;
};

export type HostedAiOperatorCompanyDto = {
  companyId: string;
  subscription: HostedAiSubscriptionDto;
  seats: { total: number; active: number };
  currentUtcMonth: HostedAiUsageTotalsDto;
};

export type OperatorUserCreditPeriodDto = {
  periodStart: string;
  periodEnd: string;
  baseAllowanceCredits: number;
  adjustmentCredits: number;
  effectiveAllowanceCredits: number;
  chargedCredits: number;
  reservedCredits: number;
  committedCredits: number;
  remainingCredits: number;
  overageCredits: number;
  blockedReason: string | null;
};

export type HostedAiOperatorCandidateDto = {
  userId: string;
  companyId: string;
  email: string;
  displayName: string;
  status: Status;
  authEmailVerified: boolean;
  company: HostedAiOperatorCompanyDto;
  creditPeriod: OperatorUserCreditPeriodDto | null;
};

export type OperatorUserListSubscriptionDto = {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  quantity: number | null;
  billingProviderManaged: boolean;
};

export type OperatorUserListItemDto = {
  userId: string;
  companyId: string;
  email: string;
  displayName: string;
  status: Status;
  isPlatformOperator: boolean;
  authEmailVerified: boolean;
  createdAt: string;
  lastActiveAt: string | null;
  role: { name: string; isSystemRole: boolean } | null;
  subscription: OperatorUserListSubscriptionDto | null;
};

export type OperatorUserPageDto = {
  users: OperatorUserListItemDto[];
  nextCursor: string | null;
  total: number;
};

export type OperatorUserSummaryDto = {
  totalUsers: number;
  totalCompanies: number;
  platformOperators: number;
  verifiedAuthUsers: number;
  byStatus: Record<Status, number>;
  byPlan: Record<SubscriptionPlan, number> & { missing: number };
  bySubscriptionStatus: Record<SubscriptionStatus, number> & {
    missing: number;
  };
};

export type OperatorUserSubscriptionDto = OperatorUserListSubscriptionDto & {
  updatedAt: string;
  enterpriseCreditsPerUser: number | null;
  agentCreditAnchorAt: string | null;
  trialEndDate: string | null;
  currentPeriodEnd: string | null;
};

export type OperatorUserDetailDto = Omit<OperatorUserListItemDto, "subscription"> & {
  updatedAt: string;
  agentCreditActivatedAt: string | null;
  isCurrentOperator: boolean;
  statusMutation: {
    allowed: boolean;
    blockedReason: "provider_managed_seat_sync_required" | null;
  };
  subscription: OperatorUserSubscriptionDto | null;
  creditPeriod: OperatorUserCreditPeriodDto | null;
};

export type ResetOperatorUserCreditsResultDto = {
  adjustment: AgentCreditAdjustmentDto;
  user: OperatorUserDetailDto;
};

export type AgentCreditAdjustmentDto = {
  id: string;
  companyId: string;
  userId: string;
  creditDelta: number;
  periodStart: string;
  periodEnd: string;
  reason: string | null;
  operationId: string;
  createdByOperatorUserId: string;
  createdAt: string;
};

export type OperatorAuditEventDto = {
  id: string;
  actorUserId: string;
  action: string;
  targetCompanyId: string | null;
  targetUserId: string | null;
  operationId: string;
  reason: string | null;
  metadata: unknown;
  createdAt: string;
};

export type OperatorAuditPageDto = {
  events: OperatorAuditEventDto[];
  nextCursor: string | null;
};

export const OPERATOR_AUDIT_ACTION = {
  overviewRead: "hosted_ai.overview.read",
  candidateRead: "hosted_ai.candidate.read",
  companyRead: "hosted_ai.company.read",
  auditRead: "hosted_ai.audit.read",
  globalControlUpdate: "hosted_ai.global_control.update",
  enterpriseAllowanceUpdate: "hosted_ai.enterprise_allowance.update",
  creditAdjustmentCreate: "hosted_ai.credit_adjustment.create",
  userListRead: "operator.users.list",
  userSummaryRead: "operator.users.summary",
  userDetailRead: "operator.users.detail",
  userStatusUpdate: "operator.user_status.update",
  userPlatformAccessUpdate: "operator.platform_access.update",
  subscriptionSnapshotCorrect: "operator.subscription_snapshot.correct",
  creditBalanceReset: "operator.credit_balance.reset",
  operatorBootstrap: "operator.bootstrap",
} as const;
