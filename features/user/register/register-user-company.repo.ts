import type { RegistrationSignupSource } from "@/features/acquisition/signup-source";
import type { SignupCampaign } from "@/features/acquisition/signup-campaign";
import type { TeamSize } from "@/features/onboarding-funnel/team-size";

export type WorkspaceSetup = {
  name?: string | null;
  createdByAuthUserId?: string | null;
  trial?: boolean;
  signupTemplate?: string | null;
  signupLastPage?: string | null;
  signupCampaign?: SignupCampaign | null;
  teamSize?: TeamSize | null;
};

export abstract class RegisterUserCompanyRepo {
  abstract existsUnscoped(companyId: string): Promise<boolean>;
  abstract createRegisteredCompany(setup?: WorkspaceSetup): Promise<string>;
  abstract recordSignupConversion(companyId: string, occurredAt: Date): Promise<void>;
  abstract recordSignupSource(companyId: string, source: RegistrationSignupSource): Promise<void>;
}
