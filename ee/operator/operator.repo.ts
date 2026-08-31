import type {
  AgentCreditAdjustmentDto,
  CorrectOperatorSubscriptionSnapshotData,
  CreateAgentCreditAdjustmentData,
  HostedAiOperatorCompanyDto,
  HostedAiOperatorOverviewDto,
  OperatorUserDetailDto,
  OperatorUserSummaryDto,
  ResetOperatorUserCreditsData,
  ResetOperatorUserCreditsResultDto,
  UpdateOperatorUserPlatformAccessData,
  UpdateOperatorUserStatusData,
  UpdateHostedAiEnterpriseAllowanceData,
} from "./operator.schema";

import type { CountryCode, Status } from "@/generated/prisma";

export type OperatorUserStatusChangedEvent = {
  companyId: string;
  userId: string;
  firstName: string;
  lastName: string;
  country: CountryCode;
  status: Status;
  avatarUrl: string | null;
  roleId: string | null;
};

export type PublishOperatorUserStatusChanged = (event: OperatorUserStatusChangedEvent) => Promise<void>;

export abstract class OperatorRepo {
  abstract getOverviewAuditedUnscoped(now?: Date): Promise<HostedAiOperatorOverviewDto>;
  abstract updateEnterpriseAllowanceOrThrowUnscoped(
    data: UpdateHostedAiEnterpriseAllowanceData,
    now?: Date,
  ): Promise<HostedAiOperatorCompanyDto>;
  abstract createCreditAdjustmentOrThrowUnscoped(
    data: CreateAgentCreditAdjustmentData,
    now?: Date,
  ): Promise<AgentCreditAdjustmentDto>;
  abstract getUserSummaryAuditedUnscoped(): Promise<OperatorUserSummaryDto>;
  abstract getUserDetailAuditedOrThrowUnscoped(userId: string, now?: Date): Promise<OperatorUserDetailDto>;
  abstract updateUserStatusOrThrowUnscoped(
    data: UpdateOperatorUserStatusData,
    publishUserUpdated: PublishOperatorUserStatusChanged,
    now?: Date,
  ): Promise<OperatorUserDetailDto>;
  abstract updateUserPlatformAccessOrThrowUnscoped(
    data: UpdateOperatorUserPlatformAccessData,
    now?: Date,
  ): Promise<OperatorUserDetailDto>;
  abstract correctSubscriptionSnapshotOrThrowUnscoped(
    data: CorrectOperatorSubscriptionSnapshotData,
    now?: Date,
  ): Promise<OperatorUserDetailDto>;
  abstract resetUserCreditsOrThrowUnscoped(
    data: ResetOperatorUserCreditsData,
    now?: Date,
  ): Promise<ResetOperatorUserCreditsResultDto>;
}
