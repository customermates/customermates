import type { SignupCampaign } from "./signup-campaign";
import type { TeamSize } from "@/features/onboarding-funnel/team-size";

import { isTeam } from "@/features/onboarding-funnel/team-size";

export type NewWorkspaceSignup = {
  businessEmail: boolean;
  teamSize: TeamSize | null;
  campaign: SignupCampaign | null;
  template: string | null;
  lastPage: string | null;
};

export const TEAM_SIZE_LABELS: Record<TeamSize, string> = {
  solo: "Just me",
  small: "2 to 5",
  medium: "6 to 20",
  large: "More than 20",
};

export function isCompanySignup(signup: Pick<NewWorkspaceSignup, "businessEmail" | "teamSize">): boolean {
  return signup.businessEmail && isTeam(signup.teamSize);
}

export function campaignSummary(campaign: SignupCampaign | null): string | null {
  if (!campaign) return null;
  const parts = [
    campaign.source && `source ${campaign.source}`,
    campaign.medium && `medium ${campaign.medium}`,
    campaign.campaign && `campaign ${campaign.campaign}`,
    campaign.content && `content ${campaign.content}`,
    campaign.term && `term ${campaign.term}`,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

export type OperatorSignupField = { label: string; value: string };

export function operatorSignupFields(signup: NewWorkspaceSignup): OperatorSignupField[] {
  const campaign = campaignSummary(signup.campaign);
  const fields: (OperatorSignupField | null)[] = [
    {
      label: "Workspace",
      value: isCompanySignup(signup) ? "Company: business email and a team of two or more" : "New workspace",
    },
    { label: "Email type", value: signup.businessEmail ? "Business domain" : "Free mail" },
    { label: "Team size", value: signup.teamSize ? TEAM_SIZE_LABELS[signup.teamSize] : "Not answered" },
    campaign ? { label: "Campaign", value: campaign } : null,
    signup.template ? { label: "Template", value: signup.template } : null,
    signup.lastPage ? { label: "Last page before signup", value: signup.lastPage } : null,
  ];
  return fields.filter((field): field is OperatorSignupField => field !== null);
}
