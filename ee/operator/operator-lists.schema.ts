import { z } from "zod";

import { ConversionEventType, Status, SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";
import { AdIdentifierKindSchema, AdProviderSchema } from "@/features/acquisition/ad-provider-registry";

export const OperatorUserRowDtoSchema = z.object({
  id: z.uuid(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  status: z.enum(Status),
  isPlatformOperator: z.boolean(),
  lastActiveAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  companyId: z.uuid(),
  workspaceLabel: z.string(),
  workspaceOwnerEmail: z.string().nullable(),
  workspaceTags: z.array(z.string()),
  plan: z.enum(SubscriptionPlan).nullable(),
  subscriptionStatus: z.enum(SubscriptionStatus).nullable(),
  subscriptionQuantity: z.number().nullable(),
  subscriptionUpdatedAt: z.date().nullable(),
  adProvider: z.string().nullable(),
  adIdentifierKind: z.string().nullable(),
  creditsRemaining: z.number().nullable(),
  creditsLimit: z.number().nullable(),
  creditsBlockedReason: z.string().nullable(),
});

export type OperatorUserRowDto = z.infer<typeof OperatorUserRowDtoSchema>;

export const OperatorWorkspaceRowDtoSchema = z.object({
  id: z.uuid(),
  workspaceLabel: z.string(),
  ownerEmail: z.string().nullable(),
  ownerUserId: z.uuid().nullable(),
  userCount: z.number(),
  activeUserCount: z.number(),
  plan: z.enum(SubscriptionPlan).nullable(),
  subscriptionStatus: z.enum(SubscriptionStatus).nullable(),
  seats: z.number().nullable(),
  enterpriseCreditsPerUser: z.number().nullable(),
  creditsPerUser: z.number().nullable(),
  trialEndDate: z.date().nullable(),
  lemonSqueezyId: z.string().nullable(),
  subscriptionUpdatedAt: z.date().nullable(),
  adProvider: z.string().nullable(),
  tags: z.array(z.string()),
  createdAt: z.date(),
});

export type OperatorWorkspaceRowDto = z.infer<typeof OperatorWorkspaceRowDtoSchema>;

export const OPERATOR_AUDIT_SOURCE = { product: "product", operator: "operator" } as const;

export type OperatorAuditSource = (typeof OPERATOR_AUDIT_SOURCE)[keyof typeof OPERATOR_AUDIT_SOURCE];

export const OperatorAuditRowDtoSchema = z.object({
  id: z.string(),
  source: z.enum([OPERATOR_AUDIT_SOURCE.product, OPERATOR_AUDIT_SOURCE.operator]),
  action: z.string(),
  actorLabel: z.string().nullable(),
  actorUserId: z.string().nullable(),
  workspaceId: z.string().nullable(),
  workspaceLabel: z.string().nullable(),
  targetId: z.string().nullable(),
  reason: z.string().nullable(),
  createdAt: z.date(),
});

export type OperatorAuditRowDto = z.infer<typeof OperatorAuditRowDtoSchema>;

export const OperatorRiskSummaryDtoSchema = z.object({
  subscriptionsPastDue: z.number(),
  subscriptionsUnpaid: z.number(),
  subscriptionsExpired: z.number(),
  trialsEndingWithinSevenDays: z.number(),
  activeUsersLastSevenDays: z.number(),
  newWorkspacesLastThirtyDays: z.number(),
  newUsersLastThirtyDays: z.number(),
  attributedWorkspaces: z.number(),
  attributedPaidWorkspaces: z.number(),
});

export type OperatorRiskSummaryDto = z.infer<typeof OperatorRiskSummaryDtoSchema>;

export const AdConversionExportRowDtoSchema = z.object({
  provider: AdProviderSchema,
  identifierKind: AdIdentifierKindSchema,
  identifierValue: z.string(),
  conversionType: z.enum(ConversionEventType),
  conversionAt: z.date(),
  orderId: z.string(),
  adUserData: z.enum(["Granted", "Denied"]),
  adPersonalization: z.enum(["Granted", "Denied"]),
});

export type AdConversionExportRowDto = z.infer<typeof AdConversionExportRowDtoSchema>;

export const AdConversionExportDtoSchema = z.object({
  generatedAt: z.date(),
  rows: z.array(AdConversionExportRowDtoSchema),
  googleAdsCsv: z.string(),
  googleAdsRowCount: z.number().int().nonnegative(),
  googleAdsWithoutColumnCount: z.number().int().nonnegative(),
});

export type AdConversionExportDto = z.infer<typeof AdConversionExportDtoSchema>;
