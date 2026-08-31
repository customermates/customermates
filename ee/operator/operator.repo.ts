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

export type OperatorRefusal = "conflict" | "notFound" | "unavailable";

export type PublishOperatorUserStatusChanged = (event: OperatorUserStatusChangedEvent) => Promise<void>;

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
    publishUserUpdated: PublishOperatorUserStatusChanged,
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
}
