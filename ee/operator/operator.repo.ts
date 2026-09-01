import type {
  AgentCreditAdjustmentDto,
  CorrectOperatorSubscriptionSnapshotData,
  CreateAgentCreditAdjustmentData,
  DeleteOperatorWorkspaceData,
  DeleteOperatorWorkspaceResultDto,
  UpdateOperatorSubscriptionTermsData,
  GetOperatorWorkspaceStatsData,
  OperatorWorkspaceStatsDto,
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

export type OperatorRefusal = "conflict" | "notFound" | "unavailable" | "allowanceMissing";

export abstract class OperatorRepo {
  abstract getOverviewUnscoped(now?: Date): Promise<HostedAiOperatorOverviewDto | OperatorRefusal>;
  abstract updateEnterpriseAllowanceUnscoped(
    data: UpdateHostedAiEnterpriseAllowanceData,
    now?: Date,
  ): Promise<HostedAiOperatorCompanyDto | OperatorRefusal>;
  abstract createCreditAdjustmentUnscoped(
    data: CreateAgentCreditAdjustmentData,
    now?: Date,
  ): Promise<AgentCreditAdjustmentDto | OperatorRefusal>;
  abstract getUserSummaryUnscoped(): Promise<OperatorUserSummaryDto>;
  abstract getUserDetailUnscoped(userId: string, now?: Date): Promise<OperatorUserDetailDto | OperatorRefusal>;
  abstract updateUserStatusUnscoped(
    data: UpdateOperatorUserStatusData,
    now?: Date,
  ): Promise<OperatorUserDetailDto | OperatorRefusal>;
  abstract updateUserPlatformAccessUnscoped(
    data: UpdateOperatorUserPlatformAccessData,
    now?: Date,
  ): Promise<OperatorUserDetailDto | OperatorRefusal>;
  abstract correctSubscriptionSnapshotUnscoped(
    data: CorrectOperatorSubscriptionSnapshotData,
    now?: Date,
  ): Promise<OperatorUserDetailDto | OperatorRefusal>;
  abstract resetUserCreditsUnscoped(
    data: ResetOperatorUserCreditsData,
    now?: Date,
  ): Promise<ResetOperatorUserCreditsResultDto | OperatorRefusal>;
  abstract deleteWorkspaceUnscoped(
    data: DeleteOperatorWorkspaceData,
  ): Promise<DeleteOperatorWorkspaceResultDto | OperatorRefusal>;
  abstract updateSubscriptionTermsUnscoped(
    data: UpdateOperatorSubscriptionTermsData,
    now?: Date,
  ): Promise<HostedAiOperatorCompanyDto | OperatorRefusal>;
  abstract getWorkspaceStatsUnscoped(
    data: GetOperatorWorkspaceStatsData,
  ): Promise<OperatorWorkspaceStatsDto | OperatorRefusal>;
}
