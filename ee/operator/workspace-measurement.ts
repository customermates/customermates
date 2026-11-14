import type { WorkspaceAcquisitionDto, WorkspaceActivationDto } from "./billing-usage.schema";

import { activeWorkspace, earliestOf } from "./workspace-activation";
import { readSignupCampaign } from "@/features/acquisition/signup-campaign";
import { isBusinessEmail } from "@/features/acquisition/business-email";
import { isTeam, parseTeamSize } from "@/features/onboarding-funnel/team-size";

export type WorkspaceMeasurementRow = {
  signupTemplate: string | null;
  signupLastPage: string | null;
  signupCampaign: unknown;
  teamSize: string | null;
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
  agentLastCallAt: Date | null;
  funnelSetupCompletedAt: Date | null;
  funnelAgentConnectedAt: Date | null;
  funnelChannelConnectedAt: Date | null;
  funnelChannelSkippedAt: Date | null;
  funnelInviteSentAt: Date | null;
  funnelInviteAcceptedAt: Date | null;
  funnelPaidAt: Date | null;
  secondSeatAt: Date | null;
  wizardCompletedAt: Date | null;
  firstConnectedAccountAt: Date | null;
  firstModelChangeAt: Date | null;
  firstRecordCreatedAt: Date | null;
  changeInSecondWeekAt: Date | null;
};

export function workspaceAcquisition(
  row: WorkspaceMeasurementRow,
  ownerEmail: string | null = null,
): WorkspaceAcquisitionDto {
  const teamSize = parseTeamSize(row.teamSize);
  const businessEmail = ownerEmail === null ? null : isBusinessEmail(ownerEmail);
  const secondSeat = earliestOf(row.funnelInviteAcceptedAt, row.secondSeatAt) !== null;

  return {
    signupTemplate: row.signupTemplate,
    lastPageBeforeSignup: row.signupLastPage,
    campaign: readSignupCampaign(row.signupCampaign),
    teamSize,
    businessEmail,
    company: businessEmail === null ? null : businessEmail && (isTeam(teamSize) || secondSeat),
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
      channelSkippedAt: row.funnelChannelSkippedAt,
      inviteSentAt: row.funnelInviteSentAt,
      inviteAcceptedAt: earliestOf(row.funnelInviteAcceptedAt, row.secondSeatAt),
      paidAt: row.funnelPaidAt,
      firstModelChangeAt: row.firstModelChangeAt,
      firstRecordCreatedAt: row.firstRecordCreatedAt,
    },
    agentLastCallAt: row.agentLastCallAt,
    ...active,
  };
}
