import type {
  AgentCreditAdjustmentDto,
  CorrectOperatorSubscriptionSnapshotData,
  CreateAgentCreditAdjustmentData,
  HostedAiGlobalControlDto,
  HostedAiOperatorCandidateDto,
  HostedAiOperatorCompanyDto,
  HostedAiOperatorOverviewDto,
  OperatorAuditPageDto,
  OperatorUserDetailDto,
  OperatorUserPageDto,
  OperatorUserSummaryDto,
  ParsedListOperatorUsersData,
  ResetOperatorUserCreditsData,
  ResetOperatorUserCreditsResultDto,
  UpdateOperatorUserPlatformAccessData,
  UpdateOperatorUserStatusData,
  UpdateHostedAiEnterpriseAllowanceData,
  UpdateHostedAiGlobalControlData,
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
  abstract findCandidateAuditedUnscoped(email: string, now?: Date): Promise<HostedAiOperatorCandidateDto | null>;
  abstract getCompanyAuditedOrThrowUnscoped(companyId: string, now?: Date): Promise<HostedAiOperatorCompanyDto>;
  abstract updateEnterpriseAllowanceOrThrowUnscoped(
    data: UpdateHostedAiEnterpriseAllowanceData,
    now?: Date,
  ): Promise<HostedAiOperatorCompanyDto>;
  abstract createCreditAdjustmentOrThrowUnscoped(
    data: CreateAgentCreditAdjustmentData,
    now?: Date,
  ): Promise<AgentCreditAdjustmentDto>;
  abstract updateGlobalControlUnscoped(data: UpdateHostedAiGlobalControlData): Promise<HostedAiGlobalControlDto>;
  abstract listAuditEventsAuditedUnscoped(args: { cursor?: string; limit: number }): Promise<OperatorAuditPageDto>;
  abstract listUsersAuditedUnscoped(data: ParsedListOperatorUsersData): Promise<OperatorUserPageDto>;
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
