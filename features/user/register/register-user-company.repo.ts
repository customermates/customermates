import type { RegistrationSignupSource } from "@/features/acquisition/signup-source";

export type WorkspaceSetup = {
  name?: string | null;
  createdByAuthUserId?: string | null;
  trial?: boolean;
};

export abstract class RegisterUserCompanyRepo {
  abstract existsUnscoped(companyId: string): Promise<boolean>;
  abstract createRegisteredCompany(setup?: WorkspaceSetup): Promise<string>;
  abstract recordSignupConversion(companyId: string, occurredAt: Date): Promise<void>;
  abstract recordSignupSource(companyId: string, source: RegistrationSignupSource): Promise<void>;
}
