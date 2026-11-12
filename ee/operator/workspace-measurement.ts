import type { WorkspaceAcquisitionDto, WorkspaceActivationDto } from "./billing-usage.schema";

import { activeWorkspace, earliestOf } from "./workspace-activation";

export type WorkspaceMeasurementRow = {
  signupTemplate: string | null;
  signupLastPage: string | null;
  discoveryChoice: string | null;
  discoveryDetail: string | null;
  discoveryAnsweredAt: Date | null;
  signupSource: {
    job: string | null;
    landingPath: string;
    referrerHost: string | null;
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
    marketingConsentedAt: Date | null;
    capturedAt: Date;
  } | null;
  agentFirstCallAt: Date | null;
  funnelSetupCompletedAt: Date | null;
  funnelAgentConnectedAt: Date | null;
  funnelChannelConnectedAt: Date | null;
  wizardCompletedAt: Date | null;
  firstConnectedAccountAt: Date | null;
  firstModelChangeAt: Date | null;
  firstRecordCreatedAt: Date | null;
  changeInSecondWeekAt: Date | null;
};

export function workspaceAcquisition(row: WorkspaceMeasurementRow): WorkspaceAcquisitionDto {
  return {
    signupTemplate: row.signupTemplate,
    lastPageBeforeSignup: row.signupLastPage,
    discovery: row.discoveryAnsweredAt
      ? { choice: row.discoveryChoice, detail: row.discoveryDetail, answeredAt: row.discoveryAnsweredAt }
      : null,
    consentedSource: row.signupSource,
  };
}

export function workspaceActivation(args: {
  row: WorkspaceMeasurementRow;
  createdAt: Date;
  now: Date;
}): WorkspaceActivationDto {
  const { row, createdAt, now } = args;
  const agentFirstCallAt = earliestOf(row.agentFirstCallAt, row.funnelAgentConnectedAt);
  const firstChannelConnectedAt = earliestOf(row.funnelChannelConnectedAt, row.firstConnectedAccountAt);
  const active = activeWorkspace(
    {
      createdAt,
      setupCompletedAt: earliestOf(row.funnelSetupCompletedAt, row.wizardCompletedAt),
      agentConnectedAt: agentFirstCallAt,
      channelConnectedAt: firstChannelConnectedAt,
      changeInSecondWeekAt: row.changeInSecondWeekAt,
    },
    now,
  );

  return {
    firstValue: {
      setupCompletedAt: row.funnelSetupCompletedAt,
      wizardCompletedAt: row.wizardCompletedAt,
      agentFirstCallAt,
      firstChannelConnectedAt,
      firstModelChangeAt: row.firstModelChangeAt,
      firstRecordCreatedAt: row.firstRecordCreatedAt,
    },
    ...active,
  };
}
